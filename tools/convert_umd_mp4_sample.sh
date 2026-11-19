#!/usr/bin/env bash
# FRAME: verified FFmpeg pipeline for exported UMD MP4 diagnostic samples.
# Not an ISO reader; requires FFmpeg/libx264 on a computer.
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo 'Usage: convert_umd_mp4_sample.sh INPUT.mp4 OUTPUT.mp4' >&2
  exit 2
fi
input="$1"
output="$2"
if [[ ! -f "$input" ]]; then echo "File not found: $input" >&2; exit 2; fi
ffmpeg -hide_banner -y -i "$input" -map 0:v:0 \
  -vf 'bwdif=mode=send_frame:parity=auto:deint=all,setsar=1,format=yuv420p,scale=in_range=auto:out_range=tv' \
  -fps_mode vfr -c:v libx264 -preset veryfast -crf 20 \
  -pix_fmt yuv420p -movflags +faststart -an "$output"
ffprobe -v error -count_frames \
  -show_entries stream=codec_name,field_order,pix_fmt,nb_read_frames \
  -show_entries format=duration -of json "$output"
