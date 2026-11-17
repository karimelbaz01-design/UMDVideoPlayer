package com.karim.frame;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.os.ParcelFileDescriptor;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler;
import androidx.webkit.WebViewClientCompat;

public final class MainActivity extends Activity {
    private WebView webView;
    private final java.util.concurrent.ExecutorService discWorker = java.util.concurrent.Executors.newSingleThreadExecutor();
    private ValueCallback<Uri[]> pendingFiles;
    private static final int FILE_REQUEST = 27;
    private static final int DISC_REQUEST = 28;
    private static final int VIDEO_REQUEST = 29;
    private android.widget.FrameLayout previewLayer;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff090b12);
        getWindow().setNavigationBarColor(0xff090b12);
        webView = new WebView(this);
        webView.setBackgroundColor(0xff090b12);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new AssetsPathHandler(this))
            .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("appassets.androidplatform.net".equals(url.getHost()) && "https".equals(url.getScheme())) return false;
                if ("https".equals(url.getScheme()) || "http".equals(url.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
                }
                return true;
            }
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_REQUEST);
                    return true;
                } catch (Exception ex) {
                    pendingFiles = null;
                    return false;
                }
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                setContentView(view);
            }
            @Override public void onHideCustomView() {
                if (fullscreenView == null) return;
                setContentView(webView);
                fullscreenView = null;
                if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
                fullscreenCallback = null;
            }
        });
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface public void previewUmd() {
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.setType("*/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, VIDEO_REQUEST);
                });
            }
            @JavascriptInterface public void pickDisc() {
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.setType("*/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, DISC_REQUEST);
                });
            }
        }, "FrameNative");
        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/assets/frame/index.html");
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == VIDEO_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null)
                startUmdPreview(data.getData());
            return;
        }
        if (requestCode == DISC_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                final Uri selected = data.getData();
                showDiscReport("Analisi nativa in corso…");
                discWorker.execute(() -> inspectDisc(selected));
            }
            return;
        }
        if (requestCode != FILE_REQUEST || pendingFiles == null) return;
        pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        pendingFiles = null;
    }

    private void startUmdPreview(Uri uri) {
        android.widget.FrameLayout layer = new android.widget.FrameLayout(this);
        layer.setBackgroundColor(android.graphics.Color.BLACK);
        android.view.SurfaceView surface = new android.view.SurfaceView(this);
        layer.addView(surface, new android.widget.FrameLayout.LayoutParams(-1, -1));
        android.widget.Button close = new android.widget.Button(this);
        close.setText("CHIUDI ANTEPRIMA");
        android.widget.FrameLayout.LayoutParams controls =
            new android.widget.FrameLayout.LayoutParams(-2, -2, android.view.Gravity.TOP | android.view.Gravity.RIGHT);
        layer.addView(close, controls);
        close.setOnClickListener(v -> closeUmdPreview());
        previewLayer = layer;
        setContentView(layer);
        surface.getHolder().addCallback(new android.view.SurfaceHolder.Callback() {
            @Override public void surfaceCreated(android.view.SurfaceHolder holder) {
                discWorker.execute(() -> {
                    String result;
                    try (ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "r")) {
                        if (descriptor == null || descriptor.getStatSize() < 0)
                            throw new IllegalStateException("File non accessibile");
                        result = DiscEngine.previewVideo(descriptor.getFd(),
                            descriptor.getStatSize(), holder.getSurface());
                    } catch (Exception e) {
                        result = "Anteprima non riuscita: " + e.getMessage();
                    }
                    final String report = result;
                    runOnUiThread(() -> android.widget.Toast.makeText(MainActivity.this, report,
                        android.widget.Toast.LENGTH_LONG).show());
                });
            }
            @Override public void surfaceChanged(android.view.SurfaceHolder holder, int format, int width, int height) {}
            @Override public void surfaceDestroyed(android.view.SurfaceHolder holder) {}
        });
    }

    private void closeUmdPreview() {
        if (previewLayer != null) {
            previewLayer = null;
            setContentView(webView);
        }
    }

    private void inspectDisc(Uri uri) {
        String message;
        try (ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "r")) {
            if (descriptor == null) throw new IllegalStateException("Cannot open file");
            long size = descriptor.getStatSize();
            if (size < 0) throw new IllegalStateException("File size unavailable; select a local ISO/CSO file");
            message = DiscEngine.inspect(descriptor.getFd(), size);
        } catch (Exception error) {
            message = "Disc inspection failed: " + error.getMessage();
        }
        showDiscReport(message);
    }

    private void showDiscReport(String message) {
        String escaped = org.json.JSONObject.quote(message);
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(
                "document.getElementById('discReport').textContent=" + escaped + ";", null);
        });
    }

    @Override public void onBackPressed() {
        if (previewLayer != null) { closeUmdPreview(); return; }
        if (fullscreenView != null) {
            setContentView(webView);
            fullscreenView = null;
            if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
            return;
        }
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingFiles != null) { pendingFiles.onReceiveValue(null); pendingFiles = null; }
        discWorker.shutdownNow();
        webView.destroy();
        super.onDestroy();
    }
}
