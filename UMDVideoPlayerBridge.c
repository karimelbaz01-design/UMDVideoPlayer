#include "UMDVideoPlayerBridge.h"
#include "UMDVideoCore/src/platform/platform.h"

static int app_started;

int ios_umd_start(const char *iso_path)
{
    char app_name[] = "UMDVideoPlayer";
    char *argv[2];

    if (!iso_path || !*iso_path || app_started)
        return -1;

    argv[0] = app_name;
    argv[1] = (char *)iso_path;
    if (app_init(2, argv) != 0)
        return -1;

    app_started = 1;
    return 0;
}

int ios_umd_frame(void)
{
    if (!app_started)
        return 0;
    return app_frame();
}

void ios_umd_stop(void)
{
    if (!app_started)
        return;
    app_shutdown();
    app_started = 0;
}
