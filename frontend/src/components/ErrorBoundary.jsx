import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-boundary card" style={{ padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={40} strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.6 }} />
          <h3>Something went wrong</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}