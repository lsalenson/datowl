#!/usr/bin/env python3
"""Builds docs/benchmarks/results.json from the raw output of run_all.sh.

Usage: aggregate.py RAW_DIR OUTPUT_DIR
  RAW_DIR     launch.jsonl, fetch.jsonl, sizes.txt, shots/ (written by run_all.sh)
  OUTPUT_DIR  docs/benchmarks: receives results.json, raw/*.jsonl and screenshots/*.png
"""
import json
import os
import platform
import re
import shutil
import statistics
import subprocess
import sys
from datetime import datetime, timezone

APPS = ["datowl", "datagrip", "dbeaver", "dbeaver_configured"]
DATAGRIP_DIR = os.environ.get("DATAGRIP_DIR", "/opt/bench/apps/DataGrip-2026.2.6.1")
DBEAVER_DIR = os.environ.get("DBEAVER_DIR", "/opt/bench/apps/dbeaver")


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


def metric(values, unit, description):
    clean = [v for v in values if v is not None]
    return {
        "median": round(statistics.median(clean), 3) if clean else None,
        "unit": unit,
        "runs": len(clean),
        "values": values,
        "description": description,
    }


def first_screen(runs):
    """Window titles present at +30 s, with how many runs showed them."""
    seen = {}
    for r in runs:
        titles = tuple(sorted(w["title"].strip() for w in r["windows_at_end"]))
        seen[titles] = seen.get(titles, 0) + 1
    return [{"windows": list(t), "runs": n} for t, n in seen.items()]


def main():
    raw, out = sys.argv[1], sys.argv[2]
    launches = [json.loads(l) for l in open(os.path.join(raw, "launch.jsonl"))]
    fetch = [json.loads(l) for l in open(os.path.join(raw, "fetch.jsonl"))]
    sizes = dict(line.split() for line in open(os.path.join(raw, "sizes.txt")))

    lscpu = sh("lscpu")
    def lscpu_field(name):
        m = re.search(rf"^{re.escape(name)}:\s*(.+)$", lscpu, re.M)
        return m.group(1).strip() if m else None
    mem_kb = int(re.search(r"MemTotal:\s+(\d+)", open("/proc/meminfo").read()).group(1))
    os_name = re.search(r'PRETTY_NAME="(.+)"', open("/etc/os-release").read()).group(1)

    datagrip_info = json.load(open(os.path.join(DATAGRIP_DIR, "product-info.json")))
    dbeaver_info = dict(l.split("=", 1) for l in open(os.path.join(DBEAVER_DIR, ".eclipseproduct")).read().split())
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    tauri_conf = json.load(open(os.path.join(repo, "apps/desktop/src-tauri/tauri.conf.json")))

    def jre(path):
        m = re.search(r'IMPLEMENTOR_VERSION="(.+)"', open(path).read()) or re.search(r'JAVA_VERSION="(.+)"', open(path).read())
        return m.group(1)

    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "machine": {
            "cpu": lscpu_field("Model name"),
            "vcpus": int(lscpu_field("CPU(s)")),
            "hypervisor": lscpu_field("Hypervisor vendor"),
            "ram_gb": round(mem_kb / 1024 / 1024, 1),
            "gpu": "none (software rendering: Xvfb + Mesa llvmpipe)",
            "os": os_name,
            "kernel": platform.release(),
            "display": "Xvfb 1920x1080x24 + Openbox " + sh("dpkg-query -W -f='${Version}' openbox"),
            "postgresql": sh("psql -h localhost -p 55432 -U datowl -d postgres -tAc 'show server_version'"),
        },
        "apps": {
            "datowl": {
                "version": tauri_conf["version"],
                "commit": sh(f"git -C {repo} rev-parse HEAD"),
                "build": "release, `npx tauri build --no-bundle` (lto=thin, codegen-units=1, strip)",
                "runtime": "WebKitGTK " + sh("dpkg-query -W -f='${Version}' libwebkit2gtk-4.1-0"),
            },
            "datagrip": {
                "version": datagrip_info["version"],
                "build": datagrip_info["buildNumber"],
                "source": f"https://download.jetbrains.com/datagrip/datagrip-{datagrip_info['version']}.tar.gz",
                "runtime": jre(os.path.join(DATAGRIP_DIR, "jbr/release")),
            },
            "dbeaver": {
                "version": dbeaver_info["version"],
                "build": dbeaver_info.get("snapshot"),
                "source": f"https://github.com/dbeaver/dbeaver/releases/download/{dbeaver_info['version']}/dbeaver-ce-{dbeaver_info['version']}-linux-x86_64.tar.gz",
                "runtime": "Java " + jre(os.path.join(DBEAVER_DIR, "jre/release")),
            },
        },
        "metrics": {},
    }
    results["apps"]["dbeaver_configured"] = dict(
        results["apps"]["dbeaver"],
        profile="first-run 'Product Configuration' wizard completed with its defaults (prepare_dbeaver_profile.sh)",
    )

    for app in APPS:
        m = {}
        for mode in ("warm", "cold"):
            runs = sorted((r for r in launches if r["app"] == app and r["run"].startswith(mode)), key=lambda r: r["run"])
            if not runs:
                continue
            suffix = "" if mode == "warm" else "_cold"
            m["first_window" + suffix] = metric([r["first_window_ms"] for r in runs], "ms",
                f"exec -> first viewable top-level window (splash included), {mode} page cache")
            m["visually_complete" + suffix] = metric([r["visually_complete_ms"] for r in runs], "ms",
                f"exec -> screen identical (>= 98 % of the cells the app changes) to its state at +30 s, {mode} page cache")
            m["cpu_time_30s" + suffix] = metric([r["cpu_total_s"] for r in runs], "s",
                "CPU time (user+sys) of every process of the app, exec -> +30 s")
            m["idle_cpu" + suffix] = metric([r["cpu_idle_pct"] for r in runs], "% of one core",
                "mean CPU between +20 s and +30 s")
            m["memory_pss" + suffix] = metric([r["pss_mb"] for r in runs], "MB",
                "PSS summed over every process of the app at +30 s (MB = 1024*1024 bytes)")
            if mode == "warm":
                m["first_screen"] = first_screen(runs)
                m["processes_at_30s"] = sorted({p["comm"] for r in runs for p in r["processes"]})
        m["disk_size"] = {"value": round(int(sizes[app.replace("_configured", "")]) / 1e6, 1), "unit": "MB",
                          "description": "apparent size (du -sb) of what is installed; Datowl: the single binary"}
        results["metrics"][app] = m

    results["metrics"]["datowl"]["disk_size_shared_runtime"] = {
        "value": round(int(sizes["webkitgtk_runtime"]) / 1e6, 1), "unit": "MB",
        "description": "Installed-Size of libwebkit2gtk-4.1-0 + libjavascriptcoregtk-4.1-0 (system packages Datowl "
                       "needs on Linux and which are not counted above; on macOS the system WebView is used)",
    }
    results["metrics"]["datowl"]["query_select_200k"] = {
        "scope": "Datowl PostgreSQL engine (datowl-postgres) without UI: `SELECT * FROM bench_rows`, 200 000 rows x 3 columns",
        "first_row": metric([r["first_row_ms"] for r in fetch], "ms", "execute -> first row in the sink (page of 500)"),
        "first_page_500": metric([r["first_page_500_ms"] for r in fetch], "ms", "execute -> first page of 500 rows complete (UI default page size)"),
        "all_rows": metric([r["all_rows_ms"] for r in fetch], "ms", "execute -> all 200 000 rows in the sink"),
    }
    for app in ("datagrip", "dbeaver", "dbeaver_configured"):
        results["metrics"][app]["query_select_200k"] = {
            "first_row": None, "first_page_500": None, "all_rows": None,
            "reason": "not measured reproducibly, see README.md",
        }

    os.makedirs(os.path.join(out, "raw"), exist_ok=True)
    os.makedirs(os.path.join(out, "screenshots"), exist_ok=True)
    for name in ("launch.jsonl", "fetch.jsonl", "sizes.txt"):
        shutil.copy(os.path.join(raw, name), os.path.join(out, "raw", name))
    for app in APPS:
        src = os.path.join(raw, "shots", f"{app}-warm1.png")
        if os.path.exists(src):
            subprocess.run(["convert", src, "-resize", "50%", os.path.join(out, "screenshots", f"{app}-first-screen.png")], check=True)

    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
