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
} from 'lucide-react';

import KanbanBoard from './components/kanban/KanbanBoard';
import TaskModal from './components/task/TaskModal';
import TaskForm from './components/task/TaskForm';
import Modal from './components/common/Modal';
import { ColumnManagerModal } from './components/settings/ColumnManager';
import ProjectSelector from './components/common/ProjectSelector';
import ArchiveModal from './components/archive/ArchiveModal';
import Toast from './components/common/Toast';

import { markdownParser } from './utils/markdown';
import { fileSystem } from './utils/fileSystem';
import { fileWatcher } from './utils/fileWatcher';

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
              {[0, 3, 7, 14, 30, 60].map(days => (
                <button
                  key={days}
                  className={`btn ${keepDays === days ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setKeepDays(days)}
                >
                  {days === 0 ? 'Archive all' : `${days} days`}
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
  const [showSmartArchiveModal, setShowSmartArchiveModal] = useState(false);
  const [smartArchiveColumn, setSmartArchiveColumn] = useState(null);

  // Theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('task-memory-theme') || 'dark';
  });

  // File watcher ref
  const fileWatcherStartedRef = useRef(false);

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
  const loadProjectFromHandle = async (dirHandle, projectInfo = null) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Loading project files...');

      // Store directory handle
      setDirectoryHandle(dirHandle);
      fileSystem.setDirectoryHandle(dirHandle);

      // Load kanban.md from directory
      const kanbanResult = await fileSystem.loadKanbanFile(dirHandle);
      setFileHandle(kanbanResult.fileHandle);

      // Parse content
      const parsed = markdownParser.parseMarkdown(kanbanResult.content);

      if (parsed.config?.columns?.length > 0) {
        setColumns(parsed.config.columns.map(col => ({
          id: col.id || col.name,
          name: col.name,
        })));
      }

      const mappedTasks = (parsed.tasks || []).map(task => ({
        ...task,
        column: task.status || 'To Do',
      }));

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

      // Save to recent projects
      await fileSystem.saveDirectoryHandle(dirHandle);

      // Update recent projects list
      const projects = await fileSystem.loadRecentProjects();
      setRecentProjects(projects);

      // Set current project
      setCurrentProject(projectInfo || {
        name: dirHandle.name,
        displayName: dirHandle.name,
        handle: dirHandle,
        lastAccessed: Date.now(),
      });

      // Start file watcher
      if (!fileWatcherStartedRef.current && kanbanResult.fileHandle) {
        fileWatcher.setCurrentContent(kanbanResult.content);
        fileWatcher.startFileWatcher(kanbanResult.fileHandle, {
          onExternalChange: (newContent) => {
            const newParsed = markdownParser.parseMarkdown(newContent);
            if (newParsed.config?.columns?.length > 0) {
              setColumns(newParsed.config.columns.map(col => ({
                id: col.id || col.name,
                name: col.name,
              })));
            }
            const newMappedTasks = (newParsed.tasks || []).map(task => ({
              ...task,
              column: task.status || 'To Do',
            }));
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
        await loadProjectFromHandle(handle);
      }
    } catch (error) {
      console.error('Failed to open project:', error);
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

  // Save file - accepts optional overrides for columns (for async state timing)
  const handleSaveFile = useCallback(async (overrideColumns = null) => {
    console.log('📝 handleSaveFile called', { fileHandle: !!fileHandle, overrideColumns: !!overrideColumns });

    if (!fileHandle) {
      console.warn('⚠️ No fileHandle - cannot save');
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

      const config = {
        lastTaskId: Math.max(...tasks.map(t => {
          const match = t.id?.match(/TASK-(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        }), 0),
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
      const parsed = markdownParser.parseMarkdown(content);

      if (parsed.config?.columns?.length > 0) {
        setColumns(parsed.config.columns.map(col => ({
          id: col.id || col.name,
          name: col.name,
        })));
      }

      const mappedTasks = (parsed.tasks || []).map(task => ({
        ...task,
        column: task.status || 'To Do',
      }));

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
    setTasks(prev => {
      if (!taskData.id) {
        const maxId = prev.reduce((max, t) => {
          const match = t.id?.match(/TASK-(\d+)/);
          if (match) {
            return Math.max(max, parseInt(match[1], 10));
          }
          return max;
        }, 0);
        taskData.id = `TASK-${String(maxId + 1).padStart(3, '0')}`;
      }

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

  const handleAddSubtask = (taskId, text) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const subtasks = [...(task.subtasks || []), { text, completed: false }];
      return { ...task, subtasks };
    }));
    // Also update selectedTask if viewing
    setSelectedTask(prev => {
      if (prev?.id !== taskId) return prev;
      const subtasks = [...(prev.subtasks || []), { text, completed: false }];
      return { ...prev, subtasks };
    });
    showNotification('Subtask added');
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
    showNotification('Subtask deleted');
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

  // Auto-save
  useEffect(() => {
    if (!fileHandle || tasks.length === 0) return;

    const timer = setTimeout(() => {
      handleSaveFile();
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
          <div className="navbar-brand">
            <div className="navbar-logo">
              <Archive className="w-5 h-5" />
            </div>
            <h1 className="navbar-title">Task Memory</h1>
          </div>
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
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="navbar-title">Task Memory</h1>
            {hasProject && (
              <ProjectSelector
                currentProject={currentProject}
                recentProjects={recentProjects}
                onSelectProject={handleSelectProject}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onOpenNew={handleOpenProject}
              />
            )}
          </div>
        </div>

        {hasProject && tasks.length > 0 && (
          <div className="navbar-stats">
            {columns.slice(0, 4).map(col => (
              <div key={col.id} className="navbar-stat">
                <span>{col.name}</span>
                <span className="badge badge-count">{stats.byColumn[col.id] || 0}</span>
              </div>
            ))}
            {/* File size indicator */}
            <div
              className="navbar-stat"
              title={`File size: ~${Math.round(fileStats.totalChars / 1000)}k chars (${fileStats.percentage}% of safe limit)`}
              style={{
                color: fileStats.isCritical ? 'var(--status-error)' :
                       fileStats.isWarning ? 'var(--status-warning)' : 'var(--text-muted)',
              }}
            >
              {fileStats.isCritical ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span className={`badge ${fileStats.isCritical ? 'badge-priority-critical' : fileStats.isWarning ? 'badge-priority-high' : 'badge-count'}`}>
                {fileStats.percentage}%
              </span>
            </div>
          </div>
        )}

        <div className="navbar-actions">
          {hasProject && (
            <>
              <button
                className="btn btn-ghost btn-icon"
                onClick={handleRefresh}
                title="Refresh"
                aria-label="Refresh tasks"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowColumnModal(true)}
                title="Manage Columns"
                aria-label="Manage columns"
              >
                <Columns className="w-5 h-5" />
              </button>

              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowArchiveModal(true)}
                title="Archives"
                aria-label="View archived tasks"
                style={{ position: 'relative' }}
              >
                <Archive className="w-5 h-5" />
                {archivedTasks.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '0',
                    right: '0',
                    background: 'var(--accent-primary)',
                    color: 'var(--text-inverse)',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    minWidth: '1rem',
                    height: '1rem',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 0.25rem',
                  }}>
                    {archivedTasks.length}
                  </span>
                )}
              </button>
            </>
          )}

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setShowSettingsModal(true)}
            title="Settings"
            aria-label="Open settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {hasProject && (
            <button
              className="btn btn-primary"
              onClick={() => handleAddTask()}
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          )}
        </div>
      </nav>

      {/* Filter Bar - only show when project loaded */}
      {hasProject && (
        <div className="filter-bar">
          <div className="filter-bar-content">
            {/* Search */}
            <div className="input-with-icon" style={{ flex: '1', maxWidth: '20rem' }}>
              <Search className="input-icon w-5 h-5" />
              <input
                type="text"
                className="input"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)' }}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Toggle */}
            <button
              className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>

            {/* Sort Dropdown */}
            <div className="filter-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
              <ArrowUpDown className="w-4 h-4 text-muted" />
              <select
                className="input select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ width: 'auto', minWidth: '10rem' }}
              >
                <option value="manual">Manual</option>
                <option value="created-desc">Newest First</option>
                <option value="created-asc">Oldest First</option>
                <option value="priority">Priority</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          {showFilters && (
            <div className="filter-bar-expanded">
              <div className="filter-group">
                <label className="filter-label">Priority</label>
                <select
                  className="input select"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  style={{ width: '10rem' }}
                >
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
                  <select
                    className="input select"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    style={{ width: '10rem' }}
                  >
                    <option value="">All</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              {assignees.length > 0 && (
                <div className="filter-group">
                  <label className="filter-label">Assignee</label>
                  <select
                    className="input select"
                    value={filterAssignee}
                    onChange={(e) => setFilterAssignee(e.target.value)}
                    style={{ width: '10rem' }}
                  >
                    <option value="">All</option>
                    {assignees.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              )}

              {allTags.length > 0 && (
                <div className="filter-group" style={{ flex: 1 }}>
                  <label className="filter-label">Tags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        className={`badge ${filterTags.includes(tag) ? 'badge-priority-medium' : 'badge-tag'}`}
                        onClick={() => toggleTagFilter(tag)}
                        style={{ cursor: 'pointer' }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', paddingTop: 'var(--space-3)' }}>
              {filterPriority && (
                <span className="badge badge-tag" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  Priority: {filterPriority}
                  <button onClick={() => setFilterPriority('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterCategory && (
                <span className="badge badge-tag" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  Category: {filterCategory}
                  <button onClick={() => setFilterCategory('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterAssignee && (
                <span className="badge badge-tag" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  Assignee: {filterAssignee}
                  <button onClick={() => setFilterAssignee('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterTags.map(tag => (
                <span key={tag} className="badge badge-tag" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  #{tag}
                  <button onClick={() => toggleTagFilter(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
