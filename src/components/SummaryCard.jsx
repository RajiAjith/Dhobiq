import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * SummaryCard — Premium metric/KPI card with progress stripe, icon container, and trend support
 */
export default function SummaryCard({
  label,
  value,
  icon: Icon,
  accentColor = 'var(--primary)',
  accentBg = 'var(--primary-light)',
  trendValue,
  trendDirection, // 'up' | 'down'
  trendLabel,
}) {
  return (
    <div className="kpi-card" style={{ '--kpi-color': accentColor }}>
      <div className="kpi-card-stripe" />
      <div className="kpi-card-row">
        <span className="kpi-card-label">{label}</span>
        {Icon && (
          <div
            className="icon-box icon-box-md"
            style={{ backgroundColor: accentBg, color: accentColor }}
          >
            <Icon size={18} />
          </div>
        )}
      </div>
      <div>
        <p className="kpi-card-value">{value}</p>
        {(trendValue !== undefined || trendDirection) && (
          <div className={`kpi-card-trend ${trendDirection || 'up'}`}>
            {trendDirection === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{trendValue}</span>
            {trendLabel && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> {trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
