import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        watch: false,
        setupFiles: './scripts/vitest.setup.js',
        include: [
            'tests/**/*.test.ts', 
            'tests/**/*.spec.ts', 
            // 'examples/**/*.test.ts'
        ]
    },
    plugins: [
        tsconfigPaths({
            root: path.resolve(__dirname, './')
        })
    ],
    resolve: {
        alias: {
            '@runtime': path.resolve(__dirname, './src/runtime/index.ts'),
            '@core': path.resolve(__dirname, './src/core/index.ts'),
            '@storage': path.resolve(__dirname, './src/storage/index.ts'),
            '@drivers': path.resolve(__dirname, './src/drivers/index.ts'),
            'interaqt': path.resolve(__dirname, './src'),
        }
    }
})