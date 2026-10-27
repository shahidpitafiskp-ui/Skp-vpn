import React from 'react';
import { Globe } from 'lucide-react';

interface FlagIconProps {
  countryCode: string;
  size?: 'sm' | 'md' | 'lg';
}

export const FlagIcon: React.FC<FlagIconProps> = ({ countryCode, size = 'md' }) => {
  const dimensions =
    size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';

  if (countryCode === 'AUTO') {
    return (
      <span
        className={`${dimensions} rounded-full border-2 border-white/90 bg-[#0E6337] flex items-center justify-center text-white shrink-0 shadow-xs`}
      >
        <Globe className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'} strokeWidth={1.9} />
      </span>
    );
  }

  const renderSvgFlag = () => {
    switch (countryCode) {
      case 'PK':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
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
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
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
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="36" height="36" fill="#012169" />
            <path d="M0,0 L36,36 M36,0 L0,36" stroke="#FFF" strokeWidth="6" />
            <path d="M0,0 L36,36 M36,0 L0,36" stroke="#C8102E" strokeWidth="3" />
            <path d="M18,0 V36 M0,18 H36" stroke="#FFF" strokeWidth="10" />
            <path d="M18,0 V36 M0,18 H36" stroke="#C8102E" strokeWidth="6" />
          </svg>
        );
      case 'DE':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="36" height="12" fill="#111" />
            <rect y="12" width="36" height="12" fill="#DD0000" />
            <rect y="24" width="36" height="12" fill="#FFCE00" />
          </svg>
        );
      case 'SG':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
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
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="36" height="12" fill="#AE1C28" />
            <rect y="12" width="36" height="12" fill="#FFF" />
            <rect y="24" width="36" height="12" fill="#21468B" />
          </svg>
        );
      case 'FR':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="12" height="36" fill="#002395" />
            <rect x="12" width="12" height="36" fill="#FFF" />
            <rect x="24" width="12" height="36" fill="#ED2939" />
          </svg>
        );
      case 'CA':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="9" height="36" fill="#FF0000" />
            <rect x="9" width="18" height="36" fill="#FFF" />
            <rect x="27" width="9" height="36" fill="#FF0000" />
            <path d="M18,9 L20,15 L24,14 L21,19 L23,22 L19,22 L19,27 L17,27 L17,22 L13,22 L15,19 L12,14 L16,15 Z" fill="#FF0000" />
          </svg>
        );
      case 'AE':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="36" height="12" fill="#00732F" />
            <rect y="12" width="36" height="12" fill="#FFF" />
            <rect y="24" width="36" height="12" fill="#111" />
            <rect width="10" height="36" fill="#FF0000" />
          </svg>
        );
      case 'JP':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="36" height="36" fill="#FFF" />
            <circle cx="18" cy="18" r="8" fill="#BC002D" />
          </svg>
        );
      case 'CH':
        return (
          <svg viewBox="0 0 36 36" className="w-full h-full object-cover">
            <rect width="36" height="36" fill="#D52B1E" />
            <rect x="15" y="8" width="6" height="20" fill="#FFF" />
            <rect x="8" y="15" width="20" height="6" fill="#FFF" />
          </svg>
        );
      default:
        return (
          <div className="w-full h-full bg-emerald-700 text-white text-xs font-bold flex items-center justify-center">
            {countryCode}
          </div>
        );
    }
  };

  return (
    <span
      className={`${dimensions} rounded-full overflow-hidden border-2 border-white/90 shadow-xs inline-flex items-center justify-center shrink-0 bg-slate-100`}
    >
      {renderSvgFlag()}
    </span>
  );
};
