const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactPlugin = require('eslint-plugin-react');
const reactNativePlugin = require('eslint-plugin-react-native');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // Base recommended rules
  js.configs.recommended,

  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'metro.config.js',
      'eslint.config.js',
      'plugins/**',
      'marketing/**',
    ],
  },

  // Main configuration for TypeScript and React files
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Browser/React Native globals
        fetch: 'readonly',
        __DEV__: 'readonly',
        FormData: 'readonly',
        XMLHttpRequest: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        URLSearchParams: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        // React Native specific
        global: 'readonly',
        ErrorUtils: 'readonly',
        React: 'readonly',
        URL: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-native': reactNativePlugin,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs.recommended.rules,

      // React recommended rules
      ...reactPlugin.configs.recommended.rules,

      // React Native recommended rules
      ...reactNativePlugin.configs.all.rules,

      // TypeScript overrides
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // React overrides
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off', // Using TypeScript
      'react/display-name': 'off',

      // React Native overrides
      'react-native/no-inline-styles': 'off', // Using Tamagui which uses inline styles by design
      'react-native/no-color-literals': 'off', // We use theme system
      'react-native/no-raw-text': 'off', // We use Text components
      'react-native/sort-styles': 'off', // Too strict, not necessary
      'react-native/no-unused-styles': 'warn',

      // General
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',

      // Import sorting - custom order: React/RN → third-party → local → types
      'simple-import-sort/imports': [
        'warn',
        {
          groups: [
            // React and React Native core packages
            ['^react', '^react-native'],
            // Third-party packages (expo, tamagui, etc.)
            ['^@?\\w'],
            // Local imports (components, utils, config) - parent imports
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            // Local imports - sibling imports
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            // Type imports
            ['^.+\\.?(css)$', '^@?\\w.*\\u0000$', '^[^.].*\\u0000$', '^\\..*\\u0000$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'warn',
    },
  },

  // Prettier config to disable conflicting rules (must be last)
  prettierConfig,
];
