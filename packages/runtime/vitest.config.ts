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
            '@': path.resolve(__dirname, './src/index.ts'),
            '@interaqt/shared': path.resolve(__dirname, '../shared/src/index.ts'),
            '@interaqt/storage': path.resolve(__dirname, '../storage/index.ts')
        }
    }
})