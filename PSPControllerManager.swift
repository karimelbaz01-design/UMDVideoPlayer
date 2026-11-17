import Foundation
import GameController
import SwiftUI

/// Owns the iOS controller connection and exposes PSP-style input to the native player.
@MainActor
final class PSPControllerManager: ObservableObject {
    static let shared = PSPControllerManager()

    @Published private(set) var connectedControllerName: String?
    @Published private(set) var isConnected = false

    private var controller: GCController?
    private var previousBrowserButtons: UInt32 = 0

    private init() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(controllerDidConnect(_:)),
            name: .GCControllerDidConnect,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(controllerDidDisconnect(_:)),
            name: .GCControllerDidDisconnect,
            object: nil
        )

        if let existing = GCController.controllers().first {
            attach(existing)
        }
        GCController.startWirelessControllerDiscovery(completionHandler: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func controllerDidConnect(_ notification: Notification) {
        guard let connected = notification.object as? GCController else { return }
        attach(connected)
    }

    @objc private func controllerDidDisconnect(_ notification: Notification) {
        guard let disconnected = notification.object as? GCController,
              disconnected === controller else { return }
        controller = nil
        connectedControllerName = nil
        isConnected = false
        ios_umd_set_controller_input(0, 0)
        previousBrowserButtons = 0
        if let replacement = GCController.controllers().first {
            attach(replacement)
        }
    }

    private func attach(_ newController: GCController) {
        controller = newController
        connectedControllerName = newController.vendorName ?? "Controller Bluetooth"
        isConnected = true

        if let gamepad = newController.extendedGamepad {
            gamepad.valueChangedHandler = { [weak self] _, _ in
                Task { @MainActor in self?.publishInput() }
            }
        } else if let gamepad = newController.microGamepad {
            gamepad.valueChangedHandler = { [weak self] _, _ in
                Task { @MainActor in self?.publishInput() }
            }
        }
        publishInput()
    }

    private func publishInput() {
        guard let controller else {
            ios_umd_set_controller_input(0, 0)
            return
        }

        var buttons: UInt32 = 0
        var stickY: Int32 = 0

        if let pad = controller.extendedGamepad {
            if pad.dpad.up.isPressed { buttons |= 1 << 0 }
            if pad.dpad.down.isPressed { buttons |= 1 << 1 }
            if pad.dpad.left.isPressed { buttons |= 1 << 2 }
            if pad.dpad.right.isPressed { buttons |= 1 << 3 }
            if pad.buttonA.isPressed { buttons |= 1 << 4 }       // Cross
            if pad.buttonB.isPressed { buttons |= 1 << 5 }       // Circle
            if pad.buttonX.isPressed { buttons |= 1 << 6 }       // Square
            if pad.buttonY.isPressed { buttons |= 1 << 7 }       // Triangle
            if pad.leftShoulder.isPressed { buttons |= 1 << 8 }  // L
            if pad.rightShoulder.isPressed { buttons |= 1 << 9 } // R
            if pad.buttonMenu.isPressed { buttons |= 1 << 10 }   // Start
            if #available(iOS 14.0, *), pad.buttonOptions?.isPressed == true {
                buttons |= 1 << 11 // Select
            }
            stickY = Int32(max(-127, min(127, Int(-pad.leftThumbstick.yAxis.value * 127))))
        } else if let pad = controller.microGamepad {
            if pad.dpad.up.isPressed { buttons |= 1 << 0 }
            if pad.dpad.down.isPressed { buttons |= 1 << 1 }
            if pad.dpad.left.isPressed { buttons |= 1 << 2 }
            if pad.dpad.right.isPressed { buttons |= 1 << 3 }
            if pad.buttonA.isPressed { buttons |= 1 << 4 }
            if pad.buttonX.isPressed { buttons |= 1 << 5 }
            if pad.buttonMenu.isPressed { buttons |= 1 << 10 }
        }

        ios_umd_set_controller_input(buttons, stickY)

        let newlyPressed = buttons & ~previousBrowserButtons
        previousBrowserButtons = buttons
        if newlyPressed & (1 << 0) != 0 { postBrowserAction("up") }
        if newlyPressed & (1 << 1) != 0 { postBrowserAction("down") }
        if newlyPressed & (1 << 2) != 0 { postBrowserAction("left") }
        if newlyPressed & (1 << 3) != 0 { postBrowserAction("right") }
        if newlyPressed & (1 << 4) != 0 { postBrowserAction("select") }
        if newlyPressed & (1 << 5) != 0 { postBrowserAction("back") }
    }

    private func postBrowserAction(_ action: String) {
        NotificationCenter.default.post(name: .frameBrowserControllerAction, object: action)
    }
}

extension Notification.Name {
    static let frameBrowserControllerAction = Notification.Name("FRAMEBrowserControllerAction")
}
