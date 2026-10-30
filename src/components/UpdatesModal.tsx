import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  ArrowUpCircle,
  Download,
  AlertCircle,
  Zap,
  ShieldCheck,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { Language } from '../types/vpn';
import {
  applyWebInstantUpdate,
  formatBytesCompact,
  getNativeConfiguredRepo,
  getNativeInstalledBuildNumber,
  hasNativeInAppApkInstaller,
  isNativeAndroidVpn,
  nativeDownloadAndInstallApk,
  nativeInstallDownloadedApkIfReady,
  openNativeExternalUrl,
  syncNativeUpdateRepo,
  triggerNativeOtaUpdateCheck,
} from '../utils/nativeVpn';
import { GITHUB_REPO, getRepoUrls } from '../utils/updateConfig';

interface GitHubReleaseInfo {
  buildNumber: number | null;
  otaBuildNumber: number | null;
  releaseApkBuildNumber: number | null;
  publishedAt: string;
  apkSizeBytes: number | null;
  downloadUrl: string;
}

interface UpdatesModalProps {
  isOpen: boolean;
  language: Language;
  otaStatus?: string;
  otaProgress?: number;
  otaError?: string;
  otaErrorCode?: string;
  otaGithubRepo?: string;
  otaVersion?: string;
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
  otaStatus = 'idle',
  otaProgress = 0,
  otaError = '',
  otaErrorCode = '',
  otaGithubRepo = '',
  otaVersion = '',
  onClose,
}) => {
  const rawEnvBuild = import.meta.env.VITE_APP_BUILD_NUMBER as
    | string
    | undefined;
  const envBuildNumber =
    rawEnvBuild && /^\d+$/.test(rawEnvBuild) ? Number(rawEnvBuild) : null;
  const nativeBuildNumber = getNativeInstalledBuildNumber();
  const currentBuildNumber = nativeBuildNumber ?? envBuildNumber;

  const currentCommitSha =
    (import.meta.env.VITE_APP_COMMIT_SHA as string | undefined) || '';

  const activeRepo = useMemo(() => {
    const envRepo = (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim();
    if (envRepo && envRepo.includes('/')) {
      return envRepo;
    }
    const nativeRepo = otaGithubRepo || getNativeConfiguredRepo() || '';
    if (nativeRepo && nativeRepo.includes('/')) {
      return nativeRepo;
    }
    return GITHUB_REPO;
  }, [otaGithubRepo]);

  const repoUrls = useMemo(() => getRepoUrls(activeRepo), [activeRepo]);

  const [checking, setChecking] = useState<boolean>(false);
  const [webUpdating, setWebUpdating] = useState<boolean>(false);
  const [releaseInfo, setReleaseInfo] = useState<GitHubReleaseInfo | null>(
    null
  );
  const [checkError, setCheckError] = useState<string | null>(null);
  const [privateRepoDetected, setPrivateRepoDetected] =
    useState<boolean>(false);

  useEffect(() => {
    if (activeRepo) {
      syncNativeUpdateRepo(activeRepo);
    }
  }, [activeRepo]);

  const checkLatestUpdate = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    setPrivateRepoDetected(false);

    try {
      let otaRunNum: number | null = null;
      let otaDate = '';

      // 1. Resolve exact uncached commit SHA of ota-live via GitHub API if public
      let latestSha = '';
      try {
        const shaRes = await fetch(`${repoUrls.otaCommitApi}?t=${Date.now()}`, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
        });
        if (shaRes.ok) {
          const shaData = await shaRes.json();
          if (typeof shaData.sha === 'string' && shaData.sha.length >= 7) {
            latestSha = shaData.sha;
          }
        }
      } catch {
        // Fallback to multi-mirror manifest URLs
      }

      // 2. Try all OTA manifest mirrors (GitHub Raw, jsDelivr CDN, GitHub Release asset)
      const manifestMirrors = repoUrls.otaManifestMirrors(latestSha);
      for (const mirrorUrl of manifestMirrors) {
        try {
          const otaRes = await fetch(mirrorUrl, { cache: 'no-store' });
          if (otaRes.ok) {
            const otaJson = await otaRes.json();
            if (typeof otaJson.runNumber === 'number') {
              otaRunNum = otaJson.runNumber;
              if (otaJson.updatedAt) {
                otaDate = new Date(otaJson.updatedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }
              break;
            }
          }
        } catch {
          // Try next mirror
        }
      }

      // 3. Query GitHub Releases (/releases/latest with fallback to /releases?per_page=5)
      let releaseData: {
        tag_name?: string;
        published_at?: string;
        assets?: Array<{
          name?: string;
          size?: number;
          browser_download_url?: string;
        }>;
      } | null = null;

      try {
        const latestRes = await fetch(
          `${repoUrls.latestReleaseApi}?t=${Date.now()}`,
          {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
          }
        );
        if (latestRes.ok) {
          releaseData = await latestRes.json();
        } else if (latestRes.status === 404) {
          const listRes = await fetch(
            `${repoUrls.releasesListApi}&t=${Date.now()}`,
            {
              headers: { Accept: 'application/vnd.github+json' },
              cache: 'no-store',
            }
          );
          if (listRes.ok) {
            const listJson = await listRes.json();
            if (Array.isArray(listJson) && listJson.length > 0) {
              releaseData = listJson[0];
            }
          }
        }
      } catch {
        // Handled below
      }

      if (releaseData) {
        const assets = Array.isArray(releaseData.assets)
          ? releaseData.assets
          : [];
        const apkAsset =
          assets.find((a) => a && a.name === 'app-debug.apk') || assets[0];

        const releaseBuildNum = parseBuildNumberFromTag(
          String(releaseData.tag_name || '')
        );
        const bestBuildNum =
          otaRunNum !== null && releaseBuildNum !== null
            ? Math.max(otaRunNum, releaseBuildNum)
            : otaRunNum ?? releaseBuildNum;

        const publishedDate =
          otaDate ||
          (releaseData.published_at
            ? new Date(releaseData.published_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '');

        setReleaseInfo({
          buildNumber: bestBuildNum,
          otaBuildNumber: otaRunNum,
          releaseApkBuildNumber: releaseBuildNum,
          publishedAt: publishedDate,
          apkSizeBytes:
            apkAsset && typeof apkAsset.size === 'number'
              ? apkAsset.size
              : null,
          downloadUrl:
            apkAsset && typeof apkAsset.browser_download_url === 'string'
              ? apkAsset.browser_download_url
              : repoUrls.directApkUrl,
        });
        return;
      }

      if (otaRunNum !== null) {
        setReleaseInfo({
          buildNumber: otaRunNum,
          otaBuildNumber: otaRunNum,
          releaseApkBuildNumber: null,
          publishedAt: otaDate,
          apkSizeBytes: null,
          downloadUrl: repoUrls.directApkUrl,
        });
        return;
      }

      // 4. Diagnose why both OTA & Releases returned 404: check if GitHub repo is Public vs Private
      const repoRes = await fetch(`${repoUrls.repoApi}?t=${Date.now()}`, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });

      if (repoRes.ok) {
        // Repo is Public and reachable, so installed build is already the latest!
        const fallbackBuild = currentBuildNumber ?? 1;
        setReleaseInfo({
          buildNumber: fallbackBuild,
          otaBuildNumber: fallbackBuild,
          releaseApkBuildNumber: null,
          publishedAt: '',
          apkSizeBytes: null,
          downloadUrl: repoUrls.directApkUrl,
        });
        return;
      }

      if (repoRes.status === 404) {
        setReleaseInfo(null);
        setPrivateRepoDetected(true);
        return;
      }

      throw new Error(`HTTP ${repoRes.status}`);
    } catch {
      setCheckError(
        language === 'ur'
          ? 'انٹرنیٹ کنیکشن چیک کریں اور دوبارہ کوشش کریں۔'
          : 'Could not reach update server. Check your internet connection and try again.'
      );
    } finally {
      setChecking(false);
    }
  }, [currentBuildNumber, language, repoUrls]);

  useEffect(() => {
    if (isOpen) {
      checkLatestUpdate();
    }
  }, [isOpen, checkLatestUpdate]);

  if (!isOpen) return null;

  const nativeAndroid = isNativeAndroidVpn();
  const supportsDirectApkInstall = hasNativeInAppApkInstaller();

  const isPrivateRepo =
    privateRepoDetected ||
    otaStatus === 'repo_private' ||
    otaErrorCode === 'repo_private';

  const isNewerAvailable =
    !isPrivateRepo &&
    releaseInfo?.buildNumber !== null &&
    releaseInfo?.buildNumber !== undefined &&
    (currentBuildNumber === null ||
      releaseInfo.buildNumber > currentBuildNumber);

  const isUpToDate =
    !isPrivateRepo &&
    ((releaseInfo?.buildNumber !== null &&
      releaseInfo?.buildNumber !== undefined &&
      currentBuildNumber !== null &&
      releaseInfo.buildNumber <= currentBuildNumber) ||
      otaStatus === 'up_to_date');

  const targetUpdateUrl = releaseInfo?.downloadUrl || repoUrls.directApkUrl;

  const isBusyUpdating =
    otaStatus === 'checking' ||
    otaStatus === 'downloading' ||
    otaStatus === 'downloading_apk' ||
    otaStatus === 'installing_apk' ||
    webUpdating;

  const displayProgress = Math.max(
    4,
    Math.min(100, Math.round(otaProgress || (webUpdating ? 75 : 15)))
  );

  const handleSmartInAppUpdate = () => {
    if (nativeAndroid) {
      const startedOta = triggerNativeOtaUpdateCheck(activeRepo);
      if (!startedOta && supportsDirectApkInstall) {
        nativeDownloadAndInstallApk(targetUpdateUrl);
      } else if (!startedOta) {
        openNativeExternalUrl(targetUpdateUrl);
      }
      checkLatestUpdate();
      return;
    }

    setWebUpdating(true);
    applyWebInstantUpdate().catch(() => {
      setWebUpdating(false);
    });
  };

  const handleDirectInAppApkInstall = () => {
    if (supportsDirectApkInstall) {
      nativeDownloadAndInstallApk(targetUpdateUrl);
      return;
    }
    openNativeExternalUrl(targetUpdateUrl);
  };

  const handleOpenRepoSettings = () => {
    if (nativeAndroid) {
      openNativeExternalUrl(repoUrls.repoSettingsUrl);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="card-3d w-full sm:max-w-md bg-white dark:bg-[#0D1E16] text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl shadow-xl border border-transparent dark:border-emerald-900/40 overflow-hidden max-h-[90vh] flex flex-col transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Emerald Header */}
        <div className="header-3d bg-[#0B5D32] dark:bg-[#062816] px-6 py-4 text-white flex items-center justify-between border-b border-transparent dark:border-emerald-900/50">
          <div className="flex items-center gap-2.5">
            <RefreshCw
              className={`w-5 h-5 shrink-0 ${
                checking || isBusyUpdating ? 'animate-spin' : ''
              }`}
            />
            <h2
              className={`font-display-3d text-base font-bold ${
                language === 'ur' ? 'font-urdu' : ''
              }`}
            >
              {language === 'ur'
                ? 'ایپ اپڈیٹر (In-App Update)'
                : 'In-App Updater'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close updates modal"
            className="min-w-[44px] min-h-[44px] -mr-2 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Direct In-App Update Assurance */}
          <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <Zap className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0 mt-0.5" />
            <span className={language === 'ur' ? 'font-urdu' : ''}>
              {language === 'ur'
                ? 'اب مینوئل براؤزر سے ایپ ڈاؤنلوڈ کرنے کی ضرورت نہیں۔ نیچے بٹن دبانے سے ایپ اسی سکرین کے اندر براہِ راست اپڈیٹ ہو جائے گی۔'
                : 'No manual browser downloads needed. Update SKP VPN directly inside the app with one tap.'}
            </span>
          </div>

          {/* Installed vs Latest Version Comparison */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-[#13291F] rounded-xl p-3.5 border border-slate-200/70 dark:border-emerald-900/40">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {language === 'ur' ? 'موجودہ ورژن' : 'Installed Version'}
              </div>
              <div className="text-sm font-bold font-mono-tabular text-slate-900 dark:text-white mt-0.5">
                {currentBuildNumber !== null
                  ? `v1.${currentBuildNumber}.0`
                  : 'v1.0 (Live)'}
              </div>
              {currentCommitSha && (
                <div className="text-[11px] font-mono-tabular text-slate-400 dark:text-slate-500">
                  #{currentCommitSha}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {language === 'ur' ? 'تازہ ترین ورژن' : 'Latest Version'}
              </div>
              <div className="text-sm font-bold font-mono-tabular text-[#15803D] dark:text-emerald-400 mt-0.5">
                {checking
                  ? '...'
                  : releaseInfo?.buildNumber
                  ? `v1.${releaseInfo.buildNumber}.0`
                  : otaVersion
                  ? otaVersion
                  : isPrivateRepo
                  ? 'Private Repo'
                  : currentBuildNumber !== null
                  ? `v1.${currentBuildNumber}.0`
                  : '—'}
              </div>
              {releaseInfo?.publishedAt ? (
                <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {releaseInfo.publishedAt}
                </div>
              ) : (
                <div className="text-[11px] font-mono-tabular text-slate-400 dark:text-slate-500 truncate">
                  {activeRepo}
                </div>
              )}
            </div>
          </div>

          {/* Live In-App Download & Install Progress Bar */}
          {isBusyUpdating && (
            <div className="p-3.5 rounded-xl bg-emerald-50/90 dark:bg-[#13291F] border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#0B5D32] dark:text-emerald-300">
                <span className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#15803D] dark:text-emerald-400 shrink-0" />
                  <span
                    className={`truncate ${
                      language === 'ur' ? 'font-urdu' : ''
                    }`}
                  >
                    {otaStatus === 'downloading_apk'
                      ? language === 'ur'
                        ? 'ایپ کے اندر نئی اپڈیٹ ڈاؤنلوڈ ہو رہی ہے...'
                        : 'Downloading update inside SKP VPN...'
                      : otaStatus === 'installing_apk'
                      ? language === 'ur'
                        ? 'اینڈرائیڈ انسٹالر کھولا جا رہا ہے...'
                        : 'Opening Android system update prompt...'
                      : otaStatus === 'downloading'
                      ? language === 'ur'
                        ? 'فوری آٹو اپڈیٹ انسٹال ہو رہی ہے...'
                        : 'Applying instant in-app update...'
                      : language === 'ur'
                      ? 'اپڈیٹ چیک اور سنک ہو رہی ہے...'
                      : 'Checking & syncing latest update...'}
                  </span>
                </span>
                <span className="font-mono-tabular shrink-0">
                  {displayProgress}%
                </span>
              </div>

              <progress
                value={displayProgress}
                max={100}
                className="w-full h-2.5 rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-emerald-200/70 dark:[&::-webkit-progress-bar]:bg-emerald-950 [&::-webkit-progress-value]:bg-[#15803D] dark:[&::-webkit-progress-value]:bg-emerald-400 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-[#15803D]"
              />
            </div>
          )}

          {/* One-Time Android Install Permission Helper */}
          {otaStatus === 'permission_needed' && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 text-amber-950 dark:text-amber-100 text-xs space-y-2.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span className={language === 'ur' ? 'font-urdu' : ''}>
                  {language === 'ur'
                    ? 'اپڈیٹ 100% ڈاؤنلوڈ ہو چکی ہے! اینڈرائیڈ سیٹنگ میں "Allow from this source" آن کریں، واپس آتے ہی اپڈیٹ خودکار انسٹال ہو جائے گی۔'
                    : 'Update downloaded (100%)! Enable "Allow from this source" for SKP VPN — the update will install automatically.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => nativeInstallDownloadedApkIfReady()}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {language === 'ur'
                  ? 'ڈاؤنلوڈ شدہ اپڈیٹ ابھی انسٹال کریں'
                  : 'Install Downloaded Update Now'}
              </button>
            </div>
          )}

          {/* Installer Opened Confirmation */}
          {otaStatus === 'installer_opened' && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0 mt-0.5" />
              <span className={language === 'ur' ? 'font-urdu' : ''}>
                {language === 'ur'
                  ? 'اینڈرائیڈ اپڈیٹ ڈائیلاگ کھل گیا ہے — سکرین پر "Update" دبائیں۔'
                  : 'Android update prompt opened — tap "Update" on the system dialog to finish.'}
              </span>
            </div>
          )}

          {/* GitHub Private Repo One-Time Fix Guide (Eliminates Mystery HTTP 404) */}
          {!isBusyUpdating && isPrivateRepo && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 text-amber-950 dark:text-amber-100 text-xs space-y-2.5">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div
                    className={`font-bold text-amber-950 dark:text-amber-100 ${
                      language === 'ur' ? 'font-urdu' : ''
                    }`}
                  >
                    {language === 'ur'
                      ? 'گٹ ہب ریپوزٹری ابھی Private ہے (HTTP 404 کی وجہ)'
                      : 'GitHub Repository is Set to Private'}
                  </div>
                  <p className={language === 'ur' ? 'font-urdu' : ''}>
                    {language === 'ur'
                      ? `آپ کی ریپوزٹری (${activeRepo}) اس وقت Private ہے جس کی وجہ سے GitHub آٹو اپڈیٹ کو بلاک (404) کرتا ہے۔ صرف ایک بار GitHub Settings میں جا کر Visibility کو Public کر دیں — اس کے بعد ہر اپڈیٹ ہمیشہ خودکار انسٹال ہو گی۔`
                      : `Your GitHub repo (${activeRepo}) is currently Private, so GitHub blocks phone auto-updates with HTTP 404. Switch repo visibility to Public once in GitHub Settings — then 1-tap auto-update works immediately.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                {nativeAndroid ? (
                  <button
                    type="button"
                    onClick={handleOpenRepoSettings}
                    className="min-h-[44px] px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur'
                        ? 'GitHub سیٹنگز کھولیں'
                        : 'Open Repo Settings'}
                    </span>
                  </button>
                ) : (
                  <a
                    href={repoUrls.repoSettingsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur'
                        ? 'GitHub سیٹنگز کھولیں'
                        : 'Open Repo Settings'}
                    </span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={checkLatestUpdate}
                  className="min-h-[44px] px-3 py-2 rounded-lg bg-white dark:bg-[#0D1E16] border border-amber-300 dark:border-amber-700/70 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 text-amber-950 dark:text-amber-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span className={language === 'ur' ? 'font-urdu' : ''}>
                    {language === 'ur'
                      ? 'Public کر کے دوبارہ چیک کریں'
                      : 'Re-check Update'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Native OTA / APK Error Notice (Only when NOT Private Repo) */}
          {!isPrivateRepo && otaStatus === 'error' && otaError && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{otaError}</span>
            </div>
          )}

          {/* Version Check Status */}
          {!isBusyUpdating &&
            !isPrivateRepo &&
            otaStatus !== 'permission_needed' && (
              <>
                {checking ? (
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#13291F] text-slate-700 dark:text-slate-200 text-xs font-medium">
                    <RefreshCw className="w-4 h-4 text-[#15803D] dark:text-emerald-400 animate-spin shrink-0" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur'
                        ? 'نئی اپڈیٹ چیک کی جا رہی ہے...'
                        : 'Checking for new SKP VPN updates...'}
                    </span>
                  </div>
                ) : checkError && otaStatus !== 'error' ? (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {checkError}
                    </span>
                  </div>
                ) : isUpToDate ? (
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur'
                        ? `آپ کی ایپ تازہ ترین ورژن (v1.${
                            releaseInfo?.buildNumber ?? currentBuildNumber ?? 1
                          }.0) پر اپڈیٹ ہے!`
                        : `SKP VPN is up to date (v1.${
                            releaseInfo?.buildNumber ?? currentBuildNumber ?? 1
                          }.0).`}
                    </span>
                  </div>
                ) : isNewerAvailable ? (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
                    <ArrowUpCircle className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div
                        className={`font-bold text-[#0B5D32] dark:text-emerald-300 ${
                          language === 'ur' ? 'font-urdu' : ''
                        }`}
                      >
                        {language === 'ur'
                          ? `نئی اپڈیٹ دستیاب ہے: v1.${releaseInfo?.buildNumber}.0`
                          : `New Update Ready: v1.${releaseInfo?.buildNumber}.0`}
                      </div>
                      {releaseInfo?.apkSizeBytes && (
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono-tabular">
                          Package size ·{' '}
                          {formatBytesCompact(releaseInfo.apkSizeBytes)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}

          {/* In-App Update Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            {nativeAndroid ? (
              <>
                <button
                  type="button"
                  disabled={isBusyUpdating}
                  onClick={handleSmartInAppUpdate}
                  className="btn-3d-emerald w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#116932] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Zap className="w-4 h-4 shrink-0" />
                  <span className={language === 'ur' ? 'font-urdu' : ''}>
                    {language === 'ur'
                      ? 'ایپ ابھی فوری اپڈیٹ کریں (Instant Update)'
                      : 'Instant Auto-Update Now'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isBusyUpdating}
                  onClick={handleDirectInAppApkInstall}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#13291F] hover:bg-emerald-50 dark:hover:bg-emerald-500/15 border border-slate-200/80 dark:border-emerald-900/50 disabled:opacity-60 text-slate-900 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
                  <span className={language === 'ur' ? 'font-urdu' : ''}>
                    {supportsDirectApkInstall
                      ? language === 'ur'
                        ? 'مکمل نئی ایپ اندر ہی انسٹال کریں (Direct APK)'
                        : 'Update Full App Inside SKP VPN'
                      : language === 'ur'
                      ? 'پہلی بار آٹو اپڈیٹر APK انسٹال کریں'
                      : 'Install Auto-Updater APK (One-Time)'}
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isBusyUpdating}
                  onClick={handleSmartInAppUpdate}
                  className="btn-3d-emerald w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#116932] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Zap className="w-4 h-4 shrink-0" />
                  <span className={language === 'ur' ? 'font-urdu' : ''}>
                    {language === 'ur'
                      ? 'ایپ ابھی اپڈیٹ کریں (Update Now)'
                      : 'Update App Now'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={checking || isBusyUpdating}
                    onClick={checkLatestUpdate}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900/50 hover:bg-slate-50 dark:hover:bg-[#13291F] disabled:opacity-60 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 shrink-0 ${
                        checking ? 'animate-spin' : ''
                      }`}
                    />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur' ? 'دوبارہ چیک کریں' : 'Check Again'}
                    </span>
                  </button>

                  <a
                    href={targetUpdateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900/50 hover:bg-slate-50 dark:hover:bg-[#13291F] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0 text-[#15803D] dark:text-emerald-400" />
                    <span className={language === 'ur' ? 'font-urdu' : ''}>
                      {language === 'ur' ? 'اینڈرائیڈ APK' : 'Android APK'}
                    </span>
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
