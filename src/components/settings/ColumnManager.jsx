import React, { useState, useEffect } from 'react';
import { Plus, X, GripVertical, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';

export function ColumnManager({ columns: initialColumns, onSave, onCancel }) {
  const [columns, setColumns] = useState(initialColumns);
  const [newColumnName, setNewColumnName] = useState('');

  // Reset when modal opens with new columns
  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const handleAddColumn = () => {
    const name = newColumnName.trim();
    if (!name) return;

    // Check for duplicates
    if (columns.some(col => col.name.toLowerCase() === name.toLowerCase())) {
      return;
    }

    setColumns([...columns, { id: name, name }]);
    setNewColumnName('');
  };

  const handleRemoveColumn = (index) => {
    if (columns.length <= 1) return; // Keep at least one column
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleRenameColumn = (index, newName) => {
    const updated = columns.map((col, i) =>
      i === index ? { ...col, name: newName, id: newName } : col
    );
    setColumns(updated);
  };

  const handleMoveColumn = (fromIndex, direction) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= columns.length) return;

    const updated = [...columns];
    [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
    setColumns(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: 'var(--space-2)' }}>
        Manage your kanban columns. Drag to reorder, or use the arrows.
      </p>

      {/* Column List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {columns.map((column, index) => (
          <div
            key={`${column.id}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--surface-elevated)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <GripVertical className="w-4 h-4 text-muted" style={{ cursor: 'grab', flexShrink: 0 }} />

            <input
              type="text"
              className="input"
              value={column.name}
              onChange={(e) => handleRenameColumn(index, e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none' }}
            />

            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => handleMoveColumn(index, -1)}
                disabled={index === 0}
                title="Move up"
                aria-label={`Move ${column.name} up`}
              >
                <span style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">{'>'}</span>
              </button>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => handleMoveColumn(index, 1)}
                disabled={index === columns.length - 1}
                title="Move down"
                aria-label={`Move ${column.name} down`}
              >
                <span style={{ transform: 'rotate(90deg)', display: 'block' }} aria-hidden="true">{'>'}</span>
              </button>
            </div>

            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => handleRemoveColumn(index)}
              disabled={columns.length <= 1}
              title="Remove column"
              aria-label={`Remove ${column.name} column`}
              style={{ color: columns.length > 1 ? 'var(--status-critical)' : undefined }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add New Column */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <input
          type="text"
          className="input"
          placeholder="New column name..."
          value={newColumnName}
          onChange={(e) => setNewColumnName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddColumn();
            }
          }}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          onClick={handleAddColumn}
          disabled={!newColumnName.trim()}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Footer */}
      <div className="modal-footer" style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onSave(columns)}>
          Save Changes
        </button>
      </div>
    </div>
  );
}

// Modal wrapper component
export function ColumnManagerModal({ isOpen, onClose, columns, onSave }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Columns"
      size="large"
    >
      <ColumnManager
        columns={columns}
        onSave={onSave}
        onCancel={onClose}
      />
    </Modal>
  );
}

export default ColumnManager;
