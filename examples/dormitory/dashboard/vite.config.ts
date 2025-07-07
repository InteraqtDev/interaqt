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
            'interaqt': path.resolve(__dirname, '../../../src'),
            '@runtime': path.resolve(__dirname, '../../../src/runtime'),
            '@shared': path.resolve(__dirname, '../../../src/shared'),
            '@storage': path.resolve(__dirname, '../../../src/storage'),
            'async_hooks': path.resolve(__dirname, './mocks/async_hooks.js'),
            'util': path.resolve(__dirname, './mocks/util.js'),
            'fs': path.resolve(__dirname, './mocks/fs.js'),
            'better-sqlite3': path.resolve(__dirname, './mocks/better-sqlite3.js'),
            '@electric-sql/pglite': path.resolve(__dirname, './mocks/pglite.js'),
            'pg': path.resolve(__dirname, './mocks/pg.js'),
            'mysql2/promise': path.resolve(__dirname, './mocks/mysql2-promise.js'),
            'mysql2': path.resolve(__dirname, './mocks/mysql2.js'),
            'fastify': path.resolve(__dirname, './mocks/fastify.js'),
        }
    },
    optimizeDeps: {
        exclude: ['async_hooks', 'util', 'fs', 'better-sqlite3', '@electric-sql/pglite', 'pg', 'mysql2', 'mysql2/promise', 'fastify']
    }
});