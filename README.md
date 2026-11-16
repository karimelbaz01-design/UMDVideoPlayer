# UMD Video Player

An iOS app prototype for organizing PSP UMD Video disc images, with a modern library and a PSP-inspired interface.

## Current status

- SwiftUI interface with Modern and PSP-style layouts.
- Imports ISO files from the iOS Files picker and copies them into the app's Documents folder.
- Identifies the ISO-9660 UMD_VIDEO folder, PLAYLIST.UMD, and MPS stream files.
- Includes the open-source [UMD Player engine](https://github.com/xesf/umd-player) as a pinned Git submodule in `UMDVideoCore`. Its portable C core includes playlist parsing, MPEG-PS demuxing, H.264 video decoding, and ATRAC3plus audio decoding.
- GitHub Actions builds the iOS Simulator prototype and separately compiles the upstream engine's macOS reference player.

## Playback status

**The iOS app does not yet play UMD Video movies.** The upstream engine is now pinned in the repository and its macOS reference build is used as a compilation check. The next engineering step is an iOS platform adapter that connects the portable playback core to iOS file access, audio output, video presentation, and the SwiftUI interface. That adapter must be implemented and tested before movie playback can be claimed.

The engine is MIT-licensed, with its ATRAC3plus decoder under LGPL-2.1-or-later. Keep the upstream license and notice files with any redistributed build. This project is not affiliated with Sony.

## Testing on iPhone

A simulator `.app` artifact is not directly installable on a physical iPhone. A separate iPhone installation/signing route is still required. The current workflow is a build and integration check, not an iPhone-ready release.
