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
