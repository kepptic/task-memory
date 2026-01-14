// File System Access API module
// Handles all directory and file operations

// IndexedDB configuration for storing recent projects
const DB_NAME = "TaskManagerDB";
const DB_VERSION = 3; // Bumped for taskFileName support
const STORE_NAME = "settings";
const PROJECTS_KEY = "recentProjects";
const MAX_RECENT_PROJECTS = 10;

// Supported task file names in priority order
const TASK_FILE_NAMES = ['tasks.md', 'kanban.md'];
const DEFAULT_TASK_FILE = 'tasks.md';

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
async function saveDirectoryHandle(handle, customName = null, taskFileName = null) {
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
      projects.unshift(project);
    } else {
      // Add new project at the beginning
      projects.unshift({
        name: projectName,
        displayName: projectDisplayName,
        handle: handle,
        taskFileName: taskFileName || DEFAULT_TASK_FILE,
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
function generateInitialTaskFile() {
  return `# Task Board

<!-- Config: Last Task ID: 0 -->

## ⚙️ Configuration

**Columns**:
- **To Do** (todo)
- **In Progress** (in-progress)
- **Done** (done)

**Categories**: Frontend, Backend, Design, Documentation
**Users**: @alice, @bob, @charlie
**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
**Tags**: #bug, #feature, #enhancement, #documentation

## 📝 To Do

## 🚧 In Progress

## ✅ Done
`;
}

// Detect which task files exist in the directory
async function detectTaskFile(dirHandle) {
  const result = {
    found: null,
    legacy: null,
    available: []
  };

  for (const fileName of TASK_FILE_NAMES) {
    try {
      await dirHandle.getFileHandle(fileName);
      result.available.push(fileName);
      if (!result.found) {
        result.found = fileName;
      }
      if (fileName === 'kanban.md') {
        result.legacy = fileName;
      }
    } catch (e) {
      // File doesn't exist, continue
    }
  }

  return result;
}

// Load task file (supports both tasks.md and kanban.md)
async function loadTaskFile(dirHandle, preferredFileName = null) {
  // If a preferred file is specified, try it first
  if (preferredFileName) {
    try {
      kanbanFileHandle = await dirHandle.getFileHandle(preferredFileName);
      const file = await kanbanFileHandle.getFile();
      const content = await file.text();
      console.log(`Task file "${preferredFileName}" loaded, size:`, content.length);
      return {
        fileHandle: kanbanFileHandle,
        content,
        fileName: preferredFileName,
        isLegacy: preferredFileName === 'kanban.md'
      };
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        throw error;
      }
      // Preferred file not found, fall through to detection
      console.log(`Preferred file "${preferredFileName}" not found, detecting...`);
    }
  }

  // Detect existing files
  const detection = await detectTaskFile(dirHandle);

  if (detection.found) {
    kanbanFileHandle = await dirHandle.getFileHandle(detection.found);
    const file = await kanbanFileHandle.getFile();
    const content = await file.text();
    console.log(`Task file "${detection.found}" loaded, size:`, content.length);
    return {
      fileHandle: kanbanFileHandle,
      content,
      fileName: detection.found,
      isLegacy: detection.found === 'kanban.md',
      hasLegacy: detection.legacy !== null,
      available: detection.available
    };
  }

  // No file found, create new tasks.md
  console.log('No task file found, creating tasks.md');
  const initialContent = generateInitialTaskFile();
  kanbanFileHandle = await dirHandle.getFileHandle(DEFAULT_TASK_FILE, { create: true });
  await saveToFile(kanbanFileHandle, initialContent);
  return {
    fileHandle: kanbanFileHandle,
    content: initialContent,
    fileName: DEFAULT_TASK_FILE,
    isLegacy: false,
    isNew: true,
    available: [DEFAULT_TASK_FILE]
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
  migrateKanbanToTasks,
  updateProjectTaskFile,
  loadArchiveFile,
  saveKanbanFile,
  saveArchiveFile,
  deleteProjectFromRecents,
  renameProject,
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
  migrateKanbanToTasks,
  updateProjectTaskFile,
  loadArchiveFile,
  saveKanbanFile,
  saveArchiveFile,
  deleteProjectFromRecents,
  renameProject,
};
