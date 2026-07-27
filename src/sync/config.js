// src/sync/config.js — TASK-019 (Azure DevOps bridge)
//
// Pure, fs-free config loader/validator for the `ado` block in
// `.task-memory.json`. Pure so it's unit-testable without touching disk —
// the CLI (scripts/ado-sync.mjs) is the only thing that reads the file and
// hands the parsed object to loadAdoConfig().
//
// Missing `ado` block entirely means the feature is off: the CLI treats
// `notConfigured: true` as a clean "ADO sync not configured" no-op exit 0.
// This is the rollback story for the whole feature — it's additive/opt-in
// purely via the presence of this config block.

// Default state_map: local column id -> raw ADO state string. This is only
// used when the config's `ado.state_map` is entirely absent — an explicit
// (possibly partial) state_map always wins over these defaults.
export const DEFAULT_STATE_MAP = {
  todo: 'New',
  'in-progress': 'Active',
  awaiting: 'Resolved',
  done: 'Closed',
};

const VALID_SCOPE_LITERALS = new Set(['current-sprint', 'my-work']);

/**
 * Normalize an org value to the bare org name that
 * `npx -y @azure-devops/mcp <org>` expects — strips a leading
 * `https://dev.azure.com/` (any case) and any trailing slash(es).
 */
export function normalizeOrgName(raw) {
  return String(raw)
    .trim()
    .replace(/^https?:\/\/dev\.azure\.com\//i, '')
    .replace(/\/+$/, '');
}

/**
 * Invert a local-status -> ADO-state map into ADO-state -> local-status.
 * When two local keys map to the same ADO state, the FIRST key in object
 * (insertion) order wins — later duplicates are silently ignored, matching
 * PLAN-ado.md §4.
 */
export function invertStateMap(stateMap) {
  const reverse = {};
  for (const [localStatus, adoState] of Object.entries(stateMap)) {
    if (!(adoState in reverse)) {
      reverse[adoState] = localStatus;
    }
  }
  return reverse;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateScope(scope, errors) {
  if (scope === undefined) return 'current-sprint';
  if (typeof scope === 'string') {
    if (!VALID_SCOPE_LITERALS.has(scope)) {
      errors.push(
        `ado.scope must be "current-sprint", "my-work", or {"wiql": "..."} — got "${scope}"`,
      );
    }
    return scope;
  }
  if (isPlainObject(scope) && typeof scope.wiql === 'string' && scope.wiql.trim()) {
    return scope;
  }
  errors.push('ado.scope must be "current-sprint", "my-work", or {"wiql": "..."}');
  return scope;
}

// TASK-021: `ado.mcp_command` overrides the ADO MCP server launcher (the
// npx-hardcoded spawn broke on any Node+pnpm/bun-but-no-npm box — WSL,
// corepack-only CI images, etc). It's an ARRAY of [launcher,
// ...fixed-prefix-args] — e.g. ["npx","-y"], ["pnpm","dlx"], ["bunx"] —
// that adoClientMcp.js's buildLauncher() appends the fixed
// `@azure-devops/mcp <org> -d core work work-items` args to. Left undefined
// when absent so adoClientMcp.js does its own PATH auto-detect (npx -> pnpm
// -> bunx) at spawn time — the default is intentionally NOT baked in here.
function validateMcpCommand(mcpCommand, errors) {
  if (mcpCommand === undefined) return undefined;
  const invalid =
    !Array.isArray(mcpCommand) ||
    mcpCommand.length === 0 ||
    mcpCommand.some((el) => typeof el !== 'string' || !el.trim());
  if (invalid) {
    errors.push(
      'ado.mcp_command must be a non-empty array of non-empty strings ' +
        '(e.g. ["npx","-y"], ["pnpm","dlx"], ["bunx"])',
    );
    return undefined;
  }
  return mcpCommand.map((el) => el.trim());
}

// TASK-022: `ado.authentication` overrides the ADO MCP server's own `-a`
// flag (it defaults to `interactive` server-side when omitted — a browser
// OAuth flow that ALSO binds a temporary localhost HTTP listener on a
// random port, surprising for most users who are already `az login`'ed).
// Valid values MUST mirror the server's own `-a/--authentication` enum
// exactly (`azure-devops-mcp --help`) — anything else is rejected here
// rather than silently passed through to a server that would reject it
// itself with a less useful error.
const VALID_AUTH_MODES = new Set(['interactive', 'azcli', 'env', 'envvar', 'pat']);

// `fieldName` names the source of the value in error messages — either the
// JSON key (`ado.authentication`, the default) or the env var it was
// resolved from (`TASK_MEMORY_ADO_AUTH`, TASK-023) — so a bad value is
// always traceable to where it actually came from.
function validateAuthentication(authentication, errors, fieldName = 'ado.authentication') {
  if (authentication === undefined) return undefined;
  if (typeof authentication !== 'string' || !VALID_AUTH_MODES.has(authentication)) {
    errors.push(
      `${fieldName} must be one of "interactive", "azcli", "env", "envvar", "pat" — got ${JSON.stringify(authentication)}`,
    );
    return undefined;
  }
  return authentication;
}

// TASK-022: `ado.tenant` overrides the ADO MCP server's own `-t/--tenant`
// flag — needed when the caller's `az login` session is for a different
// Azure AD tenant than the one the ADO org lives in (azcli auth silently
// picks up whatever tenant the CLI is currently logged into).
// `fieldName` — see validateAuthentication above (TASK-023).
function validateTenant(tenant, errors, fieldName = 'ado.tenant') {
  if (tenant === undefined) return undefined;
  if (typeof tenant !== 'string' || !tenant.trim()) {
    errors.push(`${fieldName} must be a non-empty string`);
    return undefined;
  }
  return tenant.trim();
}

// TASK-023: machine/CI-wide env-var fallbacks for `ado.tenant` and
// `ado.authentication`. On a machine where `az` is constantly re-logged
// into different client tenants, pinning `ado.tenant` in every project's
// `.task-memory.json` doesn't scale — these let a single shell-profile (or
// CI job) export set the default once, for every project that doesn't
// override it explicitly. Namespaced under `TASK_MEMORY_` (not Azure's own
// `AZURE_TENANT_ID`) so this never collides with other tooling that reads
// the generic Azure env vars.
export const ENV_ADO_TENANT = 'TASK_MEMORY_ADO_TENANT';
export const ENV_ADO_AUTH = 'TASK_MEMORY_ADO_AUTH';

// An env var that's set-but-blank (`export TASK_MEMORY_ADO_TENANT=""` left
// over in a shell profile) should behave like "not set" rather than
// producing a validation error — unlike an explicit blank string in JSON,
// which is a deliberate typo the user should be told about. Non-strings
// pass through unchanged (env values are always strings in practice, but
// this keeps the helper total).
function blankToUndefined(value) {
  if (typeof value !== 'string') return value;
  return value.trim() === '' ? undefined : value;
}

/**
 * TASK-023: resolve precedence between an explicit JSON config value and an
 * environment-variable fallback. Explicit config ALWAYS wins; the env value
 * is used only when the JSON key is entirely absent (`undefined`). Pure —
 * callers pass the already-read env value in (see `env` param of
 * loadAdoConfig) rather than this function reading `process.env` itself, so
 * it — and loadAdoConfig — are testable by injecting a plain object instead
 * of mutating the real environment.
 *
 * @returns {{ value: *, fromEnv: boolean }}
 */
export function resolveConfigWithEnv(explicitValue, envValue) {
  if (explicitValue !== undefined) return { value: explicitValue, fromEnv: false };
  if (envValue !== undefined) return { value: envValue, fromEnv: true };
  return { value: undefined, fromEnv: false };
}

function validateStateMap(stateMap, errors) {
  if (stateMap === undefined) return { ...DEFAULT_STATE_MAP };
  if (!isPlainObject(stateMap)) {
    errors.push('ado.state_map must be an object mapping local status -> ADO state string');
    return { ...DEFAULT_STATE_MAP };
  }
  const out = {};
  for (const [k, v] of Object.entries(stateMap)) {
    if (typeof v !== 'string' || !v.trim()) {
      errors.push(`ado.state_map["${k}"] must be a non-empty string`);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Load + validate the `ado` block of a parsed `.task-memory.json` object.
 * Pure — takes the already-parsed config object, does no I/O; `env` defaults
 * to `process.env` but callers (tests) can inject a plain object instead so
 * TASK_MEMORY_ADO_* fallbacks are testable without mutating the real
 * environment.
 *
 * @param {object} rawConfigObject - parsed contents of .task-memory.json
 * @param {object} [env] - environment to read TASK_MEMORY_ADO_* fallbacks
 *   from (TASK-023); defaults to `process.env`.
 * @returns {{ ok: boolean, notConfigured: boolean, config: object|null, errors: string[] }}
 */
export function loadAdoConfig(rawConfigObject, env = process.env) {
  const ado = rawConfigObject && rawConfigObject.ado;
  if (!isPlainObject(ado)) {
    return { ok: false, notConfigured: true, config: null, errors: [] };
  }

  const errors = [];

  if (!ado.org || typeof ado.org !== 'string' || !ado.org.trim()) {
    errors.push('ado.org is required (Azure DevOps org url or bare org name)');
  }
  if (!ado.project || typeof ado.project !== 'string' || !ado.project.trim()) {
    errors.push('ado.project is required');
  }

  const scope = validateScope(ado.scope, errors);
  const stateMap = validateStateMap(ado.state_map, errors);
  const mcpCommand = validateMcpCommand(ado.mcp_command, errors);

  // TASK-023: explicit ado.authentication/ado.tenant win outright; otherwise
  // fall back to the TASK_MEMORY_ADO_* env var (blank-string env values are
  // treated as unset, not an error — see blankToUndefined above). Either
  // way the resolved value still goes through the SAME validation as a JSON
  // value would, just with the error (if any) naming the env var as the
  // source instead of the JSON key.
  const authResolved = resolveConfigWithEnv(ado.authentication, blankToUndefined(env && env[ENV_ADO_AUTH]));
  if (authResolved.fromEnv) {
    console.debug(`[config] ado.authentication from ${ENV_ADO_AUTH}`);
  }
  const authentication = validateAuthentication(
    authResolved.value,
    errors,
    authResolved.fromEnv ? ENV_ADO_AUTH : 'ado.authentication',
  );

  const tenantResolved = resolveConfigWithEnv(ado.tenant, blankToUndefined(env && env[ENV_ADO_TENANT]));
  if (tenantResolved.fromEnv) {
    console.debug(`[config] ado.tenant from ${ENV_ADO_TENANT}`);
  }
  const tenant = validateTenant(tenantResolved.value, errors, tenantResolved.fromEnv ? ENV_ADO_TENANT : 'ado.tenant');

  if (errors.length > 0) {
    return { ok: false, notConfigured: false, config: null, errors };
  }

  const planningDir = (rawConfigObject && rawConfigObject.planning_dir) || 'planning';

  const config = {
    org: normalizeOrgName(ado.org),
    project: ado.project.trim(),
    team: (ado.team || '').trim(),
    areaPath: ado.area_path || '',
    scope,
    workItemType: ado.work_item_type || 'Task',
    taskFile: ado.task_file || `${planningDir}/tasks.md`,
    repoUrl: ado.repo_url || '',
    stateMap,
    reverseStateMap: invertStateMap(stateMap),
    mcpCommand,
    authentication,
    tenant,
  };

  return { ok: true, notConfigured: false, config, errors: [] };
}
