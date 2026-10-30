import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Gauge,
  ArrowDown,
  ArrowUp,
  Activity,
  RotateCw,
  Maximize2,
} from 'lucide-react';
import { Language, ServerLocation, SpeedTestMetrics } from '../types/vpn';

async function measureRealNetworkRtt(): Promise<{
  rttMs: number;
  jitterMs: number;
}> {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      await fetch(`${window.location.origin}/?ping=${Date.now()}-${i}`, {
        method: 'HEAD',
        cache: 'no-store',
      });
      const elapsed = Math.max(4, Math.round(performance.now() - start));
      samples.push(elapsed);
    } catch {
      samples.push(32);
    }
  }
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const diffs = samples
    .slice(1)
    .map((val, idx) => Math.abs(val - samples[idx]));
  const jitter =
    diffs.length > 0
      ? Math.max(1, Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length))
      : 2;
  return { rttMs: avg, jitterMs: jitter };
}

interface UseFastSpeedCheckResult {
  running: boolean;
  phase: 'idle' | 'ping' | 'download' | 'upload' | 'done';
  progress: number;
  liveDown: number;
  liveUp: number;
  unloadedPing: number;
  loadedPing: number;
  jitter: number;
  startCheck: () => void;
}

function useFastSpeedCheck(
  server: ServerLocation,
  onComplete: (metrics: SpeedTestMetrics) => void
): UseFastSpeedCheckResult {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<
    'idle' | 'ping' | 'download' | 'upload' | 'done'
  >('idle');
  const [progress, setProgress] = useState(0);
  const [liveDown, setLiveDown] = useState(0);
  const [liveUp, setLiveUp] = useState(0);
  const [unloadedPing, setUnloadedPing] = useState(server.basePingMs);
  const [loadedPing, setLoadedPing] = useState(server.basePingMs + 14);
  const [jitter, setJitter] = useState(3);

  const intervalRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const startCheck = useCallback(async () => {
    clearTimer();
    setRunning(true);
    setPhase('ping');
    setProgress(5);
    setLiveDown(0);
    setLiveUp(0);

    const { rttMs, jitterMs } = await measureRealNetworkRtt();
    const effectivePing = Math.min(
      180,
      Math.round((rttMs + server.basePingMs) / 2)
    );
    const effectiveLoadedPing = effectivePing + 11 + (server.loadPercent % 9);

    setUnloadedPing(effectivePing);
    setLoadedPing(effectiveLoadedPing);
    setJitter(jitterMs);
    setPhase('download');

    const loadFactor = (100 - server.loadPercent) / 100;
    const targetDown = Number(
      (62 + loadFactor * 58 + (effectivePing < 40 ? 18 : 4)).toFixed(1)
    );
    const targetUp = Number((targetDown * 0.44).toFixed(1));

    let currentStep = 10;
    intervalRef.current = window.setInterval(() => {
      currentStep += 4;
      setProgress(Math.min(100, currentStep));

      if (currentStep <= 62) {
        setPhase('download');
        const ratio = (currentStep - 10) / 52;
        const eased = 1 - Math.pow(1 - ratio, 2.2);
        const jitterDelta = Math.random() * 5.2 - 2.6;
        setLiveDown(
          Math.max(1.2, Number((targetDown * eased + jitterDelta).toFixed(1)))
        );
      } else if (currentStep < 100) {
        setPhase('upload');
        setLiveDown(targetDown);
        const ratio = (currentStep - 62) / 38;
        const eased = 1 - Math.pow(1 - ratio, 2);
        const jitterDelta = Math.random() * 2.6 - 1.3;
        setLiveUp(
          Math.max(0.8, Number((targetUp * eased + jitterDelta).toFixed(1)))
        );
      } else {
        clearTimer();
        setRunning(false);
        setPhase('done');
        setLiveDown(targetDown);
        setLiveUp(targetUp);

        onComplete({
          pingMs: effectivePing,
          loadedPingMs: effectiveLoadedPing,
          downloadMbps: targetDown,
          uploadMbps: targetUp,
          jitterMs,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      }
    }, 80);
  }, [server, onComplete]);

  return {
    running,
    phase,
    progress,
    liveDown,
    liveUp,
    unloadedPing,
    loadedPing,
    jitter,
    startCheck,
  };
}

interface FastSpeedCheckCardProps {
  server: ServerLocation;
  language: Language;
  lastMetrics: SpeedTestMetrics | null;
  onComplete: (metrics: SpeedTestMetrics) => void;
  onOpenFullModal: () => void;
}

export const FastSpeedCheckCard: React.FC<FastSpeedCheckCardProps> = ({
  server,
  language,
  lastMetrics,
  onComplete,
  onOpenFullModal,
}) => {
  const {
    running,
    phase,
    progress,
    liveDown,
    liveUp,
    unloadedPing,
    startCheck,
  } = useFastSpeedCheck(server, onComplete);

  const displayedDown =
    phase === 'idle' && lastMetrics ? lastMetrics.downloadMbps : liveDown;
  const displayedUp =
    phase === 'idle' && lastMetrics ? lastMetrics.uploadMbps : liveUp;
  const displayedPing =
    phase === 'idle' && lastMetrics ? lastMetrics.pingMs : unloadedPing;

  return (
    <div className="bg-white dark:bg-[#0F2018] rounded-xl shadow-xs border border-slate-200/70 dark:border-emerald-900/40 p-4 space-y-3.5 transition-colors duration-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0" />
          <span
            className={`text-sm font-bold text-slate-900 dark:text-slate-100 truncate ${
              language === 'ur' ? 'font-urdu' : ''
            }`}
          >
            {language === 'ur'
              ? 'فاسٹ انٹرنیٹ سپیڈ چیک'
              : 'Fast Internet Speed Check'}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenFullModal}
          aria-label="Open full speed check screen"
          className="min-w-[36px] min-h-[36px] px-2 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#152D21] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>{language === 'ur' ? 'تفصیل' : 'Details'}</span>
        </button>
      </div>

      {/* Main Fast.com-style Big Readout + Start Button */}
      <div className="flex items-center justify-between gap-4 py-1">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold font-mono-tabular tracking-tight text-slate-900 dark:text-white">
              {displayedDown > 0 ? displayedDown.toFixed(1) : '0.0'}
            </span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Mbps
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            <span>
              ↑ {displayedUp > 0 ? displayedUp.toFixed(1) : '--'} Mbps
            </span>
            <span aria-hidden="true">·</span>
            <span>{displayedPing} ms ping</span>
          </div>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={startCheck}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#15803D] disabled:opacity-60 hover:bg-[#116932] active:scale-[0.98] text-white text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCw
            className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`}
          />
          <span className={language === 'ur' ? 'font-urdu' : ''}>
            {running
              ? `${progress}%`
              : language === 'ur'
              ? 'سپیڈ چیک کریں'
              : 'Check Speed'}
          </span>
        </button>
      </div>

      {/* Progress Bar when active */}
      {running && (
        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-[#15803D] dark:bg-emerald-500 rounded-full transition-transform duration-100 origin-left"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
      )}
    </div>
  );
};

interface SpeedTestModalProps {
  isOpen: boolean;
  server: ServerLocation;
  language: Language;
  onComplete: (metrics: SpeedTestMetrics) => void;
  onClose: () => void;
}

export const SpeedTestModal: React.FC<SpeedTestModalProps> = ({
  isOpen,
  server,
  language,
  onComplete,
  onClose,
}) => {
  const {
    running,
    phase,
    progress,
    liveDown,
    liveUp,
    unloadedPing,
    loadedPing,
    jitter,
    startCheck,
  } = useFastSpeedCheck(server, onComplete);

  useEffect(() => {
    if (isOpen) {
      startCheck();
    }
  }, [isOpen, server.id, startCheck]);

  if (!isOpen) return null;

  const gaugeRatio = Math.min(1, Math.max(0, liveDown / 150));
  const arcCircumference = 251.2;
  const strokeDashoffset = arcCircumference * (1 - gaugeRatio);

  const qualitySummary =
    liveDown >= 50
      ? language === 'ur'
        ? '4K اسٹریمنگ اور آن لائن گیمنگ کے لیے بہترین'
        : '4K Ultra HD Streaming · Low-Latency Gaming Ready'
      : liveDown >= 20
      ? language === 'ur'
        ? 'HD ویڈیو اور کالز کے لیے موزوں'
        : '1080p HD Video · Smooth Voice & Video Calls'
      : language === 'ur'
      ? 'عام براؤزنگ کے لیے موزوں'
      : 'Standard Web Browsing Ready';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-[#0D1E16] text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl shadow-xl border border-transparent dark:border-emerald-900/40 overflow-hidden transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-emerald-900/40">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-5 h-5 text-[#15803D] dark:text-emerald-400" />
            <h2
              className={`text-base font-bold text-slate-900 dark:text-slate-100 ${
                language === 'ur' ? 'font-urdu' : ''
              }`}
            >
              {language === 'ur'
                ? 'فاسٹ انٹرنیٹ سپیڈ چیک'
                : 'Fast Internet Speed Check'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close speed check"
            className="min-w-[40px] min-h-[40px] -mr-2 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#13291F] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Active Node Info */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {language === 'ur' ? server.nameUr : server.nameEn} ·{' '}
              {language === 'ur' ? server.cityUr : server.cityEn}
            </span>
            <span className="font-mono-tabular">{server.virtualIp}</span>
          </div>

          {/* Fast.com-Style Speedometer Gauge + Giant Mbps Readout */}
          <div className="flex flex-col items-center pt-2 pb-1">
            <div className="relative w-52 h-28 flex items-end justify-center">
              <svg
                viewBox="0 0 200 110"
                className="w-full h-full overflow-visible"
              >
                <path
                  d="M 20 95 A 80 80 0 0 1 180 95"
                  fill="none"
                  strokeWidth="14"
                  strokeLinecap="round"
                  className="stroke-[#E2E8F0] dark:stroke-[#173325]"
                />
                <path
                  d="M 20 95 A 80 80 0 0 1 180 95"
                  fill="none"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={arcCircumference}
                  strokeDashoffset={strokeDashoffset}
                  className="stroke-[#15803D] dark:stroke-emerald-400 transition-all duration-150"
                />
              </svg>
              <div className="absolute bottom-0 flex flex-col items-center">
                <span className="text-4xl font-bold font-mono-tabular tracking-tight text-slate-900 dark:text-white">
                  {liveDown.toFixed(1)}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Mbps Download
                </span>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center">
              {running ? (
                <span>
                  {phase === 'ping'
                    ? 'Measuring network latency...'
                    : phase === 'download'
                    ? `Testing download stream (${progress}%)...`
                    : `Testing upload stream (${progress}%)...`}
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  {qualitySummary}
                </span>
              )}
            </div>
          </div>

          {/* Detailed Metrics Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#13291F] border border-slate-100 dark:border-emerald-900/40">
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <Activity className="w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400" />
                <span>Latency</span>
              </div>
              <div className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-white">
                {unloadedPing}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                  ms
                </span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono-tabular mt-0.5">
                Loaded {loadedPing} ms
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#13291F] border border-slate-100 dark:border-emerald-900/40">
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <ArrowUp className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>Upload</span>
              </div>
              <div className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-white">
                {liveUp.toFixed(1)}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                  Mbps
                </span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono-tabular mt-0.5">
                Jitter {jitter} ms
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#13291F] border border-slate-100 dark:border-emerald-900/40">
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Peak</span>
              </div>
              <div className="text-lg font-bold font-mono-tabular text-slate-900 dark:text-white">
                {(liveDown * 1.06).toFixed(1)}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                  Mbps
                </span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono-tabular mt-0.5">
                {(liveDown / 8).toFixed(1)} MB/s
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={running}
            onClick={startCheck}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#15803D] disabled:opacity-50 hover:bg-[#116932] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCw
              className={`w-4 h-4 ${running ? 'animate-spin' : ''}`}
            />
            <span className={language === 'ur' ? 'font-urdu' : ''}>
              {running
                ? language === 'ur'
                  ? 'سپیڈ چیک جاری ہے...'
                  : 'Checking Internet Speed...'
                : language === 'ur'
                ? 'دوبارہ سپیڈ چیک کریں'
                : 'Check Speed Again'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
