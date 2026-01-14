import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MoreHorizontal,
  RefreshCw,
  Columns,
  Archive,
  Settings,
  FolderOpen,
} from 'lucide-react';

/**
 * OverflowMenu - Dropdown menu for secondary navbar actions
 *
 * Groups utility actions into a single menu button to reduce navbar clutter,
 * especially useful on mobile where space is limited.
 */
export function OverflowMenu({
  onRefresh,
  onManageColumns,
  onViewArchive,
  onOpenSettings,
  onOpenProject,
  archiveCount = 0,
  isRefreshing = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);

  // Menu items configuration
  const menuItems = [
    {
      id: 'refresh',
      label: 'Refresh',
      shortcut: '\u2318R',
      icon: RefreshCw,
      onClick: onRefresh,
      disabled: isRefreshing,
    },
    {
      id: 'columns',
      label: 'Manage Columns',
      icon: Columns,
      onClick: onManageColumns,
    },
    {
      id: 'archive',
      label: 'View Archive',
      icon: Archive,
      onClick: onViewArchive,
      badge: archiveCount > 0 ? archiveCount : null,
    },
    { id: 'divider1', type: 'divider' },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      onClick: onOpenSettings,
    },
    { id: 'divider2', type: 'divider' },
    {
      id: 'open-project',
      label: 'Open Different Project',
      icon: FolderOpen,
      onClick: onOpenProject,
    },
  ];

  const actionableItems = menuItems.filter(item => item.type !== 'divider');

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        buttonRef.current?.focus();
        break;

      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev < actionableItems.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : actionableItems.length - 1
        );
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          const item = actionableItems[focusedIndex];
          if (item && !item.disabled) {
            item.onClick?.();
            setIsOpen(false);
            setFocusedIndex(-1);
          }
        }
        break;

      case 'Tab':
        setIsOpen(false);
        setFocusedIndex(-1);
        break;

      default:
        break;
    }
  }, [isOpen, focusedIndex, actionableItems]);

  // Focus management
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex].focus();
    }
  }, [isOpen, focusedIndex]);

  const handleItemClick = (item) => {
    if (item.disabled) return;
    item.onClick?.();
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  };

  let actionableIndex = -1;

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        className="btn btn-ghost btn-icon"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="More actions"
        title="More actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          className="overflow-menu-dropdown"
          role="menu"
          aria-label="Actions menu"
        >
          {menuItems.map((item, index) => {
            if (item.type === 'divider') {
              return <div key={item.id} className="overflow-menu-divider" role="separator" />;
            }

            actionableIndex++;
            const currentActionableIndex = actionableIndex;
            const Icon = item.icon;
            const isFocused = focusedIndex === currentActionableIndex;

            return (
              <button
                key={item.id}
                ref={el => itemRefs.current[currentActionableIndex] = el}
                className={`overflow-menu-item ${isFocused ? 'overflow-menu-item-focused' : ''} ${item.disabled ? 'overflow-menu-item-disabled' : ''}`}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => setFocusedIndex(currentActionableIndex)}
                onKeyDown={handleKeyDown}
                role="menuitem"
                tabIndex={isFocused ? 0 : -1}
                disabled={item.disabled}
              >
                <Icon className={`w-4 h-4 ${item.id === 'refresh' && isRefreshing ? 'animate-spin' : ''}`} />
                <span className="overflow-menu-item-label">{item.label}</span>
                {item.shortcut && (
                  <span className="overflow-menu-item-shortcut">{item.shortcut}</span>
                )}
                {item.badge && (
                  <span className="overflow-menu-item-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default OverflowMenu;
