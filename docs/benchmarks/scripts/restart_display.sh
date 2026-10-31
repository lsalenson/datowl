#!/usr/bin/env bash
# Fresh X server + Openbox before each launch (source it). Xvfb hands out window buffers
# without clearing them: a window mapped but not yet drawn (Datowl's ARGB window) would show
# pixels left by the previous app and pass for "painted". A new Xvfb starts from zeroed memory.
pkill -x openbox 2>/dev/null || true
pkill -x Xvfb 2>/dev/null || true
for _ in $(seq 100); do pgrep -x Xvfb >/dev/null || pgrep -x openbox >/dev/null || break; sleep 0.1; done
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
. "$(dirname "${BASH_SOURCE[0]}")/start_display.sh"
