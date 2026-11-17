import SwiftUI
import AVKit
import UniformTypeIdentifiers

private struct IPTVChannel: Identifiable, Codable, Hashable {
    let id: UUID
    let name: String
    let url: String
    let group: String
    var isFavorite: Bool

    init(name: String, url: String, group: String = "Generale", isFavorite: Bool = false) {
        self.id = UUID()
        self.name = name
        self.url = url
        self.group = group
        self.isFavorite = isFavorite
    }
}

struct FrameIPTVPage: View {
    @State private var channels: [IPTVChannel] = []
    @State private var showingImporter = false
    @State private var showingURLSheet = false
    @State private var playlistURL = ""
    @State private var errorMessage: String?
    @State private var playingChannel: IPTVChannel?
    @State private var favoritesOnly = false

    private let ink = Color(red: 0.035, green: 0.045, blue: 0.065)
    private let panel = Color(red: 0.085, green: 0.10, blue: 0.135)
    private let coral = Color(red: 1.0, green: 0.36, blue: 0.29)

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let playingChannel {
                IPTVPlayerView(channel: playingChannel) { self.playingChannel = nil }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("FRAME IPTV")
                        .font(.system(size: 23, weight: .black, design: .rounded))
                        .tracking(2)
                    Text("La tua televisione, organizzata in un solo posto.")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.55))
                }
                HStack(spacing: 10) {
                    Button { showingImporter = true } label: {
                        Label("IMPORTA M3U", systemImage: "doc.badge.plus")
                            .font(.system(size: 11, weight: .black))
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(coral, in: RoundedRectangle(cornerRadius: 13))
                            .foregroundStyle(ink)
                    }
                    Button { showingURLSheet = true } label: {
                        Label("DA LINK", systemImage: "link")
                            .font(.system(size: 11, weight: .bold))
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(panel, in: RoundedRectangle(cornerRadius: 13))
                            .foregroundStyle(.white)
                    }
                }
                HStack {
                    Text("\(channels.count) CANALI")
                        .font(.system(size: 10, weight: .black)).tracking(1)
                        .foregroundStyle(.white.opacity(0.55))
                    Spacer()
                    Button {
                        favoritesOnly.toggle()
                    } label: {
                        Label("Preferiti", systemImage: favoritesOnly ? "star.fill" : "star")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(favoritesOnly ? coral : .white.opacity(0.65))
                    }
                }
                if channels.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "tv").font(.system(size: 34)).foregroundStyle(coral)
                        Text("La tua TV comincia qui").font(.system(size: 16, weight: .bold))
                        Text("Importa una playlist M3U/M3U8 o aggiungi il link a una playlist che sei autorizzato a utilizzare.")
                            .font(.system(size: 12)).foregroundStyle(.white.opacity(0.52))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 35)
                    .background(panel, in: RoundedRectangle(cornerRadius: 18))
                } else {
                    ScrollView {
                        LazyVStack(spacing: 9) {
                            ForEach(channels.filter { !favoritesOnly || $0.isFavorite }) { channel in
                                HStack(spacing: 10) {
                                    Button { playingChannel = channel } label: {
                                        HStack(spacing: 12) {
                                            Image(systemName: "play.tv.fill")
                                                .font(.system(size: 19)).foregroundStyle(coral)
                                                .frame(width: 42, height: 42)
                                                .background(coral.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                                            VStack(alignment: .leading, spacing: 3) {
                                                Text(channel.name).font(.system(size: 13, weight: .bold))
                                                Text(channel.group.uppercased()).font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(.white.opacity(0.42))
                                            }
                                            Spacer(minLength: 4)
                                            Image(systemName: "play.fill").font(.system(size: 11)).foregroundStyle(.white.opacity(0.7))
                                        }
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)

                                    Button {
                                        toggleFavorite(channel)
                                    } label: {
                                        Image(systemName: channel.isFavorite ? "star.fill" : "star")
                                            .foregroundStyle(channel.isFavorite ? coral : .white.opacity(0.4))
                                            .frame(width: 38, height: 42)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(channel.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti")
                                }
                                .padding(10)
                                .background(panel, in: RoundedRectangle(cornerRadius: 15))
                            }
                        }
                    }
                    .frame(height: 420)
                }
                Text("FRAME riproduce flussi compatibili e autorizzati. La disponibilità dipende dal formato, dal provider e da eventuali restrizioni del servizio.")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.38))
            }
        }
        .padding(.top, 8)
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.plainText, .data], allowsMultipleSelection: false) { result in
            importPlaylist(result)
        }
        .sheet(isPresented: $showingURLSheet) {
            NavigationStack {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Playlist IPTV").font(.system(size: 21, weight: .bold))
                    Text("Inserisci il link HTTP o HTTPS a una playlist M3U autorizzata.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                    TextField("https://…/playlist.m3u", text: $playlistURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(13).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    Button("CARICA PLAYLIST") { loadRemotePlaylist() }
                        .font(.system(size: 12, weight: .black))
                        .frame(maxWidth: .infinity).padding(.vertical, 15)
                        .background(coral, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(ink)
                    Spacer()
                }
                .padding(20).background(ink.ignoresSafeArea())
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Chiudi") { showingURLSheet = false } } }
            }
            .presentationDetents([.medium])
        }
        .alert("IPTV", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
        .onAppear(perform: restoreChannels)
    }

    private func importPlaylist(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else {
            if case .failure(let error) = result { errorMessage = error.localizedDescription }
            return
        }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let text = try String(contentsOf: url, encoding: .utf8)
            applyPlaylist(text, baseURL: url.deletingLastPathComponent())
        } catch { errorMessage = "Impossibile leggere la playlist: \(error.localizedDescription)" }
    }

    private func loadRemotePlaylist() {
        guard let url = URL(string: playlistURL),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil else {
            errorMessage = "Inserisci un link HTTP o HTTPS valido."
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error { errorMessage = error.localizedDescription; return }
                if let response = response as? HTTPURLResponse,
                   !(200...299).contains(response.statusCode) {
                    errorMessage = "Il server ha risposto con errore HTTP \(response.statusCode)."
                    return
                }
                guard let data, data.count <= 5 * 1024 * 1024,
                      let text = String(data: data, encoding: .utf8) else {
                    errorMessage = "La playlist non è leggibile come testo UTF-8 oppure supera il limite di 5 MB."
                    return
                }
                applyPlaylist(text, baseURL: url.deletingLastPathComponent())
                showingURLSheet = false
            }
        }.resume()
    }

    private func applyPlaylist(_ text: String, baseURL: URL) {
        var parsed: [IPTVChannel] = []
        var pendingTitle = "Canale"
        var pendingGroup = "Generale"
        let normalizedText = text.replacingOccurrences(of: "\u{FEFF}", with: "")
        for rawLine in normalizedText.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }

            if line.hasPrefix("#EXTINF:") {
                // Every channel starts with fresh metadata: never inherit the previous group.
                pendingTitle = "Canale"
                pendingGroup = "Generale"

                if let comma = line.lastIndex(of: ",") {
                    let title = String(line[line.index(after: comma)...]).trimmingCharacters(in: .whitespaces)
                    if !title.isEmpty { pendingTitle = title }
                }
                if let range = line.range(of: "group-title=\"", options: .caseInsensitive) {
                    let remainder = line[range.upperBound...]
                    if let end = remainder.firstIndex(of: "\"") {
                        let group = String(remainder[..<end]).trimmingCharacters(in: .whitespaces)
                        if !group.isEmpty { pendingGroup = group }
                    }
                }
            } else if line.hasPrefix("#EXTGRP:") {
                let group = String(line.dropFirst("#EXTGRP:".count)).trimmingCharacters(in: .whitespaces)
                if !group.isEmpty { pendingGroup = group }
            } else if !line.hasPrefix("#"),
                      let resolved = URL(string: line, relativeTo: baseURL)?.absoluteURL,
                      ["http", "https"].contains(resolved.scheme?.lowercased() ?? ""),
                      resolved.host != nil {
                parsed.append(IPTVChannel(name: pendingTitle, url: resolved.absoluteString, group: pendingGroup))
                pendingTitle = "Canale"
                pendingGroup = "Generale"
            }
        }
        guard !parsed.isEmpty else {
            errorMessage = "Nessun canale HTTP/HTTPS valido trovato. Controlla che sia una playlist IPTV M3U, non una pagina web o un singolo manifest HLS."
            return
        }

        // Keep the user's favorites when the same playlist is imported or refreshed.
        let favoriteURLs = Set(channels.filter(\.isFavorite).map(\.url))
        channels = parsed.map { channel in
            IPTVChannel(
                name: channel.name,
                url: channel.url,
                group: channel.group,
                isFavorite: favoriteURLs.contains(channel.url)
            )
        }
        favoritesOnly = false
        persistChannels()
    }

    private func toggleFavorite(_ channel: IPTVChannel) {
        guard let index = channels.firstIndex(where: { $0.id == channel.id }) else { return }
        channels[index].isFavorite.toggle()
        persistChannels()
    }

    private func persistChannels() {
        if let data = try? JSONEncoder().encode(channels) {
            UserDefaults.standard.set(data, forKey: "frame.iptv.channels.v1")
        }
    }

    private func restoreChannels() {
        guard let data = UserDefaults.standard.data(forKey: "frame.iptv.channels.v1"),
              let saved = try? JSONDecoder().decode([IPTVChannel].self, from: data) else { return }
        channels = saved
    }
}

private struct IPTVPlayerView: View {
    let channel: IPTVChannel
    let onClose: () -> Void
    @State private var player: AVPlayer?

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Button(action: onClose) { Label("Indietro", systemImage: "chevron.left") }
                Spacer()
                Text(channel.name).font(.system(size: 13, weight: .bold)).lineLimit(1)
            }
            if let player {
                FrameAVPlayerView(player: player)
                    .frame(height: 230)
                    .onAppear { player.play() }
            } else {
                ProgressView("Connessione al canale…").tint(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .onAppear {
                        guard let url = URL(string: channel.url) else { return }
                        let item = AVPlayer(url: url)
                        item.allowsExternalPlayback = true
                        player = item
                        item.play()
                    }
            }
        }
        .foregroundStyle(.white).background(.black)
    }
}
