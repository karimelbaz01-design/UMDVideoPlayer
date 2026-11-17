#ifndef UMD_VIDEO_PLAYER_BRIDGE_H
#define UMD_VIDEO_PLAYER_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int ios_umd_start(const char *iso_path);
int ios_umd_frame(void);
void ios_umd_stop(void);
void ios_umd_set_surface(void *view);
void ios_umd_clear_surface(void);
void ios_umd_set_controller_input(uint32_t buttons, int32_t stick_y);

#ifdef __cplusplus
}
#endif

#endif
