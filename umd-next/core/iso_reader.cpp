#include "iso_reader.h"
#include <algorithm>
#include <cstring>

#ifdef _WIN32
#define fseek64 _fseeki64
#else
#define fseek64 fseeko
#endif

IsoReader::~IsoReader() {
    if (file_) {
        fclose(file_);
        file_ = nullptr;
    }
}

bool IsoReader::openFromPath(const std::string& path) {
    if (file_) fclose(file_);
    file_ = fopen(path.c_str(), "rb");
    return file_ != nullptr;
}

bool IsoReader::openFromFd(int fd) {
    if (file_) fclose(file_);
    file_ = fdopen(fd, "rb");
    return file_ != nullptr;
}

bool IsoReader::readSector(uint32_t lba, uint8_t* buffer) {
    if (!file_) return false;
    uint64_t offset = static_cast<uint64_t>(lba) * SECTOR_SIZE;
    if (fseek64(file_, offset, SEEK_SET) != 0) return false;
    return fread(buffer, 1, SECTOR_SIZE, file_) == SECTOR_SIZE;
}

std::string IsoReader::normalizeIsoName(const char* rawName, uint8_t len) {
    std::string name(rawName, len);
    // Rimuove il suffisso versione ISO 9660 (es. "00001.MPS;1" -> "00001.MPS")
    size_t semi = name.find(';');
    if (semi != std::string::npos) {
        name = name.substr(0, semi);
    }
    return name;
}

std::vector<IsoReader::DirEntry> IsoReader::readDirectory(uint32_t dirLba, uint32_t dirSize) {
    std::vector<DirEntry> entries;
    uint32_t sectorsToRead = (dirSize + SECTOR_SIZE - 1) / SECTOR_SIZE;
    std::vector<uint8_t> buffer(sectorsToRead * SECTOR_SIZE);

    for (uint32_t i = 0; i < sectorsToRead; ++i) {
        if (!readSector(dirLba + i, buffer.data() + (i * SECTOR_SIZE))) {
            return entries;
        }
    }

    uint32_t pos = 0;
    while (pos < dirSize) {
        uint8_t recordLen = buffer[pos];
        
        // Se recordLen == 0, il resto del settore corrente e' padding: salta al settore successivo
        if (recordLen == 0) {
            pos = ((pos / SECTOR_SIZE) + 1) * SECTOR_SIZE;
            continue;
        }

        if (pos + recordLen > dirSize) break;

        uint32_t extentLba = *reinterpret_cast<uint32_t*>(&buffer[pos + 2]);
        uint32_t dataLen   = *reinterpret_cast<uint32_t*>(&buffer[pos + 10]);
        uint8_t flags      = buffer[pos + 25];
        uint8_t nameLen    = buffer[pos + 32];

        // Ignora le voci speciali "." (0x00) e ".." (0x01)
        if (!(nameLen == 1 && (buffer[pos + 33] == 0x00 || buffer[pos + 33] == 0x01))) {
            DirEntry entry;
            entry.name = normalizeIsoName(reinterpret_cast<const char*>(&buffer[pos + 33]), nameLen);
            entry.lba = extentLba;
            entry.size = dataLen;
            entry.isDirectory = (flags & 0x02) != 0;
            entries.push_back(entry);
        }

        pos += recordLen;
    }

    return entries;
}

std::vector<UmdStreamFile> IsoReader::findUmdStreams() {
    std::vector<UmdStreamFile> results;
    uint8_t pvd[SECTOR_SIZE];

    // 1. Legge il Primary Volume Descriptor al settore 16
    if (!readSector(16, pvd)) return results;

    // Verifica firma standard ISO 9660: 0x01 + "CD001"
    if (pvd[0] != 0x01 || std::memcmp(&pvd[1], "CD001", 5) != 0) {
        return results;
    }

    // 2. Estrae LBA e dimensione della Root Directory (offset 156 nel PVD)
    uint32_t rootLba  = *reinterpret_cast<uint32_t*>(&pvd[156 + 2]);
    uint32_t rootSize = *reinterpret_cast<uint32_t*>(&pvd[156 + 10]);

    // 3. Cerca la cartella "UMD_VIDEO" nella Root
    auto rootEntries = readDirectory(rootLba, rootSize);
    uint32_t umdVideoLba = 0, umdVideoSize = 0;
    for (const auto& entry : rootEntries) {
        if (entry.isDirectory && entry.name == "UMD_VIDEO") {
            umdVideoLba = entry.lba;
            umdVideoSize = entry.size;
            break;
        }
    }
    if (umdVideoLba == 0) return results;

    // 4. Cerca la sottocartella "STREAM" dentro "UMD_VIDEO"
    auto umdEntries = readDirectory(umdVideoLba, umdVideoSize);
    uint32_t streamLba = 0, streamSize = 0;
    for (const auto& entry : umdEntries) {
        if (entry.isDirectory && entry.name == "STREAM") {
            streamLba = entry.lba;
            streamSize = entry.size;
            break;
        }
    }
    if (streamLba == 0) return results;

    // 5. Estrae tutti i file .MPS dentro "STREAM"
    auto streamFiles = readDirectory(streamLba, streamSize);
    for (const auto& f : streamFiles) {
        if (!f.isDirectory && f.name.size() >= 4 &&
            f.name.substr(f.name.size() - 4) == ".MPS") {
            UmdStreamFile stream;
            stream.name = f.name;
            stream.offset = static_cast<uint64_t>(f.lba) * SECTOR_SIZE;
            stream.size = f.size;
            results.push_back(stream);
        }
    }

    // Ordina per dimensione decrescente (il primo elemento sara' sempre il film)
    std::sort(results.begin(), results.end(), [](const UmdStreamFile& a, const UmdStreamFile& b) {
        return a.size > b.size;
    });

    return results;
}

bool IsoReader::getMainMovieStream(UmdStreamFile& outStream) {
    auto streams = findUmdStreams();
    if (streams.empty()) return false;
    outStream = streams[0];
    return true;
}
