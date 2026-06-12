module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The lucide barrel re-exports ~1,760 icon modules and Metro doesn't
      // tree-shake in dev, so one barrel import drags every icon into the
      // bundle. Rewrite to per-icon deep imports instead.
      [
        'transform-imports',
        {
          '@tamagui/lucide-icons': {
            transform: '@tamagui/lucide-icons/icons/${member}',
            skipDefaultConversion: true,
            preventFullImport: true,
          },
        },
      ],
      ...(process.env.NODE_ENV === 'production' ? ['transform-remove-console'] : []),
      'react-native-reanimated/plugin', // must be last
    ],
  };
};
