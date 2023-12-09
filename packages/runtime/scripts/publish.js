import { execSync } from 'child_process'
const version = process.argv[2]

if (!version) {
  throw new Error('Missing version argument')
}

console.log(execSync('git status ./ --porcelain').toString())

//
// try {
//   // 去除 link
//   execSync('npm install')
//   execSync('npm run build-all')
//   execSync(`npm version ${version}`)
// } catch (e) {
//   console.error(e)
//   process.exit(1)
// }
