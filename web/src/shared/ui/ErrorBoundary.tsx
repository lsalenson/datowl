import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last resort for a render error: a way out instead of an empty window. Unmounting the app
 *  saves the open documents on the way, so reloading loses nothing. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = `${error.message}\n\n${error.stack ?? ''}`;
    return (
      <div className="crash" role="alert">
        <h1>Datowl hit an unexpected error</h1>
        <p>Your consoles and files were saved. Reloading brings the window back.</p>
        <pre>{detail}</pre>
        <div className="crash-actions">
          <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(detail)}>
            Copy Details
          </button>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
