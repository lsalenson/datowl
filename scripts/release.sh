#!/usr/bin/env bash
# Publishes a Datowl release that installed apps pick up through their updater.
#
#   scripts/release.sh 0.2.0 "What changed"
#
# Bumps the version everywhere, builds a universal macOS app, signs the update with
# ~/.tauri/datowl.key and publishes a GitHub release (dmg for new installs, signed
# archive + latest.json for updates) on the releases repository. See docs/releases.md.
set -euo pipefail

VERSION="${1:?usage: scripts/release.sh <version> [notes]}"
NOTES="${2:-Datowl $VERSION}"
REPO="${DATOWL_RELEASES_REPO:-lsalenson/datowl}"
KEY="${DATOWL_SIGNING_KEY:-$HOME/.tauri/datowl.key}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 1.2.3" >&2; exit 1; }
[[ -f "$KEY" ]] || { echo "Missing signing key $KEY" >&2; exit 1; }
gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1 && { echo "v$VERSION is already published" >&2; exit 1; }
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null

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

echo "→ Build (universal)"
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
(cd "$ROOT/apps/desktop" && npx tauri build --target universal-apple-darwin)

BUNDLE="$ROOT/target/universal-apple-darwin/release/bundle"
ARCHIVE="$BUNDLE/macos/Datowl.app.tar.gz"
DMG="$(ls "$BUNDLE"/dmg/*.dmg | head -1)"
URL="https://github.com/$REPO/releases/download/v$VERSION/Datowl.app.tar.gz"
MANIFEST="$(mktemp -d)/latest.json"

python3 - "$VERSION" "$NOTES" "$URL" "$ARCHIVE.sig" "$MANIFEST" <<'PY'
import json, sys
from datetime import datetime, timezone
version, notes, url, sig, out = sys.argv[1:]
signature = open(sig).read().strip()
platform = {'signature': signature, 'url': url}
json.dump({
    'version': version,
    'notes': notes,
    'pub_date': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    # One universal build serves both architectures.
    'platforms': {'darwin-aarch64': platform, 'darwin-x86_64': platform},
}, open(out, 'w'), indent=2)
PY

echo "→ Publish on $REPO"
gh release create "v$VERSION" --repo "$REPO" --title "Datowl $VERSION" --notes "$NOTES" \
  "$DMG" "$ARCHIVE" "$ARCHIVE.sig" "$MANIFEST"
echo "✓ Datowl $VERSION published. Installed apps will offer it within six hours (or via Settings › Check for Updates…)."
