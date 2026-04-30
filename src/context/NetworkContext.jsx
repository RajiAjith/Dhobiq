import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const NetworkContext = createContext({ 
  isOnline: true, 
  wasOffline: false, 
  checkConnectivity: async () => {},
  reportError: (error) => {}
});

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const checkInterval = useRef(null);

  const checkConnectivity = useCallback(async () => {
    try {
      // Use a cache-busting query parameter to ensure we're not getting a cached response
      const response = await fetch('/ping?t=' + Date.now(), { 
        method: 'HEAD', 
        cache: 'no-store' 
      });
      if (response.ok) {
        if (!isOnline) {
          setIsOnline(true);
        }
        return true;
      }
    } catch (e) {
      // Fetch failed - likely offline
    }
    
    if (isOnline) {
      setIsOnline(false);
      setWasOffline(true);
    }
    return false;
  }, [isOnline]);

  const goOnline = useCallback(() => {
    checkConnectivity();
  }, [checkConnectivity]);

  const goOffline = useCallback(() => {
    setIsOnline(false);
    setWasOffline(true);
  }, []);

  const reportError = useCallback((error) => {
    if (isNetworkError(error)) {
      setIsOnline(false);
      setWasOffline(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    
    // Heartbeat: Check every 10 seconds
    checkInterval.current = setInterval(checkConnectivity, 10000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (checkInterval.current) clearInterval(checkInterval.current);
    };
  }, [goOnline, goOffline, checkConnectivity]);

  const clearWasOffline = useCallback(() => setWasOffline(false), []);

  return (
    <NetworkContext.Provider value={{ isOnline, wasOffline, clearWasOffline, checkConnectivity, reportError }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

/** Returns true when a Firebase/fetch error looks like a network problem */
export function isNetworkError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('networkrequest failed') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    code.includes('network-error') ||
    code.includes('unavailable') ||
    !navigator.onLine
  );
}
