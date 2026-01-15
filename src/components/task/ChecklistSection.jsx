import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  GripVertical,
  MoreHorizontal,
  CheckCheck,
  XCircle,
  Undo2,
  Shield,
  List,
} from 'lucide-react';

/**
 * Reusable checklist component for both Pre-Work Checklist and Subtasks
 *
 * Props:
 * - title: Section title
 * - icon: Icon component to use
 * - iconColor: Color for the icon
 * - borderColor: Left border color for the section
 * - itemBorderColor: Function (completed) => border color for items
 * - items: Array of { text, completed }
 * - onToggle: (index) => void
 * - onAdd: (text) => void
 * - onDelete: (index) => void
 * - onUpdate: (index, newText) => void
 * - onReorder: (fromIndex, toIndex) => void
 * - placeholder: Placeholder text for add input
 * - emptyMessage: Message when no items
 * - badge: Optional badge text (e.g., "Required")
 * - showProgress: Whether to show progress bar
 */
export function ChecklistSection({
  title,
  icon: Icon = List,
  iconColor = 'var(--accent-primary)',
  borderColor = 'var(--accent-primary)',
  itemBorderColor = (completed) => completed ? 'var(--status-complete)' : 'var(--accent-primary)',
  items = [],
  onToggle,
  onAdd,
  onDelete,
  onUpdate,
  onReorder,
  placeholder = 'Add item...',
  emptyMessage = 'No items yet',
  badge = null,
  showProgress = false,
}) {
  const [newItemText, setNewItemText] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [undoItem, setUndoItem] = useState(null);
  const [undoTimer, setUndoTimer] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const listRef = useRef(null);
  const editInputRef = useRef(null);
  const addInputRef = useRef(null);

  // Clear undo on unmount
  useEffect(() => {
    return () => {
      if (undoTimer) clearTimeout(undoTimer);
    };
  }, [undoTimer]);

  // Focus edit input when editing
  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndex]);

  // Announce for screen readers
  const announce = useCallback((message) => {
    setAnnouncement(message);
    setTimeout(() => setAnnouncement(''), 1000);
  }, []);

  const completedCount = items.filter(item => item.completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  // Handle toggle
  const handleToggle = (index) => {
    if (editingIndex !== null) return;
    onToggle?.(index);
    const item = items[index];
    announce(`${item.text} ${item.completed ? 'unchecked' : 'checked'}`);
  };

  // Handle add
  const handleAdd = () => {
    const text = newItemText.trim();
    if (text && onAdd) {
      onAdd(text);
      setNewItemText('');
      announce(`Added: ${text}`);
      addInputRef.current?.focus();
    }
  };

  // Handle delete with undo
  const handleDelete = (e, index) => {
    e.stopPropagation();
    if (!onDelete) return;

    const deletedItem = items[index];

    // Clear any existing undo timer
    if (undoTimer) {
      clearTimeout(undoTimer);
    }

    // Store for undo
    setUndoItem({ ...deletedItem, originalIndex: index });

    // Delete immediately
    onDelete(index);
    announce(`Deleted: ${deletedItem.text}. Press Ctrl+Z to undo.`);

    // Start undo timer (5 seconds)
    const timer = setTimeout(() => {
      setUndoItem(null);
      setUndoTimer(null);
    }, 5000);
    setUndoTimer(timer);

    // Focus next item or input
    setTimeout(() => {
      const nextIndex = Math.min(index, items.length - 2);
      if (nextIndex >= 0) {
        const checkboxes = listRef.current?.querySelectorAll('input[type="checkbox"]');
        checkboxes?.[nextIndex]?.focus();
      } else {
        addInputRef.current?.focus();
      }
    }, 0);
  };

  // Handle undo
  const handleUndo = () => {
    if (undoItem && undoTimer && onAdd) {
      clearTimeout(undoTimer);
      // Re-add at original position
      onAdd(undoItem.text, undoItem.originalIndex, undoItem.completed);
      announce(`Restored: ${undoItem.text}`);
      setUndoItem(null);
      setUndoTimer(null);
    }
  };

  // Handle inline edit
  const startEditing = (index, text) => {
    setEditingIndex(index);
    setEditingText(text);
  };

  const saveEdit = () => {
    if (editingIndex !== null && editingText.trim() && onUpdate) {
      onUpdate(editingIndex, editingText.trim());
      announce(`Updated item`);
    }
    setEditingIndex(null);
    setEditingText('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingText('');
  };

  // Handle keyboard navigation
  const handleKeyDown = (e, index) => {
    switch (e.key) {
      case 'Enter':
        if (editingIndex === index) {
          e.preventDefault();
          saveEdit();
        } else {
          e.preventDefault();
          startEditing(index, items[index].text);
        }
        break;
      case 'Escape':
        if (editingIndex === index) {
          e.preventDefault();
          cancelEdit();
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (editingIndex !== index && (e.metaKey || e.ctrlKey) && onDelete) {
          e.preventDefault();
          handleDelete(e, index);
        }
        break;
      case 'ArrowUp':
        if ((e.altKey || e.metaKey) && onReorder) {
          e.preventDefault();
          if (index > 0) {
            onReorder(index, index - 1);
            announce(`Moved up`);
            setTimeout(() => {
              const checkboxes = listRef.current?.querySelectorAll('input[type="checkbox"]');
              checkboxes?.[index - 1]?.focus();
            }, 0);
          }
        }
        break;
      case 'ArrowDown':
        if ((e.altKey || e.metaKey) && onReorder) {
          e.preventDefault();
          if (index < items.length - 1) {
            onReorder(index, index + 1);
            announce(`Moved down`);
            setTimeout(() => {
              const checkboxes = listRef.current?.querySelectorAll('input[type="checkbox"]');
              checkboxes?.[index + 1]?.focus();
            }, 0);
          }
        }
        break;
      case 'z':
        if ((e.metaKey || e.ctrlKey) && undoItem) {
          e.preventDefault();
          handleUndo();
        }
        break;
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    if (!onReorder) return;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e, index) => {
    if (!onReorder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== dropIndex && onReorder) {
      onReorder(dragIndex, dropIndex);
      announce(`Reordered item`);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Bulk actions
  const handleCompleteAll = () => {
    items.forEach((item, index) => {
      if (!item.completed) {
        onToggle?.(index);
      }
    });
    announce(`Completed all items`);
    setShowMenu(false);
  };

  const handleUncheckAll = () => {
    items.forEach((item, index) => {
      if (item.completed) {
        onToggle?.(index);
      }
    });
    announce(`Unchecked all items`);
    setShowMenu(false);
  };

  return (
    <div className="checklist-section" style={{ borderLeftColor: borderColor }}>
      {/* Screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <div className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.8125rem', fontWeight: 500 }}>
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
          {title}
          {badge && (
            <span className="badge badge-tag" style={{ fontSize: '0.6875rem', marginLeft: 'var(--space-1)' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {items.length > 0 && (
            <>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                {completedCount} / {items.length}{showProgress && ` (${Math.round(progress)}%)`}
              </span>
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setShowMenu(!showMenu)}
                  aria-label="Actions menu"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showMenu && (
                  <div className="dropdown-menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 10 }}>
                    <button className="dropdown-item" onClick={handleCompleteAll}>
                      <CheckCheck className="w-4 h-4" />
                      Complete All
                    </button>
                    <button className="dropdown-item" onClick={handleUncheckAll}>
                      <XCircle className="w-4 h-4" />
                      Uncheck All
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Input */}
      {onAdd && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <input
            ref={addInputRef}
            type="text"
            className="input"
            placeholder={placeholder}
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            style={{ flex: 1 }}
            aria-label={`Add ${title.toLowerCase()}`}
          />
          <button
            className={`btn btn-icon ${newItemText.trim() ? 'btn-primary' : 'btn-ghost'}`}
            onClick={handleAdd}
            disabled={!newItemText.trim()}
            aria-label="Add item"
            style={{ transition: 'all var(--duration-fast) var(--ease-in-out)' }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Undo Toast */}
      {undoItem && (
        <div
          className="undo-toast"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--surface-overlay)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-3)',
            border: '1px solid var(--border-default)',
          }}
        >
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Deleted "{undoItem.text.length > 30 ? undoItem.text.substring(0, 30) + '...' : undoItem.text}"
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleUndo}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </button>
        </div>
      )}

      {/* Items List */}
      {items.length > 0 ? (
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="sr-only">{title} Items</legend>
          <div
            ref={listRef}
            role="group"
            aria-label={title}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            {items.map((item, index) => (
              <div
                key={index}
                draggable={editingIndex !== index && !!onReorder}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`subtask-item ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: `3px solid ${itemBorderColor(item.completed)}`,
                  opacity: dragIndex === index ? 0.5 : 1,
                  transition: 'all var(--duration-fast) var(--ease-in-out)',
                }}
              >
                {/* Drag Handle */}
                {onReorder && (
                  <div
                    className="drag-handle"
                    aria-hidden="true"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                )}

                {/* Checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggle(index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className="sr-only"
                    aria-describedby={`item-text-${index}`}
                  />
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-complete)', flexShrink: 0 }} aria-hidden="true" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted" style={{ flexShrink: 0 }} aria-hidden="true" />
                  )}
                </label>

                {/* Text / Edit Input */}
                {editingIndex === index ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    className="input"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    onBlur={saveEdit}
                    style={{ flex: 1, fontSize: '0.875rem' }}
                    aria-label="Edit item"
                  />
                ) : (
                  <span
                    id={`item-text-${index}`}
                    onClick={() => onUpdate && startEditing(index, item.text)}
                    style={{
                      flex: 1,
                      fontSize: '0.875rem',
                      color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                      cursor: onUpdate ? 'text' : 'default',
                    }}
                    title={onUpdate ? 'Click to edit' : undefined}
                  >
                    {item.completed && <span className="sr-only">Completed: </span>}
                    {item.text}
                  </span>
                )}

                {/* Delete Button */}
                {onDelete && (
                  <button
                    className="btn btn-ghost btn-icon btn-sm subtask-delete-btn"
                    onClick={(e) => handleDelete(e, index)}
                    title="Delete (Cmd+Backspace)"
                    aria-label={`Delete: ${item.text}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-4)',
          color: 'var(--text-muted)',
          fontSize: '0.8125rem',
        }}>
          {emptyMessage}
        </div>
      )}

      {/* Progress Bar */}
      {showProgress && items.length > 0 && (
        <div
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-label={`Progress: ${completedCount} of ${items.length} completed`}
          className="task-card-progress-bar"
          style={{ marginTop: 'var(--space-3)', height: '4px' }}
        >
          <div
            className="task-card-progress-fill"
            style={{
              width: `${progress}%`,
              background: progress === 100 ? 'var(--status-complete)' : 'var(--accent-primary)',
              transition: 'all var(--duration-base) var(--ease-in-out)',
            }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

export default ChecklistSection;
