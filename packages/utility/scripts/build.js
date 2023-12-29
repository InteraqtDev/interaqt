import {execSync} from "child_process";

execSync('rimraf dist && tsc -p ./tsconfig.prod.json')
execSync('cd dist && mv ./*/* ./ && rm -rf ./src')

