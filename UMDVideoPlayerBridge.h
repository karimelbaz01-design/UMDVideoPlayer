#ifndef UMD_VIDEO_PLAYER_BRIDGE_H
#define UMD_VIDEO_PLAYER_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

int ios_umd_start(const char *iso_path);
int ios_umd_frame(void);
void ios_umd_stop(void);
void ios_umd_set_surface(void *view);
void ios_umd_clear_surface(void);

#ifdef __cplusplus
}
#endif

#endif
