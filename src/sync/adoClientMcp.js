// src/sync/adoClientMcp.js — TASK-019 (Azure DevOps bridge)
//
// The REAL adoClient implementation, backed by the official
// `@modelcontextprotocol/sdk` stdio client talking to the official
// `microsoft/azure-devops-mcp` server (`npx -y @azure-devops/mcp <org> -d
// core work wit`), authenticated via the server's own `az login` /
// browser-OAuth flow — no PAT, no custom REST client (D4).
//
// This is the ONLY file in src/sync/ that imports @modelcontextprotocol/sdk,
// and the ONLY file that knows the real MCP tool names/params/result shapes.
// Every other module (engine.js, board.js, notes.js, ...) only ever sees the
// adoClient.js interface (WorkItem/AdoComment/Iteration typedefs) — this
// file's entire job is normalizing MCP's wire shapes into those typedefs so
// nothing downstream has to know MCP exists.
//
// NOT unit-tested (PLAN-ado.md's hard constraint: no live ADO project is
// available during the build) and NOT imported by scripts/ado-sync.mjs
// unless the CLI is run WITHOUT --from-json — see that file's buildClient().
// Exercised only by the live-ADO integration checklist (PLAN-ado.md §10).
//
// Robustness rule (§1.3): MCP client-host tool-name prefixes drift between
// hosts, so instead of hardcoding e.g. "mcp_ado_wit_get_work_item" this file
// calls listTools() once at connect time and resolves each canonical suffix
// below by "tool name ends with suffix" — if a suffix can't be resolved, it
// throws a clear, actionable AdoUnavailableError naming the missing suffix
// (see §10 step 1 of the live checklist).

import { AdoUnavailableError } from './adoClient.js';
import { htmlToText } from './htmlToText.js';

// Canonical MCP tool-name suffixes this client depends on (§1.3 table).
const TOOL_SUFFIXES = {
  listTeamIterations: 'work_list_team_iterations',
  getWorkItemsForIteration: 'wit_get_work_items_for_iteration',
  myWorkItems: 'wit_my_work_items',
  queryByWiql: 'wit_query_by_wiql',
  getWorkItem: 'wit_get_work_item',
  getWorkItemsBatchByIds: 'wit_get_work_items_batch_by_ids',
  updateWorkItem: 'wit_update_work_item',
  createWorkItem: 'wit_create_work_item',
  listWorkItemComments: 'wit_list_work_item_comments',
  addWorkItemComment: 'wit_add_work_item_comment',
};

const REQUESTED_FIELDS = [
  'System.Id',
  'System.Rev',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.IterationPath',
  'Microsoft.VSTS.Common.Priority',
];

function buildWebUrl(org, project, id) {
  return `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

// MCP tool results arrive as { content: [{ type: 'text', text: '<json>' }] }
// — parse defensively (§1.3 note b).
function parseToolResult(result) {
  const first = result && Array.isArray(result.content) ? result.content[0] : null;
  if (!first || typeof first.text !== 'string') {
    throw new AdoUnavailableError('unexpected MCP tool result shape (no text content)');
  }
  try {
    return JSON.parse(first.text);
  } catch (err) {
    throw new AdoUnavailableError(`could not parse MCP tool result JSON: ${err.message}`);
  }
}

function normalizeAssignedTo(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  return raw.displayName || raw.uniqueName || '';
}

function normalizeWorkItem(raw, org, project) {
  const fields = raw.fields || raw;
  const id = raw.id ?? fields['System.Id'];
  return {
    id: Number(id),
    rev: Number(raw.rev ?? fields['System.Rev'] ?? 0),
    title: fields['System.Title'] || '',
    state: fields['System.State'] || '',
    type: fields['System.WorkItemType'] || '',
    assignee: normalizeAssignedTo(fields['System.AssignedTo']),
    iterationPath: fields['System.IterationPath'] || '',
    priority: fields['Microsoft.VSTS.Common.Priority'] ?? null,
    url: raw.url || buildWebUrl(org, project, id),
  };
}

function normalizeComment(raw) {
  return {
    id: Number(raw.id),
    text: htmlToText(raw.text || raw.renderedText || ''),
    author: normalizeAssignedTo(raw.createdBy) || raw.createdBy || '',
    createdDate: raw.createdDate || raw.modifiedDate || '',
  };
}

function normalizeIteration(raw) {
  return {
    id: raw.id,
    name: raw.name || '',
    path: raw.path || raw.attributes?.path || '',
    timeFrame: raw.attributes?.timeFrame || raw.timeFrame || '',
  };
}

/**
 * Create the real MCP-backed adoClient. Spawns the official ADO MCP server
 * as a subprocess and connects over stdio.
 *
 * @param {{org: string, project: string, team?: string}} config - the
 *   `.config` object returned by loadAdoConfig().
 * @returns {Promise<object>} an adoClient (see adoClient.js for the interface)
 */
export async function createAdoClient(config) {
  let Client;
  let StdioClientTransport;
  try {
    ({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'));
    ({ StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js'));
  } catch (err) {
    throw new AdoUnavailableError(
      `@modelcontextprotocol/sdk is not installed — run \`npm install\` (${err.message})`,
    );
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@azure-devops/mcp', config.org, '-d', 'core', 'work', 'wit'],
  });

  const client = new Client({ name: 'task-memory-ado-sync', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
  } catch (err) {
    throw new AdoUnavailableError(
      `could not start/connect to the Azure DevOps MCP server (is \`npx -y @azure-devops/mcp\` ` +
        `installed and are you \`az login\`'ed?): ${err.message}`,
    );
  }

  let toolNameBySuffix;
  async function resolveTools() {
    if (toolNameBySuffix) return toolNameBySuffix;
    const { tools } = await client.listTools();
    const map = {};
    for (const [key, suffix] of Object.entries(TOOL_SUFFIXES)) {
      const match = tools.find((t) => t.name === suffix || t.name.endsWith(`_${suffix}`) || t.name.endsWith(suffix));
      if (!match) {
        throw new AdoUnavailableError(
          `Azure DevOps MCP server does not expose a tool ending in "${suffix}" (needed for ${key}). ` +
            `Available tools: ${tools.map((t) => t.name).join(', ')}`,
        );
      }
      map[key] = match.name;
    }
    toolNameBySuffix = map;
    return map;
  }

  async function callTool(key, args) {
    const names = await resolveTools();
    try {
      const result = await client.callTool({ name: names[key], arguments: args });
      return parseToolResult(result);
    } catch (err) {
      if (err instanceof AdoUnavailableError) throw err;
      throw new AdoUnavailableError(`Azure DevOps MCP call "${names[key]}" failed: ${err.message}`);
    }
  }

  const project = config.project;
  const team = config.team || undefined;

  return {
    async ping() {
      await resolveTools();
      return true;
    },

    async listIterations() {
      const data = await callTool('listTeamIterations', { project, team });
      const list = Array.isArray(data) ? data : data.value || [];
      return list.map(normalizeIteration);
    },

    async currentIterationId() {
      const iterations = await this.listIterations();
      const current = iterations.find((i) => i.timeFrame === 'current');
      return current ? current.id : null;
    },

    async listIterationWorkItemIds(iterationId) {
      const data = await callTool('getWorkItemsForIteration', { project, team, iterationId });
      const list = Array.isArray(data) ? data : data.workItemRelations || data.value || [];
      return list.map((r) => Number(r.target?.id ?? r.id)).filter((n) => Number.isFinite(n));
    },

    async myWorkItemIds() {
      const data = await callTool('myWorkItems', { project, includeCompleted: true, top: 200 });
      const list = Array.isArray(data) ? data : data.value || [];
      return list.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    },

    async queryByWiql(wiql) {
      const data = await callTool('queryByWiql', { project, wiql, top: 200 });
      const list = Array.isArray(data) ? data : data.workItems || data.value || [];
      return list.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    },

    async getWorkItem(id) {
      try {
        const data = await callTool('getWorkItem', { project, id, fields: REQUESTED_FIELDS });
        if (!data) return null;
        return normalizeWorkItem(data, config.org, project);
      } catch {
        return null; // "does not exist / no access" per adoClient.js contract
      }
    },

    async getWorkItemsBatch(ids) {
      if (ids.length === 0) return [];
      const out = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const data = await callTool('getWorkItemsBatchByIds', { project, ids: chunk, fields: REQUESTED_FIELDS });
        const list = Array.isArray(data) ? data : data.value || [];
        out.push(...list.map((r) => normalizeWorkItem(r, config.org, project)));
      }
      return out;
    },

    async updateWorkItemFields(id, fields) {
      const updates = Object.entries(fields).map(([path, value]) => ({
        op: 'replace',
        path: `/fields/${path}`,
        value,
      }));
      const data = await callTool('updateWorkItem', { id, updates });
      return normalizeWorkItem(data, config.org, project);
    },

    async createWorkItem(type, fields) {
      const data = await callTool('createWorkItem', { project, workItemType: type, fields });
      return normalizeWorkItem(data, config.org, project);
    },

    async listComments(workItemId) {
      const data = await callTool('listWorkItemComments', { project, workItemId, top: 200 });
      const list = Array.isArray(data) ? data : data.comments || data.value || [];
      return list.map(normalizeComment).sort((a, b) => a.id - b.id);
    },

    async addComment(workItemId, markdownText) {
      const data = await callTool('addWorkItemComment', { project, workItemId, comment: markdownText, format: 'markdown' });
      return { id: Number(data.id) };
    },

    async close() {
      await client.close();
    },
  };
}
