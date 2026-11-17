cmake_minimum_required(VERSION 3.22.1)
project(frame_umd_android C)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# First integration stage: compile the portable UMD ISO and codec engine
# into Android. UI, audio, and video platform adapters are separate work.
set(UMD_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../UMDVideoCore")
if(NOT EXISTS "${UMD_ROOT}/src/core/iso9660.c")
    message(FATAL_ERROR "UMDVideoCore submodule missing; initialize submodules")
endif()

file(GLOB UMD_CORE_SOURCES CONFIGURE_DEPENDS
    "${UMD_ROOT}/src/core/*.c"
    "${UMD_ROOT}/src/core/atrac3p/*.c"
)
add_library(frame_umd_core STATIC ${UMD_CORE_SOURCES})
target_include_directories(frame_umd_core PRIVATE
    "${UMD_ROOT}/src"
    "${UMD_ROOT}/src/core"
    "${UMD_ROOT}/src/core/atrac3p"
    "${UMD_ROOT}/src/platform"
)
target_compile_definitions(frame_umd_core PRIVATE _POSIX_C_SOURCE=200809L)
target_link_libraries(frame_umd_core m)

# JNI bridge: native ISO/CSO/ZSO reader using the upstream disc-image engine.
add_library(frame_disc_jni SHARED frame_disc_jni.c)
target_include_directories(frame_disc_jni PRIVATE "${UMD_ROOT}/src/core")
target_link_libraries(frame_disc_jni frame_umd_core z m log)
