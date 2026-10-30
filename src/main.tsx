import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const isNativeApk =
  typeof window !== 'undefined' && Boolean(window.SkpNativeVpn);

if (isNativeApk) {
  // Inside native Android APK, Capacitor serves local/OTA files directly;
  // ensure no stale Service Worker intercepts hot OTA updates.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((reg) => {
          reg.unregister().catch(() => {});
        });
      })
      .catch(() => {});
  }
} else {
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    },
    onNeedRefresh() {
      updateSW(true).catch(() => {});
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
