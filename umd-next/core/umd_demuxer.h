#ifndef UMD_DEMUXER_H
#define UMD_DEMUXER_H

#include <cstdint>
#include <cstdio>
#include <vector>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswresample/swresample.h>
}

enum class FrameType {
    NONE = 0,
    VIDEO_H264 = 1,
    AUDIO_PCM = 2,
    END_OF_STREAM = 3,
    ERROR = -1
};

struct DecodedPacket {
    FrameType type = FrameType::NONE;
    double ptsSeconds = 0.0;        // Timestamp per sincronizzare audio e video
    bool isKeyFrame = false;        // True se e' un I-Frame H.264
    std::vector<uint8_t> data;      // Pacchetto H.264 grezzo oppure campioni PCM Float32
};

class UmdDemuxer {
public:
    UmdDemuxer() = default;
    ~UmdDemuxer();

    bool openStream(FILE* isoFile, uint64_t offset, uint64_t size);
    DecodedPacket readNext();
    bool seekToSeconds(double seconds);

    int getVideoWidth() const { return videoWidth_; }
    int getVideoHeight() const { return videoHeight_; }
    int getAudioSampleRate() const { return 48000; }
    int getAudioChannels() const { return 2; }

    void close();

private:
    struct SliceContext {
        FILE* file;
        uint64_t baseOffset;
        uint64_t size;
        uint64_t pos;
    };

    SliceContext sliceCtx_{nullptr, 0, 0, 0};
    AVIOContext* avioCtx_ = nullptr;
    AVFormatContext* fmtCtx_ = nullptr;
    AVCodecContext* audioCodecCtx_ = nullptr;
    SwrContext* swrCtx_ = nullptr;

    int videoStreamIdx_ = -1;
    int audioStreamIdx_ = -1;
    int videoWidth_ = 480;
    int videoHeight_ = 272;

    static int readPacketCallback(void* opaque, uint8_t* buf, int bufSize);
    static int64_t seekCallback(void* opaque, int64_t offset, int whence);
};

#endif // UMD_DEMUXER_H
