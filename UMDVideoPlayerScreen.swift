import SwiftUI
import UIKit

struct UMDVideoPlayerScreen: UIViewRepresentable {
    let path: String
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onError: onError)
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

        init(onError: @escaping (String) -> Void) {
            self.onError = onError
        }

        func start(path: String, surface: UMDVideoSurface) {
            ios_umd_set_surface(Unmanaged.passUnretained(surface).toOpaque())
            UIApplication.shared.isIdleTimerDisabled = true

            let result = path.withCString { ios_umd_start($0) }
            guard result == 0 else {
                ios_umd_clear_surface()
                UIApplication.shared.isIdleTimerDisabled = false
                onError("Il motore non è riuscito ad aprire questo disco. Controlla che l'ISO sia un UMD Video valido.")
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
            }
        }

        func stop() {
            displayLink?.invalidate()
            displayLink = nil

            if isRunning {
                ios_umd_stop()
                isRunning = false
            }
            ios_umd_clear_surface()
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
}
