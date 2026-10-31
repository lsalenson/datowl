#!/usr/bin/env bash
# Full benchmark: launch metrics (warm then cold) for the three apps + Datowl fetch bench.
# Expects freshly extracted DataGrip / DBeaver directories (never launched before).
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

# Sizes first: DBeaver writes its OSGi cache into its own install dir once launched.
{
  echo "datowl $(stat -c %s "$DATOWL_BIN")"
  echo "datagrip $(du -sb "$DATAGRIP_DIR" | cut -f1)"
  echo "dbeaver $(du -sb "$DBEAVER_DIR" | cut -f1)"
  echo "webkitgtk_runtime $(dpkg-query -W -f='${Installed-Size}\n' libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0 | awk '{s+=$1} END {print s*1024}')"
} > "$OUT/sizes.txt"

# DBeaver with its first-run wizard completed (second series, see README).
DBEAVER_PROFILE=${DBEAVER_PROFILE:-/tmp/datowl-bench-dbeaver-profile}
"$HERE/prepare_dbeaver_profile.sh" "$DBEAVER_DIR" "$DBEAVER_PROFILE"

declare -A CMD=(
  [datowl]="$DATOWL_BIN"
  [datagrip]="$DATAGRIP_DIR/bin/datagrip"
  [dbeaver]="$DBEAVER_DIR/dbeaver"
  [dbeaver_configured]="$DBEAVER_DIR/dbeaver"
)
declare -A EXTRA=([dbeaver_configured]="--home-template $DBEAVER_PROFILE")
APPS=(datowl datagrip dbeaver dbeaver_configured)

launch() { # app run [--cold]
  . "$HERE/restart_display.sh"
  "$PY" "$HERE/measure_launch.py" --name "$1" --run "$2" ${3:-} ${EXTRA[$1]:-} --out "$OUT/shots" -- ${CMD[$1]} >> "$OUT/launch.jsonl"
  sleep 3
}

: > "$OUT/launch.jsonl"
# One discarded warm-up per app: fills the page cache so "warm" runs are comparable.
for app in "${APPS[@]}"; do
  . "$HERE/restart_display.sh"
  "$PY" "$HERE/measure_launch.py" --name "$app" --run warmup ${EXTRA[$app]:-} --out "$OUT/shots" -- ${CMD[$app]} > /dev/null
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
echo "done: $OUT"
