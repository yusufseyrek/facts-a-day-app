/**
 * OTA publish CLI (Expo SDK 56 differential updates).
 *
 * Runs `expo export`, then uploads each platform's bundle + assets to the
 * self-hosted backend's POST /api/updates/publish (Bearer API key). The backend
 * stores the update and precomputes bsdiff patches from recent bases, so devices
 * on a prior bundle download a small diff instead of the full JS bundle.
 *
 *   # publish an OTA for both platforms (runtimeVersion defaults to app.json version)
 *   OTA_API_KEY=fad_... bun scripts/publish-ota.ts --platform all --message "fix X"
 *
 *   # full release: run tests -> bump build number/version code -> build ->
 *   # publish -> commit+push the bump. Aborts before any change if tests fail.
 *   OTA_API_KEY=fad_... bun scripts/publish-ota.ts --release --message "fix X"
 *
 *   # local backend
 *   OTA_API_KEY=fad_... bun scripts/publish-ota.ts --platform ios --server http://localhost:3000
 *
 *   # register the bundle compiled into a store build, so the FIRST OTA after a
 *   # fresh install is also a diff (read the embedded update id from the build's
 *   # app.manifest; point --bundle at that build's embedded JS bundle)
 *   OTA_API_KEY=fad_... bun scripts/publish-ota.ts register-embedded \
 *     --platform android \
 *     --app-manifest android/app/build/generated/assets/createReleaseUpdatesResources/app.manifest \
 *     --bundle <embedded .hbc/.bundle path>
 *
 * Mint a key on the server with: bun scripts/ota-create-key.ts create <name>
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, basename, dirname } from "path";

type Platform = "ios" | "android";

const ROOT = join(import.meta.dir, "..");
const APP_JSON_PATH = join(ROOT, "app.json");
const APP_JSON = JSON.parse(readFileSync(APP_JSON_PATH, "utf8")).expo;

const EXT_MIME: Record<string, string> = {
  js: "application/javascript",
  hbc: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

function mimeFor(ext: string): string {
  return EXT_MIME[ext.replace(/^\./, "").toLowerCase()] || "application/octet-stream";
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireApiKey(): string {
  const key = process.env.OTA_API_KEY || arg("api-key");
  if (!key) {
    console.error("Missing API key. Set OTA_API_KEY or pass --api-key fad_...");
    process.exit(1);
  }
  return key;
}

function defaultServer(): string {
  return (
    arg("server") || APP_JSON?.extra?.API_BASE_URL || "https://factsaday.com"
  ).replace(/\/$/, "");
}

function defaultRuntimeVersion(): string {
  // runtimeVersion policy is "appVersion", so the version IS the runtime version.
  return arg("runtime-version") || APP_JSON?.version || "1.0.0";
}

interface AssetUpload {
  field: string;
  path: string; // absolute file path
  /**
   * Manifest asset key. For bundled assets this MUST be the Metro asset hash
   * (the basename of metadata.json's `assets/<hash>` path) — that is what the
   * embedded JS resolves the asset by at runtime. Omit for the launch asset
   * (its key is unused; the server falls back to the content hash).
   */
  key?: string;
  contentType: string;
  fileExtension: string;
  isLaunchAsset: boolean;
}

async function postPublish(
  server: string,
  apiKey: string,
  manifest: Record<string, unknown>,
  assets: AssetUpload[],
): Promise<void> {
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  for (const a of assets) {
    const bytes = readFileSync(a.path);
    form.append(a.field, new Blob([bytes], { type: a.contentType }), basename(a.path));
  }

  const res = await fetch(`${server}/api/updates/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`  ✗ publish failed (${res.status}): ${text}`);
    process.exit(1);
  }
  const body = JSON.parse(text);
  const u = body.update;
  console.log(
    `  ✓ ${u.platform} ${u.isEmbedded ? "embedded " : ""}update ${u.id} ` +
      `(${u.assetCount} assets, ${u.patchesGenerated} patches)`,
  );
}

// ============================================
// release pre/post steps (--release)
// ============================================

/** --release commits + pushes to main, so refuse to run from any other branch. */
function requireMainBranch(): void {
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).stdout?.trim();
  if (branch !== "main") {
    console.error(
      `✗ --release must run on main (currently on "${branch}") — it commits + pushes the build bump to main`,
    );
    process.exit(1);
  }
}

/** Run the app test suite; abort the release before any change if it fails. */
function runTests(): void {
  console.log("▶ running tests (npm test)");
  const res = spawnSync("npm", ["test"], { stdio: "inherit", cwd: ROOT });
  if (res.status !== 0) {
    console.error("✗ tests failed — aborting release (no bump, no build, no publish)");
    process.exit(1);
  }
  console.log("✓ tests passed");
}

/**
 * Bump the native build identifiers in app.json: iOS `buildNumber` (a string)
 * and Android `versionCode` (an int), kept in sync at max(both)+1. Edited
 * textually so ONLY those two lines change (no JSON reformat / key reorder).
 * Returns the new number.
 *
 * Note: this does NOT change `version` (= runtimeVersion under the appVersion
 * policy), so it does not alter which installed builds receive the OTA — it's
 * release bookkeeping / prep for the next native build.
 */
function bumpBuildNumbers(): number {
  const text = readFileSync(APP_JSON_PATH, "utf8");
  const curBuild = parseInt(APP_JSON?.ios?.buildNumber ?? "0", 10) || 0;
  const curCode = Number(APP_JSON?.android?.versionCode ?? 0) || 0;
  const next = Math.max(curBuild, curCode) + 1;

  let buildOk = false;
  let codeOk = false;
  let out = text.replace(/("buildNumber"\s*:\s*")\d+(")/, (_m, p1, p2) => {
    buildOk = true;
    return `${p1}${next}${p2}`;
  });
  out = out.replace(/("versionCode"\s*:\s*)\d+/, (_m, p1) => {
    codeOk = true;
    return `${p1}${next}`;
  });
  if (!buildOk || !codeOk) {
    console.error(
      `✗ could not bump app.json (buildNumber found=${buildOk}, versionCode found=${codeOk})`,
    );
    process.exit(1);
  }
  writeFileSync(APP_JSON_PATH, out);
  console.log(`▶ bumped build to ${next} (ios buildNumber + android versionCode)`);
  return next;
}

/** Record the shipped build number on main (commit + push). */
function commitAndPushBump(next: number): void {
  for (const args of [
    ["add", "app.json"],
    ["commit", "-m", `chore(release): bump build to ${next}`],
    ["push", "origin", "main"],
  ]) {
    const res = spawnSync("git", args, { stdio: "inherit", cwd: ROOT });
    if (res.status !== 0) {
      console.error(`✗ git ${args[0]} failed — the build bump may be partially committed/pushed`);
      process.exit(1);
    }
  }
  console.log(`✓ committed + pushed build ${next}`);
}

/**
 * Export ONE platform's bundle. We never pass "all" to `expo export`: with no
 * explicit `platforms` in app.json, Expo defaults to including `web`, which
 * isn't installed (no react-native-web) and fails the export.
 */
function exportPlatform(platform: Platform, distDir: string): void {
  console.log(`▶ expo export (${platform}) -> ${distDir}`);
  const exp = spawnSync(
    "npx",
    ["expo", "export", "--platform", platform, "--output-dir", distDir, "--clear"],
    { stdio: "inherit", cwd: ROOT },
  );
  if (exp.status !== 0) {
    console.error(`expo export (${platform}) failed`);
    process.exit(1);
  }
}

/**
 * The resolved PUBLIC Expo config. It must be embedded in the manifest as
 * `extra.expoClient` — that is exactly what `Constants.expoConfig` is built from
 * at runtime. Without it an OTA bundle launches with NO manifest config, so
 * expo-linking / expo-router throw at startup ("expo-linking needs access to the
 * expo-constants manifest … to determine what URI scheme to use"), which
 * expo-updates turns into an ErrorRecovery crash and rolls back to the embedded
 * bundle. A native build bakes this config in; an OTA has to carry it explicitly.
 */
function getExpoClientConfig(): Record<string, unknown> {
  const res = spawnSync("npx", ["expo", "config", "--json", "--type", "public"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) {
    console.error("Failed to resolve expo config (expo config --type public):", res.stderr || "");
    process.exit(1);
  }
  return JSON.parse(res.stdout);
}

// ============================================
// publish (default command)
// ============================================

async function publish() {
  const apiKey = requireApiKey();
  const server = defaultServer();
  const runtimeVersion = defaultRuntimeVersion();
  const platformArg = (arg("platform", "all") as string).toLowerCase();
  const platforms: Platform[] =
    platformArg === "all" ? ["ios", "android"] : [platformArg as Platform];
  const distDir = join(ROOT, arg("dist", "dist")!);
  const message = arg("message");
  const isRelease = flag("release");
  const noExport = flag("no-export");

  // Release flow (order matters): tests gate everything, THEN bump the build
  // identifiers, THEN build + publish, and finally record the bump. A plain
  // publish skips all three and just (re)builds + uploads.
  if (isRelease) {
    requireMainBranch();
    runTests();
  }
  const bumpedTo = isRelease ? bumpBuildNumbers() : null;

  const gitCommit =
    arg("git-commit") ||
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" })
      .stdout?.trim() ||
    undefined;

  // Embedded once in every platform's manifest so the OTA carries the app config
  // (Constants.expoConfig) — without it expo-router/expo-linking crash at launch.
  const expoClient = getExpoClientConfig();

  console.log(
    `Publishing OTA  server=${server}  runtimeVersion=${runtimeVersion}` +
      (bumpedTo != null ? `  build=${bumpedTo}` : ""),
  );

  // Export + upload per platform (single-platform exports avoid the web default).
  for (const platform of platforms) {
    if (!noExport) exportPlatform(platform, distDir);

    const metadataPath = join(distDir, "metadata.json");
    if (!existsSync(metadataPath)) {
      console.error(`metadata.json not found at ${metadataPath} (run without --no-export)`);
      process.exit(1);
    }
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    const fileMeta = metadata.fileMetadata?.[platform];
    if (!fileMeta?.bundle) {
      console.warn(`  ⚠ no ${platform} bundle in metadata.json; skipping`);
      continue;
    }

    const assets: AssetUpload[] = [];
    let idx = 0;
    // Launch bundle.
    const bundleExt = "." + (fileMeta.bundle.split(".").pop() || "js");
    assets.push({
      field: `asset_${idx++}`,
      path: join(distDir, fileMeta.bundle),
      contentType: mimeFor(bundleExt),
      fileExtension: bundleExt,
      isLaunchAsset: true,
    });
    // Other (bundled) assets. `key` is the Metro asset hash (basename of the
    // `assets/<hash>` path) the embedded JS resolves by — NOT the content hash.
    // fileExtension must be non-empty (SDK 56 throws parsing a non-launch asset
    // with no extension), so fall back to ".bin" when the export omits the type.
    for (const a of fileMeta.assets || []) {
      const ext = a.ext ? `.${a.ext}` : ".bin";
      assets.push({
        field: `asset_${idx++}`,
        path: join(distDir, a.path),
        key: basename(a.path),
        contentType: mimeFor(ext),
        fileExtension: ext,
        isLaunchAsset: false,
      });
    }

    const manifest = {
      runtimeVersion,
      platform,
      message,
      gitCommitHash: gitCommit,
      // Carry the app config so Constants.expoConfig is populated under OTA.
      extra: { expoClient },
      assets: assets.map((a) => ({
        field: a.field,
        ...(a.key ? { key: a.key } : {}),
        contentType: a.contentType,
        fileExtension: a.fileExtension,
        isLaunchAsset: a.isLaunchAsset,
      })),
    };

    console.log(`▶ uploading ${platform} (${assets.length} assets)`);
    await postPublish(server, apiKey, manifest, assets);
  }

  // Record the shipped build number only after every platform published.
  if (isRelease && bumpedTo != null) commitAndPushBump(bumpedTo);
}

// ============================================
// register-embedded
// ============================================

async function registerEmbedded() {
  const apiKey = requireApiKey();
  const server = defaultServer();
  const runtimeVersion = defaultRuntimeVersion();
  const platform = (arg("platform") as Platform | undefined) ?? undefined;
  const appManifestPath = arg("app-manifest");
  const bundlePath = arg("bundle");

  if (!platform || (platform !== "ios" && platform !== "android")) {
    console.error("register-embedded requires --platform ios|android");
    process.exit(1);
  }
  if (!appManifestPath || !existsSync(appManifestPath)) {
    console.error("register-embedded requires --app-manifest <path to the build's app.manifest>");
    process.exit(1);
  }
  if (!bundlePath || !existsSync(bundlePath)) {
    console.error("register-embedded requires --bundle <path to the embedded JS bundle>");
    process.exit(1);
  }

  const embedded = JSON.parse(readFileSync(appManifestPath, "utf8"));
  const embeddedId: string | undefined = embedded.id;
  if (!embeddedId) {
    console.error(`No "id" in ${appManifestPath}; is this an embedded app.manifest?`);
    process.exit(1);
  }

  const ext = "." + (bundlePath.split(".").pop() || "js");
  const manifest = {
    runtimeVersion,
    platform,
    updateId: embeddedId,
    isEmbedded: true,
    message: `embedded baseline (${basename(dirname(appManifestPath))})`,
    assets: [
      {
        field: "asset_0",
        contentType: mimeFor(ext),
        fileExtension: ext,
        isLaunchAsset: true,
      },
    ],
  };

  console.log(
    `Registering embedded base ${embeddedId} (${platform}, rv ${runtimeVersion})`,
  );
  await postPublish(server, apiKey, manifest, [
    {
      field: "asset_0",
      path: bundlePath,
      contentType: mimeFor(ext),
      fileExtension: ext,
      isLaunchAsset: true,
    },
  ]);
}

// ============================================

const sub = process.argv[2];
if (sub === "register-embedded") {
  await registerEmbedded();
} else {
  await publish();
}
