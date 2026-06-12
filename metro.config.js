const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Enable inline requires for faster cold start
config.transformer.inlineRequires = true;

// Expo defaults the transform cache to os.tmpdir()/metro-cache, which macOS
// purges after a few days idle — silently forcing full cold rebundles. Keep
// the cache in the project instead, reusing Expo's binary FileStore so the
// on-disk format stays identical (stock Metro store as fallback in case the
// internal path moves in a future SDK).
let FileStore;
try {
  ({ FileStore } = require("@expo/metro-config/build/binary-file-store"));
} catch {
  const mod = require("@expo/metro/metro-cache/stores/FileStore");
  FileStore = mod.default ?? mod;
}
config.cacheStores = [
  new FileStore({ root: path.join(__dirname, "node_modules", ".cache", "metro") }),
];

module.exports = config;
