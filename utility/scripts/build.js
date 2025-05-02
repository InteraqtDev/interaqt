import {execSync} from "child_process";
import { readdir } from 'fs/promises'



execSync('rimraf dist && tsc -p ./tsconfig.prod.json')

const folders = await readdir('./dist/src')

folders.forEach(folder => {
    if (folder === 'src') {
        return
    }
    execSync(`rimraf ${folder} && mv dist/src/${folder} ./`)
})
execSync('rimraf dist')

