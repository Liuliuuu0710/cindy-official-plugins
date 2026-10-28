import SwiftUI
import GameController

final class MouseProbe {
    static let shared = MouseProbe()
    init() {
        NotificationCenter.default.addObserver(forName: .GCMouseDidConnect, object: nil, queue: .main) { note in
            if let mouse = note.object as? GCMouse { self.attach(mouse) }
        }
        GCMouse.mice().forEach(attach)
    }
    func record(_ name: String, _ value: String) {
        try? value.write(to: URL.documentsDirectory.appending(path: name), atomically: true, encoding: .utf8)
    }
    func attach(_ mouse: GCMouse) {
        record("mouse-connected.txt", "connected")
        mouse.mouseInput?.mouseMovedHandler = { _, x, y in self.record("mouse.txt", "\(x) \(y)") }
        mouse.mouseInput?.leftButton.pressedChangedHandler = { _, _, pressed in self.record("mouse-button.txt", "\(pressed)") }
    }
}

@main struct VisionControls: App {
    var body: some Scene { WindowGroup { Controls() }.defaultSize(width: 900, height: 650) }
}
struct Controls: View {
    @State var taps = 0
    @State var drag = CGSize.zero
    @State var scale = 1.0
    @State var angle = 0.0
    @State var text = ""
    func record(_ event: String) {
        try? event.write(to: URL.documentsDirectory.appending(path: "event.txt"), atomically: true, encoding: .utf8)
    }
    var body: some View {
        VStack(spacing: 24) {
            Text("Vision Controls").font(.largeTitle)
            Button("Tap count: \(taps)") { taps += 1; record("tap \(taps)") }
            TextField("Keyboard input", text: $text).textFieldStyle(.roundedBorder)
            Text(String(format: "Drag %.0f, %.0f · Scale %.2f · Angle %.0f", drag.width, drag.height, scale, angle))
            RoundedRectangle(cornerRadius: 24).fill(.blue.opacity(0.5))
                .overlay(Text("Drag · Pinch · Rotate").font(.title))
                .frame(height: 260).contentShape(Rectangle())
                .gesture(DragGesture().onChanged { value in
                    drag = value.translation; record("drag \(value.translation.width) \(value.translation.height)")
                }.onEnded { value in record("ended \(value.translation.width) \(value.translation.height)") })
                .simultaneousGesture(MagnifyGesture().onChanged { value in
                    scale = value.magnification; record("scale \(scale)")
                })
                .simultaneousGesture(RotateGesture().onChanged { value in
                    angle = value.rotation.degrees; record("angle \(angle)")
                })
        }.padding(40).onAppear { _ = MouseProbe.shared }
    }
}
