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
