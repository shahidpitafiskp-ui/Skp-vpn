import { NativeVpnEventPayload } from '../types/vpn';

interface SkpNativeVpnInterface {
  isAvailable: () => boolean;
  getStatusJson: () => string;
  connect: (
    serverId: string,
    serverName: string,
    protocol: string,
    bypassBanking: boolean
  ) => void;
  disconnect: () => void;
  isIgnoringBatteryOptimizations: () => boolean;
  openBatterySettings: () => void;
  openExternalUrl?: (url: string) => void;
  getInstalledBuildNumber?: () => number;
  getConfiguredRepo?: () => string;
  syncUpdateRepo?: (repoSlug: string) => void;
  triggerOtaUpdateCheck?: () => void;
  downloadAndInstallApk?: (apkUrl: string) => void;
  installDownloadedApkIfReady?: () => void;
}

declare global {
  interface Window {
    SkpNativeVpn?: SkpNativeVpnInterface;
    __onSkpNativeVpnEvent?: (payload: NativeVpnEventPayload) => void;
  }
}

const listeners = new Set<(payload: NativeVpnEventPayload) => void>();

if (typeof window !== 'undefined') {
  window.__onSkpNativeVpnEvent = (payload: NativeVpnEventPayload) => {
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        // Ignore listener error
      }
    });
  };
}

export function isNativeAndroidVpn(): boolean {
  if (typeof window === 'undefined' || !window.SkpNativeVpn) {
    return false;
  }
  try {
    return Boolean(window.SkpNativeVpn.isAvailable());
  } catch {
    return true;
  }
}

export function getNativeVpnStatus(): NativeVpnEventPayload | null {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn) {
    return null;
  }
  try {
    const raw = window.SkpNativeVpn.getStatusJson();
    if (!raw) return null;
    return JSON.parse(raw) as NativeVpnEventPayload;
  } catch {
    return null;
  }
}

export function getNativeConfiguredRepo(): string | null {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn?.getConfiguredRepo) {
    return null;
  }
  try {
    const repo = window.SkpNativeVpn.getConfiguredRepo();
    return typeof repo === 'string' && repo.includes('/') ? repo.trim() : null;
  } catch {
    return null;
  }
}

export function syncNativeUpdateRepo(repoSlug: string): void {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn?.syncUpdateRepo) {
    return;
  }
  try {
    if (repoSlug && repoSlug.includes('/')) {
      window.SkpNativeVpn.syncUpdateRepo(repoSlug.trim());
    }
  } catch {
    // Ignore bridge sync errors on older APKs
  }
}

export function getNativeInstalledBuildNumber(): number | null {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn?.getInstalledBuildNumber) {
    return null;
  }
  try {
    const num = window.SkpNativeVpn.getInstalledBuildNumber();
    return typeof num === 'number' && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export function triggerNativeOtaUpdateCheck(repoSlug?: string): boolean {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn?.triggerOtaUpdateCheck) {
    return false;
  }
  try {
    if (repoSlug) {
      syncNativeUpdateRepo(repoSlug);
    }
    window.SkpNativeVpn.triggerOtaUpdateCheck();
    return true;
  } catch {
    return false;
  }
}

export function hasNativeInAppApkInstaller(): boolean {
  return Boolean(
    isNativeAndroidVpn() &&
      typeof window.SkpNativeVpn?.downloadAndInstallApk === 'function'
  );
}

export function nativeDownloadAndInstallApk(apkUrl: string): boolean {
  if (
    !isNativeAndroidVpn() ||
    typeof window.SkpNativeVpn?.downloadAndInstallApk !== 'function'
  ) {
    return false;
  }
  try {
    window.SkpNativeVpn.downloadAndInstallApk(apkUrl);
    return true;
  } catch {
    return false;
  }
}

export function nativeInstallDownloadedApkIfReady(): boolean {
  if (
    !isNativeAndroidVpn() ||
    typeof window.SkpNativeVpn?.installDownloadedApkIfReady !== 'function'
  ) {
    return false;
  }
  try {
    window.SkpNativeVpn.installDownloadedApkIfReady();
    return true;
  } catch {
    return false;
  }
}

export async function applyWebInstantUpdate(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (reg) => {
          try {
            await reg.update();
            await reg.unregister();
          } catch {
            // Ignore SW errors
          }
        })
      );
    }
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
  } catch {
    // Ignore cache cleanup errors
  }
  window.location.reload();
}

export function nativeConnectVpn(
  serverId: string,
  serverName: string,
  protocol: string,
  bypassBanking: boolean
): boolean {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn) {
    return false;
  }
  try {
    window.SkpNativeVpn.connect(serverId, serverName, protocol, bypassBanking);
    return true;
  } catch {
    return false;
  }
}

export function nativeDisconnectVpn(): boolean {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn) {
    return false;
  }
  try {
    window.SkpNativeVpn.disconnect();
    return true;
  } catch {
    return false;
  }
}

export function openNativeBatterySettings(): boolean {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn) {
    return false;
  }
  try {
    window.SkpNativeVpn.openBatterySettings();
    return true;
  } catch {
    return false;
  }
}

export function openNativeExternalUrl(url: string): boolean {
  if (!isNativeAndroidVpn() || !window.SkpNativeVpn?.openExternalUrl) {
    return false;
  }
  try {
    window.SkpNativeVpn.openExternalUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function subscribeNativeVpnEvents(
  listener: (payload: NativeVpnEventPayload) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
