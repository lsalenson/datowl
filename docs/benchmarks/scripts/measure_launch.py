#!/usr/bin/env python3
"""Launch one desktop app on an X display and measure it.

For one run:
  * window timeline: every top-level window the app maps (title, class, type, size),
    when it became viewable and when its content was first "painted" (more than
    PAINT_MIN_COLORS distinct colours in sampled rows);
  * CPU: the app runs in its own cgroup v1 (cpuacct), so every process it spawns is
    counted, even daemonised ones; sampled at +20 s and +30 s;
  * memory: PSS summed over every process of the cgroup at +30 s (/proc/PID/smaps_rollup);
  * a screenshot of the screen at +30 s (first-screen state).

The app gets a fresh, empty HOME for each run (also used as the JVM's user.home), so every
run sees the same first screen; --home-template copies a prepared profile into it instead.
Prints one JSON object on stdout.

Usage: measure_launch.py --name datowl --out DIR -- /path/to/binary [args...]
Needs: root (cgroup), DISPLAY pointing to a running X server with a window manager,
python-xlib, ImageMagick `import` for the screenshot.
"""
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time

from Xlib import X, display as xdisplay
from Xlib.error import XError

CGROOT = "/sys/fs/cgroup/cpuacct"
POLL_S = 0.01
PAINT_MIN_COLORS = 8
SAMPLE_ROWS = 12


def cg_usage_ns(cg):
    with open(os.path.join(cg, "cpuacct.usage")) as f:
        return int(f.read())


def cg_pids(cg):
    with open(os.path.join(cg, "cgroup.procs")) as f:
        return [int(x) for x in f.read().split()]


def pss_kb(pid):
    try:
        with open(f"/proc/{pid}/smaps_rollup") as f:
            for line in f:
                if line.startswith("Pss:"):
                    return int(line.split()[1])
    except (FileNotFoundError, ProcessLookupError, PermissionError):
        pass
    return 0


def comm(pid):
    try:
        with open(f"/proc/{pid}/comm") as f:
            return f.read().strip()
    except OSError:
        return "?"


class Windows:
    def __init__(self):
        self.d = xdisplay.Display()
        self.root = self.d.screen().root
        a = self.d.intern_atom
        self.CLIENT_LIST = a("_NET_CLIENT_LIST")
        self.WM_TYPE = a("_NET_WM_WINDOW_TYPE")
        self.WM_NAME = a("_NET_WM_NAME")
        self.UTF8 = a("UTF8_STRING")
        self.WM_PID = a("_NET_WM_PID")
        self.type_names = {}

    def clients(self):
        p = self.root.get_full_property(self.CLIENT_LIST, X.AnyPropertyType)
        return list(p.value) if p else []

    def info(self, wid):
        w = self.d.create_resource_object("window", wid)
        try:
            attrs = w.get_attributes()
            if attrs.map_state != X.IsViewable:
                return None
            geo = w.get_geometry()
            name = w.get_full_property(self.WM_NAME, self.UTF8)
            name = name.value.decode("utf-8", "replace") if name else (w.get_wm_name() or "")
            cls = w.get_wm_class()
            t = w.get_full_property(self.WM_TYPE, X.AnyPropertyType)
            types = []
            for atom in (t.value if t else []):
                if atom not in self.type_names:
                    self.type_names[atom] = self.d.get_atom_name(atom)
                types.append(self.type_names[atom].replace("_NET_WM_WINDOW_TYPE_", ""))
            pid = w.get_full_property(self.WM_PID, X.AnyPropertyType)
            return {
                "id": hex(wid),
                "title": name if isinstance(name, str) else str(name),
                "class": list(cls) if cls else None,
                "types": types,
                "pid": int(pid.value[0]) if pid else None,
                "width": geo.width,
                "height": geo.height,
            }
        except XError:
            return None

    def colours(self, wid, width, height):
        """Distinct pixel values over SAMPLE_ROWS evenly spaced rows of the window."""
        w = self.d.create_resource_object("window", wid)
        seen = set()
        try:
            for i in range(SAMPLE_ROWS):
                y = int((i + 0.5) * height / SAMPLE_ROWS)
                img = w.get_image(0, y, width, 1, X.ZPixmap, 0xFFFFFFFF)
                data = img.data
                for x in range(0, len(data) - 3, 4):
                    seen.add(data[x:x + 3])
                if len(seen) > 64:
                    break
        except XError:
            return 0
        return len(seen)


def kill_cgroup(cg):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for pid in cg_pids(cg):
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 10
        while cg_pids(cg) and time.monotonic() < deadline:
            time.sleep(0.1)
        if not cg_pids(cg):
            break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True, help="directory for screenshots")
    ap.add_argument("--settle", type=float, default=30.0, help="seconds after launch for memory/CPU")
    ap.add_argument("--run", default="0")
    ap.add_argument("--home-template", help="directory copied into the fresh HOME (pre-configured profile)")
    ap.add_argument("--cold", action="store_true", help="drop the page cache before launching")
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    a = ap.parse_args()
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd

    cg = os.path.join(CGROOT, f"bench-{a.name}-{os.getpid()}")
    os.makedirs(cg, exist_ok=True)
    home = tempfile.mkdtemp(prefix=f"home-{a.name}-")
    if a.home_template:
        shutil.copytree(a.home_template, home, dirs_exist_ok=True, symlinks=True)
    runtime = os.path.join(home, ".runtime")
    os.makedirs(runtime, mode=0o700)
    env = dict(os.environ, HOME=home, XDG_CONFIG_HOME=f"{home}/.config",
               XDG_DATA_HOME=f"{home}/.local/share", XDG_CACHE_HOME=f"{home}/.cache",
               XDG_RUNTIME_DIR=runtime,
               # The JVM takes user.home from /etc/passwd, not $HOME: point it at the fresh home too.
               JAVA_TOOL_OPTIONS=(os.environ.get("JAVA_TOOL_OPTIONS", "") + f" -Duser.home={home}").strip())

    win = Windows()
    before = set(win.clients())

    def enter_cgroup():
        with open(os.path.join(cg, "cgroup.procs"), "w") as f:
            f.write(str(os.getpid()))
        os.setsid()

    if a.cold:
        os.sync()
        with open("/proc/sys/vm/drop_caches", "w") as f:
            f.write("3")
    t0 = time.monotonic()
    proc = subprocess.Popen(cmd, env=env, cwd=home, preexec_fn=enter_cgroup,
                            stdout=subprocess.DEVNULL, stderr=open(f"{a.out}/{a.name}-{a.run}.log", "w"))
    windows = {}
    first_window = first_paint = None
    cpu20 = None
    while True:
        now = time.monotonic() - t0
        if now >= a.settle:
            break
        if cpu20 is None and now >= a.settle - 10:
            cpu20 = (cg_usage_ns(cg), time.monotonic() - t0)
        for wid in win.clients():
            if wid in before:
                continue
            w = windows.get(wid)
            if w is None:
                info = win.info(wid)
                if info is None:
                    continue
                info["viewable_ms"] = round(now * 1000)
                info["painted_ms"] = None
                windows[wid] = w = info
                if first_window is None:
                    first_window = info["viewable_ms"]
            if w["painted_ms"] is None and "SPLASH" not in w["types"]:
                n = win.colours(wid, w["width"], w["height"])
                if n >= PAINT_MIN_COLORS:
                    w["painted_ms"] = round((time.monotonic() - t0) * 1000)
                    w["colours_at_paint"] = n
                    if first_paint is None:
                        first_paint = w["painted_ms"]
        time.sleep(POLL_S)

    cpu30 = (cg_usage_ns(cg), time.monotonic() - t0)
    pids = cg_pids(cg)
    procs = [{"pid": p, "comm": comm(p), "pss_kb": pss_kb(p)} for p in pids]
    pss_total = sum(p["pss_kb"] for p in procs)
    # Re-read window titles at the end: first-screen state.
    final_windows = [i for i in (win.info(w) for w in win.clients() if w not in before) if i]
    shot = f"{a.out}/{a.name}-{a.run}.png"
    subprocess.run(["import", "-window", "root", shot], check=False)

    kill_cgroup(cg)
    proc.wait(timeout=10)
    os.rmdir(cg)
    shutil.rmtree(home, ignore_errors=True)

    idle_cpu_pct = None
    if cpu20:
        idle_cpu_pct = 100.0 * (cpu30[0] - cpu20[0]) / 1e9 / (cpu30[1] - cpu20[1])
    print(json.dumps({
        "app": a.name,
        "run": a.run,
        "cold": a.cold,
        "first_window_ms": first_window,
        "first_paint_ms": first_paint,
        "cpu_total_s": round(cpu30[0] / 1e9, 3),
        "cpu_idle_pct": round(idle_cpu_pct, 2) if idle_cpu_pct is not None else None,
        "pss_mb": round(pss_total / 1024, 1),
        "settle_s": a.settle,
        "processes": procs,
        "windows_timeline": sorted(windows.values(), key=lambda w: w["viewable_ms"]),
        "windows_at_end": final_windows,
        "screenshot": os.path.basename(shot),
    }))


if __name__ == "__main__":
    sys.exit(main())
