#ifndef ISO_READER_H
#define ISO_READER_H

#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

struct UmdStreamFile {
    std::string name;      // Es. "00001.MPS"
    uint64_t offset;       // Posizione esatta in byte dentro la ISO
    uint64_t size;         // Dimensione in byte del flusso video
};

class IsoReader {
public:
    IsoReader() = default;
    ~IsoReader();

    // Apre una ISO da percorso (es. "/work/film.iso" su WORKERFS)
    bool openFromPath(const std::string& path);

    // Apre una ISO da File Descriptor Android (ParcelFileDescriptor)
    bool openFromFd(int fd);

    // Scansiona /UMD_VIDEO/STREAM e restituisce tutti i file .MPS trovati
    std::vector<UmdStreamFile> findUmdStreams();

    // Restituisce direttamente il file .MPS piu' grande (il film principale)
    bool getMainMovieStream(UmdStreamFile& outStream);

    FILE* getFileHandle() const { return file_; }

private:
    FILE* file_ = nullptr;
    static constexpr uint32_t SECTOR_SIZE = 2048;

    struct DirEntry {
        std::string name;
        uint32_t lba;
        uint32_t size;
        bool isDirectory;
    };

    bool readSector(uint32_t lba, uint8_t* buffer);
    std::vector<DirEntry> readDirectory(uint32_t dirLba, uint32_t dirSize);
    static std::string normalizeIsoName(const char* rawName, uint8_t len);
};

#endif // ISO_READER_H
