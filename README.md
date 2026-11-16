# UMD Video Player

An iOS app prototype for organizing PSP UMD Video disc images, with a modern library and a PSP-inspired interface.

## Current status

- SwiftUI interface with Modern and PSP-style layouts.
- Imports ISO files from the iOS Files picker and copies them into the app's Documents folder.
- GitHub Actions builds the iOS Simulator app without code signing.

## Important playback note

Importing an ISO is not the same as decoding it. PSP UMD Video images use a disc/container structure and video formats that need a dedicated parser and playback pipeline. The current prototype does **not** yet decode or play UMD Video ISO files. A future playback engine must be implemented and tested against legally obtained sample media.

## Build

The repository uses XcodeGen (project.yml) and GitHub Actions. The workflow produces an iOS Simulator .app artifact; it is not a signed, directly installable iPhone app.
