import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        setupFiles: './scripts/vitest.setup.js'
    },
    plugins: [
        tsconfigPaths()
    ],
    resolve: {
        alias: {
            '@interaqt/shared': path.resolve(__dirname, '../shared/index.ts')
        }
    }
})