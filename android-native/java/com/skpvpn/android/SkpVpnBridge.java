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

    private static final String OTA_MANIFEST_URL = "https://raw.githubusercontent.com/shahidpitafiskp-ui/Skp-vpn/ota-live/ota-manifest.json";
    private static final String OTA_BUNDLE_URL = "https://raw.githubusercontent.com/shahidpitafiskp-ui/Skp-vpn/ota-live/ota-bundle.zip";

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

    private volatile String otaStatus = "idle";
    private volatile String otaVersion = "";
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
                    connectedSinceMs = System.currentTimeMillis();
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
        SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int otaRun = prefs.getInt("ota_run_number", 0);
        return Math.max(getApkVersionCode(), otaRun);
    }

    @JavascriptInterface
    public void triggerOtaUpdateCheck() {
        checkForOtaUpdateAsync(true);
    }

    public void checkForOtaUpdateAsync(final boolean forceNow) {
        long now = System.currentTimeMillis();
        if (!forceNow && (now - lastOtaCheckMs) < 15000L) {
            return;
        }
        if (!otaCheckInProgress.compareAndSet(false, true)) {
            return;
        }
        lastOtaCheckMs = now;

        otaExecutor.execute(() -> {
            HttpURLConnection manifestConn = null;
            try {
                SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                int currentBuild = getInstalledBuildNumber();
                String currentCommit = prefs.getString("ota_commit", "");

                URL mUrl = new URL(OTA_MANIFEST_URL + "?t=" + System.currentTimeMillis());
                manifestConn = (HttpURLConnection) mUrl.openConnection();
                manifestConn.setConnectTimeout(5000);
                manifestConn.setReadTimeout(5000);
                manifestConn.setUseCaches(false);
                manifestConn.setRequestProperty("Cache-Control", "no-cache");

                if (manifestConn.getResponseCode() != 200) {
                    otaStatus = "idle";
                    emitCurrentState();
                    return;
                }

                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(manifestConn.getInputStream(), StandardCharsets.UTF_8)
                )) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line);
                    }
                }

                JSONObject manifest = new JSONObject(sb.toString());
                int remoteRun = manifest.optInt("runNumber", 0);
                String remoteCommit = manifest.optString("commit", "");

                boolean hasNewerBuild = remoteRun > currentBuild ||
                    (remoteRun == currentBuild && !remoteCommit.isEmpty() && !currentCommit.isEmpty() && !remoteCommit.equals(currentCommit));

                if (!hasNewerBuild || remoteRun <= 0) {
                    otaStatus = "up_to_date";
                    otaVersion = remoteRun > 0 ? ("v1." + remoteRun + ".0") : "";
                    emitCurrentState();
                    return;
                }

                otaStatus = "downloading";
                otaVersion = "v1." + remoteRun + ".0";
                emitCurrentState();

                File tempZip = new File(appContext.getCacheDir(), "skp_ota_download.zip");
                if (tempZip.exists()) {
                    // noinspection ResultOfMethodCallIgnored
                    tempZip.delete();
                }

                HttpURLConnection zipConn = null;
                try {
                    URL zUrl = new URL(OTA_BUNDLE_URL + "?t=" + System.currentTimeMillis());
                    zipConn = (HttpURLConnection) zUrl.openConnection();
                    zipConn.setConnectTimeout(10000);
                    zipConn.setReadTimeout(15000);
                    zipConn.setUseCaches(false);

                    if (zipConn.getResponseCode() != 200) {
                        otaStatus = "idle";
                        emitCurrentState();
                        return;
                    }

                    try (InputStream is = new BufferedInputStream(zipConn.getInputStream());
                         FileOutputStream fos = new FileOutputStream(tempZip)) {
                        byte[] buf = new byte[16384];
                        int read;
                        while ((read = is.read(buf)) != -1) {
                            fos.write(buf, 0, read);
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

                extractZipSafely(tempZip, targetDir);
                // noinspection ResultOfMethodCallIgnored
                tempZip.delete();

                File indexCheck = new File(targetDir, "index.html");
                if (!indexCheck.exists() || indexCheck.length() == 0) {
                    deleteRecursive(targetDir);
                    otaStatus = "idle";
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

                otaStatus = "applied";
                emitCurrentState();

                MainActivity activity = activityRef != null ? activityRef.get() : null;
                if (activity != null) {
                    activity.applyOtaServerBasePath(targetDir.getAbsolutePath());
                }
            } catch (Exception e) {
                Log.w(TAG, "OTA update check skipped", e);
                otaStatus = "idle";
                emitCurrentState();
            } finally {
                if (manifestConn != null) manifestConn.disconnect();
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

    private void handleBackendStateChange(Tunnel.State newState) {
        if (newState == Tunnel.State.DOWN && !connectingInProgress) {
            if ("CONNECTED".equals(currentState)) {
                currentState = "DISCONNECTED";
                statusDetail = "";
                connectedSinceMs = 0L;
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
            obj.put("installedBuild", getInstalledBuildNumber());
            long durSec = ("CONNECTED".equals(currentState) && connectedSinceMs > 0L)
                ? Math.max(0L, (System.currentTimeMillis() - connectedSinceMs) / 1000L)
                : 0L;
            obj.put("durationSec", durSec);
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

            Notification notification = builder
                .setContentTitle("SKP VPN Connected")
                .setContentText("Encrypted WireGuard Tunnel Active (" + serverName + ")")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
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
