import SwiftUI
import UniformTypeIdentifiers
import AVKit

private enum FrameTab: String, CaseIterable, Identifiable {
    case home = "Home"
    case play = "Play"
    case watch = "Watch"
    case library = "Library"
    case browser = "Web"
    case iptv = "IPTV"
    case settings = "Settings"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .home: return "square.grid.2x2.fill"
        case .play: return "gamecontroller.fill"
        case .watch: return "play.rectangle.fill"
        case .library: return "square.stack.3d.up.fill"
        case .browser: return "safari.fill"
        case .iptv: return "tv.fill"
        case .settings: return "gearshape.fill"
        }
    }
}

private enum VideoCategory: String, CaseIterable, Codable, Identifiable {
    case films = "Film"
    case series = "Serie TV"
    case personal = "Video personali"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .films: return "film"
        case .series: return "tv"
        case .personal: return "video"
        }
    }
}

private struct LibraryVideo: Identifiable, Codable, Hashable {
    let id: UUID
    let title: String
    let source: String
    let category: VideoCategory
    let isRemote: Bool

    init(title: String, source: String, category: VideoCategory, isRemote: Bool) {
        self.id = UUID()
        self.title = title
        self.source = source
        self.category = category
        self.isRemote = isRemote
    }

    var url: URL? { URL(string: source) }
}

private struct PSPGame: Identifiable {
    let id = UUID()
    let url: URL
    var title: String { url.deletingPathExtension().lastPathComponent }
}

struct ImportedDisc: Identifiable {
    let id = UUID()
    let name: String
    let url: URL
    let isISO: Bool
    let isUMDVideo: Bool
    let streamCount: Int
    let statusMessage: String
}

struct ContentView: View {
    @StateObject private var controllerManager = PSPControllerManager.shared
    @State private var selectedTab: FrameTab = .home
    @State private var showingGameImporter = false
    @State private var games: [PSPGame] = []
    @State private var favoriteGamePaths: Set<String> = []
    @State private var showingISOImporter = false
    @State private var showingVideoImporter = false
    @State private var showingLinkSheet = false
    @State private var selectedImportCategory: VideoCategory = .films
    @State private var discs: [ImportedDisc] = []
    @State private var videos: [LibraryVideo] = []
    @State private var selectedDisc: ImportedDisc?
    @State private var playingDisc: ImportedDisc?
    @State private var playingVideo: LibraryVideo?
    @State private var importError: String?
    @State private var linkText = ""
    @State private var linkTitle = ""

    private let ink = Color(red: 0.035, green: 0.045, blue: 0.065)
    private let panel = Color(red: 0.085, green: 0.10, blue: 0.135)
    private let coral = Color(red: 1.0, green: 0.36, blue: 0.29)
    private let lavender = Color(red: 0.66, green: 0.61, blue: 1.0)

    var body: some View {
        Group {
            if let disc = playingDisc {
                discPlayer(disc)
            } else if let video = playingVideo {
                videoPlayer(video)
            } else {
                mainInterface
            }
        }
        .fileImporter(
            isPresented: $showingGameImporter,
            allowedContentTypes: [.pspGameISO, .pspGameCSO],
            allowsMultipleSelection: true,
            onCompletion: handleGameImport
        )
        .fileImporter(
            isPresented: $showingISOImporter,
            allowedContentTypes: [.isoImage],
            allowsMultipleSelection: true,
            onCompletion: handleISOImport
        )
        .fileImporter(
            isPresented: $showingVideoImporter,
            allowedContentTypes: [.movie, .mpeg4Movie, .quickTimeMovie],
            allowsMultipleSelection: true,
            onCompletion: handleVideoImport
        )
        .sheet(isPresented: $showingLinkSheet) {
            linkImportSheet
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .alert("Informazione", isPresented: Binding(
            get: { importError != nil || selectedDisc != nil },
            set: { if !$0 { importError = nil; selectedDisc = nil } }
        )) {
            Button("OK", role: .cancel) { importError = nil; selectedDisc = nil }
        } message: {
            Text(selectedDisc?.statusMessage ?? importError ?? "")
        }
        .onAppear(perform: loadLibrary)
        .preferredColorScheme(.dark)
    }

    private var mainInterface: some View {
        ZStack {
            ink.ignoresSafeArea()
            LinearGradient(
                colors: [Color(red: 0.10, green: 0.12, blue: 0.18), ink, ink],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                ScrollView(showsIndicators: false) {
                    Group {
                        switch selectedTab {
                        case .home: homePage
                        case .play: playPage
                        case .watch: watchPage
                        case .library: libraryPage
                        case .browser: FrameBrowserPage()
                        case .iptv: FrameIPTVPage()
                        case .settings: FrameSettingsPage()
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomNavigation
        }
    }

    private var topBar: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("FRAME")
                    .font(.system(size: 25, weight: .black, design: .rounded))
                    .tracking(3.5)
                    .foregroundStyle(.white)
                Text("PLAY • WATCH • REPLAY")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(2.1)
                    .foregroundStyle(.white.opacity(0.48))
            }
            Spacer()
            HStack(spacing: 7) {
                Circle()
                    .fill(controllerManager.isConnected ? Color.green : Color.white.opacity(0.28))
                    .frame(width: 7, height: 7)
                Text(controllerManager.isConnected ? "PAD CONNESSO" : "TOUCH")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(1)
                    .foregroundStyle(controllerManager.isConnected ? .green : .white.opacity(0.58))
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .background(.white.opacity(0.07), in: Capsule())
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
        .padding(.bottom, 17)
    }

    private var bottomNavigation: some View {
        HStack(spacing: 0) {
            ForEach(FrameTab.allCases) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { selectedTab = tab }
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 17, weight: .semibold))
                        Text(tab.rawValue.uppercased())
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .tracking(1)
                    }
                    .foregroundStyle(selectedTab == tab ? coral : .white.opacity(0.45))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(ink.opacity(0.97))
        .overlay(alignment: .top) {
            Rectangle().fill(.white.opacity(0.08)).frame(height: 1)
        }
    }

    private var homePage: some View {
        VStack(alignment: .leading, spacing: 24) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: 28)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 0.37, green: 0.20, blue: 0.27), Color(red: 0.15, green: 0.16, blue: 0.25), panel],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Circle()
                    .fill(coral.opacity(0.22))
                    .frame(width: 190, height: 190)
                    .blur(radius: 3)
                    .offset(x: 210, y: -95)
                VStack(alignment: .leading, spacing: 13) {
                    Text("IL TUO MONDO,")
                    Text("UN SOLO FRAME.")
                        .foregroundStyle(coral)
                    Text("Giochi PSP, cinema, serie e i tuoi video. Tutto nella stessa libreria.")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                    HStack(spacing: 10) {
                        Button {
                            selectedTab = .watch
                        } label: {
                            Label("GUARDA", systemImage: "play.fill")
                                .font(.system(size: 11, weight: .black))
                                .tracking(1)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(coral, in: Capsule())
                                .foregroundStyle(ink)
                        }
                        Button {
                            selectedTab = .play
                        } label: {
                            Label("GIOCA", systemImage: "gamecontroller.fill")
                                .font(.system(size: 11, weight: .bold))
                                .tracking(1)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(.white.opacity(0.10), in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                    .padding(.top, 4)
                }
                .font(.system(size: 25, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .padding(23)
            }
            .frame(height: 285)
            .clipShape(RoundedRectangle(cornerRadius: 28))

            sectionHeading("LE TUE AREE", subtitle: "Due esperienze. Una sola app.")
            HStack(spacing: 12) {
                featureTile(title: "PLAY", subtitle: "Il mondo PSP", symbol: "gamecontroller.fill", tint: lavender) {
                    selectedTab = .play
                }
                featureTile(title: "WATCH", subtitle: "Film, serie e UMD", symbol: "play.rectangle.fill", tint: coral) {
                    selectedTab = .watch
                }
            }

            if !videos.isEmpty || !discs.isEmpty {
                sectionHeading("AGGIUNTI DI RECENTE", subtitle: "Riprendi dalla tua raccolta")
                recentContent
            }

            actionTile("Apri il browser", symbol: "safari.fill", tint: lavender) {
                selectedTab = .browser
            }

            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .foregroundStyle(coral)
                Text("Una libreria costruita intorno ai tuoi contenuti.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.58))
            }
            .padding(.top, 2)
        }
        .padding(.top, 4)
    }

    private var playPage: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("PLAY", eyebrow: "GAMING", detail: "La tua raccolta di giochi portatili.")
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 24).fill(
                    LinearGradient(colors: [Color(red: 0.22, green: 0.20, blue: 0.36), panel], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                Image(systemName: "gamecontroller.fill")
                    .font(.system(size: 76))
                    .foregroundStyle(lavender.opacity(0.18))
                    .rotationEffect(.degrees(-18))
                    .padding(20)
                VStack(alignment: .leading, spacing: 10) {
                    Text("PSP GAMES")
                        .font(.system(size: 12, weight: .black, design: .rounded))
                        .tracking(2)
                        .foregroundStyle(lavender)
                    Text("La prossima partita\ninizia qui.")
                        .font(.system(size: 25, weight: .bold, design: .rounded))
                    Text("L'integrazione del motore per i giochi PSP è una fase separata dal lettore UMD Video.")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(22)
            }
            .frame(minHeight: 205)

            sectionHeading("I TUOI GIOCHI", subtitle: "Importazione ISO e CSO")
            Button { showingGameImporter = true } label: {
                Label("IMPORTA GIOCHI PSP", systemImage: "plus.rectangle.on.folder")
                    .font(.system(size: 12, weight: .bold))
                    .frame(maxWidth: .infinity).padding(15)
                    .background(lavender.opacity(0.18), in: RoundedRectangle(cornerRadius: 14))
            }
            if games.isEmpty {
                emptyMessage("Nessun gioco importato", detail: "Seleziona un file ISO o CSO dalla tua app File.")
            } else {
                ForEach(games.sorted { left, right in
                    let leftFavorite = favoriteGamePaths.contains(left.url.path)
                    let rightFavorite = favoriteGamePaths.contains(right.url.path)
                    if leftFavorite != rightFavorite { return leftFavorite }
                    return left.title.localizedStandardCompare(right.title) == .orderedAscending
                }) { game in
                    HStack {
                        Image(systemName: "gamecontroller.fill").foregroundStyle(lavender)
                        Text(game.title).font(.system(size: 13, weight: .semibold))
                        Spacer()
                        Button {
                            toggleGameFavorite(game)
                        } label: {
                            Image(systemName: favoriteGamePaths.contains(game.url.path) ? "star.fill" : "star")
                                .foregroundStyle(lavender)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(favoriteGamePaths.contains(game.url.path) ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti")
                        Text("IN ATTESA DEL CORE").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                    .padding(12).background(panel, in: RoundedRectangle(cornerRadius: 12))
                    .contextMenu {
                        Button(role: .destructive) { removeGame(game) } label: {
                            Label("Rimuovi gioco", systemImage: "trash")
                        }
                    }
                }
            }
            sectionHeading("CONTROLLER", subtitle: "Stato del collegamento Bluetooth")
            HStack(spacing: 14) {
                Image(systemName: "gamecontroller")
                    .font(.system(size: 25))
                    .foregroundStyle(lavender)
                    .frame(width: 52, height: 52)
                    .background(lavender.opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
                VStack(alignment: .leading, spacing: 4) {
                    Text(controllerManager.isConnected ? (controllerManager.connectedControllerName ?? "Controller collegato") : "Nessun controller collegato")
                        .font(.system(size: 14, weight: .bold))
                    Text(controllerManager.isConnected ? "Rilevato da iOS" : "Puoi usare il touch o collegare un controller compatibile dalle Impostazioni Bluetooth.")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                }
                Spacer(minLength: 0)
                Circle().fill(controllerManager.isConnected ? Color.green : .white.opacity(0.18)).frame(width: 8, height: 8)
            }
            .padding(16)
            .background(panel, in: RoundedRectangle(cornerRadius: 20))

            Text("Nota: il lettore UMD Video già presente non è un emulatore di giochi. Il core PSP verrà integrato e verificato separatamente.")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.43))
                .padding(.horizontal, 2)
        }
        .padding(.top, 8)
    }

    private var watchPage: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("WATCH", eyebrow: "CINEMA & VIDEO", detail: "Film, serie, UMD Video e contenuti personali.")
            Picker("Categoria video", selection: $selectedImportCategory) {
                ForEach(VideoCategory.allCases) { category in
                    Text(category.rawValue).tag(category)
                }
            }
            .pickerStyle(.segmented)

            HStack(spacing: 10) {
                actionTile("Importa video", symbol: "plus.rectangle.on.folder", tint: coral) {
                    // Keep the category selected in the segmented picker.
                    showingVideoImporter = true
                }
                actionTile("Aggiungi link", symbol: "link", tint: lavender) {
                    showingLinkSheet = true
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                sectionHeading("LA TUA RACCOLTA", subtitle: "Scegli cosa vuoi guardare")
                categoryRow("Film", detail: "\(videos.filter { $0.category == .films }.count) contenuti", symbol: "film", tint: coral)
                categoryRow("Serie TV", detail: "\(videos.filter { $0.category == .series }.count) contenuti", symbol: "tv", tint: lavender)
                categoryRow("Video personali", detail: "\(videos.filter { $0.category == .personal }.count) contenuti", symbol: "video", tint: .cyan)
                categoryRow("UMD Video", detail: "\(discs.count) dischi importati", symbol: "opticaldisc", tint: .orange)
            }

            if !videos.isEmpty {
                sectionHeading("VIDEO", subtitle: "File locali e link compatibili")
                videoList(videos)
            }
            if !discs.isEmpty {
                sectionHeading("UMD VIDEO", subtitle: "I tuoi dischi PSP")
                discList
            }
            if videos.isEmpty && discs.isEmpty {
                emptyWatchState
            }
            Button {
                showingISOImporter = true
            } label: {
                Label("IMPORTA UMD VIDEO (.ISO)", systemImage: "opticaldisc")
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .tracking(1)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 15))
                    .foregroundStyle(.white)
            }
        }
        .padding(.top, 8)
    }

    private var libraryPage: some View {
        VStack(alignment: .leading, spacing: 22) {
            pageTitle("LIBRARY", eyebrow: "LA TUA COLLEZIONE", detail: "Tutto quello che hai aggiunto a FRAME.")
            sectionHeading("VIDEO", subtitle: "\(videos.count) contenuti")
            if videos.isEmpty {
                emptyMessage("Ancora nessun video", detail: "Importa un film, una puntata o un video personale.")
            } else {
                videoList(videos)
            }
            sectionHeading("UMD VIDEO", subtitle: "\(discs.count) dischi")
            if discs.isEmpty {
                emptyMessage("Nessun UMD Video", detail: "Importa un'immagine ISO dalla tua app File.")
            } else {
                discList
            }
        }
        .padding(.top, 8)
    }

    private var recentContent: some View {
        VStack(spacing: 10) {
            ForEach(videos.prefix(3)) { item in
                videoRow(item)
            }
            ForEach(discs.prefix(2)) { disc in
                discRow(disc)
            }
        }
    }

    private var discList: some View {
        VStack(spacing: 10) {
            ForEach(discs) { disc in discRow(disc) }
        }
    }

    private var emptyWatchState: some View {
        VStack(spacing: 10) {
            Image(systemName: "play.square.stack")
                .font(.system(size: 34))
                .foregroundStyle(coral)
            Text("La tua serata comincia da qui")
                .font(.system(size: 16, weight: .bold))
            Text("Aggiungi un file video, un link diretto compatibile o un UMD Video.")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.52))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26)
        .background(panel.opacity(0.75), in: RoundedRectangle(cornerRadius: 20))
    }

    private var linkImportSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Aggiungi un collegamento video")
                    .font(.system(size: 21, weight: .bold, design: .rounded))
                Text("Incolla un link diretto a un file o a uno streaming compatibile con AVPlayer, per esempio MP4 o HLS (.m3u8). Le normali pagine web e i servizi con DRM non sono automaticamente riproducibili.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                TextField("https://…", text: $linkText)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                TextField("Titolo (facoltativo)", text: $linkTitle)
                    .padding(14)
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                Picker("Sezione", selection: $selectedImportCategory) {
                    ForEach(VideoCategory.allCases) { category in
                        Text(category.rawValue).tag(category)
                    }
                }
                .pickerStyle(.segmented)
                Spacer()
                Button(action: addExternalLink) {
                    Text("AGGIUNGI ALLA LIBRERIA")
                        .font(.system(size: 12, weight: .black, design: .rounded))
                        .tracking(1)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(coral, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(ink)
                }
            }
            .padding(22)
            .background(ink.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Chiudi") { showingLinkSheet = false }
                }
            }
        }
    }

    private func discPlayer(_ disc: ImportedDisc) -> some View {
        VStack(spacing: 0) {
            playerHeader(title: disc.name) { playingDisc = nil }
            UMDVideoPlayerScreen(path: disc.url.path, onError: { message in
                playingDisc = nil
                importError = message
            }, onFinish: {
                playingDisc = nil
            })
        }
        .background(.black)
        .ignoresSafeArea(edges: .bottom)
    }

    private func videoPlayer(_ item: LibraryVideo) -> some View {
        VStack(spacing: 0) {
            playerHeader(title: item.title) { playingVideo = nil }
            if let url = item.url {
                GeneralVideoPlayerScreen(url: url)
                    .background(.black)
            } else {
                emptyMessage("Link non valido", detail: "Controlla l'indirizzo del contenuto.")
            }
        }
        .background(.black)
        .ignoresSafeArea(edges: .bottom)
    }

    private func playerHeader(title: String, back: @escaping () -> Void) -> some View {
        HStack(spacing: 12) {
            Button(action: back) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.10), in: Circle())
            }
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
            Spacer()
            Text("FRAME")
                .font(.system(size: 10, weight: .black, design: .rounded))
                .tracking(2)
                .foregroundStyle(coral)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(ink)
    }

    private func pageTitle(_ title: String, eyebrow: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(eyebrow.uppercased())
                .font(.system(size: 9, weight: .black, design: .rounded))
                .tracking(2.4)
                .foregroundStyle(coral)
            Text(title)
                .font(.system(size: 34, weight: .black, design: .rounded))
                .tracking(1)
            Text(detail)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.52))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sectionHeading(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 14, weight: .black, design: .rounded))
                .tracking(1.4)
            Text(subtitle)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    private func featureTile(title: String, subtitle: String, symbol: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: symbol)
                    .font(.system(size: 25, weight: .semibold))
                    .foregroundStyle(tint)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .tracking(1.5)
                    Text(subtitle)
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(17)
            .background(panel, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(tint.opacity(0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func actionTile(_ title: String, symbol: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: symbol).font(.system(size: 21)).foregroundStyle(tint)
                Text(title).font(.system(size: 12, weight: .bold))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(panel, in: RoundedRectangle(cornerRadius: 17))
        }
        .buttonStyle(.plain)
    }

    private func categoryRow(_ title: String, detail: String, symbol: String, tint: Color) -> some View {
        HStack(spacing: 13) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 43, height: 43)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 13, weight: .bold))
                Text(detail).font(.system(size: 10)).foregroundStyle(.white.opacity(0.45))
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.3))
        }
        .padding(12)
        .background(panel.opacity(0.8), in: RoundedRectangle(cornerRadius: 17))
    }

    private func videoList(_ items: [LibraryVideo]) -> some View {
        VStack(spacing: 9) {
            ForEach(items) { item in videoRow(item) }
        }
    }

    private func videoRow(_ item: LibraryVideo) -> some View {
        Button {
            playingVideo = item
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(item.category == .series ? lavender.opacity(0.16) : coral.opacity(0.14))
                    .frame(width: 54, height: 58)
                    .overlay {
                        Image(systemName: item.category.symbol)
                            .font(.system(size: 21))
                            .foregroundStyle(item.category == .series ? lavender : coral)
                    }
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.title).font(.system(size: 13, weight: .bold)).lineLimit(2)
                    Text(item.isRemote ? "LINK ESTERNO • \(item.category.rawValue.uppercased())" : "FILE LOCALE • \(item.category.rawValue.uppercased())")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .tracking(0.8)
                        .foregroundStyle(.white.opacity(0.42))
                }
                Spacer()
                Image(systemName: "play.fill").font(.system(size: 12)).foregroundStyle(coral)
            }
            .padding(10)
            .background(panel, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) { removeVideo(item) } label: {
                Label("Rimuovi dalla libreria", systemImage: "trash")
            }
        }
    }

    private func discRow(_ disc: ImportedDisc) -> some View {
        Button {
            // Only launch the custom UMD engine for an ISO whose UMD_VIDEO
            // directory and playlist were successfully identified.
            if disc.isUMDVideo {
                playingDisc = disc
            } else {
                selectedDisc = disc
            }
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orange.opacity(0.13))
                    .frame(width: 54, height: 58)
                    .overlay(Image(systemName: "opticaldisc.fill").font(.system(size: 22)).foregroundStyle(.orange))
                VStack(alignment: .leading, spacing: 5) {
                    Text(disc.name).font(.system(size: 13, weight: .bold)).lineLimit(2)
                    Text(disc.isUMDVideo ? "UMD VIDEO • \(disc.streamCount) TRACCE" : "ISO NON RICONOSCIUTA")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .tracking(0.8)
                        .foregroundStyle(.white.opacity(0.42))
                }
                Spacer()
                Image(systemName: disc.isUMDVideo ? "play.fill" : "info.circle")
                    .font(.system(size: 12))
                    .foregroundStyle(disc.isUMDVideo ? coral : .white.opacity(0.5))
            }
            .padding(10)
            .background(panel, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private func emptyMessage(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 13, weight: .bold))
            Text(detail).font(.system(size: 11)).foregroundStyle(.white.opacity(0.48))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(panel.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
    }

    private func toggleGameFavorite(_ game: PSPGame) {
        if favoriteGamePaths.contains(game.url.path) {
            favoriteGamePaths.remove(game.url.path)
        } else {
            favoriteGamePaths.insert(game.url.path)
        }
        UserDefaults.standard.set(Array(favoriteGamePaths), forKey: "frame.play.favorites.v1")
    }

    private func removeGame(_ game: PSPGame) {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let folder = documents.appendingPathComponent("PSPGames", isDirectory: true)
        guard game.url.deletingLastPathComponent().standardizedFileURL == folder.standardizedFileURL else {
            importError = "Il gioco non si trova nella cartella gestita da FRAME."
            return
        }
        do {
            try FileManager.default.removeItem(at: game.url)
            games.removeAll { $0.id == game.id }
            favoriteGamePaths.remove(game.url.path)
            UserDefaults.standard.set(Array(favoriteGamePaths), forKey: "frame.play.favorites.v1")
        } catch {
            importError = "Impossibile rimuovere il gioco: \(error.localizedDescription)"
        }
    }

    private func isSupportedPSPGameImage(_ url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        guard ["iso", "cso"].contains(ext),
              let handle = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? handle.close() }
        do {
            if ext == "cso" {
                guard let header = try handle.read(upToCount: 24), header.count == 24,
                      header.prefix(4) == Data([0x43, 0x49, 0x53, 0x4F]) else { return false }
                let headerSize = UInt32(header[4]) |
                    (UInt32(header[5]) << 8) |
                    (UInt32(header[6]) << 16) |
                    (UInt32(header[7]) << 24)
                return headerSize >= 24 && header[20] == 1
            }
            // ISO9660 primary volume descriptor starts at logical sector 16.
            try handle.seek(toOffset: 16 * 2048)
            guard let descriptor = try handle.read(upToCount: 6),
                  descriptor.count == 6 else { return false }
            return descriptor[0] == 1 &&
                descriptor.subdata(in: 1..<6) == Data("CD001".utf8)
        } catch {
            return false
        }
    }

    private func handleGameImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else {
            if case .failure(let error) = result { importError = error.localizedDescription }
            return
        }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let folder = documents.appendingPathComponent("PSPGames", isDirectory: true)
        do { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        catch { importError = error.localizedDescription; return }
        for url in urls {
            let granted = url.startAccessingSecurityScopedResource()
            defer { if granted { url.stopAccessingSecurityScopedResource() } }
            do {
                guard isSupportedPSPGameImage(url) else {
                    importError = "File non valido: \(url.lastPathComponent). Seleziona un'immagine ISO9660 o CSO riconosciuta."
                    continue
                }
                var destination = folder.appendingPathComponent(url.lastPathComponent)
                if FileManager.default.fileExists(atPath: destination.path) {
                    destination = folder.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                }
                try FileManager.default.copyItem(at: url, to: destination)
                games.append(PSPGame(url: destination))
            } catch { importError = error.localizedDescription }
        }
    }

    private func loadLibrary() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        favoriteGamePaths = Set(UserDefaults.standard.stringArray(forKey: "frame.play.favorites.v1") ?? [])
        let gameFolder = documents.appendingPathComponent("PSPGames", isDirectory: true)
        if let gameFiles = try? FileManager.default.contentsOfDirectory(at: gameFolder, includingPropertiesForKeys: nil) {
            games = gameFiles.filter { ["iso", "cso"].contains($0.pathExtension.lowercased()) }
                .map { PSPGame(url: $0) }
                .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        }
        if let data = UserDefaults.standard.data(forKey: "frame.videoLibrary.v1"),
           let saved = try? JSONDecoder().decode([LibraryVideo].self, from: data) {
            videos = saved.filter { item in
                guard let url = item.url else { return false }
                return item.isRemote || FileManager.default.fileExists(atPath: url.path)
            }
        }
        if let files = try? FileManager.default.contentsOfDirectory(at: documents, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
            discs = files.filter { $0.pathExtension.lowercased() == "iso" }.map { url in
                let inspection = try? UMDVideoISOReader.inspect(url)
                let volume = inspection?.volumeName ?? ""
                return ImportedDisc(
                    name: volume.isEmpty ? url.deletingPathExtension().lastPathComponent : volume,
                    url: url,
                    isISO: true,
                    isUMDVideo: inspection != nil,
                    streamCount: inspection?.streamFiles.count ?? 0,
                    statusMessage: inspection.map { "UMD Video riconosciuto: \($0.streamFiles.count) tracce MPS." } ?? "ISO importata. La struttura UMD Video non è stata riconosciuta."
                )
            }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
    }

    private func handleISOImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else {
            if case .failure(let error) = result { importError = error.localizedDescription }
            return
        }
        for url in urls {
            let granted = url.startAccessingSecurityScopedResource()
            defer { if granted { url.stopAccessingSecurityScopedResource() } }
            do {
                let destination = uniqueDestination(for: url)
                try FileManager.default.copyItem(at: url, to: destination)
                let inspection = try? UMDVideoISOReader.inspect(destination)
                let volume = inspection?.volumeName ?? ""
                discs.append(ImportedDisc(
                    name: volume.isEmpty ? destination.deletingPathExtension().lastPathComponent : volume,
                    url: destination,
                    isISO: true,
                    isUMDVideo: inspection != nil,
                    streamCount: inspection?.streamFiles.count ?? 0,
                    statusMessage: inspection.map { "Struttura UMD_VIDEO trovata. Individuate \($0.streamFiles.count) tracce MPS." } ?? "File ISO importato, ma non è stata riconosciuta una struttura UMD Video."
                ))
            } catch {
                importError = error.localizedDescription
            }
        }
    }

    private func handleVideoImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else {
            if case .failure(let error) = result { importError = error.localizedDescription }
            return
        }
        for url in urls {
            let granted = url.startAccessingSecurityScopedResource()
            defer { if granted { url.stopAccessingSecurityScopedResource() } }
            do {
                let destination = uniqueDestination(for: url)
                try FileManager.default.copyItem(at: url, to: destination)
                let item = LibraryVideo(
                    title: destination.deletingPathExtension().lastPathComponent,
                    source: destination.absoluteString,
                    category: selectedImportCategory,
                    isRemote: false
                )
                videos.insert(item, at: 0)
            } catch {
                importError = error.localizedDescription
            }
        }
        saveVideoLibrary()
    }

    private func uniqueDestination(for source: URL) -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        var destination = documents.appendingPathComponent(source.lastPathComponent)
        if FileManager.default.fileExists(atPath: destination.path) {
            let base = source.deletingPathExtension().lastPathComponent
            let ext = source.pathExtension
            var suffix = 2
            repeat {
                let name = ext.isEmpty ? "\(base)-\(suffix)" : "\(base)-\(suffix).\(ext)"
                destination = documents.appendingPathComponent(name)
                suffix += 1
            } while FileManager.default.fileExists(atPath: destination.path)
        }
        return destination
    }

    private func addExternalLink() {
        let trimmed = linkText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              url.host != nil else {
            importError = "Inserisci un indirizzo HTTP o HTTPS valido."
            return
        }
        let title = linkTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        videos.insert(
            LibraryVideo(
                title: title.isEmpty ? (url.lastPathComponent.isEmpty ? url.host ?? "Video online" : url.deletingPathExtension().lastPathComponent) : title,
                source: url.absoluteString,
                category: selectedImportCategory,
                isRemote: true
            ),
            at: 0
        )
        saveVideoLibrary()
        linkText = ""
        linkTitle = ""
        showingLinkSheet = false
    }

    private func removeVideo(_ item: LibraryVideo) {
        // Only remove imported copies inside the app's Documents directory.
        if !item.isRemote, let url = item.url {
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            if url.deletingLastPathComponent().standardizedFileURL == documents.standardizedFileURL {
                do {
                    try FileManager.default.removeItem(at: url)
                } catch {
                    importError = "Impossibile eliminare il file locale: \(error.localizedDescription)"
                    return
                }
            }
        }
        videos.removeAll { $0.id == item.id }
        saveVideoLibrary()
    }

    private func saveVideoLibrary() {
        guard let data = try? JSONEncoder().encode(videos) else { return }
        UserDefaults.standard.set(data, forKey: "frame.videoLibrary.v1")
    }
}

private extension UTType {
    static let pspGameISO = UTType(filenameExtension: "iso") ?? .data
    static let pspGameCSO = UTType(filenameExtension: "cso") ?? .data
    static let isoImage = UTType(filenameExtension: "iso") ?? .data
}
