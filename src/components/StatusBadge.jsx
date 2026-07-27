import React from 'react';

/**
 * StatusBadge — Reusable premium badge with standard states and dot indicators
 */
export default function StatusBadge({ status, label, className = '' }) {
  const normalized = String(status || '').toLowerCase();
  
  let badgeClass = 'badge-neutral';
  let badgeLabel = label || status || 'Unknown';

  if (normalized === 'paid' || normalized === 'active') {
    badgeClass = 'badge-paid';
    if (!label) badgeLabel = normalized === 'paid' ? 'Paid' : 'Active';
  } else if (normalized === 'partial' || normalized === 'warning' || normalized === 'pending') {
    badgeClass = 'badge-partial';
    if (!label) badgeLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  } else if (normalized === 'unpaid' || normalized === 'inactive' || normalized === 'danger') {
    badgeClass = 'badge-unpaid';
    if (!label) badgeLabel = normalized === 'unpaid' ? 'Unpaid' : 'Inactive';
  } else if (normalized === 'invoiced') {
    badgeClass = 'badge-invoiced';
    if (!label) badgeLabel = 'Invoiced';
  } else if (normalized === 'info') {
    badgeClass = 'badge-info';
  }

  return (
    <span className={`badge ${badgeClass} ${className}`}>
      <span className="badge-dot" />
      {badgeLabel}
    </span>
  );
}
