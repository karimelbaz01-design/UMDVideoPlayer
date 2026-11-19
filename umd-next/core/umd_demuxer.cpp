#include "umd_demuxer.h"
#include <algorithm>
#include <cstring>

#ifdef _WIN32
#define fseek64 _fseeki64
#else
#define fseek64 fseeko
#endif

UmdDemuxer::~UmdDemuxer() {
    close();
}

void UmdDemuxer::close() {
    if (swrCtx_) {
        swr_free(&swrCtx_);
        swrCtx_ = nullptr;
    }
    if (audioCodecCtx_) {
        avcodec_free_context(&audioCodecCtx_);
        audioCodecCtx_ = nullptr;
    }
    if (fmtCtx_) {
        avformat_close_input(&fmtCtx_);
        fmtCtx_ = nullptr;
    }
    if (avioCtx_) {
        av_freep(&avioCtx_->buffer);
        avio_context_free(&avioCtx_);
        avioCtx_ = nullptr;
    }
}

int UmdDemuxer::readPacketCallback(void* opaque, uint8_t* buf, int bufSize) {
    auto* ctx = static_cast<SliceContext*>(opaque);
    if (ctx->pos >= ctx->size) {
        return AVERROR_EOF;
    }

    uint64_t remaining = ctx->size - ctx->pos;
    int toRead = static_cast<int>(std::min<uint64_t>(bufSize, remaining));

    if (fseek64(ctx->file, ctx->baseOffset + ctx->pos, SEEK_SET) != 0) {
        return AVERROR(EIO);
    }

    size_t bytesRead = fread(buf, 1, toRead, ctx->file);
    if (bytesRead == 0) {
        return AVERROR_EOF;
    }

    ctx->pos += bytesRead;
    return static_cast<int>(bytesRead);
}

int64_t UmdDemuxer::seekCallback(void* opaque, int64_t offset, int whence) {
    auto* ctx = static_cast<SliceContext*>(opaque);
    if (whence == AVSEEK_SIZE) {
        return static_cast<int64_t>(ctx->size);
    }

    int64_t newPos = 0;
    if (whence == SEEK_SET) newPos = offset;
    else if (whence == SEEK_CUR) newPos = static_cast<int64_t>(ctx->pos) + offset;
    else if (whence == SEEK_END) newPos = static_cast<int64_t>(ctx->size) + offset;
    else return -1;

    if (newPos < 0 || static_cast<uint64_t>(newPos) > ctx->size) {
        return -1;
    }

    ctx->pos = static_cast<uint64_t>(newPos);
    return newPos;
}

bool UmdDemuxer::openStream(FILE* isoFile, uint64_t offset, uint64_t size) {
    close();
    if (!isoFile || size == 0) return false;

    sliceCtx_ = {isoFile, offset, size, 0};

    constexpr int AVIO_BUFFER_SIZE = 32768;
    auto* avioBuffer = static_cast<uint8_t*>(av_malloc(AVIO_BUFFER_SIZE));
    if (!avioBuffer) return false;

    avioCtx_ = avio_alloc_context(
        avioBuffer, AVIO_BUFFER_SIZE, 0,
        &sliceCtx_, &UmdDemuxer::readPacketCallback, nullptr, &UmdDemuxer::seekCallback
    );
    if (!avioCtx_) {
        av_free(avioBuffer);
        return false;
    }

    fmtCtx_ = avformat_alloc_context();
    fmtCtx_->pb = avioCtx_;
    fmtCtx_->flags |= AVFMT_FLAG_CUSTOM_IO;

    const AVInputFormat* mpegpsFmt = av_find_input_format("mpeg");
    if (avformat_open_input(&fmtCtx_, nullptr, mpegpsFmt, nullptr) < 0) {
        close();
        return false;
    }

    if (avformat_find_stream_info(fmtCtx_, nullptr) < 0) {
        close();
        return false;
    }

    for (unsigned int i = 0; i < fmtCtx_->nb_streams; ++i) {
        AVCodecParameters* codecPar = fmtCtx_->streams[i]->codecpar;
        if (codecPar->codec_type == AVMEDIA_TYPE_VIDEO && videoStreamIdx_ < 0) {
            videoStreamIdx_ = static_cast<int>(i);
            videoWidth_ = codecPar->width > 0 ? codecPar->width : 480;
            videoHeight_ = codecPar->height > 0 ? codecPar->height : 272;
        } else if (codecPar->codec_type == AVMEDIA_TYPE_AUDIO && audioStreamIdx_ < 0) {
            audioStreamIdx_ = static_cast<int>(i);
        }
    }

    if (videoStreamIdx_ < 0) {
        close();
        return false;
    }

    if (audioStreamIdx_ >= 0) {
        AVCodecParameters* audioPar = fmtCtx_->streams[audioStreamIdx_]->codecpar;
        const AVCodec* audioDecoder = avcodec_find_decoder(audioPar->codec_id);
        if (!audioDecoder) {
            close();
            return false;
        }

        audioCodecCtx_ = avcodec_alloc_context3(audioDecoder);
        avcodec_parameters_to_context(audioCodecCtx_, audioPar);

        if (avcodec_open2(audioCodecCtx_, audioDecoder, nullptr) < 0) {
            close();
            return false;
        }

        AVChannelLayout outLayout = AV_CHANNEL_LAYOUT_STEREO;
        swr_alloc_set_opts2(
            &swrCtx_,
            &outLayout, AV_SAMPLE_FMT_FLT, 48000,
            &audioCodecCtx_->ch_layout, audioCodecCtx_->sample_fmt, audioCodecCtx_->sample_rate,
            0, nullptr
        );
        swr_init(swrCtx_);
    }

    return true;
}

DecodedPacket UmdDemuxer::readNext() {
    DecodedPacket out;
    if (!fmtCtx_) {
        out.type = FrameType::ERROR;
        return out;
    }

    AVPacket* pkt = av_packet_alloc();
    AVFrame* frame = av_frame_alloc();

    while (av_read_frame(fmtCtx_, pkt) >= 0) {
        if (pkt->stream_index == videoStreamIdx_) {
            AVRational tb = fmtCtx_->streams[videoStreamIdx_]->time_base;
            out.type = FrameType::VIDEO_H264;
            out.ptsSeconds = (pkt->pts != AV_NOPTS_VALUE) ? pkt->pts * av_q2d(tb) : 0.0;
            out.isKeyFrame = (pkt->flags & AV_PKT_FLAG_KEY) != 0;
            out.data.assign(pkt->data, pkt->data + pkt->size);

            av_packet_unref(pkt);
            av_frame_free(&frame);
            av_packet_free(&pkt);
            return out;
        }

        if (pkt->stream_index == audioStreamIdx_ && audioCodecCtx_) {
            if (avcodec_send_packet(audioCodecCtx_, pkt) == 0) {
                if (avcodec_receive_frame(audioCodecCtx_, frame) == 0) {
                    AVRational tb = fmtCtx_->streams[audioStreamIdx_]->time_base;
                    out.type = FrameType::AUDIO_PCM;
                    out.ptsSeconds = (frame->pts != AV_NOPTS_VALUE) ? frame->pts * av_q2d(tb) : 0.0;

                    int outSamples = swr_get_out_samples(swrCtx_, frame->nb_samples);
                    int bufferSize = av_samples_get_buffer_size(nullptr, 2, outSamples, AV_SAMPLE_FMT_FLT, 1);
                    out.data.resize(bufferSize);

                    uint8_t* outPtr = out.data.data();
                    int converted = swr_convert(swrCtx_, &outPtr, outSamples,
                                                const_cast<const uint8_t**>(frame->data), frame->nb_samples);
                    if (converted > 0) {
                        int actualBytes = av_samples_get_buffer_size(nullptr, 2, converted, AV_SAMPLE_FMT_FLT, 1);
                        out.data.resize(actualBytes);
                        av_packet_unref(pkt);
                        av_frame_free(&frame);
                        av_packet_free(&pkt);
                        return out;
                    }
                }
            }
        }
        av_packet_unref(pkt);
    }

    av_frame_free(&frame);
    av_packet_free(&pkt);
    out.type = FrameType::END_OF_STREAM;
    return out;
}

bool UmdDemuxer::seekToSeconds(double seconds) {
    if (!fmtCtx_ || videoStreamIdx_ < 0) return false;
    AVRational tb = fmtCtx_->streams[videoStreamIdx_]->time_base;
    int64_t targetTs = static_cast<int64_t>(seconds / av_q2d(tb));

    if (av_seek_frame(fmtCtx_, videoStreamIdx_, targetTs, AVSEEK_FLAG_BACKWARD) >= 0) {
        if (audioCodecCtx_) avcodec_flush_buffers(audioCodecCtx_);
        return true;
    }
    return false;
}
