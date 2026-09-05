import { describe, test, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { fileURLToPath } from 'node:url';

// M-02（controller-retention-via-property-instances）：把「运行时（setup / migration /
// storage 编译 / dispatch 路径）合成派生定义必须走 X.derive，不得走 X.create」提升为
// 可执行不变量。扫描 src/runtime、src/storage、src/builtins、src/drivers 的源码，
// 断言每个 (Entity|Relation|Property).create( 调用点都落在允许的**结构位置**上：
//   1. 模块顶层常量初始化（框架内置声明，只登记一次，不随 setup 增长）；或
//   2. `HardDeletionProperty.create()` 工厂（src/runtime/Controller.ts——用户显式声明
//      路径，由应用代码在实体 properties 里调用，src/ 内无运行时调用点）。
//
// 审计轮 a=3 加强：允许判定按**站点结构**（isTopLevelInitializer / HardDeletionProperty
// 工厂），不按文件成员资格。文件级白名单会让「在白名单文件（如 Controller.ts）的函数体
// 内新增运行时合成 X.create()」静默通过（注入实验证实），违背本 spec 的存在意义——
// 新增运行时 create 必须变红，作者必须显式决定「用户声明还是派生定义」。
//
// 本里程碑（M-02）预期红：R1–R8 仍是 create 且都在函数体内，失败输出应恰好列出这 8 处。
// M-03 把 R1–R8 改走 derive 后本测试变绿。

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN_ROOTS = ['src/runtime', 'src/storage', 'src/builtins', 'src/drivers'] as const;
const KLASSES = ['Entity', 'Relation', 'Property'] as const;

type Site = { file: string; line: number; lineText: string; callee: string; structuralReason: string | null };

function listSourceFiles(rootRel: string): string[] {
    const root = path.join(REPO_ROOT, rootRel);
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
                out.push(path.relative(REPO_ROOT, full));
            }
        }
    };
    walk(root);
    return out.sort();
}

/**
 * 一个 X.create( 调用是否落在允许的结构位置上。
 *
 * 允许形态（与设计 §1.2 的用户声明清单一致）：
 *  a) 模块顶层 const/export const 初始化器（含其内联数组/对象元素——内置声明的
 *     properties: [Property.create(...)] 数组元素也在顶层初始化器树内）；
 *  b) `HardDeletionProperty` 对象工厂的 create 方法体（Controller.ts：用户显式声明路径）。
 *
 * 其余任何位置（方法体、普通函数体、类静态块、非顶层语句）都算运行时合成，必须走 derive。
 */
function structuralAllowReason(
    call: ts.CallExpression,
    sourceFile: ts.SourceFile,
    text: string,
): string | null {
    // (b) HardDeletionProperty 工厂：调用点位于 `const HardDeletionProperty = { create() { ... } }` 的方法体内。
    //  自调用点向上找最近的对象字面量方法；其名字必须是 create，且该对象字面量必须被
    //  名为 HardDeletionProperty 的顶层 const 初始化。
    for (let node: ts.Node = call; node.parent; node = node.parent) {
        const parent = node.parent;
        if (ts.isMethodDeclaration(parent) && parent.parent && ts.isObjectLiteralExpression(parent.parent)) {
            const methodName = parent.name.getText(sourceFile);
            const objectLiteral = parent.parent;
            const varDecl = objectLiteral.parent && ts.isVariableDeclaration(objectLiteral.parent)
                ? objectLiteral.parent
                : undefined;
            const varName = varDecl?.name.getText(sourceFile);
            if (methodName === 'create' && varName === 'HardDeletionProperty') {
                return 'HardDeletionProperty factory (user-declaration path, called by application code)';
            }
        }
        // 一旦离开顶层（进入任意的类成员 / 普通函数体之外的块级语句）之前先判顶层初始化器——
        // 下面统一处理，这里继续向上找工厂形态。
    }

    // (a) 模块顶层初始化器：调用点的某个祖先是 SourceFile 直属的 VariableStatement 的
    //  初始化表达式（含数组元素、内联对象属性值）。中途穿过函数体 / 类节点即不算。
    for (let node: ts.Node = call; node.parent; node = node.parent) {
        const parent = node.parent;
        if (ts.isFunctionLike(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
            return null; // 调用点在某个函数/类体内，且该链路上没匹配到 (b)
        }
        if (ts.isVariableDeclaration(parent) && parent.parent && ts.isVariableDeclarationList(parent.parent)) {
            const list = parent.parent;
            const stmt = list.parent;
            if (ts.isVariableStatement(stmt) && stmt.parent === sourceFile) {
                return `module-top-level declaration initializer (${parent.name.getText(sourceFile)})`;
            }
            return null; // 嵌套在函数内的 const —— 运行时合成
        }
    }
    void text;
    return null;
}

function findRuntimeCreateSites(files: string[]): Site[] {
    const sites: Site[] = [];
    for (const relFile of files) {
        const text = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8');
        const sourceFile = ts.createSourceFile(
            path.join(REPO_ROOT, relFile),
            text,
            ts.ScriptTarget.Latest,
            /* setParentNodes */ true,
        );
        const visit = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                ts.isIdentifier(node.expression.expression) &&
                (KLASSES as readonly string[]).includes(node.expression.expression.text) &&
                node.expression.name.text === 'create'
            ) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                sites.push({
                    file: relFile,
                    line: line + 1,
                    lineText: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 90),
                    callee: node.expression.expression.text,
                    structuralReason: structuralAllowReason(node, sourceFile, text),
                });
            }
            node.forEachChild(visit);
        };
        visit(sourceFile);
    }
    return sites;
}

describe('runtime (Entity|Relation|Property).create allowlist', () => {
    let sites: Site[];
    let scannedFiles: string[];

    beforeAll(() => {
        scannedFiles = SCAN_ROOTS.flatMap(listSourceFiles);
        sites = findRuntimeCreateSites(scannedFiles);
    });

    test('scanned at least the four framework roots (guard against a path-resolution drift)', () => {
        expect(scannedFiles).toContain('src/runtime/MonoSystem.ts');
        expect(scannedFiles).toContain('src/runtime/Controller.ts');
        expect(scannedFiles).toContain('src/runtime/System.ts');
        expect(scannedFiles).toContain('src/storage/erstorage/MergedItemProcessor.ts');
        expect(scannedFiles).toContain('src/builtins/interaction/Interaction.ts');
        expect(scannedFiles).toContain('src/builtins/interaction/activity/ActivityManager.ts');
    });

    test('every runtime X.create( site is structurally allowlisted (module-top-level builtin initializers / HardDeletionProperty factory)', () => {
        const violations = sites.filter(s => s.structuralReason === null);
        const formatSite = (s: Site) => `${s.file}:${s.line} (${s.callee}.create) ${s.lineText}`;
        expect(
            violations,
            `Runtime synthesis must use X.derive, not X.create (see docs/controller-retention-via-property-instances).\n` +
            `Offending sites (${violations.length}):\n${violations.map(formatSite).join('\n')}\n` +
            `Only module-top-level builtin declarations and the HardDeletionProperty factory may call X.create.\n` +
            `A runtime-synthesis site must use X.derive; a genuine new user-declaration path needs an explicit structural allow reason here.`
        ).toEqual([]);
    });

    test('structural allow reasons cover exactly the expected builtin declarations (no silent broadening)', () => {
        // 被允许的站点必须来自已知内置声明文件；任何其它文件的「允许」都意味着谓词误放行。
        const allowed = sites.filter(s => s.structuralReason !== null);
        const allowedFiles = new Set(allowed.map(s => s.file));
        expect([...allowedFiles].sort()).toEqual([
            'src/builtins/interaction/Interaction.ts',
            'src/builtins/interaction/activity/ActivityManager.ts',
            'src/runtime/Controller.ts',
            'src/runtime/System.ts',
        ].sort());
        // HardDeletionProperty 工厂恰好一个允许站点（Controller.ts）。
        const factory = allowed.filter(s => s.structuralReason!.startsWith('HardDeletionProperty'));
        expect(factory.length, 'exactly one HardDeletionProperty.create factory site').toBe(1);
        expect(factory[0].file).toBe('src/runtime/Controller.ts');
        // System.ts / Interaction.ts / ActivityManager.ts 的允许站点全部是顶层初始化器。
        for (const s of allowed.filter(x => x.file !== 'src/runtime/Controller.ts')) {
            expect(s.structuralReason!.startsWith('module-top-level declaration initializer')).toBe(true);
        }
    });
});
