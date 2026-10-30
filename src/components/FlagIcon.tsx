import React from 'react';
import { Globe } from 'lucide-react';

export interface FlagIconProps {
  countryCode: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const COUNTRY_CODE_ALIASES: Record<string, string> = {
  UK: 'GB',
  UAE: 'AE',
  USA: 'US',
  KSA: 'SA',
};

const COUNTRY_NAMES: Record<string, string> = {
  AUTO: 'Auto select optimal location',
  PK: 'Pakistan',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  JP: 'Japan',
  DE: 'Germany',
  CH: 'Switzerland',
  NL: 'Netherlands',
  GB: 'United Kingdom',
  FR: 'France',
  US: 'United States',
  CA: 'Canada',
  TR: 'Turkey',
  IN: 'India',
  SA: 'Saudi Arabia',
  AU: 'Australia',
};

export function normalizeCountryCode(rawCode?: string): string {
  if (!rawCode) return 'AUTO';
  const cleaned = rawCode.trim().toUpperCase();
  if (!cleaned) return 'AUTO';
  return COUNTRY_CODE_ALIASES[cleaned] || cleaned;
}

export const FlagIcon: React.FC<FlagIconProps> = ({
  countryCode,
  size = 'md',
  label,
}) => {
  const code = normalizeCountryCode(countryCode);
  const dimensions =
    size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-9 h-9';

  const accessibleLabel =
    label ||
    (COUNTRY_NAMES[code] ? `${COUNTRY_NAMES[code]} flag` : `${code} flag`);

  if (code === 'AUTO') {
    return (
      <span
        role="img"
        aria-label={accessibleLabel}
        title={COUNTRY_NAMES.AUTO}
        className={`${dimensions} rounded-full border-2 border-white/90 dark:border-emerald-800/80 ring-1 ring-slate-900/10 dark:ring-white/15 bg-[#0E6337] flex items-center justify-center text-white shrink-0 shadow-xs`}
      >
        <Globe
          className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'}
          strokeWidth={1.9}
        />
      </span>
    );
  }

  const renderSvgFlag = () => {
    switch (code) {
      case 'PK':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#01411C" />
            <rect width="9" height="36" fill="#FFFFFF" />
            <circle cx="22.5" cy="18" r="7.2" fill="#FFFFFF" />
            <circle cx="24.5" cy="16.3" r="6.4" fill="#01411C" />
            <polygon
              points="26.2,11.8 27.1,14.3 29.7,14.3 27.6,15.8 28.4,18.3 26.2,16.8 24.0,18.3 24.8,15.8 22.7,14.3 25.3,14.3"
              fill="#FFFFFF"
            />
          </svg>
        );
      case 'US':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#B22234" />
            <rect y="5" width="36" height="3.5" fill="#FFF" />
            <rect y="12" width="36" height="3.5" fill="#FFF" />
            <rect y="19" width="36" height="3.5" fill="#FFF" />
            <rect y="26" width="36" height="3.5" fill="#FFF" />
            <rect width="18" height="19" fill="#3C3B6E" />
            <circle cx="5" cy="5" r="1.2" fill="#FFF" />
            <circle cx="10" cy="5" r="1.2" fill="#FFF" />
            <circle cx="15" cy="5" r="1.2" fill="#FFF" />
            <circle cx="7.5" cy="9.5" r="1.2" fill="#FFF" />
            <circle cx="12.5" cy="9.5" r="1.2" fill="#FFF" />
            <circle cx="5" cy="14" r="1.2" fill="#FFF" />
            <circle cx="10" cy="14" r="1.2" fill="#FFF" />
            <circle cx="15" cy="14" r="1.2" fill="#FFF" />
          </svg>
        );
      case 'GB':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#012169" />
            <path d="M0,0 L36,36 M36,0 L0,36" stroke="#FFF" strokeWidth="6" />
            <path
              d="M0,0 L36,36 M36,0 L0,36"
              stroke="#C8102E"
              strokeWidth="3"
            />
            <path d="M18,0 V36 M0,18 H36" stroke="#FFF" strokeWidth="10" />
            <path d="M18,0 V36 M0,18 H36" stroke="#C8102E" strokeWidth="6" />
          </svg>
        );
      case 'DE':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="12" fill="#111" />
            <rect y="12" width="36" height="12" fill="#DD0000" />
            <rect y="24" width="36" height="12" fill="#FFCE00" />
          </svg>
        );
      case 'SG':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="18" fill="#EF3340" />
            <rect y="18" width="36" height="18" fill="#FFF" />
            <circle cx="11" cy="9" r="5" fill="#FFF" />
            <circle cx="13" cy="9" r="4.5" fill="#EF3340" />
            <circle cx="15" cy="7" r="1" fill="#FFF" />
            <circle cx="17" cy="9.5" r="1" fill="#FFF" />
            <circle cx="14" cy="11.5" r="1" fill="#FFF" />
          </svg>
        );
      case 'NL':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="12" fill="#AE1C28" />
            <rect y="12" width="36" height="12" fill="#FFF" />
            <rect y="24" width="36" height="12" fill="#21468B" />
          </svg>
        );
      case 'FR':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="12" height="36" fill="#002395" />
            <rect x="12" width="12" height="36" fill="#FFF" />
            <rect x="24" width="12" height="36" fill="#ED2939" />
          </svg>
        );
      case 'CA':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="9" height="36" fill="#FF0000" />
            <rect x="9" width="18" height="36" fill="#FFF" />
            <rect x="27" width="9" height="36" fill="#FF0000" />
            <path
              d="M18,9 L20,15 L24,14 L21,19 L23,22 L19,22 L19,27 L17,27 L17,22 L13,22 L15,19 L12,14 L16,15 Z"
              fill="#FF0000"
            />
          </svg>
        );
      case 'AE':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="12" fill="#00732F" />
            <rect y="12" width="36" height="12" fill="#FFF" />
            <rect y="24" width="36" height="12" fill="#111" />
            <rect width="10" height="36" fill="#FF0000" />
          </svg>
        );
      case 'JP':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#FFF" />
            <circle cx="18" cy="18" r="8" fill="#BC002D" />
          </svg>
        );
      case 'CH':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#D52B1E" />
            <rect x="15" y="8" width="6" height="20" fill="#FFF" />
            <rect x="8" y="15" width="20" height="6" fill="#FFF" />
          </svg>
        );
      case 'TR':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#E30A17" />
            <circle cx="15" cy="18" r="7" fill="#FFF" />
            <circle cx="16.8" cy="18" r="5.6" fill="#E30A17" />
            <polygon
              points="23.5,15.2 24.3,17.3 26.5,17.3 24.7,18.6 25.4,20.7 23.5,19.4 21.6,20.7 22.3,18.6 20.5,17.3 22.7,17.3"
              fill="#FFF"
            />
          </svg>
        );
      case 'IN':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="12" fill="#FF9933" />
            <rect y="12" width="36" height="12" fill="#FFF" />
            <rect y="24" width="36" height="12" fill="#138808" />
            <circle
              cx="18"
              cy="18"
              r="4"
              fill="none"
              stroke="#000080"
              strokeWidth="1.4"
            />
          </svg>
        );
      case 'SA':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#006C35" />
            <rect x="9" y="21" width="18" height="2.2" rx="1" fill="#FFF" />
            <rect x="11" y="14" width="14" height="3.2" rx="1.5" fill="#FFF" />
          </svg>
        );
      case 'AU':
        return (
          <svg
            viewBox="0 0 36 36"
            aria-hidden="true"
            className="w-full h-full object-cover"
          >
            <rect width="36" height="36" fill="#00008B" />
            <path d="M0,0 L18,18 M18,0 L0,18" stroke="#FFF" strokeWidth="3" />
            <path d="M9,0 V18 M0,9 H18" stroke="#FFF" strokeWidth="4.5" />
            <path d="M9,0 V18 M0,9 H18" stroke="#C8102E" strokeWidth="2.5" />
            <circle cx="9" cy="27" r="2.2" fill="#FFF" />
            <circle cx="27" cy="10" r="1.4" fill="#FFF" />
            <circle cx="24" cy="18" r="1.4" fill="#FFF" />
            <circle cx="29" cy="20" r="1.4" fill="#FFF" />
            <circle cx="27" cy="27" r="1.6" fill="#FFF" />
          </svg>
        );
      default:
        return (
          <div className="w-full h-full bg-[#0E6337] text-white text-[11px] font-bold font-mono-tabular flex items-center justify-center">
            {code.slice(0, 2)}
          </div>
        );
    }
  };

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      title={COUNTRY_NAMES[code] || code}
      className={`${dimensions} rounded-full overflow-hidden border-2 border-white dark:border-slate-800/90 ring-1 ring-slate-900/12 dark:ring-white/20 shadow-xs inline-flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800`}
    >
      {renderSvgFlag()}
    </span>
  );
};
