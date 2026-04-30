import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNetwork } from '../context/NetworkContext';

/**
 * Full-screen centred offline placeholder.
 *
 * Props:
 *  onRetry  – callback fired when the user clicks "Retry"
 *  message  – optional override for the body text
 */
export default function OfflineScreen({ onRetry, message }) {
  const { checkConnectivity } = useNetwork();

  const handleRetry = async () => {
    const online = await checkConnectivity();
    if (online && onRetry) {
      onRetry();
    }
  };

  return (
    <div className="offline-screen" role="status" aria-live="polite">
      <div className="offline-screen__card">
        <div className="offline-screen__icon-wrap">
          <WifiOff size={44} strokeWidth={1.5} />
        </div>
        <h2 className="offline-screen__title">You're Offline</h2>
        <p className="offline-screen__message">
          {message || "Internet connection is required to load data. Please check your network and try again."}
        </p>
        {onRetry && (
          <button
            className="btn btn-primary offline-screen__retry"
            onClick={handleRetry}
            id="offline-retry-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
