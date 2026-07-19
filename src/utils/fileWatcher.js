// File watcher module
// Handles auto-save and external change detection with content hash comparison

// Debounce timer for auto-save
let autoSaveTimer = null;

// Track when we last saved (to ignore our own changes)
let lastSaveTimestamp = 0;

// Flag to prevent saving during external updates
let isApplyingExternalChanges = false;

// File watcher interval
let fileWatcherInterval = null;
let lastCheckedModified = 0;

// Current content for comparison
let currentKanbanContent = "";

// Content hash for reliable change detection
let currentContentHash = null;

// Callbacks for notifications
let notificationCallbacks = {};

// Compute SHA-256 hash of content
async function computeHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Actual save function (called by debounced autoSave)
async function performSave(fileHandle, content) {
  if (!fileHandle) return;

  // Don't save while applying external changes
  if (isApplyingExternalChanges) {
    console.log('⏳ Skipping save - applying external changes');
    return false;
  }

  try {
    // Mark that we're saving (for dev server reload detection)
    sessionStorage.setItem("justSaved", Date.now().toString());

    const writable = await fileHandle.createWritable();

    await writable.write(content);

    await writable.close();

    currentKanbanContent = content;
    currentContentHash = await computeHash(content);

    // Update last save timestamp to ignore this change in file watcher
    lastSaveTimestamp = Date.now();

    // Clear the flag after a short delay
    setTimeout(() => {
      sessionStorage.removeItem("justSaved");
    }, 500);

    return true;
  } catch (error) {
    console.error("❌ Save failed:", error);
    sessionStorage.removeItem("justSaved");
    return false;
  }
}

// Debounced auto-save function
// Waits 500ms after last change before actually saving
function autoSave(fileHandle, generateContent) {
  if (!fileHandle) return;

  // Don't save while applying external changes
  if (isApplyingExternalChanges) {
    return;
  }

  // Clear any existing timer
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  } else {
    console.log("🔵 AutoSave scheduled...");
  }

  // Schedule save for 500ms from now
  autoSaveTimer = setTimeout(async () => {
    autoSaveTimer = null;

    // Double-check flag before actually saving
    if (isApplyingExternalChanges) {
      console.log('⏳ AutoSave cancelled - external changes in progress');
      return;
    }

    const content = generateContent();
    await performSave(fileHandle, content);
  }, 500);
}

// Detect which components changed between old and new task lists
function detectChangedComponents(oldTasks, newTasks) {
  const changes = {
    addedTasks: [],
    removedTasks: [],
    movedTasks: [],
    updatedTasks: [],
    hasChanges: false,
  };

  // Create maps for quick lookup
  const oldTasksMap = new Map(oldTasks.map((t) => [t.id, t]));
  const newTasksMap = new Map(newTasks.map((t) => [t.id, t]));

  // Find tasks that were removed (in old but not in new)
  for (const oldTask of oldTasks) {
    if (!newTasksMap.has(oldTask.id)) {
      changes.removedTasks.push(oldTask);
    }
  }

  // Find tasks that were added or modified (in new)
  for (const newTask of newTasks) {
    const oldTask = oldTasksMap.get(newTask.id);

    if (!oldTask) {
      // Task was added
      changes.addedTasks.push(newTask);
    } else {
      // Task exists, check if it changed
      const statusChanged = oldTask.status !== newTask.status;
      const contentChanged =
        JSON.stringify(oldTask) !== JSON.stringify(newTask);

      if (statusChanged) {
        changes.movedTasks.push({ task: newTask, fromStatus: oldTask.status });
      } else if (contentChanged) {
        changes.updatedTasks.push({ oldTask, newTask });
      }
    }
  }

  changes.hasChanges =
    changes.addedTasks.length > 0 ||
    changes.removedTasks.length > 0 ||
    changes.movedTasks.length > 0 ||
    changes.updatedTasks.length > 0;

  return changes;
}

// Smart update function that only modifies changed tasks
function applyExternalChanges(oldTasks, newTasks, callbacks) {
  const changes = detectChangedComponents(oldTasks, newTasks);

  // Apply removed tasks
  for (const task of changes.removedTasks) {
    if (callbacks.onTaskRemoved) {
      callbacks.onTaskRemoved(task);
    }
  }

  // Apply added tasks
  for (const task of changes.addedTasks) {
    if (callbacks.onTaskAdded) {
      callbacks.onTaskAdded(task);
    }
  }

  // Apply moved tasks
  for (const { task, fromStatus } of changes.movedTasks) {
    if (callbacks.onTaskMoved) {
      callbacks.onTaskMoved(task, fromStatus);
    }
  }

  // Apply updated tasks
  for (const { newTask } of changes.updatedTasks) {
    if (callbacks.onTaskUpdated) {
      callbacks.onTaskUpdated(newTask);
    }
  }

  // Auto-reorganize: If any task moved due to Status field change, save to reorganize the .md file
  if (changes.movedTasks.length > 0 && callbacks.onReorganizeNeeded) {
    setTimeout(() => {
      callbacks.onReorganizeNeeded();
    }, 500); // Small delay to avoid rapid saves
  }

  return {
    addedCount: changes.addedTasks.length,
    removedCount: changes.removedTasks.length,
    movedCount: changes.movedTasks.length,
    updatedCount: changes.updatedTasks.length,
  };
}

// Check for external changes to the file using content hash
async function checkForExternalChanges(fileHandle, callbacks) {
  if (!fileHandle) return;

  try {
    // Get the current file
    const file = await fileHandle.getFile();
    const fileModified = file.lastModified;

    // Initialize on first check
    if (lastCheckedModified === 0) {
      lastCheckedModified = fileModified;
      const content = await file.text();
      currentContentHash = await computeHash(content);
      return;
    }

    // Quick timestamp check first (optimization)
    if (fileModified <= lastCheckedModified) {
      return; // No change
    }

    // File timestamp changed! Check if it was us or external
    const timeSinceOurSave = Date.now() - lastSaveTimestamp;

    // If we saved within the last 1.5 seconds, ignore (it's our change)
    if (timeSinceOurSave < 1500) {
      lastCheckedModified = fileModified;
      return;
    }

    // Timestamp changed - verify with content hash
    const newContent = await file.text();
    const newHash = await computeHash(newContent);

    // If hash matches, it's just metadata change (no real content change)
    if (newHash === currentContentHash) {
      lastCheckedModified = fileModified;
      return;
    }

    // Real external change detected!
    console.log("📥 External change detected via hash comparison");

    // Set flag to prevent saving during updates
    isApplyingExternalChanges = true;

    try {
      // Notify user of external change
      if (notificationCallbacks.onExternalChangeDetected) {
        notificationCallbacks.onExternalChangeDetected();
      }

      currentKanbanContent = newContent;
      currentContentHash = newHash;

      if (callbacks.onExternalChange) {
        callbacks.onExternalChange(newContent);
      }
    } finally {
      // Clear flag after updates complete (with small delay to allow React updates)
      setTimeout(() => {
        isApplyingExternalChanges = false;
      }, 100);
    }

    lastCheckedModified = fileModified;
  } catch (error) {
    console.error("❌ Error checking for file changes:", error);
  }
}

// Start file watcher
// Always (re)binds to the given fileHandle/callbacks. If a watcher is
// already running (e.g. the user switched task files), the previous
// interval is cleared first so we never end up polling a stale handle
// or leaking a second interval (TASK-018).
function startFileWatcher(fileHandle, callbacks) {
  if (fileWatcherInterval) {
    clearInterval(fileWatcherInterval);
    fileWatcherInterval = null;
  }

  // Reset modified-time tracking so the new handle gets a clean baseline
  // on its first poll instead of comparing against the previous file's
  // lastModified timestamp.
  lastCheckedModified = 0;

  console.log("👁️ Starting file watcher (checking every 2 seconds)...");
  fileWatcherInterval = setInterval(() => {
    // Returning the promise is a no-op for the real browser/Node timer
    // (setInterval ignores callback return values) but lets tests that
    // stub setInterval await a "tick" and observe the poll actually
    // completing, instead of racing its internal awaits.
    return checkForExternalChanges(fileHandle, callbacks);
  }, 2000);
}

// Stop file watcher
function stopFileWatcher() {
  if (fileWatcherInterval) {
    clearInterval(fileWatcherInterval);
    fileWatcherInterval = null;
  }
}

// Set current content (for comparison)
async function setCurrentContent(content) {
  currentKanbanContent = content;
  currentContentHash = await computeHash(content);
}

// Get current content
function getCurrentContent() {
  return currentKanbanContent;
}

// Check if currently applying external changes
function isApplyingChanges() {
  return isApplyingExternalChanges;
}

// Set notification callbacks
function setNotificationCallbacks(callbacks) {
  notificationCallbacks = callbacks;
}

// Reset state (for testing or re-initialization)
function resetState() {
  lastSaveTimestamp = 0;
  lastCheckedModified = 0;
  currentKanbanContent = "";
  currentContentHash = null;
  isApplyingExternalChanges = false;
}

// Export for use in other modules
export const fileWatcher = {
  performSave,
  autoSave,
  applyExternalChanges,
  detectChangedComponents,
  startFileWatcher,
  stopFileWatcher,
  setCurrentContent,
  getCurrentContent,
  isApplyingChanges,
  setNotificationCallbacks,
  resetState,
};

export {
  performSave,
  autoSave,
  applyExternalChanges,
  detectChangedComponents,
  startFileWatcher,
  stopFileWatcher,
  setCurrentContent,
  getCurrentContent,
  isApplyingChanges,
  setNotificationCallbacks,
  resetState,
};
