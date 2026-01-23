import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Error Boundary component to catch and handle React errors gracefully.
 * Prevents the entire app from crashing when a component throws an error.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 'var(--space-6)',
            background: 'var(--surface-ground)',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              textAlign: 'center',
              padding: 'var(--space-6)',
              background: 'var(--surface-elevated)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-default)',
            }}
          >
            <AlertTriangle
              style={{
                width: '48px',
                height: '48px',
                color: 'var(--status-error)',
                marginBottom: 'var(--space-4)',
              }}
            />
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                marginBottom: 'var(--space-2)',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-4)',
                fontSize: '0.875rem',
              }}
            >
              An unexpected error occurred. You can try again or reload the page.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details
                style={{
                  marginBottom: 'var(--space-4)',
                  textAlign: 'left',
                  background: 'var(--surface-base)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.75rem',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Error details (dev only)
                </summary>
                <pre
                  style={{
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--status-error)',
                  }}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                <RefreshCw style={{ width: '16px', height: '16px' }} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
