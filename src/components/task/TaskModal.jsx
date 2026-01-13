import React, { useState } from 'react';
import Modal from '../common/Modal';
import { markdownToHtml } from '../../utils/markdown';
import {
  CheckCircle2,
  Circle,
  Clock,
  User,
  Tag,
  FolderOpen,
  AlertTriangle,
  FileText,
  List,
  Calendar,
  PlayCircle,
  Target,
  CheckSquare,
  Activity,
  Archive,
  Plus,
  Trash2,
} from 'lucide-react';

const priorityConfig = {
  critical: { className: 'badge-priority-critical', label: 'Critical', icon: AlertTriangle },
  high: { className: 'badge-priority-high', label: 'High', icon: AlertTriangle },
  medium: { className: 'badge-priority-medium', label: 'Medium', icon: Clock },
  low: { className: 'badge-priority-low', label: 'Low', icon: Clock },
};

export function TaskModal({ task, isOpen, onClose, onEdit, onSubtaskToggle, onArchive, onAddSubtask, onDeleteSubtask }) {
  const [newSubtask, setNewSubtask] = useState('');

  if (!task) return null;

  const priority = task.priority?.toLowerCase() || 'medium';
  const priorityInfo = priorityConfig[priority] || priorityConfig.medium;
  const PriorityIcon = priorityInfo.icon;

  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(st => st.completed).length;
  const progress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0;

  const handleSubtaskClick = (subtaskIndex) => {
    onSubtaskToggle?.(task.id, subtaskIndex);
  };

  const handleAddSubtask = () => {
    const text = newSubtask.trim();
    if (text) {
      onAddSubtask?.(task.id, text);
      setNewSubtask('');
    }
  };

  const handleDeleteSubtask = (e, index) => {
    e.stopPropagation();
    if (window.confirm('Delete this subtask?')) {
      onDeleteSubtask?.(task.id, index);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task.title}
      size="large"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Task ID and Priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span className="task-card-id" style={{ fontSize: '0.8125rem' }}>{task.id}</span>
          <span className={`badge ${priorityInfo.className}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <PriorityIcon className="w-3 h-3" />
            {priorityInfo.label}
          </span>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontSize: '0.8125rem', fontWeight: 500 }}>
              <FileText className="w-4 h-4" />
              Description
            </div>
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(task.description) }}
            />
          </div>
        )}

        {/* Metadata Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
          {task.category && (
            <div>
              <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <FolderOpen className="w-3 h-3" />
                Category
              </div>
              <span className="badge badge-category">{task.category}</span>
            </div>
          )}

          {task.assignee && (
            <div>
              <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <User className="w-3 h-3" />
                Assignee
              </div>
              <span className="badge badge-tag">{task.assignee}</span>
            </div>
          )}

          {task.tags?.length > 0 && (
            <div>
              <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Tag className="w-3 h-3" />
                Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                {task.tags.map((tag, index) => (
                  <span key={index} className="badge badge-tag">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date Fields */}
        {(task.created || task.started || task.due || task.finished) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
            {task.created && (
              <div>
                <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Calendar className="w-3 h-3" />
                  Created
                </div>
                <span style={{ fontSize: '0.8125rem' }}>{task.created}</span>
              </div>
            )}
            {task.started && (
              <div>
                <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <PlayCircle className="w-3 h-3" />
                  Started
                </div>
                <span style={{ fontSize: '0.8125rem' }}>{task.started}</span>
              </div>
            )}
            {task.due && (
              <div>
                <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Target className="w-3 h-3" />
                  Due
                </div>
                <span style={{ fontSize: '0.8125rem', color: task.due && new Date(task.due) < new Date() ? 'var(--status-critical)' : undefined }}>{task.due}</span>
              </div>
            )}
            {task.finished && (
              <div>
                <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-1)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <CheckSquare className="w-3 h-3" />
                  Finished
                </div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--status-complete)' }}>{task.finished}</span>
              </div>
            )}
          </div>
        )}

        {/* Subtasks */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.8125rem', fontWeight: 500 }}>
              <List className="w-4 h-4" />
              Subtasks
            </div>
            {subtasks.length > 0 && (
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                {completedSubtasks} / {subtasks.length} completed
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {subtasks.length > 0 && (
            <div className="task-card-progress-bar" style={{ marginBottom: 'var(--space-3)', height: '6px' }}>
              <div className="task-card-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Add Subtask Input */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <input
              type="text"
              className="input"
              placeholder="Add a subtask..."
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSubtask();
                }
              }}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-icon"
              onClick={handleAddSubtask}
              disabled={!newSubtask.trim()}
              aria-label="Add subtask"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Subtask List */}
          {subtasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {subtasks.map((subtask, index) => (
                <div
                  key={index}
                  onClick={() => handleSubtaskClick(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'background var(--duration-fast) var(--ease-in-out)',
                  }}
                  className="subtask-item"
                >
                  {subtask.completed ? (
                    <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-complete)', flexShrink: 0 }} />
                  ) : (
                    <Circle className="w-5 h-5 text-muted" style={{ flexShrink: 0 }} />
                  )}
                  <span style={{
                    flex: 1,
                    fontSize: '0.875rem',
                    color: subtask.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: subtask.completed ? 'line-through' : 'none',
                  }}>
                    {subtask.text}
                  </span>
                  <button
                    className="btn btn-ghost btn-icon btn-sm subtask-delete-btn"
                    onClick={(e) => handleDeleteSubtask(e, index)}
                    title="Delete subtask"
                    aria-label={`Delete subtask: ${subtask.text}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Visual Operations Log */}
        {task.visualOpsLog?.length > 0 && (
          <div>
            <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontSize: '0.8125rem', fontWeight: 500 }}>
              <Activity className="w-4 h-4" />
              Visual Operations Log
            </div>
            <div className="font-mono" style={{
              background: 'var(--surface-elevated)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              fontSize: '0.75rem',
              maxHeight: '10rem',
              overflowY: 'auto',
            }}>
              {task.visualOpsLog.map((entry, index) => (
                <div key={index} style={{
                  padding: 'var(--space-1) 0',
                  borderBottom: index < task.visualOpsLog.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  color: entry.includes('WebFetch') ? 'var(--accent-primary)' :
                         entry.includes('WebSearch') ? 'var(--priority-medium)' :
                         entry.includes('Error') ? 'var(--status-critical)' : 'var(--text-secondary)',
                }}>
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {task.notes && (
          <div>
            <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontSize: '0.8125rem', fontWeight: 500 }}>
              <FileText className="w-4 h-4" />
              Notes
            </div>
            <div
              className="markdown-content"
              style={{
                background: 'var(--surface-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                maxHeight: '20rem',
                overflowY: 'auto',
              }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(task.notes) }}
            />
          </div>
        )}

        {/* Actions */}
        <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
          <button
            className="btn btn-ghost"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              if (window.confirm(`Archive "${task.title}"?`)) {
                onArchive?.(task);
              }
            }}
            title="Archive task"
          >
            <Archive className="w-4 h-4" />
            Archive
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={() => onEdit?.(task)}>
            Edit Task
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default TaskModal;
