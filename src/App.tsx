/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  ThumbsUp,
  Globe,
  ChevronDown,
  Gauge,
  Languages,
  RotateCw,
  WifiOff,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  X,
  Clock,
} from 'lucide-react';
import {
  ConnectionStatus,
  Language,
  NativeVpnEventPayload,
  ReconnectLogEntry,
  ServerLocation,
  SessionAlertConfig,
  SpeedTestMetrics,
  SplitTunnelApp,
  VpnProtocol,
} from './types/vpn';
import {
  INITIAL_SPLIT_APPS,
  SERVER_LOCATIONS,
  UI_STRINGS,
} from './data/servers';
import {
  formatBytesCompact,
  getNativeVpnStatus,
  hasNativeInAppApkInstaller,
  isNativeAndroidVpn,
  nativeConnectVpn,
  nativeDisconnectVpn,
  nativeDownloadAndInstallApk,
  subscribeNativeVpnEvents,
  syncNativeUpdateRepo,
  triggerNativeOtaUpdateCheck,
} from './utils/nativeVpn';
import { GITHUB_REPO, getRepoUrls } from './utils/updateConfig';
import { FlagIcon } from './components/FlagIcon';
import { ConnectRingButton } from './components/ConnectRingButton';
import { ServerListContent, ServerModal } from './components/ServerModal';
import { SupportBatteryModal } from './components/SupportBatteryModal';
import {
  FastSpeedCheckCard,
  SpeedTestModal,
} from './components/SpeedTestModal';
import { DrawerMenu } from './components/DrawerMenu';
import { UpdatesModal } from './components/UpdatesModal';

const LAST_SERVER_STORAGE_KEY = 'skp_vpn_last_server_id';
const AUTO_RECONNECT_STORAGE_KEY = 'skp_vpn_auto_reconnect';
const DARK_MODE_STORAGE_KEY = 'skp_vpn_dark_mode';
const THEME_3D_STORAGE_KEY = 'skp_vpn_3d_theme';
const BATTERY_BANNER_STORAGE_KEY = 'skp_vpn_show_battery_banner';
const SESSION_ALERT_STORAGE_KEY = 'skp_vpn_session_alert';
const MAX_RECONNECT_ATTEMPTS = 5;
const BACKOFF_SECONDS = [2, 3, 5, 8, 12];

const COLO_TO_SERVER_ID: Record<string, string> = {
  KHI: 'pk-khi',
  ISB: 'pk-isb',
  LHE: 'pk-isb',
  PEW: 'pk-isb',
  MUX: 'pk-khi',
  DXB: 'ae-1',
  AUH: 'ae-1',
  MCT: 'ae-1',
  DOH: 'ae-1',
  BAH: 'ae-1',
  RUH: 'ae-1',
  JED: 'ae-1',
  SIN: 'sg-1',
  KUL: 'sg-1',
  BKK: 'sg-1',
  BOM: 'sg-1',
  DEL: 'sg-1',
  NRT: 'jp-1',
  KIX: 'jp-1',
  ICN: 'jp-1',
  HKG: 'jp-1',
  TPE: 'jp-1',
  FRA: 'de-1',
  MUC: 'de-1',
  BER: 'de-1',
  DUS: 'de-1',
  HAM: 'de-1',
  ZRH: 'ch-1',
  GVA: 'ch-1',
  VIE: 'ch-1',
  MXP: 'ch-1',
  AMS: 'nl-1',
  BRU: 'nl-1',
  LHR: 'uk-1',
  MAN: 'uk-1',
  EDI: 'uk-1',
  DUB: 'uk-1',
  CDG: 'fr-1',
  MRS: 'fr-1',
  MAD: 'fr-1',
  LAX: 'us-west',
  SJC: 'us-west',
  SFO: 'us-west',
  SEA: 'us-west',
  DEN: 'us-west',
  DFW: 'us-west',
  IAD: 'us-east',
  EWR: 'us-east',
  JFK: 'us-east',
  ORD: 'us-east',
  MIA: 'us-east',
  ATL: 'us-east',
  BOS: 'us-east',
  YYZ: 'ca-1',
  YVR: 'ca-1',
  YUL: 'ca-1',
};

function pickOptimalConcreteServer(colo?: string): ServerLocation {
  if (colo) {
    const upper = colo.trim().toUpperCase();
    const mappedId = COLO_TO_SERVER_ID[upper];
    if (mappedId) {
      const matched = SERVER_LOCATIONS.find((s) => s.id === mappedId);
      if (matched) return matched;
    }
  }
  const concrete = SERVER_LOCATIONS.filter((s) => s.id !== 'auto');
  concrete.sort(
    (a, b) =>
      a.basePingMs + a.loadPercent * 0.25 - (b.basePingMs + b.loadPercent * 0.25)
  );
  return concrete[0] ?? SERVER_LOCATIONS[1] ?? SERVER_LOCATIONS[0];
}

function loadInitialLastServer(): ServerLocation {
  try {
    const savedId = window.localStorage.getItem(LAST_SERVER_STORAGE_KEY);
    if (savedId) {
      const found = SERVER_LOCATIONS.find((s) => s.id === savedId);
      if (found) return found;
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return SERVER_LOCATIONS[0];
}

function loadInitialAutoReconnect(): boolean {
  try {
    const saved = window.localStorage.getItem(AUTO_RECONNECT_STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {
    // Ignore storage errors
  }
  return true;
}

function loadInitialDarkMode(): boolean {
  try {
    const saved = window.localStorage.getItem(DARK_MODE_STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

function loadInitialTheme3d(): boolean {
  try {
    const saved = window.localStorage.getItem(THEME_3D_STORAGE_KEY);
    if (saved !== null) {
      return saved !== 'false';
    }
  } catch {
    // Ignore storage errors
  }
  return true;
}

function loadInitialBatteryBanner(): boolean {
  try {
    const saved = window.localStorage.getItem(BATTERY_BANNER_STORAGE_KEY);
    if (saved !== null) {
      return saved !== 'false';
    }
  } catch {
    // Ignore storage errors
  }
  return true;
}

function loadInitialSessionAlert(): SessionAlertConfig {
  try {
    const raw = window.localStorage.getItem(SESSION_ALERT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionAlertConfig>;
      const mins =
        typeof parsed.limitMinutes === 'number' &&
        Number.isFinite(parsed.limitMinutes)
          ? Math.max(1, Math.min(720, Math.round(parsed.limitMinutes)))
          : 60;
      return {
        enabled: Boolean(parsed.enabled),
        limitMinutes: mins,
        systemNotification: parsed.systemNotification !== false,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return {
    enabled: false,
    limitMinutes: 60,
    systemNotification: true,
  };
}

function detectNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs]
    .map((val) => String(val).padStart(2, '0'))
    .join(':');
}

export default function App() {
  const initialServer = loadInitialLastServer();
  const nativeMode = isNativeAndroidVpn();

  const [darkMode, setDarkMode] = useState<boolean>(loadInitialDarkMode);
  const [theme3d, setTheme3d] = useState<boolean>(loadInitialTheme3d);

  const [status, setStatus] = useState<ConnectionStatus>(
    ConnectionStatus.Disconnected
  );
  const [selectedServer, setSelectedServer] =
    useState<ServerLocation>(initialServer);
  const [autoResolvedServer, setAutoResolvedServer] =
    useState<ServerLocation | null>(null);
  const [lastUsedServer, setLastUsedServer] =
    useState<ServerLocation>(initialServer);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(
    loadInitialAutoReconnect
  );

  // Native Android WireGuard & OTA state
  const [nativeDetail, setNativeDetail] = useState<string>('');
  const [nativeError, setNativeError] = useState<string>('');
  const [nativeExitIp, setNativeExitIp] = useState<string>('');
  const [nativeColo, setNativeColo] = useState<string>('');
  const [nativeEndpoint, setNativeEndpoint] = useState<string>('');
  const [nativeRxBytes, setNativeRxBytes] = useState<number>(0);
  const [nativeTxBytes, setNativeTxBytes] = useState<number>(0);
  const [otaStatus, setOtaStatus] = useState<string>('idle');
  const [otaVersion, setOtaVersion] = useState<string>('');
  const [otaProgress, setOtaProgress] = useState<number>(0);
  const [otaError, setOtaError] = useState<string>('');
  const [otaErrorCode, setOtaErrorCode] = useState<string>('');
  const [otaGithubRepo, setOtaGithubRepo] = useState<string>('');

  // Auto-reconnect runtime state
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
  const [reconnectHandshakeActive, setReconnectHandshakeActive] =
    useState<boolean>(false);
  const [dropReason, setDropReason] = useState<
    'network_offline' | 'tunnel_drop' | null
  >(null);
  const [recoveryBannerMessage, setRecoveryBannerMessage] = useState<
    string | null
  >(null);
  const [reconnectLogs, setReconnectLogs] = useState<ReconnectLogEntry[]>([]);

  const [language, setLanguage] = useState<Language>('en');
  const [protocol, setProtocol] = useState<VpnProtocol>(VpnProtocol.Auto);
  const [killSwitch, setKillSwitch] = useState<boolean>(true);
  const [splitApps, setSplitApps] =
    useState<SplitTunnelApp[]>(INITIAL_SPLIT_APPS);

  // Notice banner state (persisted so closing via X icon stays closed)
  const [showOrangeBanner, setShowOrangeBanner] = useState<boolean>(
    loadInitialBatteryBanner
  );

  const handleSetShowOrangeBanner = useCallback((visible: boolean) => {
    setShowOrangeBanner(visible);
    try {
      window.localStorage.setItem(BATTERY_BANNER_STORAGE_KEY, String(visible));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Modals & Drawers
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [serverModalOpen, setServerModalOpen] = useState<boolean>(false);
  const [supportModalOpen, setSupportModalOpen] = useState<boolean>(false);
  const [speedModalOpen, setSpeedModalOpen] = useState<boolean>(false);
  const [updatesModalOpen, setUpdatesModalOpen] = useState<boolean>(false);

  // Live session timer, session time-limit warning, & throughput telemetry
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [connectedSinceMs, setConnectedSinceMs] = useState<number>(0);
  const [webSessionBytes, setWebSessionBytes] = useState<number>(0);
  const [downSpeedMbps, setDownSpeedMbps] = useState<number>(0);
  const [upSpeedMbps, setUpSpeedMbps] = useState<number>(0);
  const [lastSpeedTest, setLastSpeedTest] = useState<SpeedTestMetrics | null>(
    null
  );

  const [sessionAlert, setSessionAlert] = useState<SessionAlertConfig>(
    loadInitialSessionAlert
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(detectNotificationPermission);
  const [snoozedUntilSeconds, setSnoozedUntilSeconds] = useState<number>(0);
  const [sessionWarningDismissed, setSessionWarningDismissed] =
    useState<boolean>(false);
  const lastNotifiedThresholdRef = useRef<number>(0);

  const transitionTimerRef = useRef<number | null>(null);
  const reconnectCountdownRef = useRef<number | null>(null);
  const reconnectHandshakeRef = useRef<number | null>(null);
  const recoveryMessageTimerRef = useRef<number | null>(null);

  const isBankingBypassed =
    splitApps.find((app) => app.id === 'banking')?.enabled === false;

  // Sync Dark Mode class on <html>, persist in localStorage, and update browser theme-color
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem(DARK_MODE_STORAGE_KEY, String(darkMode));
    } catch {
      // Ignore storage errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', darkMode ? '#051B11' : '#0B5D32');
    }
  }, [darkMode]);

  const handleToggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  // Sync 3D Theme & 3D Font class on <html> and persist in localStorage
  useEffect(() => {
    document.documentElement.classList.toggle('theme-3d', theme3d);
    try {
      window.localStorage.setItem(THEME_3D_STORAGE_KEY, String(theme3d));
    } catch {
      // Ignore storage errors
    }
  }, [theme3d]);

  const handleToggleTheme3d = useCallback(() => {
    setTheme3d((prev) => !prev);
  }, []);

  const handleUpdateSessionAlert = useCallback(
    (patch: Partial<SessionAlertConfig>) => {
      setSessionAlert((prev) => {
        const next: SessionAlertConfig = {
          ...prev,
          ...patch,
          limitMinutes:
            patch.limitMinutes !== undefined
              ? Math.max(1, Math.min(720, Math.round(patch.limitMinutes)))
              : prev.limitMinutes,
        };
        try {
          window.localStorage.setItem(
            SESSION_ALERT_STORAGE_KEY,
            JSON.stringify(next)
          );
        } catch {
          // Ignore storage errors
        }
        return next;
      });
      if (patch.limitMinutes !== undefined || patch.enabled === true) {
        setSnoozedUntilSeconds(0);
        setSessionWarningDismissed(false);
        lastNotifiedThresholdRef.current = 0;
      }
    },
    []
  );

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === 'granted') {
        handleUpdateSessionAlert({ systemNotification: true });
      }
    } catch {
      // Ignore permission prompt errors in embedded webviews
    }
  }, [handleUpdateSessionAlert]);

  const saveLastUsedServer = useCallback((srv: ServerLocation) => {
    setLastUsedServer(srv);
    try {
      window.localStorage.setItem(LAST_SERVER_STORAGE_KEY, srv.id);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Whenever connected on Auto select, ensure autoResolvedServer reflects the actual connected server
  useEffect(() => {
    if (status === ConnectionStatus.Connected && selectedServer.id === 'auto') {
      setAutoResolvedServer(pickOptimalConcreteServer(nativeColo));
    } else if (status === ConnectionStatus.Disconnected) {
      setAutoResolvedServer(null);
    }
  }, [status, selectedServer.id, nativeColo]);

  // Active server displayed on the selector button & used for telemetry/speed checks
  const displayedServer: ServerLocation = useMemo(() => {
    if (
      status === ConnectionStatus.Connected &&
      selectedServer.id === 'auto' &&
      autoResolvedServer
    ) {
      return autoResolvedServer;
    }
    return selectedServer;
  }, [status, selectedServer, autoResolvedServer]);

  const isShowingAutoResolved =
    status === ConnectionStatus.Connected &&
    selectedServer.id === 'auto' &&
    autoResolvedServer !== null;

  const applyNativePayload = useCallback(
    (payload: NativeVpnEventPayload) => {
      setNativeDetail(payload.detail ?? '');
      if (payload.error) {
        setNativeError(payload.error);
      } else if (
        payload.state === 'CONNECTED' ||
        payload.state === 'CONNECTING'
      ) {
        setNativeError('');
      }

      if (payload.exitIp !== undefined) setNativeExitIp(payload.exitIp);
      if (payload.colo !== undefined) setNativeColo(payload.colo);
      if (payload.endpoint !== undefined) setNativeEndpoint(payload.endpoint);
      if (typeof payload.rxBytes === 'number')
        setNativeRxBytes(payload.rxBytes);
      if (typeof payload.txBytes === 'number')
        setNativeTxBytes(payload.txBytes);
      if (payload.otaStatus) setOtaStatus(payload.otaStatus);
      if (payload.otaVersion !== undefined) setOtaVersion(payload.otaVersion);
      if (typeof payload.otaProgress === 'number')
        setOtaProgress(payload.otaProgress);
      if (payload.otaError !== undefined) setOtaError(payload.otaError);
      if (payload.otaErrorCode !== undefined)
        setOtaErrorCode(payload.otaErrorCode);
      if (payload.githubRepo !== undefined)
        setOtaGithubRepo(payload.githubRepo);

      if (payload.serverId) {
        const matched = SERVER_LOCATIONS.find((s) => s.id === payload.serverId);
        if (matched) {
          setSelectedServer(matched);
          if (payload.state === 'CONNECTED') {
            saveLastUsedServer(matched);
          }
        }
      }

      if (payload.state === 'CONNECTED') {
        setStatus(ConnectionStatus.Connected);
        if (
          typeof payload.connectedSinceMs === 'number' &&
          payload.connectedSinceMs > 0
        ) {
          setConnectedSinceMs(payload.connectedSinceMs);
          setSessionSeconds(
            Math.max(
              0,
              Math.floor((Date.now() - payload.connectedSinceMs) / 1000)
            )
          );
        } else if (typeof payload.durationSec === 'number') {
          setSessionSeconds(payload.durationSec);
          setConnectedSinceMs((prev) =>
            prev > 0 ? prev : Date.now() - payload.durationSec! * 1000
          );
        }
        if (typeof payload.downMbps === 'number') {
          setDownSpeedMbps(payload.downMbps);
        }
        if (typeof payload.upMbps === 'number') {
          setUpSpeedMbps(payload.upMbps);
        }
      } else if (payload.state === 'CONNECTING') {
        setStatus(ConnectionStatus.Connecting);
      } else if (payload.state === 'DISCONNECTING') {
        setStatus(ConnectionStatus.Disconnecting);
      } else if (payload.state === 'DISCONNECTED') {
        setStatus(ConnectionStatus.Disconnected);
        setDownSpeedMbps(0);
        setUpSpeedMbps(0);
        setSessionSeconds(0);
        setConnectedSinceMs(0);
      }
    },
    [saveLastUsedServer]
  );

  useEffect(() => {
    if (!nativeMode) return;

    syncNativeUpdateRepo(GITHUB_REPO);

    const initial = getNativeVpnStatus();
    if (initial) {
      applyNativePayload(initial);
    }

    const unsubscribe = subscribeNativeVpnEvents((payload) => {
      applyNativePayload(payload);
    });

    return () => {
      unsubscribe();
    };
  }, [nativeMode, applyNativePayload]);

  const handleToggleAutoReconnect = useCallback(() => {
    setAutoReconnect((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUTO_RECONNECT_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const clearAllTimers = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (reconnectCountdownRef.current !== null) {
      window.clearInterval(reconnectCountdownRef.current);
      reconnectCountdownRef.current = null;
    }
    if (reconnectHandshakeRef.current !== null) {
      window.clearTimeout(reconnectHandshakeRef.current);
      reconnectHandshakeRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      if (recoveryMessageTimerRef.current !== null) {
        window.clearTimeout(recoveryMessageTimerRef.current);
      }
    };
  }, [clearAllTimers]);

  const executeReconnectAttempt = useCallback(
    (
      attemptNumber: number,
      targetServer: ServerLocation,
      reason: 'network_offline' | 'tunnel_drop'
    ) => {
      clearAllTimers();

      if (attemptNumber > MAX_RECONNECT_ATTEMPTS) {
        setStatus(ConnectionStatus.Disconnected);
        setReconnectHandshakeActive(false);
        setReconnectCountdown(0);
        setReconnectLogs((prev) => [
          {
            id: `${Date.now()}-fail`,
            serverNameEn: targetServer.nameEn,
            serverNameUr: targetServer.nameUr,
            reason,
            attempts: MAX_RECONNECT_ATTEMPTS,
            outcome: 'failed',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          },
          ...prev.slice(0, 4),
        ]);
        return;
      }

      setStatus(ConnectionStatus.Reconnecting);
      setSelectedServer(targetServer);
      setReconnectAttempt(attemptNumber);
      setReconnectHandshakeActive(false);

      const waitSecs =
        BACKOFF_SECONDS[Math.min(attemptNumber - 1, BACKOFF_SECONDS.length - 1)];
      setReconnectCountdown(waitSecs);

      let remaining = waitSecs;
      reconnectCountdownRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (reconnectCountdownRef.current !== null) {
            window.clearInterval(reconnectCountdownRef.current);
            reconnectCountdownRef.current = null;
          }
          setReconnectCountdown(0);
          setReconnectHandshakeActive(true);

          if (nativeMode) {
            nativeConnectVpn(
              targetServer.id,
              targetServer.nameEn,
              protocol,
              isBankingBypassed
            );
            setReconnectHandshakeActive(false);
            setReconnectAttempt(0);
            setDropReason(null);
            return;
          }

          reconnectHandshakeRef.current = window.setTimeout(() => {
            const browserOnline =
              typeof navigator !== 'undefined' ? navigator.onLine : true;

            if (!browserOnline) {
              executeReconnectAttempt(attemptNumber + 1, targetServer, reason);
              return;
            }

            setReconnectHandshakeActive(false);
            setReconnectAttempt(0);
            setDropReason(null);
            setSelectedServer(targetServer);
            if (targetServer.id === 'auto') {
              setAutoResolvedServer(pickOptimalConcreteServer());
            }
            saveLastUsedServer(targetServer);
            setStatus(ConnectionStatus.Connected);

            const connectedDisplay =
              targetServer.id === 'auto'
                ? pickOptimalConcreteServer()
                : targetServer;

            const timestamp = new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            setReconnectLogs((prev) => [
              {
                id: `${Date.now()}-ok`,
                serverNameEn: connectedDisplay.nameEn,
                serverNameUr: connectedDisplay.nameUr,
                reason,
                attempts: attemptNumber,
                outcome: 'recovered',
                timestamp,
              },
              ...prev.slice(0, 4),
            ]);

            setRecoveryBannerMessage(
              `Restored tunnel to ${connectedDisplay.nameEn} (${timestamp})`
            );
            if (recoveryMessageTimerRef.current !== null) {
              window.clearTimeout(recoveryMessageTimerRef.current);
            }
            recoveryMessageTimerRef.current = window.setTimeout(() => {
              setRecoveryBannerMessage(null);
            }, 6000);
          }, 1100);
        } else {
          setReconnectCountdown(remaining);
        }
      }, 1000);
    },
    [
      clearAllTimers,
      isBankingBypassed,
      nativeMode,
      protocol,
      saveLastUsedServer,
    ]
  );

  const handleConnectionDropDetected = useCallback(
    (reason: 'network_offline' | 'tunnel_drop') => {
      clearAllTimers();
      setDropReason(reason);
      setDownSpeedMbps(0);
      setUpSpeedMbps(0);

      if (nativeMode) {
        nativeDisconnectVpn();
      }

      if (autoReconnect) {
        executeReconnectAttempt(1, lastUsedServer, reason);
      } else {
        setStatus(ConnectionStatus.Disconnected);
        setSessionSeconds(0);
      }
    },
    [
      autoReconnect,
      clearAllTimers,
      executeReconnectAttempt,
      lastUsedServer,
      nativeMode,
    ]
  );

  const handleRetryReconnectNow = useCallback(() => {
    if (status !== ConnectionStatus.Reconnecting) return;
    clearAllTimers();
    const currentAttempt = Math.max(1, reconnectAttempt);
    setReconnectCountdown(0);
    setReconnectHandshakeActive(true);

    if (nativeMode) {
      nativeConnectVpn(
        lastUsedServer.id,
        lastUsedServer.nameEn,
        protocol,
        isBankingBypassed
      );
      setReconnectHandshakeActive(false);
      setReconnectAttempt(0);
      setDropReason(null);
      return;
    }

    reconnectHandshakeRef.current = window.setTimeout(() => {
      const browserOnline =
        typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!browserOnline) {
        executeReconnectAttempt(
          currentAttempt + 1,
          lastUsedServer,
          dropReason ?? 'network_offline'
        );
        return;
      }

      setReconnectHandshakeActive(false);
      setReconnectAttempt(0);
      setDropReason(null);
      setSelectedServer(lastUsedServer);
      if (lastUsedServer.id === 'auto') {
        setAutoResolvedServer(pickOptimalConcreteServer());
      }
      saveLastUsedServer(lastUsedServer);
      setStatus(ConnectionStatus.Connected);

      const connectedDisplay =
        lastUsedServer.id === 'auto'
          ? pickOptimalConcreteServer()
          : lastUsedServer;

      const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setReconnectLogs((prev) => [
        {
          id: `${Date.now()}-ok`,
          serverNameEn: connectedDisplay.nameEn,
          serverNameUr: connectedDisplay.nameUr,
          reason: dropReason ?? 'tunnel_drop',
          attempts: currentAttempt,
          outcome: 'recovered',
          timestamp,
        },
        ...prev.slice(0, 4),
      ]);

      setRecoveryBannerMessage(
        `Restored tunnel to ${connectedDisplay.nameEn} (${timestamp})`
      );
    }, 850);
  }, [
    clearAllTimers,
    dropReason,
    executeReconnectAttempt,
    isBankingBypassed,
    lastUsedServer,
    nativeMode,
    protocol,
    reconnectAttempt,
    saveLastUsedServer,
    status,
  ]);

  useEffect(() => {
    const onOffline = () => {
      if (status === ConnectionStatus.Connected) {
        handleConnectionDropDetected('network_offline');
      }
    };

    const onOnline = () => {
      if (status === ConnectionStatus.Reconnecting) {
        handleRetryReconnectNow();
      }
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [status, handleConnectionDropDetected, handleRetryReconnectNow]);

  // Smooth 1-second local clock sync in Native Android mode so HH:MM:SS never skips ticks
  useEffect(() => {
    if (!nativeMode || status !== ConnectionStatus.Connected) return;

    const timer = window.setInterval(() => {
      if (connectedSinceMs > 0) {
        setSessionSeconds(
          Math.max(0, Math.floor((Date.now() - connectedSinceMs) / 1000))
        );
      } else {
        setSessionSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [nativeMode, status, connectedSinceMs]);

  // Web preview telemetry timer (native Android pushes real WireGuard telemetry instead)
  useEffect(() => {
    if (nativeMode) return;

    if (status !== ConnectionStatus.Connected) {
      setDownSpeedMbps(0);
      setUpSpeedMbps(0);
      if (status === ConnectionStatus.Disconnected) {
        setWebSessionBytes(0);
        setConnectedSinceMs(0);
      }
      return;
    }

    setConnectedSinceMs((prev) => (prev > 0 ? prev : Date.now()));

    const loadBonus = Math.round((100 - displayedServer.loadPercent) * 0.45);
    const baseDown = 48.2 + loadBonus;
    const baseUp = Number((baseDown * 0.42).toFixed(1));
    setDownSpeedMbps(baseDown);
    setUpSpeedMbps(baseUp);

    const interval = window.setInterval(() => {
      const nextDown = Number(
        (baseDown + (Math.random() * 6.8 - 3.4)).toFixed(1)
      );
      const nextUp = Number((baseUp + (Math.random() * 2.8 - 1.4)).toFixed(1));
      setSessionSeconds((prev) => prev + 1);
      setDownSpeedMbps(nextDown);
      setUpSpeedMbps(nextUp);
      setWebSessionBytes((prev) =>
        Math.round(prev + (nextDown + nextUp) * 18500)
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [nativeMode, status, displayedServer]);

  const totalSessionBytes = nativeMode
    ? nativeRxBytes + nativeTxBytes
    : webSessionBytes;

  const effectiveLimitSeconds =
    snoozedUntilSeconds > 0
      ? snoozedUntilSeconds
      : sessionAlert.limitMinutes * 60;

  const isSessionOverLimit =
    sessionAlert.enabled &&
    status === ConnectionStatus.Connected &&
    sessionSeconds >= effectiveLimitSeconds;

  // Reset session-limit warning latches when disconnected
  useEffect(() => {
    if (status === ConnectionStatus.Disconnected) {
      setSnoozedUntilSeconds(0);
      setSessionWarningDismissed(false);
      lastNotifiedThresholdRef.current = 0;
    }
  }, [status]);

  // Trigger visual warning & optional system notification when session exceeds limit
  useEffect(() => {
    if (!isSessionOverLimit) return;
    if (lastNotifiedThresholdRef.current === effectiveLimitSeconds) return;

    lastNotifiedThresholdRef.current = effectiveLimitSeconds;
    setSessionWarningDismissed(false);

    try {
      navigator.vibrate?.(180);
    } catch {
      // Ignore vibration errors
    }

    if (
      sessionAlert.systemNotification &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('SKP VPN · Session Time Limit Reached', {
          body: `Active VPN session has exceeded ${Math.round(
            effectiveLimitSeconds / 60
          )} min (${formatBytesCompact(totalSessionBytes)} used).`,
          icon: '/pwa-192x192.png',
        });
      } catch {
        // Ignore Notification constructor restrictions in WebView contexts
      }
    }
  }, [
    effectiveLimitSeconds,
    isSessionOverLimit,
    sessionAlert.systemNotification,
    totalSessionBytes,
  ]);

  const handleSnoozeSessionWarning = useCallback(() => {
    setSnoozedUntilSeconds(sessionSeconds + 15 * 60);
    setSessionWarningDismissed(false);
  }, [sessionSeconds]);

  const handleToggleConnection = useCallback(() => {
    clearAllTimers();
    setRecoveryBannerMessage(null);
    setNativeError('');

    if (nativeMode) {
      if (
        status === ConnectionStatus.Connected ||
        status === ConnectionStatus.Connecting ||
        status === ConnectionStatus.Reconnecting
      ) {
        setDropReason(null);
        setReconnectAttempt(0);
        setReconnectCountdown(0);
        setReconnectHandshakeActive(false);
        nativeDisconnectVpn();
      } else {
        setDropReason(null);
        saveLastUsedServer(selectedServer);
        nativeConnectVpn(
          selectedServer.id,
          selectedServer.nameEn,
          protocol,
          isBankingBypassed
        );
      }
      return;
    }

    if (status === ConnectionStatus.Connected) {
      setDropReason(null);
      setStatus(ConnectionStatus.Disconnecting);
      transitionTimerRef.current = window.setTimeout(() => {
        setStatus(ConnectionStatus.Disconnected);
        setAutoResolvedServer(null);
        setSessionSeconds(0);
      }, 650);
    } else if (
      status === ConnectionStatus.Connecting ||
      status === ConnectionStatus.Disconnecting ||
      status === ConnectionStatus.Reconnecting
    ) {
      setDropReason(null);
      setReconnectAttempt(0);
      setReconnectCountdown(0);
      setReconnectHandshakeActive(false);
      setStatus(ConnectionStatus.Disconnected);
      setAutoResolvedServer(null);
      setSessionSeconds(0);
    } else {
      setDropReason(null);
      setStatus(ConnectionStatus.Connecting);
      transitionTimerRef.current = window.setTimeout(() => {
        setSessionSeconds(0);
        if (selectedServer.id === 'auto') {
          setAutoResolvedServer(pickOptimalConcreteServer());
        }
        saveLastUsedServer(selectedServer);
        setStatus(ConnectionStatus.Connected);
      }, 1150);
    }
  }, [
    clearAllTimers,
    isBankingBypassed,
    nativeMode,
    protocol,
    saveLastUsedServer,
    selectedServer,
    status,
  ]);

  const handleSelectServer = useCallback(
    (srv: ServerLocation) => {
      setSelectedServer(srv);
      setAutoResolvedServer(null);
      setDropReason(null);
      setRecoveryBannerMessage(null);
      setNativeError('');
      clearAllTimers();
      saveLastUsedServer(srv);

      if (nativeMode) {
        nativeConnectVpn(srv.id, srv.nameEn, protocol, isBankingBypassed);
        return;
      }

      setStatus(ConnectionStatus.Connecting);
      transitionTimerRef.current = window.setTimeout(() => {
        setSessionSeconds(0);
        setConnectedSinceMs(Date.now());
        if (srv.id === 'auto') {
          setAutoResolvedServer(pickOptimalConcreteServer());
        }
        setStatus(ConnectionStatus.Connected);
      }, 950);
    },
    [
      clearAllTimers,
      isBankingBypassed,
      nativeMode,
      protocol,
      saveLastUsedServer,
    ]
  );

  const handleToggleSplitApp = useCallback((id: string) => {
    setSplitApps((prev) =>
      prev.map((app) =>
        app.id === id ? { ...app, enabled: !app.enabled } : app
      )
    );
  }, []);

  const handleMenuQuickUpdate = useCallback(() => {
    setUpdatesModalOpen(true);
    if (nativeMode) {
      const effectiveRepo = otaGithubRepo || GITHUB_REPO;
      const triggered = triggerNativeOtaUpdateCheck(effectiveRepo);
      if (!triggered && hasNativeInAppApkInstaller()) {
        nativeDownloadAndInstallApk(getRepoUrls(effectiveRepo).directApkUrl);
      }
    }
  }, [nativeMode, otaGithubRepo]);

  const t = UI_STRINGS[language];

  const statusText =
    status === ConnectionStatus.Connected
      ? isShowingAutoResolved
        ? language === 'ur'
          ? `آٹو کنیکٹڈ: ${displayedServer.nameUr}`
          : `Connected · ${displayedServer.nameEn}`
        : t.connected
      : status === ConnectionStatus.Reconnecting
      ? `${t.reconnecting} (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`
      : status === ConnectionStatus.Connecting
      ? nativeMode && nativeDetail
        ? nativeDetail
        : t.connecting
      : status === ConnectionStatus.Disconnecting
      ? t.disconnecting
      : dropReason
      ? t.connectionDropped
      : t.ready;

  const displayedVirtualIp =
    status === ConnectionStatus.Connected
      ? nativeExitIp || displayedServer.virtualIp
      : 'Unmasked (Disconnected)';

  return (
    <div
      dir={language === 'ur' ? 'rtl' : 'ltr'}
      className="canvas-3d min-h-screen bg-[#147A42] dark:bg-[#061A11] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200"
    >
      {/* Desktop Top Bar (3-zone contract) */}
      <header className="header-3d hidden lg:flex items-center justify-between gap-8 px-8 py-3.5 bg-[#0B5D32] dark:bg-[#051B11] text-white border-b border-white/15 dark:border-emerald-900/50">
        <div className="font-display-3d text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          SKP VPN
        </div>

        <nav className="flex items-center gap-6 text-sm font-medium text-white/85">
          <button
            type="button"
            onClick={() => setServerModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Locations
          </button>
          <button
            type="button"
            onClick={() => setSpeedModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Speed Check
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Split Tunneling
          </button>
          <button
            type="button"
            onClick={() => setSupportModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Keep-Alive Guide
          </button>
          <button
            type="button"
            onClick={() => setUpdatesModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Updates
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSpeedModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-[#0B5D32] dark:text-slate-950 bg-white dark:bg-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Fast Speed Check
          </button>
        </div>
      </header>

      {/* Main Responsive Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto lg:px-8 lg:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 items-start">
          {/* LEFT / PRIMARY COLUMN: SKP VPN Mobile-First Interface */}
          <section className="lg:col-span-5 w-full bg-[#116938] dark:bg-[#092116] lg:rounded-2xl lg:overflow-hidden lg:border lg:border-white/15 dark:lg:border-emerald-900/50 lg:shadow-md transition-colors duration-200">
            {/* SKP VPN Deep Emerald Top Bar */}
            <div
              dir="ltr"
              className="header-3d bg-[#0B5D32] dark:bg-[#051B11] text-white h-[58px] px-3 flex items-center justify-between select-none border-b border-transparent dark:border-emerald-900/40"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation menu"
                  className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-colors cursor-pointer"
                >
                  <Menu className="w-6 h-6" strokeWidth={2.2} />
                </button>
                <span className="font-display-3d text-[21px] font-semibold tracking-tight whitespace-nowrap">
                  SKP VPN
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSupportModalOpen(true)}
                  aria-label="Rate and support"
                  className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-colors cursor-pointer"
                >
                  <ThumbsUp className="w-[21px] h-[21px] text-[#FFC542] fill-[#FFC542]" />
                </button>

                <button
                  type="button"
                  onClick={() => setSpeedModalOpen(true)}
                  aria-label="Fast Internet Speed Check"
                  title="Fast Internet Speed Check"
                  className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-colors cursor-pointer"
                >
                  <Gauge
                    className="w-[22px] h-[22px] text-white"
                    strokeWidth={2.1}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => setServerModalOpen(true)}
                  aria-label="Choose server location"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  <span className="w-9 h-9 rounded-full bg-[#15803D] dark:bg-emerald-700 hover:bg-[#16A34A] dark:hover:bg-emerald-600 border border-white/25 flex items-center justify-center transition-colors">
                    <Globe className="w-5 h-5 text-white" strokeWidth={1.8} />
                  </span>
                </button>
              </div>
            </div>

            {/* Instant Auto-Update Banner (visible automatically when an OTA or in-app APK update downloads) */}
            {(otaStatus === 'downloading' ||
              otaStatus === 'downloading_apk' ||
              otaStatus === 'installing_apk') && (
              <button
                type="button"
                onClick={() => setUpdatesModalOpen(true)}
                className="w-full bg-emerald-950 hover:bg-emerald-900 text-emerald-200 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 border-b border-emerald-800/60 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
                <span className={language === 'ur' ? 'font-urdu' : ''}>
                  {otaStatus === 'downloading_apk'
                    ? language === 'ur'
                      ? `ایپ اپڈیٹ ڈاؤنلوڈ ہو رہی ہے (${Math.max(1, Math.round(otaProgress))}%)...`
                      : `Downloading in-app update (${Math.max(1, Math.round(otaProgress))}%)...`
                    : language === 'ur'
                    ? `نئی اپڈیٹ (${otaVersion || 'Latest'}) خودکار انسٹال ہو رہی ہے (${Math.max(5, Math.round(otaProgress))}%)...`
                    : `Auto-updating SKP VPN ${otaVersion ? `to ${otaVersion}` : ''} (${Math.max(5, Math.round(otaProgress))}%)...`}
                </span>
              </button>
            )}

            {/* Orange Battery Optimization & 5-Star Support Banner with Close Icon */}
            {showOrangeBanner && (
              <div className="w-full bg-[#F48A24] dark:bg-[#B86111] text-white flex items-start justify-between shadow-xs transition-colors">
                <button
                  type="button"
                  onClick={() => setSupportModalOpen(true)}
                  className="flex-1 min-w-0 text-start hover:bg-black/5 active:bg-black/10 ps-4 pe-2 py-3 text-[13.5px] leading-[1.38] font-medium transition-colors cursor-pointer"
                >
                  <span className={language === 'ur' ? 'font-urdu block' : ''}>
                    {t.bannerText}{' '}
                    <span className="underline decoration-white/70 underline-offset-2 font-semibold">
                      {t.bannerCta}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetShowOrangeBanner(false)}
                  aria-label={
                    language === 'ur'
                      ? 'بیٹری آپٹیمائزیشن نوٹس بند کریں'
                      : 'Close battery optimization notice'
                  }
                  title={
                    language === 'ur'
                      ? 'نوٹس بند کریں'
                      : 'Dismiss battery notice'
                  }
                  className="min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center text-white/90 hover:text-white hover:bg-black/10 active:bg-black/20 rounded-es-xl transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Main Card Container */}
            <div className="p-3.5 sm:p-4 space-y-3.5">
              {/* Session Time Limit Exceeded Visual Warning Card */}
              {isSessionOverLimit && !sessionWarningDismissed && (
                <div
                  role="alert"
                  className="bg-amber-50 dark:bg-[#241A0B] border border-amber-300 dark:border-amber-700/70 text-amber-950 dark:text-amber-100 rounded-xl p-3.5 shadow-xs space-y-2.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-bold text-amber-950 dark:text-amber-100 ${
                            language === 'ur' ? 'font-urdu' : ''
                          }`}
                        >
                          {language === 'ur'
                            ? 'سیشن کا مقررہ وقت مکمل ہو گیا'
                            : 'Session Time Limit Exceeded'}
                        </div>
                        <p className="text-[11.5px] text-amber-800 dark:text-amber-200/90 mt-0.5 font-mono-tabular">
                          {language === 'ur'
                            ? `دورانیہ ${formatDuration(
                                sessionSeconds
                              )} · لمٹ ${Math.round(
                                effectiveLimitSeconds / 60
                              )}m · ڈیٹا ${formatBytesCompact(
                                totalSessionBytes
                              )}`
                            : `Active ${formatDuration(
                                sessionSeconds
                              )} (Limit ${Math.round(
                                effectiveLimitSeconds / 60
                              )}m) · Data ${formatBytesCompact(
                                totalSessionBytes
                              )}`}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSessionWarningDismissed(true)}
                      aria-label="Dismiss session limit warning"
                      className="min-w-[36px] min-h-[36px] -mt-1 -me-1 rounded-lg flex items-center justify-center text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleConnection}
                      className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {language === 'ur' ? 'فوری ڈس کنیکٹ کریں' : 'Disconnect Now'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSnoozeSessionWarning}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white dark:bg-[#161108] border border-amber-300 dark:border-amber-700/70 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs font-semibold font-mono-tabular transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      +15m
                    </button>
                  </div>
                </div>
              )}

              {/* Primary Connection Card */}
              <div className="card-3d bg-white dark:bg-[#0F2018] rounded-xl shadow-sm border border-transparent dark:border-emerald-900/40 px-5 pt-6 pb-5 flex flex-col items-center transition-colors duration-200">
                {/* Emerald Rounded Server Selector Button (shows actual connected server + flag when Auto-Select connects!) */}
                <button
                  type="button"
                  onClick={() => setServerModalOpen(true)}
                  className="btn-3d-emerald w-full max-w-[292px] h-[54px] bg-[#15803D] dark:bg-[#126B34] hover:bg-[#116932] dark:hover:bg-[#15803D] text-white rounded-full px-3.5 flex items-center justify-between shadow-xs transition-all cursor-pointer"
                >
                  <FlagIcon
                    countryCode={displayedServer.countryCode}
                    size="md"
                  />
                  <span
                    className={`text-[16px] font-medium truncate px-2 ${
                      language === 'ur' ? 'font-urdu' : ''
                    }`}
                  >
                    {language === 'ur'
                      ? isShowingAutoResolved
                        ? `${displayedServer.nameUr} (آٹو)`
                        : displayedServer.nameUr
                      : isShowingAutoResolved
                      ? `${displayedServer.nameEn} · Auto`
                      : displayedServer.nameEn}
                  </span>
                  <ChevronDown
                    className="w-5 h-5 text-white/95 shrink-0 mr-1"
                    strokeWidth={2.4}
                  />
                </button>

                {/* Prominent VPN Connection Time Readout */}
                <div className="mt-3 mb-0.5 flex flex-col items-center">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400 shrink-0" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur'
                        ? 'کنیکشن کا وقت (Connection Time)'
                        : 'VPN Connection Time'}
                    </span>
                    {status === ConnectionStatus.Connected &&
                      connectedSinceMs > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            {new Date(connectedSinceMs).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </>
                      )}
                  </div>

                  <div
                    aria-live="off"
                    className={`mt-0.5 text-[28px] sm:text-[30px] leading-tight font-bold font-mono-tabular font-mono-3d tracking-wider ${
                      status === ConnectionStatus.Connected
                        ? isSessionOverLimit
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-[#15803D] dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {formatDuration(
                      status === ConnectionStatus.Connected ? sessionSeconds : 0
                    )}
                  </div>
                </div>

                {/* Connection Status Text */}
                <div
                  className={`mt-1.5 mb-1 text-[15px] font-medium text-center font-mono-tabular px-2 ${
                    status === ConnectionStatus.Connected
                      ? 'text-[#15803D] dark:text-emerald-400'
                      : status === ConnectionStatus.Reconnecting
                      ? 'text-[#D9720D] dark:text-amber-400'
                      : status === ConnectionStatus.Connecting ||
                        status === ConnectionStatus.Disconnecting
                      ? 'text-[#F48A24] dark:text-amber-400'
                      : dropReason || nativeError
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                  } ${language === 'ur' ? 'font-urdu' : ''}`}
                >
                  {statusText}
                </div>

                {/* Big Circular Connect / Disconnect / Cancel Ring */}
                <ConnectRingButton
                  status={status}
                  onToggle={handleToggleConnection}
                  connectLabel={t.connectBtn}
                  disconnectLabel={t.disconnectBtn}
                  cancelLabel={t.cancelBtn}
                  darkMode={darkMode}
                />

                {/* Quiet Unboxed Live Throughput or Reconnect Telemetry */}
                <div className="mt-2 min-h-[24px] flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular text-center">
                  {status === ConnectionStatus.Connected ? (
                    nativeMode ? (
                      <>
                        <span>↓ {formatBytesCompact(nativeRxBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>↑ {formatBytesCompact(nativeTxBytes)}</span>
                        {sessionAlert.enabled && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => setDrawerOpen(true)}
                              className={`hover:underline cursor-pointer ${
                                isSessionOverLimit
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : ''
                              }`}
                            >
                              Limit {Math.round(effectiveLimitSeconds / 60)}m
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span>↓ {downSpeedMbps.toFixed(1)} Mbps</span>
                        <span aria-hidden="true">·</span>
                        <span>↑ {upSpeedMbps.toFixed(1)} Mbps</span>
                        {sessionAlert.enabled && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => setDrawerOpen(true)}
                              className={`hover:underline cursor-pointer ${
                                isSessionOverLimit
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : ''
                              }`}
                            >
                              Limit {Math.round(effectiveLimitSeconds / 60)}m
                            </button>
                          </>
                        )}
                      </>
                    )
                  ) : status === ConnectionStatus.Reconnecting ? (
                    <>
                      <span className="font-sans text-[#D9720D] dark:text-amber-400 font-medium">
                        {reconnectHandshakeActive
                          ? `Dialing ${
                              language === 'ur'
                                ? lastUsedServer.nameUr
                                : lastUsedServer.nameEn
                            }...`
                          : `Target: ${
                              language === 'ur'
                                ? lastUsedServer.nameUr
                                : lastUsedServer.nameEn
                            } · ${reconnectCountdown}s`}
                      </span>
                      {!reconnectHandshakeActive && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={handleRetryReconnectNow}
                            className="font-sans font-semibold text-[#15803D] dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                          >
                            {t.retryNow}
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="font-sans text-slate-400 dark:text-slate-500">
                      {nativeMode ? 'WireGuard System VPN' : protocol} ·{' '}
                      {displayedServer.basePingMs} ms
                    </span>
                  )}
                </div>

                {/* Real Android System WireGuard Tunnel Confirmation Line */}
                {status === ConnectionStatus.Connected && (
                  <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[#15803D] dark:text-emerald-400" />
                    <span className="font-mono-tabular">
                      {nativeMode
                        ? `System VPN Active${
                            nativeExitIp ? ` · IP ${nativeExitIp}` : ''
                          }${nativeColo ? ` (${nativeColo})` : ''}`
                        : `Protected IP · ${displayedVirtualIp}`}
                    </span>
                  </div>
                )}

                {/* Native Android Error / Permission Prompt Notice */}
                {nativeError && status === ConnectionStatus.Disconnected && (
                  <div className="mt-2.5 w-full rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2 text-left">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <span>{nativeError}</span>
                  </div>
                )}

                {/* Recovery Confirmation Line */}
                {recoveryBannerMessage &&
                  status === ConnectionStatus.Connected && (
                    <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">
                      {recoveryBannerMessage}
                    </div>
                  )}

                {/* Static "Free Unlimited" Label */}
                <div
                  className={`mt-2.5 text-[16px] font-medium text-[#15803D] dark:text-emerald-400 ${
                    language === 'ur' ? 'font-urdu' : 'font-display-3d-emerald'
                  }`}
                >
                  {t.freeLabel}
                </div>
              </div>

              {/* Inline Fast Internet Speed Check Card */}
              <FastSpeedCheckCard
                server={displayedServer}
                language={language}
                lastMetrics={lastSpeedTest}
                onComplete={setLastSpeedTest}
                onOpenFullModal={() => setSpeedModalOpen(true)}
              />

              {/* Auto-Reconnect Guard Bar */}
              <div className="card-3d bg-white dark:bg-[#0F2018] rounded-xl shadow-sm border border-transparent dark:border-emerald-900/40 px-4 py-3 flex items-center justify-between gap-3 transition-colors duration-200">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                    <RotateCw
                      className={`w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400 shrink-0 ${
                        status === ConnectionStatus.Reconnecting
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {t.autoReconnect}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    <span>{t.lastServer}:</span>{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {language === 'ur'
                        ? displayedServer.nameUr
                        : displayedServer.nameEn}
                    </span>
                    {nativeEndpoint && status === ConnectionStatus.Connected ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">
                          {nativeEndpoint}
                        </span>
                      </>
                    ) : killSwitch ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>Kill-Switch On</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {status === ConnectionStatus.Connected && !nativeMode && (
                    <button
                      type="button"
                      onClick={() =>
                        handleConnectionDropDetected('tunnel_drop')
                      }
                      title="Simulate an unexpected connection drop to test Auto-Reconnect"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#13291F] hover:bg-slate-200 dark:hover:bg-emerald-900/40 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <WifiOff className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>{t.testDrop}</span>
                    </button>
                  )}

                  <div className="min-w-[44px] min-h-[44px] flex items-center justify-end">
                    <button
                      type="button"
                      role="switch"
                      aria-label="Toggle Auto-Reconnect"
                      aria-checked={autoReconnect}
                      onClick={handleToggleAutoReconnect}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                        autoReconnect
                          ? 'bg-[#15803D] dark:bg-emerald-500'
                          : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          autoReconnect ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT COMPANION WORKSPACE (Visible on Desktop lg:) */}
          <section className="hidden lg:flex lg:col-span-7 flex-col gap-6">
            {/* Live Connection Diagnostics & Fast Speed Summary */}
            <div className="card-3d bg-white dark:bg-[#0F2018] rounded-2xl shadow-sm border border-transparent dark:border-emerald-900/40 p-6 space-y-5 transition-colors duration-200">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="font-display-3d-surface text-xl font-bold text-slate-900 dark:text-slate-100">
                    Tunnel Diagnostics &amp; Speed Monitor
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {protocol} · Virtual IP{' '}
                    <span className="font-mono-tabular text-slate-700 dark:text-slate-200 font-medium">
                      {status === ConnectionStatus.Connected
                        ? displayedVirtualIp
                        : status === ConnectionStatus.Reconnecting
                        ? `Reconnecting to ${lastUsedServer.virtualIp}...`
                        : 'Unmasked (Disconnected)'}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLanguage(language === 'en' ? 'ur' : 'en')
                    }
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-emerald-900/50 hover:bg-slate-50 dark:hover:bg-[#13291F] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Languages className="w-4 h-4 text-[#15803D] dark:text-emerald-400" />
                    <span>{language === 'en' ? 'اردو (Urdu)' : 'English'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSpeedModalOpen(true)}
                    className="btn-3d-emerald min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#116932] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Gauge className="w-4 h-4" />
                    <span>Fast Speed Check</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-1 border-t border-slate-100 dark:border-emerald-900/40">
                <div className="pt-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span>{t.duration}</span>
                    {sessionAlert.enabled && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-mono-tabular ${
                            isSessionOverLimit
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : ''
                          }`}
                        >
                          Limit {Math.round(effectiveLimitSeconds / 60)}m
                        </span>
                      </>
                    )}
                  </div>
                  <div
                    className={`text-2xl font-bold font-mono-tabular font-mono-3d mt-1 ${
                      isSessionOverLimit
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {formatDuration(sessionSeconds)}
                  </div>
                </div>
                <div className="pt-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t.download}
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular font-mono-3d text-slate-900 dark:text-white mt-1">
                    {downSpeedMbps.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      Mbps
                    </span>
                  </div>
                </div>
                <div className="pt-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t.upload}
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular font-mono-3d text-slate-900 dark:text-white mt-1">
                    {upSpeedMbps.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      Mbps
                    </span>
                  </div>
                </div>
              </div>

              {reconnectLogs.length > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-emerald-900/40 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Recent Auto-Reconnect Events
                    </span>
                    <button
                      type="button"
                      onClick={() => setReconnectLogs([])}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {reconnectLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 py-1"
                      >
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <span
                            className={`font-semibold ${
                              entry.outcome === 'recovered'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {entry.outcome === 'recovered'
                              ? 'Recovered'
                              : 'Stopped'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{entry.serverNameEn}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                            {entry.attempts}{' '}
                            {entry.attempts === 1 ? 'attempt' : 'attempts'}
                          </span>
                        </div>
                        <span className="font-mono-tabular text-slate-400 dark:text-slate-500 shrink-0 ml-3">
                          {entry.timestamp}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lastSpeedTest && (
                <div className="pt-3 border-t border-slate-100 dark:border-emerald-900/40 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Last Speed Check ({lastSpeedTest.timestamp})</span>
                  <span className="font-mono-tabular text-slate-700 dark:text-slate-200 font-medium">
                    Ping {lastSpeedTest.pingMs} ms (Loaded{' '}
                    {lastSpeedTest.loadedPingMs} ms) · Down{' '}
                    {lastSpeedTest.downloadMbps} Mbps · Up{' '}
                    {lastSpeedTest.uploadMbps} Mbps
                  </span>
                </div>
              )}
            </div>

            {/* All Free Unlocked Global Proxy Nodes */}
            <div className="card-3d bg-white dark:bg-[#0F2018] rounded-2xl shadow-sm border border-transparent dark:border-emerald-900/40 p-6 transition-colors duration-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display-3d-surface text-base font-bold text-slate-900 dark:text-slate-100">
                    Free Global Proxy Nodes
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Includes Pakistan (Karachi &amp; Islamabad) &amp; global
                    locations — 100% free
                  </p>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                  {SERVER_LOCATIONS.length} Free Nodes
                </span>
              </div>

              <div className="max-h-[410px] overflow-y-auto">
                <ServerListContent
                  servers={SERVER_LOCATIONS}
                  selectedServerId={selectedServer.id}
                  activeConnectedServerId={
                    status === ConnectionStatus.Connected
                      ? displayedServer.id
                      : null
                  }
                  language={language}
                  onSelectServer={handleSelectServer}
                />
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Modals & Drawers */}
      <DrawerMenu
        isOpen={drawerOpen}
        language={language}
        darkMode={darkMode}
        theme3d={theme3d}
        protocol={protocol}
        splitApps={splitApps}
        killSwitch={killSwitch}
        autoReconnect={autoReconnect}
        lastUsedServer={lastUsedServer}
        status={status}
        sessionAlert={sessionAlert}
        notificationPermission={notificationPermission}
        onUpdateSessionAlert={handleUpdateSessionAlert}
        onRequestNotificationPermission={handleRequestNotificationPermission}
        onToggleDarkMode={handleToggleDarkMode}
        onToggleTheme3d={handleToggleTheme3d}
        onSelectProtocol={setProtocol}
        onToggleSplitApp={handleToggleSplitApp}
        onToggleKillSwitch={() => setKillSwitch((prev) => !prev)}
        onToggleAutoReconnect={handleToggleAutoReconnect}
        onSimulateDrop={() => handleConnectionDropDetected('tunnel_drop')}
        onChangeLanguage={setLanguage}
        otaStatus={otaStatus}
        otaProgress={otaProgress}
        onOpenSpeedTest={() => setSpeedModalOpen(true)}
        onOpenBattery={() => setSupportModalOpen(true)}
        onOpenUpdates={() => setUpdatesModalOpen(true)}
        onUpdateAppNow={handleMenuQuickUpdate}
        onClose={() => setDrawerOpen(false)}
      />

      <ServerModal
        isOpen={serverModalOpen}
        onClose={() => setServerModalOpen(false)}
        servers={SERVER_LOCATIONS}
        selectedServerId={selectedServer.id}
        activeConnectedServerId={
          status === ConnectionStatus.Connected ? displayedServer.id : null
        }
        language={language}
        onSelectServer={handleSelectServer}
      />

      <SupportBatteryModal
        isOpen={supportModalOpen}
        language={language}
        showBanner={showOrangeBanner}
        onToggleBanner={handleSetShowOrangeBanner}
        onClose={() => setSupportModalOpen(false)}
      />

      <SpeedTestModal
        isOpen={speedModalOpen}
        server={displayedServer}
        language={language}
        onComplete={setLastSpeedTest}
        onClose={() => setSpeedModalOpen(false)}
      />

      <UpdatesModal
        isOpen={updatesModalOpen}
        language={language}
        otaStatus={otaStatus}
        otaProgress={otaProgress}
        otaError={otaError}
        otaErrorCode={otaErrorCode}
        otaGithubRepo={otaGithubRepo}
        otaVersion={otaVersion}
        onClose={() => setUpdatesModalOpen(false)}
      />
    </div>
  );
}
