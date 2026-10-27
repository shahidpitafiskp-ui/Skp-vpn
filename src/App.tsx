/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Menu,
  ThumbsUp,
  Globe,
  ChevronDown,
  Gauge,
  Languages,
  RotateCw,
  WifiOff,
} from 'lucide-react';
import {
  ConnectionStatus,
  Language,
  ReconnectLogEntry,
  ServerLocation,
  SpeedTestMetrics,
  SplitTunnelApp,
  VpnProtocol,
} from './types/vpn';
import {
  INITIAL_SPLIT_APPS,
  SERVER_LOCATIONS,
  UI_STRINGS,
} from './data/servers';
import { FlagIcon } from './components/FlagIcon';
import { ConnectRingButton } from './components/ConnectRingButton';
import { ServerListContent, ServerModal } from './components/ServerModal';
import { SupportBatteryModal } from './components/SupportBatteryModal';
import {
  FastSpeedCheckCard,
  SpeedTestModal,
} from './components/SpeedTestModal';
import { DrawerMenu } from './components/DrawerMenu';

const LAST_SERVER_STORAGE_KEY = 'skp_vpn_last_server_id';
const AUTO_RECONNECT_STORAGE_KEY = 'skp_vpn_auto_reconnect';
const MAX_RECONNECT_ATTEMPTS = 5;
const BACKOFF_SECONDS = [2, 3, 5, 8, 12];

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

  const [status, setStatus] = useState<ConnectionStatus>(
    ConnectionStatus.Connected
  );
  const [selectedServer, setSelectedServer] =
    useState<ServerLocation>(initialServer);
  const [lastUsedServer, setLastUsedServer] =
    useState<ServerLocation>(initialServer);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(
    loadInitialAutoReconnect
  );

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

  // Notice banner state
  const [showOrangeBanner, setShowOrangeBanner] = useState<boolean>(true);

  // Modals & Drawers
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [serverModalOpen, setServerModalOpen] = useState<boolean>(false);
  const [supportModalOpen, setSupportModalOpen] = useState<boolean>(false);
  const [speedModalOpen, setSpeedModalOpen] = useState<boolean>(false);

  // Live session timer & throughput telemetry
  const [sessionSeconds, setSessionSeconds] = useState<number>(854);
  const [downSpeedMbps, setDownSpeedMbps] = useState<number>(52.4);
  const [upSpeedMbps, setUpSpeedMbps] = useState<number>(21.8);
  const [lastSpeedTest, setLastSpeedTest] = useState<SpeedTestMetrics | null>(
    null
  );

  const transitionTimerRef = useRef<number | null>(null);
  const reconnectCountdownRef = useRef<number | null>(null);
  const reconnectHandshakeRef = useRef<number | null>(null);
  const recoveryMessageTimerRef = useRef<number | null>(null);

  const saveLastUsedServer = useCallback((srv: ServerLocation) => {
    setLastUsedServer(srv);
    try {
      window.localStorage.setItem(LAST_SERVER_STORAGE_KEY, srv.id);
    } catch {
      // Ignore storage errors
    }
  }, []);

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
            saveLastUsedServer(targetServer);
            setStatus(ConnectionStatus.Connected);

            const timestamp = new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            setReconnectLogs((prev) => [
              {
                id: `${Date.now()}-ok`,
                serverNameEn: targetServer.nameEn,
                serverNameUr: targetServer.nameUr,
                reason,
                attempts: attemptNumber,
                outcome: 'recovered',
                timestamp,
              },
              ...prev.slice(0, 4),
            ]);

            setRecoveryBannerMessage(
              `Restored tunnel to ${targetServer.nameEn} (${timestamp})`
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
    [clearAllTimers, saveLastUsedServer]
  );

  const handleConnectionDropDetected = useCallback(
    (reason: 'network_offline' | 'tunnel_drop') => {
      clearAllTimers();
      setDropReason(reason);
      setDownSpeedMbps(0);
      setUpSpeedMbps(0);

      if (autoReconnect) {
        executeReconnectAttempt(1, lastUsedServer, reason);
      } else {
        setStatus(ConnectionStatus.Disconnected);
        setSessionSeconds(0);
      }
    },
    [autoReconnect, clearAllTimers, executeReconnectAttempt, lastUsedServer]
  );

  const handleRetryReconnectNow = useCallback(() => {
    if (status !== ConnectionStatus.Reconnecting) return;
    clearAllTimers();
    const currentAttempt = Math.max(1, reconnectAttempt);
    setReconnectCountdown(0);
    setReconnectHandshakeActive(true);

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
      saveLastUsedServer(lastUsedServer);
      setStatus(ConnectionStatus.Connected);

      const timestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setReconnectLogs((prev) => [
        {
          id: `${Date.now()}-ok`,
          serverNameEn: lastUsedServer.nameEn,
          serverNameUr: lastUsedServer.nameUr,
          reason: dropReason ?? 'tunnel_drop',
          attempts: currentAttempt,
          outcome: 'recovered',
          timestamp,
        },
        ...prev.slice(0, 4),
      ]);

      setRecoveryBannerMessage(
        `Restored tunnel to ${lastUsedServer.nameEn} (${timestamp})`
      );
    }, 850);
  }, [
    clearAllTimers,
    dropReason,
    executeReconnectAttempt,
    lastUsedServer,
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

  useEffect(() => {
    if (status !== ConnectionStatus.Connected) return;

    const probeInterval = window.setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        handleConnectionDropDetected('network_offline');
        return;
      }
      try {
        await fetch(window.location.origin, {
          method: 'HEAD',
          cache: 'no-store',
        });
      } catch {
        handleConnectionDropDetected('tunnel_drop');
      }
    }, 20000);

    return () => window.clearInterval(probeInterval);
  }, [status, handleConnectionDropDetected]);

  useEffect(() => {
    if (status !== ConnectionStatus.Connected) {
      setDownSpeedMbps(0);
      setUpSpeedMbps(0);
      return;
    }

    const loadBonus = Math.round((100 - selectedServer.loadPercent) * 0.45);
    const baseDown = 46.2 + loadBonus;
    const baseUp = Number((baseDown * 0.42).toFixed(1));
    setDownSpeedMbps(baseDown);
    setUpSpeedMbps(baseUp);

    const interval = window.setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
      setDownSpeedMbps(
        Number((baseDown + (Math.random() * 6.8 - 3.4)).toFixed(1))
      );
      setUpSpeedMbps(
        Number((baseUp + (Math.random() * 2.8 - 1.4)).toFixed(1))
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, selectedServer]);

  const handleToggleConnection = useCallback(() => {
    clearAllTimers();
    setRecoveryBannerMessage(null);

    if (status === ConnectionStatus.Connected) {
      setDropReason(null);
      setStatus(ConnectionStatus.Disconnecting);
      transitionTimerRef.current = window.setTimeout(() => {
        setStatus(ConnectionStatus.Disconnected);
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
      setSessionSeconds(0);
    } else {
      setDropReason(null);
      setStatus(ConnectionStatus.Connecting);
      transitionTimerRef.current = window.setTimeout(() => {
        setSessionSeconds(0);
        saveLastUsedServer(selectedServer);
        setStatus(ConnectionStatus.Connected);
      }, 1150);
    }
  }, [clearAllTimers, saveLastUsedServer, selectedServer, status]);

  const handleSelectServer = useCallback(
    (srv: ServerLocation) => {
      setSelectedServer(srv);
      setDropReason(null);
      setRecoveryBannerMessage(null);
      clearAllTimers();
      setStatus(ConnectionStatus.Connecting);
      transitionTimerRef.current = window.setTimeout(() => {
        setSessionSeconds(0);
        saveLastUsedServer(srv);
        setStatus(ConnectionStatus.Connected);
      }, 950);
    },
    [clearAllTimers, saveLastUsedServer]
  );

  const handleToggleSplitApp = useCallback((id: string) => {
    setSplitApps((prev) =>
      prev.map((app) =>
        app.id === id ? { ...app, enabled: !app.enabled } : app
      )
    );
  }, []);

  const t = UI_STRINGS[language];

  const statusText =
    status === ConnectionStatus.Connected
      ? t.connected
      : status === ConnectionStatus.Reconnecting
      ? `${t.reconnecting} (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`
      : status === ConnectionStatus.Connecting
      ? t.connecting
      : status === ConnectionStatus.Disconnecting
      ? t.disconnecting
      : dropReason
      ? t.connectionDropped
      : t.ready;

  return (
    <div
      dir={language === 'ur' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#147A42] text-slate-900 flex flex-col"
    >
      {/* Desktop Top Bar (3-zone contract on cohesive Deep Forest Green) */}
      <header className="hidden lg:flex items-center justify-between gap-8 px-8 py-3.5 bg-[#0B5D32] text-white border-b border-white/15">
        <div className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
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
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSpeedModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-[#0B5D32] bg-white hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Fast Speed Check
          </button>
        </div>
      </header>

      {/* Main Responsive Workspace on Vibrant Green Background */}
      <main className="flex-1 w-full max-w-6xl mx-auto lg:px-8 lg:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 items-start">
          {/* LEFT / PRIMARY COLUMN: SKP VPN Mobile-First Interface on Green Canvas */}
          <section className="lg:col-span-5 w-full bg-[#116938] lg:rounded-2xl lg:overflow-hidden lg:border lg:border-white/15 lg:shadow-md">
            {/* SKP VPN Deep Emerald Top Bar (#0B5D32) */}
            <div
              dir="ltr"
              className="bg-[#0B5D32] text-white h-[58px] px-3 flex items-center justify-between select-none"
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
                <span className="text-[21px] font-semibold tracking-tight whitespace-nowrap">
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
                  <Gauge className="w-[23px] h-[23px] text-white" strokeWidth={2.1} />
                </button>

                <button
                  type="button"
                  onClick={() => setServerModalOpen(true)}
                  aria-label="Choose server location"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  <span className="w-9 h-9 rounded-full bg-[#15803D] hover:bg-[#16A34A] border border-white/25 flex items-center justify-center transition-colors">
                    <Globe className="w-5 h-5 text-white" strokeWidth={1.8} />
                  </span>
                </button>
              </div>
            </div>

            {/* Orange Battery Optimization & 5-Star Support Banner */}
            {showOrangeBanner && (
              <button
                type="button"
                onClick={() => setSupportModalOpen(true)}
                className="w-full text-left bg-[#F48A24] hover:bg-[#EC811B] active:bg-[#E07916] text-white px-4 py-3 text-[13.5px] leading-[1.38] font-medium transition-colors cursor-pointer shadow-xs"
              >
                <span className={language === 'ur' ? 'font-urdu block' : ''}>
                  {t.bannerText}{' '}
                  <span className="underline decoration-white/70 underline-offset-2 font-semibold">
                    {t.bannerCta}
                  </span>
                </span>
              </button>
            )}

            {/* Main Card Container over Rich Green Background */}
            <div className="p-3.5 sm:p-4 space-y-3.5">
              {/* Primary White SKP VPN Connection Card */}
              <div className="bg-white rounded-xl shadow-sm px-5 pt-6 pb-5 flex flex-col items-center">
                {/* Emerald Rounded Server Selector Button */}
                <button
                  type="button"
                  onClick={() => setServerModalOpen(true)}
                  className="w-full max-w-[276px] h-[54px] bg-[#15803D] hover:bg-[#116932] active:scale-[0.99] text-white rounded-full px-3.5 flex items-center justify-between shadow-xs transition-all cursor-pointer"
                >
                  <FlagIcon
                    countryCode={selectedServer.countryCode}
                    size="md"
                  />
                  <span
                    className={`text-[17px] font-medium truncate px-2 ${
                      language === 'ur' ? 'font-urdu' : ''
                    }`}
                  >
                    {language === 'ur'
                      ? selectedServer.nameUr
                      : selectedServer.nameEn}
                  </span>
                  <ChevronDown
                    className="w-5 h-5 text-white/95 shrink-0 mr-1"
                    strokeWidth={2.4}
                  />
                </button>

                {/* Connection Status Text */}
                <div
                  className={`mt-4 mb-1 text-[17px] font-medium text-center font-mono-tabular ${
                    status === ConnectionStatus.Connected
                      ? 'text-[#15803D]'
                      : status === ConnectionStatus.Reconnecting
                      ? 'text-[#D9720D]'
                      : status === ConnectionStatus.Connecting ||
                        status === ConnectionStatus.Disconnecting
                      ? 'text-[#F48A24]'
                      : dropReason
                      ? 'text-rose-600'
                      : 'text-slate-500'
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
                />

                {/* Quiet Unboxed Live Session or Reconnect Telemetry */}
                <div className="mt-2 min-h-[24px] flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 font-mono-tabular text-center">
                  {status === ConnectionStatus.Connected ? (
                    <>
                      <span>{formatDuration(sessionSeconds)}</span>
                      <span aria-hidden="true">·</span>
                      <span>↓ {downSpeedMbps.toFixed(1)} Mbps</span>
                      <span aria-hidden="true">·</span>
                      <span>↑ {upSpeedMbps.toFixed(1)} Mbps</span>
                    </>
                  ) : status === ConnectionStatus.Reconnecting ? (
                    <>
                      <span className="font-sans text-[#D9720D] font-medium">
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
                            className="font-sans font-semibold text-[#15803D] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            {t.retryNow}
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="font-sans text-slate-400">
                      {protocol} · {selectedServer.basePingMs} ms
                    </span>
                  )}
                </div>

                {/* Recovery Confirmation Line */}
                {recoveryBannerMessage &&
                  status === ConnectionStatus.Connected && (
                    <div className="mt-2 text-xs text-emerald-700 font-medium text-center">
                      {recoveryBannerMessage}
                    </div>
                  )}

                {/* Static "Free Unlimited" Label */}
                <div
                  className={`mt-2.5 text-[16px] font-medium text-[#15803D] ${
                    language === 'ur' ? 'font-urdu' : ''
                  }`}
                >
                  {t.freeLabel}
                </div>
              </div>

              {/* Inline Fast Internet Speed Check Card */}
              <FastSpeedCheckCard
                server={selectedServer}
                language={language}
                lastMetrics={lastSpeedTest}
                onComplete={setLastSpeedTest}
                onOpenFullModal={() => setSpeedModalOpen(true)}
              />

              {/* Auto-Reconnect Guard Bar */}
              <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <RotateCw
                      className={`w-3.5 h-3.5 text-[#15803D] shrink-0 ${
                        status === ConnectionStatus.Reconnecting
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {t.autoReconnect}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    <span>{t.lastServer}:</span>{' '}
                    <span className="font-medium text-slate-700">
                      {language === 'ur'
                        ? lastUsedServer.nameUr
                        : lastUsedServer.nameEn}
                    </span>
                    {killSwitch && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>Kill-Switch On</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {status === ConnectionStatus.Connected && (
                    <button
                      type="button"
                      onClick={() =>
                        handleConnectionDropDetected('tunnel_drop')
                      }
                      title="Simulate an unexpected connection drop to test Auto-Reconnect"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <WifiOff className="w-3.5 h-3.5 text-slate-500" />
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
                        autoReconnect ? 'bg-[#15803D]' : 'bg-slate-300'
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
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    Tunnel Diagnostics &amp; Speed Monitor
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {protocol} · Virtual IP{' '}
                    <span className="font-mono-tabular text-slate-700 font-medium">
                      {status === ConnectionStatus.Connected
                        ? selectedServer.virtualIp
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
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Languages className="w-4 h-4 text-[#15803D]" />
                    <span>{language === 'en' ? 'اردو (Urdu)' : 'English'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSpeedModalOpen(true)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#116932] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Gauge className="w-4 h-4" />
                    <span>Fast Speed Check</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-1 border-t border-slate-100">
                <div className="pt-3">
                  <div className="text-xs text-slate-500">{t.duration}</div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
                    {formatDuration(sessionSeconds)}
                  </div>
                </div>
                <div className="pt-3">
                  <div className="text-xs text-slate-500">{t.download}</div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
                    {downSpeedMbps.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      Mbps
                    </span>
                  </div>
                </div>
                <div className="pt-3">
                  <div className="text-xs text-slate-500">{t.upload}</div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
                    {upSpeedMbps.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      Mbps
                    </span>
                  </div>
                </div>
              </div>

              {reconnectLogs.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      Recent Auto-Reconnect Events
                    </span>
                    <button
                      type="button"
                      onClick={() => setReconnectLogs([])}
                      className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {reconnectLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between text-xs text-slate-600 py-1"
                      >
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <span
                            className={`font-semibold ${
                              entry.outcome === 'recovered'
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {entry.outcome === 'recovered'
                              ? 'Recovered'
                              : 'Stopped'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{entry.serverNameEn}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-slate-500">
                            {entry.attempts}{' '}
                            {entry.attempts === 1 ? 'attempt' : 'attempts'}
                          </span>
                        </div>
                        <span className="font-mono-tabular text-slate-400 shrink-0 ml-3">
                          {entry.timestamp}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lastSpeedTest && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Last Speed Check ({lastSpeedTest.timestamp})</span>
                  <span className="font-mono-tabular text-slate-700 font-medium">
                    Ping {lastSpeedTest.pingMs} ms (Loaded{' '}
                    {lastSpeedTest.loadedPingMs} ms) · Down{' '}
                    {lastSpeedTest.downloadMbps} Mbps · Up{' '}
                    {lastSpeedTest.uploadMbps} Mbps
                  </span>
                </div>
              )}
            </div>

            {/* All Free Unlocked Global Proxy Nodes */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Free Global Proxy Nodes
                  </h2>
                  <p className="text-xs text-slate-500">
                    All high-speed locations are unlocked with zero subscription
                    limits
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono-tabular">
                  {SERVER_LOCATIONS.length} Free Nodes
                </span>
              </div>

              <div className="max-h-[410px] overflow-y-auto">
                <ServerListContent
                  servers={SERVER_LOCATIONS}
                  selectedServerId={selectedServer.id}
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
        protocol={protocol}
        splitApps={splitApps}
        killSwitch={killSwitch}
        autoReconnect={autoReconnect}
        lastUsedServer={lastUsedServer}
        status={status}
        onSelectProtocol={setProtocol}
        onToggleSplitApp={handleToggleSplitApp}
        onToggleKillSwitch={() => setKillSwitch((prev) => !prev)}
        onToggleAutoReconnect={handleToggleAutoReconnect}
        onSimulateDrop={() => handleConnectionDropDetected('tunnel_drop')}
        onChangeLanguage={setLanguage}
        onOpenSpeedTest={() => setSpeedModalOpen(true)}
        onOpenBattery={() => setSupportModalOpen(true)}
        onClose={() => setDrawerOpen(false)}
      />

      <ServerModal
        isOpen={serverModalOpen}
        onClose={() => setServerModalOpen(false)}
        servers={SERVER_LOCATIONS}
        selectedServerId={selectedServer.id}
        language={language}
        onSelectServer={handleSelectServer}
      />

      <SupportBatteryModal
        isOpen={supportModalOpen}
        language={language}
        showBanner={showOrangeBanner}
        onToggleBanner={setShowOrangeBanner}
        onClose={() => setSupportModalOpen(false)}
      />

      <SpeedTestModal
        isOpen={speedModalOpen}
        server={selectedServer}
        language={language}
        onComplete={setLastSpeedTest}
        onClose={() => setSpeedModalOpen(false)}
      />
    </div>
  );
}
