import { CircleArrowUp, X } from 'lucide-react';

import { useUpdates } from '../model/updates';

/** DataGrip-style notification in the bottom-right corner when an update is ready. */
export function UpdateToast() {
  const { status, version, progress, error, dismissed, install, dismiss } = useUpdates();
  const visible =
    (status === 'available' && !dismissed) || status === 'downloading' || status === 'none' || status === 'error';
  if (!visible) return null;

  return (
    <div className="toast" role="status">
      <CircleArrowUp size={16} className="toast-icon" />
      <div className="toast-body">
        {status === 'available' && (
          <>
            <div className="toast-title">Datowl {version} is available</div>
            <div className="toast-actions">
              <button type="button" className="btn primary" onClick={() => void install()}>
                Update and Restart
              </button>
              <button type="button" className="btn" onClick={dismiss}>
                Later
              </button>
            </div>
          </>
        )}
        {status === 'downloading' && (
          <>
            <div className="toast-title">Downloading Datowl {version}…</div>
            <div className="toast-progress">
              <span style={{ width: `${Math.round((progress ?? 0.05) * 100)}%` }} />
            </div>
          </>
        )}
        {status === 'none' && <div className="toast-title">Datowl is up to date</div>}
        {status === 'error' && (
          <>
            <div className="toast-title">Update check failed</div>
            <div className="toast-text">{error}</div>
          </>
        )}
      </div>
      {status !== 'downloading' && (
        <button
          type="button"
          className="toast-close"
          aria-label="Close"
          onClick={() => (status === 'available' ? dismiss() : useUpdates.setState({ status: 'idle' }))}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
