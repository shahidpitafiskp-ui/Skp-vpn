package com.skpvpn.android;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import java.io.File;

public class MainActivity extends BridgeActivity {
    public static final int VPN_PERMISSION_REQUEST_CODE = 7910;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 7911;
    private static final String DEFAULT_BANNER_AD_UNIT_ID = "ca-app-pub-9297540107285222/7061748625";

    private SkpVpnBridge vpnBridge;
    private boolean mobileAdsInitialized = false;
    private FrameLayout bannerAdContainer;
    private AdView bottomAdView;
    private String activeBannerUnitId = "";

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
    public void onPause() {
        try {
            if (bottomAdView != null) {
                bottomAdView.pause();
            }
        } catch (Throwable ignored) {
        }
        super.onPause();
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
        try {
            if (bottomAdView != null && bannerAdContainer != null && bannerAdContainer.getVisibility() == View.VISIBLE) {
                bottomAdView.resume();
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onDestroy() {
        try {
            if (bottomAdView != null) {
                bottomAdView.destroy();
                bottomAdView = null;
            }
            bannerAdContainer = null;
        } catch (Throwable ignored) {
        }
        super.onDestroy();
    }

    public void updateBottomBannerAd(final String requestedUnitId, final boolean visible) {
        runOnUiThread(() -> {
            try {
                if (!visible) {
                    if (bannerAdContainer != null) {
                        bannerAdContainer.setVisibility(View.GONE);
                    }
                    if (bottomAdView != null) {
                        bottomAdView.pause();
                    }
                    return;
                }

                final String unitId = (requestedUnitId != null && requestedUnitId.contains("/"))
                    ? requestedUnitId.trim()
                    : DEFAULT_BANNER_AD_UNIT_ID;

                if (!mobileAdsInitialized) {
                    mobileAdsInitialized = true;
                    MobileAds.initialize(getApplicationContext(), initializationStatus -> {});
                }

                ViewGroup rootContent = findViewById(android.R.id.content);
                if (rootContent == null) {
                    return;
                }

                if (bannerAdContainer == null) {
                    bannerAdContainer = new FrameLayout(this);
                    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
                    );
                    rootContent.addView(bannerAdContainer, params);
                }

                if (bottomAdView == null || !unitId.equals(activeBannerUnitId)) {
                    if (bottomAdView != null) {
                        try {
                            bannerAdContainer.removeView(bottomAdView);
                            bottomAdView.destroy();
                        } catch (Throwable ignored) {
                        }
                    }

                    activeBannerUnitId = unitId;
                    bottomAdView = new AdView(this);
                    bottomAdView.setAdSize(AdSize.BANNER);
                    bottomAdView.setAdUnitId(unitId);
                    bottomAdView.setAdListener(new AdListener() {
                        @Override
                        public void onAdLoaded() {
                            if (bannerAdContainer != null) {
                                bannerAdContainer.setVisibility(View.VISIBLE);
                            }
                            if (vpnBridge != null) {
                                vpnBridge.setBannerAdLoaded(true);
                            }
                        }

                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                            if (vpnBridge != null) {
                                vpnBridge.setBannerAdLoaded(false);
                            }
                        }
                    });

                    FrameLayout.LayoutParams adParams = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
                    );
                    bannerAdContainer.addView(bottomAdView, adParams);
                    bannerAdContainer.setVisibility(View.VISIBLE);
                    bottomAdView.loadAd(new AdRequest.Builder().build());
                } else {
                    bannerAdContainer.setVisibility(View.VISIBLE);
                    bottomAdView.resume();
                }
            } catch (Throwable ignored) {
                if (vpnBridge != null) {
                    vpnBridge.setBannerAdLoaded(false);
                }
            }
        });
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
