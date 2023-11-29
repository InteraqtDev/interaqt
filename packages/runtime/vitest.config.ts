import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import {fileURLToPath, URL} from "url";

export default defineConfig({
    plugins: [tsconfigPaths()]
})