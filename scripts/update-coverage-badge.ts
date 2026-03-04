import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SUMMARY_PATH = path.join(ROOT, 'coverage', 'coverage-summary.json')
const README_PATH = path.join(ROOT, 'README.md')

function getBadgeColor(pct: number): string {
    if (pct >= 90) return 'brightgreen'
    if (pct >= 80) return 'green'
    if (pct >= 70) return 'yellowgreen'
    if (pct >= 60) return 'yellow'
    if (pct >= 50) return 'orange'
    return 'red'
}

const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'))
const linesPct: number = summary.total.lines.pct

const color = getBadgeColor(linesPct)
const badgeUrl = `https://img.shields.io/badge/coverage-${linesPct}%25-${color}.svg`
const badgeMarkdown = `<a href="#"><img src="${badgeUrl}" alt="coverage"></a>`

const readme = fs.readFileSync(README_PATH, 'utf-8')

const BADGE_PATTERN = /<a href="#">\s*<img src="https:\/\/img\.shields\.io\/badge\/coverage-[^"]*" alt="coverage">\s*<\/a>/

let updated: string
if (BADGE_PATTERN.test(readme)) {
    updated = readme.replace(BADGE_PATTERN, badgeMarkdown)
} else {
    updated = readme.replace(
        /(<a href="https:\/\/github\.com\/InteraqtDev\/interaqt"><img src="https:\/\/img\.shields\.io\/badge\/TypeScript-strict-blue\.svg" alt="TypeScript"><\/a>)/,
        `$1\n    ${badgeMarkdown}`
    )
}

fs.writeFileSync(README_PATH, updated, 'utf-8')

console.log(`Coverage badge updated: ${linesPct}% (${color})`)
