import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Plus,
  Filter,
  Settings,
  RefreshCw,
  X,
  FolderOpen,
  Archive,
  Columns,
  Moon,
  Sun,
  Monitor,
  ArrowUpDown,
  FileText,
  AlertTriangle,
  ArrowRight,
  MoreHorizontal,
  LayoutGrid,
} from 'lucide-react';

import KanbanBoard from './components/kanban/KanbanBoard';
import TaskModal from './components/task/TaskModal';
import TaskForm from './components/task/TaskForm';
import Modal from './components/common/Modal';
import { ColumnManagerModal } from './components/settings/ColumnManager';
import ProjectSelector from './components/common/ProjectSelector';
import ArchiveModal from './components/archive/ArchiveModal';
import Toast from './components/common/Toast';
import TaskSummaryBadge from './components/common/TaskSummaryBadge';
import OverflowMenu from './components/common/OverflowMenu';

import { markdownParser } from './utils/markdown';
import { fileSystem } from './utils/fileSystem';
import { fileWatcher } from './utils/fileWatcher';
import { formatTaskId, maxNumInScope } from './utils/taskId';

// Default columns
const DEFAULT_COLUMNS = [
  { id: 'To Do', name: 'To Do' },
  { id: 'In Progress', name: 'In Progress' },
  { id: 'In Review', name: 'In Review' },
  { id: 'Done', name: 'Done' },
];

// Theme options
const THEMES = {
  dark: { label: 'Dark', icon: Moon },
  light: { label: 'Light', icon: Sun },
  midnight: { label: 'Midnight', icon: Moon },
  forest: { label: 'Forest', icon: Monitor },
  system: { label: 'System', icon: Monitor },
};

// Smart Archive Modal Component
function SmartArchiveModal({ isOpen, onClose, columnId, tasks, fileStats, onArchive }) {
  const [keepDays, setKeepDays] = useState(7);

  if (!isOpen) return null;

  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  // Calculate which tasks would be archived
  const tasksToArchive = tasks.filter(task => {
    const finishedDate = task.finished || task.completed || task.created;
    if (!finishedDate) return true;
    const taskDate = new Date(finishedDate);
    return taskDate < cutoffDate;
  });

  const tasksToKeep = tasks.length - tasksToArchive.length;

  // Calculate how much space would be freed
  const estimateTaskSize = (task) => {
    let size = 200;
    size += (task.title?.length || 0);
    size += (task.description?.length || 0) * 1.2;
    size += (task.notes?.length || 0);
    size += (task.subtasks?.length || 0) * 50;
    size += (task.tags?.length || 0) * 15;
    return size;
  };

  const charsToFree = tasksToArchive.reduce((sum, t) => sum + estimateTaskSize(t), 0);
  const percentToFree = Math.round((charsToFree / 600000) * 100);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <Archive className="w-5 h-5" style={{ marginRight: 'var(--space-2)' }} />
            Smart Archive
          </h2>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          {/* File size warning */}
          {fileStats.isWarning && (
            <div style={{
              padding: 'var(--space-3)',
              background: fileStats.isCritical ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}>
              <AlertTriangle className="w-5 h-5" style={{ color: fileStats.isCritical ? 'var(--status-error)' : 'var(--status-warning)' }} />
              <span style={{ fontSize: '0.875rem', color: fileStats.isCritical ? 'var(--status-error)' : 'var(--status-warning)' }}>
                File is at {fileStats.percentage}% capacity. Consider archiving older tasks.
              </span>
            </div>
          )}

          <p className="text-secondary" style={{ marginBottom: 'var(--space-4)', fontSize: '0.875rem' }}>
            Archive completed tasks while keeping recent ones. This helps keep your kanban file under the 200k token limit.
          </p>

          {/* Keep days selector */}
          <div className="form-group">
            <label className="label">Keep tasks finished within the last:</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {[0, 1, 3, 7, 14, 30, 60].map(days => (
                <button
                  key={days}
                  className={`btn ${keepDays === days ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setKeepDays(days)}
                >
                  {days === 0 ? 'Archive all' : `${days} ${days === 1 ? 'day' : 'days'}`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--surface-elevated)',
            borderRadius: 'var(--radius-md)',
            marginTop: 'var(--space-4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span className="text-secondary">Tasks to archive:</span>
              <span style={{ fontWeight: 600 }}>{tasksToArchive.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span className="text-secondary">Tasks to keep:</span>
              <span style={{ fontWeight: 600, color: 'var(--status-success)' }}>{tasksToKeep}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-secondary">Space freed:</span>
              <span style={{ fontWeight: 600, color: percentToFree > 0 ? 'var(--status-success)' : 'var(--text-muted)' }}>
                ~{percentToFree}%
              </span>
            </div>
          </div>

          {/* Task list preview */}
          {tasksToArchive.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <label className="label">Tasks to be archived:</label>
              <div style={{
                maxHeight: '150px',
                overflowY: 'auto',
                padding: 'var(--space-2)',
                background: 'var(--surface-elevated)',
                borderRadius: 'var(--radius-md)',
              }}>
                {tasksToArchive.slice(0, 10).map(task => (
                  <div key={task.id} style={{
                    padding: 'var(--space-2)',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: '0.8125rem',
                  }}>
                    <span className="text-muted" style={{ marginRight: 'var(--space-2)' }}>{task.id}</span>
                    {task.title}
                  </div>
                ))}
                {tasksToArchive.length > 10 && (
                  <div style={{ padding: 'var(--space-2)', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                    ... and {tasksToArchive.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onArchive(columnId, keepDays)}
            disabled={tasksToArchive.length === 0}
          >
            <Archive className="w-4 h-4" />
            Archive {tasksToArchive.length} tasks
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  // Project state
  const [currentProject, setCurrentProject] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [fileHandle, setFileHandle] = useState(null);
  const [archiveHandle, setArchiveHandle] = useState(null);

  // Task file state (for kanban.md/tasks.md compatibility)
  const [currentTaskFileName, setCurrentTaskFileName] = useState(null);
  const [showLegacyBanner, setShowLegacyBanner] = useState(false);
  const [availableTaskFiles, setAvailableTaskFiles] = useState([]);

  // Data state
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [lastSaved, setLastSaved] = useState(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterTags, setFilterTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('manual');

  // Notification state
  const [notification, setNotification] = useState(null);

  // Modal state
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [pendingOpenHandle, setPendingOpenHandle] = useState(null);
  const [openDialogName, setOpenDialogName] = useState('');
  const [openDialogGroup, setOpenDialogGroup] = useState('');
  const [showSmartArchiveModal, setShowSmartArchiveModal] = useState(false);
  const [smartArchiveColumn, setSmartArchiveColumn] = useState(null);

  // Theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('task-memory-theme') || 'dark';
  });

  // File watcher ref
  const fileWatcherStartedRef = useRef(false);

  // Per-file board meta: { taskPrefix, lastTaskId } of the currently LOADED
  // file only (TASK-017). A ref (not state) so handleSaveTask can reserve
  // the next id synchronously — two rapid creates before a rerender must
  // still get distinct ids. installBoard() is the only writer besides the
  // mint reservation in handleSaveTask.
  const boardMetaRef = useRef({ taskPrefix: '', lastTaskId: 0 });

  // Centralized per-parse-site install: applies columns + boardMetaRef from
  // a parseMarkdown() result and returns the mapped task list. Replaces the
  // duplicated setColumns/mapping blocks that used to live at each of the 4
  // parse call sites (loadProjectFromHandle, watcher external-change,
  // handleSwitchTaskFile, handleRefresh). Callers still own setTasks() so
  // they can run their own pre/post processing (reorg checks, change
  // detection) against the returned array before committing it to state.
  // `_fileName` is accepted (mirroring the parseMarkdown(content, { fileName })
  // call every caller makes just above) purely so call sites read as
  // "install the board I just parsed FOR this file" — the prefix itself was
  // already resolved by parseMarkdown via opts.fileName, so installBoard
  // doesn't need to re-derive it.
  const installBoard = useCallback((parsed, _fileName) => {
    if (parsed.config?.columns?.length > 0) {
      setColumns(parsed.config.columns.map(col => ({
        id: col.id || col.name,
        name: col.name,
      })));
    }

    boardMetaRef.current = {
      taskPrefix: parsed.config?.taskPrefix || '',
      lastTaskId: parsed.config?.lastTaskId || 0,
    };

    return (parsed.tasks || []).map(task => ({
      ...task,
      column: task.status || 'To Do',
    }));
  }, []);

  // Clean up file watcher on unmount
  useEffect(() => {
    return () => {
      if (fileWatcherStartedRef.current) {
        fileWatcher.stopFileWatcher();
        fileWatcherStartedRef.current = false;
      }
    };
  }, []);

  // Apply theme
  useEffect(() => {
    const applyTheme = (themeName) => {
      document.documentElement.setAttribute('data-theme', themeName);
    };

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches ? 'dark' : 'light');

      const handler = (e) => applyTheme(e.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  // Save theme preference
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('task-memory-theme', newTheme);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape to close any modal
      if (e.key === 'Escape') {
        if (showTaskForm) {
          setShowTaskForm(false);
          setEditingTask(null);
        } else if (showTaskModal) {
          setShowTaskModal(false);
          setSelectedTask(null);
        } else if (showSettingsModal) {
          setShowSettingsModal(false);
        } else if (showColumnModal) {
          setShowColumnModal(false);
        } else if (showArchiveModal) {
          setShowArchiveModal(false);
        }
      }

      // Ctrl/Cmd + N to create new task
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && directoryHandle) {
        e.preventDefault();
        handleAddTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTaskForm, showTaskModal, showSettingsModal, showColumnModal, showArchiveModal, directoryHandle]);

  // Derived data
  const categories = useMemo(() => {
    const cats = new Set(tasks.map(t => t.category).filter(Boolean));
    return [...cats];
  }, [tasks]);

  const assignees = useMemo(() => {
    const assigns = new Set(tasks.map(t => t.assignee).filter(Boolean));
    return [...assigns];
  }, [tasks]);

  const allTags = useMemo(() => {
    const tags = new Set();
    tasks.forEach(t => {
      (t.tags || []).forEach(tag => tags.add(tag));
    });
    return [...tags].sort();
  }, [tasks]);

  // Notification helper
  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
  }, []);

  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          task.title?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.id?.toLowerCase().includes(query) ||
          task.tags?.some(tag => tag.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }
      if (filterPriority && task.priority?.toLowerCase() !== filterPriority.toLowerCase()) {
        return false;
      }
      if (filterCategory && task.category !== filterCategory) {
        return false;
      }
      if (filterAssignee && task.assignee !== filterAssignee) {
        return false;
      }
      if (filterTags.length > 0) {
        const taskTags = task.tags || [];
        if (!filterTags.some(tag => taskTags.includes(tag))) {
          return false;
        }
      }
      return true;
    });

    // Sort tasks (skip if manual - preserve array order)
    if (sortBy !== 'manual') {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
          case 'created-desc':
            return (b.created || '').localeCompare(a.created || '');
          case 'created-asc':
            return (a.created || '').localeCompare(b.created || '');
          case 'priority':
            return (priorityOrder[a.priority?.toLowerCase()] || 2) - (priorityOrder[b.priority?.toLowerCase()] || 2);
          case 'title':
            return (a.title || '').localeCompare(b.title || '');
          default:
            return 0;
        }
      });
    }

    return filtered;
  }, [tasks, searchQuery, filterPriority, filterCategory, filterAssignee, filterTags, sortBy]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const byColumn = {};
    columns.forEach(col => {
      byColumn[col.id] = tasks.filter(t => t.column === col.id).length;
    });
    return { total, byColumn };
  }, [tasks, columns]);

  // Estimate file size for token limit warning
  // Claude Code limit is ~200k tokens, roughly 800k characters
  const MAX_SAFE_CHARS = 600000; // Conservative limit (150k tokens)
  const fileStats = useMemo(() => {
    // Rough estimate of markdown size per task
    const estimateTaskSize = (task) => {
      let size = 200; // Base size for headers, metadata
      size += (task.title?.length || 0);
      size += (task.description?.length || 0) * 1.2; // Account for markdown formatting
      size += (task.notes?.length || 0);
      size += (task.subtasks?.length || 0) * 50;
      size += (task.tags?.length || 0) * 15;
      return size;
    };

    const totalChars = tasks.reduce((sum, task) => sum + estimateTaskSize(task), 0) + 500; // +500 for config section
    const percentage = Math.round((totalChars / MAX_SAFE_CHARS) * 100);
    const isWarning = percentage > 70;
    const isCritical = percentage > 90;

    return { totalChars, percentage, isWarning, isCritical };
  }, [tasks]);

  // Load recent projects and auto-restore on mount
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);
      setLoadingMessage('Loading recent projects...');

      try {
        // Load recent projects from IndexedDB
        const projects = await fileSystem.loadRecentProjects();
        setRecentProjects(projects);

        // Try to auto-restore the most recent project
        if (projects.length > 0) {
          const mostRecent = projects[0];
          setLoadingMessage('Restoring previous project...');

          try {
            // Verify permission
            const hasPermission = await fileSystem.verifyPermission(mostRecent.handle);

            if (hasPermission) {
              await loadProjectFromHandle(mostRecent.handle, mostRecent);
            } else {
              console.log('Permission denied for auto-restore, showing welcome screen');
            }
          } catch (error) {
            console.log('Could not auto-restore project:', error.message);
          }
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    };

    initializeApp();
  }, []);

  // Load a project from a directory handle
  const loadProjectFromHandle = async (dirHandle, projectInfo = null, overrides = null) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Loading project files...');

      // Store directory handle
      setDirectoryHandle(dirHandle);
      fileSystem.setDirectoryHandle(dirHandle);

      // Load task file with detection (supports tasks.md, kanban.md, and nested paths)
      const preferredFile = projectInfo?.taskFileName || null;
      const preferredPath = projectInfo?.taskFilePath ?? null;
      const taskResult = await fileSystem.loadTaskFile(
        dirHandle,
        preferredFile ? { fileName: preferredFile, relativePath: preferredPath || '' } : null,
      );
      setFileHandle(taskResult.fileHandle);
      setCurrentTaskFileName(taskResult.fileName);

      // Show migration banner if using legacy kanban.md
      if (taskResult.isLegacy) {
        setShowLegacyBanner(true);
      } else {
        setShowLegacyBanner(false);
      }

      // Store available task files
      if (taskResult.available) {
        setAvailableTaskFiles(taskResult.available);
      } else {
        // Detect available files if not returned
        const detection = await fileSystem.detectTaskFile(dirHandle);
        setAvailableTaskFiles(detection.available);
      }

      // Parse content
      const parsed = markdownParser.parseMarkdown(taskResult.content, { fileName: taskResult.fileName });
      const mappedTasks = installBoard(parsed, taskResult.fileName);

      // Check for tasks that need reorganization (Status field doesn't match section)
      // NOTE: On initial load, we just notify - don't auto-save to avoid overwriting external changes
      const tasksNeedingReorg = mappedTasks.filter(t => t._needsReorganization);
      if (tasksNeedingReorg.length > 0) {
        console.log(`📋 Found ${tasksNeedingReorg.length} tasks with Status field mismatch`);
        // Clean up the internal flag (tasks will display in their Status-based column)
        mappedTasks.forEach(t => delete t._needsReorganization);
        // Just notify user - don't auto-save on initial load
        setTimeout(() => {
          showNotification(`${tasksNeedingReorg.length} task${tasksNeedingReorg.length > 1 ? 's' : ''} displayed based on Status field`, 'info');
        }, 500);
      }

      setTasks(mappedTasks);
      setLastSaved(new Date());

      // Try to load archive.md (optional)
      try {
        const archiveResult = await fileSystem.loadArchiveFile(dirHandle);
        setArchiveHandle(archiveResult.fileHandle);
        // Parse archived tasks
        const archived = markdownParser.parseArchive(archiveResult.content);
        setArchivedTasks(archived.map(task => ({
          ...task,
          column: 'archived',
        })));
      } catch (e) {
        console.log('No archive file found');
        setArchivedTasks([]);
      }

      // Save to recent projects with task file name + relative path (and optional displayName/group overrides)
      await fileSystem.saveDirectoryHandle(
        dirHandle,
        overrides?.displayName || null,
        taskResult.fileName,
        overrides?.group,
        taskResult.relativePath ?? '',
      );

      // Update recent projects list
      const projects = await fileSystem.loadRecentProjects();
      setRecentProjects(projects);

      // Set current project
      setCurrentProject(projectInfo || {
        name: dirHandle.name,
        displayName: overrides?.displayName || dirHandle.name,
        handle: dirHandle,
        taskFileName: taskResult.fileName,
        taskFilePath: taskResult.relativePath ?? '',
        group: overrides?.group || undefined,
        lastAccessed: Date.now(),
      });

      // Start file watcher
      if (!fileWatcherStartedRef.current && taskResult.fileHandle) {
        fileWatcher.setCurrentContent(taskResult.content);

        // Set up notification for external changes
        fileWatcher.setNotificationCallbacks({
          onExternalChangeDetected: () => {
            showNotification('File updated by external editor', 'info');
          },
        });

        fileWatcher.startFileWatcher(taskResult.fileHandle, {
          onExternalChange: (newContent) => {
            const newParsed = markdownParser.parseMarkdown(newContent, { fileName: taskResult.fileName });

            // Detect what changed for component-level updates
            const oldTasksForComparison = tasks;
            const newMappedTasks = installBoard(newParsed, taskResult.fileName);

            // Use smart change detection
            const changes = fileWatcher.detectChangedComponents(oldTasksForComparison, newMappedTasks);

            if (changes.hasChanges) {
              console.log(`📥 External changes: +${changes.addedTasks.length} -${changes.removedTasks.length} ~${changes.updatedTasks.length} moved:${changes.movedTasks.length}`);
            }

            // Update tasks
            setTasks(newMappedTasks);
            console.log('External changes loaded');
          },
        });
        fileWatcherStartedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Open a new project directory
  const handleOpenProject = async () => {
    try {
      const handle = await fileSystem.requestDirectoryAccess();
      if (handle) {
        // Defer actual load until user confirms display name + group
        setPendingOpenHandle(handle);
        setOpenDialogName(handle.name);
        setOpenDialogGroup('');
      }
    } catch (error) {
      console.error('Failed to open project:', error);
    }
  };

  const handleConfirmOpenProject = async () => {
    const handle = pendingOpenHandle;
    if (!handle) return;
    const displayName = openDialogName.trim() || handle.name;
    const group = openDialogGroup.trim();
    setPendingOpenHandle(null);
    setOpenDialogName('');
    setOpenDialogGroup('');
    try {
      await loadProjectFromHandle(handle, null, { displayName, group });
    } catch (error) {
      console.error('Failed to open project:', error);
    }
  };

  const handleCancelOpenProject = () => {
    setPendingOpenHandle(null);
    setOpenDialogName('');
    setOpenDialogGroup('');
  };

  // Rename a project's group
  const handleRenameGroup = async (index, newGroup) => {
    try {
      await fileSystem.renameGroup(index, newGroup);
      const projects = await fileSystem.loadRecentProjects();
      setRecentProjects(projects);
    } catch (error) {
      console.error('Failed to rename group:', error);
    }
  };

  // Select a recent project
  const handleSelectProject = async (project) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Verifying permission...');

      // Verify permission
      const hasPermission = await fileSystem.verifyPermission(project.handle);

      if (hasPermission) {
        await loadProjectFromHandle(project.handle, project);
      } else {
        alert('Permission denied. Please try opening the project again.');
      }
    } catch (error) {
      console.error('Failed to select project:', error);
      alert('Failed to open project. The folder may have been moved or deleted.');
    } finally {
      setIsLoading(false);
    }
  };

  // Rename a project
  const handleRenameProject = async (index, newName) => {
    try {
      await fileSystem.renameProject(index, newName);
      const projects = await fileSystem.loadRecentProjects();
      setRecentProjects(projects);

      // Update current project if it's the one being renamed
      if (currentProject && recentProjects[index]?.name === currentProject.name) {
        setCurrentProject({ ...currentProject, displayName: newName });
      }
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  };

  // Delete a project from recent list
  const handleDeleteProject = async (index) => {
    try {
      await fileSystem.deleteProjectFromRecents(index);
      const projects = await fileSystem.loadRecentProjects();
      setRecentProjects(projects);
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  // Migrate kanban.md to tasks.md
  const handleMigrateToTasks = async () => {
    if (!directoryHandle) return;

    try {
      setIsLoading(true);
      setLoadingMessage('Migrating to tasks.md...');

      const result = await fileSystem.migrateKanbanToTasks(directoryHandle);

      if (result.success) {
        setFileHandle(result.newHandle);
        setCurrentTaskFileName('tasks.md');
        setShowLegacyBanner(false);
        setAvailableTaskFiles(['tasks.md']);

        // Update project in IndexedDB
        if (currentProject) {
          await fileSystem.updateProjectTaskFile(currentProject.name, 'tasks.md');
          setCurrentProject({ ...currentProject, taskFileName: 'tasks.md' });
        }

        showNotification('Migrated to tasks.md successfully');
      } else {
        showNotification('Migration failed: ' + (result.error?.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Migration error:', error);
      showNotification('Migration failed: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Dismiss legacy banner and keep using kanban.md
  const handleKeepLegacy = () => {
    setShowLegacyBanner(false);
  };

  // Switch to a different task file.
  // Accepts either a string filename (legacy — same dir as current project)
  // or a "<relativePath>:<fileName>" key from the switcher dropdown, or an
  // object { fileName, relativePath }.
  const handleSwitchTaskFile = async (target) => {
    if (!directoryHandle) return;

    let fileName, relativePath;
    if (typeof target === 'string') {
      if (target.includes(':')) {
        const idx = target.indexOf(':');
        relativePath = target.slice(0, idx);
        fileName = target.slice(idx + 1);
      } else {
        fileName = target;
        relativePath = currentProject?.taskFilePath ?? '';
      }
    } else if (target && typeof target === 'object') {
      fileName = target.fileName;
      relativePath = target.relativePath ?? '';
    } else {
      return;
    }

    // No-op if already loaded
    if (
      fileName === currentTaskFileName &&
      (relativePath ?? '') === (currentProject?.taskFilePath ?? '')
    ) {
      return;
    }

    try {
      setIsLoading(true);
      const displayPath = relativePath ? `${relativePath}/${fileName}` : fileName;
      setLoadingMessage(`Loading ${displayPath}...`);

      const result = await fileSystem.loadTaskFile(directoryHandle, {
        fileName,
        relativePath,
      });

      setFileHandle(result.fileHandle);
      setCurrentTaskFileName(fileName);

      // Update legacy banner state
      setShowLegacyBanner(fileName === 'kanban.md');

      // Parse and update state
      const parsed = markdownParser.parseMarkdown(result.content, { fileName });
      const mappedTasks = installBoard(parsed, fileName);
      setTasks(mappedTasks);

      // Persist both fileName and relativePath
      if (currentProject) {
        await fileSystem.saveDirectoryHandle(
          directoryHandle,
          currentProject.displayName || null,
          fileName,
          currentProject.group,
          relativePath ?? '',
        );
        setCurrentProject({
          ...currentProject,
          taskFileName: fileName,
          taskFilePath: relativePath ?? '',
        });
      }

      // Update file watcher
      fileWatcher.setCurrentContent(result.content);

      showNotification(`Switched to ${displayPath}`);
    } catch (error) {
      console.error('Failed to switch file:', error);
      showNotification('Failed to switch file: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Save file - accepts optional overrides for columns (for async state timing)
  const handleSaveFile = useCallback(async (overrideColumns = null) => {
    console.log('📝 handleSaveFile called', { fileHandle: !!fileHandle, overrideColumns: !!overrideColumns });

    if (!fileHandle) {
      console.warn('⚠️ No fileHandle - cannot save');
      return;
    }

    // Don't save while applying external changes
    if (fileWatcher.isApplyingChanges()) {
      console.log('⏳ Skipping save - applying external changes');
      return;
    }

    try {
      setIsLoading(true);
      const tasksForMarkdown = tasks.map(task => ({
        ...task,
        status: task.column,
      }));
      const columnsToSave = overrideColumns || columns;
      console.log('📊 Saving columns:', columnsToSave.map(c => c.name));

      // TASK-017: scope the counter to this file's prefix (boardMetaRef —
      // the LOADED file's meta) and take the max against the scoped ids
      // actually on the board. This fixes three things the old global
      // /TASK-(\d+)/ regex got wrong: (1) it never matched TASK-GR-678 at
      // all, so a prefixed board would save "Last Task ID: 0"; (2) deleting
      // the highest-numbered task no longer regresses the counter (it's
      // monotonic against the ref, not recomputed purely from what's on
      // screen); (3) a legacy TASK-900 sitting inside a GR-prefixed file
      // can't jump the GR counter (scoped max).
      const meta = boardMetaRef.current;
      const config = {
        taskPrefix: meta.taskPrefix,
        lastTaskId: Math.max(meta.lastTaskId, maxNumInScope(tasks.map(t => t.id), meta.taskPrefix)),
        columns: columnsToSave.map(col => ({ id: col.id, name: col.name })),
      };
      const markdown = markdownParser.generateMarkdown(tasksForMarkdown, config);
      console.log('📄 Generated markdown length:', markdown.length);

      await fileSystem.writeFile(fileHandle, markdown);
      console.log('✅ File written successfully');

      // Update file watcher content
      fileWatcher.setCurrentContent(markdown);

      setLastSaved(new Date());
      showNotification('Changes saved');
    } catch (error) {
      console.error('❌ Failed to save file:', error);
      showNotification('Failed to save: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [fileHandle, tasks, columns, showNotification]);

  // Refresh from file
  const handleRefresh = async () => {
    if (!fileHandle) return;

    try {
      setIsLoading(true);
      const content = await fileSystem.readFile(fileHandle);
      const parsed = markdownParser.parseMarkdown(content, { fileName: currentTaskFileName });
      const mappedTasks = installBoard(parsed, currentTaskFileName);

      setTasks(mappedTasks);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Task operations
  const handleTaskMove = useCallback((taskId, targetColumn, overTaskId) => {
    console.log('🔄 handleTaskMove:', { taskId, targetColumn, overTaskId });

    setTasks(prev => {
      const taskIndex = prev.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        console.warn('⚠️ Task not found:', taskId);
        return prev;
      }

      const task = prev[taskIndex];
      console.log('📋 Moving task from', task.column, 'to', targetColumn);

      // If moving to a different column, just update the column
      if (task.column !== targetColumn) {
        console.log('✅ Updating column');
        return prev.map(t => {
          if (t.id === taskId) {
            return { ...t, column: targetColumn };
          }
          return t;
        });
      }

      // If reordering within the same column (dropped on another task)
      if (overTaskId && overTaskId !== taskId) {
        const overTaskIndex = prev.findIndex(t => t.id === overTaskId);
        if (overTaskIndex === -1) return prev;

        // Switch to manual sort when user drags to reorder
        setSortBy('manual');

        // Remove the task from its current position
        const result = [...prev];
        result.splice(taskIndex, 1);

        // Find new position of the target task after removal
        const newOverIndex = result.findIndex(t => t.id === overTaskId);

        // Insert the task at the new position
        result.splice(newOverIndex, 0, task);
        return result;
      }

      return prev;
    });
  }, []);

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
  };

  const handleTaskEdit = (task) => {
    setEditingTask(task);
    setShowTaskForm(true);
    setShowTaskModal(false);
  };

  const handleAddTask = (column) => {
    setEditingTask({ column: column?.id || columns[0]?.id });
    setShowTaskForm(true);
  };

  const handleSaveTask = (taskData) => {
    if (!taskData.id) {
      // TASK-017: mint SYNCHRONOUSLY against boardMetaRef, before setTasks —
      // two rapid creates (e.g. a double-click) must not read the same
      // counter value from a stale `tasks` closure. Mutating the ref here
      // (not inside the updater) is what makes the second call see the
      // first call's reservation; the updater below stays a pure function
      // of `prev`.
      const meta = boardMetaRef.current;
      const scopedMax = maxNumInScope(tasks.map(t => t.id), meta.taskPrefix);
      const next = Math.max(meta.lastTaskId, scopedMax) + 1;
      meta.lastTaskId = next; // mutate the ref FIRST
      taskData.id = formatTaskId(meta.taskPrefix, next);
    }

    setTasks(prev => {
      const existingIndex = prev.findIndex(t => t.id === taskData.id);
      if (existingIndex >= 0) {
        return prev.map((t, i) => i === existingIndex ? taskData : t);
      } else {
        return [...prev, taskData];
      }
    });

    setShowTaskForm(false);
    setEditingTask(null);
  };

  const handleDeleteTask = (task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setShowTaskForm(false);
    setEditingTask(null);
  };

  const handleSubtaskToggle = useCallback((taskId, subtaskIndex) => {
    const toggleSubtask = (task) => {
      if (task.id !== taskId) return task;
      const subtasks = [...(task.subtasks || [])];
      if (subtasks[subtaskIndex]) {
        subtasks[subtaskIndex] = {
          ...subtasks[subtaskIndex],
          completed: !subtasks[subtaskIndex].completed,
        };
      }
      return { ...task, subtasks };
    };

    // Update tasks state
    setTasks(prev => prev.map(toggleSubtask));

    // Also update selectedTask immediately for responsive UI
    setSelectedTask(prev => {
      if (!prev || prev.id !== taskId) return prev;
      return toggleSubtask(prev);
    });
  }, []);

  // Add subtask - supports position for undo functionality
  const handleAddSubtask = (taskId, text, position = null, completed = false) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const subtasks = [...(task.subtasks || [])];
      const newItem = { text, completed };
      if (position !== null && position >= 0 && position <= subtasks.length) {
        subtasks.splice(position, 0, newItem);
      } else {
        subtasks.push(newItem);
      }
      return { ...task, subtasks };
    }));
    // Also update selectedTask if viewing
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const subtasks = [...(prev.subtasks || [])];
      const newItem = { text, completed };
      if (position !== null && position >= 0 && position <= subtasks.length) {
        subtasks.splice(position, 0, newItem);
      } else {
        subtasks.push(newItem);
      }
      return { ...prev, subtasks };
    });
  };

  const handleDeleteSubtask = (taskId, subtaskIndex) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const subtasks = [...(task.subtasks || [])];
      subtasks.splice(subtaskIndex, 1);
      return { ...task, subtasks };
    }));
    // Also update selectedTask if viewing
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const subtasks = [...(prev.subtasks || [])];
      subtasks.splice(subtaskIndex, 1);
      return { ...prev, subtasks };
    });
  };

  // Update subtask text (inline editing)
  const handleUpdateSubtask = (taskId, subtaskIndex, newText) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const subtasks = [...(task.subtasks || [])];
      if (subtasks[subtaskIndex]) {
        subtasks[subtaskIndex] = { ...subtasks[subtaskIndex], text: newText };
      }
      return { ...task, subtasks };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const subtasks = [...(prev.subtasks || [])];
      if (subtasks[subtaskIndex]) {
        subtasks[subtaskIndex] = { ...subtasks[subtaskIndex], text: newText };
      }
      return { ...prev, subtasks };
    });
  };

  // Reorder subtask (drag and drop / keyboard)
  const handleReorderSubtask = (taskId, fromIndex, toIndex) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const subtasks = [...(task.subtasks || [])];
      const [removed] = subtasks.splice(fromIndex, 1);
      subtasks.splice(toIndex, 0, removed);
      return { ...task, subtasks };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const subtasks = [...(prev.subtasks || [])];
      const [removed] = subtasks.splice(fromIndex, 1);
      subtasks.splice(toIndex, 0, removed);
      return { ...prev, subtasks };
    });
  };

  // Toggle pre-work checklist item
  const handlePreWorkToggle = (taskId, itemIndex) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const preWorkChecklist = [...(task.preWorkChecklist || [])];
      if (preWorkChecklist[itemIndex]) {
        preWorkChecklist[itemIndex] = {
          ...preWorkChecklist[itemIndex],
          completed: !preWorkChecklist[itemIndex].completed
        };
      }
      return { ...task, preWorkChecklist };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const preWorkChecklist = [...(prev.preWorkChecklist || [])];
      if (preWorkChecklist[itemIndex]) {
        preWorkChecklist[itemIndex] = {
          ...preWorkChecklist[itemIndex],
          completed: !preWorkChecklist[itemIndex].completed
        };
      }
      return { ...prev, preWorkChecklist };
    });
  };

  // Add pre-work checklist item
  const handleAddPreWork = (taskId, text, position = null, completed = false) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const preWorkChecklist = [...(task.preWorkChecklist || [])];
      const newItem = { text, completed };
      if (position !== null && position >= 0 && position <= preWorkChecklist.length) {
        preWorkChecklist.splice(position, 0, newItem);
      } else {
        preWorkChecklist.push(newItem);
      }
      return { ...task, preWorkChecklist };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const preWorkChecklist = [...(prev.preWorkChecklist || [])];
      const newItem = { text, completed };
      if (position !== null && position >= 0 && position <= preWorkChecklist.length) {
        preWorkChecklist.splice(position, 0, newItem);
      } else {
        preWorkChecklist.push(newItem);
      }
      return { ...prev, preWorkChecklist };
    });
  };

  // Delete pre-work checklist item
  const handleDeletePreWork = (taskId, itemIndex) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const preWorkChecklist = [...(task.preWorkChecklist || [])];
      preWorkChecklist.splice(itemIndex, 1);
      return { ...task, preWorkChecklist };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const preWorkChecklist = [...(prev.preWorkChecklist || [])];
      preWorkChecklist.splice(itemIndex, 1);
      return { ...prev, preWorkChecklist };
    });
  };

  // Update pre-work checklist item text
  const handleUpdatePreWork = (taskId, itemIndex, newText) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const preWorkChecklist = [...(task.preWorkChecklist || [])];
      if (preWorkChecklist[itemIndex]) {
        preWorkChecklist[itemIndex] = { ...preWorkChecklist[itemIndex], text: newText };
      }
      return { ...task, preWorkChecklist };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const preWorkChecklist = [...(prev.preWorkChecklist || [])];
      if (preWorkChecklist[itemIndex]) {
        preWorkChecklist[itemIndex] = { ...preWorkChecklist[itemIndex], text: newText };
      }
      return { ...prev, preWorkChecklist };
    });
  };

  // Reorder pre-work checklist item
  const handleReorderPreWork = (taskId, fromIndex, toIndex) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const preWorkChecklist = [...(task.preWorkChecklist || [])];
      const [removed] = preWorkChecklist.splice(fromIndex, 1);
      preWorkChecklist.splice(toIndex, 0, removed);
      return { ...task, preWorkChecklist };
    }));
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const preWorkChecklist = [...(prev.preWorkChecklist || [])];
      const [removed] = preWorkChecklist.splice(fromIndex, 1);
      preWorkChecklist.splice(toIndex, 0, removed);
      return { ...prev, preWorkChecklist };
    });
  };

  // Archive operations
  const saveArchive = useCallback(async (archived) => {
    if (!archiveHandle) return;

    try {
      const archiveMarkdown = markdownParser.generateArchiveMarkdown(
        archived.map(t => ({ ...t, status: 'archived' }))
      );
      await fileSystem.writeFile(archiveHandle, archiveMarkdown);
      console.log('Archive saved');
    } catch (error) {
      console.error('Failed to save archive:', error);
    }
  }, [archiveHandle]);

  const handleArchiveTask = (task) => {
    // Add finished date if not set
    const today = new Date().toISOString().split('T')[0];
    const archivedTask = {
      ...task,
      column: 'archived',
      status: 'archived',
      completed: task.completed || task.finished || today,
    };

    // Remove from tasks
    setTasks(prev => prev.filter(t => t.id !== task.id));

    // Add to archived tasks
    setArchivedTasks(prev => {
      const updated = [archivedTask, ...prev];
      // Save to archive.md
      saveArchive(updated);
      return updated;
    });

    // Close modal if open
    setShowTaskModal(false);
    setSelectedTask(null);
    showNotification(`"${task.title}" archived`);
  };

  const handleArchiveAllDone = (columnId) => {
    // Open smart archive modal
    setSmartArchiveColumn(columnId);
    setShowSmartArchiveModal(true);
  };

  // Actually perform the smart archive
  const handleSmartArchive = (columnId, keepDays) => {
    const doneTasks = tasks.filter(t => t.column === columnId);
    if (doneTasks.length === 0) return;

    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    // Filter tasks: archive only tasks older than keepDays
    const tasksToArchive = doneTasks.filter(task => {
      const finishedDate = task.finished || task.completed || task.created;
      if (!finishedDate) return true; // No date = archive it
      const taskDate = new Date(finishedDate);
      return taskDate < cutoffDate;
    });

    if (tasksToArchive.length === 0) {
      showNotification('No tasks old enough to archive', 'info');
      setShowSmartArchiveModal(false);
      return;
    }

    const taskIdsToArchive = new Set(tasksToArchive.map(t => t.id));
    const todayStr = today.toISOString().split('T')[0];
    const archivedItems = tasksToArchive.map(task => ({
      ...task,
      column: 'archived',
      status: 'archived',
      completed: task.completed || task.finished || todayStr,
    }));

    // Remove archived tasks from tasks list
    setTasks(prev => prev.filter(t => !taskIdsToArchive.has(t.id)));

    // Add to archived tasks
    setArchivedTasks(prev => {
      const updated = [...archivedItems, ...prev];
      saveArchive(updated);
      return updated;
    });

    setShowSmartArchiveModal(false);
    showNotification(`${tasksToArchive.length} tasks archived (kept ${doneTasks.length - tasksToArchive.length} recent tasks)`);
  };

  const handleRestoreTask = (task) => {
    // Remove from archived
    setArchivedTasks(prev => {
      const updated = prev.filter(t => t.id !== task.id);
      // Save updated archive
      saveArchive(updated);
      return updated;
    });

    // Add back to tasks (to first column)
    const restoredTask = {
      ...task,
      column: columns[0]?.id || 'To Do',
      status: columns[0]?.id || 'To Do',
    };
    delete restoredTask.completed; // Remove archived date

    setTasks(prev => [...prev, restoredTask]);
    showNotification(`"${task.title}" restored`);
  };

  const handleDeleteArchivedTask = (task) => {
    setArchivedTasks(prev => {
      const updated = prev.filter(t => t.id !== task.id);
      // Save updated archive
      saveArchive(updated);
      return updated;
    });
    showNotification(`"${task.title}" deleted permanently`);
  };

  // Auto-save (respects external change flag)
  useEffect(() => {
    if (!fileHandle || tasks.length === 0) return;

    // Don't auto-save while applying external changes
    if (fileWatcher.isApplyingChanges()) {
      return;
    }

    const timer = setTimeout(() => {
      // Double-check before saving
      if (!fileWatcher.isApplyingChanges()) {
        handleSaveFile();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [tasks, handleSaveFile, fileHandle]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterPriority('');
    setFilterCategory('');
    setFilterAssignee('');
    setFilterTags([]);
    setSortBy('manual');
  };

  const hasActiveFilters = searchQuery || filterPriority || filterCategory || filterAssignee || filterTags.length > 0;

  const toggleTagFilter = (tag) => {
    setFilterTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Determine what to show
  const hasProject = directoryHandle !== null;

  // Show loading state
  if (isLoading && loadingMessage) {
    return (
      <div className="min-h-screen">
        <nav className="navbar">
          <div className="navbar-identity">
            <div className="navbar-logo">
              <LayoutGrid className="w-5 h-5" />
            </div>
          </div>
          <div className="navbar-context">
            <span className="navbar-context-empty">Loading...</span>
          </div>
          <div className="navbar-actions" />
        </nav>
        <div className="welcome-screen">
          <div className="loading-spinner" />
          <p className="text-secondary" style={{ marginTop: 'var(--space-4)' }}>
            {loadingMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-canvas">
      {/* 2026 UI: Unified Command Bar - Clean, organized, usable */}
      {hasProject && (
        <header className="command-bar">
          {/* Left Section: Project Identity */}
          <div className="command-bar-left">
            <div className="progress-ring" title={`${Math.round((stats.byColumn['done'] || 0) / Math.max(stats.total, 1) * 100)}% complete`}>
              <svg viewBox="0 0 36 36" className="progress-ring-svg">
                <defs>
                  <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#0070f3" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <circle cx="18" cy="18" r="15.5" className="progress-ring-bg" />
                <circle
                  cx="18" cy="18" r="15.5"
                  className="progress-ring-fill"
                  stroke="url(#progress-gradient)"
                  style={{
                    strokeDasharray: `${((stats.byColumn['done'] || 0) / Math.max(stats.total, 1)) * 97.5} 97.5`
                  }}
                />
              </svg>
              <span className="progress-ring-text">{stats.total}</span>
            </div>
            <ProjectSelector
              currentProject={currentProject}
              recentProjects={recentProjects}
              onSelectProject={handleSelectProject}
              onRenameProject={handleRenameProject}
              onRenameGroup={handleRenameGroup}
              onDeleteProject={handleDeleteProject}
              onOpenNew={handleOpenProject}
            />
          </div>

          {/* Center Section: Search */}
          <div className="command-bar-center">
            <div className="search-box">
              <Search className="w-4 h-4" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <kbd className="search-kbd">⌘K</kbd>
            </div>
          </div>

          {/* Right Section: Controls & Actions */}
          <div className="command-bar-right">
            {/* Filter Dropdown */}
            <div className="dropdown-container">
              <button
                className={`toolbar-btn ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-indicator' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
                title="Filters"
              >
                <Filter className="w-4 h-4" />
                <span className="toolbar-btn-label">Filter</span>
                {hasActiveFilters && <span className="toolbar-indicator" />}
              </button>
              {showFilters && (
                <div className="dropdown-panel">
                  <div className="dropdown-header">
                    <span>Filters</span>
                    <button className="dropdown-close" onClick={() => setShowFilters(false)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="dropdown-content">
                    <div className="filter-group">
                      <label className="filter-label">Priority</label>
                      <select className="filter-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                        <option value="">All</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    {categories.length > 0 && (
                      <div className="filter-group">
                        <label className="filter-label">Category</label>
                        <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                          <option value="">All</option>
                          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                    )}
                    {assignees.length > 0 && (
                      <div className="filter-group">
                        <label className="filter-label">Assignee</label>
                        <select className="filter-select" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
                          <option value="">All</option>
                          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                    )}
                    {allTags.length > 0 && (
                      <div className="filter-group">
                        <label className="filter-label">Tags</label>
                        <div className="filter-tags">
                          {allTags.map(tag => (
                            <button
                              key={tag}
                              className={`filter-tag ${filterTags.includes(tag) ? 'active' : ''}`}
                              onClick={() => toggleTagFilter(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasActiveFilters && (
                      <button className="clear-filters-btn" onClick={clearFilters}>Clear all</button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="toolbar-select">
              <ArrowUpDown className="w-4 h-4" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="manual">Manual</option>
                <option value="created-desc">Newest</option>
                <option value="created-asc">Oldest</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
              </select>
            </div>

            <div className="toolbar-divider" />

            {/* Utility Actions */}
            <button className="toolbar-btn" onClick={handleRefresh} title="Refresh (⌘R)">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button className="toolbar-btn" onClick={() => setShowColumnModal(true)} title="Manage Columns">
              <Columns className="w-4 h-4" />
            </button>
            <button className="toolbar-btn" onClick={() => setShowArchiveModal(true)} title="Archive">
              <Archive className="w-4 h-4" />
              {archivedTasks.length > 0 && <span className="toolbar-badge">{archivedTasks.length}</span>}
            </button>
            <button className="toolbar-btn" onClick={() => setShowSettingsModal(true)} title="Settings">
              <Settings className="w-4 h-4" />
            </button>

            <div className="toolbar-divider" />

            {/* Primary Action */}
            <button className="primary-action-btn" onClick={() => handleAddTask()}>
              <Plus className="w-4 h-4" />
              <span>New Task</span>
            </button>
          </div>
        </header>
      )}

      {/* Migration Banner - Below command bar, not overlapping */}
      {showLegacyBanner && hasProject && (
        <div className="migration-banner">
          <div className="migration-banner-icon">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="migration-banner-content">
            <strong>Legacy file detected</strong>
            <p>
              You're using <code>kanban.md</code>. Consider renaming to <code>tasks.md</code> for consistency.
            </p>
          </div>
          <div className="migration-banner-actions">
            <button className="btn btn-primary btn-sm" onClick={handleMigrateToTasks}>
              <ArrowRight className="w-4 h-4" />
              Rename to tasks.md
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleKeepLegacy}>
              <X className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {hasProject ? (
        <KanbanBoard
          columns={columns}
          tasks={filteredTasks}
          onTaskMove={handleTaskMove}
          onTaskClick={handleTaskClick}
          onTaskEdit={handleTaskEdit}
          onAddTask={handleAddTask}
          onArchiveAll={handleArchiveAllDone}
        />
      ) : (
        <div className="welcome-screen">
          <h1 className="welcome-title">
            Task <span className="welcome-title-accent">Memory</span>
          </h1>
          <p className="welcome-description">
            A local-first kanban board that syncs with your markdown files.
            Preserve your research, track your progress, own your data.
          </p>

          <div className="welcome-card">
            <h3 className="welcome-card-title">Getting Started</h3>

            <div className="welcome-steps">
              <div className="welcome-step">
                <div className="welcome-step-number">1</div>
                <div className="welcome-step-content">
                  <h4>Open a project folder</h4>
                  <p>Select your project's tasks directory</p>
                </div>
              </div>
              <div className="welcome-step">
                <div className="welcome-step-number">2</div>
                <div className="welcome-step-content">
                  <h4>Manage your tasks</h4>
                  <p>Drag and drop tasks between columns</p>
                </div>
              </div>
              <div className="welcome-step">
                <div className="welcome-step-number">3</div>
                <div className="welcome-step-content">
                  <h4>Auto-sync</h4>
                  <p>Changes save automatically to markdown</p>
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleOpenProject}
            >
              <FolderOpen className="w-5 h-5" />
              Open Project Folder
            </button>

            {recentProjects.length > 0 && (
              <div style={{ marginTop: 'var(--space-5)' }}>
                <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 'var(--space-3)', textAlign: 'center' }}>
                  Recent Projects
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {recentProjects.slice(0, 3).map((project, index) => (
                    <button
                      key={`${project.name}-${index}`}
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={() => handleSelectProject(project)}
                    >
                      <FolderOpen className="w-4 h-4" />
                      {project.displayName || project.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={showTaskModal}
        onClose={() => {
          setShowTaskModal(false);
          setSelectedTask(null);
        }}
        onEdit={handleTaskEdit}
        onSubtaskToggle={handleSubtaskToggle}
        onArchive={handleArchiveTask}
        onAddSubtask={handleAddSubtask}
        onDeleteSubtask={handleDeleteSubtask}
        onUpdateSubtask={handleUpdateSubtask}
        onReorderSubtask={handleReorderSubtask}
        onPreWorkToggle={handlePreWorkToggle}
        onAddPreWork={handleAddPreWork}
        onDeletePreWork={handleDeletePreWork}
        onUpdatePreWork={handleUpdatePreWork}
        onReorderPreWork={handleReorderPreWork}
      />

      {/* Task Form Modal */}
      <TaskForm
        task={editingTask}
        columns={columns}
        categories={categories}
        assignees={assignees}
        isOpen={showTaskForm}
        onClose={() => {
          setShowTaskForm(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      {/* Settings Modal */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="Settings"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Theme Selection */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Theme</label>
            <div className="theme-buttons">
              {Object.entries(THEMES).map(([key, { label, icon: Icon }]) => (
                <button
                  key={key}
                  className={`btn ${theme === key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleThemeChange(key)}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Current Project */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Current Project</label>
            <div className="input" style={{ display: 'flex', alignItems: 'center' }}>
              <span className={currentProject ? '' : 'text-muted'}>
                {currentProject?.displayName || currentProject?.name || 'No project selected'}
              </span>
            </div>
          </div>

          {/* Task File Selection — supports multi-kanban monorepos */}
          {hasProject && availableTaskFiles.length > 0 && (() => {
            const currentPath = currentProject?.taskFilePath ?? '';
            const currentKey = `${currentPath}:${currentTaskFileName || ''}`;
            const labelFor = (f) => {
              const base = f.relativePath
                ? `${f.relativePath}/${f.fileName}`
                : f.fileName;
              return f.isLegacy ? `${base} (legacy)` : base;
            };
            return (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label">
                  Task File
                  {availableTaskFiles.length > 1 && (
                    <span
                      className="text-muted"
                      style={{ marginLeft: 'var(--space-2)', fontSize: '0.75rem' }}
                    >
                      ({availableTaskFiles.length} kanbans)
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <select
                    className="input select"
                    value={currentKey}
                    onChange={(e) => handleSwitchTaskFile(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    {availableTaskFiles.map(f => {
                      const key = `${f.relativePath}:${f.fileName}`;
                      return (
                        <option key={key} value={key}>{labelFor(f)}</option>
                      );
                    })}
                  </select>
                </div>
                <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 'var(--space-1)' }}>
                  Current: {currentPath ? `${currentPath}/${currentTaskFileName}` : (currentTaskFileName || 'None')}
                  {currentTaskFileName === 'kanban.md' && ' (legacy)'}
                </p>
              </div>
            );
          })()}

          <button
            className="btn btn-secondary"
            onClick={handleOpenProject}
          >
            <FolderOpen className="w-4 h-4" />
            Open Different Project
          </button>

          {lastSaved && (
            <p className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
              Last saved: {lastSaved.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="modal-footer" style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-primary" onClick={() => setShowSettingsModal(false)}>
            Done
          </button>
        </div>
      </Modal>

      {/* Column Manager Modal */}
      <ColumnManagerModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        columns={columns}
        onSave={(newColumns) => {
          setColumns(newColumns);
          setShowColumnModal(false);
          // Pass new columns directly to avoid async state timing issues
          handleSaveFile(newColumns);
        }}
      />

      {/* Archive Modal */}
      {/* Smart Archive Modal */}
      {showSmartArchiveModal && smartArchiveColumn && (
        <SmartArchiveModal
          isOpen={showSmartArchiveModal}
          onClose={() => setShowSmartArchiveModal(false)}
          columnId={smartArchiveColumn}
          tasks={tasks.filter(t => t.column === smartArchiveColumn)}
          fileStats={fileStats}
          onArchive={handleSmartArchive}
        />
      )}

      <ArchiveModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        archivedTasks={archivedTasks}
        onRestore={handleRestoreTask}
        onDelete={handleDeleteArchivedTask}
      />

      <Modal
        isOpen={!!pendingOpenHandle}
        onClose={handleCancelOpenProject}
        title="Open Project"
      >
        <div className="form-group">
          <label className="label" htmlFor="open-project-name">Display name</label>
          <input
            id="open-project-name"
            type="text"
            className="input"
            value={openDialogName}
            onChange={(e) => setOpenDialogName(e.target.value)}
            placeholder={pendingOpenHandle?.name || 'Project name'}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmOpenProject(); }}
          />
          {pendingOpenHandle && (
            <div className="project-selector-folder-name" style={{ marginTop: 4 }}>
              folder: {pendingOpenHandle.name}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="label" htmlFor="open-project-group">Group (optional)</label>
          <input
            id="open-project-group"
            type="text"
            className="input"
            list="open-project-group-list"
            value={openDialogGroup}
            onChange={(e) => setOpenDialogGroup(e.target.value)}
            placeholder="e.g. kepptic, clients, personal"
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmOpenProject(); }}
          />
          <datalist id="open-project-group-list">
            {Array.from(new Set(recentProjects.map((p) => p.group).filter(Boolean))).map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={handleCancelOpenProject}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirmOpenProject}>Open</button>
        </div>
      </Modal>

      {/* Mobile FAB - Floating Action Button for New Task */}
      {hasProject && (
        <button
          className="mobile-fab"
          onClick={() => handleAddTask()}
          aria-label="Create new task"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Toast Notifications */}
      {notification && (
        <Toast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
}

export default App;
