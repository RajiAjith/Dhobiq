import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, 300);
  }, []);

  const show = useCallback((message, { type = 'info', title, duration = 4000 } = {}) => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-3), { id, message, type, title }]);
    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const success = useCallback((msg, opts) => show(msg, { ...opts, type: 'success' }), [show]);
  const error   = useCallback((msg, opts) => show(msg, { ...opts, type: 'error',   duration: 6000 }), [show]);
  const warning = useCallback((msg, opts) => show(msg, { ...opts, type: 'warning' }), [show]);
  const info    = useCallback((msg, opts) => show(msg, { ...opts, type: 'info'    }), [show]);

  const icons = {
    success: <CheckCircle  size={18} />,
    error:   <XCircle      size={18} />,
    warning: <AlertTriangle size={18} />,
    info:    <Info         size={18} />,
  };

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info, dismiss }}>
      {children}
      <div className="toast-container" role="region" aria-label="Notifications">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}${toast.exiting ? ' exit' : ''}`}
            role="alert"
          >
            <div className="toast-icon">{icons[toast.type]}</div>
            <div className="toast-body">
              {toast.title && <div className="toast-title">{toast.title}</div>}
              <div className="toast-message">{toast.message}</div>
            </div>
            <button
              className="toast-dismiss"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
