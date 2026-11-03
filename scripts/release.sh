#!/usr/bin/env bash
# Publishes a Datowl release that installed apps pick up through their updater.
#
#   scripts/release.sh 0.2.0 "What changed"
#
# Bumps the version everywhere, commits it and pushes a tag. The Release workflow then
# builds the macOS, Windows and Linux installers and publishes the GitHub release.
# See docs/releases.md.
set -euo pipefail

VERSION="${1:?usage: scripts/release.sh <version> [notes]}"
NOTES="${2:-Datowl $VERSION}"
REPO="${DATOWL_RELEASES_REPO:-lsalenson/datowl}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 1.2.3" >&2; exit 1; }
gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1 && { echo "v$VERSION is already published" >&2; exit 1; }
# The tag must contain everything being released, and the build runs from what is pushed.
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "Commit or stash your changes first" >&2; exit 1; }
[[ "$(git -C "$ROOT" branch --show-current)" == main ]] || { echo "Release from main" >&2; exit 1; }

echo "→ Version $VERSION"
python3 - "$ROOT" "$VERSION" <<'PY'
import json, re, sys
root, version = sys.argv[1], sys.argv[2]
path = f'{root}/Cargo.toml'
text = open(path).read()
open(path, 'w').write(re.sub(r'(?m)^version = "[^"]+"', f'version = "{version}"', text, count=1))
for path in [f'{root}/apps/desktop/src-tauri/tauri.conf.json', f'{root}/web/package.json', f'{root}/apps/desktop/package.json']:
    data = json.load(open(path))
    data['version'] = version
    json.dump(data, open(path, 'w'), indent=2)
    open(path, 'a').write('\n')
PY

(cd "$ROOT" && cargo update --workspace --quiet)

echo "→ Tag v$VERSION"
git -C "$ROOT" add Cargo.toml Cargo.lock apps/desktop/src-tauri/tauri.conf.json web/package.json apps/desktop/package.json
git -C "$ROOT" commit --quiet -m "release: v$VERSION"
git -C "$ROOT" tag -a "v$VERSION" -m "$NOTES"
git -C "$ROOT" push --quiet --atomic origin main "v$VERSION"

echo "✓ v$VERSION pushed. Follow the build: gh run watch --repo $REPO"
echo "  Installed apps will offer it once the workflow has published the release."
