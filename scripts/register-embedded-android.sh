#!/usr/bin/env bash
# Register the embedded JS bundle of an Android Release AAB as a base on the OTA
# server, so the FIRST OTA a fresh install fetches is a small bsdiff PATCH
# instead of a full bundle. Android mirror of register-embedded-ios.sh.
#
# Usage: register-embedded-android.sh [path/to/app-release.aab]
#   - With an arg, registers that exact .aab (build-android.sh passes the AAB it
#     just built).
#   - Without one, uses build/android/factsaday-release.aab, else the gradle
#     output android/app/build/outputs/bundle/release/app-release.aab.
#
# The embedded app.manifest + index.android.bundle are read straight out of the
# AAB (base module assets), so the registered embedded id and bytes match the APK
# Google Play generates for devices — Play re-signs the APK but never rewrites
# assets, so the on-device embedded bundle is byte-identical to what we register.
#
# REGISTER_EMBEDDED_STRICT=1 makes every problem a NON-ZERO exit (the store
# release sets it so a missed registration FAILS the release).
set -uo pipefail
cd "$(dirname "$0")/.."

STRICT="${REGISTER_EMBEDDED_STRICT:-0}"
TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT

# Strict -> fail the caller; otherwise a non-fatal skip.
bail() {
  if [ "$STRICT" = "1" ]; then
    echo "✗ register-embedded(android): $1" >&2
    exit 1
  fi
  echo "⚠️  register-embedded(android) skipped: $1"
  exit 0
}

# Prefer OTA_API_KEY from .env.local (see register-embedded-ios.sh for why).
if [ -f .env.local ]; then
  KEY_FROM_FILE="$(grep -E '^OTA_API_KEY=' .env.local | head -1 | sed -E 's/^[^=]*=//' | tr -d '\r"'"'"' ')"
  if [ -n "$KEY_FROM_FILE" ]; then OTA_API_KEY="$KEY_FROM_FILE"; export OTA_API_KEY; fi
fi
if [ -z "${OTA_API_KEY:-}" ]; then
  bail "no OTA_API_KEY (set it or add it to .env.local)"
fi

AAB="${1:-}"
if [ -z "$AAB" ]; then
  for c in build/android/factsaday-release.aab android/app/build/outputs/bundle/release/app-release.aab; do
    [ -f "$c" ] && AAB="$c" && break
  done
fi
if [ -z "${AAB:-}" ] || [ ! -f "$AAB" ]; then
  bail "no release .aab found (build first)"
fi

# Locate the embedded manifest + JS bundle inside the AAB (base module assets).
MANIFEST_ENTRY="$(unzip -Z1 "$AAB" 2>/dev/null | grep -E '(^|/)app\.manifest$' | head -1)"
BUNDLE_ENTRY="$(unzip -Z1 "$AAB" 2>/dev/null | grep -E '(^|/)index\.android\.bundle$' | head -1)"
if [ -z "$MANIFEST_ENTRY" ] || [ -z "$BUNDLE_ENTRY" ]; then
  bail "AAB is missing app.manifest / index.android.bundle (is expo-updates embedded?)"
fi

TMP="$(mktemp -d)"
if ! unzip -o -q "$AAB" "$MANIFEST_ENTRY" "$BUNDLE_ENTRY" -d "$TMP"; then
  bail "failed to extract embedded files from $AAB"
fi
MANIFEST="$TMP/$MANIFEST_ENTRY"
BUNDLE="$TMP/$BUNDLE_ENTRY"
if [ ! -f "$MANIFEST" ] || [ ! -f "$BUNDLE" ]; then
  bail "extracted embedded files not found"
fi

echo "📦 register-embedded(android): base from $(basename "$AAB")"
if bun scripts/publish-ota.ts register-embedded --platform android --app-manifest "$MANIFEST" --bundle "$BUNDLE"; then
  exit 0
fi
bail "publish failed (the first OTA will be a full download)"
