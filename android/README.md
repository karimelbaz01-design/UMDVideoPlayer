# FRAME Android — first native package

This is a separate Android development branch; the original iOS project on main is untouched.

The APK packages the existing FRAME web UI in a native Android WebView. Local video files, supported IPTV links, browser-based features and metadata inspection use the existing web implementation. File selection is wired to Android's system picker. A successful APK build is **not** proof that PSP games or UMD Video ISO movies play.

## Build
Run the GitHub Action **Build FRAME Android APK** on branch `android/frame-port`, or from `android/` run `gradle :app:assembleDebug` with Android SDK 35 and Java 17.

## Known missing features
- PPSSPP native core is not linked; PSP ISO/CSO files cannot execute.
- UMDVideoCore is not yet compiled into an Android NDK library; UMD movie ISO playback is not implemented.
- Chromecast, Android MediaSession, persistent content URI permissions, and a native browser controller layer need separate development.
- No Android device runtime test has yet been performed.

The build intentionally preserves FRAME's existing web appearance and capabilities instead of pretending that metadata scanning equals emulation.

## Older Samsung Galaxy devices

Minimum supported Android API is 21 (Android 5.0), including 32-bit `armeabi-v7a` devices such as an updated Galaxy S5. The original Galaxy S5 firmware with Android 4.4 (API 19) is not supported by this build. Both `armeabi-v7a` and `arm64-v8a` native ABIs are packaged; Android System WebView must be recent enough for the web UI. Building an APK does not establish on-device runtime compatibility.
