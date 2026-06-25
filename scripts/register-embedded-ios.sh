#!/usr/bin/env bash
# Register the embedded JS bundle of the most-recent local iOS Release build as a
# base on the OTA server. This makes the FIRST OTA a fresh install fetches a small
# bsdiff PATCH (applies on the first cold launch within fallbackToCacheTimeout)
# instead of a full ~7MB bundle (which doesn't finish in 5s and only lands on the
# second cold launch). Every later OTA is already a patch from the prior OTA.
#
# Chained after `bun ios:release` (and runnable standalone via `bun run
# register:embedded:ios`). Best-effort: it NEVER fails the build it follows.
set -uo pipefail
cd "$(dirname "$0")/.."

# publish-ota.ts reads OTA_API_KEY from the env. Prefer .env.local as the source
# of truth (the file isn't auto-sourced, and an exported shell key is often a
# stale one that 401s); only fall back to an already-exported key if the file has
# none.
if [ -f .env.local ]; then
  KEY_FROM_FILE="$(grep -E '^OTA_API_KEY=' .env.local | head -1 | sed -E 's/^[^=]*=//' | tr -d '\r"'"'"' ')"
  if [ -n "$KEY_FROM_FILE" ]; then OTA_API_KEY="$KEY_FROM_FILE"; export OTA_API_KEY; fi
fi
if [ -z "${OTA_API_KEY:-}" ]; then
  echo "⚠️  register-embedded skipped: no OTA_API_KEY (set it or add it to .env.local)"
  exit 0
fi

# The most-recently-built Release .app (device build preferred; sim works too).
APP="$(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/FactsaDay-*/Build/Products/Release-iphoneos/FactsaDay.app 2>/dev/null | head -1)"
[ -z "${APP:-}" ] && APP="$(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/FactsaDay-*/Build/Products/Release-iphonesimulator/FactsaDay.app 2>/dev/null | head -1)"
if [ -z "${APP:-}" ] || [ ! -d "$APP" ]; then
  echo "⚠️  register-embedded skipped: no Release FactsaDay.app in DerivedData (build first)"
  exit 0
fi

MANIFEST="$APP/EXUpdates.bundle/app.manifest"
BUNDLE="$APP/main.jsbundle"
if [ ! -f "$MANIFEST" ] || [ ! -f "$BUNDLE" ]; then
  echo "⚠️  register-embedded skipped: missing app.manifest/main.jsbundle in $APP"
  exit 0
fi

echo "📦 register-embedded: base from $(basename "$(dirname "$APP")")/FactsaDay.app"
bun scripts/publish-ota.ts register-embedded --platform ios --app-manifest "$MANIFEST" --bundle "$BUNDLE" \
  || echo "⚠️  register-embedded failed (non-fatal) — the first OTA will be a full download"
exit 0
