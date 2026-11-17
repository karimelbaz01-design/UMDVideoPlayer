# iOS port status

Last updated: 2026-11-17.

## Implemented in the repository

- Pinned upstream UMD Video engine submodule: `UMDVideoCore`.
- SwiftUI FRAME interface and navigation for Home, PLAY, WATCH, Library, Web, IPTV, and Settings.
- Import of local video files and ISO images into the app's Documents directory.
- Library reconstruction from Documents on launch.
- Preliminary ISO-9660 scanner for the `UMD_VIDEO` directory, `PLAYLIST.UMD`, and MPS stream files, with bounded directory reads.
- C bridge for the UMD engine lifecycle (`app_init`, `app_frame`, and `app_shutdown`).
- iOS UIView surface receiving the engine's video, subtitle, and UI layers.
- Touch input mapped to the engine's 960x544 coordinate space.
- AVPlayer playback path for supported local files, direct media URLs, and compatible HLS sources.
- IPTV M3U playlist parsing, group labels, favorites, local persistence, remote HTTP(S) playlist loading, and response-size/status validation.
- Embedded WKWebView browser for ordinary web navigation.
- GameController discovery and preliminary Bluetooth input mapping.
- Native AVPlayer Picture in Picture configuration for compatible AVPlayer content.
- GitHub Actions workflow for an unsigned iOS Simulator build.

## Validation status (do not overstate)

- Last confirmed successful simulator build in the recorded workflow history: commit `e0f9e5f` (2026-11-17).
- Commit `3bc457f` adds a guard that prevents unrecognized ISO images from being launched in the UMD player. Its simulator workflow was queued when this document was last updated; it is not yet verified.
- The earlier workflow attempt for commit `a8374c5` was cancelled, not a confirmed source-code build failure.
- No successful playback session has yet been confirmed on a physical iPhone.
- UMD Video PiP is not implemented.
- PSP game emulation is not integrated. The controller manager is not proof of game input support.
- App Store signing, installation, and distribution are not configured or verified.

## Feature status

| Capability | Current status |
| --- | --- |
| FRAME navigation and visual interface | UI implemented |
| Local video import and AVPlayer playback | Implemented; device testing pending |
| Direct media URL playback | Implemented for compatible direct sources; device testing pending |
| IPTV M3U import and AVPlayer playback | Implemented for compatible streams; device testing pending |
| Embedded browser | UI and WKWebView navigation implemented; site-specific playback varies |
| UMD ISO import and structural inspection | Implemented; compatibility testing pending |
| UMD Video playback engine | Integrated in the iOS target; actual playback not yet verified on iPhone |
| UMD Video Picture in Picture | Not implemented |
| PSP game emulation | Not integrated |
| Bluetooth controller discovery | Implemented at the iOS API level; physical controller mapping not validated |
| Native AVPlayer PiP | Configured; physical-device testing pending |
| App signing and distribution | Not configured |

## Immediate engineering sequence

1. Keep the latest simulator build green and resolve compiler/linker issues before expanding the codebase.
2. Test local video import, persistence, playback, and IPTV playlist handling on a physical iPhone.
3. Test a known-good, user-owned or otherwise authorized UMD Video ISO on a physical iPhone.
4. Verify UMD startup, audio, subtitles, touch navigation, pause/resume, chapter/title selection, exit, and reopening.
5. Investigate a dedicated UMD PiP path using decoded frames and iOS sample-buffer display APIs without replacing the UMD engine's decoder or renderer. This remains a design investigation until implemented and tested.
6. Evaluate PPSSPP as a separate PSP game engine. Review its iOS build integration, GPL-2.0-or-later obligations, controller input, touch controls, and save handling before adding it.
7. Configure a repeatable, legitimate iOS signing/install path before claiming the app is installable.

## Platform notes

The upstream UMD engine's platform interface requires ISO file access, POSIX threads/time/data storage, H.264 decoding, audio output, frame presentation, text glyphs, input, and device status. The iOS adapter currently uses upstream POSIX, the included software video decoder, and AudioQueue implementation as an initial compatibility strategy. This is not proof of full iOS compatibility.

The video presentation path currently converts decoded pixel buffers into Core Graphics images for display. This is simple but may need optimization after correctness and performance are measured.

The iOS target uses a direct-ISO engine entry point, so it attempts to play the selected image without requiring the PSP XMB or Sony firmware.

## Device test checklist

- [ ] Import a local MP4/MOV file and confirm it remains in the library after relaunch.
- [ ] Play, pause, seek, exit, and resume a supported local video.
- [ ] Test native AVPlayer PiP and AirPlay with a compatible source.
- [ ] Import a small authorized M3U playlist and verify channel names, groups, and favorites.
- [ ] Play a compatible authorized IPTV stream.
- [ ] Navigate ordinary websites in the embedded browser.
- [ ] Import a known-good UMD Video ISO and confirm structural inspection.
- [ ] Test UMD video, audio, subtitles, menu navigation, and exit.
- [ ] Test UMD PiP only after a dedicated implementation exists.
- [ ] Test Bluetooth controller discovery and every mapped input.
- [ ] Test a PSP game only after the separate emulator core is integrated.

A simulator build is a compile check only. Do not mark playback as working until a known-good source has been opened and tested on a physical iPhone.
