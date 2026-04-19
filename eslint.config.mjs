// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/strict-boolean-expressions': 'error',
        },
    }
]);
// when there is a need to use "any" disable it with "// eslint-disable-line @typescript-eslint/no-explicit-any"
// put it before the line simply
// or do like umm /* eslint-disable @typescript-eslint/no-explicit-any*/ "any code between this will be alr then close it again with this