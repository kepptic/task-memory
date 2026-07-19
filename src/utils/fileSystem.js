// File System Access API module
// Handles all directory and file operations

// IndexedDB configuration for storing recent projects
const DB_NAME = "TaskManagerDB";
const DB_VERSION = 3; // Bumped for taskFileName support
const STORE_NAME = "settings";
const PROJECTS_KEY = "recentProjects";
const MAX_RECENT_PROJECTS = 10;

// Supported task file names in priority order. Retained as documentation of
// the two fixed names discovery always recognizes (tasks.md wins, kanban.md
// is legacy) — actual discovery is now dynamic via TASK_FILE_RE below.
// eslint-disable-next-line no-unused-vars
const TASK_FILE_NAMES = ['tasks.md', 'kanban.md'];
const DEFAULT_TASK_FILE = 'tasks.md';

// TASK-017: per-dev/per-team task files (`tasks-gr.md`, `tasks_dg.md`) are
// discovered dynamically alongside the fixed tasks.md/kanban.md names, so
// each dev/team can mint ids from an independent counter+prefix (see
// src/utils/taskId.js). Separator class ([-_.]) matches taskId.js's
// prefixFromFileName so any file this regex discovers can also have its
// namespace prefix derived from the filename. Deliberately excludes
// `tasks-archive.md`-shaped names (5+ letter suffix) and plain `archive.md`.
const TASK_FILE_RE = /^tasks(?:[-_.][A-Za-z]{2,4})?\.md$/i;

// Nested directory candidates searched when no task file exists at root.
// Order matters — first match wins.
const NESTED_SEARCH_DIRS = [
  ['planning'],
  ['docs', 'planning'],
];
// Wildcard parent whose immediate children are each probed for tasks.md/kanban.md
const WILDCARD_PARENTS = [
  ['docs', 'todo'],
];

// File handles
let directoryHandle = null;
let kanbanFileHandle = null;
let archiveFileHandle = null;

// Open IndexedDB
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// Save directory handle to IndexedDB
async function saveDirectoryHandle(handle, customName = null, taskFileName = null, group = undefined, taskFilePath = undefined) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Get existing projects
    const getRequest = store.get(PROJECTS_KEY);
    const projects = await new Promise((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    // Get project name (directory name)
    const projectName = handle.name;

    // Check if project already exists
    const existingIndex = projects.findIndex((p) => p.name === projectName);

    // Ask for custom name for new projects if not provided
    const projectDisplayName = customName || projectName;

    if (existingIndex >= 0) {
      // Move existing project to top and update handle
      const project = projects.splice(existingIndex, 1)[0];
      project.handle = handle;
      project.lastAccessed = Date.now();
      // Update taskFileName if provided
      if (taskFileName) {
        project.taskFileName = taskFileName;
      }
      // Update taskFilePath if explicitly provided (allow empty string = root)
      if (taskFilePath !== undefined) {
        project.taskFilePath = taskFilePath || '';
      }
      // Update group if explicitly provided (allow empty string to clear)
      if (group !== undefined) {
        project.group = group || undefined;
      }
      projects.unshift(project);
    } else {
      // Add new project at the beginning
      projects.unshift({
        name: projectName,
        displayName: projectDisplayName,
        handle: handle,
        taskFileName: taskFileName || DEFAULT_TASK_FILE,
        taskFilePath: taskFilePath !== undefined ? (taskFilePath || '') : '',
        group: group || undefined,
        lastAccessed: Date.now(),
      });
    }

    // Keep only the most recent projects
    if (projects.length > MAX_RECENT_PROJECTS) {
      projects.length = MAX_RECENT_PROJECTS;
    }

    // Save back to IndexedDB
    const putRequest = store.put(projects, PROJECTS_KEY);
    await new Promise((resolve, reject) => {
      putRequest.onsuccess = resolve;
      putRequest.onerror = () => reject(putRequest.error);
    });

    console.log(`Project "${projectDisplayName}" saved to recent projects`);
  } catch (error) {
    console.error("Failed to save directory handle:", error);
  }
}

// Load recent projects from IndexedDB
async function loadRecentProjects() {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(PROJECTS_KEY);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to load recent projects:", error);
    return [];
  }
}

// Load the most recent directory handle
async function loadDirectoryHandle() {
  try {
    const projects = await loadRecentProjects();
    // Return the most recent project (first in list)
    return projects.length > 0 ? projects[0].handle : null;
  } catch (error) {
    console.error("Failed to load directory handle:", error);
    return null;
  }
}

// Verify permission for a file handle
async function verifyPermission(handle) {
  const options = { mode: "readwrite" };
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }
  if ((await handle.requestPermission(options)) === "granted") {
    return true;
  }
  return false;
}

// Request directory access from user
async function requestDirectoryAccess(startInHandle = null) {
  try {
    const options = {};
    if (startInHandle) {
      options.startIn = startInHandle;
    }

    const handle = await window.showDirectoryPicker(options);
    return handle;
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Error requesting directory access:", error);
      throw error;
    }
    return null;
  }
}

// Generate initial task file content
// IMPORTANT: Template format must match parser expectations:
// - Columns use pipe-separated format on single line
// - Section headers must derive to same canonical IDs as column config
// - Column names in config match section headers exactly
function generateInitialTaskFile() {
  return `# Task Board

<!-- Config: Last Task ID: 0 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | 👀 In Review (in-review) | ✅ Done (done)

**Categories**: Frontend, Backend, Design, DevOps, Tests, Documentation

**Users**: @user (User)

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #bug #feature #ui #backend #urgent #refactor #docs #test

---

## 📝 To Do

## 🚀 In Progress

## 👀 In Review

## ✅ Done
`;
}

// Walk a path of directory segments from a root handle. Returns the nested
// directory handle or null if any segment is missing.
async function walkToDir(rootHandle, segments) {
  let current = rootHandle;
  for (const seg of segments) {
    try {
      current = await current.getDirectoryHandle(seg, { create: false });
    } catch (e) {
      if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') {
        return null;
      }
      throw e;
    }
  }
  return current;
}

// List every task file name present in a directory handle.
// Returns [{ fileName, isLegacy }], sorted tasks.md first, then any
// discovered tasks-<xx>.md (TASK-017 per-file namespaces) alphabetically,
// then kanban.md (legacy) last. Enumerates directory entries (rather than
// probing the fixed TASK_FILE_NAMES list) so per-dev files are discoverable
// without the caller having to guess every possible prefix in advance.
async function listTaskFilesInDir(dirHandle) {
  const hits = [];
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind !== 'file') continue;
      if (TASK_FILE_RE.test(name) || name === 'kanban.md') {
        hits.push({ fileName: name, isLegacy: name === 'kanban.md' });
      }
    }
  } catch (e) {
    // entries() may be unavailable in some environments/mocks — fail soft
    // only for NotFoundError/TypeMismatchError (dir gone/not a directory).
    // Any other error (e.g. permission failures) is genuine and must not be
    // silently turned into "no task files" — matches walkToDir's handling.
    if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') {
      throw e;
    }
    return [];
  }

  const rank = (h) => (h.fileName === 'tasks.md' ? 0 : h.isLegacy ? 2 : 1);
  hits.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.fileName.localeCompare(b.fileName);
  });

  return hits;
}

// Discover ALL task files across the standard search paths.
// Returns an array of { fileName, relativePath, isLegacy }, deduped by
// `${relativePath}:${fileName}`. Order matches discoverTaskFile search order:
//   root → planning/ → docs/planning/ → docs/todo/*/ → planning/*/
async function discoverAllTaskFiles(dirHandle) {
  const seen = new Set();
  const out = [];

  const push = (relativePath, fileName, isLegacy) => {
    const key = `${relativePath}:${fileName}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ fileName, relativePath, isLegacy });
  };

  // Root
  for (const hit of await listTaskFilesInDir(dirHandle)) {
    push('', hit.fileName, hit.isLegacy);
  }

  // Fixed nested candidates
  for (const segments of NESTED_SEARCH_DIRS) {
    const nested = await walkToDir(dirHandle, segments);
    if (!nested) continue;
    const rp = segments.join('/');
    for (const hit of await listTaskFilesInDir(nested)) {
      push(rp, hit.fileName, hit.isLegacy);
    }
  }

  // Wildcard parents — iterate children alphabetically
  for (const segments of WILDCARD_PARENTS) {
    const parent = await walkToDir(dirHandle, segments);
    if (!parent) continue;
    const childNames = [];
    try {
      for await (const [name, child] of parent.entries()) {
        if (child.kind === 'directory') childNames.push(name);
      }
    } catch (e) {
      continue;
    }
    childNames.sort();
    for (const name of childNames) {
      try {
        const childDir = await parent.getDirectoryHandle(name, { create: false });
        const rp = [...segments, name].join('/');
        for (const hit of await listTaskFilesInDir(childDir)) {
          push(rp, hit.fileName, hit.isLegacy);
        }
      } catch (e) {
        // keep scanning
      }
    }
  }

  // planning/<child>/ — only if planning/ itself has subdirs
  try {
    const planning = await walkToDir(dirHandle, ['planning']);
    if (planning) {
      const childNames = [];
      try {
        for await (const [name, child] of planning.entries()) {
          if (child.kind === 'directory') childNames.push(name);
        }
      } catch (e) {
        // skip
      }
      childNames.sort();
      for (const name of childNames) {
        try {
          const childDir = await planning.getDirectoryHandle(name, { create: false });
          const rp = `planning/${name}`;
          for (const hit of await listTaskFilesInDir(childDir)) {
            push(rp, hit.fileName, hit.isLegacy);
          }
        } catch (e) {
          // keep scanning
        }
      }
    }
  } catch (e) {
    // planning/ not present or not iterable
  }

  return out;
}

// Auto-discover a task file in common locations. Backed by discoverAllTaskFiles;
// returns the first (highest-priority) match for backwards compatibility.
// Returns { fileHandle, relativePath, taskFileName, isLegacy } or null.
async function discoverTaskFile(dirHandle) {
  const all = await discoverAllTaskFiles(dirHandle);
  if (all.length === 0) return null;
  const first = all[0];
  const targetDir = await resolveTaskDir(dirHandle, first.relativePath);
  const fileHandle = await targetDir.getFileHandle(first.fileName, { create: false });
  return {
    fileHandle,
    taskFileName: first.fileName,
    isLegacy: first.isLegacy,
    relativePath: first.relativePath,
  };
}

// Resolve a stored relativePath (e.g. "docs/planning" or "") to a directory
// handle. Empty string / null = root.
async function resolveTaskDir(dirHandle, relativePath) {
  if (!relativePath) return dirHandle;
  const segments = relativePath.split('/').filter(Boolean);
  const nested = await walkToDir(dirHandle, segments);
  if (!nested) {
    throw new Error(`Nested task directory "${relativePath}" no longer exists`);
  }
  return nested;
}

// Detect task files across the directory tree.
// Returns:
//   {
//     found: relativePath/fileName string of highest-priority match (or null),
//     legacy: relativePath/fileName string of any kanban.md found (or null),
//     available: [{ fileName, relativePath, isLegacy }, ...]
//   }
// The `available` array covers ALL discovered files across root + nested dirs.
async function detectTaskFile(dirHandle) {
  const available = await discoverAllTaskFiles(dirHandle);
  const first = available[0] || null;
  const legacy = available.find(f => f.isLegacy) || null;

  const pathOf = (entry) =>
    entry.relativePath ? `${entry.relativePath}/${entry.fileName}` : entry.fileName;

  return {
    found: first ? pathOf(first) : null,
    legacy: legacy ? pathOf(legacy) : null,
    available,
  };
}

// Load task file (supports both tasks.md and kanban.md, plus nested paths).
// Second arg may be:
//   - null/undefined     → auto-discover (root first, then nested)
//   - string             → legacy: preferred filename at root
//   - { fileName, relativePath } → pinpoint load at a specific nested path
async function loadTaskFile(dirHandle, preferred = null) {
  let preferredFileName = null;
  let preferredPath = '';
  if (typeof preferred === 'string') {
    preferredFileName = preferred;
  } else if (preferred && typeof preferred === 'object') {
    preferredFileName = preferred.fileName || null;
    preferredPath = preferred.relativePath || '';
  }

  // If a preferred file is specified, try it first at its stored path
  if (preferredFileName) {
    try {
      const targetDir = await resolveTaskDir(dirHandle, preferredPath);
      kanbanFileHandle = await targetDir.getFileHandle(preferredFileName);
      const file = await kanbanFileHandle.getFile();
      const content = await file.text();
      console.log(`Task file "${preferredPath ? preferredPath + '/' : ''}${preferredFileName}" loaded, size:`, content.length);
      return {
        fileHandle: kanbanFileHandle,
        content,
        fileName: preferredFileName,
        relativePath: preferredPath,
        isLegacy: preferredFileName === 'kanban.md'
      };
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        // If the nested dir itself is gone we swallow and re-discover
        if (!/no longer exists/.test(error.message || '')) {
          console.warn('Preferred task file load failed:', error);
        }
      }
      console.log(`Preferred file "${preferredFileName}" at "${preferredPath}" not found, auto-discovering...`);
    }
  }

  // Auto-discover (root + nested)
  const discovered = await discoverTaskFile(dirHandle);
  if (discovered) {
    kanbanFileHandle = discovered.fileHandle;
    const file = await kanbanFileHandle.getFile();
    const content = await file.text();
    console.log(`Task file discovered at "${discovered.relativePath}/${discovered.taskFileName}", size:`, content.length);
    // Surface every discovered file (multi-kanban monorepos) + legacy flag
    const detection = await detectTaskFile(dirHandle);
    const available = detection.available;
    const hasLegacy = detection.legacy !== null;
    return {
      fileHandle: kanbanFileHandle,
      content,
      fileName: discovered.taskFileName,
      relativePath: discovered.relativePath,
      isLegacy: discovered.isLegacy,
      hasLegacy,
      available,
    };
  }

  // No file found anywhere — fresh init at root
  console.log('No task file found anywhere, creating tasks.md at root');
  const initialContent = generateInitialTaskFile();
  kanbanFileHandle = await dirHandle.getFileHandle(DEFAULT_TASK_FILE, { create: true });
  await saveToFile(kanbanFileHandle, initialContent);
  return {
    fileHandle: kanbanFileHandle,
    content: initialContent,
    fileName: DEFAULT_TASK_FILE,
    relativePath: '',
    isLegacy: false,
    isNew: true,
    available: [{ fileName: DEFAULT_TASK_FILE, relativePath: '', isLegacy: false }]
  };
}

// Legacy wrapper for backwards compatibility
async function loadKanbanFile(dirHandle) {
  const result = await loadTaskFile(dirHandle);
  return { fileHandle: result.fileHandle, content: result.content };
}

// Migrate kanban.md to tasks.md
async function migrateKanbanToTasks(dirHandle) {
  try {
    // Read content from kanban.md
    const oldHandle = await dirHandle.getFileHandle('kanban.md');
    const file = await oldHandle.getFile();
    const content = await file.text();

    // Create tasks.md with same content
    const newHandle = await dirHandle.getFileHandle('tasks.md', { create: true });
    await saveToFile(newHandle, content);

    // Delete kanban.md
    await dirHandle.removeEntry('kanban.md');

    // Update the module-level handle
    kanbanFileHandle = newHandle;

    console.log('Successfully migrated kanban.md to tasks.md');
    return { success: true, newHandle };
  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error };
  }
}

// Update project's task file preference
async function updateProjectTaskFile(projectName, taskFileName) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(PROJECTS_KEY);
    const projects = await new Promise((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    const projectIndex = projects.findIndex(p => p.name === projectName);

    if (projectIndex >= 0) {
      projects[projectIndex].taskFileName = taskFileName;

      const putRequest = store.put(projects, PROJECTS_KEY);
      await new Promise((resolve, reject) => {
        putRequest.onsuccess = resolve;
        putRequest.onerror = () => reject(putRequest.error);
      });

      console.log(`Updated task file for "${projectName}" to "${taskFileName}"`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to update project task file:', error);
    return false;
  }
}

// Load archive.md file
async function loadArchiveFile(dirHandle) {
  try {
    archiveFileHandle = await dirHandle.getFileHandle("archive.md");
    const file = await archiveFileHandle.getFile();
    const content = await file.text();

    console.log("Archive file loaded");
    return { fileHandle: archiveFileHandle, content };
  } catch (error) {
    if (error.name === "NotFoundError") {
      console.log("archive.md not found, will create it");
      // Create initial archive.md
      const initialContent = `# Task Archive

> Archived tasks

## ✅ Archives
`;
      archiveFileHandle = await dirHandle.getFileHandle("archive.md", {
        create: true,
      });
      await saveToFile(archiveFileHandle, initialContent);
      return { fileHandle: archiveFileHandle, content: initialContent };
    }
    throw error;
  }
}

// Save content to a file
async function saveToFile(fileHandle, content) {
  try {
    // Request permission if needed
    if (!(await verifyPermission(fileHandle))) {
      throw new Error("Permission denied");
    }

    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    console.log("File saved successfully");
    return true;
  } catch (error) {
    console.error("Error saving file:", error);
    throw error;
  }
}

// Save kanban file
async function saveKanbanFile(content) {
  if (!kanbanFileHandle) {
    throw new Error("No kanban file handle available");
  }
  return await saveToFile(kanbanFileHandle, content);
}

// Save archive file
async function saveArchiveFile(content) {
  if (!archiveFileHandle) {
    throw new Error("No archive file handle available");
  }
  return await saveToFile(archiveFileHandle, content);
}

// Delete a project from recent projects
async function deleteProjectFromRecents(projectIndex) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(PROJECTS_KEY);
    const projects = await new Promise((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    if (projectIndex >= 0 && projectIndex < projects.length) {
      projects.splice(projectIndex, 1);

      const putRequest = store.put(projects, PROJECTS_KEY);
      await new Promise((resolve, reject) => {
        putRequest.onsuccess = resolve;
        putRequest.onerror = () => reject(putRequest.error);
      });

      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to delete project:", error);
    return false;
  }
}

// Rename a project in recent projects
async function renameProject(projectIndex, newName) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(PROJECTS_KEY);
    const projects = await new Promise((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    if (projectIndex >= 0 && projectIndex < projects.length) {
      projects[projectIndex].displayName = newName;

      const putRequest = store.put(projects, PROJECTS_KEY);
      await new Promise((resolve, reject) => {
        putRequest.onsuccess = resolve;
        putRequest.onerror = () => reject(putRequest.error);
      });

      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to rename project:", error);
    return false;
  }
}

// Rename (or clear) a project's group
async function renameGroup(projectIndex, newGroup) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const getRequest = store.get(PROJECTS_KEY);
    const projects = await new Promise((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    });

    if (projectIndex >= 0 && projectIndex < projects.length) {
      const trimmed = (newGroup || '').trim();
      projects[projectIndex].group = trimmed || undefined;

      const putRequest = store.put(projects, PROJECTS_KEY);
      await new Promise((resolve, reject) => {
        putRequest.onsuccess = resolve;
        putRequest.onerror = () => reject(putRequest.error);
      });

      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to rename group:", error);
    return false;
  }
}

// Select a single file (for opening kanban.md files)
async function selectFile() {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md'] },
        },
      ],
      multiple: false,
    });
    return {
      handle: fileHandle,
      name: fileHandle.name,
    };
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error selecting file:', error);
      throw error;
    }
    return null;
  }
}

// Read content from a file handle
async function readFile(fileHandle) {
  try {
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}

// Write content to a file handle
async function writeFile(fileHandle, content) {
  try {
    // Request permission if needed
    if (!(await verifyPermission(fileHandle))) {
      throw new Error('Permission denied');
    }

    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
}

// Export for use in other modules
export const fileSystem = {
  // Getters for handles
  getDirectoryHandle: () => directoryHandle,
  setDirectoryHandle: (handle) => {
    directoryHandle = handle;
  },
  getKanbanFileHandle: () => kanbanFileHandle,
  getArchiveFileHandle: () => archiveFileHandle,

  // Single file operations
  selectFile,
  readFile,
  writeFile,

  // Main functions
  requestDirectoryAccess,
  verifyPermission,
  saveDirectoryHandle,
  loadDirectoryHandle,
  loadRecentProjects,
  loadKanbanFile,
  loadTaskFile,
  detectTaskFile,
  discoverTaskFile,
  discoverAllTaskFiles,
  migrateKanbanToTasks,
  updateProjectTaskFile,
  loadArchiveFile,
  saveKanbanFile,
  saveArchiveFile,
  deleteProjectFromRecents,
  renameProject,
  renameGroup,
};

export {
  selectFile,
  readFile,
  writeFile,
  requestDirectoryAccess,
  verifyPermission,
  saveDirectoryHandle,
  loadDirectoryHandle,
  loadRecentProjects,
  loadKanbanFile,
  loadTaskFile,
  detectTaskFile,
  discoverTaskFile,
  discoverAllTaskFiles,
  migrateKanbanToTasks,
  updateProjectTaskFile,
  loadArchiveFile,
  saveKanbanFile,
  saveArchiveFile,
  deleteProjectFromRecents,
  renameProject,
  renameGroup,
  TASK_FILE_RE,
};
