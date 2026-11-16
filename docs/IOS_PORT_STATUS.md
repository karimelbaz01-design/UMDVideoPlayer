# iOS port status

Last engineering focus: make the native UMD Player engine callable from the SwiftUI iOS app, then establish a repeatable build and device-test path.

## Implemented in the repository

- Pinned upstream engine submodule: `UMDVideoCore`.
- SwiftUI library with modern and PSP-inspired views.
- ISO import to the app's Documents directory.
- Library reconstruction from Documents on launch.
- Preliminary ISO-9660 UMD_VIDEO / PLAYLIST.UMD / MPS scanner, with bounded directory reads.
- C bridge for `app_init`, `app_frame`, and `app_shutdown`.
- iOS UIView surface receiving video, subtitle, and UI layers.
- Touch input mapped to the engine's 960x544 screen coordinates.
- Existing upstream POSIX file/thread layer, macOS H.264 software decoder and AudioQueue audio output included as the starting iOS platform implementation.
- AVAudioSession playback category and idle-timer handling.
- GitHub Actions workflow that checks out the submodule, builds the upstream desktop reference player, generates the Xcode project, and builds the iOS Simulator target without signing.

## Not yet verified

- A successful full iOS Simulator build of the current branch.
- A successful playback session on an iPhone.
- Real UMD Video ISO compatibility, including discs with multiple titles, audio tracks, subtitles, and interactive menus.
- Frame pacing, memory use, audio interruptions, and thermal behavior on iPhone.
- App Store signing/distribution or a repeatable free sideloading workflow.

Do not mark playback as working until a known-good UMD Video ISO has been opened and watched on an actual iPhone.

## Immediate validation sequence

1. Get the current GitHub Actions run to complete; fix compiler or linker errors before adding features.
2. Confirm the macOS reference build and iOS Simulator target both pass.
3. Run a small known-good UMD Video ISO in the simulator if the host supports the required media/file workflow.
4. Test on a physical iPhone with a signed development build.
5. Check playback start, audio, subtitles, touch navigation, pause/resume, seeking, chapter changes, title switching, exit, and reopening the same disc.
6. Only then polish the interface and package an initial test build.

## Platform notes

The upstream engine's platform interface requires ISO file access, POSIX threads/time/data storage, H.264 decoding, audio output, frame presentation, text glyphs, input, and device status. The iOS adapter currently uses the upstream POSIX, macOS software video decoder, and AudioQueue implementation as an initial compatibility layer; this is a porting strategy, not proof of full iOS compatibility.

The video presentation path currently converts decoded pixel buffers into Core Graphics images for display. This is simple but may need optimization after correctness and performance are measured.

The iOS target uses a direct-ISO engine entry point, so it attempts to play the selected image without requiring the PSP XMB or Sony firmware.
