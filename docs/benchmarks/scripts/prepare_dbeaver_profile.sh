#!/usr/bin/env bash
# Builds a DBeaver profile in which the first-run "Product Configuration" wizard has been
# completed with its defaults (Apply), then DBeaver exited normally. measure_launch.py
# --home-template copies it into each run's fresh HOME ("dbeaver_configured" series).
# Usage: prepare_dbeaver_profile.sh DBEAVER_DIR TEMPLATE_DIR   (DISPLAY must be set)
set -euo pipefail
DBEAVER_DIR=$1; T=$2
rm -rf "$T"; mkdir -p "$T/.runtime"; chmod 700 "$T/.runtime"
wait_win() { for _ in $(seq 600); do W=$(xdotool search --onlyvisible --name "$1" 2>/dev/null | head -1) && [ -n "$W" ] && { echo "$W"; return; }; sleep 0.1; done; echo "timeout: $1" >&2; exit 1; }
(cd "$T" && HOME=$T XDG_CONFIG_HOME=$T/.config XDG_DATA_HOME=$T/.local/share XDG_CACHE_HOME=$T/.cache \
  XDG_RUNTIME_DIR=$T/.runtime JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=$T" \
  setsid "$DBEAVER_DIR/dbeaver" >/dev/null 2>&1 &)
W=$(wait_win "^Product Configuration")
sleep 2; xdotool windowactivate --sync "$W" key Return
M=$(wait_win "^DBeaver [0-9]")
sleep 10
wmctrl -i -c "$M"
E=$(wait_win "^Exit DBeaver")
xdotool windowactivate --sync "$E" key Return
for _ in $(seq 300); do pgrep -f "user.home=$T" >/dev/null || break; sleep 0.1; done
pkill -9 -f "user.home=$T" || true
rm -rf "$T/.runtime"
echo "profile ready: $T"
