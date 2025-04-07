import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'shared',
            fileName:'index'
        },
        sourcemap: true,
    },
    plugins: [dts({
        tsconfigPath: resolve(__dirname, 'tsconfig.prod.json'),
        rollupTypes: true
    })]

})
