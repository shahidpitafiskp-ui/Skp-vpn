package com.skpvpn.android;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    public static final int VPN_PERMISSION_REQUEST_CODE = 7910;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 7911;

    private SkpVpnBridge vpnBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        vpnBridge = SkpVpnBridge.getInstance(this);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            webView.addJavascriptInterface(vpnBridge, "SkpNativeVpn");
            vpnBridge.attachActivity(this, webView);
            purgeStaleServiceWorkers(webView);

            String savedOtaDir = vpnBridge.getActiveValidOtaDir();
            if (savedOtaDir != null) {
                getBridge().setServerBasePath(savedOtaDir);
            } else {
                webView.clearCache(true);
                webView.reload();
            }
        }

        requestPostNotificationsIfNeeded();
        vpnBridge.checkForOtaUpdateAsync(false);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (vpnBridge != null) {
            WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
            vpnBridge.attachActivity(this, webView);
            vpnBridge.resumePendingApkInstallIfAllowed();
            vpnBridge.emitCurrentState();
            vpnBridge.checkForOtaUpdateAsync(false);
        }
    }

    public void applyOtaServerBasePath(final String basePath) {
        runOnUiThread(() -> {
            try {
                if (getBridge() != null && basePath != null) {
                    File indexFile = new File(basePath, "index.html");
                    if (indexFile.exists() && indexFile.length() > 0) {
                        WebView webView = getBridge().getWebView();
                        if (webView != null) {
                            webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
                            purgeStaleServiceWorkers(webView);
                            webView.clearCache(true);
                        }
                        getBridge().setServerBasePath(basePath);
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void purgeStaleServiceWorkers(WebView webView) {
        if (webView == null) return;
        try {
            String cleanupJs =
                "(function(){try{" +
                "if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){for(var i=0;i<r.length;i++){r[i].unregister();}}).catch(function(){});}" +
                "if('caches' in window){caches.keys().then(function(k){for(var j=0;j<k.length;j++){caches.delete(k[j]);}}).catch(function(){});}" +
                "}catch(e){}})();";
            webView.evaluateJavascript(cleanupJs, null);
        } catch (Exception ignored) {
        }
    }

    public void launchVpnPermissionDialog(Intent prepareIntent) {
        startActivityForResult(prepareIntent, VPN_PERMISSION_REQUEST_CODE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == VPN_PERMISSION_REQUEST_CODE) {
            if (vpnBridge != null) {
                vpnBridge.onVpnPermissionResult(resultCode == Activity.RESULT_OK);
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void requestPostNotificationsIfNeeded() {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, NOTIFICATION_PERMISSION_REQUEST_CODE);
                }
            }
        } catch (Exception ignored) {
            // Optional notification permission
        }
    }
}
