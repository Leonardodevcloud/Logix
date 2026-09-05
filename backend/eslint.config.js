// ESLint 9 (flat config). Foco: erros reais, não estilo. Prettier não incluído de
// propósito — o código existente tem estilo consistente; formatador entra depois.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.es2021 } },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'warn',           // use src/shared/logger
      'eqeqeq': ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-prototype-builtins': 'off',
    },
  },
  { files: ['scripts/**/*.js'], rules: { 'no-console': 'off' } },
  { files: ['test/**/*.js'], languageOptions: { sourceType: 'module' }, rules: { 'no-console': 'off' } },
];
