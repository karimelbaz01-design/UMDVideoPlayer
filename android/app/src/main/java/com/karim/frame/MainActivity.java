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
import android.database.Cursor;
import android.provider.OpenableColumns;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler;
import androidx.webkit.WebViewClientCompat;

public final class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> pendingFiles;
    private static final int FILE_REQUEST = 27;
    private static final int DISC_REQUEST = 28;
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
        if (requestCode == DISC_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) inspectDisc(data.getData());
            return;
        }
        if (requestCode != FILE_REQUEST || pendingFiles == null) return;
        pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        pendingFiles = null;
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
        String escaped = org.json.JSONObject.quote(message);
        webView.evaluateJavascript("document.getElementById('discReport').textContent=" + escaped + ";", null);
    }

    @Override public void onBackPressed() {
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
        webView.destroy();
        super.onDestroy();
    }
}
