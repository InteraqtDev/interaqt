import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    esbuild: {
        jsxFactory: 'createElement',
        jsxFragment: 'Fragment',
    },
    define: {
        __DEV__: true,
        global: 'globalThis',
    },
    resolve: {
        alias: {
            '@social-content-network': path.resolve(__dirname, '../../examples/social-content-network/src'),
            '@dormitory-management': path.resolve(__dirname, '../../examples/dormitory-management/src'),
            '@runtime': path.resolve(__dirname, '../../src/runtime'),
            '@shared': path.resolve(__dirname, '../../src/shared'),
            '@storage': path.resolve(__dirname, '../../src/storage'),
            '@': path.resolve(__dirname, '../../src'),
            'async_hooks': path.resolve(__dirname, './src/mocks/async_hooks.js'),
            'util': path.resolve(__dirname, './src/mocks/util.js'),
            'fs': path.resolve(__dirname, './src/mocks/fs.js'),
            'better-sqlite3': path.resolve(__dirname, './src/mocks/better-sqlite3.js'),
            '@electric-sql/pglite': path.resolve(__dirname, './src/mocks/pglite.js'),
            'pg': path.resolve(__dirname, './src/mocks/pg.js'),
            'mysql2/promise': path.resolve(__dirname, './src/mocks/mysql2-promise.js'),
            'mysql2': path.resolve(__dirname, './src/mocks/mysql2.js'),
            'fastify': path.resolve(__dirname, './src/mocks/fastify.js'),
        }
    },
    optimizeDeps: {
        exclude: ['async_hooks', 'util', 'fs', 'better-sqlite3', '@electric-sql/pglite', 'pg', 'mysql2', 'mysql2/promise', 'fastify']
    }
});