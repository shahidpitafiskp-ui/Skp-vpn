import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Language } from '../types/vpn';
import { isNativeAndroidVpn, syncNativeBannerAd } from '../utils/nativeVpn';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export interface FooterBannerAdProps {
  adUnitId: string;
  language: Language;
  overlayOpen?: boolean;
  nativeAdLoaded?: boolean;
}

function parseAdMobUnit(adUnitId: string): {
  adClient: string;
  adSlot: string;
} {
  const trimmed = adUnitId.trim();
  const match = trimmed.match(/ca-app-pub-(\d+)\/(\d+)/i);
  if (match) {
    return {
      adClient: `ca-pub-${match[1]}`,
      adSlot: match[2],
    };
  }
  return {
    adClient: 'ca-pub-9297540107285222',
    adSlot: '7061748625',
  };
}

export const FooterBannerAd: React.FC<FooterBannerAdProps> = ({
  adUnitId,
  language,
  overlayOpen = false,
  nativeAdLoaded = false,
}) => {
  const nativeAndroid = isNativeAndroidVpn();
  const { adClient, adSlot } = useMemo(
    () => parseAdMobUnit(adUnitId),
    [adUnitId]
  );

  const pushedSlotRef = useRef<boolean>(false);
  const [webAdReady, setWebAdReady] = useState<boolean>(false);

  // Native Android: lazily mount & toggle real AdMob bottom AdView after initial UI render completes
  useEffect(() => {
    if (!nativeAndroid) return;
    syncNativeBannerAd(adUnitId, !overlayOpen);
  }, [nativeAndroid, adUnitId, overlayOpen]);

  useEffect(() => {
    if (!nativeAndroid) return;
    return () => {
      syncNativeBannerAd(adUnitId, false);
    };
  }, [nativeAndroid, adUnitId]);

  // Web Preview / PWA: lazily load external Google Ad script during idle time after mount
  useEffect(() => {
    if (nativeAndroid || typeof window === 'undefined') return;

    let cancelled = false;
    const loadAdScriptWhenIdle = () => {
      if (cancelled) return;

      const scriptSelector = `script[data-skp-ad-client="${adClient}"]`;
      let scriptEl = document.querySelector(
        scriptSelector
      ) as HTMLScriptElement | null;

      const pushAdRequest = () => {
        if (cancelled || pushedSlotRef.current) return;
        try {
          window.adsbygoogle = window.adsbygoogle || [];
          window.adsbygoogle.push({});
          pushedSlotRef.current = true;
          setWebAdReady(true);
        } catch {
          setWebAdReady(false);
        }
      };

      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.async = true;
        scriptEl.crossOrigin = 'anonymous';
        scriptEl.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`;
        scriptEl.setAttribute('data-skp-ad-client', adClient);
        scriptEl.onload = pushAdRequest;
        scriptEl.onerror = () => {
          if (!cancelled) {
            setWebAdReady(false);
          }
        };
        document.head.appendChild(scriptEl);
      } else {
        pushAdRequest();
      }
    };

    const winWithIdle = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof winWithIdle.requestIdleCallback === 'function') {
      const idleId = winWithIdle.requestIdleCallback(loadAdScriptWhenIdle, {
        timeout: 1200,
      });
      return () => {
        cancelled = true;
        winWithIdle.cancelIdleCallback?.(idleId);
      };
    }

    const timerId = window.setTimeout(loadAdScriptWhenIdle, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [nativeAndroid, adClient]);

  // Reserve clean bottom dock clearance when native Android AdMob AdView is active
  if (nativeAndroid) {
    return (
      <div
        aria-label="Sponsored banner area"
        className="w-full max-w-[420px] lg:max-w-[1140px] mx-auto min-h-[58px] flex items-center justify-center"
      >
        {!nativeAdLoaded && (
          <div className="w-full rounded-xl bg-white/90 dark:bg-[#0F2018]/90 border border-white/20 dark:border-emerald-900/40 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className={language === 'ur' ? 'font-urdu' : ''}>
              {language === 'ur' ? 'سپانسرڈ اشتہار' : 'Sponsored Banner'}
            </span>
            <span className="font-mono-tabular text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {adUnitId}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      aria-label="Sponsored advertisement"
      className="w-full max-w-[420px] lg:max-w-[1140px] mx-auto"
    >
      <div className="card-3d relative w-full min-h-[60px] rounded-xl bg-white dark:bg-[#0F2018] border border-transparent dark:border-emerald-900/40 px-3 py-2 flex flex-col items-center justify-center overflow-hidden transition-colors duration-200">
        <div className="w-full flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">
          <span>
            {language === 'ur' ? 'اشتہار · Sponsored' : 'Sponsored Ad'}
          </span>
          <span className="font-mono-tabular truncate max-w-[220px]">
            AdMob · {adSlot}
          </span>
        </div>

        <ins
          className="adsbygoogle block w-full min-h-[50px] max-h-[90px] text-center"
          data-ad-client={adClient}
          data-ad-slot={adSlot}
          data-ad-format="horizontal"
          data-full-width-responsive="true"
        />

        {!webAdReady && (
          <div className="pointer-events-none py-1 text-center text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-[#15803D] dark:text-emerald-400">
              SKP VPN Free Global Access
            </span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono-tabular text-[11px]">{adUnitId}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FooterBannerAd;
