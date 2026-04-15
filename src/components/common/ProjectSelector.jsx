import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronDown,
  FolderOpen,
  Clock,
  Trash2,
  Edit3,
  Tag,
  Check,
  X,
  Plus,
} from 'lucide-react';

const UNGROUPED_KEY = '__ungrouped';

export function ProjectSelector({
  currentProject,
  recentProjects,
  onSelectProject,
  onRenameProject,
  onRenameGroup,
  onDeleteProject,
  onOpenNew,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editName, setEditName] = useState('');
  const [groupEditIndex, setGroupEditIndex] = useState(null);
  const [groupEditValue, setGroupEditValue] = useState('');
  const [filter, setFilter] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setEditingIndex(null);
        setGroupEditIndex(null);
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

  const handleEditGroup = (index, project) => {
    setGroupEditIndex(index);
    setGroupEditValue(project.group || '');
  };

  const handleSaveGroup = (index) => {
    onRenameGroup?.(index, groupEditValue);
    setGroupEditIndex(null);
    setGroupEditValue('');
  };

  const handleCancelGroup = () => {
    setGroupEditIndex(null);
    setGroupEditValue('');
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

  // Collect unique existing groups for datalist autocomplete
  const existingGroups = useMemo(
    () => Array.from(new Set(recentProjects.map((p) => p.group).filter(Boolean))).sort(),
    [recentProjects],
  );

  // Filter + group the projects, preserving original index for callbacks
  const { groups, hasAnyGroup } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const indexed = recentProjects.map((p, index) => ({ project: p, index }));
    const filtered = q
      ? indexed.filter(({ project: p }) => {
          const hay = [p.displayName, p.name, p.group].filter(Boolean).join(' ').toLowerCase();
          return hay.includes(q);
        })
      : indexed;

    const map = new Map();
    for (const entry of filtered) {
      const key = entry.project.group || UNGROUPED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }

    const grouped = Array.from(map.entries()).filter(([k]) => k !== UNGROUPED_KEY);
    grouped.sort((a, b) => a[0].localeCompare(b[0]));
    if (map.has(UNGROUPED_KEY)) grouped.push([UNGROUPED_KEY, map.get(UNGROUPED_KEY)]);

    const anyGroup = recentProjects.some((p) => p.group);
    return { groups: grouped, hasAnyGroup: anyGroup };
  }, [recentProjects, filter]);

  const renderItem = ({ project, index }) => (
    <div
      key={`${project.name}-${index}`}
      className={`project-selector-item ${
        currentProject?.name === project.name ? 'active' : ''
      }`}
      onClick={() => {
        if (editingIndex !== index && groupEditIndex !== index) {
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
            onClick={(e) => { e.stopPropagation(); handleSaveRename(index); }}
            aria-label="Save project name"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={(e) => { e.stopPropagation(); handleCancelRename(); }}
            aria-label="Cancel rename"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : groupEditIndex === index ? (
        <div className="project-selector-edit">
          <input
            type="text"
            className="input"
            list="project-selector-group-list"
            placeholder="Group (leave empty to clear)"
            value={groupEditValue}
            onChange={(e) => setGroupEditValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveGroup(index);
              if (e.key === 'Escape') handleCancelGroup();
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={(e) => { e.stopPropagation(); handleSaveGroup(index); }}
            aria-label="Save group"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={(e) => { e.stopPropagation(); handleCancelGroup(); }}
            aria-label="Cancel group edit"
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
            <span className="project-selector-folder-name">
              {project.name}
              {' · '}
              {project.taskFilePath
                ? `${project.taskFilePath}/${project.taskFileName || 'tasks.md'}`
                : (project.taskFileName || 'tasks.md')}
            </span>
            <span className="project-selector-meta">
              <Clock className="w-3 h-3" />
              {formatDate(project.lastAccessed)}
            </span>
          </div>
          {project.group && (
            <span
              className="project-group-badge"
              onClick={(e) => { e.stopPropagation(); handleEditGroup(index, project); }}
              title="Click to edit group"
            >
              {project.group}
            </span>
          )}
          <div className="project-selector-actions">
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={(e) => { e.stopPropagation(); handleEditGroup(index, project); }}
              title="Edit group"
              aria-label={`Edit group for ${project.displayName || project.name}`}
            >
              <Tag className="w-3 h-3" />
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={(e) => { e.stopPropagation(); handleRename(index, project); }}
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
  );

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

          {recentProjects.length >= 5 && (
            <div className="project-selector-filter">
              <input
                type="text"
                className="input"
                placeholder="Filter by name or group..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <datalist id="project-selector-group-list">
            {existingGroups.map((g) => <option key={g} value={g} />)}
          </datalist>

          <div className="project-selector-list">
            {recentProjects.length === 0 ? (
              <div className="project-selector-empty">
                No recent projects
              </div>
            ) : groups.length === 0 ? (
              <div className="project-selector-empty">
                No matches
              </div>
            ) : (
              groups.map(([groupKey, items]) => (
                <div key={groupKey}>
                  {(groupKey !== UNGROUPED_KEY || hasAnyGroup) && (
                    <div className="project-group-header">
                      {groupKey === UNGROUPED_KEY ? 'Ungrouped' : groupKey}
                    </div>
                  )}
                  {items.map(renderItem)}
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
