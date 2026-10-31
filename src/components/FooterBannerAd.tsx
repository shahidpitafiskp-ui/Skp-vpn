import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Language } from '../types/vpn';
import {
  hasNativeBannerAdSupport,
  syncNativeBannerAdSlot,
} from '../utils/nativeVpn';

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
  nativeAdHeightDp?: number;
  nativeAdStatus?: 'idle' | 'loading' | 'loaded' | 'no_fill';
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
  nativeAdHeightDp = 54,
  nativeAdStatus = 'idle',
}) => {
  const nativeBannerSupported = hasNativeBannerAdSupport();
  const { adClient, adSlot } = useMemo(
    () => parseAdMobUnit(adUnitId),
    [adUnitId]
  );

  const slotRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushedSlotRef = useRef<boolean>(false);
  const rafSyncRef = useRef<number | null>(null);

  const [initialFetchWindow, setInitialFetchWindow] = useState<boolean>(true);
  const [webAdFilled, setWebAdFilled] = useState<boolean>(false);
  const [webAdUnfilled, setWebAdUnfilled] = useState<boolean>(false);

  // Brief initial fetch window for clean loading skeleton before collapsing if no-fill
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInitialFetchWindow(false);
    }, 3200);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const syncNativePosition = useCallback(() => {
    if (!nativeBannerSupported) return;
    const el = slotRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 800;
    const inViewport =
      rect.width > 0 && rect.bottom > 4 && rect.top < viewportHeight - 4;

    syncNativeBannerAdSlot(
      adUnitId,
      rect.left,
      rect.top,
      rect.width,
      !overlayOpen && inViewport
    );
  }, [nativeBannerSupported, adUnitId, overlayOpen]);

  const scheduleNativePositionSync = useCallback(() => {
    if (!nativeBannerSupported) return;
    if (rafSyncRef.current !== null) return;
    rafSyncRef.current = window.requestAnimationFrame(() => {
      rafSyncRef.current = null;
      syncNativePosition();
    });
  }, [nativeBannerSupported, syncNativePosition]);

  // Native Android: sync inline slot coordinates between Connect Button & Speed Test
  useEffect(() => {
    if (!nativeBannerSupported) return;

    syncNativePosition();

    const onScrollOrResize = () => {
      scheduleNativePositionSync();
    };

    window.addEventListener('scroll', onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleNativePositionSync();
      });
      if (slotRef.current) {
        resizeObserver.observe(slotRef.current);
      }
      if (document.body) {
        resizeObserver.observe(document.body);
      }
    }

    return () => {
      window.removeEventListener('scroll', onScrollOrResize, {
        capture: true,
      });
      window.removeEventListener('resize', onScrollOrResize);
      resizeObserver?.disconnect();
      if (rafSyncRef.current !== null) {
        window.cancelAnimationFrame(rafSyncRef.current);
        rafSyncRef.current = null;
      }
    };
  }, [
    nativeBannerSupported,
    syncNativePosition,
    scheduleNativePositionSync,
    nativeAdLoaded,
    nativeAdHeightDp,
  ]);

  // Hide native AdView cleanly on unmount
  useEffect(() => {
    if (!nativeBannerSupported) return;
    return () => {
      syncNativeBannerAdSlot(adUnitId, 0, 0, 320, false);
    };
  }, [nativeBannerSupported, adUnitId]);

  // Observe <ins class="adsbygoogle"> fill status on Web / PWA / non-native fallback
  useEffect(() => {
    if (nativeBannerSupported) return;
    const insEl = insRef.current;
    if (!insEl || typeof MutationObserver === 'undefined') return;

    const checkAdStatus = () => {
      const statusAttr = insEl.getAttribute('data-ad-status');
      if (statusAttr === 'filled') {
        setWebAdFilled(true);
        setWebAdUnfilled(false);
      } else if (statusAttr === 'unfilled') {
        setWebAdFilled(false);
        setWebAdUnfilled(true);
      } else if (insEl.querySelector('iframe')) {
        setWebAdFilled(true);
      }
    };

    checkAdStatus();
    const observer = new MutationObserver(checkAdStatus);
    observer.observe(insEl, {
      attributes: true,
      childList: true,
      attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'],
    });

    return () => {
      observer.disconnect();
    };
  }, [nativeBannerSupported]);

  // Web / PWA: lazily load external Google Ad script during idle time after mount
  useEffect(() => {
    if (nativeBannerSupported || typeof window === 'undefined') return;

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
        } catch {
          setWebAdUnfilled(true);
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
            setWebAdUnfilled(true);
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
        timeout: 1000,
      });
      return () => {
        cancelled = true;
        winWithIdle.cancelIdleCallback?.(idleId);
      };
    }

    const timerId = window.setTimeout(loadAdScriptWhenIdle, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [nativeBannerSupported, adClient]);

  if (nativeBannerSupported) {
    const showNativeLoading =
      !nativeAdLoaded &&
      initialFetchWindow &&
      nativeAdStatus !== 'no_fill';
    const showNativeFrame = nativeAdLoaded || showNativeLoading;
    const tallAdaptive = nativeAdHeightDp > 58;

    return (
      <div
        ref={slotRef}
        aria-label="Sponsored advertisement"
        className={
          showNativeFrame
            ? `mt-3.5 card-3d w-full rounded-xl bg-white dark:bg-[#0F2018] border border-transparent dark:border-emerald-900/40 overflow-hidden flex items-center justify-center transition-colors duration-200 ${
                tallAdaptive ? 'min-h-[68px]' : 'min-h-[58px]'
              }`
            : 'w-full h-0 overflow-hidden pointer-events-none'
        }
      >
        {showNativeLoading && (
          <div className="w-full px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {language === 'ur' ? 'اشتہار لوڈ ہو رہا ہے' : 'Loading Ad'}
            </span>
            <div className="h-2.5 w-28 rounded-full bg-slate-100 dark:bg-emerald-950/70 animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  const showWebLoading = !webAdFilled && !webAdUnfilled && initialFetchWindow;
  const showWebContainer = webAdFilled || showWebLoading;

  return (
    <div
      ref={slotRef}
      aria-label="Sponsored advertisement"
      className={
        showWebContainer
          ? 'mt-3.5 card-3d relative w-full min-h-[60px] rounded-xl bg-white dark:bg-[#0F2018] border border-transparent dark:border-emerald-900/40 px-3 py-2 flex flex-col items-center justify-center overflow-hidden transition-colors duration-200'
          : 'w-full h-0 overflow-hidden pointer-events-none'
      }
    >
      <ins
        ref={insRef}
        className="adsbygoogle block w-full min-h-[50px] max-h-[90px] text-center"
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />

      {showWebLoading && (
        <div className="pointer-events-none absolute inset-0 px-4 flex items-center justify-between gap-3 bg-white dark:bg-[#0F2018]">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {language === 'ur' ? 'اشتہار لوڈ ہو رہا ہے' : 'Loading Ad'}
          </span>
          <div className="h-2.5 w-28 rounded-full bg-slate-100 dark:bg-emerald-950/70 animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default FooterBannerAd;
