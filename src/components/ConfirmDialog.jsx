import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

/**
 * ConfirmDialog — Premium bottom-sheet confirm dialog
 * Replaces window.confirm() with a native-feel experience.
 *
 * Props:
 *  isOpen        — boolean to show/hide
 *  title         — dialog heading
 *  message       — body description text
 *  confirmLabel  — label for the confirm button (default: "Delete")
 *  cancelLabel   — label for the cancel button (default: "Cancel")
 *  variant       — 'danger' | 'warning' | 'primary'
 *  onConfirm     — called when confirm is clicked
 *  onCancel      — called when cancel/backdrop is clicked
 */
export default function ConfirmDialog({
  isOpen,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) {
  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const colors = {
    danger:  { icon: 'rgba(217, 31, 17, 0.08)', iconColor: '#D91F11', border: 'rgba(217, 31, 17, 0.12)', btn: 'linear-gradient(135deg, #b91c1c 0%, #D91F11 100%)', btnShadow: 'rgba(217, 31, 17, 0.28)' },
    warning: { icon: 'rgba(232, 147, 10, 0.08)', iconColor: '#E8930A', border: 'rgba(232, 147, 10, 0.12)', btn: 'linear-gradient(135deg, #b45309 0%, #E8930A 100%)', btnShadow: 'rgba(232, 147, 10, 0.28)' },
    primary: { icon: 'rgba(0, 61, 130, 0.06)', iconColor: 'var(--primary)', border: 'rgba(0, 61, 130, 0.10)', btn: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)', btnShadow: 'rgba(0, 61, 130, 0.28)' },
  }[variant] || {};

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13, 27, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '24px 24px 0 0',
          width: '100%',
          maxWidth: '440px',
          padding: '0 20px 32px',
          boxShadow: '0 -12px 48px rgba(13, 27, 42, 0.16)',
          animation: 'slideInBottom 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Handle + Dismiss row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '12px', paddingBottom: '20px', position: 'relative' }}>
          <div style={{ width: '36px', height: '4px', background: 'var(--border)', borderRadius: '99px' }} />
          <button
            onClick={onCancel}
            aria-label="Close"
            style={{
              position: 'absolute',
              right: 0,
              top: '8px',
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.04)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: colors.icon,
            border: `1.5px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {variant === 'danger' ? (
              <Trash2 size={28} style={{ color: colors.iconColor }} strokeWidth={1.8} />
            ) : (
              <AlertTriangle size={28} style={{ color: colors.iconColor }} strokeWidth={1.8} />
            )}
          </div>
        </div>

        {/* Title */}
        <h3
          id="confirm-title"
          style={{
            textAlign: 'center',
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p style={{
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            lineHeight: 1.55,
            marginBottom: '24px',
            padding: '0 8px',
          }}>
            {message}
          </p>
        )}
        {!message && <div style={{ marginBottom: '24px' }} />}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.04)',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: '12px',
              background: colors.btn,
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: `0 2px 8px ${colors.btnShadow}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {variant === 'danger' && <Trash2 size={14} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * useConfirm — hook to imperatively trigger ConfirmDialog
 *
 * Usage:
 *   const [ConfirmUI, confirm] = useConfirm();
 *   const ok = await confirm({ title: 'Delete?', message: '...' });
 *   if (ok) { ... do the delete ... }
 *   // Render <>{ConfirmUI}</> somewhere in your JSX tree
 */
export function useConfirm() {
  const [state, setState] = React.useState({ isOpen: false, resolve: null, props: {} });

  const confirm = React.useCallback((props) => {
    return new Promise((resolve) => {
      setState({ isOpen: true, resolve, props });
    });
  }, []);

  const handleConfirm = () => {
    state.resolve?.(true);
    setState(s => ({ ...s, isOpen: false }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState(s => ({ ...s, isOpen: false }));
  };

  const ConfirmUI = (
    <ConfirmDialog
      {...state.props}
      isOpen={state.isOpen}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return [ConfirmUI, confirm];
}
