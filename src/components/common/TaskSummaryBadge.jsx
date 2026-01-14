import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';

/**
 * TaskSummaryBadge - Progressive disclosure stats component
 *
 * Compact (default): [•••• 20 | 2%]
 * Expanded (hover):  To Do: 20 | In Progress: 0 | Done: 0 | File: 2%
 */
export function TaskSummaryBadge({
  stats = { byColumn: {}, total: 0 },
  columns = [],
  fileStats = { percentage: 0, isWarning: false, isCritical: false, totalChars: 0 },
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const collapseTimeoutRef = useRef(null);
  const badgeRef = useRef(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    setIsExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isPinned) {
      // Collapse after delay
      collapseTimeoutRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 300);
    }
  }, [isPinned]);

  const handleClick = useCallback(() => {
    if (isExpanded) {
      setIsPinned(!isPinned);
      if (isPinned) {
        // Unpinned, will collapse on mouse leave
      }
    } else {
      setIsExpanded(true);
      setIsPinned(true);
    }
  }, [isExpanded, isPinned]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    } else if (e.key === 'Escape' && isExpanded) {
      setIsExpanded(false);
      setIsPinned(false);
    }
  }, [handleClick, isExpanded]);

  // Handle click outside to collapse
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (badgeRef.current && !badgeRef.current.contains(e.target)) {
        setIsExpanded(false);
        setIsPinned(false);
      }
    };

    if (isPinned) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPinned]);

  // Generate dot indicators based on column counts
  const renderDotIndicators = () => {
    const maxDots = 12;
    const dots = [];
    let totalDots = 0;

    // Get first 3 columns (To Do, In Progress, Done)
    const displayColumns = columns.slice(0, 3);

    displayColumns.forEach((col, index) => {
      const count = stats.byColumn[col.id] || 0;
      // Scale dots - each dot represents up to ~10 tasks
      const dotCount = Math.min(Math.ceil(count / 3), 4);

      for (let i = 0; i < dotCount && totalDots < maxDots; i++) {
        dots.push(
          <span
            key={`${col.id}-${i}`}
            className={`summary-badge-dot summary-badge-dot-${index}`}
            title={`${col.name}: ${count}`}
          />
        );
        totalDots++;
      }
    });

    return dots;
  };

  const fileStatusClass = fileStats.isCritical
    ? 'summary-badge-critical'
    : fileStats.isWarning
    ? 'summary-badge-warning'
    : '';

  return (
    <div
      ref={badgeRef}
      className={`summary-badge ${isExpanded ? 'summary-badge-expanded' : ''} ${isPinned ? 'summary-badge-pinned' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`Task summary: ${stats.total} tasks, file ${fileStats.percentage}% full`}
    >
      {!isExpanded ? (
        // Compact view
        <div className="summary-badge-compact">
          <div className="summary-badge-dots">
            {renderDotIndicators()}
          </div>
          <span className="summary-badge-total">{stats.total}</span>
          <span className="summary-badge-separator">|</span>
          <div className={`summary-badge-file ${fileStatusClass}`}>
            {fileStats.isCritical ? (
              <AlertTriangle className="w-3 h-3" />
            ) : (
              <FileText className="w-3 h-3" />
            )}
            <span>{fileStats.percentage}%</span>
          </div>
        </div>
      ) : (
        // Expanded view
        <div className="summary-badge-full">
          {columns.slice(0, 3).map((col) => (
            <div key={col.id} className="summary-badge-stat">
              <span className="summary-badge-stat-label">
                {col.name.replace(/[📝🚧✅]/g, '').trim()}
              </span>
              <span className="summary-badge-stat-value">
                {stats.byColumn[col.id] || 0}
              </span>
            </div>
          ))}
          <div className={`summary-badge-stat summary-badge-file-stat ${fileStatusClass}`}>
            <span className="summary-badge-stat-label">File</span>
            <span className="summary-badge-stat-value">
              {fileStats.isCritical && <AlertTriangle className="w-3 h-3" />}
              {fileStats.percentage}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskSummaryBadge;
