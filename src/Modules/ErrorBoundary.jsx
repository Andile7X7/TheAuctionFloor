import React from 'react';

/**
 * ErrorBoundary — class component (required by React for componentDidCatch).
 * Wraps the entire app in main.jsx to catch render and query errors
 * instead of showing a blank white screen.
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
    // Log to console so developers can see full trace
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isDev = import.meta.env.DEV;

    return (
      <div style={styles.overlay}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.subtitle}>
            An unexpected error occurred. You can try reloading the page or go back to safety.
          </p>

          {/* Dev-only: show error details */}
          {isDev && this.state.error && (
            <details style={styles.details}>
              <summary style={styles.summary}>Developer Info</summary>
              <pre style={styles.pre}>
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <div style={styles.btnRow}>
            <button style={styles.retryBtn} onClick={this.handleRetry}>
              Try Again
            </button>
            <button style={styles.homeBtn} onClick={() => (window.location.href = '/')}>
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles = {
  overlay: {
    minHeight: '100vh',
    background: '#0e111a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: '24px',
  },
  card: {
    background: '#121620',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '48px 40px',
    maxWidth: '520px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    color: '#F9FAFB',
    fontSize: '26px',
    fontWeight: 800,
    margin: '0 0 12px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 28px',
  },
  details: {
    textAlign: 'left',
    marginBottom: '24px',
    background: 'rgba(239,68,68,0.05)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '8px',
    padding: '12px 16px',
  },
  summary: {
    color: '#EF4444',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '8px',
  },
  pre: {
    color: '#EF4444',
    fontSize: '11px',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '8px 0 0',
    opacity: 0.85,
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  retryBtn: {
    background: 'linear-gradient(135deg, #6b82ff, #475eff)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  homeBtn: {
    background: 'rgba(255,255,255,0.06)',
    color: '#9CA3AF',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};

export default ErrorBoundary;
