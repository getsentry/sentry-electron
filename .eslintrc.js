module.exports = {
  root: true,
  env: {
    es6: true,
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk', 'plugin:require-extensions/recommended'],
  ignorePatterns: [
    '**/dist/**',
    '/esm/**',
    '/scripts/**',
    '/preload/**',
    '/main/**',
    '/renderer/**',
    '/examples/**',
    '/common/**',
    '/native/**',
    '/index.*',
    '/integrations.*',
    '/utility/**',
    'rollup.config.mjs',
  ],
  plugins: ['require-extensions'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    {
      files: ['test/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/member-ordering': 'off',
        'require-extensions/require-extensions': 'off',
        'require-extensions/require-index': 'off',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@sentry-internal/sdk/no-async-await': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@sentry-internal/sdk/no-optional-chaining': 'off',
    '@sentry-internal/sdk/no-nullish-coalescing': 'off',
  },
};
