import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        coverage: {
            include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
            reporter: ['text', 'json', 'html']
        }
    },
    plugins: [
        tsconfigPaths({
            root: path.resolve(__dirname, './')
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../../src'),
            'interaqt': path.resolve(__dirname, '../../src'),
            "@runtime": path.resolve(__dirname, '../../src/runtime'),
            "@shared": path.resolve(__dirname, '../../src/shared'),
            "@storage": path.resolve(__dirname, '../../src/storage'),
        }
    }
})