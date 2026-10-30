import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  ArrowUpCircle,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Language } from '../types/vpn';
import {
  formatBytesCompact,
  isNativeAndroidVpn,
  openNativeExternalUrl,
} from '../utils/nativeVpn';

const GITHUB_REPO = 'shahidpitafiskp-ui/Skp-vpn';
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const DIRECT_APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/app-debug.apk`;

interface GitHubReleaseInfo {
  tagName: string;
  title: string;
  buildNumber: number | null;
  publishedAt: string;
  apkSizeBytes: number | null;
  downloadUrl: string;
}

interface UpdatesModalProps {
  isOpen: boolean;
  language: Language;
  onClose: () => void;
}

function parseBuildNumberFromTag(tag: string): number | null {
  const match = tag.match(/debug-apk-build-(\d+)-/i) || tag.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export const UpdatesModal: React.FC<UpdatesModalProps> = ({
  isOpen,
  language,
  onClose,
}) => {
  const rawEnvBuild = import.meta.env.VITE_APP_BUILD_NUMBER as
    | string
    | undefined;
  const currentBuildNumber =
    rawEnvBuild && /^\d+$/.test(rawEnvBuild) ? Number(rawEnvBuild) : null;
  const currentCommitSha =
    (import.meta.env.VITE_APP_COMMIT_SHA as string | undefined) || '';

  const [checking, setChecking] = useState<boolean>(false);
  const [releaseInfo, setReleaseInfo] = useState<GitHubReleaseInfo | null>(
    null
  );
  const [checkError, setCheckError] = useState<string | null>(null);

  const checkLatestUpdate = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch(LATEST_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
      });

      if (res.status === 404) {
        setReleaseInfo(null);
        setCheckError(
          language === 'ur'
            ? 'ابھی پہلا ریلیز بلڈ تیار ہو رہا ہے۔ چند منٹ بعد دوبارہ چیک کریں۔'
            : 'Latest build is still being prepared on GitHub Actions. Please check again in a few minutes.'
        );
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const apkAsset =
        assets.find(
          (a: { name?: string }) => a && a.name === 'app-debug.apk'
        ) || assets[0];

      const publishedDate = data.published_at
        ? new Date(data.published_at).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      setReleaseInfo({
        tagName: String(data.tag_name || ''),
        title: String(data.name || data.tag_name || 'Latest Release'),
        buildNumber: parseBuildNumberFromTag(String(data.tag_name || '')),
        publishedAt: publishedDate,
        apkSizeBytes:
          apkAsset && typeof apkAsset.size === 'number' ? apkAsset.size : null,
        downloadUrl:
          apkAsset && typeof apkAsset.browser_download_url === 'string'
            ? apkAsset.browser_download_url
            : DIRECT_APK_URL,
      });
    } catch {
      setCheckError(
        language === 'ur'
          ? 'انٹرنیٹ کنیکشن چیک کریں اور دوبارہ کوشش کریں۔'
          : 'Could not reach update server. Check your internet connection and try again.'
      );
    } finally {
      setChecking(false);
    }
  }, [language]);

  useEffect(() => {
    if (isOpen) {
      checkLatestUpdate();
    }
  }, [isOpen, checkLatestUpdate]);

  if (!isOpen) return null;

  const isNewerAvailable =
    releaseInfo?.buildNumber !== null &&
    releaseInfo?.buildNumber !== undefined &&
    (currentBuildNumber === null ||
      releaseInfo.buildNumber > currentBuildNumber);

  const isUpToDate =
    releaseInfo?.buildNumber !== null &&
    releaseInfo?.buildNumber !== undefined &&
    currentBuildNumber !== null &&
    releaseInfo.buildNumber <= currentBuildNumber;

  const targetUpdateUrl = releaseInfo?.downloadUrl || DIRECT_APK_URL;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Emerald Header */}
        <div className="bg-[#0B5D32] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RefreshCw
              className={`w-5 h-5 shrink-0 ${checking ? 'animate-spin' : ''}`}
            />
            <h2
              className={`text-base font-bold ${
                language === 'ur' ? 'font-urdu' : ''
              }`}
            >
              {language === 'ur' ? 'ایپ اپڈیٹس (App Updates)' : 'App Updates'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close updates modal"
            className="min-w-[40px] min-h-[40px] -mr-2 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Installed vs Latest Version Comparison */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <div>
              <div className="text-[11px] text-slate-500">
                {language === 'ur' ? 'موجودہ ورژن' : 'Installed Version'}
              </div>
              <div className="text-sm font-bold font-mono-tabular text-slate-900 mt-0.5">
                {currentBuildNumber !== null
                  ? `v1.${currentBuildNumber}.0`
                  : 'v1.0 (Web)'}
              </div>
              {currentCommitSha && (
                <div className="text-[11px] font-mono-tabular text-slate-400">
                  #{currentCommitSha}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] text-slate-500">
                {language === 'ur' ? 'تازہ ترین ورژن' : 'Latest Release'}
              </div>
              <div className="text-sm font-bold font-mono-tabular text-[#15803D] mt-0.5">
                {checking
                  ? '...'
                  : releaseInfo?.buildNumber
                  ? `v1.${releaseInfo.buildNumber}.0`
                  : '—'}
              </div>
              {releaseInfo?.publishedAt && (
                <div className="text-[11px] text-slate-400 truncate">
                  {releaseInfo.publishedAt}
                </div>
              )}
            </div>
          </div>

          {/* Live Status Notice */}
          {checking ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 text-slate-700 text-xs font-medium">
              <RefreshCw className="w-4 h-4 text-[#15803D] animate-spin shrink-0" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur'
                  ? 'نئی اپڈیٹ چیک کی جا رہی ہے...'
                  : 'Checking GitHub Releases for new SKP VPN updates...'}
              </span>
            </div>
          ) : checkError ? (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {checkError}
              </span>
            </div>
          ) : isUpToDate ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur'
                  ? `آپ کے پاس تازہ ترین ورژن (v1.${releaseInfo?.buildNumber}.0) موجود ہے!`
                  : `SKP VPN is up to date (v1.${releaseInfo?.buildNumber}.0).`}
              </span>
            </div>
          ) : isNewerAvailable ? (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
              <ArrowUpCircle className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div
                  className={`font-bold text-[#0B5D32] ${
                    language === 'ur' ? 'font-urdu' : ''
                  }`}
                >
                  {language === 'ur'
                    ? `نئی اپڈیٹ دستیاب ہے: v1.${releaseInfo?.buildNumber}.0`
                    : `New Update Available: v1.${releaseInfo?.buildNumber}.0`}
                </div>
                {releaseInfo?.apkSizeBytes && (
                  <div className="text-[11px] text-emerald-700 font-mono-tabular">
                    APK Size: {formatBytesCompact(releaseInfo.apkSizeBytes)}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Release Highlights */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800">
              {language === 'ur'
                ? 'تازہ ترین اپڈیٹ کی خصوصیات:'
                : 'Latest Update Highlights'}
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-600 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <li>
                •{' '}
                {language === 'ur'
                  ? 'اصلی اینڈرائیڈ سسٹم WireGuard VPN انجن (مکمل موبائل ٹریفک کے لیے)'
                  : 'Real Android System WireGuard VPN Engine (system-wide mobile tunnel)'}
              </li>
              <li>
                •{' '}
                {language === 'ur'
                  ? 'پاکستان (کراچی اور اسلام آباد) اور عالمی مفت سرورز'
                  : 'Pakistan (Karachi & Islamabad) + global free servers'}
              </li>
              <li>
                •{' '}
                {language === 'ur'
                  ? 'ملٹی پورٹ آٹو کنیکٹ اور فاسٹ انٹرنیٹ سپیڈ چیک'
                  : 'Multi-port ISP bypass & Fast Internet Speed Check'}
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            {isNativeAndroidVpn() ? (
              <button
                type="button"
                onClick={() => openNativeExternalUrl(targetUpdateUrl)}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#116932] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ArrowUpCircle className="w-4 h-4 shrink-0" />
                <span className={language === 'ur' ? 'font-urdu' : ''}>
                  {language === 'ur'
                    ? 'تازہ ترین اپڈیٹ انسٹال کریں'
                    : isUpToDate
                    ? 'Reinstall Latest Update'
                    : 'Update SKP VPN Now'}
                </span>
              </button>
            ) : (
              <a
                href={targetUpdateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#116932] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span className={language === 'ur' ? 'font-urdu' : ''}>
                  {language === 'ur'
                    ? 'تازہ ترین اپڈیٹ حاصل کریں'
                    : 'Get Latest App Update'}
                </span>
              </a>
            )}

            <button
              type="button"
              disabled={checking}
              onClick={checkLatestUpdate}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`}
              />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur' ? 'دوبارہ اپڈیٹ چیک کریں' : 'Check Again'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
