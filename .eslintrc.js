module.exports = {
  root: true,
  env: {
    es6: true,
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: [
    '**/dist/**',
    '/esm/**',
    '/scripts/**',
    '/preload/**',
    '/main/**',
    '/renderer/**',
    '/examples/**',
    '/common/**',
    '/index.*',
    '/integrations.*',
    'rollup.config.mjs',
  ],
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
