#!/usr/bin/env bash
# Virtual display :99 (1920x1080x24) + Openbox + a session D-Bus shared by all apps.
# Source it: `. start_display.sh` exports DISPLAY and DBUS_SESSION_BUS_ADDRESS.
export DISPLAY=:99
if ! xdpyinfo >/dev/null 2>&1; then
  (Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &)
  for _ in $(seq 50); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.1; done
fi
if [ ! -f /tmp/bench-dbus.env ]; then
  dbus-daemon --session --fork --print-address=1 > /tmp/bench-dbus.addr
  echo "export DBUS_SESSION_BUS_ADDRESS=$(cat /tmp/bench-dbus.addr)" > /tmp/bench-dbus.env
fi
. /tmp/bench-dbus.env
pgrep -x openbox >/dev/null || (openbox >/tmp/openbox.log 2>&1 &)
# Wait until the window manager is up (it maintains _NET_CLIENT_LIST, used for detection).
for _ in $(seq 100); do xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q window && break; sleep 0.1; done
sleep 1
