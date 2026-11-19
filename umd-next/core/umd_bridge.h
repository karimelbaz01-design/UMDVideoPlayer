#ifndef UMD_BRIDGE_H
#define UMD_BRIDGE_H

#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

int umd_open_path(const char* isoPath);
int umd_open_fd(int fd);
int umd_step();

const uint8_t* umd_get_packet_data();
int umd_get_packet_size();
double umd_get_packet_pts();
int umd_is_keyframe();

int umd_seek(double seconds);
int umd_get_width();
int umd_get_height();
void umd_close();

#ifdef __cplusplus
}
#endif

#endif // UMD_BRIDGE_H
