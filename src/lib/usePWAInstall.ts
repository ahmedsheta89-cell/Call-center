/**
 * @file src/lib/usePWAInstall.ts
 * PWA Install Hook, Online/Offline Status Monitor & Device Environment Detector
 * Supports Android APK/TWA/PWA, Windows Desktop EXE/PWA, iOS Safari, and Universal Web.
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface DetectedDeviceProfile {
  deviceId: string;
  osName: 'Android' | 'Windows' | 'iOS' | 'macOS' | 'Linux';
  formFactor: 'mobile' | 'tablet' | 'desktop';
  browserName: string;
  isStandalonePWA: boolean;
  screenResolution: string;
  touchCapable: boolean;
}

export function detectCurrentDeviceProfile(): DetectedDeviceProfile {
  if (typeof window === 'undefined') {
    return {
      deviceId: 'DEV-SERVER-01',
      osName: 'Windows',
      formFactor: 'desktop',
      browserName: 'Chromium',
      isStandalonePWA: false,
      screenResolution: '1920x1080',
      touchCapable: false,
    };
  }

  let storedId = '';
  try {
    storedId = localStorage.getItem('omniflow_device_id') || '';
    if (!storedId) {
      storedId = `DEV-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      localStorage.setItem('omniflow_device_id', storedId);
    }
  } catch {
    storedId = 'DEV-SESSION-LIVE';
  }

  const ua = window.navigator.userAgent.toLowerCase();
  let osName: DetectedDeviceProfile['osName'] = 'Windows';
  if (/android/.test(ua)) osName = 'Android';
  else if (/iphone|ipad|ipod/.test(ua)) osName = 'iOS';
  else if (/macintosh|mac os x/.test(ua)) osName = 'macOS';
  else if (/linux/.test(ua)) osName = 'Linux';
  else if (/win/.test(ua)) osName = 'Windows';

  let formFactor: DetectedDeviceProfile['formFactor'] = 'desktop';
  if (/ipad|tablet/.test(ua) || (osName === 'Android' && !/mobile/.test(ua))) {
    formFactor = 'tablet';
  } else if (/mobi|android|iphone|ipod/.test(ua) || window.innerWidth < 768) {
    formFactor = 'mobile';
  }

  let browserName = 'Chrome / Edge';
  if (/edg\//.test(ua)) browserName = 'Microsoft Edge';
  else if (/chrome\//.test(ua)) browserName = 'Google Chrome';
  else if (/firefox\//.test(ua)) browserName = 'Mozilla Firefox';
  else if (/safari\//.test(ua)) browserName = 'Apple Safari';

  const isStandalonePWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const touchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  return {
    deviceId: storedId,
    osName,
    formFactor,
    browserName,
    isStandalonePWA,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    touchCapable,
  };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deviceProfile, setDeviceProfile] = useState<DetectedDeviceProfile>(() =>
    detectCurrentDeviceProfile()
  );

  useEffect(() => {
    const profile = detectCurrentDeviceProfile();
    setDeviceProfile(profile);
    setIsInstalled(profile.isStandalonePWA);
    setIsIOS(profile.osName === 'iOS');

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    deviceProfile,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
