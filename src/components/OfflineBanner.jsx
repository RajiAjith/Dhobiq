import React, { useEffect, useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { WifiOff, Wifi } from 'lucide-react';

export default function OfflineBanner() {
  const { isOnline } = useNetwork();
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
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        background: reconnected
          ? 'linear-gradient(135deg, #065f46 0%, #00875A 100%)'
          : 'linear-gradient(135deg, #7f1d1d 0%, #B91C1C 100%)',
        color: 'white',
        fontSize: '0.8rem',
        fontWeight: 700,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.28)',
        animation: 'offlineIn 0.3s cubic-bezier(0.0, 0.0, 0.2, 1)',
        borderBottom: reconnected
          ? '1px solid rgba(0, 200, 120, 0.2)'
          : '1px solid rgba(255, 80, 80, 0.2)',
      }}
    >
      {/* Icon */}
      <span style={{
        width: '28px',
        height: '28px',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {reconnected ? (
          <Wifi size={14} />
        ) : (
          <WifiOff size={14} />
        )}
      </span>

      {/* Text */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <strong style={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
          {reconnected ? 'Back Online' : 'No Internet Connection'}
        </strong>
        {!reconnected && (
          <span style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 400 }}>
            Please check your network and try again
          </span>
        )}
      </div>

      {/* Animated signal dots for offline state */}
      {!reconnected && (
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
          {[0, 0.16, 0.32].map((delay, i) => (
            <span
              key={i}
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.5)',
                animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
