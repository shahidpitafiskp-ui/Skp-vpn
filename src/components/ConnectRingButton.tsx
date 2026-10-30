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

  const ringBaseStroke = isConnected
    ? darkMode
      ? '#22C55E'
      : '#16A34A'
    : isReconnecting
    ? darkMode
      ? '#7C4A15'
      : '#FAD7B0'
    : isTransitioning
    ? darkMode
      ? '#14532D'
      : '#BBF7D0'
    : darkMode
    ? '#1B4D32'
    : '#86EFAC';

  const sweepStroke = isReconnecting
    ? '#F48A24'
    : darkMode
    ? '#34D399'
    : '#15803D';

  return (
    <div className="relative flex items-center justify-center my-2 select-none">
      <button
        type="button"
        onClick={onToggle}
        aria-label={buttonText}
        className="group relative w-[204px] h-[204px] rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-[#16A34A]/40 active:scale-[0.97] transition-transform duration-150 cursor-pointer"
      >
        <svg
          viewBox="0 0 220 220"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <circle
            cx="110"
            cy="110"
            r="105"
            fill="none"
            stroke={darkMode ? '#1A3829' : '#D6E6DC'}
            strokeWidth="2.5"
          />

          <circle
            cx="110"
            cy="110"
            r="93"
            fill="none"
            stroke={ringBaseStroke}
            strokeWidth="21"
            className="transition-colors duration-200"
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

        <span className="relative z-10 w-[156px] h-[156px] rounded-full bg-white dark:bg-[#132A1F] shadow-xs flex flex-col items-center justify-center px-3 transition-all duration-150 group-hover:scale-[1.01]">
          <span
            className={`text-[18px] font-semibold tracking-wide whitespace-nowrap ${
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
