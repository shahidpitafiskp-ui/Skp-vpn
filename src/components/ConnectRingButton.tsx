import React from 'react';
import { ConnectionStatus } from '../types/vpn';

interface ConnectRingButtonProps {
  status: ConnectionStatus;
  onToggle: () => void;
  connectLabel: string;
  disconnectLabel: string;
  cancelLabel: string;
}

export const ConnectRingButton: React.FC<ConnectRingButtonProps> = ({
  status,
  onToggle,
  connectLabel,
  disconnectLabel,
  cancelLabel,
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
    ? '#16A34A'
    : isReconnecting
    ? '#FAD7B0'
    : isTransitioning
    ? '#BBF7D0'
    : '#86EFAC';

  const sweepStroke = isReconnecting ? '#F48A24' : '#15803D';

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
            stroke="#D6E6DC"
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

        <span className="relative z-10 w-[156px] h-[156px] rounded-full bg-white shadow-xs flex flex-col items-center justify-center px-3 transition-transform duration-150 group-hover:scale-[1.01]">
          <span
            className={`text-[18px] font-semibold tracking-wide whitespace-nowrap ${
              isConnected
                ? 'text-[#15803D]'
                : isReconnecting
                ? 'text-[#D9720D]'
                : isTransitioning
                ? 'text-[#15803D]'
                : 'text-[#166534]'
            }`}
          >
            {buttonText}
          </span>
        </span>
      </button>
    </div>
  );
};
