import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

// Design-phase probe config for docs/application-key-occupancy Task 1.
// Kept outside tests/** so the regular suites never pick these files up.
// Run: npx vitest run --config agentspace/output/application-key-occupancy-probes/vitest.probes.config.ts
const repoRoot = path.resolve(__dirname, '../../..')

export default defineConfig({
    test: {
        watch: false,
        setupFiles: path.resolve(repoRoot, 'scripts/vitest.setup.js'),
        testTimeout: 120000,
        hookTimeout: 120000,
        include: [
            'agentspace/output/application-key-occupancy-probes/**/*.spec.ts',
        ],
        root: repoRoot,
    },
    plugins: [
        tsconfigPaths({
            root: repoRoot,
        })
    ],
    resolve: {
        alias: {
            '@runtime': path.resolve(repoRoot, './src/runtime/index.ts'),
            '@core': path.resolve(repoRoot, './src/core/index.ts'),
            '@storage': path.resolve(repoRoot, './src/storage/index.ts'),
            '@drivers': path.resolve(repoRoot, './src/drivers/index.ts'),
            'interaqt': path.resolve(repoRoot, './src'),
        }
    }
})
