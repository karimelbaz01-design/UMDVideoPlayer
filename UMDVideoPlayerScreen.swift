import SwiftUI
import UIKit
import AVFoundation

struct UMDVideoPlayerScreen: UIViewRepresentable {
    let path: String
    let onError: (String) -> Void
    let onFinish: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onError: onError, onFinish: onFinish)
    }

    func makeUIView(context: Context) -> UMDVideoSurface {
        let surface = UMDVideoSurface(frame: .zero)
        context.coordinator.start(path: path, surface: surface)
        return surface
    }

    func updateUIView(_ uiView: UMDVideoSurface, context: Context) {
        // Playback is started once when the surface is created.
    }

    static func dismantleUIView(_ uiView: UMDVideoSurface, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class Coordinator: NSObject {
        private var displayLink: CADisplayLink?
        private var isRunning = false
        private let onError: (String) -> Void
        private let onFinish: () -> Void

        init(onError: @escaping (String) -> Void, onFinish: @escaping () -> Void) {
            self.onError = onError
            self.onFinish = onFinish
        }

        func start(path: String, surface: UMDVideoSurface) {
            // Clear stale input before starting a new UMD playback session.
            ios_umd_set_controller_input(0, 0)
            ios_umd_set_surface(Unmanaged.passUnretained(surface).toOpaque())
            UIApplication.shared.isIdleTimerDisabled = true
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
            try? AVAudioSession.sharedInstance().setActive(true)

            let result = path.withCString { ios_umd_start($0) }
            guard result == 0 else {
                ios_umd_clear_surface()
                UIApplication.shared.isIdleTimerDisabled = false
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                DispatchQueue.main.async {
                    self.onError("Il motore non è riuscito ad aprire questo disco. Controlla che l'ISO sia un UMD Video valido.")
                }
                return
            }

            isRunning = true
            let link = CADisplayLink(target: self, selector: #selector(drawFrame))
            link.add(to: .main, forMode: .common)
            displayLink = link
        }

        @objc private func drawFrame() {
            guard isRunning else { return }
            if ios_umd_frame() == 0 {
                stop()
                onFinish()
            }
        }

        func stop() {
            displayLink?.invalidate()
            displayLink = nil

            if isRunning {
                ios_umd_stop()
                isRunning = false
            }
            ios_umd_set_controller_input(0, 0)
            ios_umd_clear_surface()
            UIApplication.shared.isIdleTimerDisabled = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
