package com.skpvpn.android;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

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
            webView.addJavascriptInterface(vpnBridge, "SkpNativeVpn");
            vpnBridge.attachActivity(this, webView);
            webView.reload();
        }

        requestPostNotificationsIfNeeded();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (vpnBridge != null) {
            WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
            vpnBridge.attachActivity(this, webView);
            vpnBridge.emitCurrentState();
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
