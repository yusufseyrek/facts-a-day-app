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
import { existsSync, readFileSync } from "fs";
import { join, basename, dirname } from "path";

type Platform = "ios" | "android";

const ROOT = join(import.meta.dir, "..");
const APP_JSON = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;

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
  const gitCommit =
    arg("git-commit") ||
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" })
      .stdout?.trim() ||
    undefined;

  console.log(`Publishing OTA  server=${server}  runtimeVersion=${runtimeVersion}`);

  if (!flag("no-export")) {
    console.log(`▶ expo export (${platforms.join(", ")}) -> ${distDir}`);
    const exp = spawnSync(
      "npx",
      ["expo", "export", "--platform", platformArg, "--output-dir", distDir, "--clear"],
      { stdio: "inherit", cwd: ROOT },
    );
    if (exp.status !== 0) {
      console.error("expo export failed");
      process.exit(1);
    }
  }

  const metadataPath = join(distDir, "metadata.json");
  if (!existsSync(metadataPath)) {
    console.error(`metadata.json not found at ${metadataPath} (run without --no-export)`);
    process.exit(1);
  }
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

  for (const platform of platforms) {
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
