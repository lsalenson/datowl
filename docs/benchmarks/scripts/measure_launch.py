#!/usr/bin/env python3
"""Launch one desktop app on an X display and measure it.

For one run:
  * first_window_ms: exec -> first top-level window of the app becomes viewable (X map state,
    splash screens included), polled every 10 ms through the window manager's client list;
  * visually_complete_ms: exec -> first instant from which the screen stays (>= MATCH_RATIO of
    the cells the app changes) identical to the screen at +settle. The screen is sampled every
    SCREEN_EVERY_S as a grid of cells (GRID_ROWS rows x CELL_W px), each reduced to a hash.
    Comparing to the final screen makes stale pixels harmless: Xvfb without a compositor shows
    leftovers (splash, previous app) in windows that are mapped but not drawn yet;
  * CPU: the app runs in its own cgroup v1 (cpuacct), so every process it spawns is counted,
    even daemonised ones; read at +settle-10 s and +settle;
  * memory: PSS summed over every process of the cgroup at +settle (/proc/PID/smaps_rollup);
  * a screenshot of the screen at +settle (first-screen state).

The app gets a fresh, empty HOME for each run (also used as the JVM's user.home), so every
run sees the same first screen; --home-template copies a prepared profile into it instead.
Prints one JSON object on stdout.

Usage: measure_launch.py --name datowl --out DIR -- /path/to/binary [args...]
Needs: root (cgroup), DISPLAY pointing to a freshly started X server with a window manager
(restart_display.sh), python-xlib, ImageMagick `import` for the screenshots.
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
SCREEN_EVERY_S = 0.05
GRID_ROWS = 24
CELL_W = 64
MATCH_RATIO = 0.98


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


class Screen:
    def __init__(self):
        self.d = xdisplay.Display()
        self.root = self.d.screen().root
        geo = self.root.get_geometry()
        self.width, self.height = geo.width, geo.height
        a = self.d.intern_atom
        self.CLIENT_LIST = a("_NET_CLIENT_LIST")
        self.WM_TYPE = a("_NET_WM_WINDOW_TYPE")
        self.WM_NAME = a("_NET_WM_NAME")
        self.UTF8 = a("UTF8_STRING")
        self.type_names = {}

    def clients(self):
        p = self.root.get_full_property(self.CLIENT_LIST, X.AnyPropertyType)
        return list(p.value) if p else []

    def info(self, wid):
        w = self.d.create_resource_object("window", wid)
        try:
            if w.get_attributes().map_state != X.IsViewable:
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
            return {
                "id": hex(wid),
                "title": name if isinstance(name, str) else str(name),
                "class": list(cls) if cls else None,
                "types": types,
                "width": geo.width,
                "height": geo.height,
            }
        except XError:
            return None

    def grid(self):
        """Hashes of GRID_ROWS x (width / CELL_W) cells of the whole screen."""
        cells = []
        step = CELL_W * 4
        for i in range(GRID_ROWS):
            y = int((i + 0.5) * self.height / GRID_ROWS)
            data = self.root.get_image(0, y, self.width, 1, X.ZPixmap, 0xFFFFFFFF).data
            cells.extend(hash(data[x:x + step]) for x in range(0, len(data), step))
        return cells


def visually_complete(initial, samples, final):
    """First sample time from which >= MATCH_RATIO of the app's cells equal the final screen."""
    app_cells = [i for i, (a, b) in enumerate(zip(initial, final)) if a != b]
    if not app_cells:
        return None, []
    progress = []
    for t, cells in samples:
        same = sum(1 for i in app_cells if cells[i] == final[i])
        progress.append((t, same / len(app_cells)))
    complete = None
    for t, ratio in reversed(progress):
        if ratio < MATCH_RATIO:
            break
        complete = t
    # Keep the timeline small: only the points where the ratio changes.
    changes = [p for k, p in enumerate(progress) if k == 0 or p[1] != progress[k - 1][1]]
    return complete, [(t, round(r, 3)) for t, r in changes]


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
    ap.add_argument("--out", required=True, help="directory for screenshots and app logs")
    ap.add_argument("--settle", type=float, default=30.0, help="seconds after launch for memory/CPU")
    ap.add_argument("--run", default="0")
    ap.add_argument("--home-template", help="directory copied into the fresh HOME (pre-configured profile)")
    ap.add_argument("--frames", help="validation only: save screen captures every 250 ms for 10 s here")
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
    os.makedirs(runtime, mode=0o700, exist_ok=True)
    env = dict(os.environ, HOME=home, XDG_CONFIG_HOME=f"{home}/.config",
               XDG_DATA_HOME=f"{home}/.local/share", XDG_CACHE_HOME=f"{home}/.cache",
               XDG_RUNTIME_DIR=runtime,
               # The JVM takes user.home from /etc/passwd, not $HOME: point it at the fresh home too.
               JAVA_TOOL_OPTIONS=(os.environ.get("JAVA_TOOL_OPTIONS", "") + f" -Duser.home={home}").strip())

    scr = Screen()
    before = set(scr.clients())
    initial = scr.grid()

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
    first_window = None
    samples = []
    next_sample = 0.0
    next_frame = 0.0
    cpu_mid = None
    while True:
        now = time.monotonic() - t0
        if now >= a.settle:
            break
        if cpu_mid is None and now >= a.settle - 10:
            cpu_mid = (cg_usage_ns(cg), now)
        for wid in scr.clients():
            if wid in before or wid in windows:
                continue
            info = scr.info(wid)
            if info is None:
                continue
            info["viewable_ms"] = round(now * 1000)
            windows[wid] = info
            if first_window is None:
                first_window = info["viewable_ms"]
        if now >= next_sample:
            next_sample = now + SCREEN_EVERY_S
            samples.append((round(now * 1000), scr.grid()))
        if a.frames and now < 10 and now >= next_frame:
            next_frame = now + 0.25
            subprocess.run(["import", "-window", "root", "-resize", "50%",
                            f"{a.frames}/{a.name}-{a.run}-{round(now * 1000):05d}.png"], stderr=subprocess.DEVNULL)
        time.sleep(POLL_S)

    cpu_end = (cg_usage_ns(cg), time.monotonic() - t0)
    final = scr.grid()
    pids = cg_pids(cg)
    procs = [{"pid": p, "comm": comm(p), "pss_kb": pss_kb(p)} for p in pids]
    pss_total = sum(p["pss_kb"] for p in procs)
    final_windows = [i for i in (scr.info(w) for w in scr.clients() if w not in before) if i]
    shot = f"{a.out}/{a.name}-{a.run}.png"
    subprocess.run(["import", "-window", "root", shot], check=False)

    kill_cgroup(cg)
    proc.wait(timeout=10)
    os.rmdir(cg)
    shutil.rmtree(home, ignore_errors=True)

    complete, progress = visually_complete(initial, samples, final)
    idle_cpu_pct = None
    if cpu_mid:
        idle_cpu_pct = 100.0 * (cpu_end[0] - cpu_mid[0]) / 1e9 / (cpu_end[1] - cpu_mid[1])
    print(json.dumps({
        "app": a.name,
        "run": a.run,
        "cold": a.cold,
        "first_window_ms": first_window,
        "visually_complete_ms": complete,
        "cpu_total_s": round(cpu_end[0] / 1e9, 3),
        "cpu_idle_pct": round(idle_cpu_pct, 2) if idle_cpu_pct is not None else None,
        "pss_mb": round(pss_total / 1024, 1),
        "settle_s": a.settle,
        "processes": procs,
        "windows_timeline": sorted(windows.values(), key=lambda w: w["viewable_ms"]),
        "windows_at_end": final_windows,
        "visual_progress": progress,
        "screenshot": os.path.basename(shot),
    }))


if __name__ == "__main__":
    sys.exit(main())
