package com.yrpeng.chromaticalab;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long SPLASH_MINIMUM_MS = 1500L;
    private static final long SPLASH_TIMEOUT_MS = 6000L;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private FrameLayout splashOverlay;
    private long splashShownAt;
    private Runnable splashReadinessCheck;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showFullArtworkSplash();
        configureStatusBarInsets();
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
        super.onDestroy();
    }

    private void showFullArtworkSplash() {
        ViewGroup contentRoot = findViewById(android.R.id.content);
        splashOverlay = new FrameLayout(this);
        splashOverlay.setBackgroundColor(ContextCompat.getColor(this, R.color.chromatica_background));

        ImageView splashArtwork = new ImageView(this);
        splashArtwork.setImageResource(R.drawable.splash);
        splashArtwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
        splashArtwork.setAdjustViewBounds(false);
        splashOverlay.addView(
            splashArtwork,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

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
                boolean appPageReady = currentUrl != null
                    && !currentUrl.isEmpty()
                    && !"about:blank".equals(currentUrl)
                    && webView.getProgress() >= 100;

                if ((appPageReady && elapsed >= SPLASH_MINIMUM_MS) || elapsed >= SPLASH_TIMEOUT_MS) {
                    hideFullArtworkSplash();
                    return;
                }
                splashHandler.postDelayed(this, 50L);
            }
        };
        splashHandler.post(splashReadinessCheck);
    }

    private void hideFullArtworkSplash() {
        FrameLayout overlay = splashOverlay;
        if (overlay == null) {
            return;
        }
        splashOverlay = null;
        overlay.animate()
            .alpha(0f)
            .setDuration(180L)
            .withEndAction(() -> {
                ViewGroup parent = (ViewGroup) overlay.getParent();
                if (parent != null) {
                    parent.removeView(overlay);
                }
            })
            .start();
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
        controller.show(WindowInsetsCompat.Type.statusBars());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
    }
}
