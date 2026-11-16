import Foundation

/// Minimal ISO-9660 reader used to identify genuine PSP UMD Video discs.
/// It reads directory sectors directly; it does not extract or transcode the movie.
struct UMDVideoISOReader {
    struct DiscInfo {
        let volumeName: String
        let playlistPath: String
        let streamFiles: [String]
    }

    enum ReadError: LocalizedError {
        case unreadableImage
        case invalidISO
        case missingUMDVideoFolder
        case missingPlaylist
        case directoryTooLarge

        var errorDescription: String? {
            switch self {
            case .unreadableImage: return "Impossibile leggere il file ISO."
            case .invalidISO: return "Il file non sembra essere un'immagine ISO-9660 valida."
            case .missingUMDVideoFolder: return "Nell'immagine non è presente la cartella UMD_VIDEO."
            case .missingPlaylist: return "La cartella UMD_VIDEO non contiene PLAYLIST.UMD."
            case .directoryTooLarge: return "La struttura ISO contiene una directory troppo grande o non valida."
            }
        }
    }

    private static let sectorSize = 2048
    private static let maximumDirectorySize = 16 * 1024 * 1024

    private struct Entry {
        let name: String
        let extent: UInt32
        let size: UInt32
        let isDirectory: Bool
    }

    static func inspect(_ url: URL) throws -> DiscInfo {
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            throw ReadError.unreadableImage
        }
        defer { try? handle.close() }
        let resourceValues = try? url.resourceValues(forKeys: [.fileSizeKey])
        let fileSize = UInt64(resourceValues?.fileSize ?? 0)
        guard fileSize >= UInt64(17 * sectorSize) else { throw ReadError.invalidISO }

        guard let descriptor = readExactly(handle, offset: UInt64(16 * sectorSize), count: sectorSize),
              descriptor.count == sectorSize,
              descriptor[0] == 1,
              String(decoding: descriptor[1...5], as: UTF8.self) == "CD001",
              descriptor[6] == 1 else {
            throw ReadError.invalidISO
        }

        let volumeName = String(decoding: descriptor[40..<72], as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let root = parseEntry(Array(descriptor[156...])) else {
            throw ReadError.invalidISO
        }

        let rootEntries = try readDirectory(handle, entry: root, fileSize: fileSize)
        guard let videoFolder = rootEntries.first(where: {
            $0.isDirectory && $0.name.caseInsensitiveCompare("UMD_VIDEO") == .orderedSame
        }) else {
            throw ReadError.missingUMDVideoFolder
        }

        let videoEntries = try readDirectory(handle, entry: videoFolder, fileSize: fileSize)
        guard let playlist = videoEntries.first(where: {
            !$0.isDirectory && $0.name.uppercased().hasPrefix("PLAYLIST.UMD")
        }) else {
            throw ReadError.missingPlaylist
        }

        let streamFolder = videoEntries.first(where: {
            $0.isDirectory && $0.name.caseInsensitiveCompare("STREAM") == .orderedSame
        })
        let streams = try streamFolder.map { folder in
            try readDirectory(handle, entry: folder, fileSize: fileSize)
                .filter { !$0.isDirectory && $0.name.uppercased().hasSuffix(".MPS") }
                .map(\.name)
                .sorted()
        } ?? []

        return DiscInfo(
            volumeName: volumeName.isEmpty ? url.deletingPathExtension().lastPathComponent : volumeName,
            playlistPath: "UMD_VIDEO/\(playlist.name)",
            streamFiles: streams
        )
    }

    private static func readDirectory(_ handle: FileHandle, entry: Entry, fileSize: UInt64) throws -> [Entry] {
        let directoryOffset = UInt64(entry.extent) * UInt64(sectorSize)
        let size = UInt64(entry.size)
        guard size > 0, size <= UInt64(maximumDirectorySize), directoryOffset <= fileSize, size <= fileSize - directoryOffset else {
            throw ReadError.directoryTooLarge
        }
        let data = readExactly(handle, offset: directoryOffset, count: Int(size)) ?? Data()
        guard data.count == Int(entry.size) else { throw ReadError.invalidISO }

        var entries: [Entry] = []
        var cursor = 0

        while cursor < data.count {
            let recordLength = Int(data[cursor])
            if recordLength == 0 {
                cursor = ((cursor / sectorSize) + 1) * sectorSize
                continue
            }
            guard recordLength >= 34, cursor + recordLength <= data.count else {
                throw ReadError.invalidISO
            }
            let record = Array(data[cursor..<(cursor + recordLength)])
            if let parsed = parseEntry(record), parsed.name != "." && parsed.name != ".." {
                entries.append(parsed)
            }
            cursor += recordLength
        }
        return entries
    }

    private static func parseEntry(_ bytes: [UInt8]) -> Entry? {
        guard bytes.count >= 34 else { return nil }
        let identifierLength = Int(bytes[32])
        guard identifierLength > 0, 33 + identifierLength <= bytes.count else { return nil }

        let rawName = Array(bytes[33..<(33 + identifierLength)])
        let name: String
        if rawName.count == 1 && rawName[0] == 0 {
            name = "."
        } else if rawName.count == 1 && rawName[0] == 1 {
            name = ".."
        } else {
            name = String(decoding: rawName, as: UTF8.self)
                .replacingOccurrences(of: #";[0-9]+$"#, with: "", options: .regularExpression)
        }

        let extent = UInt32(bytes[2]) |
            (UInt32(bytes[3]) << 8) |
            (UInt32(bytes[4]) << 16) |
            (UInt32(bytes[5]) << 24)
        let size = UInt32(bytes[10]) |
            (UInt32(bytes[11]) << 8) |
            (UInt32(bytes[12]) << 16) |
            (UInt32(bytes[13]) << 24)

        return Entry(name: name, extent: extent, size: size, isDirectory: (bytes[25] & 0x02) != 0)
    }

    private static func readExactly(_ handle: FileHandle, offset: UInt64, count: Int) -> Data? {
        guard count >= 0 else { return nil }
        do {
            try handle.seek(toOffset: offset)
            guard let data = try handle.read(upToCount: count), data.count == count else { return nil }
            return data
        } catch {
            return nil
        }
    }
}
