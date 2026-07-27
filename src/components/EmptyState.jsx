import React from 'react';

/**
 * EmptyState — Redesigned premium empty state component with laundry/module-themed defaults
 */
export default function EmptyState({
  icon: Icon,
  title = 'No Data Available',
  description = 'Add some records to populate this list.',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  accentColor = 'var(--primary)',
  accentBg = 'var(--primary-light)',
}) {
  return (
    <div className="empty-state">
      {Icon && (
        <div
          className="empty-state-icon"
          style={{ backgroundColor: accentBg, color: accentColor }}
        >
          <Icon size={44} />
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      
      {(actionLabel || secondaryLabel) && (
        <div className="empty-state-actions">
          {actionLabel && onAction && (
            <button onClick={onAction} className="btn btn-primary">
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button onClick={onSecondary} className="btn btn-secondary">
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
