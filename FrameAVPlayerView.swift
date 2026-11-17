import SwiftUI
import AVKit
import AVFoundation

/// Shared audio-session setup for normal AVPlayer media and compatible IPTV streams.
enum FramePlaybackAudioSession {
    static func activate() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .moviePlayback,
                options: [.allowAirPlay, .allowBluetoothA2DP]
            )
            try session.setActive(true)
        } catch {
            // Playback can still work in the foreground; background audio/PiP
            // may be unavailable if iOS refuses the audio-session configuration.
            print("FRAME audio session configuration failed: \(error.localizedDescription)")
        }
    }
}

/// AVPlayerViewController provides native iOS Picture in Picture controls and lifecycle.
struct FrameAVPlayerView: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        FramePlaybackAudioSession.activate()
        player.allowsExternalPlayback = true
        player.automaticallyWaitsToMinimizeStalling = true

        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = true
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.updatesNowPlayingInfoCenter = true
        controller.entersFullScreenWhenPlaybackBegins = false
        controller.exitsFullScreenWhenPlaybackEnds = false
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        if controller.player !== player {
            controller.player = player
        }
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
    }
}
