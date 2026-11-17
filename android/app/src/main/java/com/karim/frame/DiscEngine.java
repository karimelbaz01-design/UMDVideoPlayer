package com.karim.frame;

public final class DiscEngine {
    static { System.loadLibrary("frame_disc_jni"); }
    private DiscEngine() {}
    public static native String inspect(int fd, long length);
}
