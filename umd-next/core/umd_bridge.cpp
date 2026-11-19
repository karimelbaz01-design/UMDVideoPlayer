#include "umd_bridge.h"
#include "iso_reader.h"
#include "umd_demuxer.h"

static IsoReader g_isoReader;
static UmdDemuxer g_demuxer;
static DecodedPacket g_currentPacket;

extern "C" {

int umd_open_path(const char* isoPath) {
    if (!g_isoReader.openFromPath(isoPath)) return 0;
    UmdStreamFile mainMovie;
    if (!g_isoReader.getMainMovieStream(mainMovie)) return 0;
    return g_demuxer.openStream(g_isoReader.getFileHandle(), mainMovie.offset, mainMovie.size) ? 1 : 0;
}

int umd_open_fd(int fd) {
    if (!g_isoReader.openFromFd(fd)) return 0;
    UmdStreamFile mainMovie;
    if (!g_isoReader.getMainMovieStream(mainMovie)) return 0;
    return g_demuxer.openStream(g_isoReader.getFileHandle(), mainMovie.offset, mainMovie.size) ? 1 : 0;
}

int umd_step() {
    g_currentPacket = g_demuxer.readNext();
    return static_cast<int>(g_currentPacket.type);
}

const uint8_t* umd_get_packet_data() {
    return g_currentPacket.data.empty() ? nullptr : g_currentPacket.data.data();
}

int umd_get_packet_size() {
    return static_cast<int>(g_currentPacket.data.size());
}

double umd_get_packet_pts() {
    return g_currentPacket.ptsSeconds;
}

int umd_is_keyframe() {
    return g_currentPacket.isKeyFrame ? 1 : 0;
}

int umd_seek(double seconds) {
    return g_demuxer.seekToSeconds(seconds) ? 1 : 0;
}

int umd_get_width() {
    return g_demuxer.getVideoWidth();
}

int umd_get_height() {
    return g_demuxer.getVideoHeight();
}

void umd_close() {
    g_demuxer.close();
}

} // extern "C"
