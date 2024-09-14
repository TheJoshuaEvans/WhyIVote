const js = require('@eslint/js');
const globals = require('globals');
const stylisticJs = require('@stylistic/eslint-plugin-js');

module.exports = [
  {
    ignores: [
      '**/cdk.out/', '**/node_modules/',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@stylistic/js': stylisticJs,
    },
    rules: {
      '@stylistic/js/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/js/eol-last': ['error', 'always'],
      '@stylistic/js/indent': ['error', 2],
      '@stylistic/js/linebreak-style': ['error', 'unix'],
      '@stylistic/js/quotes': ['error', 'single', {'allowTemplateLiterals': true}],
      '@stylistic/js/semi': ['error', 'always'],
      'no-unused-vars': ['error', {'caughtErrors': 'none'}],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
