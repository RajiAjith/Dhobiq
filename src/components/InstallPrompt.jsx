import { useState, useEffect } from 'react';

/**
 * InstallPrompt
 * 
 * Listens for the browser's `beforeinstallprompt` event and renders a
 * dismissible banner at the bottom of the screen that lets the user
 * install Dhobiq to their home screen with one tap.
 *
 * The banner is hidden once:
 *  - The user installs the app
 *  - The user dismisses it (stored in sessionStorage so it doesn't
 *    reappear every navigation within the same session)
 *  - The app is already running in standalone / installed mode
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);

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
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('dhobiq-install-dismissed', '1');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div style={styles.banner} role="banner" aria-label="Install app prompt">
      <div style={styles.left}>
        <img src="/dq_icon1.png" alt="Dhobiq icon" style={styles.icon} />
        <div>
          <p style={styles.title}>Install Dhobiq</p>
          <p style={styles.subtitle}>Add to your home screen for the best experience</p>
        </div>
      </div>
      <div style={styles.buttons}>
        <button onClick={handleInstall} style={styles.installBtn} id="pwa-install-btn">
          Install
        </button>
        <button onClick={handleDismiss} style={styles.dismissBtn} id="pwa-dismiss-btn" aria-label="Dismiss install prompt">
          ✕
        </button>
      </div>
    </div>
  );
}

const styles = {
  banner: {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)',
    maxWidth: '480px',
    background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
    color: '#fff',
    borderRadius: '16px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 8px 32px rgba(37, 99, 235, 0.45)',
    zIndex: 9999,
    gap: '12px',
    animation: 'slideUp 0.35s ease-out',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  icon: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    objectFit: 'cover',
    flexShrink: 0,
    background: '#fff',
    padding: '2px',
  },
  title: {
    margin: 0,
    fontWeight: 700,
    fontSize: '14px',
    lineHeight: 1.3,
  },
  subtitle: {
    margin: 0,
    fontSize: '11px',
    opacity: 0.85,
    lineHeight: 1.3,
  },
  buttons: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  installBtn: {
    background: '#fff',
    color: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dismissBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '14px',
    cursor: 'pointer',
    lineHeight: 1,
  },
};
