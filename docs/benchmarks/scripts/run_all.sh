#!/usr/bin/env bash
# Full benchmark: launch metrics (warm then cold) for the three apps + Datowl fetch bench.
# Raw results go to $OUT (default /tmp/datowl-bench); then run aggregate.py.
#
# Env: DATOWL_BIN, DATAGRIP_DIR, DBEAVER_DIR, RUNS (default 5), PY (python with python-xlib).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DATOWL_BIN=${DATOWL_BIN:-$HERE/../../../target/release/Datowl}
DATAGRIP_DIR=${DATAGRIP_DIR:-/opt/bench/apps/DataGrip-2026.2.6.1}
DBEAVER_DIR=${DBEAVER_DIR:-/opt/bench/apps/dbeaver}
RUNS=${RUNS:-5}
PY=${PY:-/opt/bench/venv/bin/python}
OUT=${OUT:-/tmp/datowl-bench}
mkdir -p "$OUT/shots"

. "$HERE/start_display.sh"
"$HERE/setup_postgres.sh" >/dev/null

declare -A CMD=(
  [datowl]="$DATOWL_BIN"
  [datagrip]="$DATAGRIP_DIR/bin/datagrip"
  [dbeaver]="$DBEAVER_DIR/dbeaver"
)
APPS=(datowl datagrip dbeaver)

launch() { # app run [--cold]
  "$PY" "$HERE/measure_launch.py" --name "$1" --run "$2" ${3:-} --out "$OUT/shots" -- ${CMD[$1]} >> "$OUT/launch.jsonl"
  sleep 3
}

: > "$OUT/launch.jsonl"
# One discarded warm-up per app: fills the page cache so "warm" runs are comparable.
for app in "${APPS[@]}"; do
  "$PY" "$HERE/measure_launch.py" --name "$app" --run warmup --out "$OUT/shots" -- ${CMD[$app]} > /dev/null
  sleep 3
done
# Round-robin so that any drift of the machine spreads over the three apps.
for i in $(seq 1 "$RUNS"); do
  for app in "${APPS[@]}"; do launch "$app" "warm$i"; done
done
for i in $(seq 1 "$RUNS"); do
  for app in "${APPS[@]}"; do launch "$app" "cold$i" --cold; done
done

# Fetch path (Datowl engine, no UI).
(cd "$HERE/datowl-fetch-bench" && cargo build --release --quiet --target-dir "${FETCH_TARGET:-/opt/bench/fetch-target}")
"${FETCH_TARGET:-/opt/bench/fetch-target}/release/datowl-fetch-bench" "$RUNS" > "$OUT/fetch.jsonl"

# Installed sizes (bytes, apparent size) and versions.
{
  echo "datowl $(stat -c %s "$DATOWL_BIN")"
  echo "datagrip $(du -sb "$DATAGRIP_DIR" | cut -f1)"
  echo "dbeaver $(du -sb "$DBEAVER_DIR" | cut -f1)"
  echo "webkitgtk_runtime $(dpkg-query -W -f='${Installed-Size}\n' libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0 | awk '{s+=$1} END {print s*1024}')"
} > "$OUT/sizes.txt"
echo "done: $OUT"
