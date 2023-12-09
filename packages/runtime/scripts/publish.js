import { execSync } from 'child_process'
const version = process.argv[2]

if (!version) {
  throw new Error('Missing version argument')
}

const gitStatus = execSync('git status ./ --porcelain').toString().trim()
const isClean = gitStatus  === ''

console.log(isClean, gitStatus)

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
