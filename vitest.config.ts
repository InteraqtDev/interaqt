import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        setupFiles: './scripts/vitest.setup.js',
        include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts']
    },
    plugins: [
        tsconfigPaths({
            root: path.resolve(__dirname, './')
        })
    ],
    resolve: {
        alias: {
            '@runtime': path.resolve(__dirname, './src/runtime/index.ts'),
            '@shared': path.resolve(__dirname, './src/shared/index.ts'),
            '@storage': path.resolve(__dirname, './src/storage/index.ts'),
            'interaqt': path.resolve(__dirname, './src'),
        }
    }
})