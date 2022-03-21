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
    '/examples/**',
    '/scripts/**',
    '/test/integration/**',
    '/preload/**',
    '/main/**',
    '/renderer/**',
    '/common/**',
    '/index.*',
    '/integrations.*',
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
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@sentry-internal/sdk/no-async-await': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
