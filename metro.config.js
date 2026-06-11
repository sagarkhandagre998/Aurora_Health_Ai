const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Skia crashes on SDK 54
config.transformer = {
  ...config.transformer,
  experimentalImportSupport: false,
};

module.exports = config;
