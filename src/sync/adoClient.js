// src/sync/adoClient.js — TASK-019 (Azure DevOps bridge)
//
// This file is THE SEAM. It owns the adoClient interface contract (as JSDoc
// typedefs, below) and the mock reference implementation. Every module under
// src/sync/ other than adoClientMcp.js (the real MCP-backed client) and the
// CLI (scripts/ado-sync.mjs) imports only this file for ADO access — never
// adoClientMcp.js directly — so all sync logic is importable/testable with
// zero network and zero MCP. See PLAN-ado.md §1.
//
// Keeping the interface docs and the mock in the same file means the
// contract and its reference implementation can't drift apart.

/** @typedef {Object} WorkItem
 *  @property {number} id
 *  @property {number} rev            // System.Rev
 *  @property {string} title          // System.Title
 *  @property {string} state          // System.State (raw ADO state string)
 *  @property {string} type           // System.WorkItemType
 *  @property {string} assignee       // System.AssignedTo displayName, '' if unassigned
 *  @property {string} iterationPath  // System.IterationPath, '' if none
 *  @property {number|null} priority  // Microsoft.VSTS.Common.Priority
 *  @property {string} url            // human web url: <org>/<project>/_workitems/edit/<id>
 */

/** @typedef {Object} AdoComment
 *  @property {number} id
 *  @property {string} text        // plain-ish text (HTML stripped by the client impl)
 *  @property {string} author      // displayName
 *  @property {string} createdDate // ISO 8601
 */

/** @typedef {Object} Iteration
 *  @property {string} id
 *  @property {string} name
 *  @property {string} path
 *  @property {'current'|'past'|'future'|''} timeFrame
 */

/**
 * Thrown by every adoClient method on transport/auth failure (MCP server
 * unreachable, `az login` not done, network down, etc). Callers (engine.js,
 * the CLI) treat this uniformly as "ADO unreachable — clean no-op".
 */
export class AdoUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdoUnavailableError';
  }
}

// -----------------------------------------------------------------------------
// adoClient interface (implemented by both createMockAdoClient below and the
// real MCP-backed client in adoClientMcp.js):
//
//   async ping()                                  -> boolean
//   async listIterations()                        -> Iteration[]
//   async currentIterationId()                     -> string|null
//   async listIterationWorkItemIds(iterationId)    -> number[]
//   async myWorkItemIds()                          -> number[]
//   async queryByWiql(wiql)                        -> number[]
//   async getWorkItem(id)                          -> WorkItem|null
//   async getWorkItemsBatch(ids)                   -> WorkItem[]
//   async updateWorkItemFields(id, fields)         -> WorkItem  (fresh rev)
//   async createWorkItem(type, fields)             -> WorkItem
//   async listComments(workItemId)                 -> AdoComment[] (ascending by id)
//   async addComment(workItemId, markdownText)     -> {id: number}
//   async close()                                  -> void
//
// All methods are async and throw AdoUnavailableError on transport/auth
// failure. `fields`/`createWorkItem` field maps use raw ADO reference names
// as keys ('System.State', 'System.Title', 'System.AssignedTo',
// 'System.IterationPath', 'Microsoft.VSTS.Common.Priority').
// -----------------------------------------------------------------------------

const FIELD_SETTERS = {
  'System.Title': (item, v) => { item.title = v; },
  'System.State': (item, v) => { item.state = v; },
  'System.AssignedTo': (item, v) => { item.assignee = v; },
  'System.IterationPath': (item, v) => { item.iterationPath = v; },
  'Microsoft.VSTS.Common.Priority': (item, v) => { item.priority = v; },
  'System.Description': (item, v) => { item.description = v; },
  'System.AreaPath': (item, v) => { item.areaPath = v; },
};

function applyFields(item, fields) {
  for (const [key, value] of Object.entries(fields || {})) {
    const setter = FIELD_SETTERS[key];
    if (setter) setter(item, value);
  }
}

function cloneWorkItem(item) {
  return item ? { ...item } : null;
}

/**
 * Create a fully deterministic, offline mock of the adoClient interface.
 *
 * @param {object} fixture
 * @param {Iteration[]} [fixture.iterations]
 * @param {Object<string, number[]>} [fixture.iterationItems] - iterationId -> workItem ids
 * @param {number[]} [fixture.myItems]
 * @param {Object<string, WorkItem>} [fixture.workItems] - id (string or number) -> WorkItem
 * @param {Object<string, AdoComment[]>} [fixture.comments] - workItemId -> comments
 * @param {Object<string, number[]>} [fixture.wiqlResults] - wiql string -> ids (default: all workItems)
 * @param {number} [fixture.nextId] - id minted by createWorkItem (default 90000)
 * @param {number} [fixture.nextCommentId] - id minted by addComment (default 500)
 * @param {object} [fixture.fail] - per-method failure injection:
 *   { methodName: { after: N, error: 'msg', unavailable?: boolean } } throws
 *   on the Nth call to that method. Throws `AdoUnavailableError` by default
 *   (`unavailable` omitted or `true`) — matching a transport/auth death, the
 *   uniform failure mode every other adoClient method already documents.
 *   Pass `unavailable: false` to instead throw a plain `Error`, modeling an
 *   ADO-SIDE rejection of that one call (validation, permissions, ...) that
 *   should NOT be treated as "the whole connection died" by callers that
 *   distinguish the two (engine.push's mid-push abort, finding #4).
 * @param {boolean} [fixture.unavailable] - true => every method (incl. ping)
 *   throws AdoUnavailableError immediately, zero mutation, zero downstream calls.
 * @returns {object} adoClient — see interface comment above. Also exposes
 *   `.calls` ([{method, args}]) recording every invocation, in order, for
 *   test assertions.
 */
export function createMockAdoClient(fixture = {}) {
  const state = {
    iterations: (fixture.iterations || []).map((i) => ({ ...i })),
    iterationItems: Object.fromEntries(
      Object.entries(fixture.iterationItems || {}).map(([k, v]) => [k, [...v]]),
    ),
    myItems: [...(fixture.myItems || [])],
    workItems: Object.fromEntries(
      Object.entries(fixture.workItems || {}).map(([k, v]) => [String(k), { ...v }]),
    ),
    comments: Object.fromEntries(
      Object.entries(fixture.comments || {}).map(([k, v]) => [String(k), v.map((c) => ({ ...c }))]),
    ),
    wiqlResults: fixture.wiqlResults || null,
    nextId: fixture.nextId ?? 90000,
    nextCommentId: fixture.nextCommentId ?? 500,
    fail: fixture.fail || {},
    unavailable: !!fixture.unavailable,
  };

  const callCounts = {};
  const calls = [];

  function invoke(method, args) {
    calls.push({ method, args });
    if (state.unavailable) {
      throw new AdoUnavailableError(`ADO unavailable (mock): ${method}`);
    }
    callCounts[method] = (callCounts[method] || 0) + 1;
    const rule = state.fail[method];
    if (rule && callCounts[method] === rule.after) {
      if (rule.unavailable === false) {
        throw new Error(rule.error || `mock injected failure: ${method}`);
      }
      throw new AdoUnavailableError(rule.error || `mock injected failure: ${method}`);
    }
  }

  return {
    calls,

    async ping() {
      invoke('ping', []);
      return true;
    },

    async listIterations() {
      invoke('listIterations', []);
      return state.iterations.map((i) => ({ ...i }));
    },

    async currentIterationId() {
      invoke('currentIterationId', []);
      const cur = state.iterations.find((i) => i.timeFrame === 'current');
      return cur ? cur.id : null;
    },

    async listIterationWorkItemIds(iterationId) {
      invoke('listIterationWorkItemIds', [iterationId]);
      return [...(state.iterationItems[iterationId] || [])];
    },

    async myWorkItemIds() {
      invoke('myWorkItemIds', []);
      return [...state.myItems];
    },

    async queryByWiql(wiql) {
      invoke('queryByWiql', [wiql]);
      if (state.wiqlResults && Object.prototype.hasOwnProperty.call(state.wiqlResults, wiql)) {
        return [...state.wiqlResults[wiql]];
      }
      return Object.keys(state.workItems).map((id) => parseInt(id, 10));
    },

    async getWorkItem(id) {
      invoke('getWorkItem', [id]);
      return cloneWorkItem(state.workItems[String(id)]);
    },

    async getWorkItemsBatch(ids) {
      invoke('getWorkItemsBatch', [ids]);
      const out = [];
      for (const id of ids) {
        const item = state.workItems[String(id)];
        if (item) out.push({ ...item });
      }
      return out;
    },

    async updateWorkItemFields(id, fields) {
      invoke('updateWorkItemFields', [id, fields]);
      const item = state.workItems[String(id)];
      if (!item) {
        throw new Error(`mock adoClient: updateWorkItemFields — work item ${id} not found`);
      }
      applyFields(item, fields);
      item.rev = (item.rev || 0) + 1;
      return { ...item };
    },

    async createWorkItem(type, fields) {
      invoke('createWorkItem', [type, fields]);
      const id = state.nextId++;
      const item = {
        id,
        rev: 1,
        title: fields?.['System.Title'] || '',
        state: fields?.['System.State'] || '',
        type,
        assignee: fields?.['System.AssignedTo'] || '',
        iterationPath: fields?.['System.IterationPath'] || '',
        priority: fields?.['Microsoft.VSTS.Common.Priority'] ?? null,
        url: `https://dev.azure.com/mock-org/mock-project/_workitems/edit/${id}`,
      };
      state.workItems[String(id)] = item;
      state.comments[String(id)] = [];
      return { ...item };
    },

    async listComments(workItemId) {
      invoke('listComments', [workItemId]);
      const list = state.comments[String(workItemId)] || [];
      return [...list].sort((a, b) => a.id - b.id).map((c) => ({ ...c }));
    },

    async addComment(workItemId, markdownText) {
      invoke('addComment', [workItemId, markdownText]);
      const id = state.nextCommentId++;
      const comment = {
        id,
        text: markdownText,
        author: 'Mock User',
        createdDate: new Date(0).toISOString(),
      };
      if (!state.comments[String(workItemId)]) state.comments[String(workItemId)] = [];
      state.comments[String(workItemId)].push(comment);
      return { id };
    },

    async close() {
      invoke('close', []);
    },
  };
}
