import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X, Smartphone, Zap, Shield } from 'lucide-react';

/**
 * InstallPrompt
 * 
 * Listens for the browser's `beforeinstallprompt` event and renders a
 * dismissible card at the bottom of the screen that lets the user
 * install Dhobiq to their home screen with one tap.
 *
 * The banner is hidden once:
 *  - The user installs the app
 *  - The user dismisses it (stored in sessionStorage so it doesn't
 *    reappear every navigation within the same session)
 *  - The app is already running in standalone / installed mode
 */
export default function InstallPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If on the public sharing view, disable the PWA install prompt
  if (location.pathname.startsWith('/share')) {
    return null;
  }

  useEffect(() => {
    // Already installed (running in standalone mode) → nothing to show
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) return;

    // User already dismissed this session
    if (sessionStorage.getItem('dhobiq-install-dismissed')) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Hide banner if app gets installed via the native flow
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    setDeferredPrompt(null);
    setShowBanner(false);
    setInstalling(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('dhobiq-install-dismissed', '1');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  const features = [
    { icon: Zap, label: 'Fast Offline Access' },
    { icon: Shield, label: 'Secure & Private' },
    { icon: Smartphone, label: 'Native App Feel' },
  ];

  return (
    <>
      <style>{`
        @keyframes installSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(24px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Backdrop blur overlay */}
      <div
        onClick={handleDismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(13, 27, 42, 0.3)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 9998,
        }}
      />

      {/* Install Card */}
      <div
        role="dialog"
        aria-label="Install Dhobiq app"
        aria-modal="true"
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '380px',
          background: '#ffffff',
          borderRadius: '24px',
          padding: '20px',
          zIndex: 9999,
          boxShadow: '0 24px 64px rgba(13, 27, 42, 0.24), 0 8px 24px rgba(0, 61, 130, 0.12)',
          border: '1px solid rgba(0, 61, 130, 0.06)',
          animation: 'installSlideUp 0.36s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          id="pwa-dismiss-btn"
          aria-label="Dismiss install prompt"
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.04)',
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

        {/* Header row: icon + branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', paddingRight: '32px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            overflow: 'hidden',
            flexShrink: 0,
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 61, 130, 0.15)',
          }}>
            <img
              src="/dq_icon1.png"
              alt="Dhobiq"
              onError={e => { e.target.style.display = 'none'; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Install Dhobiq
            </p>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.3 }}>
              Add to your home screen for the best experience
            </p>
          </div>
        </div>

        {/* Feature pills row */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {features.map(({ icon: Icon, label }) => (
            <span
              key={label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '20px',
                background: 'rgba(0, 61, 130, 0.05)',
                border: '1px solid rgba(0, 61, 130, 0.08)',
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--primary)',
              }}
            >
              <Icon size={10} />
              {label}
            </span>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleDismiss}
            style={{
              flex: 0,
              padding: '10px 16px',
              borderRadius: '12px',
              background: 'rgba(0, 0, 0, 0.04)',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Not Now
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            id="pwa-install-btn"
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0, 61, 130, 0.28)',
              opacity: installing ? 0.7 : 1,
            }}
          >
            <Download size={14} />
            {installing ? 'Installing...' : 'Install App'}
          </button>
        </div>
      </div>
    </>
  );
}
