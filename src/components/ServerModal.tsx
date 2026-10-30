import React, { useState } from 'react';
import { X, Check, Search } from 'lucide-react';
import { Language, ServerLocation } from '../types/vpn';
import { FlagIcon, normalizeCountryCode } from './FlagIcon';

const NAME_TO_COUNTRY_CODE: Array<[RegExp, string]> = [
  [/pakistan|karachi|islamabad|lahore/i, 'PK'],
  [/emirates|uae|dubai|abu dhabi/i, 'AE'],
  [/singapore|jurong/i, 'SG'],
  [/japan|tokyo|osaka/i, 'JP'],
  [/germany|frankfurt|berlin|munich/i, 'DE'],
  [/switzerland|zurich|geneva/i, 'CH'],
  [/netherlands|amsterdam/i, 'NL'],
  [/united kingdom|britain|london|manchester/i, 'GB'],
  [/france|paris|marseille/i, 'FR'],
  [/united states|usa|new york|los angeles|chicago|miami/i, 'US'],
  [/canada|toronto|vancouver|montreal/i, 'CA'],
  [/turkey|istanbul/i, 'TR'],
  [/india|mumbai|delhi/i, 'IN'],
  [/saudi|riyadh|jeddah/i, 'SA'],
  [/australia|sydney|melbourne/i, 'AU'],
];

function resolveServerCountryCode(server: ServerLocation): string {
  if (server.id === 'auto') {
    return 'AUTO';
  }
  const normalized = normalizeCountryCode(server.countryCode);
  if (normalized && normalized !== 'AUTO' && normalized.length === 2) {
    return normalized;
  }
  const idPrefix = server.id.split('-')[0]?.toUpperCase();
  if (idPrefix && idPrefix.length === 2) {
    return normalizeCountryCode(idPrefix);
  }
  const haystack = `${server.nameEn} ${server.cityEn}`;
  for (const [pattern, iso] of NAME_TO_COUNTRY_CODE) {
    if (pattern.test(haystack)) {
      return iso;
    }
  }
  return normalized || 'AUTO';
}

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
      const q = query.trim().toLowerCase();
      const resolvedCode = resolveServerCountryCode(srv).toLowerCase();
      return (
        srv.nameEn.toLowerCase().includes(q) ||
        srv.cityEn.toLowerCase().includes(q) ||
        srv.nameUr.includes(q) ||
        srv.cityUr.includes(q) ||
        resolvedCode.includes(q)
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
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              language === 'ur'
                ? 'ملک، شہر یا کوڈ تلاش کریں...'
                : 'Search country, city, or code...'
            }
            className="w-full h-11 ps-10 pe-4 rounded-xl bg-slate-100/90 dark:bg-[#13291F] border border-slate-200/80 dark:border-emerald-900/50 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#15803D]/30 dark:focus:ring-emerald-500/30 focus:bg-white dark:focus:bg-[#163024] transition-colors"
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
                className={`flex-1 min-h-[40px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
      <div className="divide-y divide-slate-100 dark:divide-emerald-950/60 overflow-y-auto pe-0.5 space-y-0.5">
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

            const serverIsoCode = resolveServerCountryCode(srv);
            const resolvedAutoIsoCode = resolvedAutoServer
              ? resolveServerCountryCode(resolvedAutoServer)
              : null;

            // Automatically display each server's country flag (and when Auto Select is actively connected,
            // reflect the active connected country's flag directly on the Auto row as well)
            const displayedFlagCode =
              srv.id === 'auto' && resolvedAutoIsoCode
                ? resolvedAutoIsoCode
                : serverIsoCode;

            const displayedFlagLabel =
              srv.id === 'auto' && resolvedAutoServer
                ? `${resolvedAutoServer.nameEn} flag`
                : `${srv.nameEn} flag`;

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
                className={`w-full min-h-[62px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-start transition-colors cursor-pointer ${
                  isSelected || isAutoConnectedTarget
                    ? 'bg-[#15803D]/10 dark:bg-emerald-500/15 text-[#0B5D32] dark:text-emerald-300'
                    : 'hover:bg-slate-50 dark:hover:bg-[#13291F] text-slate-800 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <FlagIcon
                    countryCode={displayedFlagCode}
                    size="md"
                    label={displayedFlagLabel}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-sm font-semibold truncate ${
                          language === 'ur' ? 'font-urdu' : ''
                        }`}
                      >
                        {language === 'ur' ? srv.nameUr : srv.nameEn}
                      </span>
                      {serverIsoCode !== 'AUTO' && (
                        <>
                          <span
                            aria-hidden="true"
                            className="text-xs text-slate-300 dark:text-slate-600 shrink-0"
                          >
                            ·
                          </span>
                          <span className="text-[11px] font-mono-tabular font-medium text-slate-400 dark:text-slate-500 shrink-0">
                            {serverIsoCode}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                      <span
                        className={
                          srv.id === 'auto' && resolvedAutoServer
                            ? 'text-[#15803D] dark:text-emerald-400 font-medium truncate'
                            : 'truncate'
                        }
                      >
                        {subtitleText}
                      </span>
                      <span aria-hidden="true" className="shrink-0">
                        ·
                      </span>
                      <span className="font-mono-tabular shrink-0">
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
        className="card-3d w-full sm:max-w-md max-h-[85vh] bg-white dark:bg-[#0D1E16] text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl shadow-xl border border-transparent dark:border-emerald-900/40 flex flex-col overflow-hidden transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-2.5 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-emerald-900/40">
          <h2 className="font-display-3d-surface text-base font-bold text-slate-900 dark:text-slate-100">
            {listProps.language === 'ur'
              ? 'سرور لوکیشن منتخب کریں'
              : 'Select Server Location'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close server selector"
            className="min-w-[44px] min-h-[44px] -me-2 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13291F] transition-colors cursor-pointer"
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
