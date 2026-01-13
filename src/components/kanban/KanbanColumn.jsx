import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Archive } from 'lucide-react';
import TaskCard from '../task/TaskCard';

// Map column names to indicator classes
const getColumnIndicatorClass = (columnName) => {
  const name = columnName.toLowerCase();
  if (name.includes('done') || name.includes('complete')) return 'done';
  if (name.includes('progress') || name.includes('doing')) return 'progress';
  if (name.includes('review') || name.includes('testing')) return 'review';
  return 'todo';
};

// Memoized to prevent unnecessary re-renders when other columns change
export const KanbanColumn = memo(function KanbanColumn({
  column,
  tasks,
  onTaskClick,
  onTaskEdit,
  onAddTask,
  onArchiveAll,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const indicatorClass = getColumnIndicatorClass(column.name);
  const isDoneColumn = indicatorClass === 'done';

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isOver ? 'drop-zone-active' : ''}`}
    >
      {/* Header */}
      <div className="kanban-column-header">
        <div className="kanban-column-title">
          <div className={`kanban-column-indicator ${indicatorClass}`} />
          <span className="kanban-column-name">{column.name}</span>
          <span className="badge badge-count">{tasks.length}</span>
        </div>
        {isDoneColumn && tasks.length > 0 && onArchiveAll && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onArchiveAll(column.id)}
            title="Archive all done tasks"
            aria-label="Archive all done tasks"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="kanban-column-content">
        <SortableContext
          items={tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
              onEdit={onTaskEdit}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="kanban-column-empty">
            <span>No tasks</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="kanban-column-footer">
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%' }}
          onClick={() => onAddTask?.(column)}
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>
    </div>
  );
});

export default KanbanColumn;
