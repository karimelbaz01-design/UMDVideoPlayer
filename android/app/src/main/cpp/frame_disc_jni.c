#include <jni.h>
#include <stdint.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include "disc_image.h"
#include "iso9660.h"
#include "sfo.h"

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
            snprintf(result, sizeof(result), "%s | Volume: %.32s | Native ISO reader: OK | Playback engine: not yet connected", kind, volume.volume_id);
        } else {
            snprintf(result, sizeof(result), "Disc image recognized, but ISO9660 volume could not be opened.");
        }
        image_close(&source, &input);
    }
    close(owned);
    return (*env)->NewStringUTF(env, result);
}
