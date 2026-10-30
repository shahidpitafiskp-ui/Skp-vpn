import React from 'react';
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
  protocol: VpnProtocol;
  splitApps: SplitTunnelApp[];
  killSwitch: boolean;
  autoReconnect: boolean;
  lastUsedServer: ServerLocation;
  status: ConnectionStatus;
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
  protocol,
  splitApps,
  killSwitch,
  autoReconnect,
  lastUsedServer,
  status,
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
  if (!isOpen) return null;

  const protocols = [
    VpnProtocol.Auto,
    VpnProtocol.WireGuard,
    VpnProtocol.IKEv2,
    VpnProtocol.OpenVPNTcp,
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <aside
        className="w-[86vw] max-w-[340px] h-full bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drawer Brand Header */}
        <div className="bg-[#0B5D32] px-5 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">SKP VPN</div>
              <div className="text-xs text-white/85">
                {language === 'ur' ? '100% مفت اور لامحدود رسائی' : 'Free Unlimited Global Access'}
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
          {/* Language Switcher (English / اردو) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Languages className="w-4 h-4 text-[#15803D]" />
              <span>Language / زبان</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => onChangeLanguage('en')}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-white text-[#0B5D32] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onChangeLanguage('ur')}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  language === 'ur'
                    ? 'bg-white text-[#0B5D32] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اردو (Urdu)
              </button>
            </div>
          </div>

          {/* Quick Actions (Fast Speed Check + Battery Guide) */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSpeedTest();
              }}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-[#0B5D32] flex items-center gap-2.5 text-sm font-semibold transition-colors cursor-pointer"
            >
              <Gauge className="w-4 h-4 text-[#15803D]" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur' ? 'فاسٹ انٹرنیٹ سپیڈ چیک' : 'Fast Internet Speed Check'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpdates();
              }}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-900 hover:text-[#0B5D32] flex items-center justify-between gap-2.5 text-sm font-semibold transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-[#15803D]" />
                <span className={language === 'ur' ? 'font-urdu' : ''}>
                  {language === 'ur'
                    ? 'اپڈیٹس چیک کریں (Updates)'
                    : 'Check for Updates'}
                </span>
              </span>
              <span className="text-xs font-mono-tabular text-[#15803D]">
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
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl hover:bg-slate-50 text-slate-800 flex items-center gap-2.5 text-sm font-medium transition-colors cursor-pointer"
            >
              <BatteryCharging className="w-4 h-4 text-[#F48A24]" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur'
                  ? 'بیٹری آپٹیمائزیشن سیٹنگز'
                  : 'Battery Optimization Fix'}
              </span>
            </button>
          </div>

          {/* Recovery & Protection Toggles */}
          <div className="space-y-4 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-[#15803D]" />
                  <span>
                    {language === 'ur' ? 'آٹو ری کنیکٹ (Auto-Reconnect)' : 'Auto-Reconnect'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
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

            {status === ConnectionStatus.Connected && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSimulateDrop();
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {language === 'ur'
                  ? 'کنیکشن ڈراپ ٹیسٹ کریں (Test Auto-Reconnect)'
                  : 'Test Connection Drop & Recovery'}
              </button>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Auto Kill-Switch
                </div>
                <div className="text-[11px] text-slate-500">
                  Block leaks if tunnel drops
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={killSwitch}
                onClick={onToggleKillSwitch}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                  killSwitch ? 'bg-[#15803D]' : 'bg-slate-300'
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
          <div className="space-y-2 border-t border-slate-100 pt-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Sliders className="w-4 h-4 text-[#15803D]" />
              <span>{language === 'ur' ? 'وی پی این پروٹوکول' : 'Tunnel Protocol'}</span>
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
                        ? 'bg-[#15803D]/10 text-[#0B5D32] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{p}</span>
                    {selected && <Check className="w-4 h-4 text-[#15803D]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* App Split Tunneling */}
          <div className="space-y-2 border-t border-slate-100 pt-5">
            <div className="text-xs font-semibold text-slate-500">
              {language === 'ur' ? 'ایپ پراکسی فلٹر (Split Tunneling)' : 'Smart App Proxy Filter'}
            </div>
            <div className="space-y-1.5">
              {splitApps.map((app) => (
                <label
                  key={app.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-medium text-slate-800 truncate">
                      {app.name}
                    </div>
                    <div className="text-[11px] text-slate-400">{app.category}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={app.enabled}
                    onChange={() => onToggleSplitApp(app.id)}
                    className="w-4 h-4 accent-[#15803D] rounded cursor-pointer shrink-0"
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
