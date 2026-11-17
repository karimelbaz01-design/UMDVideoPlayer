import SwiftUI

struct FrameSettingsPage: View {
    @State private var highQuality = true
    @State private var reduceMotion = false
    @State private var showPlaybackInfo = true

    private let panel = Color(red: 0.085, green: 0.10, blue: 0.135)
    private let coral = Color(red: 1.0, green: 0.36, blue: 0.29)

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 5) {
                Text("IMPOSTAZIONI").font(.system(size: 23, weight: .black, design: .rounded)).tracking(1.5)
                Text("Personalizza la tua esperienza FRAME.").font(.system(size: 12)).foregroundStyle(.white.opacity(0.5))
            }
            settingsGroup("RIPRODUZIONE") {
                Toggle("Qualità alta quando disponibile", isOn: $highQuality).tint(coral)
                Toggle("Mostra informazioni di riproduzione", isOn: $showPlaybackInfo).tint(coral)
            }
            settingsGroup("ESPERIENZA") {
                Toggle("Riduci animazioni", isOn: $reduceMotion).tint(coral)
                Label("Controller Bluetooth", systemImage: "gamecontroller").foregroundStyle(.white)
                Label("AirPlay: disponibile nei lettori compatibili", systemImage: "airplayvideo").foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 10) {
                Label("FRAME PREMIUM", systemImage: "crown.fill")
                    .font(.system(size: 15, weight: .black)).foregroundStyle(coral)
                Text("Un piano opzionale pensato per rimuovere la pubblicità e offrire funzioni aggiuntive, senza rendere scadente la versione gratuita.")
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.65))
                VStack(alignment: .leading, spacing: 7) {
                    Label("Niente pubblicità", systemImage: "checkmark.circle.fill")
                    Label("Opzioni avanzate di qualità, dove supportate", systemImage: "checkmark.circle.fill")
                    Label("Funzioni extra e personalizzazione", systemImage: "checkmark.circle.fill")
                }
                .font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.8))
                Text("Premium è una proposta di prodotto: pagamenti, prezzi e vantaggi non sono ancora attivi.")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.4))
            }
            .padding(17).frame(maxWidth: .infinity, alignment: .leading)
            .background(panel, in: RoundedRectangle(cornerRadius: 18))
            Text("FRAME non ospita contenuti protetti. Usa file, playlist e flussi che sei autorizzato a riprodurre.")
                .font(.system(size: 10)).foregroundStyle(.white.opacity(0.4))
        }
        .padding(.top, 8)
    }

    private func settingsGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(title).font(.system(size: 10, weight: .black)).tracking(1).foregroundStyle(.white.opacity(0.45))
            content()
        }
        .padding(16).background(panel, in: RoundedRectangle(cornerRadius: 17))
    }
}
