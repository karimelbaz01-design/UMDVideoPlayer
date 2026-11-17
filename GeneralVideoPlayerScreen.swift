import SwiftUI
import AVKit

struct GeneralVideoPlayerScreen: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        Group {
            if let player {
                FrameAVPlayerView(player: player)
                    .onAppear { player.play() }
            } else {
                ProgressView("Preparazione video…")
                    .tint(.white)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.black)
                    .onAppear {
                        let newPlayer = AVPlayer(url: url)
                        newPlayer.allowsExternalPlayback = true
                        player = newPlayer
                        newPlayer.play()
                    }
            }
        }
        .background(.black)
    }
}
