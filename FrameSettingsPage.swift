import SwiftUI

struct FrameSettingsPage: View {
    private let panel = Color(red: 0.085, green: 0.10, blue: 0.135)
    private let coral = Color(red: 1.0, green: 0.36, blue: 0.29)
    private let lavender = Color(red: 0.66, green: 0.61, blue: 1.0)

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 5) {
                Text("IMPOSTAZIONI")
                    .font(.system(size: 23, weight: .black, design: .rounded))
                    .tracking(1.5)
                Text("Come FRAME gestisce riproduzione e dispositivi.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
            }

            settingsGroup("RIPRODUZIONE") {
                statusRow(
                    "Qualità video",
                    detail: "Automatica: AVPlayer e la sorgente scelgono la qualità compatibile.",
                    symbol: "sparkles",
                    tint: coral
                )
                Divider().overlay(.white.opacity(0.08))
                statusRow(
                    "Picture in Picture",
                    detail: "Disponibile per i contenuti compatibili riprodotti con AVPlayer. UMD Video richiede un motore PiP separato, ancora da sviluppare.",
                    symbol: "pip",
                    tint: lavender
                )
                Divider().overlay(.white.opacity(0.08))
                statusRow(
                    "AirPlay",
                    detail: "Disponibile per le sorgenti supportate da AVPlayer. Il percorso UMD personalizzato non è ancora verificato.",
                    symbol: "airplayvideo",
                    tint: lavender
                )
            }

            settingsGroup("DISPOSITIVI") {
                statusRow(
                    "Controller Bluetooth",
                    detail: "Collega o gestisci il controller in Impostazioni iOS > Bluetooth. Il supporto nei giochi PSP arriverà con l'integrazione dell'emulatore.",
                    symbol: "gamecontroller",
                    tint: coral
                )
                Divider().overlay(.white.opacity(0.08))
                statusRow(
                    "Browser",
                    detail: "La riproduzione web dipende dal sito, da WebKit e dalle eventuali restrizioni del servizio.",
                    symbol: "safari",
                    tint: lavender
                )
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("FRAME PREMIUM", systemImage: "crown.fill")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(coral)
                Text("Un piano opzionale pensato per rimuovere la pubblicità e offrire funzioni aggiuntive, senza rendere scadente la versione gratuita.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.65))
                VStack(alignment: .leading, spacing: 7) {
                    Label("Niente pubblicità", systemImage: "checkmark.circle.fill")
                    Label("Personalizzazione e funzioni extra", systemImage: "checkmark.circle.fill")
                    Label("Opzioni avanzate solo dove supportate", systemImage: "checkmark.circle.fill")
                }
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.8))
                Text("Premium è soltanto una proposta: pagamenti, prezzi e vantaggi non sono attivi.")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(17)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(panel, in: RoundedRectangle(cornerRadius: 18))

            Text("FRAME non ospita contenuti protetti. Usa file, playlist e flussi che sei autorizzato a riprodurre.")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.4))
        }
        .padding(.top, 8)
    }

    private func settingsGroup<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(title)
                .font(.system(size: 10, weight: .black))
                .tracking(1)
                .foregroundStyle(.white.opacity(0.45))
            content()
        }
        .padding(16)
        .background(panel, in: RoundedRectangle(cornerRadius: 17))
    }

    private func statusRow(
        _ title: String,
        detail: String,
        symbol: String,
        tint: Color
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.55))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}
