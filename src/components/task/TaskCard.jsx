import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil } from 'lucide-react';

const priorityConfig = {
  critical: { className: 'badge-priority-critical', label: 'Critical' },
  high: { className: 'badge-priority-high', label: 'High' },
  medium: { className: 'badge-priority-medium', label: 'Medium' },
  low: { className: 'badge-priority-low', label: 'Low' },
};

const workflowConfig = {
  feature: { className: 'badge-workflow-feature', label: 'Feature' },
  refactor: { className: 'badge-workflow-refactor', label: 'Refactor' },
  investigation: { className: 'badge-workflow-investigation', label: 'Invest.' },
  migration: { className: 'badge-workflow-migration', label: 'Migrate' },
  simple: { className: 'badge-workflow-simple', label: 'Simple' },
};

const complexityConfig = {
  simple: { className: 'badge-complexity-simple', label: 'Simple' },
  standard: { className: 'badge-complexity-standard', label: 'Std' },
  complex: { className: 'badge-complexity-complex', label: 'Complex' },
};

// Presentational component - no hooks, used in DragOverlay
// Memoized to prevent unnecessary re-renders
export const TaskCardContent = memo(function TaskCardContent({ task, onEdit, onClick, isDragging = false }) {
  const priority = task.priority?.toLowerCase() || 'medium';
  const priorityInfo = priorityConfig[priority] || priorityConfig.medium;

  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(st => st.completed).length;
  const progress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0;

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit?.(task);
  };

  // Build accessible description for screen readers
  const accessibleDescription = [
    task.title,
    `Priority: ${priorityInfo.label}`,
    task.category && `Category: ${task.category}`,
    subtasks.length > 0 && `${completedSubtasks} of ${subtasks.length} subtasks complete`,
  ].filter(Boolean).join('. ');

  return (
    <article
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      onClick={() => onClick?.(task)}
      aria-label={accessibleDescription}
      aria-describedby={`task-${task.id}-title`}
    >
      {/* Header */}
      <div className="task-card-header">
        <span className="task-card-id">{task.id}</span>
        <button
          className="btn btn-ghost btn-icon btn-sm task-card-edit-btn"
          onClick={handleEditClick}
          aria-label="Edit task"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>

      {/* Title */}
      <h3 id={`task-${task.id}-title`} className="task-card-title">{task.title}</h3>

      {/* Description */}
      {task.description && (
        <p className="task-card-description">{task.description}</p>
      )}

      {/* Badges */}
      <div className="task-card-badges">
        <span className={`badge ${priorityInfo.className}`}>
          {priorityInfo.label}
        </span>

        {task.workflow && workflowConfig[task.workflow.toLowerCase()] && (
          <span className={`badge ${workflowConfig[task.workflow.toLowerCase()].className}`}>
            {workflowConfig[task.workflow.toLowerCase()].label}
          </span>
        )}

        {task.complexity && complexityConfig[task.complexity.toLowerCase()] && (
          <span className={`badge ${complexityConfig[task.complexity.toLowerCase()].className}`}>
            {complexityConfig[task.complexity.toLowerCase()].label}
          </span>
        )}

        {task.category && (
          <span className="badge badge-category">{task.category}</span>
        )}

        {task.assignee && (
          <span className="badge badge-tag">{task.assignee}</span>
        )}

        {task.tags?.slice(0, 2).map((tag, index) => (
          <span key={index} className="badge badge-tag">{tag}</span>
        ))}
      </div>

      {/* Progress */}
      {subtasks.length > 0 && (
        <div className="task-card-progress">
          <div className="task-card-progress-bar">
            <div
              className="task-card-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="task-card-progress-text">
            <span>{completedSubtasks} of {subtasks.length} subtasks</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      )}
    </article>
  );
});

// Sortable wrapper - uses useSortable hook
// Memoized to prevent unnecessary re-renders
export const TaskCard = memo(function TaskCard({ task, onEdit, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  // Use Translate (not Transform) to avoid scale which causes jumping
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    // When dragging, fade original but keep space
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <TaskCardContent
        task={task}
        onEdit={onEdit}
        onClick={onClick}
      />
    </div>
  );
});

export default TaskCard;
