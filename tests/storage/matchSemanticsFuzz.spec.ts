/**
 * match 语义生成式对拍（r35 复盘落地的「查询语义预言机」）。
 *
 * 动机（r35-test-blindness-retrospective §一）：34 轮建成的预言机群全部把读路径当**测量仪器**
 * （写路径快照对账、计算朴素重算、驱动差分——差分两侧跑的是同一份编译产物，对编译器级
 * 语义缺陷结构性失明），从没有一条防线校准仪器本身。match 语言自己的逻辑语义空间
 * （操作符 × 否定极性 × 量化 × 路径基数 × NULL 三值）在此之前零生成式覆盖——
 * NOT × 多段 exist 的按扇出行量化（r35 F-1）与嵌套 exist 关联错绑（r25#7/r35 F-2）
 * 因此存活了全部历史轮次。
 *
 * 机制：与 SQL 编译**完全独立**的内存求值器（Kleene 三值逻辑 + 链式存在量化），
 * 对随机数据 × 随机布尔表达式树逐条对拍 `find()` 的 id 集合。
 *
 * 生成域与各族的契约模型：
 *  - x:1 路径值原子（根字段 / dept.region）：LEFT JOIN 缺席行按 NULL 参与三值求值
 *    （['=',null]/['not',null] 翻译 IS NULL/IS NOT NULL，其余操作符对 NULL 产出 UNKNOWN）；
 *  - **x:n 路径值原子（r35c 扩域）**：按「赋值枚举」模型——LEFT JOIN 树的每个 x:n 节点
 *    独立选择一行（集合为空时选择 NULL 行；子节点选择受父选择约束），整树按三值逻辑
 *    对每个赋值求值，根命中 iff ∃ 赋值求得 TRUE。这**机器化钉住**了登记的契约决策：
 *    正极性 = 存在量化；NOT 不与量化子对易（∃ 不满足行 ⇒ 命中）；无关联行的根在
 *    正反两集之外（NULL 行三值）。改变该语义是契约决策，改动时同步更新本模型
 *    （敏感性实验：把模型换成「先 ∃ 后 NOT」的集合语义，25 种子全红——本预言机能区分
 *    两种量化语义，正是 F-1 类缺陷所在的轴）；
 *  - exist 原子按根记录链式存在量化（r35 契约）：单段 1:n / 单段 n:n / 多段 1:n→1:n /
 *    n:n 中段→x:1 终段 / x:1 前缀→x:n 终段 / 嵌套 exist 载荷；
 *  - AND/OR/NOT 任意嵌套（NOT 可包裹任何子树）；
 *  - 恒定不变量：find 结果无重复根 id——SELECT 列全部来自根/x:1 路径（对根恒定），
 *    扇出行必然整行相同、dedupe 必然完全（对 r25#6「dedupe 少去重风险」的机器化定谳）。
 *  - **between（r36 扩域）**：数值字段、非 null 边界（null 边界声明期 fail-fast 契约），
 *    NULL 值三值；
 *  - **引用值（r36 扩域，isReferenceValue）**：根/x:1 数值路径对比（rank vs dept.budget），
 *    任一侧 NULL ⇒ UNKNOWN（SQL `NULL = NULL` 是 UNKNOWN——模型不得按 JS 相等处理）；
 *    跨关联引用路径的 JOIN 树收集（collectAtomReferencePaths，r19/r20 家族）随之进入生成域；
 *  - **filtered 实体作为查询根（r36 扩域）**：resolvedMatchExpression 与用户 match 的
 *    AND 合并面——naive = 过滤谓词 AND 用户表达式；
 *  - **对称单段 exist（r36 扩域）**：friends（source===target 同名属性），语义 = ∃ 邻居
 *    （两个方向的并集）满足载荷。
 * 刻意排除（登记边界）：对称**中段**路径 / filtered 中段（existAtomCorrelation 维持
 *  legacy 编译，NOT 语义见 existCorrelationScope 的 pin）、like（方言大小写敏感性分裂）。
 *
 * 复现：FUZZ_MATCH_SEED_START=<seed> FUZZ_MATCH_SEED_COUNT=1 FUZZ_MATCH_VERBOSE=1
 */
import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Entity, Property, Relation, MatchExp, KlassByName, BoolExp } from 'interaqt';
import type { MatchExpressionData } from '@storage';
import { PGLiteDB } from '@drivers';
import { mulberry32, type Rng } from './helpers/fuzzSchema.js';

// ---------- 三值逻辑 ----------
type TV = true | false | 'U'
const notTV = (v: TV): TV => v === 'U' ? 'U' : !v
const andTV = (a: TV, b: TV): TV => (a === false || b === false) ? false : (a === 'U' || b === 'U') ? 'U' : true
const orTV = (a: TV, b: TV): TV => (a === true || b === true) ? true : (a === 'U' || b === 'U') ? 'U' : false

// ---------- 内存数据模型 ----------
type DeptRow = { id: string, region: string | null, budget: number | null }
type MemberRow = { id: string, role: string, level: number | null }
type TeamRow = { id: string, kind: string, size: number | null, members: MemberRow[] }
type UserRow = { id: string, name: string, rank: number | null, dept: DeptRow | null, teams: TeamRow[], collabs: MemberRow[] }

// ---------- 表达式形态 ----------
type ValueAtomSpec = { type: 'value', key: string, op: string, value: unknown, isRef?: boolean }
type ExistAtomSpec = { type: 'exist', path: string, payload: ExprNode }
type ExprNode =
    | { node: 'atom', atom: ValueAtomSpec | ExistAtomSpec }
    | { node: 'and', left: ExprNode, right: ExprNode }
    | { node: 'or', left: ExprNode, right: ExprNode }
    | { node: 'not', left: ExprNode }

const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]
const chance = (rng: Rng, p: number) => rng() < p

const NAMES = ['u1', 'u2', 'u3', 'zz'] as const
const REGIONS = ['east', 'west', 'north', 'zz'] as const
const KINDS = ['hot', 'cold', 'warm'] as const
const ROLES = ['admin', 'user', 'guest'] as const

// ---------- 值原子求值（LEFT JOIN 语义：缺席关系 ⇒ NULL 列；NULL 走三值） ----------
function evalValueAtomTV(pathValue: unknown, op: string, value: unknown): TV {
    if (op === '=' && value === null) return pathValue === null || pathValue === undefined
    if ((op === 'not' || op === '!=') && value === null) return pathValue !== null && pathValue !== undefined
    if (pathValue === null || pathValue === undefined) return 'U'
    switch (op) {
        case '=': return pathValue === value
        case '!=': return pathValue !== value
        case '>': return (pathValue as number) > (value as number)
        case '<': return (pathValue as number) < (value as number)
        case 'in': return (value as unknown[]).includes(pathValue)
        case 'not in': return !(value as unknown[]).includes(pathValue)
        case 'between': {
            const [lo, hi] = value as [number, number]
            return (pathValue as number) >= lo && (pathValue as number) <= hi
        }
        default: throw new Error(`naive evaluator: unknown op ${op}`)
    }
}

// 引用值原子：两侧都是列（SQL `col op col`），任一侧 NULL ⇒ UNKNOWN（含 `NULL = NULL`）。
function evalReferenceAtomTV(leftValue: unknown, op: string, rightValue: unknown): TV {
    if (leftValue === null || leftValue === undefined || rightValue === null || rightValue === undefined) return 'U'
    switch (op) {
        case '=': return leftValue === rightValue
        case '!=': return leftValue !== rightValue
        case '>': return (leftValue as number) > (rightValue as number)
        case '<': return (leftValue as number) < (rightValue as number)
        default: throw new Error(`naive evaluator: unknown reference op ${op}`)
    }
}

// scope 上按 key 取值（'name' / 'dept.region' 等 x:1 路径；缺席段 ⇒ null）
function resolvePathValue(scope: Record<string, unknown>, key: string): unknown {
    let current: unknown = scope
    for (const part of key.split('.')) {
        if (current === null || current === undefined) return null
        current = (current as Record<string, unknown>)[part]
    }
    return current ?? null
}

// exist 链式存在量化：path 逐段展开集合（x:1 段取单值），终端集合上 ∃ 记录使 payload 为 TRUE
function resolveChain(scope: Record<string, unknown>, path: string[]): Record<string, unknown>[] {
    let frontier: Record<string, unknown>[] = [scope]
    for (const segment of path) {
        const next: Record<string, unknown>[] = []
        for (const item of frontier) {
            const value = item[segment]
            if (value === null || value === undefined) continue
            if (Array.isArray(value)) next.push(...value as Record<string, unknown>[])
            else next.push(value as Record<string, unknown>)
        }
        frontier = next
    }
    return frontier
}

function evalTreeTV(node: ExprNode, scope: Record<string, unknown>): TV {
    if (node.node === 'not') return notTV(evalTreeTV(node.left, scope))
    if (node.node === 'and') return andTV(evalTreeTV(node.left, scope), evalTreeTV(node.right, scope))
    if (node.node === 'or') return orTV(evalTreeTV(node.left, scope), evalTreeTV(node.right, scope))
    const atom = node.atom
    if (atom.type === 'value') {
        if (atom.isRef) return evalReferenceAtomTV(resolvePathValue(scope, atom.key), atom.op, resolvePathValue(scope, atom.value as string))
        return evalValueAtomTV(resolvePathValue(scope, atom.key), atom.op, atom.value)
    }
    const terminals = resolveChain(scope, atom.path.split('.'))
    return terminals.some(terminal => evalTreeTV(atom.payload, terminal) === true)
}

/**
 * 根级求值 = LEFT JOIN 赋值枚举模型：
 * match JOIN 树的每个 x:n 节点选择一行（空集合选择 NULL 行；members 选择受 team 选择约束），
 * 值原子按所选赋值三值求值（NULL 组件 ⇒ 除 IS NULL 形态外产出 UNKNOWN）；
 * exist 原子关联到根（r35 编译契约），对赋值恒定。根命中 iff ∃ 赋值使整树为 TRUE。
 */
type XnAssignment = { team: Record<string, unknown> | null, member: Record<string, unknown> | null, collab: Record<string, unknown> | null }

function evalRootAtomTV(atom: ValueAtomSpec | ExistAtomSpec, rootScope: Record<string, unknown>, assignment: XnAssignment): TV {
    if (atom.type === 'exist') {
        const terminals = resolveChain(rootScope, atom.path.split('.'))
        return terminals.some(terminal => evalTreeTV(atom.payload, terminal) === true)
    }
    const key = atom.key
    const readFrom = (component: Record<string, unknown> | null, rest: string) =>
        component === null ? null : resolvePathValue(component, rest)
    let pathValue: unknown
    if (key.startsWith('teams.members.')) pathValue = readFrom(assignment.member, key.slice('teams.members.'.length))
    else if (key.startsWith('teams.')) pathValue = readFrom(assignment.team, key.slice('teams.'.length))
    else if (key.startsWith('collabs.')) pathValue = readFrom(assignment.collab, key.slice('collabs.'.length))
    else pathValue = resolvePathValue(rootScope, key)
    if (atom.isRef) return evalReferenceAtomTV(pathValue, atom.op, resolvePathValue(rootScope, atom.value as string))
    return evalValueAtomTV(pathValue, atom.op, atom.value)
}

function evalRootTreeTV(node: ExprNode, rootScope: Record<string, unknown>, assignment: XnAssignment): TV {
    if (node.node === 'not') return notTV(evalRootTreeTV(node.left, rootScope, assignment))
    if (node.node === 'and') return andTV(evalRootTreeTV(node.left, rootScope, assignment), evalRootTreeTV(node.right, rootScope, assignment))
    if (node.node === 'or') return orTV(evalRootTreeTV(node.left, rootScope, assignment), evalRootTreeTV(node.right, rootScope, assignment))
    return evalRootAtomTV(node.atom, rootScope, assignment)
}

function rootMatches(node: ExprNode, rootScope: Record<string, unknown>): boolean {
    const teams = (rootScope.teams as Record<string, unknown>[] | undefined) ?? []
    const collabs = (rootScope.collabs as Record<string, unknown>[] | undefined) ?? []
    const teamChoices: Array<Record<string, unknown> | null> = teams.length ? teams : [null]
    const collabChoices: Array<Record<string, unknown> | null> = collabs.length ? collabs : [null]
    for (const team of teamChoices) {
        const members = (team?.members as Record<string, unknown>[] | undefined) ?? []
        const memberChoices: Array<Record<string, unknown> | null> = members.length ? members : [null]
        for (const member of memberChoices) {
            for (const collab of collabChoices) {
                if (evalRootTreeTV(node, rootScope, { team, member, collab }) === true) return true
            }
        }
    }
    return false
}

// ---------- 表达式 → MatchExpressionData ----------
function toMatchData(node: ExprNode): MatchExpressionData {
    if (node.node === 'not') return toMatchData(node.left).not()
    if (node.node === 'and') return toMatchData(node.left).and(toMatchData(node.right))
    if (node.node === 'or') return toMatchData(node.left).or(toMatchData(node.right))
    const atom = node.atom
    if (atom.type === 'value') {
        if (atom.isRef) {
            return MatchExp.atom({ key: atom.key, value: [atom.op, atom.value] as [string, unknown], isReferenceValue: true })
        }
        return MatchExp.atom({ key: atom.key, value: [atom.op, atom.value] as [string, unknown] })
    }
    return MatchExp.atom({ key: atom.path, value: ['exist', toMatchData(atom.payload)] })
}

function describeExpr(node: ExprNode): string {
    if (node.node === 'not') return `NOT(${describeExpr(node.left)})`
    if (node.node === 'and') return `(${describeExpr(node.left)} AND ${describeExpr(node.right)})`
    if (node.node === 'or') return `(${describeExpr(node.left)} OR ${describeExpr(node.right)})`
    const atom = node.atom
    if (atom.type === 'value') return atom.isRef ? `${atom.key} ${atom.op} ref(${atom.value})` : `${atom.key} ${atom.op} ${JSON.stringify(atom.value)}`
    return `${atom.path} EXIST (${describeExpr(atom.payload)})`
}

// ---------- 生成器 ----------
function genScalar(rng: Rng, kind: 'name' | 'rank' | 'region' | 'kind' | 'size' | 'role' | 'level'): unknown {
    switch (kind) {
        case 'name': return pick(rng, NAMES)
        case 'region': return pick(rng, REGIONS)
        case 'kind': return pick(rng, KINDS)
        case 'role': return pick(rng, ROLES)
        case 'rank': case 'size': case 'level': return Math.floor(rng() * 5)
    }
}

type FieldSpec = { key: string, kind: Parameters<typeof genScalar>[1], nullable: boolean, numeric: boolean }

function genValueAtom(rng: Rng, fields: FieldSpec[]): ExprNode {
    const field = pick(rng, fields)
    const roll = rng()
    if (field.nullable && roll < 0.18) {
        return { node: 'atom', atom: { type: 'value', key: field.key, op: pick(rng, ['=', 'not']), value: null } }
    }
    if (roll < 0.35) {
        const listLength = 1 + Math.floor(rng() * 3)
        const list = Array.from({ length: listLength }, () => genScalar(rng, field.kind))
        return { node: 'atom', atom: { type: 'value', key: field.key, op: pick(rng, ['in', 'not in']), value: list } }
    }
    if (field.numeric && roll < 0.5) {
        const lo = Math.floor(rng() * 4)
        return { node: 'atom', atom: { type: 'value', key: field.key, op: 'between', value: [lo, lo + Math.floor(rng() * 3)] } }
    }
    const op = field.numeric ? pick(rng, ['=', '!=', '>', '<']) : pick(rng, ['=', '!='])
    return { node: 'atom', atom: { type: 'value', key: field.key, op, value: genScalar(rng, field.kind) } }
}

// 引用值原子（根作用域内的两条数值路径对比；跨关联引用路径入 JOIN 树是 r19/r20 家族的消费面）
function genReferenceAtom(rng: Rng): ExprNode {
    const pair = pick(rng, [
        ['rank', 'dept.budget'], ['dept.budget', 'rank'],
    ] as const)
    return { node: 'atom', atom: { type: 'value', key: pair[0], op: pick(rng, ['=', '!=', '>', '<']), value: pair[1], isRef: true } }
}

const TEAM_FIELDS: FieldSpec[] = [
    { key: 'kind', kind: 'kind', nullable: false, numeric: false },
    { key: 'size', kind: 'size', nullable: true, numeric: true },
]
const MEMBER_FIELDS: FieldSpec[] = [
    { key: 'role', kind: 'role', nullable: false, numeric: false },
    { key: 'level', kind: 'level', nullable: true, numeric: true },
]
const USER_FIELDS: FieldSpec[] = [
    { key: 'name', kind: 'name', nullable: false, numeric: false },
    { key: 'rank', kind: 'rank', nullable: true, numeric: true },
    { key: 'dept.region', kind: 'region', nullable: true, numeric: false },
]
// x:n 路径值原子（赋值枚举模型；nullable=true——LEFT JOIN 的 NULL 行形态天然存在）
const USER_XN_FIELDS: FieldSpec[] = [
    { key: 'teams.kind', kind: 'kind', nullable: true, numeric: false },
    { key: 'teams.size', kind: 'size', nullable: true, numeric: true },
    { key: 'teams.members.role', kind: 'role', nullable: true, numeric: false },
    { key: 'teams.members.level', kind: 'level', nullable: true, numeric: true },
    { key: 'collabs.role', kind: 'role', nullable: true, numeric: false },
    { key: 'collabs.level', kind: 'level', nullable: true, numeric: true },
]

function genBoolTree(rng: Rng, depth: number, genLeaf: (rng: Rng) => ExprNode): ExprNode {
    if (depth <= 0 || chance(rng, 0.45)) {
        const leaf = genLeaf(rng)
        return chance(rng, 0.25) ? { node: 'not', left: leaf } : leaf
    }
    const combinator = pick(rng, ['and', 'or'] as const)
    const combined: ExprNode = {
        node: combinator,
        left: genBoolTree(rng, depth - 1, genLeaf),
        right: genBoolTree(rng, depth - 1, genLeaf),
    }
    return chance(rng, 0.2) ? { node: 'not', left: combined } : combined
}

// exist 原子菜单：路径 × 载荷（载荷可含嵌套 exist）
function genExistAtom(rng: Rng): ExprNode {
    const shape = pick(rng, ['teams', 'teams.members', 'collabs', 'collabs.team', 'dept.staff', 'teamsNested', 'friends'] as const)
    if (shape === 'teams') {
        return { node: 'atom', atom: { type: 'exist', path: 'teams', payload: genBoolTree(rng, 1, r => genValueAtom(r, TEAM_FIELDS)) } }
    }
    if (shape === 'teams.members') {
        return { node: 'atom', atom: { type: 'exist', path: 'teams.members', payload: genBoolTree(rng, 1, r => genValueAtom(r, MEMBER_FIELDS)) } }
    }
    if (shape === 'collabs') {
        return { node: 'atom', atom: { type: 'exist', path: 'collabs', payload: genBoolTree(rng, 1, r => genValueAtom(r, MEMBER_FIELDS)) } }
    }
    if (shape === 'friends') {
        // 对称单段 exist：∃ 邻居（两个方向的并集）满足载荷（existCorrelationScope 的 pin 已定谳正/反极性都按根量化）
        return { node: 'atom', atom: { type: 'exist', path: 'friends', payload: genBoolTree(rng, 0, r => genValueAtom(r, USER_FIELDS.slice(0, 2))) } }
    }
    if (shape === 'collabs.team') {
        // n:n 中段 → x:1 终段
        return { node: 'atom', atom: { type: 'exist', path: 'collabs.team', payload: genBoolTree(rng, 1, r => genValueAtom(r, TEAM_FIELDS)) } }
    }
    if (shape === 'dept.staff') {
        // x:1 前缀 → x:n 终段（parent 关联模式）
        return { node: 'atom', atom: { type: 'exist', path: 'dept.staff', payload: genBoolTree(rng, 0, r => genValueAtom(r, USER_FIELDS.slice(0, 2))) } }
    }
    // teams exist (团队字段 AND members exist P)：嵌套 exist 载荷
    return {
        node: 'atom',
        atom: {
            type: 'exist', path: 'teams',
            payload: {
                node: 'and',
                left: genValueAtom(rng, TEAM_FIELDS),
                right: { node: 'atom', atom: { type: 'exist', path: 'members', payload: genBoolTree(rng, 0, r => genValueAtom(r, MEMBER_FIELDS)) } },
            },
        },
    }
}

function genRootExpr(rng: Rng): ExprNode {
    return genBoolTree(rng, 2, r => {
        const roll = r()
        if (roll < 0.35) return genValueAtom(r, USER_FIELDS)
        if (roll < 0.45) return genReferenceAtom(r)
        if (roll < 0.65) return genValueAtom(r, USER_XN_FIELDS)
        return genExistAtom(r)
    })
}

// ---------- 世界构建 ----------
async function buildWorld(rng: Rng, tag: string) {
    const Dept = Entity.create({ name: `MsDept${tag}`, properties: [Property.create({ name: 'region', type: 'string' }), Property.create({ name: 'budget', type: 'number' })] })
    const User = Entity.create({
        name: `MsUser${tag}`,
        properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'rank', type: 'number' })]
    })
    const Team = Entity.create({
        name: `MsTeam${tag}`,
        properties: [Property.create({ name: 'kind', type: 'string' }), Property.create({ name: 'size', type: 'number' })]
    })
    const Member = Entity.create({
        name: `MsMember${tag}`,
        properties: [Property.create({ name: 'role', type: 'string' }), Property.create({ name: 'level', type: 'number' })]
    })
    Relation.create({ name: `MsUserDept${tag}`, source: User, sourceProperty: 'dept', target: Dept, targetProperty: 'staff', type: 'n:1' })
    Relation.create({ name: `MsUserTeams${tag}`, source: User, sourceProperty: 'teams', target: Team, targetProperty: 'owner', type: '1:n' })
    Relation.create({ name: `MsTeamMembers${tag}`, source: Team, sourceProperty: 'members', target: Member, targetProperty: 'team', type: '1:n' })
    Relation.create({ name: `MsUserCollabs${tag}`, source: User, sourceProperty: 'collabs', target: Member, targetProperty: 'collabUsers', type: 'n:n' })
    Relation.create({ name: `MsUserFriends${tag}`, source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends', type: 'n:n' })
    // filtered 根（r36）：resolvedMatchExpression 与用户 match 的 AND 合并面
    const Active = Entity.create({
        name: `MsActive${tag}`,
        baseEntity: User,
        matchExpression: MatchExp.atom({ key: 'rank', value: ['>', 0] }),
    })

    const db = new PGLiteDB()
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const entities = [Dept, User, Team, Member, Active]
    const controller = new Controller({
        system, entities,
        relations: Relation.instances.filter(r => (r.name as string | undefined)?.endsWith(tag)),
        eventSources: []
    })
    await controller.setup(true)

    // 数据生成：先独立建 Dept/Member/Team（ref 组装），镜像进内存模型
    const depts: DeptRow[] = []
    for (let i = 0; i < 3; i++) {
        const region = chance(rng, 0.15) ? null : pick(rng, REGIONS.slice(0, 3))
        const budget = chance(rng, 0.25) ? null : Math.floor(rng() * 5)
        const created = await system.storage.create(`MsDept${tag}`, { region, budget })
        depts.push({ id: String(created.id), region, budget })
    }
    const members: MemberRow[] = []
    for (let i = 0; i < 8; i++) {
        const role = pick(rng, ROLES)
        const level = chance(rng, 0.25) ? null : Math.floor(rng() * 5)
        const created = await system.storage.create(`MsMember${tag}`, { role, level })
        members.push({ id: String(created.id), role, level })
    }
    const memberPool = [...members]
    const teams: TeamRow[] = []
    for (let i = 0; i < 6; i++) {
        const kind = pick(rng, KINDS)
        const size = chance(rng, 0.25) ? null : Math.floor(rng() * 5)
        // 每个 member 至多属于一个 team（1:n）：从池中取
        const teamMembers: MemberRow[] = []
        const memberCount = Math.floor(rng() * 3)
        for (let j = 0; j < memberCount && memberPool.length; j++) {
            teamMembers.push(memberPool.splice(Math.floor(rng() * memberPool.length), 1)[0])
        }
        const created = await system.storage.create(`MsTeam${tag}`, {
            kind, size, members: teamMembers.map(m => ({ id: m.id }))
        })
        teams.push({ id: String(created.id), kind, size, members: teamMembers })
    }
    const teamPool = [...teams]
    const users: UserRow[] = []
    for (let i = 0; i < 6; i++) {
        const name = pick(rng, NAMES.slice(0, 3))
        const rank = chance(rng, 0.25) ? null : Math.floor(rng() * 5)
        const dept = chance(rng, 0.35) ? null : pick(rng, depts)
        // 每个 team 至多属于一个 user（1:n）：从池中取
        const userTeams: TeamRow[] = []
        const teamCount = Math.floor(rng() * 3)
        for (let j = 0; j < teamCount && teamPool.length; j++) {
            userTeams.push(teamPool.splice(Math.floor(rng() * teamPool.length), 1)[0])
        }
        const collabs: MemberRow[] = []
        const collabCount = Math.floor(rng() * 3)
        for (let j = 0; j < collabCount; j++) {
            const member = pick(rng, members)
            if (!collabs.some(c => c.id === member.id)) collabs.push(member)
        }
        const created = await system.storage.create(`MsUser${tag}`, {
            name, rank,
            ...(dept ? { dept: { id: dept.id } } : {}),
            teams: userTeams.map(t => ({ id: t.id })),
            collabs: collabs.map(m => ({ id: m.id })),
        })
        users.push({ id: String(created.id), name, rank, dept, teams: userTeams, collabs })
    }
    // 对称 friends 边（无向；镜像进双方邻居集）
    const friendsByUserId = new Map<string, UserRow[]>(users.map(u => [u.id, []]))
    for (let i = 0; i < 4; i++) {
        const a = pick(rng, users)
        const b = pick(rng, users)
        if (a.id === b.id) continue
        if (friendsByUserId.get(a.id)!.some(f => f.id === b.id)) continue
        await system.storage.addRelationByNameById(`MsUserFriends${tag}`, a.id, b.id, {})
        friendsByUserId.get(a.id)!.push(b)
        friendsByUserId.get(b.id)!.push(a)
    }

    // 内存模型的求值视图（exist 链会走 dept.staff 反向、collabs.team 反向，需要补反查引用）
    const teamByMemberId = new Map<string, TeamRow>()
    for (const team of teams) for (const member of team.members) teamByMemberId.set(member.id, team)
    const staffByDeptId = new Map<string, UserRow[]>()
    for (const user of users) {
        if (user.dept) {
            if (!staffByDeptId.has(user.dept.id)) staffByDeptId.set(user.dept.id, [])
            staffByDeptId.get(user.dept.id)!.push(user)
        }
    }
    const scopeOfMember = (member: MemberRow): Record<string, unknown> => ({
        ...member,
        team: teamByMemberId.get(member.id) ? scopeOfTeam(teamByMemberId.get(member.id)!) : null,
    })
    const scopeOfTeam = (team: TeamRow): Record<string, unknown> => ({
        kind: team.kind, size: team.size,
        members: team.members.map(m => ({ role: m.role, level: m.level })),
    })
    const scopeOfUser = (user: UserRow): Record<string, unknown> => ({
        name: user.name, rank: user.rank,
        dept: user.dept ? {
            region: user.dept.region,
            budget: user.dept.budget,
            staff: (staffByDeptId.get(user.dept.id) || []).map(u => ({ name: u.name, rank: u.rank })),
        } : null,
        teams: user.teams.map(scopeOfTeam),
        collabs: user.collabs.map(scopeOfMember),
        friends: (friendsByUserId.get(user.id) || []).map(f => ({ name: f.name, rank: f.rank })),
    })

    return { system, users, scopeOfUser, tag }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_MATCH_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_MATCH_SEED_COUNT ?? 25)
const EXPRS_PER_SEED = Number(process.env.FUZZ_MATCH_EXPRS ?? 12)

describe('match semantics differential fuzz (SQL compilation vs independent three-valued evaluator)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i', async (seed) => {
        const rng = mulberry32(seed * 2654435761 % 4294967296)
        const world = await buildWorld(rng, `S${seed}`)
        try {
            for (let exprIndex = 0; exprIndex < EXPRS_PER_SEED; exprIndex++) {
                const expr = genRootExpr(rng)
                const expected = world.users
                    .filter(user => rootMatches(expr, world.scopeOfUser(user)))
                    .map(user => user.id).sort()
                let matchData: MatchExpressionData
                try {
                    matchData = toMatchData(expr)
                } catch (error) {
                    throw new Error(`[match-fuzz seed=${seed} expr=${exprIndex}] expression build failed for ${describeExpr(expr)}: ${error instanceof Error ? error.message : String(error)}`)
                }
                const rows = await world.system.storage.find(`MsUser${world.tag}`, matchData, undefined, ['id'])
                const rawIds = rows.map((row: { id: unknown }) => String(row.id))
                // 恒定不变量（r25#6 定谳）：find 结果无重复根——扇出行整行相同、dedupe 必然完全
                if (new Set(rawIds).size !== rawIds.length) {
                    throw new Error(`[match-fuzz seed=${seed} expr=${exprIndex}] find returned DUPLICATE roots (dedupe incomplete): ${JSON.stringify(rawIds)}\nexpression: ${describeExpr(expr)}`)
                }
                const actual = [...rawIds].sort()

                // filtered 根（r36）：同一表达式经 filtered 实体查询，naive = 过滤谓词(rank>0) AND 表达式
                const filteredRows = await world.system.storage.find(`MsActive${world.tag}`, toMatchData(expr), undefined, ['id'])
                const filteredActual = [...new Set(filteredRows.map((row: { id: unknown }) => String(row.id)))].sort()
                const filteredExpected = world.users
                    .filter(user => (user.rank ?? null) !== null && (user.rank as number) > 0 && rootMatches(expr, world.scopeOfUser(user)))
                    .map(user => user.id).sort()
                if (JSON.stringify(filteredActual) !== JSON.stringify(filteredExpected)) {
                    throw new Error(
                        `[match-fuzz seed=${seed} expr=${exprIndex}] FILTERED-root result diverges\n` +
                        `expression: ${describeExpr(expr)}\n` +
                        `expected: ${JSON.stringify(filteredExpected)}\nactual:   ${JSON.stringify(filteredActual)}`
                    )
                }
                if (process.env.FUZZ_MATCH_VERBOSE) {
                    console.log(`seed=${seed} expr=${exprIndex}: ${describeExpr(expr)}\n  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
                }
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(
                        `[match-fuzz seed=${seed} expr=${exprIndex}] SQL result diverges from the independent evaluator\n` +
                        `expression: ${describeExpr(expr)}\n` +
                        `matchData: ${JSON.stringify((matchData as BoolExp<unknown>).raw)}\n` +
                        `expected roots: ${JSON.stringify(expected)}\n` +
                        `actual roots:   ${JSON.stringify(actual)}\n` +
                        `world users: ${JSON.stringify(world.users.map(u => world.scopeOfUser(u)), null, 1)}`
                    )
                }
                expect(actual).toEqual(expected)
            }
        } finally {
            await world.system.destroy()
        }
    }, 120000)
})
