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

typedef struct { int fd; } frame_file;

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
                    }
                    free(playlist);
                    free(playlist_bytes);
                }
            }
            snprintf(result, sizeof(result),
                     "Type: %s\\nVolume: %.32s\\nTitle: %.120s\\nDisc ID: %.56s\\n"
                     "UMD titles: %u | Clips: %u | Chapters: %u\\n"
                     "Native ISO/CSO/ZSO reader: OK\\nPlayback: not yet connected",
                     kind, volume.volume_id, title[0] ? title : "Unknown",
                     disc_id[0] ? disc_id : "Not provided",
                     movie_titles, movie_items, movie_chapters);
        } else {
            snprintf(result, sizeof(result), "Disc image recognized, but ISO9660 volume could not be opened.");
        }
        image_close(&source, &input);
    }
    close(owned);
    return (*env)->NewStringUTF(env, result);
}
