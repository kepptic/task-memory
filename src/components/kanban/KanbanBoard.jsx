import React from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn';
import { TaskCardContent } from '../task/TaskCard';

export function KanbanBoard({
  columns,
  tasks,
  onTaskMove,
  onTaskClick,
  onTaskEdit,
  onAddTask,
  onArchiveAll,
}) {
  const [activeTask, setActiveTask] = React.useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group tasks by column
  const tasksByColumn = React.useMemo(() => {
    const grouped = {};
    columns.forEach(col => {
      grouped[col.id] = tasks.filter(task => task.column === col.id);
    });
    return grouped;
  }, [columns, tasks]);

  const handleDragStart = (event) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    setActiveTask(task);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find the task being dragged
    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Determine the target column
    let targetColumnId;

    // Check if we're over a column
    if (columns.some(col => col.id === overId)) {
      targetColumnId = overId;
    } else {
      // We're over another task, find its column
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) {
        targetColumnId = overTask.column;
      }
    }

    // If moving to a different column, update immediately for visual feedback
    if (targetColumnId && activeTask.column !== targetColumnId) {
      onTaskMove?.(activeId, targetColumnId, null);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Determine target column and the task we're dropping near
    let targetColumnId;
    let overTaskId = null;

    if (columns.some(col => col.id === overId)) {
      // Dropped on a column (empty area)
      targetColumnId = overId;
    } else {
      // Dropped on another task
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) {
        targetColumnId = overTask.column;
        overTaskId = overId;
      }
    }

    if (targetColumnId) {
      // Pass the ID of the task we're dropping near for reordering
      onTaskMove?.(activeId, targetColumnId, overTaskId);
    }
  };

  // Pointer-based collision detection - target is wherever your cursor is
  const collisionDetection = React.useCallback((args) => {
    // pointerWithin checks if cursor is inside any droppable bounds
    const collisions = pointerWithin(args);

    if (collisions.length > 0) {
      // Prioritize tasks over columns for reordering
      const columnIds = new Set(columns.map(col => col.id));
      const taskCollisions = collisions.filter(c => !columnIds.has(c.id));

      // Return task if hovering over one, otherwise column
      return taskCollisions.length > 0 ? taskCollisions : collisions;
    }

    // Fallback to closestCorners when pointer isn't inside any element (better for kanban)
    return closestCorners(args);
  }, [columns]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn[column.id] || []}
            onTaskClick={onTaskClick}
            onTaskEdit={onTaskEdit}
            onAddTask={onAddTask}
            onArchiveAll={onArchiveAll}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeTask ? (
          <TaskCardContent task={activeTask} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;
