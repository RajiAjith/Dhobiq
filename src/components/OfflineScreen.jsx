import React from 'react';
import { WifiOff, RefreshCw, Signal } from 'lucide-react';
import { useNetwork } from '../context/NetworkContext';

/**
 * Full-page offline placeholder shown inside page content areas.
 *
 * Props:
 *  onRetry  – callback fired when the user taps "Try Again"
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
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '56vh',
        padding: '28px 20px',
      }}
    >
      <div style={{
        background: '#ffffff',
        borderRadius: '24px',
        padding: '36px 28px',
        maxWidth: '340px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(13, 27, 42, 0.08), 0 2px 8px rgba(13, 27, 42, 0.04)',
        border: '1px solid rgba(0, 61, 130, 0.05)',
        animation: 'fadeInUp 0.28s cubic-bezier(0.0, 0.0, 0.2, 1)',
      }}>
        
        {/* Icon with gradient ring */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(217, 31, 17, 0.08) 0%, rgba(217, 31, 17, 0.03) 100%)',
          border: '1.5px solid rgba(217, 31, 17, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: 'rgba(217, 31, 17, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <WifiOff size={26} style={{ color: '#D91F11' }} strokeWidth={1.5} />
          </div>
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: '1.05rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '8px',
          lineHeight: 1.2,
        }}>
          You're Offline
        </h2>

        {/* Description */}
        <p style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: '24px',
          padding: '0 8px',
        }}>
          {message || 'Internet connection is required to load data. Please check your network and try again.'}
        </p>

        {/* Retry Button */}
        {onRetry && (
          <button
            id="offline-retry-btn"
            onClick={handleRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '11px 20px',
              background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 61, 130, 0.24)',
              transition: 'all 0.2s ease',
            }}
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        )}

        {/* Network tips */}
        <div style={{
          marginTop: '16px',
          paddingTop: '14px',
          borderTop: '1px solid rgba(0, 61, 130, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '0.7rem',
          color: 'var(--text-disabled)',
          fontWeight: 500,
        }}>
          <Signal size={11} />
          Check WiFi or Mobile Data
        </div>

      </div>
    </div>
  );
}
