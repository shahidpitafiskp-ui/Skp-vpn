import React, { useState } from 'react';
import { X, Check, Search } from 'lucide-react';
import { Language, ServerLocation } from '../types/vpn';
import { FlagIcon } from './FlagIcon';

interface ServerListContentProps {
  servers: ServerLocation[];
  selectedServerId: string;
  activeConnectedServerId?: string | null;
  language: Language;
  onSelectServer: (server: ServerLocation) => void;
}

export const ServerListContent: React.FC<ServerListContentProps> = ({
  servers,
  selectedServerId,
  activeConnectedServerId = null,
  language,
  onSelectServer,
}) => {
  const [filter, setFilter] = useState<
    'all' | 'fastest' | 'asia_me' | 'europe_us'
  >('all');
  const [query, setQuery] = useState('');

  const filtered = servers.filter((srv) => {
    if (filter === 'fastest' && srv.basePingMs > 48 && srv.id !== 'auto')
      return false;
    if (filter === 'asia_me' && srv.region !== 'asia_me' && srv.id !== 'auto')
      return false;
    if (
      filter === 'europe_us' &&
      srv.region !== 'europe' &&
      srv.region !== 'americas' &&
      srv.id !== 'auto'
    ) {
      return false;
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      return (
        srv.nameEn.toLowerCase().includes(q) ||
        srv.cityEn.toLowerCase().includes(q) ||
        srv.nameUr.includes(q)
      );
    }
    return true;
  });

  const tabs: Array<{
    key: 'all' | 'fastest' | 'asia_me' | 'europe_us';
    label: string;
  }> = [
    { key: 'all', label: language === 'ur' ? 'تمام' : 'All' },
    { key: 'fastest', label: language === 'ur' ? 'تیز ترین' : 'Fastest' },
    {
      key: 'asia_me',
      label: language === 'ur' ? 'پاکستان / ایشیا' : 'PK & Asia',
    },
    {
      key: 'europe_us',
      label: language === 'ur' ? 'یورپ / امریکہ' : 'EU & US',
    },
  ];

  const resolvedAutoServer =
    selectedServerId === 'auto' &&
    activeConnectedServerId &&
    activeConnectedServerId !== 'auto'
      ? servers.find((s) => s.id === activeConnectedServerId) ?? null
      : null;

  return (
    <div className="flex flex-col h-full">
      {/* Search + Region/Speed Filter */}
      <div className="space-y-3 mb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              language === 'ur'
                ? 'ملک یا شہر تلاش کریں...'
                : 'Search country or city...'
            }
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-100/90 dark:bg-[#13291F] border border-slate-200/80 dark:border-emerald-900/50 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#15803D]/30 dark:focus:ring-emerald-500/30 focus:bg-white dark:focus:bg-[#163024] transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#13291F] rounded-xl overflow-x-auto">
          {tabs.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`flex-1 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#0B5D32] text-[#15803D] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Server List */}
      <div className="divide-y divide-slate-100 dark:divide-emerald-950/60 overflow-y-auto pr-0.5 space-y-0.5">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {language === 'ur'
              ? 'کوئی سرور نہیں ملا'
              : 'No matching server locations found.'}
          </div>
        ) : (
          filtered.map((srv) => {
            const isSelected = srv.id === selectedServerId;
            const isAutoConnectedTarget =
              selectedServerId === 'auto' &&
              activeConnectedServerId === srv.id &&
              srv.id !== 'auto';

            const pingColor =
              srv.basePingMs < 45
                ? 'text-emerald-600 dark:text-emerald-400'
                : srv.basePingMs < 70
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-600 dark:text-slate-400';

            const subtitleText =
              srv.id === 'auto' && resolvedAutoServer
                ? language === 'ur'
                  ? `کنیکٹڈ: ${resolvedAutoServer.nameUr}`
                  : `Connected to ${resolvedAutoServer.nameEn}`
                : language === 'ur'
                ? srv.cityUr
                : srv.cityEn;

            return (
              <button
                key={srv.id}
                type="button"
                onClick={() => onSelectServer(srv)}
                className={`w-full min-h-[60px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                  isSelected || isAutoConnectedTarget
                    ? 'bg-[#15803D]/10 dark:bg-emerald-500/15 text-[#0B5D32] dark:text-emerald-300'
                    : 'hover:bg-slate-50 dark:hover:bg-[#13291F] text-slate-800 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FlagIcon countryCode={srv.countryCode} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold truncate ${
                          language === 'ur' ? 'font-urdu' : ''
                        }`}
                      >
                        {language === 'ur' ? srv.nameUr : srv.nameEn}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                      <span
                        className={
                          srv.id === 'auto' && resolvedAutoServer
                            ? 'text-[#15803D] dark:text-emerald-400 font-medium'
                            : ''
                        }
                      >
                        {subtitleText}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {isAutoConnectedTarget
                          ? language === 'ur'
                            ? 'آٹو منتخب'
                            : 'Auto Active'
                          : `${srv.loadPercent}% load`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-mono-tabular font-semibold ${pingColor}`}
                  >
                    {srv.basePingMs} ms
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      isSelected || isAutoConnectedTarget
                        ? 'bg-[#15803D] dark:bg-emerald-500 border-[#15803D] dark:border-emerald-500 text-white'
                        : 'border-slate-300 dark:border-slate-600 text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

interface ServerModalProps extends ServerListContentProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerModal: React.FC<ServerModalProps> = ({
  isOpen,
  onClose,
  ...listProps
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[85vh] bg-white dark:bg-[#0D1E16] text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl shadow-xl border border-transparent dark:border-emerald-900/40 flex flex-col overflow-hidden transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-2.5 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-emerald-900/40">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {listProps.language === 'ur'
              ? 'سرور لوکیشن منتخب کریں'
              : 'Select Server Location'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close server selector"
            className="min-w-[40px] min-h-[40px] -mr-2 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13291F] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <ServerListContent
            {...listProps}
            onSelectServer={(srv) => {
              listProps.onSelectServer(srv);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};
