# Media Platform Architecture

## Product direction and identity

The product is a **PSP-inspired entertainment hub: play, watch, and relive**. It must be immediately clear from onboarding and the home screen that this is both:
- A PSP gaming emulator experience for users' own game images, with controller and touch controls.
- A personal video and TV library for movies, series, home videos, and PSP UMD Video.

The design language is deliberately **retro meets contemporary**: subtle PSP-era references, tactile disc/media details, and nostalgic visual cues combined with a polished 2026 interface, fluid transitions, high-resolution artwork, modern typography, and high-definition playback. Avoid copying PPSSPP, Netflix, or another single product. Give the app its own recognizable visual identity.

The home screen should make the two main activities unmistakable:
- **PLAY** — PSP games, recently played, game library, controller status.
- **WATCH** — Movies, TV series, home videos, UMD Video, continue watching.

Do not make the app look like a video player that happens to have an emulator hidden in a menu. Gaming and video are equal first-class pillars.

The app is a personal media platform for content the user owns or is authorized to access. It does not host, sell, bundle, scrape, or distribute film/TV content or game images. Users import their own files or provide authorized direct media URLs.

## Gaming and emulation

Keep PSP gaming as a first-class product pillar, not a future footnote. The existing UMD Video playback engine is not a PSP game emulator; these are separate technical systems.

Evaluate integrating the PPSSPP emulator core as the most practical route to broad PSP game compatibility, while building our own SwiftUI front end, library, onboarding, controller settings, and user experience. Do not claim game emulation is available until the core is integrated and tested. Review GPL-2.0-or-later obligations before distribution if PPSSPP code is included.

The gaming area should include:
- User-imported PSP game images only; no bundled copyrighted games.
- Recently played, favorites, game details, and per-game settings.
- Bluetooth controller support and configurable controls.
- Touch controls for supported games.
- Save-state and performance features only when actually supported by the integrated core and tested on device.

## Separate playback engines

Keep the existing UMD Video engine isolated. Add a separate general-media playback layer so a new codec or player cannot destabilize UMD playback.

### Engine A — Apple AVFoundation / AVPlayer

Use as the default engine for:
- Local and remote MP4, MOV, and M4V when their codecs are supported by the device.
- HTTP Live Streaming (HLS) manifests (.m3u8).
- Direct HTTP(S) media URLs supported by AVPlayer.

Advantages: native iOS integration, hardware decoding where available, system playback controls, AirPlay output, and efficient HLS adaptation.

### Engine B — MobileVLCKit / libVLC (evaluate before adoption)

Evaluate as an optional compatibility engine for formats/codecs not handled by AVPlayer, such as some MKV/AVI/other container and subtitle combinations.

Before integrating, verify:
- Current iOS distribution method and compatibility with the repository's XcodeGen/CI setup.
- Exact license and notices for the selected MobileVLCKit binary/version.
- App size, startup time, battery use, memory use, and hardware-decoding support.
- App Store distribution implications and required source/code notices.

Do not promise universal format support. A container extension does not guarantee that every codec, profile, audio track, subtitle, or DRM scheme inside it is playable.

## Sources and playlists

Support these distinct source types:

1. **Local media file** — selected through the iOS Files picker and copied into the app's private media library when the user chooses import.
2. **Direct media URL** — an HTTP(S) URL that points directly to a supported media file or stream. Save the URL and user-provided title/artwork metadata locally; do not download by default.
3. **HLS .m3u8 URL/file** — pass the HLS manifest to AVPlayer where compatible. HLS is a streaming protocol, not a generic container.
4. **Plain .m3u playlist** — parse it as a text playlist containing entries/URLs. It is not itself a video. Resolve relative entries against the playlist's base URL, validate schemes, and show playable movie/episode entries only. Do not interpret a general webpage as a direct video URL.
5. **Web page URL** — do not pretend every browser page can be embedded or played. Offer to open the page in the system browser; only play inside the app when the provider exposes a direct supported media URL and permits that use.

Do not bypass DRM, logins, paywalls, access controls, or provider restrictions. Do not scrape arbitrary streaming sites.

## Library model

Use a unified metadata model with explicit media kinds:
- Movie
- TV show
- Season
- Episode
- UMD Video disc

A TV show groups seasons; each season groups episodes. A movie is a single item. An episode stores season/episode numbers and optional resume position. UMD Video remains a separate source/playback type but can appear in the same Movies/Collection views.

Suggested metadata fields:
- Stable local ID, title, original title, synopsis, year, runtime, genres, content rating where supplied, poster/backdrop artwork, source, media kind.
- TV fields: show ID, season number, episode number, episode title, episode synopsis, episode runtime.
- Playback fields: last position, duration, completion state, audio/subtitle selection where supported.
- User fields: favorites, custom collections, custom artwork, manually edited metadata.

Metadata enrichment should be opt-in and use a documented metadata provider/API with attribution and terms compliance. The app must still work offline with filenames and manually entered details.

## AirPlay and external display

AirPlay must be part of the video experience, not merely a marketing bullet:
- Use AVPlayer's native AirPlay route selection for compatible local and remote video.
- Preserve playback position and selected audio/subtitle tracks when the output route changes where the framework permits.
- Test UMD Video's custom rendering/audio path separately; native AVPlayer AirPlay support does not automatically make the custom UMD engine AirPlay-compatible.
- For general screen mirroring, explain that users can start iPhone screen mirroring from Control Center. Do not imply the app can silently force system-wide screen mirroring.
- Validate audio/video sync, orientation, resolution, and interruption recovery on a real AirPlay receiver.

## Interface direction

Avoid copying Netflix or PPSSPP. Use a distinct retro-contemporary identity:
- A compact "Continue" rail with progress.
- A featured title area with backdrop and restrained typography.
- A prominent PLAY / WATCH home choice, with equal visual weight.
- PLAY: PSP games, recently played, game library, controller status.
- WATCH: Movies, Series, Home Videos, UMD Video, and Collections.
- Movie cards with poster, title, year, and runtime.
- Series pages with seasons and episode rows, thumbnails, synopsis, and progress.
- A clean import flow: Files, Direct Link, Playlist.
- A full-screen player with chapters/seeking, audio/subtitle selection when available, playback speed where supported, AirPlay, and resume.
- Clear source badges (Local, HLS, Direct Link, UMD).

## Delivery sequence

1. Preserve the current UMD Video project and keep its CI build green.
2. Add the general media data model and local library persistence.
3. Add import for common video files and direct URLs.
4. Add AVPlayer playback for supported local/remote files and HLS.
5. Add a safe plain-M3U parser and playlist UI.
6. Evaluate MobileVLCKit as a compatibility fallback, only after license and build validation.
7. Add film/series metadata and artwork enrichment.
8. Refine the new library and player design.
9. Integrate and validate the PSP game core separately from UMD Video playback.
10. Test on a physical iPhone for real game compatibility, controller input, video playback, performance, audio, subtitles, AirPlay, and background/lock-screen behavior.

## Current verified baseline

The repository's latest recorded iOS Simulator workflow build at the time this document was added succeeded. This is a compile/build check only; it does not verify playback on a physical iPhone or support for every media format.


## FRAME premium and sustainable monetization

The free tier must remain genuinely useful and must not deliberately degrade basic playback:
- Keep a good default picture and audio experience for all users, bounded only by the source, device, network, codec, and available bandwidth.
- No artificial low-resolution cap solely to pressure users into paying.
- Core access to personal local media, UMD Video, and compatible user-provided playlists should not be crippled by an ad paywall.
- Ads, if introduced, should be clearly labeled, limited, non-intrusive, and never inserted over video playback or used to disguise third-party content.
- Never target ads using sensitive personal data or infer sensitive traits.

FRAME Premium may offer:
- Ad-free app experience.
- Optional advanced playback controls and convenience features.
- Additional library customization and organization.
- Advanced quality controls only where the source and device genuinely support them; free users still retain good automatic quality.
- Optional cloud sync only if a secure, privacy-conscious backend is later designed and funded.

Do not promise 4K or a higher resolution when the original stream, decoder, display, or network cannot provide it. Quality selection should be source-aware and explain when the source is the limiting factor.

Monetization should be implemented only after the free product is stable:
1. Validate the app platform distribution rules and current Apple advertising / in-app purchase requirements.
2. Prefer a transparent subscription or one-time purchase for Premium, with clear benefits, renewal terms, restore-purchases flow, and cancellation guidance.
3. If ads are used, evaluate a reputable ad SDK, privacy disclosures, consent requirements in applicable regions (including EU/Italy), age suitability, tracking permissions, and App Store privacy labels before integration.
4. Never serve ads inside the PSP emulator, over the video image, or in a way that imitates system controls.
5. Keep an accessible settings page describing Free and Premium without implying that billing is active until StoreKit and entitlement validation are implemented.

## IPTV implementation rules

FRAME IPTV accepts user-provided M3U playlists and HTTP(S) playlist URLs. Parse EXTINF metadata and channel URLs, validate each stream URL, preserve group labels, and let users favorite channels. The player uses AVPlayer for compatible streams and exposes the system external playback route where supported.

An M3U channel list and an HLS .m3u8 media manifest are related text formats but serve different purposes. A playlist import should not claim that every entry is playable. Provider authentication, DRM, geo-restrictions, codec support, and server availability can prevent playback. Do not scrape sites, extract hidden streams, or bypass service controls.

## Browser and controller navigation

The embedded browser uses WKWebView for normal web navigation and inline playback where the site and iOS permit it. It is not a universal streaming-site compatibility layer. Browser controller navigation moves focus between visible interactive elements and activates the focused element; site-specific controls may still require touch or keyboard input. External sites retain their own terms, sign-in, DRM, and playback restrictions.

## Feature status discipline

A visible UI section is not proof that its underlying engine is complete. Track each capability as one of:
- Designed
- UI implemented
- Core integrated
- Simulator build verified
- Physical-device tested
- Distribution-ready

Do not describe PSP game emulation, UMD AirPlay, universal web playback, paid entitlements, or ad delivery as operational until each has passed its relevant integration and device tests.


## Picture in Picture and background playback

Compatible local/direct media and IPTV streams use a shared AVPlayerViewController wrapper with native iOS Picture in Picture enabled, including automatic PiP when the app moves to the background where iOS permits it. The app declares the audio background mode so AVPlayer playback can continue outside the foreground. Actual behavior must be tested on a physical iPhone and depends on the media source and iOS settings.

The custom UMD Video playback engine renders through its own surface rather than AVPlayerViewController. PiP for UMD Video is a separate engineering task and is not claimed as implemented.
