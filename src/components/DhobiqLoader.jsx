import React from 'react';

/**
 * DhobiqLoader — Premium branded loading screen & skeletons
 */
export default function DhobiqLoader({ message = 'Loading...' }) {
  return (
    <div className="loader-screen">
      <div className="loader-logo">
        <img
          src="/fflogo.png"
          alt="Dhobiq"
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>
      <div className="loader-dots">
        <span className="loader-dot" />
        <span className="loader-dot" />
        <span className="loader-dot" />
      </div>
      {message && <p className="loader-text">{message}</p>}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }) {
  const widths = ['100%', '75%', '60%', '85%', '50%'];
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-title" style={{ width: '40%', marginBottom: '8px' }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: widths[i % widths.length], marginBottom: '6px' }}
        />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={2} />
      ))}
    </div>
  );
}

export function SkeletonKPICards({ count = 5 }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ minHeight: '110px' }}>
          <div className="skeleton skeleton-text" style={{ width: '50%' }} />
          <div className="skeleton skeleton-title" style={{ width: '70%', marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  );
}
