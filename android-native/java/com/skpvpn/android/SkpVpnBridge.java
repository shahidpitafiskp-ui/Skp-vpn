package com.skpvpn.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.VpnService;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;

import com.wireguard.android.backend.GoBackend;
import com.wireguard.android.backend.Statistics;
import com.wireguard.android.backend.Tunnel;
import com.wireguard.config.Config;
import com.wireguard.config.InetEndpoint;
import com.wireguard.config.InetNetwork;
import com.wireguard.config.Interface;
import com.wireguard.config.Peer;
import com.wireguard.crypto.KeyPair;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class SkpVpnBridge {
    private static final String TAG = "SkpVpnBridge";
    private static final String PREFS_NAME = "skp_vpn_wg_prefs";
    private static final String CHANNEL_ID = "skp_vpn_tunnel_status";
    private static final int NOTIFICATION_ID = 4401;

    private static final String DEFAULT_GITHUB_REPO = "shahidpitafiskp-ui/Skp-vpn";
    private static final String BUILD_READ_TOKEN = "";

    // Pre-registered WireGuard emergency fallback profile if ISP blocks initial key registration prior to VPN activation
    private static final String FALLBACK_PRIV_KEY = "eCHsg7bPjbcqcShDRokQYEloCr6oKDX9kn3DDzKoBEE=";
    private static final String FALLBACK_PEER_PUB_KEY = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=";
    private static final String FALLBACK_IPV4 = "172.16.0.2";
    private static final String FALLBACK_IPV6 = "2606:4700:110:8293:e5e5:7c6b:7136:23e4";

    private static final String[] LOCAL_BANKING_PACKAGES = new String[]{
        "com.techlogix.mobilinkcustomer",      // JazzCash
        "pk.com.telenor.phoenix",              // Easypaisa
        "com.sadapay.app",                     // SadaPay
        "com.nayapay.app",                     // NayaPay
        "com.hbl.android.hblmobilebanking",    // HBL Mobile
        "com.meezanbank.app",                  // Meezan Mobile
        "com.ubldigital.ubl",                  // UBL Digital
        "com.alfalah.bankalfalah"              // Alfa
    };

    private static volatile SkpVpnBridge instance;
    private static GoBackend sharedBackend;
    private static SkpTunnel sharedTunnel;

    private final Context appContext;
    private WeakReference<MainActivity> activityRef;
    private WeakReference<WebView> webViewRef;

    private final ExecutorService tunnelExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService otaExecutor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService telemetryScheduler = Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger connectGeneration = new AtomicInteger(0);
    private final AtomicBoolean otaCheckInProgress = new AtomicBoolean(false);

    private volatile String currentState = "DISCONNECTED";
    private volatile String statusDetail = "";
    private volatile String lastError = "";
    private volatile String activeServerId = "auto";
    private volatile String activeServerName = "Auto select";
    private volatile String activeEndpoint = "";
    private volatile String verifiedExitIp = "";
    private volatile String verifiedColo = "";
    private volatile boolean warpVerified = false;
    private volatile boolean connectingInProgress = false;
    private volatile long connectedSinceMs = 0L;

    private final AtomicBoolean apkDownloadInProgress = new AtomicBoolean(false);

    private volatile String otaStatus = "idle";
    private volatile String otaVersion = "";
    private volatile int otaProgress = 0;
    private volatile String otaError = "";
    private volatile String otaErrorCode = "";
    private volatile File pendingApkInstallFile = null;
    private volatile long lastOtaCheckMs = 0L;

    private volatile long lastRxBytes = 0L;
    private volatile long lastTxBytes = 0L;
    private volatile long lastSampleTimeMs = 0L;
    private volatile double currentDownMbps = 0.0;
    private volatile double currentUpMbps = 0.0;

    private volatile String pendingServerId = "auto";
    private volatile String pendingServerName = "Auto select";
    private volatile String pendingProtocol = "Auto";
    private volatile boolean pendingBypassBanking = true;

    private static final class WgCredentials {
        final String privateKey;
        final String peerPublicKey;
        final String v4;
        final String v6;
        final boolean dedicated;

        WgCredentials(String privateKey, String peerPublicKey, String v4, String v6, boolean dedicated) {
            this.privateKey = privateKey;
            this.peerPublicKey = peerPublicKey;
            this.v4 = v4;
            this.v6 = v6;
            this.dedicated = dedicated;
        }
    }

    private static final class SkpTunnel implements Tunnel {
        @Override
        public String getName() {
            return "wg0";
        }

        @Override
        public void onStateChange(State newState) {
            SkpVpnBridge bridge = instance;
            if (bridge != null) {
                bridge.handleBackendStateChange(newState);
            }
        }
    }

    public static synchronized SkpVpnBridge getInstance(MainActivity activity) {
        if (instance == null) {
            instance = new SkpVpnBridge(activity);
        } else {
            instance.attachActivity(activity, activity.getBridge() != null ? activity.getBridge().getWebView() : null);
        }
        return instance;
    }

    private SkpVpnBridge(MainActivity activity) {
        this.appContext = activity.getApplicationContext();
        this.activityRef = new WeakReference<>(activity);
        this.webViewRef = new WeakReference<>(activity.getBridge() != null ? activity.getBridge().getWebView() : null);

        ensureNotificationChannel();

        try {
            if (sharedBackend == null) {
                sharedBackend = new GoBackend(appContext);
            }
            if (sharedTunnel == null) {
                sharedTunnel = new SkpTunnel();
            }
            if (sharedBackend.getState(sharedTunnel) == Tunnel.State.UP) {
                currentState = "CONNECTED";
                if (connectedSinceMs == 0L) {
                    SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    long savedSince = prefs.getLong("wg_connected_since_ms", 0L);
                    connectedSinceMs = (savedSince > 0L && savedSince <= System.currentTimeMillis())
                        ? savedSince
                        : System.currentTimeMillis();
                }
            }
        } catch (Throwable t) {
            Log.e(TAG, "Failed initializing WireGuard GoBackend", t);
            lastError = "VPN engine init error: " + t.getMessage();
        }

        telemetryScheduler.scheduleAtFixedRate(this::pollLiveTelemetry, 1, 1, TimeUnit.SECONDS);
    }

    public void attachActivity(MainActivity activity, WebView webView) {
        this.activityRef = new WeakReference<>(activity);
        if (webView != null) {
            this.webViewRef = new WeakReference<>(webView);
        }
    }

    @SuppressWarnings("deprecation")
    private int getApkVersionCode() {
        try {
            PackageInfo pInfo = appContext.getPackageManager().getPackageInfo(appContext.getPackageName(), 0);
            return pInfo.versionCode;
        } catch (Exception ignored) {
            return 1;
        }
    }

    public String getActiveValidOtaDir() {
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            int otaRun = prefs.getInt("ota_run_number", 0);
            int apkVer = getApkVersionCode();
            String dirPath = prefs.getString("ota_active_dir", null);

            if (dirPath == null || dirPath.isEmpty()) {
                return null;
            }
            // If user installed a newer APK than the cached OTA bundle, prefer the newer APK assets
            if (apkVer > otaRun) {
                return null;
            }
            File indexFile = new File(dirPath, "index.html");
            if (indexFile.exists() && indexFile.length() > 0) {
                return dirPath;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @JavascriptInterface
    public int getInstalledBuildNumber() {
        int apkVer = getApkVersionCode();
        if (getActiveValidOtaDir() == null) {
            return apkVer;
        }
        SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int otaRun = prefs.getInt("ota_run_number", 0);
        return Math.max(apkVer, otaRun);
    }

    private String getEffectiveRepo() {
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String saved = prefs.getString("ota_github_repo", null);
            if (saved != null) {
                String trimmed = saved.trim();
                if (isValidRepoSlug(trimmed)) {
                    return trimmed;
                }
            }
        } catch (Exception ignored) {
        }
        return DEFAULT_GITHUB_REPO;
    }

    private boolean isValidRepoSlug(String slug) {
        if (slug == null || slug.length() < 3) return false;
        int slash = slug.indexOf('/');
        return slash > 0 && slash < slug.length() - 1 && slug.indexOf('/', slash + 1) == -1 && !slug.contains(" ");
    }

    private String getDefaultDirectApkUrl() {
        return "https://github.com/" + getEffectiveRepo() + "/releases/latest/download/app-debug.apk";
    }

    @JavascriptInterface
    public String getConfiguredRepo() {
        return getEffectiveRepo();
    }

    @JavascriptInterface
    public void syncUpdateRepo(String repoSlug) {
        if (repoSlug == null) return;
        String trimmed = repoSlug.trim();
        if (!isValidRepoSlug(trimmed)) return;
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString("ota_github_repo", trimmed).apply();
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void triggerOtaUpdateCheck() {
        checkForOtaUpdateAsync(true);
    }

    @JavascriptInterface
    public void downloadAndInstallApk(String apkUrl) {
        final String initialTargetUrl = (apkUrl != null && !apkUrl.trim().isEmpty())
            ? apkUrl.trim()
            : getDefaultDirectApkUrl();

        if (!apkDownloadInProgress.compareAndSet(false, true)) {
            return;
        }

        otaStatus = "downloading_apk";
        otaProgress = 1;
        otaError = "";
        otaErrorCode = "";
        emitCurrentState();

        Executors.newSingleThreadExecutor().execute(() -> {
            HttpURLConnection conn = null;
            try {
                File updatesDir = new File(appContext.getCacheDir(), "apk_updates");
                if (!updatesDir.exists()) {
                    // noinspection ResultOfMethodCallIgnored
                    updatesDir.mkdirs();
                }

                File partFile = new File(updatesDir, "skp-vpn-update.apk.part");
                File finalApk = new File(updatesDir, "skp-vpn-update.apk");
                if (partFile.exists()) {
                    // noinspection ResultOfMethodCallIgnored
                    partFile.delete();
                }

                String resolvedDownloadUrl = initialTargetUrl;
                String acceptHeader = "*/*";
                conn = openConnectionFollowRedirects(resolvedDownloadUrl, 8, 15000, 30000, acceptHeader);
                int status = conn.getResponseCode();

                if (status == 404) {
                    conn.disconnect();
                    conn = null;
                    ReleaseCheckResult fallbackRel = fetchLatestReleaseMetadata(getEffectiveRepo());
                    if (fallbackRel != null && fallbackRel.downloadUrl != null && !fallbackRel.downloadUrl.isEmpty()) {
                        resolvedDownloadUrl = fallbackRel.downloadUrl;
                        acceptHeader = fallbackRel.useApiOctetStream ? "application/octet-stream" : "*/*";
                        conn = openConnectionFollowRedirects(resolvedDownloadUrl, 8, 15000, 30000, acceptHeader);
                        status = conn.getResponseCode();
                    }
                }

                if (status != 200) {
                    if (status == 404 && isRepoPrivateOrUnreachable(getEffectiveRepo())) {
                        otaStatus = "repo_private";
                        otaProgress = 0;
                        otaErrorCode = "repo_private";
                        otaError = "GitHub repository (" + getEffectiveRepo() + ") is Private. Change repository visibility to Public in GitHub Settings for direct in-app updates.";
                        emitCurrentState();
                        return;
                    }
                    throw new Exception("Update download failed (HTTP " + status + ")");
                }

                long contentLength = parseContentLength(conn);
                long fallbackEstimateBytes = 18_500_000L;
                long totalExpected = contentLength > 0 ? contentLength : fallbackEstimateBytes;

                long downloaded = 0L;
                long lastEmitMs = 0L;

                try (InputStream is = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream fos = new FileOutputStream(partFile)) {
                    byte[] buffer = new byte[32768];
                    int read;
                    while ((read = is.read(buffer)) != -1) {
                        fos.write(buffer, 0, read);
                        downloaded += read;
                        long now = System.currentTimeMillis();
                        if (now - lastEmitMs >= 160L) {
                            lastEmitMs = now;
                            int pct = (int) Math.min(99L, Math.max(1L, (downloaded * 100L) / totalExpected));
                            otaProgress = pct;
                            otaStatus = "downloading_apk";
                            emitCurrentState();
                        }
                    }
                    fos.getFD().sync();
                }

                if (!partFile.exists() || partFile.length() < 500_000L) {
                    // noinspection ResultOfMethodCallIgnored
                    partFile.delete();
                    throw new Exception("Downloaded APK file was incomplete. Check internet and retry.");
                }

                if (finalApk.exists()) {
                    // noinspection ResultOfMethodCallIgnored
                    finalApk.delete();
                }
                if (!partFile.renameTo(finalApk)) {
                    try (InputStream fis = new FileInputStream(partFile);
                         FileOutputStream fos = new FileOutputStream(finalApk)) {
                        byte[] copyBuf = new byte[32768];
                        int n;
                        while ((n = fis.read(copyBuf)) != -1) {
                            fos.write(copyBuf, 0, n);
                        }
                        fos.getFD().sync();
                    }
                    // noinspection ResultOfMethodCallIgnored
                    partFile.delete();
                }

                otaProgress = 100;
                otaStatus = "installing_apk";
                otaError = "";
                otaErrorCode = "";
                emitCurrentState();

                promptInstallApkFile(finalApk);
            } catch (Exception e) {
                Log.e(TAG, "In-app APK download/install failed", e);
                otaStatus = "error";
                otaProgress = 0;
                otaError = e.getMessage() != null ? e.getMessage() : "Could not download update APK.";
                emitCurrentState();
            } finally {
                if (conn != null) conn.disconnect();
                apkDownloadInProgress.set(false);
            }
        });
    }

    @JavascriptInterface
    public void installDownloadedApkIfReady() {
        File updatesDir = new File(appContext.getCacheDir(), "apk_updates");
        File finalApk = pendingApkInstallFile != null
            ? pendingApkInstallFile
            : new File(updatesDir, "skp-vpn-update.apk");
        if (finalApk.exists() && finalApk.length() > 500_000L) {
            promptInstallApkFile(finalApk);
        } else {
            downloadAndInstallApk(getDefaultDirectApkUrl());
        }
    }

    public void resumePendingApkInstallIfAllowed() {
        File pending = pendingApkInstallFile;
        if (pending == null || !pending.exists()) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!appContext.getPackageManager().canRequestPackageInstalls()) {
                return;
            }
        }
        promptInstallApkFile(pending);
    }

    private void promptInstallApkFile(final File apkFile) {
        if (apkFile == null || !apkFile.exists()) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!appContext.getPackageManager().canRequestPackageInstalls()) {
                    pendingApkInstallFile = apkFile;
                    otaStatus = "permission_needed";
                    otaProgress = 100;
                    otaError = "";
                    emitCurrentState();

                    final Intent permIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + appContext.getPackageName())
                    );
                    MainActivity activity = activityRef != null ? activityRef.get() : null;
                    if (activity != null) {
                        activity.runOnUiThread(() -> {
                            try {
                                activity.startActivity(permIntent);
                            } catch (Exception ex) {
                                permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                appContext.startActivity(permIntent);
                            }
                        });
                    } else {
                        permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        appContext.startActivity(permIntent);
                    }
                    return;
                }
            }

            pendingApkInstallFile = null;
            final Uri apkUri = FileProvider.getUriForFile(
                appContext,
                appContext.getPackageName() + ".fileprovider",
                apkFile
            );

            final Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);

            MainActivity activity = activityRef != null ? activityRef.get() : null;
            if (activity != null) {
                activity.runOnUiThread(() -> {
                    try {
                        activity.startActivity(installIntent);
                        otaStatus = "installer_opened";
                        emitCurrentState();
                    } catch (Exception ex) {
                        Log.e(TAG, "Failed launching package installer from activity", ex);
                        otaStatus = "error";
                        otaError = "Unable to open Android installer: " + ex.getMessage();
                        emitCurrentState();
                    }
                });
            } else {
                appContext.startActivity(installIntent);
                otaStatus = "installer_opened";
                emitCurrentState();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error preparing APK installer Uri", e);
            otaStatus = "error";
            otaError = "Installer error: " + (e.getMessage() != null ? e.getMessage() : e.toString());
            emitCurrentState();
        }
    }

    private static final class ReleaseCheckResult {
        final int buildNumber;
        final String downloadUrl;
        final boolean useApiOctetStream;

        ReleaseCheckResult(int buildNumber, String downloadUrl, boolean useApiOctetStream) {
            this.buildNumber = buildNumber;
            this.downloadUrl = downloadUrl;
            this.useApiOctetStream = useApiOctetStream;
        }
    }

    private boolean shouldAttachGitHubToken(URL url) {
        if (BUILD_READ_TOKEN == null || BUILD_READ_TOKEN.trim().isEmpty() || url == null) {
            return false;
        }
        String host = url.getHost() != null ? url.getHost().toLowerCase(Locale.US) : "";
        return "api.github.com".equals(host) ||
               "github.com".equals(host) ||
               "raw.githubusercontent.com".equals(host);
    }

    private HttpURLConnection openConnectionFollowRedirects(
        String initialUrl,
        int maxRedirects,
        int connectTimeoutMs,
        int readTimeoutMs,
        String acceptHeader
    ) throws Exception {
        String currentUrl = initialUrl;
        String currentAccept = (acceptHeader != null && !acceptHeader.isEmpty()) ? acceptHeader : "*/*";
        for (int hop = 0; hop <= maxRedirects; hop++) {
            URL url = new URL(currentUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(connectTimeoutMs);
            conn.setReadTimeout(readTimeoutMs);
            conn.setUseCaches(false);
            conn.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
            conn.setRequestProperty("Pragma", "no-cache");
            conn.setRequestProperty("User-Agent", "SKP-VPN-Android-Updater/1.1");
            conn.setRequestProperty("Accept", currentAccept);
            if (shouldAttachGitHubToken(url)) {
                conn.setRequestProperty("Authorization", "Bearer " + BUILD_READ_TOKEN.trim());
            }

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                code == HttpURLConnection.HTTP_MOVED_TEMP ||
                code == HttpURLConnection.HTTP_SEE_OTHER ||
                code == 307 ||
                code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new Exception("Redirect missing Location header");
                }
                URL nextUrl = new URL(url, location);
                currentUrl = nextUrl.toExternalForm();
                currentAccept = "*/*";
                continue;
            }
            return conn;
        }
        throw new Exception("Too many HTTP redirects while fetching update");
    }

    private long parseContentLength(HttpURLConnection conn) {
        try {
            String header = conn.getHeaderField("Content-Length");
            if (header != null && !header.trim().isEmpty()) {
                return Long.parseLong(header.trim());
            }
        } catch (Exception ignored) {
        }
        return conn.getContentLength();
    }

    private String readStreamUtf8(InputStream inputStream) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
            new InputStreamReader(inputStream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private int parseBuildNumberFromTag(String tag) {
        if (tag == null || tag.isEmpty()) return 0;
        try {
            String lower = tag.toLowerCase(Locale.US);
            String prefix = "debug-apk-build-";
            int idx = lower.indexOf(prefix);
            if (idx >= 0) {
                int start = idx + prefix.length();
                int end = start;
                while (end < lower.length() && Character.isDigit(lower.charAt(end))) {
                    end++;
                }
                if (end > start) {
                    return Integer.parseInt(lower.substring(start, end));
                }
            }
        } catch (Exception ignored) {
        }
        return 0;
    }

    private boolean isRepoPrivateOrUnreachable(String repo) {
        HttpURLConnection conn = null;
        try {
            String repoApiUrl = "https://api.github.com/repos/" + repo + "?t=" + System.currentTimeMillis();
            conn = openConnectionFollowRedirects(repoApiUrl, 3, 5000, 5000, "application/vnd.github+json");
            return conn.getResponseCode() == 404;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private boolean isPublicRepoReachable(String repo) {
        HttpURLConnection conn = null;
        try {
            String repoApiUrl = "https://api.github.com/repos/" + repo + "?t=" + System.currentTimeMillis();
            conn = openConnectionFollowRedirects(repoApiUrl, 3, 5000, 5000, "application/vnd.github+json");
            return conn.getResponseCode() == 200;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private ReleaseCheckResult parseReleaseJsonObject(JSONObject relObj, String repo) {
        if (relObj == null) return null;
        int buildNum = parseBuildNumberFromTag(relObj.optString("tag_name", ""));
        JSONArray assets = relObj.optJSONArray("assets");
        String downloadUrl = "https://github.com/" + repo + "/releases/latest/download/app-debug.apk";
        boolean useOctet = false;

        if (assets != null && assets.length() > 0) {
            JSONObject chosen = null;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject item = assets.optJSONObject(i);
                if (item != null && "app-debug.apk".equals(item.optString("name", ""))) {
                    chosen = item;
                    break;
                }
            }
            if (chosen == null) {
                chosen = assets.optJSONObject(0);
            }
            if (chosen != null) {
                if (BUILD_READ_TOKEN != null && !BUILD_READ_TOKEN.trim().isEmpty()) {
                    String apiAssetUrl = chosen.optString("url", "");
                    if (!apiAssetUrl.isEmpty()) {
                        downloadUrl = apiAssetUrl;
                        useOctet = true;
                    }
                } else {
                    String browserUrl = chosen.optString("browser_download_url", "");
                    if (!browserUrl.isEmpty()) {
                        downloadUrl = browserUrl;
                    }
                }
            }
        }
        return new ReleaseCheckResult(buildNum, downloadUrl, useOctet);
    }

    private ReleaseCheckResult fetchLatestReleaseMetadata(String repo) {
        HttpURLConnection latestConn = null;
        try {
            String latestUrl = "https://api.github.com/repos/" + repo + "/releases/latest?t=" + System.currentTimeMillis();
            latestConn = openConnectionFollowRedirects(latestUrl, 4, 5500, 5500, "application/vnd.github+json");
            if (latestConn.getResponseCode() == 200) {
                JSONObject obj = new JSONObject(readStreamUtf8(latestConn.getInputStream()));
                return parseReleaseJsonObject(obj, repo);
            }
        } catch (Exception ignored) {
        } finally {
            if (latestConn != null) latestConn.disconnect();
        }

        HttpURLConnection listConn = null;
        try {
            String listUrl = "https://api.github.com/repos/" + repo + "/releases?per_page=5&t=" + System.currentTimeMillis();
            listConn = openConnectionFollowRedirects(listUrl, 4, 5500, 5500, "application/vnd.github+json");
            if (listConn.getResponseCode() == 200) {
                JSONArray arr = new JSONArray(readStreamUtf8(listConn.getInputStream()));
                if (arr.length() > 0) {
                    return parseReleaseJsonObject(arr.optJSONObject(0), repo);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (listConn != null) listConn.disconnect();
        }
        return null;
    }

    private String resolveLatestOtaCommitSha(String repo) {
        HttpURLConnection apiConn = null;
        try {
            String commitApi = "https://api.github.com/repos/" + repo + "/commits/ota-live?t=" + System.currentTimeMillis();
            apiConn = openConnectionFollowRedirects(commitApi, 3, 4500, 4500, "application/vnd.github+json");
            if (apiConn.getResponseCode() == 200) {
                JSONObject obj = new JSONObject(readStreamUtf8(apiConn.getInputStream()));
                String sha = obj.optString("sha", "").trim();
                if (sha.length() >= 7) {
                    return sha;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (apiConn != null) apiConn.disconnect();
        }
        return "";
    }

    private JSONObject fetchManifestFromMirrors(String repo, String refSha) {
        long ts = System.currentTimeMillis();
        String ref = (refSha != null && refSha.length() >= 7) ? refSha : "ota-live";

        List<String[]> candidates = new ArrayList<>();
        if (BUILD_READ_TOKEN != null && !BUILD_READ_TOKEN.trim().isEmpty()) {
            candidates.add(new String[]{
                "https://api.github.com/repos/" + repo + "/contents/ota-manifest.json?ref=" + ref + "&t=" + ts,
                "application/vnd.github.raw+json"
            });
        }
        candidates.add(new String[]{
            "https://raw.githubusercontent.com/" + repo + "/" + ref + "/ota-manifest.json?t=" + ts,
            "*/*"
        });
        candidates.add(new String[]{
            "https://cdn.jsdelivr.net/gh/" + repo + "@" + ref + "/ota-manifest.json?t=" + ts,
            "*/*"
        });
        candidates.add(new String[]{
            "https://github.com/" + repo + "/releases/latest/download/ota-manifest.json?t=" + ts,
            "*/*"
        });

        for (String[] entry : candidates) {
            HttpURLConnection conn = null;
            try {
                conn = openConnectionFollowRedirects(entry[0], 6, 5500, 5500, entry[1]);
                if (conn.getResponseCode() == 200) {
                    String raw = readStreamUtf8(conn.getInputStream());
                    JSONObject parsed = new JSONObject(raw);
                    if (parsed.has("runNumber")) {
                        return parsed;
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return null;
    }

    private HttpURLConnection openFirstAvailableBundleStream(String repo, String refSha) {
        long ts = System.currentTimeMillis();
        String ref = (refSha != null && refSha.length() >= 7) ? refSha : "ota-live";

        List<String[]> candidates = new ArrayList<>();
        if (BUILD_READ_TOKEN != null && !BUILD_READ_TOKEN.trim().isEmpty()) {
            candidates.add(new String[]{
                "https://api.github.com/repos/" + repo + "/contents/ota-bundle.zip?ref=" + ref + "&t=" + ts,
                "application/vnd.github.raw+json"
            });
        }
        candidates.add(new String[]{
            "https://raw.githubusercontent.com/" + repo + "/" + ref + "/ota-bundle.zip?t=" + ts,
            "*/*"
        });
        candidates.add(new String[]{
            "https://cdn.jsdelivr.net/gh/" + repo + "@" + ref + "/ota-bundle.zip?t=" + ts,
            "*/*"
        });
        candidates.add(new String[]{
            "https://github.com/" + repo + "/releases/latest/download/ota-bundle.zip?t=" + ts,
            "*/*"
        });

        for (String[] entry : candidates) {
            try {
                HttpURLConnection conn = openConnectionFollowRedirects(entry[0], 6, 10000, 20000, entry[1]);
                if (conn.getResponseCode() == 200) {
                    return conn;
                }
                conn.disconnect();
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    public void checkForOtaUpdateAsync(final boolean forceNow) {
        if (apkDownloadInProgress.get()) {
            return;
        }
        long now = System.currentTimeMillis();
        if (!forceNow && (now - lastOtaCheckMs) < 12000L) {
            return;
        }
        if (!otaCheckInProgress.compareAndSet(false, true)) {
            return;
        }
        lastOtaCheckMs = now;

        if (forceNow) {
            otaStatus = "checking";
            otaProgress = 0;
            otaError = "";
            otaErrorCode = "";
            emitCurrentState();
        }

        otaExecutor.execute(() -> {
            try {
                SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                int currentBuild = getInstalledBuildNumber();
                String currentCommit = prefs.getString("ota_commit", "");
                String repo = getEffectiveRepo();

                String latestOtaRefSha = resolveLatestOtaCommitSha(repo);
                JSONObject manifest = fetchManifestFromMirrors(repo, latestOtaRefSha);

                if (manifest == null) {
                    // Fallback seamlessly to GitHub Releases metadata when OTA manifest is unavailable
                    ReleaseCheckResult releaseMeta = fetchLatestReleaseMetadata(repo);
                    if (releaseMeta != null && releaseMeta.buildNumber > 0) {
                        if (releaseMeta.buildNumber <= currentBuild) {
                            otaStatus = "up_to_date";
                            otaProgress = 100;
                            otaError = "";
                            otaErrorCode = "";
                            otaVersion = "v1." + currentBuild + ".0";
                            emitCurrentState();
                            return;
                        }
                        otaVersion = "v1." + releaseMeta.buildNumber + ".0";
                        if (forceNow) {
                            otaCheckInProgress.set(false);
                            downloadAndInstallApk(releaseMeta.downloadUrl);
                            return;
                        }
                        otaStatus = "idle";
                        emitCurrentState();
                        return;
                    }

                    // Check if repo is Public (meaning current installed build is already the newest) vs Private
                    if (isPublicRepoReachable(repo)) {
                        otaStatus = "up_to_date";
                        otaProgress = 100;
                        otaError = "";
                        otaErrorCode = "";
                        otaVersion = "v1." + currentBuild + ".0";
                        emitCurrentState();
                        return;
                    }

                    if (isRepoPrivateOrUnreachable(repo)) {
                        otaErrorCode = "repo_private";
                        if (forceNow) {
                            otaStatus = "repo_private";
                            otaError = "GitHub repository (" + repo + ") is currently Private. Change visibility to Public in GitHub Settings for 1-tap auto updates.";
                        } else {
                            otaStatus = "idle";
                            otaError = "";
                        }
                        emitCurrentState();
                        return;
                    }

                    if (forceNow) {
                        otaStatus = "error";
                        otaErrorCode = "network_error";
                        otaError = "Could not connect to update server. Check internet connection and try again.";
                    } else {
                        otaStatus = "idle";
                    }
                    emitCurrentState();
                    return;
                }

                int remoteRun = manifest.optInt("runNumber", 0);
                String remoteCommit = manifest.optString("commit", "");

                boolean hasNewerBuild = remoteRun > currentBuild ||
                    (remoteRun == currentBuild && !remoteCommit.isEmpty() && !currentCommit.isEmpty() && !remoteCommit.equals(currentCommit));

                if (!hasNewerBuild || remoteRun <= 0) {
                    otaStatus = "up_to_date";
                    otaProgress = 100;
                    otaError = "";
                    otaErrorCode = "";
                    otaVersion = remoteRun > 0 ? ("v1." + remoteRun + ".0") : ("v1." + currentBuild + ".0");
                    emitCurrentState();
                    return;
                }

                otaStatus = "downloading";
                otaProgress = 5;
                otaError = "";
                otaErrorCode = "";
                otaVersion = "v1." + remoteRun + ".0";
                emitCurrentState();

                File tempZip = new File(appContext.getCacheDir(), "skp_ota_download.zip");
                if (tempZip.exists()) {
                    // noinspection ResultOfMethodCallIgnored
                    tempZip.delete();
                }

                HttpURLConnection zipConn = null;
                try {
                    zipConn = openFirstAvailableBundleStream(repo, latestOtaRefSha);
                    if (zipConn == null) {
                        ReleaseCheckResult releaseMeta = fetchLatestReleaseMetadata(repo);
                        if (forceNow && releaseMeta != null && releaseMeta.buildNumber > currentBuild) {
                            otaCheckInProgress.set(false);
                            downloadAndInstallApk(releaseMeta.downloadUrl);
                            return;
                        }
                        otaStatus = forceNow ? "error" : "idle";
                        if (forceNow) {
                            otaError = "Could not download instant bundle. Try Full App Update below.";
                        }
                        emitCurrentState();
                        return;
                    }

                    long totalLen = parseContentLength(zipConn);
                    long expected = totalLen > 0 ? totalLen : 650_000L;
                    long downloaded = 0L;
                    long lastEmit = 0L;

                    try (InputStream is = new BufferedInputStream(zipConn.getInputStream());
                         FileOutputStream fos = new FileOutputStream(tempZip)) {
                        byte[] buf = new byte[16384];
                        int read;
                        while ((read = is.read(buf)) != -1) {
                            fos.write(buf, 0, read);
                            downloaded += read;
                            long tNow = System.currentTimeMillis();
                            if (tNow - lastEmit >= 120L) {
                                lastEmit = tNow;
                                otaProgress = (int) Math.min(92L, Math.max(5L, (downloaded * 90L) / expected));
                                emitCurrentState();
                            }
                        }
                        fos.getFD().sync();
                    }
                } finally {
                    if (zipConn != null) zipConn.disconnect();
                }

                File otaRoot = new File(appContext.getFilesDir(), "skp_ota_bundles");
                if (!otaRoot.exists()) {
                    // noinspection ResultOfMethodCallIgnored
                    otaRoot.mkdirs();
                }

                String folderName = "build_" + remoteRun + "_" + (remoteCommit.isEmpty() ? "latest" : remoteCommit);
                File targetDir = new File(otaRoot, folderName);
                deleteRecursive(targetDir);
                // noinspection ResultOfMethodCallIgnored
                targetDir.mkdirs();

                otaProgress = 96;
                emitCurrentState();

                extractZipSafely(tempZip, targetDir);
                // noinspection ResultOfMethodCallIgnored
                tempZip.delete();

                File indexCheck = new File(targetDir, "index.html");
                if (!indexCheck.exists() || indexCheck.length() == 0) {
                    deleteRecursive(targetDir);
                    otaStatus = forceNow ? "error" : "idle";
                    if (forceNow) {
                        otaError = "Downloaded update package was invalid.";
                    }
                    emitCurrentState();
                    return;
                }

                // Clean up older OTA folders
                File[] siblings = otaRoot.listFiles();
                if (siblings != null) {
                    for (File child : siblings) {
                        if (!child.getName().equals(folderName)) {
                            deleteRecursive(child);
                        }
                    }
                }

                prefs.edit()
                    .putInt("ota_run_number", remoteRun)
                    .putString("ota_commit", remoteCommit)
                    .putString("ota_active_dir", targetDir.getAbsolutePath())
                    .apply();

                otaProgress = 100;
                otaStatus = "applied";
                otaError = "";
                otaErrorCode = "";
                emitCurrentState();

                MainActivity activity = activityRef != null ? activityRef.get() : null;
                if (activity != null) {
                    activity.applyOtaServerBasePath(targetDir.getAbsolutePath());
                }
            } catch (Exception e) {
                Log.w(TAG, "OTA update check failed", e);
                if (forceNow) {
                    otaStatus = "error";
                    otaError = e.getMessage() != null ? e.getMessage() : "Update check failed.";
                } else {
                    otaStatus = "idle";
                }
                emitCurrentState();
            } finally {
                otaCheckInProgress.set(false);
            }
        });
    }

    private void extractZipSafely(File zipFile, File targetDir) throws Exception {
        String canonicalDest = targetDir.getCanonicalPath() + File.separator;
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[16384];
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(targetDir, entry.getName());
                String canonicalOut = outFile.getCanonicalPath();
                if (!canonicalOut.startsWith(canonicalDest)) {
                    throw new SecurityException("Blocked zip entry outside target dir: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    // noinspection ResultOfMethodCallIgnored
                    outFile.mkdirs();
                } else {
                    File parent = outFile.getParentFile();
                    if (parent != null && !parent.exists()) {
                        // noinspection ResultOfMethodCallIgnored
                        parent.mkdirs();
                    }
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        int len;
                        while ((len = zis.read(buffer)) != -1) {
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private void deleteRecursive(File fileOrDir) {
        if (fileOrDir == null || !fileOrDir.exists()) return;
        if (fileOrDir.isDirectory()) {
            File[] children = fileOrDir.listFiles();
            if (children != null) {
                for (File c : children) {
                    deleteRecursive(c);
                }
            }
        }
        // noinspection ResultOfMethodCallIgnored
        fileOrDir.delete();
    }

    private void saveConnectedSinceMs(long timestampMs) {
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putLong("wg_connected_since_ms", timestampMs).apply();
        } catch (Exception ignored) {
        }
    }

    private void handleBackendStateChange(Tunnel.State newState) {
        if (newState == Tunnel.State.DOWN && !connectingInProgress) {
            if ("CONNECTED".equals(currentState)) {
                currentState = "DISCONNECTED";
                statusDetail = "";
                connectedSinceMs = 0L;
                saveConnectedSinceMs(0L);
                currentDownMbps = 0.0;
                currentUpMbps = 0.0;
                cancelStatusNotification();
                emitCurrentState();
            }
        }
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public String getStatusJson() {
        return buildStatusJsonString();
    }

    @JavascriptInterface
    public void connect(String serverId, String serverName, String protocol, boolean bypassBanking) {
        pendingServerId = (serverId != null && !serverId.isEmpty()) ? serverId : "auto";
        pendingServerName = (serverName != null && !serverName.isEmpty()) ? serverName : "Auto select";
        pendingProtocol = (protocol != null) ? protocol : "Auto";
        pendingBypassBanking = bypassBanking;

        lastError = "";
        statusDetail = "Checking Android VPN permission...";
        currentState = "CONNECTING";
        emitCurrentState();

        MainActivity activity = activityRef != null ? activityRef.get() : null;
        if (activity == null) {
            Intent checkIntent = VpnService.prepare(appContext);
            if (checkIntent == null) {
                startTunnelAsync(pendingServerId, pendingServerName, pendingProtocol, pendingBypassBanking);
            } else {
                currentState = "DISCONNECTED";
                lastError = "Please bring SKP VPN to foreground and tap CONNECT to approve VPN.";
                emitCurrentState();
            }
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                Intent prepareIntent = VpnService.prepare(activity);
                if (prepareIntent != null) {
                    statusDetail = "Tap OK on Android's VPN prompt...";
                    emitCurrentState();
                    activity.launchVpnPermissionDialog(prepareIntent);
                } else {
                    startTunnelAsync(pendingServerId, pendingServerName, pendingProtocol, pendingBypassBanking);
                }
            } catch (Exception e) {
                Log.e(TAG, "VpnService.prepare failed", e);
                currentState = "DISCONNECTED";
                lastError = "Unable to request Android VPN permission: " + e.getMessage();
                emitCurrentState();
            }
        });
    }

    public void onVpnPermissionResult(boolean granted) {
        if (granted) {
            startTunnelAsync(pendingServerId, pendingServerName, pendingProtocol, pendingBypassBanking);
        } else {
            connectGeneration.incrementAndGet();
            connectingInProgress = false;
            currentState = "DISCONNECTED";
            statusDetail = "";
            lastError = "VPN permission cancelled. Tap CONNECT and press OK on the Android dialog.";
            emitCurrentState();
        }
    }

    @JavascriptInterface
    public void disconnect() {
        final int gen = connectGeneration.incrementAndGet();
        connectingInProgress = false;
        currentState = "DISCONNECTING";
        statusDetail = "Closing WireGuard tunnel...";
        emitCurrentState();

        tunnelExecutor.execute(() -> {
            try {
                if (sharedBackend != null && sharedTunnel != null) {
                    sharedBackend.setState(sharedTunnel, Tunnel.State.DOWN, null);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error stopping tunnel", e);
            } finally {
                if (connectGeneration.get() == gen) {
                    currentState = "DISCONNECTED";
                    statusDetail = "";
                    verifiedExitIp = "";
                    verifiedColo = "";
                    warpVerified = false;
                    activeEndpoint = "";
                    connectedSinceMs = 0L;
                    saveConnectedSinceMs(0L);
                    currentDownMbps = 0.0;
                    currentUpMbps = 0.0;
                    cancelStatusNotification();
                    emitCurrentState();
                }
            }
        });
    }

    @JavascriptInterface
    public boolean isIgnoringBatteryOptimizations() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
                return pm != null && pm.isIgnoringBatteryOptimizations(appContext.getPackageName());
            }
        } catch (Exception ignored) {
        }
        return true;
    }

    @JavascriptInterface
    public void openBatterySettings() {
        MainActivity activity = activityRef != null ? activityRef.get() : null;
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PowerManager pm = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
                    if (pm != null && !pm.isIgnoringBatteryOptimizations(appContext.getPackageName())) {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + appContext.getPackageName()));
                        activity.startActivity(intent);
                        return;
                    }
                }
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                activity.startActivity(fallback);
            } catch (Exception e) {
                try {
                    Intent appDetails = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    appDetails.setData(Uri.parse("package:" + appContext.getPackageName()));
                    activity.startActivity(appDetails);
                } catch (Exception ignored) {
                }
            }
        });
    }

    @JavascriptInterface
    public void openExternalUrl(String url) {
        if (url == null || url.isEmpty()) return;
        MainActivity activity = activityRef != null ? activityRef.get() : null;
        if (activity != null) {
            activity.runOnUiThread(() -> {
                try {
                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    activity.startActivity(browserIntent);
                } catch (Exception ignored) {
                }
            });
        } else {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                appContext.startActivity(browserIntent);
            } catch (Exception ignored) {
            }
        }
    }

    private void startTunnelAsync(
        final String serverId,
        final String serverName,
        final String protocol,
        final boolean bypassBanking
    ) {
        final int gen = connectGeneration.incrementAndGet();

        tunnelExecutor.execute(() -> {
            if (connectGeneration.get() != gen) return;

            connectingInProgress = true;
            currentState = "CONNECTING";
            activeServerId = serverId;
            activeServerName = serverName;
            lastError = "";
            verifiedExitIp = "";
            verifiedColo = "";
            warpVerified = false;
            statusDetail = "Preparing encrypted WireGuard keys...";
            emitCurrentState();

            try {
                if (sharedBackend == null) {
                    sharedBackend = new GoBackend(appContext);
                }
                if (sharedTunnel == null) {
                    sharedTunnel = new SkpTunnel();
                }

                WgCredentials creds = loadOrRegisterCredentials();
                List<String> candidateEndpoints = buildCandidateEndpoints(protocol);

                boolean connectedOk = false;
                String lastAttemptError = "";

                for (int idx = 0; idx < candidateEndpoints.size(); idx++) {
                    if (connectGeneration.get() != gen) {
                        connectingInProgress = false;
                        return;
                    }

                    String endpoint = candidateEndpoints.get(idx);
                    statusDetail = "Connecting tunnel (" + (idx + 1) + "/" + candidateEndpoints.size() + ") · " + endpoint;
                    emitCurrentState();

                    try {
                        try {
                            sharedBackend.setState(sharedTunnel, Tunnel.State.DOWN, null);
                        } catch (Exception ignored) {
                        }

                        Config wgConfig = buildWireGuardConfig(creds, endpoint, bypassBanking);
                        sharedBackend.setState(sharedTunnel, Tunnel.State.UP, wgConfig);

                        if (verifyWireGuardHandshake(gen)) {
                            connectedOk = true;
                            activeEndpoint = endpoint;
                            saveLastGoodEndpoint(endpoint);
                            break;
                        } else {
                            lastAttemptError = "No UDP response from " + endpoint;
                        }
                    } catch (Exception endpointEx) {
                        Log.w(TAG, "Endpoint attempt failed for " + endpoint, endpointEx);
                        lastAttemptError = endpointEx.getMessage() != null ? endpointEx.getMessage() : endpointEx.toString();
                    }
                }

                if (connectGeneration.get() != gen) {
                    connectingInProgress = false;
                    return;
                }

                if (!connectedOk) {
                    try {
                        sharedBackend.setState(sharedTunnel, Tunnel.State.DOWN, null);
                    } catch (Exception ignored) {
                    }
                    connectingInProgress = false;
                    currentState = "DISCONNECTED";
                    statusDetail = "";
                    lastError = "Unable to establish VPN tunnel (" + lastAttemptError + "). Check Wi-Fi or mobile data.";
                    cancelStatusNotification();
                    emitCurrentState();
                    return;
                }

                Statistics initialStats = sharedBackend.getStatistics(sharedTunnel);
                lastRxBytes = initialStats != null ? initialStats.totalRx() : 0L;
                lastTxBytes = initialStats != null ? initialStats.totalTx() : 0L;
                lastSampleTimeMs = System.currentTimeMillis();
                connectedSinceMs = System.currentTimeMillis();
                saveConnectedSinceMs(connectedSinceMs);
                currentDownMbps = 0.0;
                currentUpMbps = 0.0;
                connectingInProgress = false;
                currentState = "CONNECTED";
                statusDetail = "WireGuard System VPN Active";
                showConnectedNotification(serverName, activeEndpoint);
                emitCurrentState();

                final boolean usedFallback = !creds.dedicated;
                Executors.newSingleThreadExecutor().execute(() -> {
                    probeCloudflareTrace(gen);
                    if (usedFallback && "CONNECTED".equals(currentState)) {
                        registerDedicatedDeviceKeyInBackground();
                    }
                });
            } catch (Throwable t) {
                Log.e(TAG, "Fatal error starting WireGuard VPN", t);
                try {
                    if (sharedBackend != null && sharedTunnel != null) {
                        sharedBackend.setState(sharedTunnel, Tunnel.State.DOWN, null);
                    }
                } catch (Exception ignored) {
                }
                connectingInProgress = false;
                currentState = "DISCONNECTED";
                statusDetail = "";
                lastError = "VPN connection failed: " + (t.getMessage() != null ? t.getMessage() : t.toString());
                cancelStatusNotification();
                emitCurrentState();
            }
        });
    }

    private Config buildWireGuardConfig(
        WgCredentials creds,
        String endpointStr,
        boolean bypassBanking
    ) throws Exception {
        Interface.Builder ifaceBuilder = new Interface.Builder();
        ifaceBuilder.parsePrivateKey(creds.privateKey);
        ifaceBuilder.addAddress(InetNetwork.parse(creds.v4 + "/32"));
        if (creds.v6 != null && !creds.v6.isEmpty()) {
            try {
                ifaceBuilder.addAddress(InetNetwork.parse(creds.v6 + "/128"));
            } catch (Exception ignored) {
            }
        }
        ifaceBuilder.addDnsServer(InetAddress.getByName("1.1.1.1"));
        ifaceBuilder.addDnsServer(InetAddress.getByName("1.0.0.1"));
        ifaceBuilder.setMtu(1280);

        if (bypassBanking) {
            PackageManager pm = appContext.getPackageManager();
            for (String pkg : LOCAL_BANKING_PACKAGES) {
                try {
                    pm.getPackageInfo(pkg, 0);
                    ifaceBuilder.excludeApplication(pkg);
                } catch (Exception ignored) {
                }
            }
        }

        Peer.Builder peerBuilder = new Peer.Builder();
        peerBuilder.parsePublicKey(creds.peerPublicKey);
        peerBuilder.addAllowedIp(InetNetwork.parse("0.0.0.0/0"));
        if (creds.v6 != null && !creds.v6.isEmpty()) {
            try {
                peerBuilder.addAllowedIp(InetNetwork.parse("::/0"));
            } catch (Exception ignored) {
            }
        }
        peerBuilder.setEndpoint(InetEndpoint.parse(endpointStr));
        peerBuilder.setPersistentKeepalive(25);

        return new Config.Builder()
            .setInterface(ifaceBuilder.build())
            .addPeer(peerBuilder.build())
            .build();
    }

    private boolean verifyWireGuardHandshake(final int gen) {
        Executors.newSingleThreadExecutor().execute(() -> {
            sendUdpDnsWakePacket();
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://1.1.1.1/cdn-cgi/trace");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);
                conn.setUseCaches(false);
                int code = conn.getResponseCode();
                if (code == 200) {
                    parseTraceStream(conn, gen);
                }
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        });

        for (int i = 0; i < 10; i++) {
            if (connectGeneration.get() != gen) return false;
            try {
                Thread.sleep(380);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return false;
            }
            if (i == 3) {
                sendUdpDnsWakePacket();
            }
            try {
                Statistics stats = sharedBackend.getStatistics(sharedTunnel);
                if (stats != null && stats.totalRx() > 0) {
                    return true;
                }
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private void sendUdpDnsWakePacket() {
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setSoTimeout(800);
            byte[] dnsQuery = new byte[]{
                0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x03, 'o', 'n', 'e', 0x03, 'o', 'n', 'e', 0x03, 'o', 'n', 'e', 0x03, 'o', 'n', 'e', 0x00,
                0x00, 0x01, 0x00, 0x01
            };
            DatagramPacket pkt = new DatagramPacket(
                dnsQuery,
                dnsQuery.length,
                InetAddress.getByName("1.1.1.1"),
                53
            );
            socket.send(pkt);
        } catch (Exception ignored) {
        }
    }

    private void probeCloudflareTrace(final int gen) {
        if (connectGeneration.get() != gen || !"CONNECTED".equals(currentState)) return;
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://1.1.1.1/cdn-cgi/trace");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(4500);
            conn.setReadTimeout(4500);
            conn.setUseCaches(false);
            if (conn.getResponseCode() == 200) {
                parseTraceStream(conn, gen);
                emitCurrentState();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void parseTraceStream(HttpURLConnection conn, final int gen) {
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (connectGeneration.get() != gen) return;
                if (line.startsWith("ip=")) {
                    verifiedExitIp = line.substring(3).trim();
                } else if (line.startsWith("colo=")) {
                    verifiedColo = line.substring(5).trim();
                } else if (line.startsWith("warp=")) {
                    String val = line.substring(5).trim();
                    warpVerified = "on".equalsIgnoreCase(val) || "plus".equalsIgnoreCase(val);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private List<String> buildCandidateEndpoints(String protocol) {
        Set<String> ordered = new LinkedHashSet<>();
        SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedEndpoint = prefs.getString("last_good_endpoint", "");
        if (savedEndpoint != null && !savedEndpoint.isEmpty()) {
            ordered.add(savedEndpoint);
        }

        if (protocol != null && (protocol.contains("IKEv2") || protocol.contains("443"))) {
            ordered.add("188.114.98.224:4500");
            ordered.add("162.159.193.5:500");
            ordered.add("162.159.192.1:2408");
            ordered.add("188.114.96.1:1701");
        } else {
            ordered.add("162.159.192.1:2408");
            ordered.add("188.114.98.224:4500");
            ordered.add("162.159.193.5:500");
            ordered.add("188.114.96.1:1701");
            ordered.add("162.159.195.1:854");
        }
        ordered.add("engage.cloudflareclient.com:2408");
        return new ArrayList<>(ordered);
    }

    private void saveLastGoodEndpoint(String endpoint) {
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString("last_good_endpoint", endpoint).apply();
        } catch (Exception ignored) {
        }
    }

    private WgCredentials loadOrRegisterCredentials() {
        SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedPriv = prefs.getString("wg_priv_key", null);
        String savedPeerPub = prefs.getString("wg_peer_pub", null);
        String savedV4 = prefs.getString("wg_v4", null);
        String savedV6 = prefs.getString("wg_v6", "");
        boolean dedicated = prefs.getBoolean("wg_dedicated", false);

        if (savedPriv != null && savedPeerPub != null && savedV4 != null && dedicated) {
            return new WgCredentials(savedPriv, savedPeerPub, savedV4, savedV6, true);
        }

        WgCredentials registered = tryRegisterNewDeviceKey(prefs);
        if (registered != null) {
            return registered;
        }

        return new WgCredentials(
            FALLBACK_PRIV_KEY,
            FALLBACK_PEER_PUB_KEY,
            FALLBACK_IPV4,
            FALLBACK_IPV6,
            false
        );
    }

    private void registerDedicatedDeviceKeyInBackground() {
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            if (!prefs.getBoolean("wg_dedicated", false)) {
                tryRegisterNewDeviceKey(prefs);
            }
        } catch (Exception ignored) {
        }
    }

    private WgCredentials tryRegisterNewDeviceKey(SharedPreferences prefs) {
        HttpURLConnection conn = null;
        try {
            KeyPair keyPair = new KeyPair();
            String privBase64 = keyPair.getPrivateKey().toBase64();
            String pubBase64 = keyPair.getPublicKey().toBase64();

            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String tosIso = sdf.format(new Date());

            JSONObject body = new JSONObject();
            body.put("key", pubBase64);
            body.put("install_id", "");
            body.put("fcm_token", "");
            body.put("tos", tosIso);
            body.put("model", "Android");
            body.put("type", "Android");
            body.put("locale", "en_US");

            byte[] payloadBytes = body.toString().getBytes(StandardCharsets.UTF_8);

            URL url = new URL("https://api.cloudflareclient.com/v0a2158/reg");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(4500);
            conn.setReadTimeout(4500);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("CF-Client-Version", "a-6.30-3596");
            conn.setRequestProperty("User-Agent", "okhttp/3.12.1");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payloadBytes);
            }

            if (conn.getResponseCode() == 200) {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                )) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line);
                    }
                }

                JSONObject json = new JSONObject(sb.toString());
                JSONObject configObj = json.getJSONObject("config");
                JSONObject addressesObj = configObj.getJSONObject("interface").getJSONObject("addresses");
                String v4 = addressesObj.getString("v4");
                String v6 = addressesObj.optString("v6", "");

                JSONArray peersArr = configObj.getJSONArray("peers");
                String peerPub = peersArr.getJSONObject(0).getString("public_key");

                prefs.edit()
                    .putString("wg_priv_key", privBase64)
                    .putString("wg_peer_pub", peerPub)
                    .putString("wg_v4", v4)
                    .putString("wg_v6", v6)
                    .putBoolean("wg_dedicated", true)
                    .apply();

                return new WgCredentials(privBase64, peerPub, v4, v6, true);
            }
        } catch (Exception e) {
            Log.w(TAG, "Dynamic WireGuard key registration skipped, using fallback", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private void pollLiveTelemetry() {
        try {
            if (!"CONNECTED".equals(currentState) || sharedBackend == null || sharedTunnel == null) {
                return;
            }
            if (sharedBackend.getState(sharedTunnel) != Tunnel.State.UP) {
                if (!connectingInProgress) {
                    currentState = "DISCONNECTED";
                    connectedSinceMs = 0L;
                    saveConnectedSinceMs(0L);
                    currentDownMbps = 0.0;
                    currentUpMbps = 0.0;
                    cancelStatusNotification();
                    emitCurrentState();
                }
                return;
            }

            Statistics stats = sharedBackend.getStatistics(sharedTunnel);
            long now = System.currentTimeMillis();
            if (stats != null) {
                long rx = stats.totalRx();
                long tx = stats.totalTx();
                long elapsedMs = Math.max(250L, now - lastSampleTimeMs);

                if (lastSampleTimeMs > 0L && rx >= lastRxBytes && tx >= lastTxBytes) {
                    double rxBitsPerSec = ((rx - lastRxBytes) * 8.0 * 1000.0) / elapsedMs;
                    double txBitsPerSec = ((tx - lastTxBytes) * 8.0 * 1000.0) / elapsedMs;
                    currentDownMbps = Math.round((rxBitsPerSec / 1_000_000.0) * 100.0) / 100.0;
                    currentUpMbps = Math.round((txBitsPerSec / 1_000_000.0) * 100.0) / 100.0;
                }

                lastRxBytes = rx;
                lastTxBytes = tx;
                lastSampleTimeMs = now;
            }
            emitCurrentState();
        } catch (Exception ignored) {
        }
    }

    public void emitCurrentState() {
        final WebView webView = webViewRef != null ? webViewRef.get() : null;
        if (webView == null) return;
        final String payload = buildStatusJsonString();
        webView.post(() -> {
            try {
                webView.evaluateJavascript(
                    "if (window.__onSkpNativeVpnEvent) { window.__onSkpNativeVpnEvent(" + payload + "); }",
                    null
                );
            } catch (Exception ignored) {
            }
        });
    }

    private String buildStatusJsonString() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("state", currentState);
            obj.put("detail", statusDetail);
            obj.put("error", lastError);
            obj.put("serverId", activeServerId);
            obj.put("serverName", activeServerName);
            obj.put("endpoint", activeEndpoint);
            obj.put("exitIp", verifiedExitIp);
            obj.put("colo", verifiedColo);
            obj.put("warpVerified", warpVerified);
            obj.put("rxBytes", lastRxBytes);
            obj.put("txBytes", lastTxBytes);
            obj.put("downMbps", currentDownMbps);
            obj.put("upMbps", currentUpMbps);
            obj.put("otaStatus", otaStatus);
            obj.put("otaVersion", otaVersion);
            obj.put("otaProgress", otaProgress);
            obj.put("otaError", otaError);
            obj.put("otaErrorCode", otaErrorCode);
            obj.put("githubRepo", getEffectiveRepo());
            obj.put("installedBuild", getInstalledBuildNumber());
            long durSec = ("CONNECTED".equals(currentState) && connectedSinceMs > 0L)
                ? Math.max(0L, (System.currentTimeMillis() - connectedSinceMs) / 1000L)
                : 0L;
            obj.put("durationSec", durSec);
            obj.put("connectedSinceMs", "CONNECTED".equals(currentState) ? connectedSinceMs : 0L);
            return obj.toString();
        } catch (Exception e) {
            return "{\"state\":\"DISCONNECTED\"}";
        }
    }

    private void ensureNotificationChannel() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "SKP VPN Tunnel Status",
                        NotificationManager.IMPORTANCE_LOW
                    );
                    channel.setDescription("Shows active SKP VPN WireGuard connection status");
                    nm.createNotificationChannel(channel);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void showConnectedNotification(String serverName, String endpoint) {
        try {
            NotificationManager nm = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            Intent openIntent = new Intent(appContext, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pendingIntent = PendingIntent.getActivity(appContext, 0, openIntent, flags);

            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(appContext, CHANNEL_ID)
                : new Notification.Builder(appContext);

            long whenMs = connectedSinceMs > 0L ? connectedSinceMs : System.currentTimeMillis();

            Notification notification = builder
                .setContentTitle("SKP VPN Connected")
                .setContentText("Encrypted WireGuard Tunnel Active (" + serverName + ")")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setWhen(whenMs)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build();

            nm.notify(NOTIFICATION_ID, notification);
        } catch (Exception ignored) {
        }
    }

    private void cancelStatusNotification() {
        try {
            NotificationManager nm = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIFICATION_ID);
            }
        } catch (Exception ignored) {
        }
    }
}
