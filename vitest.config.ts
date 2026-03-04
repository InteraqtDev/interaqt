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
        ],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/index.ts',
                'src/**/types.ts',
                'src/core/Computation.ts',
                'src/runtime/types/**',
                'src/runtime/global.d.ts',
                'src/runtime/ExternalSynchronizer.ts',
                'src/drivers/Mysql.ts',
                'src/drivers/PostgreSQL.ts',
            ],
            thresholds: {
                statements: 85,
                branches: 80,
                functions: 75,
                lines: 85,
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
            '@runtime': path.resolve(__dirname, './src/runtime/index.ts'),
            '@core': path.resolve(__dirname, './src/core/index.ts'),
            '@storage': path.resolve(__dirname, './src/storage/index.ts'),
            '@drivers': path.resolve(__dirname, './src/drivers/index.ts'),
            'interaqt': path.resolve(__dirname, './src'),
        }
    }
})