import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 30000,
        teardownTimeout: 10000,
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: [
                'node_modules/',
                'tests/',
                '**/*.test.ts',
                '**/*.spec.ts'
            ],
            thresholds: {
                global: {
                    branches: 80,
                    functions: 80,
                    lines: 80,
                    statements: 80
                }
            }
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