import { beforeAll, describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { fileURLToPath } from 'node:url';

// Executable invariant for framework-owned top-level transactions (entity-retention
// serializable-retry fix). Storage writes run the computations that read the written
// records inside the same transaction, and several computations throw
// RequireSerializableRetry under READ COMMITTED. A framework entry point that opens a
// transaction with a bare `storage.runInTransaction(...)` therefore fails every time such a
// computation is involved; maintainEntityRetention and cleanupAsyncTasks did exactly that
// up to v4.11.2, and nothing failed at declaration or setup time.
//
// Every `.runInTransaction(` and `runWithTransactionRetry(` call in src/ must be one of:
//   1. the convergence helper `runInRetryableTransaction` (frameworkTransaction.ts);
//   2. a transaction with a literal `isolation: 'SERIALIZABLE'` (cannot need an upgrade);
//   3. an entry listed in ALLOWED_SITES with its exact call count and the reason the site
//      owns its own isolation policy.
// A new direct call fails this spec; route it through runInRetryableTransaction or add an
// explicit entry with a reason. The allowlist is keyed by enclosing function and count, not
// by file, so a second call inside an allowed function also fails.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN_ROOTS = ['src/core', 'src/runtime', 'src/storage', 'src/builtins', 'src/drivers'] as const;

type Callee = 'runInTransaction' | 'runWithTransactionRetry';
type Site = { file: string; line: number; callee: Callee; enclosing: string; fixedSerializable: boolean; text: string };

const ALLOWED_SITES: Array<{ file: string; enclosing: string; callee: Callee; count: number; reason: string }> = [
    {
        file: 'src/runtime/frameworkTransaction.ts', enclosing: 'runInRetryableTransaction', callee: 'runInTransaction', count: 1,
        reason: 'convergence helper: upgrade-and-retry outside a transaction, run in the outer transaction inside one',
    },
    {
        file: 'src/runtime/frameworkTransaction.ts', enclosing: 'runInRetryableTransaction', callee: 'runWithTransactionRetry', count: 1,
        reason: 'convergence helper',
    },
    {
        file: 'src/runtime/MonoSystem.ts', enclosing: 'MonoStorage.runInTransaction', callee: 'runInTransaction', count: 1,
        reason: 'storage transaction implementation delegating to the driver transaction (this.db.runInTransaction)',
    },
    {
        file: 'src/runtime/Controller.ts', enclosing: 'Controller.runInBusinessTransaction', callee: 'runInTransaction', count: 1,
        reason: 'business transaction: the caller fixes the isolation level and RequireSerializableRetry fails fast by contract',
    },
    {
        file: 'src/runtime/Controller.ts', enclosing: 'Controller.dispatch', callee: 'runWithTransactionRetry', count: 1,
        reason: 'top-level dispatch attempt loop (clones args per attempt; dispatch inside a non-BT transaction is rejected earlier)',
    },
    {
        file: 'src/runtime/Controller.ts', enclosing: 'Controller.runDispatchAttemptsInBusinessTransaction', callee: 'runWithTransactionRetry', count: 1,
        reason: 'business-transaction dispatch attempt loop: SAVEPOINT retries only, RequireSerializableRetry fails fast',
    },
    {
        file: 'src/runtime/Controller.ts', enclosing: 'Controller.runDispatchAttemptBody', callee: 'runInTransaction', count: 1,
        reason: 'dispatch attempt body; its attempts are driven by one of the two dispatch attempt loops above',
    },
];

function listSourceFiles(rootRel: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(path.relative(REPO_ROOT, full));
        }
    };
    walk(path.join(REPO_ROOT, rootRel));
    return out.sort();
}

/** Nearest named function or class method around the call (arrow functions are transparent). */
function enclosingName(node: ts.Node, sourceFile: ts.SourceFile): string {
    for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
        if (ts.isMethodDeclaration(current) && current.name) {
            const owner = current.parent;
            const className = (ts.isClassDeclaration(owner) || ts.isClassExpression(owner)) && owner.name ? owner.name.text : '<anonymous>';
            return `${className}.${current.name.getText(sourceFile)}`;
        }
        if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    }
    return '<module>';
}

function hasLiteralSerializableIsolation(call: ts.CallExpression): boolean {
    const options = call.arguments[0];
    if (!options || !ts.isObjectLiteralExpression(options)) return false;
    return options.properties.some(property =>
        ts.isPropertyAssignment(property) &&
        property.name.getText() === 'isolation' &&
        ts.isStringLiteral(property.initializer) &&
        property.initializer.text === 'SERIALIZABLE'
    );
}

function findTransactionSites(files: string[]): Site[] {
    const sites: Site[] = [];
    for (const relFile of files) {
        const text = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8');
        const sourceFile = ts.createSourceFile(relFile, text, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node)) {
                let callee: Callee | undefined;
                if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'runInTransaction') callee = 'runInTransaction';
                if (ts.isIdentifier(node.expression) && node.expression.text === 'runWithTransactionRetry') callee = 'runWithTransactionRetry';
                if (callee) {
                    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                    sites.push({
                        file: relFile,
                        line: line + 1,
                        callee,
                        enclosing: enclosingName(node, sourceFile),
                        fixedSerializable: callee === 'runInTransaction' && hasLiteralSerializableIsolation(node),
                        text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 100),
                    });
                }
            }
            node.forEachChild(visit);
        };
        visit(sourceFile);
    }
    return sites;
}

describe('framework-owned transaction entry sites', () => {
    let scannedFiles: string[];
    let sites: Site[];

    beforeAll(() => {
        scannedFiles = SCAN_ROOTS.flatMap(listSourceFiles);
        sites = findTransactionSites(scannedFiles);
    });

    test('scanned the framework source roots (guard against path-resolution drift)', () => {
        for (const file of ['src/runtime/Controller.ts', 'src/runtime/MonoSystem.ts', 'src/runtime/Scheduler.ts', 'src/runtime/migration.ts', 'src/runtime/frameworkTransaction.ts', 'src/drivers/PostgreSQL.ts']) {
            expect(scannedFiles).toContain(file);
        }
    });

    test('every direct transaction call is the helper, fixed SERIALIZABLE, or an allowlisted site with its exact count', () => {
        const unexplained = sites.filter(site => !site.fixedSerializable && !ALLOWED_SITES.some(allowed =>
            allowed.file === site.file && allowed.enclosing === site.enclosing && allowed.callee === site.callee
        ));
        const format = (site: Site) => `${site.file}:${site.line} in ${site.enclosing}: ${site.text}`;
        expect(
            unexplained.map(format),
            'A framework-owned transaction must go through runInRetryableTransaction (src/runtime/frameworkTransaction.ts) ' +
            'so that computations requiring SERIALIZABLE are upgraded, or declare an explicit isolation policy in ALLOWED_SITES.'
        ).toEqual([]);

        const counts = ALLOWED_SITES.map(allowed => ({
            site: `${allowed.file} ${allowed.enclosing} ${allowed.callee}`,
            count: sites.filter(site => !site.fixedSerializable && site.file === allowed.file && site.enclosing === allowed.enclosing && site.callee === allowed.callee).length,
        }));
        expect(counts, 'each allowlisted site must exist exactly as many times as declared (no stale or widened entries)')
            .toEqual(ALLOWED_SITES.map(allowed => ({ site: `${allowed.file} ${allowed.enclosing} ${allowed.callee}`, count: allowed.count })));
    });

    test('the framework entry points that run computations use the helper (no direct call remains in them)', () => {
        for (const enclosing of ['Controller.maintainEntityRetention', 'Controller.cleanupAsyncTasks', 'Scheduler.handleAsyncReturn', 'MonoStorage.withAtomicTransaction']) {
            expect(sites.filter(site => site.enclosing === enclosing).map(site => `${site.file}:${site.line}`), enclosing).toEqual([]);
        }
        const helperCallers = new Set<string>();
        for (const relFile of scannedFiles) {
            const text = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8');
            const sourceFile = ts.createSourceFile(relFile, text, ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node) => {
                if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'runInRetryableTransaction') {
                    helperCallers.add(enclosingName(node, sourceFile));
                }
                node.forEachChild(visit);
            };
            visit(sourceFile);
        }
        expect([...helperCallers].sort()).toEqual([
            'Controller.cleanupAsyncTasks',
            'Controller.maintainEntityRetention',
            'MonoStorage.withAtomicTransaction',
            'Scheduler.handleAsyncReturn',
        ]);
    });

    test('the fixed-SERIALIZABLE predicate recognises the migration transactions', () => {
        const fixed = sites.filter(site => site.fixedSerializable).map(site => `${site.file} ${site.enclosing}`);
        expect(fixed).toContain('src/runtime/Controller.ts Controller.migrate');
        expect(fixed.some(entry => entry.startsWith('src/runtime/migration.ts '))).toBe(true);
    });
});
