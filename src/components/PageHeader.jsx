import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * PageHeader — Sticky consistent page-level header with back navigation support
 * and customizable module-based icon container with colored background.
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  accentColor = 'var(--primary)',
  accentBg = 'var(--primary-light)',
  showBack = false,
  backTo,
  onBack,
  action,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="page-header">
      <div className="page-header-left">
        {showBack && (
          <button onClick={handleBack} className="page-header-back" aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
        )}

        {Icon && (
          <div
            className="page-header-icon-box"
            style={{ backgroundColor: accentBg, color: accentColor }}
          >
            <Icon size={22} />
          </div>
        )}

        <div className="page-header-text">
          <h1 className="page-header-title">{title}</h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
      </div>

      {action && <div className="page-header-action">{action}</div>}
    </div>
  );
}
