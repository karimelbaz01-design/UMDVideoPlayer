# Media Platform Architecture

## Product direction

Evolve UMD Video Player into a personal media platform for a user's own movies, TV series, and PSP UMD Video discs. The app does not host, sell, bundle, scrape, or distribute film/TV content. Users import files they are entitled to use or provide direct media URLs they are authorized to access.

## Separate playback engines

Keep the existing UMD Video engine isolated. Add a separate general-media playback layer so a new codec or player cannot destabilize UMD playback.

### Engine A — Apple AVFoundation / AVPlayer

Use as the default engine for:
- Local and remote MP4, MOV, and M4V when their codecs are supported by the device.
- HTTP Live Streaming (HLS) manifests (.m3u8).
- Direct HTTP(S) media URLs supported by AVPlayer.

Advantages: native iOS integration, hardware decoding where available, system playback controls, AirPlay, and efficient HLS adaptation.

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

## Interface direction

Avoid copying Netflix or PPSSPP. Use a distinct editorial/cinematic identity:
- A compact "Continue" rail with progress.
- A featured title area with backdrop and restrained typography.
- Separate Movies, Series, UMD Video, and Collections sections.
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
9. Test on a physical iPhone for real playback, performance, audio, subtitles, AirPlay, and background/lock-screen behavior.

## Current verified baseline

The repository's latest recorded iOS Simulator workflow build at the time this document was added succeeded. This is a compile/build check only; it does not verify playback on a physical iPhone or support for every media format.
