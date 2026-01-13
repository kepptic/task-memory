import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  FolderOpen,
  Clock,
  Trash2,
  Edit3,
  Check,
  X,
  Plus,
} from 'lucide-react';

export function ProjectSelector({
  currentProject,
  recentProjects,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onOpenNew,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editName, setEditName] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setEditingIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRename = (index, project) => {
    setEditingIndex(index);
    setEditName(project.displayName || project.name);
  };

  const handleSaveRename = (index) => {
    if (editName.trim()) {
      onRenameProject?.(index, editName.trim());
    }
    setEditingIndex(null);
    setEditName('');
  };

  const handleCancelRename = () => {
    setEditingIndex(null);
    setEditName('');
  };

  const handleDelete = (e, index) => {
    e.stopPropagation();
    if (window.confirm('Remove this project from recent list?')) {
      onDeleteProject?.(index);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="project-selector" ref={dropdownRef}>
      <button
        className="project-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FolderOpen className="w-4 h-4" />
        <span className="project-selector-name">
          {currentProject?.displayName || currentProject?.name || 'Select Project'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="project-selector-dropdown">
          <div className="project-selector-header">
            <span className="project-selector-label">Recent Projects</span>
          </div>

          <div className="project-selector-list">
            {recentProjects.length === 0 ? (
              <div className="project-selector-empty">
                No recent projects
              </div>
            ) : (
              recentProjects.map((project, index) => (
                <div
                  key={`${project.name}-${index}`}
                  className={`project-selector-item ${
                    currentProject?.name === project.name ? 'active' : ''
                  }`}
                  onClick={() => {
                    if (editingIndex !== index) {
                      onSelectProject?.(project);
                      setIsOpen(false);
                    }
                  }}
                >
                  {editingIndex === index ? (
                    <div className="project-selector-edit">
                      <input
                        type="text"
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(index);
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveRename(index);
                        }}
                        aria-label="Save project name"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelRename();
                        }}
                        aria-label="Cancel rename"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="project-selector-info">
                        <span className="project-selector-project-name">
                          {project.displayName || project.name}
                        </span>
                        <span className="project-selector-meta">
                          <Clock className="w-3 h-3" />
                          {formatDate(project.lastAccessed)}
                        </span>
                      </div>
                      <div className="project-selector-actions">
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRename(index, project);
                          }}
                          title="Rename"
                          aria-label={`Rename ${project.displayName || project.name}`}
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => handleDelete(e, index)}
                          title="Remove"
                          aria-label={`Remove ${project.displayName || project.name} from recent projects`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="project-selector-footer">
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                onOpenNew?.();
                setIsOpen(false);
              }}
            >
              <Plus className="w-4 h-4" />
              Open New Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectSelector;
