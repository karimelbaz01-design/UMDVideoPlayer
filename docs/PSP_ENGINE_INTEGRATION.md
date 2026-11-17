# FRAME PSP game engine integration

## Selected engine: PPSSPP

Upstream: https://github.com/hrydgard/ppsspp

PPSSPP is an existing PSP emulator with an iOS port. It is **not** the UMD Video decoder already in FRAME. The engine is a substantial C++ project with its own build system, platform layers, resources and nested Git submodules.

Run `bash scripts/prepare-psp-engine.sh` in a macOS or Linux development environment to obtain upstream source and its submodules under `.engine-work/ppsspp`. This is source preparation **only**: it does not link the emulator into FRAME or make PSP games playable.

## Required implementation before calling PLAY functional

1. Pin an upstream PPSSPP commit and audit license obligations for FRAME distribution, especially GPL-2.0-or-later compatibility and source availability. Do not mix closed-source premium restrictions with GPL-covered emulator code without legal review.
2. Build the PPSSPP core and its dependencies for iOS arm64 in a reproducible job. A standalone PPSSPP iOS app build is not an embedded FRAME core.
3. Expose a narrow Objective-C++ lifecycle bridge for booting a user-imported ISO/CSO, stopping it, pausing/resuming, video frame presentation, audio, save data, and errors. Keep engine C++ out of SwiftUI.
4. Translate `PSPControllerManager.gameButtons`, `analogX`, `analogY` into PPSSPP input events. The PSP face button mapping must be verified against PPSSPP input constants.
5. Add touch controls only to the active PSP gameplay screen; all other FRAME screens remain touch/whole-app-controller navigable without PSP virtual buttons.
6. Keep engine initialization and rendering isolated from the UMD Video player and WKWebView. Route gamepad input exclusively to the active experience.
7. Validate an iOS Simulator build, then device boot, save states, audio, controller, touch, JIT/interpreter restrictions, and legal distribution.

## Current state

The PPSSPP checkout script exists; **the emulator is not linked** and games do not launch. No source or device validation is claimed. The separate UMD Video playback core remains unchanged.
