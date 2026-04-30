import React, { useEffect, useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const { isOnline } = useNetwork();
  // Keep the banner visible for a moment after reconnection so the user sees the "Back Online" state
  const [visible, setVisible] = useState(!isOnline);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setReconnected(false);
      setVisible(true);
    } else if (visible) {
      // Just came back online — show a brief "connected" flash
      setReconnected(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setReconnected(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!visible) return null;

  return (
    <div className={`offline-banner ${reconnected ? 'offline-banner--online' : ''}`} role="alert" aria-live="assertive">
      <span className="offline-banner__icon">
        {reconnected ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <WifiOff size={16} />
        )}
      </span>
      <div className="offline-banner__text">
        <strong>{reconnected ? 'Back Online' : 'No Internet Connection'}</strong>
        {!reconnected && <span>Please check your network and try again</span>}
      </div>
    </div>
  );
}
