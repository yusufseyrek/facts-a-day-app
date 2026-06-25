#!/usr/bin/env bash
# `bun ios:release [args]` — build + install the iOS app in Release (args such as
# `--device` / `--device "My iPhone"` are forwarded to `expo run:ios`), then
# register the freshly-built app's embedded bundle as an OTA base so the first OTA
# applies on the first cold launch (see scripts/register-embedded-ios.sh).
#
# `expo run:ios` for a dev-client build starts Metro and LINGERS after installing
# the app, so we can't just register "after expo exits" — you'd have to stop it
# first, and a Ctrl+C would skip registration. Instead a background watcher fires
# the moment THIS run's Release build produces its app (i.e. right after it's
# built/installed), while expo keeps the terminal so the `--device` picker and
# Metro UI still work.
set -uo pipefail
cd "$(dirname "$0")/.."

DD="${DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData}"
START="$(date +%s)"
CLAIM="$(mktemp -u)"   # atomic once-guard via `mkdir`: register runs exactly once
REGISTER="${IOS_RELEASE_REGISTER_CMD:-bash scripts/register-embedded-ios.sh}"

# The most-recent Release .app whose embedded manifest was (re)built during this
# run (mtime >= START) — i.e. the app this invocation just produced. Empty if no
# fresh build exists yet (build still running, or it failed before bundling).
newest_fresh_app() {
  local app man mt
  app="$(ls -dt "$DD"/FactsaDay-*/Build/Products/Release-iphone*/FactsaDay.app 2>/dev/null | head -1)"
  [ -n "$app" ] || return 1
  man="$app/EXUpdates.bundle/app.manifest"
  [ -f "$man" ] && [ -f "$app/main.jsbundle" ] || return 1
  mt="$(stat -f %m "$man" 2>/dev/null || echo 0)"
  [ "$mt" -ge "$START" ] || return 1
  printf '%s\n' "$app"
}

# Register $1, at most once (the mkdir claim wins for exactly one caller).
do_register() {
  if mkdir "$CLAIM" 2>/dev/null; then
    printf '\n📦 app built — registering its embedded bundle as an OTA base…\n'
    $REGISTER "$1"
  fi
}

# Background watcher: register as soon as the fresh build artifact appears,
# independent of when (or whether) expo/Metro is stopped.
(
  trap '' INT   # a Ctrl+C aimed at expo must not kill us mid-register
  for _ in $(seq 1 1800); do
    sleep 1
    [ -d "$CLAIM" ] && exit 0
    app="$(newest_fresh_app)" || continue
    do_register "$app"
    exit 0
  done
) &
WATCHER=$!

expo run:ios --configuration Release "$@"
status=$?

# Fallback: build succeeded but the watcher hasn't registered yet (e.g. a build
# so fast the 1s poll missed it). Give the watcher a moment, then do it here.
if [ "$status" -eq 0 ]; then
  for _ in $(seq 1 8); do [ -d "$CLAIM" ] && break; sleep 1; done
  app="$(newest_fresh_app || true)"
  [ -n "${app:-}" ] && do_register "$app"
fi

kill "$WATCHER" 2>/dev/null
wait "$WATCHER" 2>/dev/null
rm -rf "$CLAIM"
exit "$status"
