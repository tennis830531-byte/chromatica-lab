package com.yrpeng.chromaticalab;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
