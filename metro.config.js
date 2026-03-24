const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Enable inline requires for faster cold start
config.transformer.inlineRequires = true;

module.exports = config;
