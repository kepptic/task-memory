import React from 'react';
import Modal from '../common/Modal';
import ChecklistSection from './ChecklistSection';
import { markdownToHtml } from '../../utils/markdown';
import {
  Clock,
  User,
  Tag,
  FolderOpen,
  AlertTriangle,
  AlertCircle,
  FileText,
  List,
  Calendar,
  PlayCircle,
  Target,
  CheckSquare,
  Activity,
  Archive,
  GitBranch,
  Layers,
  Shield,
} from 'lucide-react';

const priorityConfig = {
  critical: { className: 'badge-priority-critical', label: 'Critical', icon: AlertTriangle },
  high: { className: 'badge-priority-high', label: 'High', icon: AlertTriangle },
  medium: { className: 'badge-priority-medium', label: 'Medium', icon: Clock },
  low: { className: 'badge-priority-low', label: 'Low', icon: Clock },
};

const workflowConfig = {
  feature: { className: 'badge-workflow-feature', label: 'Feature' },
  refactor: { className: 'badge-workflow-refactor', label: 'Refactor' },
  investigation: { className: 'badge-workflow-investigation', label: 'Investigation' },
  migration: { className: 'badge-workflow-migration', label: 'Migration' },
  simple: { className: 'badge-workflow-simple', label: 'Simple' },
};

const complexityConfig = {
  simple: { className: 'badge-complexity-simple', label: 'Simple', description: '1-2 files' },
  standard: { className: 'badge-complexity-standard', label: 'Standard', description: '3-10 files' },
  complex: { className: 'badge-complexity-complex', label: 'Complex', description: '10+ files' },
};

export function TaskModal({
  task,
  isOpen,
  onClose,
  onEdit,
  onArchive,
  // Subtask handlers
  onSubtaskToggle,
  onAddSubtask,
  onDeleteSubtask,
  onUpdateSubtask,
  onReorderSubtask,
  // Pre-work checklist handlers
  onPreWorkToggle,
  onAddPreWork,
  onDeletePreWork,
  onUpdatePreWork,
  onReorderPreWork,
}) {
  if (!task) return null;

  const priority = task.priority?.toLowerCase() || 'medium';
  const priorityInfo = priorityConfig[priority] || priorityConfig.medium;
  const PriorityIcon = priorityInfo.icon;

  const subtasks = task.subtasks || [];
  const preWorkChecklist = task.preWorkChecklist || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task.title}
      size="large"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Task ID, Priority, Workflow, Complexity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <span className="task-card-id" style={{ fontSize: '0.8125rem' }}>{task.id}</span>
          <span className={`badge ${priorityInfo.className}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <PriorityIcon className="w-3 h-3" />
            {priorityInfo.label}
          </span>
          {task.workflow && (
            <span className={`badge ${workflowConfig[task.workflow.toLowerCase()]?.className || 'badge-tag'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <GitBranch className="w-3 h-3" />
              {workflowConfig[task.workflow.toLowerCase()]?.label || task.workflow}
            </span>
          )}
          {task.complexity && (
            <span className={`badge ${complexityConfig[task.complexity.toLowerCase()]?.className || 'badge-tag'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title={complexityConfig[task.complexity.toLowerCase()]?.description}>
              <Layers className="w-3 h-3" />
              {complexityConfig[task.complexity.toLowerCase()]?.label || task.complexity}
            </span>
          )}
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

        {/* Pre-Work Checklist */}
        <ChecklistSection
          title="Pre-Work Checklist"
          icon={Shield}
          iconColor="var(--status-pending)"
          borderColor="var(--status-pending)"
          itemBorderColor={(completed) => completed ? 'var(--status-complete)' : 'var(--status-pending)'}
          items={preWorkChecklist}
          onToggle={(index) => onPreWorkToggle?.(task.id, index)}
          onAdd={onAddPreWork ? (text, position, completed) => onAddPreWork(task.id, text, position, completed) : null}
          onDelete={onDeletePreWork ? (index) => onDeletePreWork(task.id, index) : null}
          onUpdate={onUpdatePreWork ? (index, text) => onUpdatePreWork(task.id, index, text) : null}
          onReorder={onReorderPreWork ? (from, to) => onReorderPreWork(task.id, from, to) : null}
          placeholder="Add checklist item... (Enter to add)"
          emptyMessage="Add items to verify before starting"
          badge="Required"
          showProgress={false}
        />

        {/* Subtasks */}
        <ChecklistSection
          title="Subtasks"
          icon={List}
          iconColor="var(--accent-primary)"
          borderColor="var(--accent-primary)"
          itemBorderColor={(completed) => completed ? 'var(--status-complete)' : 'var(--accent-primary)'}
          items={subtasks}
          onToggle={(index) => onSubtaskToggle?.(task.id, index)}
          onAdd={onAddSubtask ? (text, position, completed) => onAddSubtask(task.id, text, position, completed) : null}
          onDelete={onDeleteSubtask ? (index) => onDeleteSubtask(task.id, index) : null}
          onUpdate={onUpdateSubtask ? (index, text) => onUpdateSubtask(task.id, index, text) : null}
          onReorder={onReorderSubtask ? (from, to) => onReorderSubtask(task.id, from, to) : null}
          placeholder="Add a subtask... (Enter to add)"
          emptyMessage="Break this task into smaller steps"
          showProgress={true}
        />

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

        {/* Errors Log */}
        {task.errorsLog?.length > 0 && (
          <div>
            <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontSize: '0.8125rem', fontWeight: 500 }}>
              <AlertCircle className="w-4 h-4" style={{ color: 'var(--status-critical)' }} />
              Errors Log
            </div>
            <div className="font-mono" style={{
              background: 'var(--surface-elevated)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              fontSize: '0.75rem',
              maxHeight: '10rem',
              overflowY: 'auto',
              borderLeft: '3px solid var(--status-critical)',
            }}>
              {task.errorsLog.map((entry, index) => (
                <div key={index} style={{
                  padding: 'var(--space-1) 0',
                  borderBottom: index < task.errorsLog.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  color: 'var(--status-critical)',
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
