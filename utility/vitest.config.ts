import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    test: {
        setupFiles: './scripts/vitest.setup.js'
    },
    plugins: [
        tsconfigPaths()
    ]
})