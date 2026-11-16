import SwiftUI
import UniformTypeIdentifiers

private enum PlayerStyle: String, CaseIterable, Identifiable {
    case modern = "Moderna"
    case psp = "PSP"

    var id: String { rawValue }
}

struct ImportedDisc: Identifiable {
    let id = UUID()
    let name: String
    let url: URL
    let isUMDVideo: Bool
    let streamCount: Int
    let statusMessage: String
}

struct ContentView: View {
    @State private var style: PlayerStyle = .modern
    @State private var showingImporter = false
    @State private var discs: [ImportedDisc] = []
    @State private var selectedDisc: ImportedDisc?
    @State private var importError: String?

    var body: some View {
        ZStack {
            background
            VStack(spacing: 0) {
                header
                Picker("Interfaccia", selection: $style) {
                    ForEach(PlayerStyle.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.top, 14)

                if style == .modern {
                    modernLibrary
                } else {
                    pspLibrary
                }
            }
        }
        .fileImporter(
            isPresented: $showingImporter,
            allowedContentTypes: [.isoImage, .data],
            allowsMultipleSelection: true,
            onCompletion: handleImport
        )
        .alert("Errore di importazione", isPresented: Binding(
            get: { importError != nil },
            set: { if !$0 { importError = nil } }
        )) {
            Button("OK", role: .cancel) { importError = nil }
        } message: {
            Text(importError ?? "")
        }
        .preferredColorScheme(.dark)
    }

    private var background: some View {
        LinearGradient(
            colors: style == .psp
                ? [Color(red: 0.04, green: 0.13, blue: 0.22), .black]
                : [Color(red: 0.12, green: 0.13, blue: 0.18), .black],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("UMD VIDEO")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .tracking(3)
                    .foregroundStyle(.cyan)
                Text(style == .psp ? "Media XMB" : "La tua libreria")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
            }
            Spacer()
            Button {
                showingImporter = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .bold))
                    .frame(width: 44, height: 44)
                    .background(.white.opacity(0.12), in: Circle())
            }
            .accessibilityLabel("Importa ISO")
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
    }

    private var modernLibrary: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("I tuoi UMD")
                    .font(.title2.bold())
                Spacer()
                Text("\(discs.count) DISCHI")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            if discs.isEmpty {
                emptyState(psp: false)
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(discs) { disc in
                            Button {
                                selectedDisc = disc
                            } label: {
                                HStack(spacing: 14) {
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(.cyan.opacity(0.15))
                                        .frame(width: 62, height: 76)
                                        .overlay {
                                            Image(systemName: "opticaldisc")
                                                .font(.system(size: 30))
                                                .foregroundStyle(.cyan)
                                        }
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(disc.name)
                                            .font(.headline)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                        Text(disc.isUMDVideo ? "UMD Video • \(disc.streamCount) tracce" : "ISO non riconosciuta")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(.secondary)
                                }
                                .padding(12)
                                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            importButton
        }
        .padding(20)
        .alert(selectedDisc?.isUMDVideo == true ? "UMD Video riconosciuto" : "Immagine non riconosciuta", isPresented: Binding(
            get: { selectedDisc != nil },
            set: { if !$0 { selectedDisc = nil } }
        )) {
            Button("OK", role: .cancel) { selectedDisc = nil }
        } message: {
            Text(selectedDisc?.statusMessage ?? "")
        }
    }

    private var pspLibrary: some View {
        VStack(spacing: 22) {
            HStack(spacing: 12) {
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 25))
                    .foregroundStyle(.cyan)
                Text("VIDEO")
                    .font(.system(size: 22, weight: .light, design: .rounded))
                Spacer()
                Image(systemName: "gearshape")
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding(.top, 28)

            if discs.isEmpty {
                emptyState(psp: true)
            } else {
                ScrollView {
                    VStack(spacing: 14) {
                        ForEach(discs) { disc in
                            Button {
                                selectedDisc = disc
                            } label: {
                                HStack {
                                    Image(systemName: "opticaldisc.fill")
                                        .font(.system(size: 34))
                                        .foregroundStyle(.cyan)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(disc.name).font(.headline)
                                        Text(disc.isUMDVideo ? "UMD VIDEO" : "ISO NON RICONOSCIUTA").font(.caption2).tracking(2).foregroundStyle(disc.isUMDVideo ? .cyan : .orange)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                }
                                .padding(16)
                                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            Spacer()
            importButton
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
        .alert(selectedDisc?.isUMDVideo == true ? "UMD Video riconosciuto" : "Immagine non riconosciuta", isPresented: Binding(
            get: { selectedDisc != nil },
            set: { if !$0 { selectedDisc = nil } }
        )) {
            Button("OK", role: .cancel) { selectedDisc = nil }
        } message: {
            Text(selectedDisc?.statusMessage ?? "")
        }
    }

    private func emptyState(psp: Bool) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "opticaldisc")
                .font(.system(size: 58, weight: .ultraLight))
                .foregroundStyle(.cyan.opacity(0.85))
            Text(psp ? "Nessun UMD inserito" : "La libreria è vuota")
                .font(.title3.bold())
            Text("Importa un'immagine ISO dall'app File per aggiungerla alla libreria.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var importButton: some View {
        Button {
            showingImporter = true
        } label: {
            Label("Importa UMD Video (.ISO)", systemImage: "folder")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(.cyan, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(.black)
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else {
            if case .failure(let error) = result { importError = error.localizedDescription }
            return
        }
        for url in urls {
            let granted = url.startAccessingSecurityScopedResource()
            defer {
                if granted { url.stopAccessingSecurityScopedResource() }
            }

            do {
                let documents = FileManager.default.urls(
                    for: .documentDirectory,
                    in: .userDomainMask
                )[0]
                let destination = documents.appendingPathComponent(url.lastPathComponent)

                if !FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.copyItem(at: url, to: destination)
                }

                let discName = destination.deletingPathExtension().lastPathComponent
                let disc: ImportedDisc
                do {
                    let info = try UMDVideoISOReader.inspect(destination)
                    disc = ImportedDisc(
                        name: info.volumeName.isEmpty ? discName : info.volumeName,
                        url: destination,
                        isUMDVideo: true,
                        streamCount: info.streamFiles.count,
                        statusMessage: "Struttura UMD_VIDEO trovata. Playlist riconosciuta e \\(info.streamFiles.count) file video MPS individuati. Il prossimo passaggio è collegare il decoder e il lettore."
                    )
                } catch {
                    disc = ImportedDisc(
                        name: discName,
                        url: destination,
                        isUMDVideo: false,
                        streamCount: 0,
                        statusMessage: error.localizedDescription
                    )
                }
                if !discs.contains(where: { $0.url == disc.url }) {
                    discs.append(disc)
                }
            } catch {
                importError = error.localizedDescription
            }
        }
    }
}

private extension UTType {
    static let isoImage = UTType(filenameExtension: "iso") ?? .data
}
