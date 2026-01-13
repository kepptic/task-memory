import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const COLORS = {
  success: 'var(--status-complete)',
  error: 'var(--status-critical)',
  info: 'var(--accent-secondary)',
};

export function Toast({ message, type = 'success', onClose, duration = 3000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const Icon = ICONS[type] || ICONS.info;

  return (
    <div
      className="toast"
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border-default)',
        borderLeft: `4px solid ${COLORS[type]}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 200,
        animation: 'slideIn var(--duration-base) var(--ease-out)',
        maxWidth: '24rem',
      }}
    >
      <Icon
        className="w-5 h-5"
        style={{ color: COLORS[type], flexShrink: 0 }}
        aria-hidden="true"
      />
      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
        {message}
      </span>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={onClose}
        style={{ marginLeft: 'auto', flexShrink: 0 }}
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default Toast;
