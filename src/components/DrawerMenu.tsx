import React, { useState } from 'react';
import {
  X,
  Shield,
  Gauge,
  Languages,
  BatteryCharging,
  Sliders,
  Check,
  RotateCw,
  RefreshCw,
  Moon,
  Sun,
} from 'lucide-react';
import {
  ConnectionStatus,
  Language,
  ServerLocation,
  SplitTunnelApp,
  VpnProtocol,
} from '../types/vpn';

interface DrawerMenuProps {
  isOpen: boolean;
  language: Language;
  darkMode: boolean;
  protocol: VpnProtocol;
  splitApps: SplitTunnelApp[];
  killSwitch: boolean;
  autoReconnect: boolean;
  lastUsedServer: ServerLocation;
  status: ConnectionStatus;
  onToggleDarkMode: () => void;
  onSelectProtocol: (p: VpnProtocol) => void;
  onToggleSplitApp: (id: string) => void;
  onToggleKillSwitch: () => void;
  onToggleAutoReconnect: () => void;
  onSimulateDrop: () => void;
  onChangeLanguage: (lang: Language) => void;
  onOpenSpeedTest: () => void;
  onOpenBattery: () => void;
  onOpenUpdates: () => void;
  onClose: () => void;
}

export const DrawerMenu: React.FC<DrawerMenuProps> = ({
  isOpen,
  language,
  darkMode,
  protocol,
  splitApps,
  killSwitch,
  autoReconnect,
  lastUsedServer,
  status,
  onToggleDarkMode,
  onSelectProtocol,
  onToggleSplitApp,
  onToggleKillSwitch,
  onToggleAutoReconnect,
  onSimulateDrop,
  onChangeLanguage,
  onOpenSpeedTest,
  onOpenBattery,
  onOpenUpdates,
  onClose,
}) => {
  const [iconFailed, setIconFailed] = useState<boolean>(false);

  if (!isOpen) return null;

  const protocols = [
    VpnProtocol.Auto,
    VpnProtocol.WireGuard,
    VpnProtocol.IKEv2,
    VpnProtocol.OpenVPNTcp,
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex bg-slate-950/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <aside
        className="w-[86vw] max-w-[340px] h-full bg-white dark:bg-[#0D1E16] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden border-r border-transparent dark:border-emerald-900/40 transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drawer Brand Header */}
        <div className="bg-[#0B5D32] dark:bg-[#062816] px-5 py-5 text-white flex items-center justify-between border-b border-transparent dark:border-emerald-900/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white overflow-hidden flex items-center justify-center shadow-xs shrink-0">
              {!iconFailed ? (
                <img
                  src="/pwa-192x192.png"
                  alt="SKP VPN Icon"
                  referrerPolicy="no-referrer"
                  onError={() => setIconFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Shield className="w-5 h-5 text-[#0B4C9C]" />
              )}
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">SKP VPN</div>
              <div className="text-xs text-white/85">
                {language === 'ur'
                  ? '100% مفت اور لامحدود رسائی'
                  : 'Free Unlimited Global Access'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="min-w-[40px] min-h-[40px] -mr-2 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Menu Controls */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Persistent Dark Mode Toggle */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-[#13291F] border border-slate-200/70 dark:border-emerald-900/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                {darkMode ? (
                  <Moon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Sun className="w-4 h-4 text-[#15803D]" />
                )}
              </div>
              <div className="min-w-0">
                <div
                  className={`text-sm font-semibold text-slate-900 dark:text-slate-100 truncate ${
                    language === 'ur' ? 'font-urdu' : ''
                  }`}
                >
                  {language === 'ur' ? 'ڈارک موڈ (Dark Mode)' : 'Dark Mode'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {language === 'ur'
                    ? darkMode
                      ? 'نائٹ موڈ فعال ہے'
                      : 'رات کے آرام دہ استعمال کے لیے'
                    : darkMode
                    ? 'Night theme active'
                    : 'Comfortable night viewing'}
                </div>
              </div>
            </div>

            <div className="min-w-[44px] min-h-[44px] flex items-center justify-end shrink-0">
              <button
                type="button"
                role="switch"
                aria-label="Toggle Dark Mode"
                aria-checked={darkMode}
                onClick={onToggleDarkMode}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  darkMode ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    darkMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Language Switcher (English / اردو) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Languages className="w-4 h-4 text-[#15803D] dark:text-emerald-400" />
              <span>Language / زبان</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-[#13291F] rounded-xl">
              <button
                type="button"
                onClick={() => onChangeLanguage('en')}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  language === 'en'
                    ? 'bg-white dark:bg-[#0B5D32] text-[#0B5D32] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onChangeLanguage('ur')}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  language === 'ur'
                    ? 'bg-white dark:bg-[#0B5D32] text-[#0B5D32] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                اردو (Urdu)
              </button>
            </div>
          </div>

          {/* Quick Actions (Fast Speed Check + Updates + Battery Guide) */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSpeedTest();
              }}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/25 text-[#0B5D32] dark:text-emerald-300 flex items-center gap-2.5 text-sm font-semibold transition-colors cursor-pointer"
            >
              <Gauge className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur'
                  ? 'فاسٹ انٹرنیٹ سپیڈ چیک'
                  : 'Fast Internet Speed Check'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpdates();
              }}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#13291F] hover:bg-emerald-50 dark:hover:bg-emerald-500/15 text-slate-900 dark:text-slate-100 hover:text-[#0B5D32] dark:hover:text-emerald-300 flex items-center justify-between gap-2.5 text-sm font-semibold transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0" />
                <span className={language === 'ur' ? 'font-urdu' : ''}>
                  {language === 'ur'
                    ? 'اپڈیٹس چیک کریں (Updates)'
                    : 'Check for Updates'}
                </span>
              </span>
              <span className="text-xs font-mono-tabular text-[#15803D] dark:text-emerald-400">
                {import.meta.env.VITE_APP_BUILD_NUMBER
                  ? `v1.${import.meta.env.VITE_APP_BUILD_NUMBER}.0`
                  : 'Latest'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBattery();
              }}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-[#13291F] text-slate-800 dark:text-slate-200 flex items-center gap-2.5 text-sm font-medium transition-colors cursor-pointer"
            >
              <BatteryCharging className="w-4 h-4 text-[#F48A24] shrink-0" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur'
                  ? 'بیٹری آپٹیمائزیشن سیٹنگز'
                  : 'Battery Optimization Fix'}
              </span>
            </button>
          </div>

          {/* Recovery & Protection Toggles */}
          <div className="space-y-4 border-t border-slate-100 dark:border-emerald-900/40 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400" />
                  <span>
                    {language === 'ur'
                      ? 'آٹو ری کنیکٹ (Auto-Reconnect)'
                      : 'Auto-Reconnect'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {language === 'ur'
                    ? `آخری سرور: ${lastUsedServer.nameUr}`
                    : `Target: ${lastUsedServer.nameEn}`}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoReconnect}
                onClick={onToggleAutoReconnect}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
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

            {status === ConnectionStatus.Connected && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSimulateDrop();
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#13291F] hover:bg-slate-200 dark:hover:bg-emerald-900/40 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {language === 'ur'
                  ? 'کنیکشن ڈراپ ٹیسٹ کریں (Test Auto-Reconnect)'
                  : 'Test Connection Drop & Recovery'}
              </button>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Auto Kill-Switch
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Block leaks if tunnel drops
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={killSwitch}
                onClick={onToggleKillSwitch}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                  killSwitch
                    ? 'bg-[#15803D] dark:bg-emerald-500'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    killSwitch ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Protocol Selection */}
          <div className="space-y-2 border-t border-slate-100 dark:border-emerald-900/40 pt-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Sliders className="w-4 h-4 text-[#15803D] dark:text-emerald-400" />
              <span>
                {language === 'ur' ? 'وی پی این پروٹوکول' : 'Tunnel Protocol'}
              </span>
            </div>
            <div className="space-y-1">
              {protocols.map((p) => {
                const selected = protocol === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onSelectProtocol(p)}
                    className={`w-full min-h-[42px] px-3 py-2 rounded-lg flex items-center justify-between text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#15803D]/10 dark:bg-emerald-500/15 text-[#0B5D32] dark:text-emerald-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#13291F]'
                    }`}
                  >
                    <span>{p}</span>
                    {selected && (
                      <Check className="w-4 h-4 text-[#15803D] dark:text-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* App Split Tunneling */}
          <div className="space-y-2 border-t border-slate-100 dark:border-emerald-900/40 pt-5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {language === 'ur'
                ? 'ایپ پراکسی فلٹر (Split Tunneling)'
                : 'Smart App Proxy Filter'}
            </div>
            <div className="space-y-1.5">
              {splitApps.map((app) => (
                <label
                  key={app.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#13291F] cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {app.name}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                      {app.category}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={app.enabled}
                    onChange={() => onToggleSplitApp(app.id)}
                    className="w-4 h-4 accent-[#15803D] dark:accent-emerald-500 rounded cursor-pointer shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
