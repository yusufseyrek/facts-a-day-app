# OTA Release Runbook

How facts-a-day ships native builds and over-the-air (OTA) JS updates, and why the
**embedded-bundle registration** step matters on every native release.

## The model (read once)

- Self-hosted Expo Updates server at `https://factsaday.com/api/updates/manifest`.
- `runtimeVersion` policy is **`appVersion`**, so the runtime version IS `expo.version`
  in `app.json` (currently `1.3.3`). An OTA only reaches installs whose app version
  matches exactly. Bumping `version` starts a NEW silo: it needs its own embedded
  baseline and its own OTAs.
- Updates are **differential (bsdiff)**. The server keeps recent bundles as bases and
  ships a small patch instead of the full ~7 MB bundle.
- The patch for the FIRST OTA after a fresh install (or a native-version upgrade) is
  computed against the bundle **embedded in the store binary**. The server only has
  that bundle if we **register** it. If it isn't registered the update still works,
  but the first OTA is a full download that usually misses the 5 s
  `fallbackToCacheTimeout` and only lands on the second cold launch.

> The native build scripts now register the embedded baseline automatically, from the
> exact artifact they upload. You do not register by hand in the normal flow.

## Prerequisites

`.env.local` must contain a valid **prod** OTA key:

```
OTA_API_KEY=fad_...
```

Mint one with: `bun scripts/ota-create-key.ts create <name>` (run against the server).
The store build scripts fail fast if `OTA_API_KEY` is missing.

## A) New native release (App Store / Play Store)

This is when the embedded baseline must be registered. The scripts do it for you.

```bash
bun run build:ios       # tests -> bump buildNumber -> archive -> upload -> REGISTER baseline
bun run build:android   # tests -> bump versionCode -> bundleRelease -> upload -> REGISTER baseline
```

What "REGISTER baseline" does: reads the embedded `app.manifest` `id` and `main.jsbundle`
(iOS, from the xcarchive) / `index.android.bundle` (Android, from the AAB) out of the
SAME artifact that was uploaded, and POSTs it to `/api/updates/publish` as
`isEmbedded:true` under that id. It then verifies the server stored it under the exact id.

It is **strict**: if registration fails, the build script exits non-zero and prints a
one-line recovery command. The uploaded binary is fine; you just need the baseline
registered before the build clears review and devices start checking for OTAs.

If you bump `expo.version` for this release, that is intended and correct: the new
version gets its own baseline automatically here. OTAs published under the old version
will not reach the new version (and vice versa).

## B) JS-only OTA (no native change)

```bash
bun run update:ios      # one platform
bun run update:android
bun run update:all       # both
```

`--release` (baked into these scripts) runs tests, bumps the native build numbers,
exports, publishes, and pushes the bump to `main`. It publishes under the current
`runtimeVersion` (= `app.json` version), so it reaches installs on that version. The
server precomputes patches from recent bases, including the embedded baseline, so
fresh installs get a patch on their first OTA.

## Verifying

A successful registration prints:

```
✓ verified embedded base <id> registered for rv <version>
✓ Embedded OTA baseline registered
```

A successful OTA publish prints `✓ <platform> update <id> (<n> assets, <m> patches)`.

## Recovery (registration failed mid-release)

The artifact persists, so re-registering is cheap and needs no rebuild:

```bash
# iOS — from the archive that was uploaded
REGISTER_EMBEDDED_STRICT=1 bash scripts/register-embedded-ios.sh \
  build/ios/FactsaDay.xcarchive/Products/Applications/FactsaDay.app

# Android — from the AAB that was built
REGISTER_EMBEDDED_STRICT=1 bash scripts/register-embedded-android.sh \
  build/android/factsaday-release.aab
```

Most failures are a missing/stale `OTA_API_KEY` (the server is strict-App-Check'd; a
local token can go stale). Fix `.env.local` first.

## Notes and limits

- **Code signing is dormant** by design: `app.json`'s `updates` block has no
  `codeSigningCertificate`, so the client never asks for a signature and the server
  serves unsigned. The keys in `keys/` are prepared but unused. Enabling it is a
  coordinated NATIVE release (add `codeSigningCertificate` to `app.json`, rebuild so
  `Expo.plist` / `AndroidManifest` carry the config, and provision the private key on
  every backend deploy). It cannot be turned on via OTA.
- **Only the launch JS bundle is registered** as the embedded baseline, not embedded
  images/fonts. A future OTA that changes a bundled asset sends that asset in full
  (the JS bundle is still diffed).
- `bun ios:release` (local `expo run:ios` Release) also registers a baseline, but
  non-fatally — it is a local install build, not the store binary. The store baseline
  comes only from `build:ios` / `build:android`.
- `runtimeVersion` is determined by `app.json` `version` at the moment the script
  runs; the build scripts register at build time, so the version always matches.
