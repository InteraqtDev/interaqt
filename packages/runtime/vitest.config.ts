import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        setupFiles: './scripts/vitest.setup.js'
    },
    plugins: [
        tsconfigPaths({
            root: path.resolve(__dirname, './')
        })
    ],
    resolve: {
        alias: {
            '@/SQLite.js': path.resolve(__dirname, './src/runtime/SQLite.ts'),
            '@runtime': path.resolve(__dirname, './src/runtime/index.ts'),
            '@shared': path.resolve(__dirname, './src/shared/index.ts'),
            '@storage': path.resolve(__dirname, './src/storage/index.ts'),
            '@interaqt/shared': path.resolve(__dirname, './src/shared/index.ts'),
            '@interaqt/storage': path.resolve(__dirname, './src/storage/index.ts'),
            '@': path.resolve(__dirname, './src'),
        }
    }
})