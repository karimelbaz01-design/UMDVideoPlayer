#include <jni.h>
#include <stdint.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "disc_image.h"
#include "iso9660.h"
#include "sfo.h"
#include "umdv.h"
#include "demux.h"

typedef struct { int fd; } frame_file;
typedef struct { iso_volume *volume; iso_entry clip; } frame_clip;
static int64_t frame_clip_read(void *user, uint64_t offset, void *dst, uint32_t len) {
    frame_clip *c = (frame_clip *)user;
    return iso_read(c->volume, &c->clip, offset, dst, len);
}

static int frame_read(void *user, uint64_t off, uint32_t len, void *dst) {
    frame_file *f = (frame_file *)user;
    if (off > INT64_MAX) return -1;
    uint8_t *p = (uint8_t *)dst;
    uint32_t done = 0;
    while (done < len) {
        ssize_t n = pread(f->fd, p + done, len - done, (off_t)(off + done));
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return -1;
        done += (uint32_t)n;
    }
    return 0;
}

JNIEXPORT jstring JNICALL
Java_com_karim_frame_DiscEngine_inspect(JNIEnv *env, jclass cls, jint fd, jlong length) {
    (void)cls;
    if (fd < 0 || length < 32768) return (*env)->NewStringUTF(env, "Invalid disc image.");
    int owned = dup(fd);
    if (owned < 0) return (*env)->NewStringUTF(env, "Cannot access disc file.");
    frame_file file = {owned};
    image_file input = {&file, frame_read, (uint64_t)length};
    umd_source source;
    char result[512] = "Unsupported ISO/CSO/ZSO disc image.";
    if (image_open(&source, &input) == 0) {
        iso_volume volume;
        if (iso_open(&volume, &source) == 0) {
            iso_entry video, game;
            int has_video = iso_find(&volume, "UMD_VIDEO", &video) == 0;
            int has_game = iso_find(&volume, "PSP_GAME", &game) == 0;
            const char *kind = has_video ? "UMD Video" : has_game ? "PSP game" : "ISO9660 disc";
            char title[128] = "";
            char disc_id[64] = "";
            iso_entry param;
            const char *param_path = has_video ? "UMD_VIDEO/PARAM.SFO" : "PSP_GAME/PARAM.SFO";
            if ((has_video || has_game) && iso_find(&volume, param_path, &param) == 0
                && !param.is_dir && param.size >= 20 && param.size <= 262144) {
                uint8_t *bytes = (uint8_t *)malloc(param.size);
                if (bytes) {
                    int64_t read_count = iso_read(&volume, &param, 0, bytes, param.size);
                    if (read_count == (int64_t)param.size) {
                        sfo_get_string(bytes, param.size, "TITLE", title, sizeof(title));
                        sfo_get_string(bytes, param.size, "DISC_ID", disc_id, sizeof(disc_id));
                    }
                    free(bytes);
                }
            }
            unsigned int video_units = 0, audio_units = 0;
            unsigned int movie_titles = 0;
            unsigned int movie_items = 0;
            unsigned int movie_chapters = 0;
            if (has_video) {
                iso_entry playlist_entry;
                if (iso_find(&volume, "UMD_VIDEO/PLAYLIST.UMD", &playlist_entry) == 0
                    && !playlist_entry.is_dir && playlist_entry.size >= 16
                    && playlist_entry.size <= 4 * 1024 * 1024) {
                    uint8_t *playlist_bytes = (uint8_t *)malloc(playlist_entry.size);
                    umdv_playlist *playlist = (umdv_playlist *)malloc(sizeof(umdv_playlist));
                    if (playlist_bytes && playlist
                        && iso_read(&volume, &playlist_entry, 0, playlist_bytes,
                                    playlist_entry.size) == (int64_t)playlist_entry.size
                        && umdv_playlist_parse(playlist_bytes, playlist_entry.size, playlist) == 0) {
                        movie_titles = playlist->title_count;
                        movie_items = playlist->item_count;
                        movie_chapters = playlist->chapter_count;
                        if (playlist->title_count > 0) {
                            char clip_path[96];
                            snprintf(clip_path, sizeof(clip_path), "UMD_VIDEO/STREAM/%.8s.MPS",
                                     playlist->titles[0].clip);
                            frame_clip clip;
                            clip.volume = &volume;
                            if (iso_find(&volume, clip_path, &clip.clip) == 0
                                && !clip.clip.is_dir && clip.clip.size > 0) {
                                demux *reader = (demux *)calloc(1, sizeof(demux));
                                if (reader) {
                                    demux_init(reader, frame_clip_read, &clip);
                                    demux_unit unit;
                                    for (int i = 0; i < 64; ++i) {
                                        int status = demux_next(reader, &unit);
                                        if (status <= 0) break;
                                        if (unit.type == DEMUX_VIDEO) video_units++;
                                        if (unit.type == DEMUX_AUDIO) audio_units++;
                                    }
                                    demux_free(reader);
                                    free(reader);
                                }
                            }
                        }
                    }
                    free(playlist);
                    free(playlist_bytes);
                }
            }
            snprintf(result, sizeof(result),
                     "Type: %s\\nVolume: %.32s\\nTitle: %.120s\\nDisc ID: %.56s\\n"
                     "UMD titles: %u | Clips: %u | Chapters: %u\\n"
                     "Stream probe: H264 units %u | ATRAC3+ units %u\\n"
                     "Native ISO/CSO/ZSO reader: OK\\nPlayback: not yet connected",
                     kind, volume.volume_id, title[0] ? title : "Unknown",
                     disc_id[0] ? disc_id : "Not provided",
                     movie_titles, movie_items, movie_chapters, video_units, audio_units);
        } else {
            snprintf(result, sizeof(result), "Disc image recognized, but ISO9660 volume could not be opened.");
        }
        image_close(&source, &input);
    }
    close(owned);
    return (*env)->NewStringUTF(env, result);
}

#include <media/NdkMediaCodec.h>
#include <media/NdkMediaFormat.h>
#include <android/native_window_jni.h>
#include <time.h>

JNIEXPORT jstring JNICALL
Java_com_karim_frame_DiscEngine_previewVideo(JNIEnv *env, jclass cls, jint fd,
                                               jlong length, jobject surface) {
    (void)cls;
    const char *message = "Unable to decode UMD video.";
    if (fd < 0 || length < 32768 || !surface)
        return (*env)->NewStringUTF(env, "Invalid video input.");
    int owned = dup(fd);
    if (owned < 0) return (*env)->NewStringUTF(env, "Cannot open disc.");
    frame_file file = {owned};
    image_file input = {&file, frame_read, (uint64_t)length};
    umd_source source;
    if (image_open(&source, &input) != 0) {
        close(owned);
        return (*env)->NewStringUTF(env, "Unsupported disc image.");
    }
    iso_volume volume;
    if (iso_open(&volume, &source) == 0) {
        iso_entry playlist_entry;
        if (iso_find(&volume, "UMD_VIDEO/PLAYLIST.UMD", &playlist_entry) == 0
            && playlist_entry.size > 16 && playlist_entry.size <= 4194304) {
            uint8_t *data = malloc(playlist_entry.size);
            umdv_playlist *playlist = malloc(sizeof(umdv_playlist));
            if (data && playlist
                && iso_read(&volume, &playlist_entry, 0, data, playlist_entry.size)
                    == (int64_t)playlist_entry.size
                && umdv_playlist_parse(data, playlist_entry.size, playlist) == 0
                && playlist->title_count > 0) {
                char path[96];
                snprintf(path, sizeof(path), "UMD_VIDEO/STREAM/%.8s.MPS",
                         playlist->titles[0].clip);
                frame_clip clip = {&volume, {0}};
                if (iso_find(&volume, path, &clip.clip) == 0) {
                    ANativeWindow *window = ANativeWindow_fromSurface(env, surface);
                    AMediaCodec *codec = AMediaCodec_createDecoderByType("video/avc");
                    AMediaFormat *format = AMediaFormat_new();
                    if (window && codec && format) {
                        AMediaFormat_setString(format, AMEDIAFORMAT_KEY_MIME, "video/avc");
                        AMediaFormat_setInt32(format, AMEDIAFORMAT_KEY_WIDTH, 720);
                        AMediaFormat_setInt32(format, AMEDIAFORMAT_KEY_HEIGHT, 480);
                        if (AMediaCodec_configure(codec, format, window, NULL, 0) == AMEDIA_OK
                            && AMediaCodec_start(codec) == AMEDIA_OK) {
                            demux *reader = calloc(1, sizeof(demux));
                            if (reader) {
                                demux_init(reader, frame_clip_read, &clip);
                                demux_select(reader, DEMUX_NONE, DEMUX_NONE);
                                demux_unit unit;
                                int frames = 0;
                                int attempts = 0;
                                int64_t first_pts = -1;
                                struct timespec start;
                                clock_gettime(CLOCK_MONOTONIC, &start);
                                while (frames < 300 && attempts++ < 1200) {
                                    int status = demux_next(reader, &unit);
                                    if (status <= 0) break;
                                    if (unit.type != DEMUX_VIDEO) continue;
                                    ssize_t index = AMediaCodec_dequeueInputBuffer(codec, 100000);
                                    if (index < 0) continue;
                                    size_t capacity = 0;
                                    uint8_t *buffer = AMediaCodec_getInputBuffer(codec, (size_t)index, &capacity);
                                    if (!buffer || unit.size > capacity) {
                                        AMediaCodec_queueInputBuffer(codec, (size_t)index, 0, 0, 0, 0);
                                        continue;
                                    }
                                    memcpy(buffer, unit.data, unit.size);
                                    int64_t pts = unit.pts == UINT64_MAX ? frames * 33333LL :
                                                  (int64_t)(unit.pts * 1000000ULL / 90000ULL);
                                    if (first_pts < 0) first_pts = pts;
                                    AMediaCodec_queueInputBuffer(codec, (size_t)index, 0, unit.size,
                                                                 pts - first_pts, 0);
                                    AMediaCodecBufferInfo info;
                                    ssize_t out;
                                    while ((out = AMediaCodec_dequeueOutputBuffer(codec, &info, 0)) >= 0) {
                                        struct timespec now;
                                        clock_gettime(CLOCK_MONOTONIC, &now);
                                        int64_t elapsed = (now.tv_sec - start.tv_sec) * 1000000LL
                                            + (now.tv_nsec - start.tv_nsec) / 1000LL;
                                        int64_t delay = info.presentationTimeUs - elapsed;
                                        if (delay > 0 && delay < 200000) usleep((useconds_t)delay);
                                        AMediaCodec_releaseOutputBuffer(codec, (size_t)out, true);
                                    }
                                    frames++;
                                }
                                message = frames ? "Video preview completed (audio not yet supported)."
                                                 : "No decodable H264 frames found.";
                                demux_free(reader);
                                free(reader);
                            }
                            AMediaCodec_stop(codec);
                        } else message = "Android H264 decoder could not start.";
                    } else message = "Android H264 decoder unavailable.";
                    if (format) AMediaFormat_delete(format);
                    if (codec) AMediaCodec_delete(codec);
                    if (window) ANativeWindow_release(window);
                } else message = "UMD movie clip not found.";
            } else message = "UMD playlist cannot be parsed.";
            free(data);
            free(playlist);
        } else message = "No UMD Video playlist found.";
    } else message = "Invalid UMD disc filesystem.";
    image_close(&source, &input);
    close(owned);
    return (*env)->NewStringUTF(env, message);
}
