package com.skpvpn.android;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
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

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private SkpVpnBridge vpnBridge;

    private boolean mobileAdsInitStarted = false;
    private boolean mobileAdsReady = false;
    private FrameLayout bannerAdContainer;
    private AdView inlineAdView;
    private String activeBannerUnitId = "";
    private boolean adLoaded = false;
    private boolean adLoadingInFlight = false;
    private boolean slotRequestedVisible = false;
    private float lastXCssPx = 0f;
    private float lastYCssPx = 0f;
    private float lastWidthCssPx = 320f;
    private int adRetryCount = 0;

    private final Runnable retryLoadRunnable = () -> {
        if (!isFinishing() && !isDestroyed() && !adLoaded) {
            triggerBannerAdLoad();
        }
    };

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

    private void ensureMobileAdsInitialized() {
        if (mobileAdsInitStarted) {
            return;
        }
        mobileAdsInitStarted = true;
        try {
            MobileAds.initialize(getApplicationContext(), initializationStatus -> {
                mainHandler.post(() -> {
                    mobileAdsReady = true;
                    if (!adLoaded && !adLoadingInFlight && inlineAdView != null) {
                        triggerBannerAdLoad();
                    }
                });
            });
            // Safety fallback if GMS callback takes longer than 2.2s on custom ROMs
            mainHandler.postDelayed(() -> {
                if (!mobileAdsReady) {
                    mobileAdsReady = true;
                    if (!adLoaded && !adLoadingInFlight && inlineAdView != null) {
                        triggerBannerAdLoad();
                    }
                }
            }, 2200L);
        } catch (Throwable ignored) {
            mobileAdsReady = true;
        }
    }

    private AdSize resolveInlineBannerAdSize(float widthCssPx) {
        try {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            int screenWidthDp = Math.max(300, Math.round(dm.widthPixels / dm.density));
            int requestedDp = widthCssPx > 0 ? Math.round(widthCssPx) : (screenWidthDp - 28);
            int adWidthDp = Math.max(280, Math.min(screenWidthDp, requestedDp));
            return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, adWidthDp);
        } catch (Throwable ignored) {
            return AdSize.BANNER;
        }
    }

    private void triggerBannerAdLoad() {
        try {
            if (inlineAdView == null || adLoadingInFlight) {
                return;
            }
            adLoadingInFlight = true;
            if (vpnBridge != null && !adLoaded) {
                vpnBridge.setBannerAdState(false, 0, "loading");
            }
            if (bannerAdContainer != null && !adLoaded) {
                // Keep non-GONE bounds so Google Mobile Ads SDK measures valid width/height while invisible
                bannerAdContainer.setVisibility(View.INVISIBLE);
            }
            inlineAdView.loadAd(new AdRequest.Builder().build());
        } catch (Throwable ignored) {
            adLoadingInFlight = false;
            if (vpnBridge != null) {
                vpnBridge.setBannerAdState(false, 0, "no_fill");
            }
        }
    }

    private void applyBannerCoordinates() {
        if (bannerAdContainer == null) {
            return;
        }
        try {
            ViewGroup rootContent = findViewById(android.R.id.content);
            if (rootContent == null) {
                return;
            }
            DisplayMetrics dm = getResources().getDisplayMetrics();
            float density = dm.density > 0 ? dm.density : 1f;

            int[] webLoc = new int[2];
            int[] rootLoc = new int[2];
            WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.getLocationOnScreen(webLoc);
            }
            rootContent.getLocationOnScreen(rootLoc);

            int offsetX = (webView != null) ? (webLoc[0] - rootLoc[0]) : 0;
            int offsetY = (webView != null) ? (webLoc[1] - rootLoc[1]) : 0;

            int targetWidthPx = Math.max(Math.round(280f * density), Math.round(lastWidthCssPx * density));
            ViewGroup.LayoutParams lp = bannerAdContainer.getLayoutParams();
            if (lp != null && lp.width != targetWidthPx) {
                lp.width = targetWidthPx;
                bannerAdContainer.setLayoutParams(lp);
            }

            float targetLeftPx = offsetX + (lastXCssPx * density);
            float targetTopPx = offsetY + (lastYCssPx * density);
            bannerAdContainer.setTranslationX(targetLeftPx);
            bannerAdContainer.setTranslationY(targetTopPx);

            if (adLoaded && slotRequestedVisible) {
                bannerAdContainer.setVisibility(View.VISIBLE);
            } else if (adLoadingInFlight) {
                bannerAdContainer.setVisibility(View.INVISIBLE);
            } else {
                bannerAdContainer.setVisibility(View.GONE);
            }
        } catch (Throwable ignored) {
        }
    }

    public void updateBottomBannerAd(final String requestedUnitId, final boolean visible) {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float density = dm.density > 0 ? dm.density : 1f;
        float fallbackWidthDp = Math.max(300f, (dm.widthPixels / density) - 28f);
        float fallbackYDp = Math.max(240f, (dm.heightPixels / density) - 180f);
        updateInlineBannerAd(requestedUnitId, 14f, fallbackYDp, fallbackWidthDp, visible);
    }

    public void updateInlineBannerAd(
        final String requestedUnitId,
        final float xCssPx,
        final float yCssPx,
        final float widthCssPx,
        final boolean visible
    ) {
        runOnUiThread(() -> {
            try {
                slotRequestedVisible = visible;
                if (widthCssPx > 0) {
                    lastXCssPx = xCssPx;
                    lastYCssPx = yCssPx;
                    lastWidthCssPx = widthCssPx;
                }

                final String unitId = (requestedUnitId != null && requestedUnitId.contains("/"))
                    ? requestedUnitId.trim()
                    : DEFAULT_BANNER_AD_UNIT_ID;

                ensureMobileAdsInitialized();

                ViewGroup rootContent = findViewById(android.R.id.content);
                if (rootContent == null) {
                    return;
                }

                DisplayMetrics dm = getResources().getDisplayMetrics();
                float density = dm.density > 0 ? dm.density : 1f;
                int initialWidthPx = Math.max(Math.round(280f * density), Math.round(lastWidthCssPx * density));

                if (bannerAdContainer == null) {
                    bannerAdContainer = new FrameLayout(this);
                    bannerAdContainer.setClipChildren(false);
                    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                        initialWidthPx,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.TOP | Gravity.START
                    );
                    rootContent.addView(bannerAdContainer, params);
                }

                if (inlineAdView == null || !unitId.equals(activeBannerUnitId)) {
                    if (inlineAdView != null) {
                        try {
                            bannerAdContainer.removeView(inlineAdView);
                            inlineAdView.destroy();
                        } catch (Throwable ignored) {
                        }
                    }

                    activeBannerUnitId = unitId;
                    adLoaded = false;
                    adLoadingInFlight = false;
                    adRetryCount = 0;

                    inlineAdView = new AdView(this);
                    AdSize adSize = resolveInlineBannerAdSize(lastWidthCssPx);
                    inlineAdView.setAdSize(adSize);
                    inlineAdView.setAdUnitId(unitId);
                    inlineAdView.setAdListener(new AdListener() {
                        @Override
                        public void onAdLoaded() {
                            adLoadingInFlight = false;
                            adLoaded = true;
                            adRetryCount = 0;
                            mainHandler.removeCallbacks(retryLoadRunnable);

                            int heightDp = 54;
                            try {
                                AdSize loadedSize = inlineAdView != null ? inlineAdView.getAdSize() : null;
                                if (loadedSize != null) {
                                    float d = getResources().getDisplayMetrics().density;
                                    int px = loadedSize.getHeightInPixels(MainActivity.this);
                                    if (px > 0 && d > 0) {
                                        heightDp = Math.max(50, Math.round(px / d));
                                    }
                                }
                            } catch (Throwable ignored) {
                            }

                            if (vpnBridge != null) {
                                vpnBridge.setBannerAdState(true, heightDp, "loaded");
                            }
                            applyBannerCoordinates();
                        }

                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                            adLoadingInFlight = false;
                            adLoaded = false;
                            if (vpnBridge != null) {
                                vpnBridge.setBannerAdState(false, 0, "no_fill");
                            }
                            applyBannerCoordinates();

                            long[] delaysMs = new long[]{12000L, 25000L, 45000L};
                            long delay = delaysMs[Math.min(adRetryCount, delaysMs.length - 1)];
                            adRetryCount++;
                            mainHandler.removeCallbacks(retryLoadRunnable);
                            mainHandler.postDelayed(retryLoadRunnable, delay);
                        }
                    });

                    FrameLayout.LayoutParams adParams = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        Gravity.CENTER
                    );
                    bannerAdContainer.addView(inlineAdView, adParams);
                    applyBannerCoordinates();

                    if (mobileAdsReady) {
                        triggerBannerAdLoad();
                    }
                } else {
                    applyBannerCoordinates();
                    if (visible && adLoaded) {
                        inlineAdView.resume();
                    } else if (!visible && adLoaded) {
                        inlineAdView.pause();
                    } else if (visible && !adLoaded && !adLoadingInFlight && mobileAdsReady) {
                        triggerBannerAdLoad();
                    }
                }
            } catch (Throwable ignored) {
                adLoadingInFlight = false;
                if (vpnBridge != null) {
                    vpnBridge.setBannerAdState(false, 0, "no_fill");
                }
            }
        });
    }

    public void retryBannerAdIfNeeded() {
        runOnUiThread(() -> {
            if (!adLoaded && !adLoadingInFlight && inlineAdView != null && mobileAdsReady) {
                mainHandler.removeCallbacks(retryLoadRunnable);
                triggerBannerAdLoad();
            }
        });
    }

    @Override
    public void onPause() {
        try {
            if (inlineAdView != null) {
                inlineAdView.pause();
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
            if (inlineAdView != null) {
                if (adLoaded && slotRequestedVisible) {
                    inlineAdView.resume();
                } else if (!adLoaded && !adLoadingInFlight && mobileAdsReady) {
                    triggerBannerAdLoad();
                }
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(retryLoadRunnable);
        try {
            if (inlineAdView != null) {
                inlineAdView.destroy();
                inlineAdView = null;
            }
            bannerAdContainer = null;
        } catch (Throwable ignored) {
        }
        super.onDestroy();
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
