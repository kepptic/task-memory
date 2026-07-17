// Markdown parsing and generation module
// Handles conversion between markdown format and task objects
import DOMPurify from "dompurify";
import { TASK_ID_CORE, CONFIG_HEADER_RE, resolvePrefix, serializeConfigHeader } from "./taskId.js";

// Parse markdown content into tasks and config
// `opts.fileName` is used ONLY as the fallback source for prefix derivation
// when the `Task Prefix:` header field is entirely absent (see resolvePrefix).
function parseMarkdown(content, opts = {}) {
  const tasks = [];
  const config = {
    lastTaskId: 0,
    taskPrefix: '',
    columns: [],
    categories: [],
    users: [],
    priorities: [],
    tags: [],
  };

  // Parse config comment (TASK-017: counter moved from g1 -> g2 now that the
  // prefix field occupies g1; field-absent (g1 === undefined) is the ONLY
  // case that consults opts.fileName, per Q2).
  const configMatch = content.match(CONFIG_HEADER_RE);
  if (configMatch) {
    config.lastTaskId = parseInt(configMatch[2], 10);
    const { prefix, warning } = resolvePrefix(configMatch[1], opts.fileName);
    config.taskPrefix = prefix;
    if (warning) console.warn(warning);
  }

  // Parse config section
  const configSection = content.match(
    /## ⚙️ Configuration\s+([\s\S]*?)(?:---|$)/,
  );
  if (configSection) {
    const configText = configSection[1];

    // Parse columns - supports both "Name (id)" and just "Name" formats
    const columnsMatch = configText.match(/\*\*Columns\*\*:\s*(.+)/);
    if (columnsMatch) {
      config.columns = columnsMatch[1]
        .split("|")
        .map((col) => {
          const trimmed = col.trim();
          // Try to match "Name (id)" format first
          const match = trimmed.match(/(.+?)\s*\((.+?)\)/);
          if (match) {
            const displayName = match[1].trim();
            const explicitId = match[2].trim();
            return {
              name: displayName,
              id: explicitId,
              originalHeader: displayName, // Store for round-trip preservation
            };
          }
          // Fallback: derive canonical ID from name
          if (trimmed) {
            const canonicalId = deriveColumnId(trimmed);
            return {
              name: trimmed,
              id: canonicalId,
              originalHeader: trimmed, // Store for round-trip preservation
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    // Parse categories
    const categoriesMatch = configText.match(/\*\*Categories\*\*:\s*(.+)/);
    if (categoriesMatch) {
      config.categories = categoriesMatch[1]
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    }

    // Parse users
    const usersMatch = configText.match(/\*\*Users\*\*:\s*(.+)/);
    if (usersMatch) {
      config.users = usersMatch[1]
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
    }

    // Parse priorities
    const prioritiesMatch = configText.match(/\*\*Priorities\*\*:\s*(.+)/);
    if (prioritiesMatch) {
      config.priorities = prioritiesMatch[1]
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
    }

    // Parse tags
    const tagsMatch = configText.match(/\*\*Tags\*\*:\s*(.+)/);
    if (tagsMatch) {
      config.tags = tagsMatch[1]
        .split(/\s+/)
        .filter((t) => t.startsWith("#"))
        .map((t) => t.replace("#", ""));
    }
  }

  // Default columns if not found
  // These defaults match the generateInitialTaskFile() template in fileSystem.js
  if (config.columns.length === 0) {
    config.columns = [
      { name: "📝 To Do", id: "todo", originalHeader: "📝 To Do" },
      { name: "🚀 In Progress", id: "in-progress", originalHeader: "🚀 In Progress" },
      { name: "👀 In Review", id: "in-review", originalHeader: "👀 In Review" },
      { name: "✅ Done", id: "done", originalHeader: "✅ Done" },
    ];
  }

  // Default categories if not found
  if (config.categories.length === 0) {
    config.categories = [
      "Frontend",
      "Backend",
      "Design",
      "DevOps",
      "Tests",
      "Documentation",
    ];
  }

  // Default users if not found
  if (config.users.length === 0) {
    config.users = ["@user (User)"];
  }

  // Default priorities if not found
  if (config.priorities.length === 0) {
    config.priorities = ["🔴 Critical", "🟠 High", "🟡 Medium", "🟢 Low"];
  }

  // Default tags if not found
  if (config.tags.length === 0) {
    config.tags = [
      "bug",
      "feature",
      "ui",
      "backend",
      "urgent",
      "refactor",
      "docs",
      "test",
    ];
  }

  // Detect all section headers in the file (for finding orphaned tasks)
  const sectionHeaderRegex = /^##\s+(?!⚙️\s*Configuration)(.+)$/gm;
  const allSections = [];
  let match;

  while ((match = sectionHeaderRegex.exec(content)) !== null) {
    const sectionName = match[1].trim();
    if (sectionName === "---") continue;

    // Derive canonical ID from name using the shared function
    const sectionId = deriveColumnId(sectionName);

    allSections.push({ name: sectionName, id: sectionId });
  }

  // Parse tasks from configured columns
  console.log('📊 Parsing tasks from columns:', config.columns.map(c => `${c.name}(${c.id})`).join(', '));
  config.columns.forEach((column) => {
    const columnTasks = parseTasksFromSection(content, column.name, column.id);
    console.log(`📋 Column "${column.name}" (id: ${column.id}): found ${columnTasks.length} tasks`);
    tasks.push(...columnTasks);
  });

  // Find and rescue orphaned tasks (from sections not in config.columns)
  const defaultColumn = config.columns[0]?.id || "todo";
  allSections.forEach((section) => {
    // Use canonical ID comparison for matching
    const sectionCanonicalId = deriveColumnId(section.name);
    const isConfigured = config.columns.some(
      (col) => col.id === sectionCanonicalId || deriveColumnId(col.name) === sectionCanonicalId
    );
    if (!isConfigured) {
      // Parse tasks from this orphaned section and move them to default column
      const orphanedTasks = parseTasksFromSection(content, section.name, section.id);
      orphanedTasks.forEach((task) => {
        task.status = defaultColumn; // Move to first column
        task._wasOrphaned = true; // Mark for potential notification
        console.log(`🔄 Rescued orphaned task ${task.id} from "${section.name}" to "${defaultColumn}"`);
      });
      tasks.push(...orphanedTasks);
    }
  });

  return { tasks, config };
}

// Strip emojis and normalize text for comparison
function normalizeForComparison(text) {
  // Remove emojis, special symbols, and extra whitespace
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/gu, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Derive a canonical column ID from a display name.
 * This is the SINGLE SOURCE OF TRUTH for ID derivation.
 * Used for: column config parsing, section header matching, task status comparison
 *
 * Examples:
 *   "📝 To Do" → "to-do"
 *   "To Do" → "to-do"
 *   "🚀 In Progress" → "in-progress"
 *   "In Progress" → "in-progress"
 *   "✅ Done" → "done"
 */
function deriveColumnId(name) {
  if (!name) return 'column';

  return name
    // Remove ALL emoji ranges (comprehensive)
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}-\u{2B55}]|[\u{231A}-\u{231B}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]/gu, '')
    // Remove other special characters (keep letters, numbers, whitespace, hyphens)
    .replace(/[^\w\s-]/g, '')
    // Trim and lowercase
    .trim()
    .toLowerCase()
    // Replace whitespace with hyphens
    .replace(/\s+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Collapse multiple hyphens
    .replace(/-+/g, '-')
    // Fallback if empty
    || 'column';
}

// Shared anchored task-heading iterator (TASK-017). Replaces the old
// `split(/###\s+TASK-/)` approach, which (a) could split mid-line on any
// literal "### TASK-" substring appearing inside a description/notes body,
// and (b) silently dropped prefixed ids (`TASK-GR-678` never matched
// `/^(\d+)$/`). Anchored to line starts (`^###`, MULTILINE) and bounded by
// TASK_ID_CORE's tail lookahead, so `TASK-GR-12X` is correctly not a task
// heading. IDs are returned VERBATIM — never re-padded (a hand-written
// `TASK-5` round-trips as `TASK-5`, not `TASK-005`). Used by both
// parseTasksFromSection and parseArchive so this logic lives in one place.
function iterTaskHeadingBlocks(sectionContent) {
  const headingRe = new RegExp('^###[ \\t]+(' + TASK_ID_CORE + ')[ \\t]*\\|[ \\t]*(.+)$', 'gm');
  const matches = [...sectionContent.matchAll(headingRe)];
  return matches.map((m, i) => {
    const blockStart = m.index + m[0].length;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index : sectionContent.length;
    return {
      id: m[1],
      title: m[2].trim(),
      body: sectionContent.slice(blockStart, blockEnd),
    };
  });
}

// Parse tasks from a markdown section (reusable for both kanban and archive)
function parseTasksFromSection(content, sectionName, statusId) {
  const tasksFound = [];

  // Split by ## to get sections
  const sections = content.split(/\n##\s+/);
  let sectionContent = null;

  // Derive canonical ID for the section we're looking for
  const targetCanonicalId = deriveColumnId(sectionName);

  for (let section of sections) {
    // Get the first line (section header)
    const newlineIndex = section.indexOf('\n');
    const headerLine = newlineIndex > 0 ? section.substring(0, newlineIndex) : section;

    // Derive canonical ID for this header
    const headerCanonicalId = deriveColumnId(headerLine);

    // STRICT MATCH: Only match if canonical IDs are exactly equal
    // This prevents "To Do" from matching "Done" (which was happening with includes())
    if (headerCanonicalId === targetCanonicalId) {
      // Extract content after the section title (first line)
      sectionContent = newlineIndex > 0 ? section.substring(newlineIndex).trim() : '';
      break;
    }
  }

  if (!sectionContent) {
    return tasksFound;
  }

  iterTaskHeadingBlocks(sectionContent).forEach(({ id, title, body }) => {
    if (!title) return;
    const task = parseTask(id, title, body, statusId);
    if (task) {
      tasksFound.push(task);
    }
  });

  return tasksFound;
}

// Parse individual task
function parseTask(id, title, content, status) {
  const task = {
    id,
    title: title.trim(),
    status,
    priority: "",
    category: "",
    workflow: "",      // NEW: Feature, Refactor, Investigation, Migration, Simple
    complexity: "",    // NEW: Simple, Standard, Complex
    assignees: [],
    tags: [],
    created: "",
    started: "",
    due: "",
    completed: "",
    description: "",
    subtasks: [],
    preWorkChecklist: [], // NEW: Pre-implementation checklist items
    notes: "",
    visualOpsLog: [],
    errorsLog: [],
  };

  // Parse metadata line - now with Status field support
  const metaMatch = content.match(/\*\*Priority\*\*:\s*([^|]+)/);
  if (metaMatch) {
    task.priority = metaMatch[1].trim();
  }

  const categoryMatch = content.match(/\*\*Category\*\*:\s*([^|]+)/);
  if (categoryMatch) {
    task.category = categoryMatch[1].trim();
  }

  // NEW: Parse Workflow type
  const workflowMatch = content.match(/\*\*Workflow\*\*:\s*(\S+)/);
  if (workflowMatch) {
    task.workflow = workflowMatch[1].trim();
  }

  // NEW: Parse Complexity level
  const complexityMatch = content.match(/\*\*Complexity\*\*:\s*(\S+)/);
  if (complexityMatch) {
    task.complexity = complexityMatch[1].trim();
  }

  const assignedMatch = content.match(/\*\*Assigned\*\*:\s*(.+?)(?:\s*\||$)/m);
  if (assignedMatch) {
    task.assignees = assignedMatch[1].split(",").map((a) => a.trim());
  }

  // Parse dates - support all date fields
  const createdMatch = content.match(/\*\*Created\*\*:\s*([\d-]+)/);
  if (createdMatch) task.created = createdMatch[1];

  const startedMatch = content.match(/\*\*Started\*\*:\s*([\d-]+)/);
  if (startedMatch) task.started = startedMatch[1];

  const dueMatch = content.match(/\*\*Due\*\*:\s*([\d-]+)/);
  if (dueMatch) task.due = dueMatch[1];

  const completedMatch = content.match(/\*\*Finished\*\*:\s*([\d-]+)/);
  if (completedMatch) task.completed = completedMatch[1];

  // Parse Status field - if present, it's authoritative (overrides section)
  const statusMatch = content.match(/\*\*Status\*\*:\s*(\S+)/i);
  if (statusMatch) {
    // Accept any status value - it will be used to move the task to the correct section
    const parsedStatus = statusMatch[1].toLowerCase().trim();

    console.log(
      `🔍 Task ${id}: current section='${status}', parsed Status field='${parsedStatus}'`,
    );

    // If the status doesn't match the section we're in, mark it for reorganization
    if (parsedStatus !== status) {
      console.log(
        `✨ Task ${id} marked for reorganization: will move from '${status}' to '${parsedStatus}'`,
      );
      task._needsReorganization = true;
      task.status = parsedStatus; // Use the parsed status
    } else {
      console.log(`✓ Task ${id} already in correct section '${status}'`);
    }
  }

  // Parse tags
  const tagsMatch = content.match(/\*\*Tags\*\*:\s*(.+)/);
  if (tagsMatch) {
    task.tags = tagsMatch[1].match(/#[\w-]+/g) || [];
  }

  // Parse description (text after dates/tags but before "**Sous-tâches**" or "**Notes**")
  const lines = content.split("\n");
  let descriptionLines = [];
  let inDescription = false;

  for (let line of lines) {
    // Skip metadata lines
    if (
      line.match(
        /^\*\*(Priority|Category|Assigned|Created|Started|Due|Finished|Tags|Status|Workflow|Complexity)\*\*/,
      )
    ) {
      continue;
    }
    // Stop at subsections
    if (line.match(/^\*\*(Subtasks|Notes|Links|Review|Dependencies)\*\*/)) {
      break;
    }
    // Collect description lines
    if (line.trim() && !inDescription) {
      inDescription = true;
    }
    if (inDescription && line.trim()) {
      descriptionLines.push(line.trim());
    }
  }
  // Keep full description with line breaks preserved for markdown rendering
  task.description = descriptionLines.join("\n");

  // Parse Pre-Work Checklist (before Subtasks section)
  const preWorkMatch = content.match(/\*\*Pre-Work Checklist\*\*:\s*\n([\s\S]*?)(?=\*\*Subtasks\*\*:|\*\*Notes\*\*:|$)/);
  if (preWorkMatch) {
    const preWorkItems = preWorkMatch[1].matchAll(/- \[(x| )\] (.+)/g);
    for (const match of preWorkItems) {
      task.preWorkChecklist.push({
        completed: match[1] === "x",
        text: match[2].trim(),
      });
    }
  }

  // Parse subtasks - only from Subtasks section to avoid mixing with Pre-Work Checklist
  const subtasksMatch = content.match(/\*\*Subtasks\*\*:\s*\n([\s\S]*?)(?=\*\*Pre-Work Checklist\*\*:|\*\*Notes\*\*:|\*\*Visual Operations Log\*\*:|$)/);
  if (subtasksMatch) {
    const subtaskMatches = subtasksMatch[1].matchAll(/- \[(x| )\] (.+)/g);
    for (const match of subtaskMatches) {
      task.subtasks.push({
        completed: match[1] === "x",
        text: match[2].trim(),
      });
    }
  } else {
    // Fallback: parse all checklist items if no Subtasks section header
    const subtaskMatches = content.matchAll(/- \[(x| )\] (.+)/g);
    for (const match of subtaskMatches) {
      // Skip if it looks like a pre-work item
      const text = match[2].trim();
      if (!text.match(/^(Read relevant|Searched for|Identified patterns|Reviewed known)/i)) {
        task.subtasks.push({
          completed: match[1] === "x",
          text: text,
        });
      }
    }
  }

  // Parse notes - everything after **Notes**: until Visual Operations Log, Errors Log, or end
  const notesMatch = content.match(/\*\*Notes\*\*:\s*\n([\s\S]*?)(?=\*\*Visual Operations Log\*\*:|\*\*Errors Log\*\*:|$)/);
  if (notesMatch) {
    task.notes = notesMatch[1].trim();
  }

  // Parse Visual Operations Log
  const opsLogMatch = content.match(/\*\*Visual Operations Log\*\*:\s*\n([\s\S]*?)(?=\*\*Errors Log\*\*:|---\s*$|$)/);
  if (opsLogMatch) {
    const logLines = opsLogMatch[1].trim().split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
    task.visualOpsLog = logLines;
  }

  // Parse Errors Log
  const errorsLogMatch = content.match(/\*\*Errors Log\*\*:\s*\n?([\s\S]*?)(?=###|---\s*$|$)/);
  if (errorsLogMatch) {
    const errorLines = errorsLogMatch[1].trim().split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
    task.errorsLog = errorLines;
  }

  return task;
}

// Parse archived tasks from archive.md
function parseArchive(content) {
  const archivedTasks = [];

  // Parse archived tasks section
  const archiveSection = content.match(/## ✅ Archives\s+([\s\S]*?)$/);
  if (archiveSection) {
    const archiveContent = archiveSection[1];

    iterTaskHeadingBlocks(archiveContent).forEach(({ id, title, body }) => {
      if (!title) return;
      const task = parseTask(id, title, body, "archived");
      if (task) {
        archivedTasks.push(task);
      }
    });
  }

  return archivedTasks;
}

// Generate markdown from tasks and config
function generateMarkdown(tasks, config) {
  let md = `# Kanban Board\n\n${serializeConfigHeader(config.taskPrefix || '', config.lastTaskId || 0)}\n\n`;

  // Ensure config has all required arrays (defensive defaults)
  config.categories = config.categories || [];
  config.users = config.users || [];
  config.priorities = config.priorities || [];
  config.tags = config.tags || [];
  config.columns = config.columns || [];

  // Update config with values from tasks (merge with existing)
  const allCategories = new Set(config.categories);
  const allUsers = new Set(config.users);
  const allTags = new Set(config.tags);

  tasks.forEach((task) => {
    if (task.category) allCategories.add(task.category);
    (task.assignees || []).forEach((u) => allUsers.add(u));
    (task.tags || []).forEach((t) => allTags.add(t.replace("#", "")));
  });

  // Update config with merged values
  config.categories = [...allCategories];
  config.users = [...allUsers];
  config.tags = [...allTags];

  // Ensure defaults exist
  if (config.categories.length === 0) {
    config.categories = [
      "Frontend",
      "Backend",
      "Design",
      "DevOps",
      "Tests",
      "Documentation",
    ];
  }
  if (config.users.length === 0) {
    config.users = ["@user (User)"];
  }
  if (config.priorities.length === 0) {
    config.priorities = ["🔴 Critical", "🟠 High", "🟡 Medium", "🟢 Low"];
  }
  if (config.tags.length === 0) {
    config.tags = [
      "bug",
      "feature",
      "ui",
      "backend",
      "urgent",
      "refactor",
      "docs",
      "test",
    ];
  }

  // Add config section
  md += `## ⚙️ Configuration\n\n`;
  md += `**Columns**: ${config.columns.map((c) => `${c.name} (${c.id})`).join(" | ")}\n\n`;
  md += `**Categories**: ${config.categories.join(", ")}\n\n`;
  md += `**Users**: ${config.users.join(", ")}\n\n`;
  md += `**Priorities**: ${config.priorities.join(" | ")}\n\n`;
  md += `**Tags**: ${config.tags.map((t) => "#" + t).join(" ")}\n\n`;
  md += `---\n\n`;

  // Add tasks by column
  config.columns.forEach((column) => {
    // Use originalHeader for round-trip preservation, fallback to name
    const sectionHeader = column.originalHeader || column.name;
    md += `## ${sectionHeader}\n\n`;

    const columnTasks = tasks.filter((t) => t.status === column.id);
    columnTasks.forEach((task) => {
      md += `### ${task.id} | ${task.title}\n`;

      let meta = "";
      if (task.priority) meta += `**Priority**: ${task.priority}`;
      if (task.category)
        meta += (meta ? " | " : "") + `**Category**: ${task.category}`;
      meta += (meta ? " | " : "") + `**Status**: ${task.status}`;
      if (task.assignees && task.assignees.length > 0)
        meta += ` | **Assigned**: ${task.assignees.join(", ")}`;
      if (meta) md += meta + "\n";

      // NEW: Workflow and Complexity on separate line
      let workflowLine = "";
      if (task.workflow) workflowLine += `**Workflow**: ${task.workflow}`;
      if (task.complexity)
        workflowLine += (workflowLine ? " | " : "") + `**Complexity**: ${task.complexity}`;
      if (workflowLine) md += workflowLine + "\n";

      // Write dates line
      let dates = "";
      if (task.created) dates += `**Created**: ${task.created}`;
      if (task.started)
        dates += (dates ? " | " : "") + `**Started**: ${task.started}`;
      if (task.due) dates += (dates ? " | " : "") + `**Due**: ${task.due}`;
      if (task.completed)
        dates += (dates ? " | " : "") + `**Finished**: ${task.completed}`;
      if (dates) md += dates + "\n";

      if (task.tags.length > 0) {
        md += `**Tags**: ${task.tags.join(" ")}\n`;
      }

      if (task.description) {
        md += `\n${task.description}\n`;
      }

      if (task.subtasks && task.subtasks.length > 0) {
        md += `\n**Subtasks**:\n`;
        task.subtasks.forEach((st) => {
          md += `- [${st.completed ? "x" : " "}] ${st.text}\n`;
        });
      }

      // NEW: Pre-Work Checklist
      if (task.preWorkChecklist && task.preWorkChecklist.length > 0) {
        md += `\n**Pre-Work Checklist**:\n`;
        task.preWorkChecklist.forEach((item) => {
          md += `- [${item.completed ? "x" : " "}] ${item.text}\n`;
        });
      }

      if (task.notes) {
        md += `\n**Notes**:\n${task.notes}\n`;
      }

      if (task.visualOpsLog && task.visualOpsLog.length > 0) {
        md += `\n**Visual Operations Log**:\n`;
        task.visualOpsLog.forEach(entry => {
          md += `- ${entry}\n`;
        });
      }

      // Always include Errors Log section (even if empty, for manual editing)
      md += `\n**Errors Log**:\n`;
      if (task.errorsLog && task.errorsLog.length > 0) {
        task.errorsLog.forEach(entry => {
          md += `- ${entry}\n`;
        });
      }

      md += `\n`; // Just one blank line between tasks
    });
    // No separator between sections - only one separator after config section
  });

  return md;
}

// Generate archive markdown
function generateArchiveMarkdown(archivedTasks) {
  let md = `# Task Archive\n\n> Archived tasks\n\n## ✅ Archives\n\n`;

  archivedTasks.forEach((task) => {
    md += `### ${task.id} | ${task.title}\n`;

    // Meta line: Priority, Category, Status, Assigned
    let meta = "";
    if (task.priority) meta += `**Priority**: ${task.priority}`;
    if (task.category)
      meta += (meta ? " | " : "") + `**Category**: ${task.category}`;
    meta += (meta ? " | " : "") + `**Status**: ${task.status || 'done'}`;
    if (task.assignees && task.assignees.length > 0)
      meta += ` | **Assigned**: ${task.assignees.join(", ")}`;
    if (meta) md += meta + "\n";

    // Workflow and Complexity line
    let workflowLine = "";
    if (task.workflow) workflowLine += `**Workflow**: ${task.workflow}`;
    if (task.complexity)
      workflowLine += (workflowLine ? " | " : "") + `**Complexity**: ${task.complexity}`;
    if (workflowLine) md += workflowLine + "\n";

    // Write dates line
    let dates = "";
    if (task.created) dates += `**Created**: ${task.created}`;
    if (task.started)
      dates += (dates ? " | " : "") + `**Started**: ${task.started}`;
    if (task.due) dates += (dates ? " | " : "") + `**Due**: ${task.due}`;
    if (task.completed)
      dates += (dates ? " | " : "") + `**Finished**: ${task.completed}`;
    if (dates) md += dates + "\n";

    if (task.tags && task.tags.length > 0) {
      md += `**Tags**: ${task.tags.join(" ")}\n`;
    }

    if (task.description) {
      md += `\n${task.description}\n`;
    }

    if (task.subtasks && task.subtasks.length > 0) {
      md += `\n**Subtasks**:\n`;
      task.subtasks.forEach((st) => {
        md += `- [${st.completed ? "x" : " "}] ${st.text}\n`;
      });
    }

    // Pre-Work Checklist
    if (task.preWorkChecklist && task.preWorkChecklist.length > 0) {
      md += `\n**Pre-Work Checklist**:\n`;
      task.preWorkChecklist.forEach((item) => {
        md += `- [${item.completed ? "x" : " "}] ${item.text}\n`;
      });
    }

    if (task.notes) {
      md += `\n**Notes**:\n${task.notes}\n`;
    }

    // Visual Operations Log
    if (task.visualOpsLog && task.visualOpsLog.length > 0) {
      md += `\n**Visual Operations Log**:\n`;
      task.visualOpsLog.forEach(entry => {
        md += `- ${entry}\n`;
      });
    }

    // Errors Log
    if (task.errorsLog && task.errorsLog.length > 0) {
      md += `\n**Errors Log**:\n`;
      task.errorsLog.forEach(entry => {
        md += `- ${entry}\n`;
      });
    }

    md += `\n`;
  });

  return md;
}

// Enhanced markdown to HTML converter for notes
function markdownToHtml(markdown) {
  if (!markdown) return "";

  let html = markdown;

  // First, extract code blocks before escaping HTML
  const codeBlocks = [];
  html = html.replace(
    /```([^\n`]*)\n?([\s\S]*?)```/g,
    (match, language, code) => {
      const lang = (language || "").trim() || "text";
      const placeholder = `\n__CODE_BLOCK_${codeBlocks.length}__\n`;
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      codeBlocks.push(
        `<pre><code class="language-${lang}">${escapedCode}</code></pre>`,
      );
      return placeholder;
    },
  );

  // Escape HTML in the remaining text
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert markdown syntax
  html = html
    // Headers
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Unordered lists
    .replace(/^\* (.+)$/gm, "<li>$1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Inline code (after escaping)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  // Wrap in paragraph tags if needed
  if (!html.startsWith("<")) {
    html = "<p>" + html + "</p>";
  }

  // Wrap list items with ul tags
  html = html.replace(/(<li>.*<\/li>)/s, (match) => {
    return "<ul>" + match + "</ul>";
  });

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`__CODE_BLOCK_${i}__`, block);
  });

  // Sanitize HTML to prevent XSS attacks
  // Block javascript:, data:, and vbscript: URLs to prevent XSS
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "p",
      "strong",
      "em",
      "code",
      "pre",
      "ul",
      "li",
      "a",
      "br",
    ],
    ALLOWED_ATTR: ["href", "target", "class"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
  });
}

// Status field reorganization timer
let statusReorganizationTimer = null;

// Schedule markdown reorganization after Status field change
function scheduleStatusReorganization(tasks, config, saveCallback) {
  // Clear any existing timer
  if (statusReorganizationTimer) {
    clearTimeout(statusReorganizationTimer);
  }

  // Set new timer for 2-3 seconds
  statusReorganizationTimer = setTimeout(() => {
    const markdown = generateMarkdown(tasks, config);
    saveCallback(markdown);
  }, 2500); // 2.5 seconds delay
}

// Export for use in other modules
export const markdownParser = {
  parseMarkdown,
  parseArchive,
  parseTasksFromSection,
  parseTask,
  generateMarkdown,
  generateArchiveMarkdown,
  markdownToHtml,
  scheduleStatusReorganization,
  deriveColumnId,
  normalizeForComparison,
};

export {
  parseMarkdown,
  parseArchive,
  parseTasksFromSection,
  parseTask,
  generateMarkdown,
  generateArchiveMarkdown,
  markdownToHtml,
  scheduleStatusReorganization,
  deriveColumnId,
  normalizeForComparison,
};
