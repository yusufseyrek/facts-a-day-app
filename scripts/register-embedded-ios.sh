#!/usr/bin/env bash
# Register the embedded JS bundle of an iOS Release build as a base on the OTA
# server. This makes the FIRST OTA a fresh install fetches a small bsdiff PATCH
# (applies on the first cold launch within fallbackToCacheTimeout) instead of a
# full ~7MB bundle (which doesn't finish in 5s and only lands on the second cold
# launch). Every later OTA is already a patch from the prior OTA.
#
# Usage: register-embedded-ios.sh [path/to/FactsaDay.app]
#   - With an arg, registers that exact .app. The App Store path (build-ios.sh)
#     passes the .app INSIDE the xcarchive it just exported/uploaded, so the
#     registered embedded id matches the binary that ships to devices.
#   - Without one, registers the most-recent local Release build (the ios:release
#     wrapper passes the build it just produced).
# Runnable standalone via `bun run register:embedded:ios`.
#
# REGISTER_EMBEDDED_STRICT=1 makes every problem (no key, no .app, failed/invalid
# POST) a NON-ZERO exit. The store release sets it so a missed registration FAILS
# the release; ios:release leaves it unset so a local build is never blocked.
set -uo pipefail
cd "$(dirname "$0")/.."

STRICT="${REGISTER_EMBEDDED_STRICT:-0}"

# Strict -> fail the caller; otherwise a non-fatal skip (the ios:release path must
# never fail the build it follows).
bail() {
  if [ "$STRICT" = "1" ]; then
    echo "✗ register-embedded: $1" >&2
    exit 1
  fi
  echo "⚠️  register-embedded skipped: $1"
  exit 0
}

# publish-ota.ts reads OTA_API_KEY from the env. Prefer .env.local as the source
# of truth (the file isn't auto-sourced, and an exported shell key is often a
# stale one that 401s); only fall back to an already-exported key if the file has
# none.
if [ -f .env.local ]; then
  KEY_FROM_FILE="$(grep -E '^OTA_API_KEY=' .env.local | head -1 | sed -E 's/^[^=]*=//' | tr -d '\r"'"'"' ')"
  if [ -n "$KEY_FROM_FILE" ]; then OTA_API_KEY="$KEY_FROM_FILE"; export OTA_API_KEY; fi
fi
if [ -z "${OTA_API_KEY:-}" ]; then
  bail "no OTA_API_KEY (set it or add it to .env.local)"
fi

# Use the explicit .app passed by the caller; otherwise the most-recent local
# Release build (sim or device — whichever was built last).
APP="${1:-}"
if [ -z "$APP" ]; then
  APP="$(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/FactsaDay-*/Build/Products/Release-iphone*/FactsaDay.app 2>/dev/null | head -1)"
fi
if [ -z "${APP:-}" ] || [ ! -d "$APP" ]; then
  bail "no Release FactsaDay.app found (build first)"
fi

MANIFEST="$APP/EXUpdates.bundle/app.manifest"
BUNDLE="$APP/main.jsbundle"
if [ ! -f "$MANIFEST" ] || [ ! -f "$BUNDLE" ]; then
  bail "missing app.manifest/main.jsbundle in $APP"
fi

echo "📦 register-embedded: base from $(basename "$(dirname "$APP")")/FactsaDay.app"
if bun scripts/publish-ota.ts register-embedded --platform ios --app-manifest "$MANIFEST" --bundle "$BUNDLE"; then
  exit 0
fi
bail "publish failed (the first OTA will be a full download)"
