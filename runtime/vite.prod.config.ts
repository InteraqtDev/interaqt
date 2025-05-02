import path, {resolve} from "path";
import dts from 'vite-plugin-dts'

export default {
  esbuild: {
  },
  define: {
    __DEV__: false
  },
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'interaqt',
      // the proper extensions will be added
      fileName: 'interaqt',
    },
    sourcemap: true
  },
  resolve: {
    alias: {
            '@runtime': path.resolve(__dirname, './src/runtime/index.ts'),
            '@shared': path.resolve(__dirname, './src/shared/index.ts'),
            '@storage': path.resolve(__dirname, './src/storage/index.ts'),
        }
    },
  plugins: [dts({
    tsconfigPath: resolve(__dirname, 'tsconfig.prod.json'),
    rollupTypes: true,
    include: ['src/**/*.ts', 'src/**/*.tsx', 'global.d.ts'],
  })]
}
