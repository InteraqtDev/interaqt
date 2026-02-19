import { defineConfig } from 'vite';
import path, { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  esbuild: {
    target: 'esnext',
  },
  define: {
    __DEV__: false
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'interaqt',
      fileName: 'index',
      formats: ['es']
    },
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      // 确保外部依赖不被打包
      external: [
        // Node.js 内置模块
        'async_hooks',
        'fs',
        'path',
        'util',
        'assert',
        'crypto',
        'stream',
        'events',
        'buffer',
        'process',
        'net',
        'tls',
        'timers',
        'url',
        'zlib',
        'node:fs',
        'node:path',
        'node:util',
        'node:assert',
        // npm 依赖
        'acorn',
        'better-sqlite3',
        'chalk',
        'mysql2',
        'mysql2/promise',
        'pg',
        '@electric-sql/pglite',
        'uuidv7',
        'winston'
      ],
      output: {
        // 在 UMD 构建模式下为这些外部化的依赖提供一个全局变量
        globals: {
          acorn: 'acorn',
          'better-sqlite3': 'betterSqlite3',
          chalk: 'chalk',
          mysql2: 'mysql2',
          pg: 'pg',
          '@electric-sql/pglite': 'PGlite',
          uuidv7: 'uuidv7',
          winston: 'winston'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@runtime': path.resolve(__dirname, './src/runtime'),
      '@core': path.resolve(__dirname, './src/core'),
      '@storage': path.resolve(__dirname, './src/storage'),
    }
  },
  plugins: [
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.prod.json'),
      rollupTypes: false, // 关闭 rollupTypes 避免 api-extractor 的问题
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      staticImport: true,
      clearPureImport: false,
      beforeWriteFile: (filePath, content) => {
        // 替换路径别名为相对路径
        content = content.replace(/@runtime/g, './runtime');
        content = content.replace(/@core/g, './core');
        content = content.replace(/@storage/g, './storage');
        // 确保 .js 扩展名保持不变（对于 ES modules）
        return {
          filePath,
          content,
        };
      },
      afterBuild: () => {
        console.log('Type declaration files generated successfully');
      }
    })
  ]
});
