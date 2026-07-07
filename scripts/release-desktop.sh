#!/usr/bin/env bash
set -euo pipefail

# Builds, packages and (optionally) publishes one macOS architecture of the
# Soriku IDE desktop app to soriku.com. Windows/Linux are Fase 9 (CI parity),
# not yet wired here.
#
# Why one arch per run: applications/electron/electron-builder.yml pins
# `electronDist` to the locally installed, single-arch electron binaries
# (../../node_modules/electron/dist). Cross-packaging the *other* arch from
# one machine would need electron-builder to fetch a second electron binary
# out from under that pin — untested and not something to paper over. The
# project's own CI (.github/workflows/build.yml) already avoids this by
# running arm64 (macos-15) and x64 (macos-15-intel) as two separate runners
# and sed-patching electron-builder.yml's mac publish URL only on the arm64
# leg. This script mirrors that: run it once per Mac (one Apple Silicon, one
# Intel/Rosetta) and it packages+stages that machine's native arch only.
#
# Usage:
#   scripts/release-desktop.sh                                   dry run, stage only
#   scripts/release-desktop.sh --channel=preview                 stage a preview build
#   SORIKU_RELEASE_HOST=deploy@soriku.com \
#     scripts/release-desktop.sh --publish                       stage + rsync + merge manifest
#
# Env:
#   SORIKU_RELEASE_HOST   ssh host for rsync, e.g. deploy@soriku.com (required for --publish)
#   SORIKU_RELEASE_PATH   remote base path (default: /var/www/soriku.com/downloads/ide)
#   CSC_LINK / CSC_KEY_PASSWORD                              mac code-signing identity
#   APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID   notarization (or the API-key trio)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_DIR="$ROOT_DIR/applications/electron"
BUILDER_YML="$ELECTRON_DIR/electron-builder.yml"
STAGE_DIR="$ROOT_DIR/release-stage"
CHANNEL="stable"
PUBLISH=false

for arg in "$@"; do
  case "$arg" in
    --publish) PUBLISH=true ;;
    --channel=*) CHANNEL="${arg#*=}" ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

NODE_ARCH="$(node -p process.arch)"
case "$NODE_ARCH" in
  arm64) ARCH="arm64"; ARCH_DIR="macos-arm" ;;
  x64) ARCH="x64"; ARCH_DIR="macos" ;;
  *) echo "Unsupported host arch: $NODE_ARCH (this script only packages macOS)" >&2; exit 1 ;;
esac

VERSION="$(node -p "require('$ELECTRON_DIR/package.json').version")"
echo "==> Releasing Soriku IDE v$VERSION ($CHANNEL channel, $ARCH)"

mkdir -p "$STAGE_DIR/$ARCH_DIR"

echo "==> Building extensions + applications"
(cd "$ROOT_DIR" && yarn build)
(cd "$ROOT_DIR" && yarn download:plugins)

if [ "$ARCH_DIR" = "macos-arm" ]; then
  cp "$BUILDER_YML" "$BUILDER_YML.bak"
  sed -i '' "s|/downloads/ide/${CHANNEL}/macos\"|/downloads/ide/${CHANNEL}/macos-arm\"|g" "$BUILDER_YML"
  trap 'mv "$BUILDER_YML.bak" "$BUILDER_YML" 2>/dev/null || true' EXIT
fi

echo "==> Packaging macOS ($ARCH)"
(cd "$ELECTRON_DIR" && yarn clean:dist && yarn rebuild && npx electron-builder --mac --"$ARCH" --publish never)

if [ "$ARCH_DIR" = "macos-arm" ]; then
  mv "$BUILDER_YML.bak" "$BUILDER_YML"
  trap - EXIT
fi

find "$ELECTRON_DIR/dist" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.zip' -o -name '*.blockmap' -o -name 'latest-mac.yml' \) \
  -exec cp {} "$STAGE_DIR/$ARCH_DIR/" \;

ZIP_NAME="$(find "$STAGE_DIR/$ARCH_DIR" -maxdepth 1 -name '*.zip' -exec basename {} \; | head -1)"
if [ -z "$ZIP_NAME" ]; then
  echo "No .zip artifact found in $STAGE_DIR/$ARCH_DIR — packaging must have failed." >&2
  exit 1
fi

REMOTE_PATH="${SORIKU_RELEASE_PATH:-/var/www/soriku.com/downloads/ide}/$CHANNEL"
PLATFORM_KEY=$([ "$ARCH" = "arm64" ] && echo "darwin-arm64" || echo "darwin-x64")
ARTIFACT_URL="https://soriku.com/downloads/ide/$CHANNEL/$ARCH_DIR/$ZIP_NAME"

# Only *this* arch's entry is known for certain locally. Before overwriting
# latest.json, recover whatever entries already exist — from a prior local
# stage (both arches built on this machine across two runs) or, if
# publishing, from the currently-live remote manifest — so a single-arch
# run never clobbers the other platform's published entry. Never fabricate
# a platform entry that isn't actually known from one of these two sources.
EXISTING_JSON="{}"
if [ "$PUBLISH" = true ] && [ -n "${SORIKU_RELEASE_HOST:-}" ]; then
  EXISTING_JSON="$(ssh "$SORIKU_RELEASE_HOST" "cat '$REMOTE_PATH/latest.json' 2>/dev/null" || echo '{}')"
elif [ -f "$STAGE_DIR/latest.json" ]; then
  EXISTING_JSON="$(cat "$STAGE_DIR/latest.json")"
fi

node -e "
const fs = require('fs');
let existing = {};
try { existing = JSON.parse(process.argv[1] || '{}'); } catch { existing = {}; }
const platforms = { ...(existing.platforms || {}) };
platforms['$PLATFORM_KEY'] = { url: '$ARTIFACT_URL' };
const manifest = {
  version: '$VERSION',
  pub_date: new Date().toISOString(),
  notes: existing.notes || '',
  platforms
};
fs.writeFileSync('$STAGE_DIR/latest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
" "$EXISTING_JSON"

echo "==> win32/linux platform entries stay absent until Fase 9 builds land — never fabricated here."

if [ "$PUBLISH" = true ]; then
  : "${SORIKU_RELEASE_HOST:?SORIKU_RELEASE_HOST must be set to publish, e.g. deploy@soriku.com}"
  echo "==> Publishing $ARCH_DIR artifacts + manifest to $SORIKU_RELEASE_HOST:$REMOTE_PATH"
  ssh "$SORIKU_RELEASE_HOST" "mkdir -p '$REMOTE_PATH/$ARCH_DIR'"
  rsync -avz "$STAGE_DIR/$ARCH_DIR/" "$SORIKU_RELEASE_HOST:$REMOTE_PATH/$ARCH_DIR/"
  rsync -avz "$STAGE_DIR/latest.json" "$SORIKU_RELEASE_HOST:$REMOTE_PATH/latest.json"
else
  echo "==> Dry run (no --publish): artifacts staged at $STAGE_DIR"
  echo "    Re-run with --publish and SORIKU_RELEASE_HOST=user@soriku.com to upload."
fi
