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
 * Pure — takes the already-parsed config object, does no I/O.
 *
 * @param {object} rawConfigObject - parsed contents of .task-memory.json
 * @returns {{ ok: boolean, notConfigured: boolean, config: object|null, errors: string[] }}
 */
export function loadAdoConfig(rawConfigObject) {
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
  };

  return { ok: true, notConfigured: false, config, errors: [] };
}
