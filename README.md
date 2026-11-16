# UMD Video Player

An iOS app for organizing and playing PSP UMD Video disc images, with a modern library and a PSP-inspired interface.

## Current implementation

- SwiftUI library with Modern and PSP-style layouts.
- Imports ISO files from the iOS Files picker and copies them into the app's Documents folder.
- Rebuilds the ISO library from Documents at launch, so imported discs remain listed after closing the app.
- Identifies the ISO-9660 UMD_VIDEO folder, PLAYLIST.UMD, and MPS streams when the initial inspection succeeds.
- Allows an ISO image that the preliminary scanner does not recognize to be passed to the playback engine for its own validation.
- Includes the open-source [UMD Player engine](https://github.com/xesf/umd-player) as a pinned Git submodule in `UMDVideoCore`.
- Adds an initial iOS adapter for the upstream C playback core: ISO file access, H.264 software decoding, ATRAC3plus audio output, touch input, and video/subtitle/UI layer presentation.
- GitHub Actions builds the iOS Simulator app without code signing and compiles the upstream macOS reference player.

## Playback verification

The iOS playback bridge and platform adapter are in place, but **real movie playback on an iPhone is not yet verified**. The first successful iOS build and testing with known-good UMD Video images are still required. A successful macOS reference build is not proof that the iOS port works.

See [iOS port status](docs/IOS_PORT_STATUS.md) for the engineering checklist and current limitations.

## Licensing

The engine is MIT-licensed, with its ATRAC3plus decoder under LGPL-2.1-or-later. Its license and notice files are included in the app resources. Keep these notices and the source available with any redistributed build. This project is not affiliated with Sony.

## Sony firmware

This implementation uses the standalone UMD Player engine, not PPSSPP's PSP firmware/XMB route. It is therefore not designed to require a PSP firmware download from Sony.

## Testing on iPhone

A simulator `.app` artifact is not directly installable on a physical iPhone. A separate iPhone installation/signing route is still required. GitHub Actions can compile the project remotely; a Mac is not needed for every code change, but access to a Mac or another supported signing workflow will be needed for the initial on-device installation and real-device debugging.
