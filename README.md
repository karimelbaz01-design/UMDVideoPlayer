# FRAME — PSP gaming and personal media hub

FRAME is an iOS project with an original, contemporary interface inspired by the feeling of handheld entertainment devices. It is designed around PLAY and WATCH, with IPTV, a built-in web browser, and a unified library.

## Product pillars

- **PLAY:** PSP game library and controller-ready experience. A real PSP game emulator core is not integrated yet; the existing UMD Video engine does not emulate PSP games.
- **WATCH:** local movies, series episodes, personal videos, direct compatible media links, and PSP UMD Video images.
- **IPTV:** import local M3U playlists or load an authorized HTTP(S) playlist URL, parse channel names/groups, mark favorites, and play compatible streams through AVPlayer.
- **FRAME Browser:** embedded WKWebView browser with search/address navigation, back/forward/reload, and controller focus navigation for many standard page controls.
- **Library and settings:** imported content, controller status, playback preferences UI, and a proposed FRAME Premium plan.
- **AirPlay:** AVPlayer can expose native external playback for compatible media. UMD Video output needs separate implementation and physical-device verification.

## Current code in this repository

- SwiftUI FRAME navigation and original dark/coral/lavender visual system.
- Import and persistence of local video files.
- Direct HTTP(S) media URL entries for AVPlayer-compatible files/streams.
- UMD Video ISO import and ISO inspection through the pinned open-source UMD Player engine.
- Initial iOS adapter for the upstream C playback core.
- IPTV M3U playlist parsing, channel groups, favorites, remote playlist loading, and AVPlayer stream playback for compatible entries.
- WKWebView browser with basic controller-driven focus movement.
- Bluetooth controller discovery and initial input bridge.

## Important limitations

A UI screen does not mean its complete engine is production-ready. PSP game emulation is not yet integrated. Not every webpage or IPTV stream can be played: provider restrictions, DRM, login, codecs, network conditions, and iOS WebKit/AVPlayer support matter. No DRM, paywall, authentication, or access-control bypass is implemented.

The Premium panel is a product concept only. There is no live advertising SDK, StoreKit purchase flow, entitlement validation, or paid feature gating. Free users should retain good playback quality; Premium may remove ads and add optional convenience and quality controls only where the source/device support them.

AirPlay via AVPlayer is intended for compatible normal media and IPTV streams. UMD Video uses a custom playback engine and needs a separate AirPlay path and testing.

## Build and validation

GitHub Actions builds the iOS Simulator target without code signing. A successful simulator build proves compilation only; it does not prove real UMD playback, PSP game emulation, controller mapping, AirPlay, IPTV provider compatibility, or installation on a physical iPhone.

See:
- [Media platform architecture](docs/MEDIA_PLATFORM_ARCHITECTURE.md)
- [iOS port status](docs/IOS_PORT_STATUS.md)

## Licensing and content

Users provide their own media, playlists, and game images and must have the rights or authorization to use them. FRAME does not bundle copyrighted games or films. Review each upstream engine's license and notices before distributing builds. The current UMD Video engine is MIT-licensed with an ATRAC3plus component under LGPL-2.1-or-later; preserve required notices and source availability.

FRAME is an independent project and is not affiliated with Sony.
