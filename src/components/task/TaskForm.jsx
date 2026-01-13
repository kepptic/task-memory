import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { Plus, X, Trash2 } from 'lucide-react';

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export function TaskForm({
  task,
  columns,
  categories,
  assignees,
  isOpen,
  onClose,
  onSave,
  onDelete,
}) {
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    description: '',
    priority: 'Medium',
    category: '',
    assignee: '',
    column: '',
    tags: [],
    subtasks: [],
    notes: '',
    created: '',
    started: '',
    due: '',
    finished: '',
    visualOpsLog: [],
  });

  const [newTag, setNewTag] = useState('');
  const [newSubtask, setNewSubtask] = useState('');

  // Reset form when task changes
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (task) {
      setFormData({
        id: task.id || '',
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'Medium',
        category: task.category || '',
        assignee: task.assignee || task.assignees?.[0] || '',
        column: task.column || columns[0]?.id || '',
        tags: task.tags || [],
        subtasks: task.subtasks || [],
        notes: task.notes || '',
        created: task.created || '',
        started: task.started || '',
        due: task.due || '',
        finished: task.finished || task.completed || '',
        visualOpsLog: task.visualOpsLog || [],
      });
    } else {
      setFormData({
        id: '',
        title: '',
        description: '',
        priority: 'Medium',
        category: '',
        assignee: '',
        column: columns[0]?.id || '',
        tags: [],
        subtasks: [],
        notes: '',
        created: today,
        started: '',
        due: '',
        finished: '',
        visualOpsLog: [],
      });
    }
    setNewTag('');
    setNewSubtask('');
  }, [task, columns]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  const handleAddSubtask = () => {
    const text = newSubtask.trim();
    if (text) {
      setFormData(prev => ({
        ...prev,
        subtasks: [...prev.subtasks, { text, completed: false }],
      }));
      setNewSubtask('');
    }
  };

  const handleRemoveSubtask = (index) => {
    setFormData(prev => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index),
    }));
  };

  const handleSubtaskChange = (index, text) => {
    setFormData(prev => ({
      ...prev,
      subtasks: prev.subtasks.map((st, i) =>
        i === index ? { ...st, text } : st
      ),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    onSave?.(formData);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      onDelete?.(task);
    }
  };

  const isEditing = !!task?.id;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Task' : 'New Task'}
      size="large"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Title */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="label">Title *</label>
          <input
            type="text"
            className="input"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="Task title"
            required
          />
        </div>

        {/* Description */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="label">Description</label>
          <textarea
            className="input textarea"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Task description"
            rows={3}
          />
        </div>

        {/* Priority and Column */}
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Priority</label>
            <select
              className="input select"
              value={formData.priority}
              onChange={(e) => handleChange('priority', e.target.value)}
            >
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Column</label>
            <select
              className="input select"
              value={formData.column}
              onChange={(e) => handleChange('column', e.target.value)}
            >
              {columns.map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Category and Assignee */}
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Category</label>
            <input
              type="text"
              className="input"
              list="categories"
              value={formData.category}
              onChange={(e) => handleChange('category', e.target.value)}
              placeholder="Category"
            />
            <datalist id="categories">
              {categories.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Assignee</label>
            <input
              type="text"
              className="input"
              list="assignees"
              value={formData.assignee}
              onChange={(e) => handleChange('assignee', e.target.value)}
              placeholder="Assignee"
            />
            <datalist id="assignees">
              {assignees.map(a => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Created</label>
            <input
              type="date"
              className="input"
              value={formData.created}
              onChange={(e) => handleChange('created', e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Started</label>
            <input
              type="date"
              className="input"
              value={formData.started}
              onChange={(e) => handleChange('started', e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Due</label>
            <input
              type="date"
              className="input"
              value={formData.due}
              onChange={(e) => handleChange('due', e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label">Finished</label>
            <input
              type="date"
              className="input"
              value={formData.finished}
              onChange={(e) => handleChange('finished', e.target.value)}
            />
          </div>
        </div>

        {/* Tags */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="label">Tags</label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1 }}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-icon"
              onClick={handleAddTag}
              aria-label="Add tag"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {formData.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {formData.tags.map((tag, index) => (
                <span key={index} className="badge badge-tag" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Subtasks */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="label">Subtasks</label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1 }}
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add subtask"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSubtask();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-icon"
              onClick={handleAddSubtask}
              aria-label="Add subtask"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {formData.subtasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {formData.subtasks.map((subtask, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    background: 'var(--surface-elevated)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <input
                    type="text"
                    className="input"
                    style={{ flex: 1, background: 'transparent', border: 'none', padding: 0 }}
                    value={subtask.text}
                    onChange={(e) => handleSubtaskChange(index, e.target.value)}
                    aria-label={`Subtask ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => handleRemoveSubtask(index)}
                    aria-label={`Remove subtask ${subtask.text || index + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="label">Notes</label>
          <textarea
            className="input textarea font-mono"
            style={{ fontSize: '0.8125rem' }}
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Additional notes..."
            rows={4}
          />
        </div>

        {/* Actions */}
        <div className="form-actions" style={{ marginTop: 'var(--space-2)' }}>
          {isEditing && (
            <button
              type="button"
              className="btn form-actions-left"
              style={{ background: 'var(--status-critical)', color: 'white' }}
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isEditing ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default TaskForm;
