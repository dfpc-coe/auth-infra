import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            'no-console': 0,
            'indent': ['error', 4, { 'SwitchCase': 1 }],
            'quotes': ['error', 'single', 'avoid-escape'],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'never'],
            'object-curly-spacing': ['error', 'always'],
            'eol-last': 'error',
            'no-trailing-spaces': 'error'
        }
    }
];
