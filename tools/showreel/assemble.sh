#!/usr/bin/env bash
# assemble.sh <frames dir> <start frame> <end dir> <out.mp4> [size]
# Carousel frames from <start frame> on, a half-second crossfade into the end
# card, encoded for X: H.264 High, yuv420p, BT.709, 60 fps, faststart. CRF 12
# by default: X re-encodes everything, so give it a source with headroom.
set -euo pipefail
FR="$1"; START="$2"; END="$3"; OUT="$4"; SIZE="${5:-1920:1080}"
FPS=60
XF=0.5

N=$(ls "$FR" | grep -c '^f[0-9]*\.png$')
LEN=$(python3 -c "print(($N - $START) / $FPS)")
OFF=$(python3 -c "print(round($LEN - $XF, 4))")
echo "carousel frames $START..$((N - 1)) = ${LEN}s, crossfade at ${OFF}s"

ffmpeg -v error -stats -y \
  -framerate $FPS -start_number "$START" -i "$FR/f%05d.png" \
  -framerate $FPS -i "$END/e%05d.png" \
  -filter_complex "\
[0:v]scale=$SIZE:flags=lanczos,format=rgb24,setpts=PTS-STARTPTS[a];\
[1:v]scale=$SIZE:flags=lanczos,format=rgb24,setpts=PTS-STARTPTS[b];\
[a][b]xfade=transition=fade:duration=$XF:offset=$OFF,\
scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]" \
  -map "[v]" -r $FPS \
  -c:v libx264 -preset slow -crf "${CRF:-12}" -profile:v high -level:v 4.2 \
  -maxrate 25M -bufsize 50M -g 120 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -movflags +faststart \
  "$OUT"

ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,color_space,bit_rate:format=duration,size \
  -of default=nw=1 "$OUT"
