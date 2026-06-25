#!/usr/bin/env bash
# `bun ios:release [args...]` — build the iOS app in Release, then (on success)
# register its embedded bundle as an OTA base so the first OTA applies on the
# first cold launch (see scripts/register-embedded-ios.sh).
#
# Any extra args are forwarded to `expo run:ios`, e.g.:
#   bun ios:release --device              # interactive device picker
#   bun ios:release --device "My iPhone"  # target a named device
# Previously these were chained with `&&` in package.json, so the args landed on
# the register step instead of `expo run:ios` and the picker never opened.
set -uo pipefail
cd "$(dirname "$0")/.."

expo run:ios --configuration Release "$@"
status=$?

if [ "$status" -eq 0 ]; then
  bash scripts/register-embedded-ios.sh
else
  echo "⚠️  iOS build exited $status — skipping register-embedded"
fi
exit "$status"
