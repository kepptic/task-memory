// Simple translation system - English only
const translations = {
  // Page title
  "page.title": "Task Memory",

  // Header
  "header.title": "📋 Task Manager",
  "header.renameProject": "Rename project",
  "header.deleteProject": "Remove project from list",
  "header.folder": "Folder",
  "header.newTask": "Task",
  "header.archives": "Archives",
  "header.columns": "Columns",

  // Filters
  "filters.tags": "Tags:",
  "filters.category": "Category:",
  "filters.user": "User:",
  "filters.priority": "Priority:",
  "filters.select": "Select...",
  "filters.add": "+",
  "filters.clearAll": "✕ Clear all",
  "filters.search": "Search in tasks...",
  "filters.searchClear": "✕",

  // Welcome screen
  "welcome.title": "Welcome! 👋",
  "welcome.description":
    "Select the folder containing your Markdown files (kanban.md and archive.md)",
  "welcome.start": "📁 Get Started",
  "welcome.howItWorks": "💡 How does it work?",
  "welcome.step1": 'Click "Get Started" above',
  "welcome.step2": "Select the folder containing your Markdown files",
  "welcome.step3": "The app automatically loads kanban.md",
  "welcome.step4": "Manage your tasks visually with Kanban",
  "welcome.step5": "Changes are saved to Markdown files",
  "welcome.browserWarning":
    "⚠️ Supported browsers: Chrome 86+, Edge 86+, Opera 72+",

  // Task detail modal
  "taskDetail.title": "Task Details",
  "taskDetail.close": "Close",
  "taskDetail.delete": "Delete",
  "taskDetail.archive": "Archive",
  "taskDetail.edit": "Edit",

  // Task form modal
  "taskForm.newTask": "New Task",
  "taskForm.editTask": "Edit Task",
  "taskForm.titleLabel": "Title *",
  "taskForm.columnLabel": "Status *",
  "taskForm.priorityLabel": "Priority",
  "taskForm.priorityNone": "None",
  "taskForm.priorityCritical": "Critical",
  "taskForm.priorityHigh": "High",
  "taskForm.priorityMedium": "Medium",
  "taskForm.priorityLow": "Low",
  "taskForm.categoryLabel": "Category",
  "taskForm.categoryPlaceholder": "Frontend, Backend...",
  "taskForm.assignedLabel": "Assigned to",
  "taskForm.assignedPlaceholder": "@alice",
  "taskForm.createdLabel": "Created",
  "taskForm.startedLabel": "Started",
  "taskForm.dueLabel": "Due",
  "taskForm.completedLabel": "Completed",
  "taskForm.tagsLabel": "Tags",
  "taskForm.tagsPlaceholder": "#bug #feature",
  "taskForm.tagsHelp": "Separate with spaces",
  "taskForm.descriptionLabel": "Description",
  "taskForm.subtasksLabel": "Subtasks",
  "taskForm.subtaskPlaceholder": "Add a subtask...",
  "taskForm.subtaskAdd": "+ Add",
  "taskForm.notesLabel": "Notes",
  "taskForm.notesPlaceholder": "Technical notes, results, decisions, etc...",
  "taskForm.notesHelp":
    "Markdown supported: **bold**, *italic*, `code`, lists, links, **Subsections**:",
  "taskForm.cancel": "Cancel",
  "taskForm.create": "Create",
  "taskForm.save": "Save",

  // Columns modal
  "columns.title": "Manage Columns",
  "columns.add": "+ Add Column",

  // Archives modal
  "archives.title": "📦 Archives",
  "archives.search": "Search in archives...",
  "archives.empty": "No archived tasks",

  // Project selector
  "projects.select": "Select a project...",

  // Task metadata in detail modal
  "meta.priority": "Priority",
  "meta.status": "Status",
  "meta.category": "Category",
  "meta.assigned": "Assigned to",
  "meta.created": "Creation date",
  "meta.started": "Start date",
  "meta.due": "Due date",
  "meta.completed": "Completion date",
  "meta.tags": "Tags",
  "meta.description": "Description",
  "meta.subtasks": "Subtasks ({completed}/{total})",
  "meta.notes": "Notes",

  // Empty states
  "empty.noTasks": "No tasks",

  // Buttons and actions
  "action.restore": "Restore",
  "action.delete": "Delete",
  "action.edit": "Edit",
  "action.moveUp": "Move up",
  "action.moveDown": "Move down",

  // Tooltips
  "tooltip.filterByCategory": "Filter by this category",
  "tooltip.filterByUser": "Filter by this user",
  "tooltip.filterByTag": "Filter by this tag",
  "tooltip.filterByPriority": "Filter by this priority",
  "tooltip.doubleClickEdit": "Double-click to edit",
  "tooltip.delete": "Delete",

  // Notifications
  "notif.folderLoaded": "Folder loaded successfully!",
  "notif.folderError": "Error loading folder",
  "notif.initializingFolder": "Initializing folder...",
  "notif.filesInitialized":
    "Files initialized successfully! (kanban.md and archive.md)",
  "notif.filesError": "Error creating files",
  "notif.projectLoaded": 'Project "{name}" loaded',
  "notif.permissionDenied": "Permission denied for this project",
  "notif.projectError": "Error switching project",
  "notif.projectRenamed": "Project renamed successfully",
  "notif.projectDeleted": "Project removed from list",
  "notif.renameError": "Error renaming",
  "notif.projectRestored": "Project restored automatically",
  "notif.taskMoved": "Task moved!",
  "notif.taskEdited": "Task {id} updated!",
  "notif.taskCreated": "Task {id} created!",
  "notif.taskArchived": "Task archived!",
  "notif.taskDeleted": "Task permanently deleted",
  "notif.taskRestored": "Task restored to its original column!",

  // Prompts and confirmations
  "prompt.projectName": 'Project name (leave empty to use "{name}"):',
  "prompt.renameProject": "New project name:",
  "prompt.columnName": "Column name:",
  "prompt.columnId": "Column ID (e.g., todo, done):",
  "prompt.editSubtask": "Edit subtask:",
  "confirm.deleteColumn": "Delete this column?",
  "confirm.deleteSubtask": "Delete this subtask?",
  "confirm.deleteProject":
    'Remove project "{name}" from the recent list?\n\nThis only removes it from the dropdown - your files will not be deleted.',
  "confirm.archiveTask": 'Archive task "{title}"?',
  "confirm.deleteTask":
    '⚠️ WARNING: Permanently delete task "{title}"?\n\nThis action cannot be undone.',
  "confirm.deleteTaskFromArchive":
    '⚠️ WARNING: Permanently delete task "{title}"?\n\nThis action cannot be undone.\n\nIf you want to keep it in history, use "Archive" instead.',

  // Alerts
  "alert.browserNotSupported":
    "Your browser does not support the File System Access API.\n\nPlease use Chrome 86+, Edge 86+ or Opera 72+.",

  // Subtasks in detail modal
  "subtask.newPlaceholder": "New subtask...",

  // Markdown generation
  "markdown.archiveTitle": "# Task Archive",
  "markdown.archiveDesc": "> Archived tasks",
  "markdown.archiveSection": "## ✅ Archives",
  "markdown.configSection": "## ⚙️ Configuration",
  "markdown.configColumns": "**Columns**:",
  "markdown.configCategories": "**Categories**:",
  "markdown.configUsers": "**Users**:",
  "markdown.configPriorities": "**Priorities**:",
  "markdown.configTags": "**Tags**:",
};

const priorityIconClasses = {
  // Color circles
  "🟢": "Green",
  "🟡": "Yellow",
  "🟠": "Orange",
  "🔴": "Red",
  "🔵": "Blue",
  "🟣": "Purple",
  "⚪": "White",
  "⚫": "Black",
  // Hearts
  "❤️": "Red",
  "🧡": "Orange",
  "💛": "Yellow",
  "💚": "Green",
  "💙": "Blue",
  "💜": "Purple",
  "🤍": "White",
  "🖤": "Black",
  // Squares
  "🟥": "Red",
  "🟧": "Orange",
  "🟨": "Yellow",
  "🟩": "Green",
  "🟦": "Blue",
  "🟪": "Purple",
  // Diamonds
  "🔶": "Orange",
  "🔷": "Blue",
  "🔸": "Orange",
  "🔹": "Blue",
  // Stars
  "⭐": "Yellow",
  "🌟": "Yellow",
  // Flags
  "🚩": "Red",
  "🏴": "Black",
  "🏳️": "White",
  // Alert symbols
  "⚠️": "Yellow",
  "🔥": "Orange",
  "💥": "Red",
  "⚡": "Yellow",
  // Arrows
  "⬆️": "Red",
  "➡️": "Blue",
  "⬇️": "Green",
  // Exclamation/Question
  "❗": "Red",
  "❓": "Blue",
  "❕": "Red",
  "❔": "Blue",
};

// Simple translation function
function t(key, params = {}) {
  let text = translations[key] || key;

  // Replace placeholders with parameters
  Object.keys(params).forEach((param) => {
    text = text.replace(new RegExp(`\\{${param}\\}`, "g"), params[param]);
  });

  return text;
}

// Export for use in other modules
export const translationSystem = {
  t,
  setLanguage: () => {}, // No-op
  initLanguage: () => {}, // No-op
  getCurrentLanguage: () => "en",
  priorityIconClasses,
};

export { t, priorityIconClasses };
