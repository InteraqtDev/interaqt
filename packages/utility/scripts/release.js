import { execSync } from 'child_process'
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const version = process.argv[2]
if (!version) {
  throw new Error('Missing version argument')
}


const gitStatus = execSync('git status ./ --porcelain').toString().trim()
const isClean = gitStatus  === ''
if (!isClean) {
  throw new Error('Working tree is not clean')
}

function buildTypes() {
  const extractorConfig = ExtractorConfig.loadFileAndPrepare('api-extractor.json');
  const extractorResult = Extractor.invoke(extractorConfig, {
    showVerboseMessages: true
  });
  if (!extractorResult.succeeded && extractorResult.errorCount > 0) {
    throw new Error(`API Extractor completed with ${extractorResult.errorCount} errors and ${extractorResult.warningCount} warnings`);
  }
}

try {
  // 去除 link
  execSync('npm install')
  execSync('npm run build')
  buildTypes()
  const newVersion = execSync(`npm version ${version}`)
  execSync('git add ./')
  execSync(`git commit -m "release: @interaqt/utility ${newVersion}"`)
  execSync('git push')
  execSync(`npm publish ./`)
} catch (e) {
  console.error(e)
  process.exit(1)
}
