import React from 'react';
import { ConnectionStatus } from '../types/vpn';

interface ConnectRingButtonProps {
  status: ConnectionStatus;
  onToggle: () => void;
  connectLabel: string;
  disconnectLabel: string;
  cancelLabel: string;
  darkMode?: boolean;
}

export const ConnectRingButton: React.FC<ConnectRingButtonProps> = ({
  status,
  onToggle,
  connectLabel,
  disconnectLabel,
  cancelLabel,
  darkMode = false,
}) => {
  const isConnected = status === ConnectionStatus.Connected;
  const isReconnecting = status === ConnectionStatus.Reconnecting;
  const isTransitioning =
    status === ConnectionStatus.Connecting ||
    status === ConnectionStatus.Disconnecting ||
    isReconnecting;

  const buttonText = isTransitioning
    ? cancelLabel
    : isConnected
    ? disconnectLabel
    : connectLabel;

  const gradTop = isConnected
    ? darkMode
      ? '#4ADE80'
      : '#22C55E'
    : isReconnecting
    ? darkMode
      ? '#F59E0B'
      : '#FDBA74'
    : isTransitioning
    ? darkMode
      ? '#22C55E'
      : '#86EFAC'
    : darkMode
    ? '#236341'
    : '#86EFAC';

  const gradBottom = isConnected
    ? darkMode
      ? '#15803D'
      : '#0F6A32'
    : isReconnecting
    ? darkMode
      ? '#78350F'
      : '#EA580C'
    : isTransitioning
    ? darkMode
      ? '#0F3F24'
      : '#4ADE80'
    : darkMode
    ? '#0F2E1E'
    : '#34D399';

  const sweepStroke = isReconnecting
    ? '#F48A24'
    : darkMode
    ? '#6EE7B7'
    : '#15803D';

  return (
    <div className="relative flex items-center justify-center my-3 select-none">
      <button
        type="button"
        onClick={onToggle}
        aria-label={buttonText}
        className="group relative w-[208px] h-[208px] rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-[#16A34A]/40 active:translate-y-[3px] active:scale-[0.97] transition-transform duration-150 cursor-pointer"
      >
        <svg
          viewBox="0 0 220 220"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <linearGradient
              id="skpRingBevelGrad"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={gradTop} />
              <stop offset="100%" stopColor={gradBottom} />
            </linearGradient>
            <filter
              id="skpRingShadow"
              x="-12%"
              y="-12%"
              width="124%"
              height="128%"
            >
              <feDropShadow
                dx="0"
                dy="5"
                stdDeviation="4"
                floodColor={darkMode ? '#000000' : '#083A1E'}
                floodOpacity={darkMode ? '0.55' : '0.22'}
              />
            </filter>
          </defs>

          {/* Outer Bevel Rim */}
          <circle
            cx="110"
            cy="110"
            r="105"
            fill="none"
            stroke={darkMode ? '#214A36' : '#CBE2D4'}
            strokeWidth="2.5"
          />

          {/* 3D Sculpted Torus Ring */}
          <circle
            cx="110"
            cy="110"
            r="93"
            fill="none"
            stroke="url(#skpRingBevelGrad)"
            strokeWidth="21"
            filter="url(#skpRingShadow)"
            className="transition-colors duration-200"
          />

          {/* Top Specular Highlight Arc */}
          <circle
            cx="110"
            cy="110"
            r="101"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={darkMode ? '0.16' : '0.45'}
            strokeWidth="1.5"
          />

          {isTransitioning && (
            <g className="origin-center animate-spin-slow">
              <circle
                cx="110"
                cy="110"
                r="93"
                fill="none"
                stroke={sweepStroke}
                strokeWidth="21"
                strokeLinecap="round"
                strokeDasharray="190 420"
              />
            </g>
          )}
        </svg>

        <span className="orb-3d-core relative z-10 w-[154px] h-[154px] rounded-full bg-white dark:bg-[#132A1F] shadow-xs flex flex-col items-center justify-center px-3 transition-transform duration-150 group-hover:scale-[1.015]">
          <span
            className={`font-display-3d-emerald text-[19px] font-extrabold tracking-wider whitespace-nowrap ${
              isConnected
                ? 'text-[#15803D] dark:text-emerald-400'
                : isReconnecting
                ? 'text-[#D9720D] dark:text-amber-400'
                : isTransitioning
                ? 'text-[#15803D] dark:text-emerald-400'
                : 'text-[#166534] dark:text-emerald-300'
            }`}
          >
            {buttonText}
          </span>
        </span>
      </button>
    </div>
  );
};
