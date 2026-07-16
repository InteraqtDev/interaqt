import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
export default defineConfig({
    test: {
        watch: false,
        setupFiles: './scripts/vitest.setup.js',
        // CAUTION vitest 默认 5s 超时在 CI 并行负载下会随机击中普通的 controller.setup
        //  测试（每次运行不同受害者——r33/r34 并入生成式套件后 runner 压力变大，main 的
        //  Tests 工作流自此机率性变红，v4.2.0 发布提交本身就是红的）。30s 对真实挂起
        //  仍然 fail-fast（本仓库真实挂起形态是分钟级死循环），对负载抖动免疫。
        //  单测试需要更久的（fuzz/迁移）已自带显式 timeout。
        testTimeout: 30000,
        hookTimeout: 30000,
        include: [
            'tests/**/*.test.ts', 
            'tests/**/*.spec.ts', 
            // 'examples/**/*.test.ts'
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
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