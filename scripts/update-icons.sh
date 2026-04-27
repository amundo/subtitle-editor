#!/usr/bin/env bash
set -euo pipefail

svg_path="${1:-icons/cuebert.svg}"
icon_dir="src-tauri/icons"
iconset_dir="$icon_dir/Cuebert.iconset"

if [[ ! -f "$svg_path" ]]; then
  echo "SVG not found: $svg_path" >&2
  exit 1
fi

if command -v inkscape >/dev/null 2>&1; then
  render_png() {
    local size="$1"
    local output="$2"
    inkscape "$svg_path" \
      --export-type=png \
      --export-filename="$output" \
      --export-width="$size" \
      --export-height="$size" \
      --export-area-page >/dev/null
  }
elif command -v magick >/dev/null 2>&1; then
  render_png() {
    local size="$1"
    local output="$2"
    magick -background none -density 384 "$svg_path" \
      -resize "${size}x${size}" \
      -gravity center \
      -extent "${size}x${size}" \
      "$output"
  }
else
  echo "Install Inkscape or ImageMagick to render SVG icons." >&2
  exit 1
fi

mkdir -p "$iconset_dir"

render_png 512 "$icon_dir/icon.png"
render_png 1024 "$icon_dir/icon-1024.png"

render_png 16 "$iconset_dir/icon_16x16.png"
render_png 32 "$iconset_dir/icon_16x16@2x.png"
render_png 32 "$iconset_dir/icon_32x32.png"
render_png 64 "$iconset_dir/icon_32x32@2x.png"
render_png 128 "$iconset_dir/icon_128x128.png"
render_png 256 "$iconset_dir/icon_128x128@2x.png"
render_png 256 "$iconset_dir/icon_256x256.png"
render_png 512 "$iconset_dir/icon_256x256@2x.png"
render_png 512 "$iconset_dir/icon_512x512.png"
render_png 1024 "$iconset_dir/icon_512x512@2x.png"

if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$iconset_dir" -o "$icon_dir/Cuebert.icns"
else
  echo "iconutil not found; PNG files were updated, but Cuebert.icns was not rebuilt." >&2
fi

echo "Updated Tauri icons from $svg_path"
