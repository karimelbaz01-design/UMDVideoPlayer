# UMD Video Player

An iOS app prototype for organizing and playing PSP UMD Video disc images, with a modern library and a PSP-inspired interface.

## Current implementation

- SwiftUI library with Modern and PSP-style layouts.
- Imports ISO files from the iOS Files picker and copies them into the app's Documents folder.
- Recognizes the ISO-9660 UMD_VIDEO folder, playlist, and MPS streams when the initial inspection succeeds.
- Includes the open-source [UMD Player engine](https://github.com/xesf/umd-player) as a pinned Git submodule in `UMDVideoCore`.
- Adds an initial iOS adapter for the upstream C playback core: ISO file access, H.264 software decoding, ATRAC3plus audio output, touch input, and layer presentation.
- GitHub Actions compiles the upstream macOS reference player and builds the iOS Simulator app without code signing.

## Playback verification

The iOS playback bridge and platform adapter have been added, but **real movie playback on an iPhone is not yet verified**. The first successful build and testing with a known-good UMD Video ISO are still required. The upstream engine's macOS reference build is a useful independent compilation check, not proof that the iOS port works.

The engine is MIT-licensed, with its ATRAC3plus decoder under LGPL-2.1-or-later. Its license and notice files are included in the app resources. Keep these notices and the source available with any redistributed build. This project is not affiliated with Sony.

## Sony firmware

This implementation uses the standalone UMD Player engine, not PPSSPP's PSP firmware/XMB route. It is therefore not designed to require a PSP firmware download from Sony.

## Testing on iPhone

A simulator `.app` artifact is not directly installable on a physical iPhone. A separate iPhone installation/signing route is still required. The current workflow is a build and integration check, not an iPhone-ready release.
