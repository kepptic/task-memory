import React, { useState, useMemo } from 'react';
import Modal from '../common/Modal';
import {
  Search,
  X,
  ArrowUpDown,
  RotateCcw,
  Trash2,
  Calendar,
  Tag,
  User,
  FolderOpen,
  Clock,
  AlertTriangle,
  Archive,
} from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently Archived', field: 'completed', dir: 'desc' },
  { value: 'oldest', label: 'Oldest First', field: 'completed', dir: 'asc' },
  { value: 'priority', label: 'Priority', field: 'priority', dir: 'desc' },
  { value: 'title', label: 'Title (A-Z)', field: 'title', dir: 'asc' },
];

const PRIORITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

export function ArchiveModal({
  isOpen,
  onClose,
  archivedTasks,
  onRestore,
  onDelete,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  // Filter and sort archived tasks
  const filteredTasks = useMemo(() => {
    let filtered = [...archivedTasks];

    // Search filter
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter(task =>
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.id?.toLowerCase().includes(query) ||
        task.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Sort
    const sortConfig = SORT_OPTIONS.find(s => s.value === sortBy);
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aVal, bVal;

        if (sortConfig.field === 'priority') {
          aVal = PRIORITY_ORDER[a.priority?.toLowerCase()] || 0;
          bVal = PRIORITY_ORDER[b.priority?.toLowerCase()] || 0;
        } else if (sortConfig.field === 'title') {
          aVal = a.title?.toLowerCase() || '';
          bVal = b.title?.toLowerCase() || '';
        } else {
          aVal = a[sortConfig.field] || '';
          bVal = b[sortConfig.field] || '';
        }

        if (sortConfig.dir === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
    }

    return filtered;
  }, [archivedTasks, searchTerm, sortBy]);

  const handleRestore = (task) => {
    if (window.confirm(`Restore "${task.title}" to the kanban board?`)) {
      onRestore?.(task);
    }
  };

  const handleDelete = (task) => {
    if (window.confirm(`Permanently delete "${task.title}"? This cannot be undone.`)) {
      onDelete?.(task);
    }
  };

  const getPriorityClass = (priority) => {
    const p = priority?.toLowerCase();
    if (p === 'critical') return 'badge-priority-critical';
    if (p === 'high') return 'badge-priority-high';
    if (p === 'medium') return 'badge-priority-medium';
    return 'badge-priority-low';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Archives"
      size="large"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Search and Sort Controls */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div className="input-with-icon" style={{ flex: 1 }}>
            <Search className="input-icon w-4 h-4" />
            <input
              type="text"
              className="input"
              placeholder="Search archived tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="btn btn-ghost btn-sm btn-icon"
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)' }}
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <ArrowUpDown className="w-4 h-4 text-muted" />
            <select
              className="input select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ width: '10rem' }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Task Count */}
        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'} archived
          {searchTerm && ` (filtered from ${archivedTasks.length})`}
        </div>

        {/* Task List */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          maxHeight: '50vh',
          overflowY: 'auto',
          paddingRight: 'var(--space-2)',
        }}>
          {filteredTasks.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-8)',
              color: 'var(--text-muted)',
            }}>
              <Archive className="w-12 h-12" style={{ margin: '0 auto var(--space-4)', opacity: 0.5 }} />
              <p>{searchTerm ? 'No matching archived tasks' : 'No archived tasks'}</p>
            </div>
          ) : (
            filteredTasks.map(task => (
              <div
                key={task.id}
                className="archive-task-card"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span className="task-card-id" style={{ fontSize: '0.6875rem' }}>{task.id}</span>
                    {task.priority && (
                      <span className={`badge ${getPriorityClass(task.priority)}`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => handleRestore(task)}
                      title="Restore to kanban"
                      aria-label={`Restore ${task.title} to kanban`}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => handleDelete(task)}
                      title="Delete permanently"
                      aria-label={`Permanently delete ${task.title}`}
                      style={{ color: 'var(--status-critical)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h4 style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  marginBottom: 'var(--space-2)',
                }}>
                  {task.title}
                </h4>

                {/* Description */}
                {task.description && (
                  <p style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-3)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {task.description}
                  </p>
                )}

                {/* Metadata */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {task.category && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                      <FolderOpen className="w-3 h-3" />
                      {task.category}
                    </span>
                  )}
                  {task.assignee && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                      <User className="w-3 h-3" />
                      {task.assignee}
                    </span>
                  )}
                  {task.completed && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                      <Clock className="w-3 h-3" />
                      Archived {task.completed}
                    </span>
                  )}
                </div>

                {/* Tags */}
                {task.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                    {task.tags.slice(0, 4).map((tag, index) => (
                      <span key={index} className="badge badge-tag">{tag}</span>
                    ))}
                    {task.tags.length > 4 && (
                      <span className="badge badge-tag">+{task.tags.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Subtask Progress */}
                {task.subtasks?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <div className="task-card-progress-bar" style={{ height: '4px' }}>
                      <div
                        className="task-card-progress-fill"
                        style={{
                          width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%`
                        }}
                      />
                    </div>
                    <div className="task-card-progress-text">
                      <span>Subtasks</span>
                      <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export default ArchiveModal;
