package com.yrpeng.chromaticalab;

import android.content.res.ColorStateList;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONArray;
import org.json.JSONException;

public class MainActivity extends BridgeActivity {
    private static final long SPLASH_MINIMUM_MS = 1500L;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private FrameLayout splashOverlay;
    private ProgressBar startupProgressBar;
    private long splashShownAt;
    private Runnable splashReadinessCheck;
    private boolean fullArtworkSplashActive;
    private boolean splashDismissStarted;
    private boolean appPageReady;
    private boolean webAuthReady;
    private boolean webWorkspaceReady;
    private boolean webImagesReady;
    private boolean webReadinessCheckPending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureStatusBarInsets();
        showFullArtworkSplash();
        applySystemBarMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applySystemBarMode();
        }
    }

    @Override
    public void onDestroy() {
        if (splashReadinessCheck != null) {
            splashHandler.removeCallbacks(splashReadinessCheck);
        }
        if (splashOverlay != null) {
            splashOverlay.animate().cancel();
        }
        super.onDestroy();
    }

    private void showFullArtworkSplash() {
        fullArtworkSplashActive = true;
        splashDismissStarted = false;
        ViewGroup contentRoot = findViewById(android.R.id.content);
        splashOverlay = new FrameLayout(this);
        splashOverlay.setBackgroundColor(ContextCompat.getColor(this, R.color.chromatica_splash_background));

        ImageView splashArtwork = new ImageView(this);
        splashArtwork.setImageResource(R.drawable.splash_art_portrait);
        splashArtwork.setAdjustViewBounds(false);
        configureSplashArtworkFit(splashArtwork);
        splashOverlay.addView(
            splashArtwork,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        startupProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        startupProgressBar.setIndeterminate(false);
        startupProgressBar.setMax(100);
        startupProgressBar.setProgress(0);
        startupProgressBar.setProgressTintList(
            ColorStateList.valueOf(ContextCompat.getColor(this, R.color.chromatica_splash_progress))
        );
        startupProgressBar.setProgressBackgroundTintList(
            ColorStateList.valueOf(ContextCompat.getColor(this, R.color.chromatica_splash_progress_track))
        );
        FrameLayout.LayoutParams progressLayoutParams = new FrameLayout.LayoutParams(
            dpToPx(184),
            dpToPx(4),
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
        );
        progressLayoutParams.bottomMargin = dpToPx(54);
        splashOverlay.addView(startupProgressBar, progressLayoutParams);

        contentRoot.addView(
            splashOverlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        splashOverlay.bringToFront();
        splashShownAt = SystemClock.uptimeMillis();

        WebView webView = bridge.getWebView();
        splashReadinessCheck = new Runnable() {
            @Override
            public void run() {
                if (splashOverlay == null || isFinishing() || isDestroyed()) {
                    return;
                }

                long elapsed = SystemClock.uptimeMillis() - splashShownAt;
                String currentUrl = webView.getUrl();
                appPageReady = currentUrl != null
                    && !currentUrl.isEmpty()
                    && !"about:blank".equals(currentUrl)
                    && webView.getProgress() >= 100;

                if (appPageReady) {
                    requestWebStartupState(webView);
                }
                finishStartupSplash();
            }
        };
        splashHandler.post(splashReadinessCheck);
    }

    private void requestWebStartupState(WebView webView) {
        if (webReadinessCheckPending || splashDismissStarted) {
            return;
        }
        webReadinessCheckPending = true;
        webView.evaluateJavascript(
            "(function(){var s=window.chromaticaStartupState;if(!s){return ['pending','pending','pending',0];}"
                + "return [String(s.authStatus||'pending'),String(s.workspaceStatus||'pending'),"
                + "String(s.imagesStatus||'pending'),Math.max(0,Math.min(100,Number(s.imageProgress)||0))];})()",
            value -> {
                webReadinessCheckPending = false;
                if (splashDismissStarted || value == null) {
                    return;
                }
                try {
                    JSONArray readiness = new JSONArray(value);
                    String authStatus = readiness.optString(0, "pending");
                    String workspaceStatus = readiness.optString(1, "pending");
                    String imagesStatus = readiness.optString(2, "pending");
                    webAuthReady = "authenticated".equals(authStatus)
                        || "unauthenticated".equals(authStatus)
                        || "error".equals(authStatus);
                    webWorkspaceReady = "ready".equals(workspaceStatus)
                        || "not-required".equals(workspaceStatus)
                        || "error".equals(workspaceStatus);
                    webImagesReady = "ready".equals(imagesStatus)
                        || "timeout".equals(imagesStatus)
                        || "error".equals(imagesStatus);
                    if (startupProgressBar != null) {
                        startupProgressBar.setProgress(readiness.optInt(3, 0), true);
                    }
                } catch (JSONException ignored) {
                    webAuthReady = false;
                    webWorkspaceReady = false;
                    webImagesReady = false;
                }
            }
        );
    }

    private void finishStartupSplash() {
        if (splashOverlay == null || splashDismissStarted) {
            return;
        }
        long elapsed = SystemClock.uptimeMillis() - splashShownAt;
        boolean minimumReached = elapsed >= SPLASH_MINIMUM_MS;
        boolean destinationReady = appPageReady && webAuthReady && webWorkspaceReady;
        if (!minimumReached || !destinationReady || !webImagesReady) {
            splashHandler.removeCallbacks(splashReadinessCheck);
            splashHandler.postDelayed(splashReadinessCheck, 50L);
            return;
        }
        splashHandler.removeCallbacks(splashReadinessCheck);
        hideFullArtworkSplash();
    }

    private void hideFullArtworkSplash() {
        FrameLayout overlay = splashOverlay;
        if (overlay == null || splashDismissStarted) {
            return;
        }
        splashDismissStarted = true;
        overlay.animate()
            .alpha(0f)
            .setDuration(180L)
            .withEndAction(() -> {
                ViewGroup parent = (ViewGroup) overlay.getParent();
                if (parent != null) {
                    parent.removeView(overlay);
                }
                splashOverlay = null;
                startupProgressBar = null;
                fullArtworkSplashActive = false;
                splashReadinessCheck = null;
                applySystemBarMode();
                ViewCompat.requestApplyInsets(bridge.getWebView());
                bridge.getWebView().evaluateJavascript(
                    "window.chromaticaStartupSplashFinished=true;"
                        + "window.dispatchEvent(new CustomEvent('chromatica:startup-splash-finished'));",
                    null
                );
            })
            .start();
    }

    private int dpToPx(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void configureSplashArtworkFit(ImageView imageView) {
        imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
    }

    private void configureStatusBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View webView = bridge.getWebView();
        ViewGroup.MarginLayoutParams initialLayoutParams = (ViewGroup.MarginLayoutParams) webView.getLayoutParams();
        int initialTopMargin = initialLayoutParams.topMargin;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets topInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            ViewGroup.MarginLayoutParams layoutParams = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
            int targetTopMargin = initialTopMargin + topInsets.top;
            if (layoutParams.topMargin != targetTopMargin) {
                layoutParams.topMargin = targetTopMargin;
                view.setLayoutParams(layoutParams);
            }
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void applySystemBarMode() {
        int appBackground = ContextCompat.getColor(this, R.color.chromatica_background);
        getWindow().setStatusBarColor(appBackground);
        getWindow().getDecorView().setBackgroundColor(appBackground);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (fullArtworkSplashActive) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            return;
        }
        controller.show(WindowInsetsCompat.Type.statusBars());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
    }
}
