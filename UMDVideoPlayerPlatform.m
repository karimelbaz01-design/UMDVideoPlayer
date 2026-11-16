#import <UIKit/UIKit.h>
#import "UMDVideoPlayerSurface.h"
#import <QuartzCore/QuartzCore.h>
#import <CoreVideo/CoreVideo.h>
#import <CoreGraphics/CoreGraphics.h>

#include "UMDVideoCore/src/platform/platform.h"
#include "UMDVideoCore/src/platform/macos/mac_frame.h"
#include "UMDVideoCore/src/core/deint.h"

static int ios_touch_down;
static int ios_touch_x;
static int ios_touch_y;

@interface UMDVideoSurface ()
@property(nonatomic, strong) CALayer *videoLayer;
@property(nonatomic, strong) CALayer *subtitleLayer;
@property(nonatomic, strong) CALayer *uiLayer;
@end

@implementation UMDVideoSurface

- (instancetype)initWithFrame:(CGRect)frame
{
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = UIColor.blackColor;
        self.multipleTouchEnabled = NO;

        _videoLayer = [CALayer layer];
        _videoLayer.contentsGravity = kCAGravityResize;
        _videoLayer.magnificationFilter = kCAFilterLinear;
        [self.layer addSublayer:_videoLayer];

        _subtitleLayer = [CALayer layer];
        _subtitleLayer.contentsGravity = kCAGravityResize;
        [self.layer addSublayer:_subtitleLayer];

        _uiLayer = [CALayer layer];
        _uiLayer.contentsGravity = kCAGravityResize;
        _uiLayer.magnificationFilter = kCAFilterNearest;
        [self.layer addSublayer:_uiLayer];
    }
    return self;
}

- (void)layoutSubviews
{
    [super layoutSubviews];
    if (CGRectIsEmpty(self.videoLayer.frame))
        self.videoLayer.frame = self.bounds;
}

- (void)updateTouch:(UITouch *)touch
{
    CGPoint p = [touch locationInView:self];
    CGFloat w = MAX(self.bounds.size.width, 1);
    CGFloat h = MAX(self.bounds.size.height, 1);
    ios_touch_x = (int)(p.x * 960.0 / w);
    ios_touch_y = (int)(p.y * 544.0 / h);
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
    (void)event;
    UITouch *touch = touches.anyObject;
    if (touch) {
        [self updateTouch:touch];
        ios_touch_down = 1;
    }
}

- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
    (void)event;
    UITouch *touch = touches.anyObject;
    if (touch)
        [self updateTouch:touch];
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
    (void)event;
    UITouch *touch = touches.anyObject;
    if (touch)
        [self updateTouch:touch];
    ios_touch_down = 0;
}

- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
    (void)touches;
    (void)event;
    ios_touch_down = 0;
}

@end

static UMDVideoSurface *active_surface;
void ios_umd_set_surface(void *view)
{
    active_surface = (__bridge UMDVideoSurface *)view;
}

void ios_umd_clear_surface(void)
{
    active_surface = nil;
    ios_touch_down = 0;
}

static CGRect screen_rect(plat_rect r)
{
    if (!active_surface)
        return CGRectZero;
    CGRect b = active_surface.bounds;
    return CGRectMake(r.x * b.size.width,
                      (1.0 - r.y - r.h) * b.size.height,
                      r.w * b.size.width,
                      r.h * b.size.height);
}

static CGImageRef image_from_rgba(const uint8_t *rgba, int w, int h, int stride)
{
    if (!rgba || w <= 0 || h <= 0 || stride < w * 4)
        return NULL;

    CFDataRef data = CFDataCreate(kCFAllocatorDefault, rgba, (CFIndex)stride * h);
    if (!data)
        return NULL;
    CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGImageRef image = CGImageCreate((size_t)w, (size_t)h, 8, 32, (size_t)stride,
                                     colorSpace, kCGImageAlphaLast | kCGBitmapByteOrderDefault,
                                     provider, NULL, false, kCGRenderingIntentDefault);
    CGColorSpaceRelease(colorSpace);
    CGDataProviderRelease(provider);
    CFRelease(data);
    return image;
}

static CGImageRef image_from_frame(plat_frame *frame)
{
    if (!frame || !frame->image)
        return NULL;

    CVPixelBufferRef pixelBuffer = frame->image;
    if (CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess)
        return NULL;

    size_t width = CVPixelBufferGetWidth(pixelBuffer);
    size_t height = CVPixelBufferGetHeight(pixelBuffer);
    size_t stride = CVPixelBufferGetBytesPerRow(pixelBuffer);
    const uint8_t *base = CVPixelBufferGetBaseAddress(pixelBuffer);
    CGImageRef image = NULL;

    if (base && width && height && stride >= width * 4) {
        CFDataRef data = CFDataCreate(kCFAllocatorDefault, base, (CFIndex)(stride * height));
        if (data) {
            CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
            CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
            image = CGImageCreate(width, height, 8, 32, stride, colorSpace,
                                  kCGImageAlphaNoneSkipFirst | kCGBitmapByteOrder32Little,
                                  provider, NULL, false, kCGRenderingIntentDefault);
            CGColorSpaceRelease(colorSpace);
            CGDataProviderRelease(provider);
            CFRelease(data);
        }
    }

    CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
    return image;
}

void plat_present(plat_frame *frame, const plat_present_info *info)
{
    if (!active_surface || !info)
        return;

    [CATransaction begin];
    [CATransaction setDisableActions:YES];

    if (frame && frame->image) {
        if (info->deinterlace && !frame->deinterlaced) {
            CVPixelBufferLockBaseAddress(frame->image, 0);
            deint_blend32(CVPixelBufferGetBaseAddress(frame->image),
                          (int)CVPixelBufferGetWidth(frame->image),
                          (int)CVPixelBufferGetHeight(frame->image),
                          (int)CVPixelBufferGetBytesPerRow(frame->image));
            CVPixelBufferUnlockBaseAddress(frame->image, 0);
            frame->deinterlaced = 1;
        }

        CGImageRef image = image_from_frame(frame);
        active_surface.videoLayer.contents = image ? (__bridge id)image : nil;
        if (image)
            CGImageRelease(image);
        active_surface.videoLayer.frame = screen_rect(info->dst);

        if (info->video_w > 0 && info->video_h > 0 && info->src_w > 0 && info->src_h > 0) {
            active_surface.videoLayer.contentsRect = CGRectMake(
                (CGFloat)info->src_x / info->video_w,
                1.0 - (CGFloat)(info->src_y + info->src_h) / info->video_h,
                (CGFloat)info->src_w / info->video_w,
                (CGFloat)info->src_h / info->video_h);
        }
    } else {
        active_surface.videoLayer.contents = nil;
    }

    CGImageRef subtitle = image_from_rgba(info->overlay_rgba, info->overlay_w,
                                          info->overlay_h, info->overlay_stride);
    active_surface.subtitleLayer.contents = subtitle ? (__bridge id)subtitle : nil;
    if (subtitle)
        CGImageRelease(subtitle);
    active_surface.subtitleLayer.frame = screen_rect(info->overlay_dst);

    CGImageRef ui = image_from_rgba(info->ui_rgba, info->ui_w, info->ui_h, info->ui_stride);
    active_surface.uiLayer.contents = ui ? (__bridge id)ui : nil;
    if (ui)
        CGImageRelease(ui);
    active_surface.uiLayer.frame = active_surface.bounds;

    [CATransaction commit];
}

int plat_draws_sprites(void) { return 0; }

void plat_screen_size(int *w, int *h)
{
    if (w) *w = 960;
    if (h) *h = 544;
}

int plat_glyph(uint32_t cp, int px, uint8_t *alpha)
{
    (void)cp; (void)px; (void)alpha;
    return 0;
}

int plat_keyboard_ui(void) { return 0; }
uint32_t plat_buttons(void) { return 0; }
int plat_stick_y(void) { return 0; }
int plat_scroll(void) { return 0; }

int plat_touch(int *x, int *y)
{
    if (!ios_touch_down)
        return 0;
    if (x) *x = ios_touch_x;
    if (y) *y = ios_touch_y;
    return 1;
}
