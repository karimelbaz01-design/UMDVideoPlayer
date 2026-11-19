#!/bin/bash
set -e

# 1. Compila FFmpeg minimale per WebAssembly (richiede emsdk attivato)
# Eseguire nella cartella sorgente di FFmpeg:
# emconfigure ./configure --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib \
#   --target-os=none --arch=x86_32 --enable-cross-compile \
#   --disable-all --disable-runtime-cpudetect --disable-autodetect \
#   --disable-programs --disable-doc --disable-pthreads \
#   --enable-avformat --enable-avcodec --enable-swresample \
#   --enable-demuxer=mpegps --enable-parser=h264 \
#   --enable-decoder=h264,atrac3p --prefix=./build-wasm
# emmake make -j4 && emmake make install

mkdir -p web/umd-next

# 2. Compila il motore C++ insieme a FFmpeg in WebAssembly
emcc umd-next/core/iso_reader.cpp umd-next/core/umd_demuxer.cpp umd-next/core/umd_bridge.cpp \
  -I./build-wasm/include -L./build-wasm/lib \
  -lavformat -lavcodec -lswresample -lavutil \
  -lworkerfs.js \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createUmdModule" \
  -s EXPORTED_FUNCTIONS='["_umd_open_path","_umd_step","_umd_get_packet_data","_umd_get_packet_size","_umd_get_packet_pts","_umd_is_keyframe","_umd_seek","_umd_get_width","_umd_get_height","_umd_close"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","FS","WORKERFS","HEAPU8"]' \
  -O3 -o web/umd-next/umd_core.js

echo "Compilazione completata: web/umd-next/umd_core.js e web/umd-next/umd_core.wasm"
