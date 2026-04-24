const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
const rootNodeModules = path.resolve(__dirname, 'node_modules');
const expoNodeModules = path.resolve(__dirname, 'node_modules', 'expo', 'node_modules');

config.resolver.nodeModulesPaths = [rootNodeModules, expoNodeModules];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'expo-image': path.join(rootNodeModules, 'expo-image'),
  'expo-modules-core': path.join(rootNodeModules, 'expo-modules-core'),
};

module.exports = withNativeWind(config, {
  input: './global.css',
});
