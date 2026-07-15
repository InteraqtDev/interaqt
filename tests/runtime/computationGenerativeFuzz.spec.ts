/**
 * 计算层生成式测试（r29，quality-plan §1.3 第 2 步）。
 *
 * 动机：aggregationConsistencyMatrix / symmetricAggregationMatrix 已把「聚合 × 源形态」
 * 铺成手工矩阵，但矩阵的 schema 是**固定夹具**——r27 F-2（多 dataDeps 双跑）、r28 F-4
 * （eventDeps 重叠双插）这类 bug 只在特定**声明组合**下现形，夹具枚举不出没想到的组合。
 * 本 fuzzer 把声明本身放进生成域：
 *
 * - schema：复用共享生成器（helpers/fuzzSchema，含 filtered entity——聚合源可以是视图）；
 * - 计算声明：随机 (源 × 聚合种类 × 宿主位置) —— 全局 Dictionary 与 property 级
 *   （关系两侧）都在菜单内；Count/Summation/Average/Every/Any/WeightedSummation；
 * - 操作序列：复用共享操作决策器（对 MonoSystem.storage 直写——计算对 mutation 事件
 *   响应，与 dispatch 无关；事务性 dispatch 轨道由 postgresqlConcurrency 套件承担）；
 * - 预言机：每步之后，每个声明的**朴素全量重算**（独立 JS 真值，从新查询算起）
 *   必须等于存储的计算值。Count/Summation 天然非幂等——增量双跑/漏跑直接体现为
 *   值偏差（r27 F-2 的「夹具幂等性遮蔽」在这里结构性不存在）。
 *
 * 表达域刻意未含（后续扩张点，见 quality-plan §1.5）：StateMachine/Transform 等
 * 事件驱动计算（需 InteractionEvent 轨道）、async 计算、activity 层。
 *
 * 再现：FUZZ_COMP_SEED_START / FUZZ_COMP_SEED_COUNT / FUZZ_COMP_OPS；FUZZ_VERBOSE=1。
 */
import { describe, expect, test } from "vitest";
import {
    Any, Average, Controller, Count, Dictionary, Every, KlassByName, MonoSystem,
    Property, Summation, WeightedSummation,
} from 'interaqt';
import { PGLiteDB } from '@drivers';
import { mulberry32, chance, int, pick, genSchema, isExpectedRejection, type FuzzSchema, type Rng } from "../storage/helpers/fuzzSchema.js";
import { decideNextOp, executeOpIntent, type FuzzOpIntent, type IdPools } from "../storage/helpers/fuzzOps.js";

// ---------- 聚合菜单：声明工厂 + 独立 JS 真值 ----------
type Row = Record<string, unknown>
type AggKind = {
    name: string
    valueType: 'number' | 'boolean'
    /** 是否需要数值字段（false 的格可用于无数值字段的关系源） */
    needsField: boolean
    /** target: record（全局 dict 用实体/关系实例，field = 源上的数值字段）或 property 名（property 级） */
    createForRecord: (record: unknown, field: string) => unknown
    createForProperty: (propertyName: string, hasWeight: boolean) => unknown
    truthOverRows: (rows: Row[], field: string, empty: unknown) => unknown
}

const numOf = (row: Row, field: string): number => typeof row[field] === 'number' ? row[field] as number : 0
const scoreOf = (row: Row): number => numOf(row, 'score')
const weightOf = (row: Row): number => {
    const link = row['&'] as Row | undefined
    return typeof link?.weight === 'number' ? link.weight : 1
}

const AGG_MENU: AggKind[] = [
    {
        name: 'count', valueType: 'number', needsField: false,
        createForRecord: (record) => Count.create({ record, attributeQuery: [], callback: () => true } as any),
        createForProperty: (propertyName) => Count.create({ property: propertyName } as any),
        truthOverRows: (rows) => rows.length,
    },
    {
        name: 'countCb', valueType: 'number', needsField: true,
        createForRecord: (record, field) => Count.create({ record, attributeQuery: [field], callback: (r: Row) => numOf(r, field) > 50 } as any),
        createForProperty: (propertyName) => Count.create({ property: propertyName, attributeQuery: ['score'], callback: (r: Row) => scoreOf(r) > 50 } as any),
        truthOverRows: (rows, field) => rows.filter(r => numOf(r, field) > 50).length,
    },
    {
        name: 'sum', valueType: 'number', needsField: true,
        createForRecord: (record, field) => Summation.create({ record, attributeQuery: [field] } as any),
        createForProperty: (propertyName) => Summation.create({ property: propertyName, attributeQuery: ['score'] } as any),
        truthOverRows: (rows, field) => rows.reduce((acc, r) => acc + numOf(r, field), 0),
    },
    {
        name: 'avg', valueType: 'number', needsField: true,
        createForRecord: (record, field) => Average.create({ record, attributeQuery: [field] } as any),
        createForProperty: (propertyName) => Average.create({ property: propertyName, attributeQuery: ['score'] } as any),
        truthOverRows: (rows, field, empty) => {
            const nums = rows.map(r => r[field]).filter((v): v is number => typeof v === 'number')
            return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : empty
        },
    },
    {
        name: 'every', valueType: 'boolean', needsField: true,
        createForRecord: (record, field) => Every.create({ record, attributeQuery: [field], callback: (r: Row) => numOf(r, field) > 10, notEmpty: true } as any),
        createForProperty: (propertyName) => Every.create({ property: propertyName, attributeQuery: ['score'], callback: (r: Row) => scoreOf(r) > 10, notEmpty: true } as any),
        truthOverRows: (rows, field, empty) => rows.length === 0 ? empty : rows.every(r => numOf(r, field) > 10),
    },
    {
        name: 'any', valueType: 'boolean', needsField: true,
        createForRecord: (record, field) => Any.create({ record, attributeQuery: [field], callback: (r: Row) => numOf(r, field) > 80 } as any),
        createForProperty: (propertyName) => Any.create({ property: propertyName, attributeQuery: ['score'], callback: (r: Row) => scoreOf(r) > 80 } as any),
        truthOverRows: (rows, field, empty) => rows.length === 0 ? empty : rows.some(r => numOf(r, field) > 80),
    },
    {
        name: 'weighted', valueType: 'number', needsField: true,
        createForRecord: (record, field) => WeightedSummation.create({
            record, attributeQuery: [field],
            callback: (r: Row) => ({ weight: 2, value: numOf(r, field) }),
        } as any),
        createForProperty: (propertyName, hasWeight) => WeightedSummation.create({
            property: propertyName,
            attributeQuery: hasWeight ? ['score', ['&', { attributeQuery: ['weight'] }]] : ['score'],
            callback: hasWeight
                ? (r: Row) => ({ weight: weightOf(r), value: scoreOf(r) })
                : (r: Row) => ({ weight: 2, value: scoreOf(r) }),
        } as any),
        truthOverRows: () => { throw new Error('weighted truth is context-specific, computed at cell build time') },
    },
]

// ---------- 声明生成 ----------
type GlobalCell = {
    cell: string
    dictName: string
    /** 独立 JS 真值：从查询行重算 */
    naive: (rows: Row[], empty: unknown) => unknown
    /** 数据源查询（实体名或关系名 + 是否关系） */
    sourceName: string
    isRelation: boolean
    /** filtered 源：谓词真值（作用于 base 全集）；无谓词 = 全集 */
    basePredicate?: (row: Row) => boolean
    baseName?: string
}
type PropertyCell = {
    cell: string
    hostEntity: string
    propertyName: string
    /** 宿主一侧的关系属性名（嵌套读取用）；含 & weight */
    relationProperty: string
    hasWeight: boolean
    naive: (relatedRows: Row[], empty: unknown) => unknown
}

function genComputationCells(rng: Rng, schema: FuzzSchema) {
    const dictionaries: unknown[] = []
    const globalCells: GlobalCell[] = []
    const propertyCells: PropertyCell[] = []
    const declarationErrors: string[] = []

    // 全局 Dictionary：2..4 个 (源 × 聚合)。源菜单 = 实体 ∪ 关系 ∪ filtered 实体。
    // 数值字段：实体/filtered 源用 score；关系源用 weight（无 weight 的关系只能上无字段聚合）。
    type SourceChoice = { key: string, record: unknown, sourceName: string, isRelation: boolean, numericField: string | null, basePredicate?: (row: Row) => boolean, baseName?: string }
    const sourceMenu: SourceChoice[] = [
        ...schema.entities.filter(e => schema.entityNames.includes(e.name)).map(entity => ({
            key: `entity:${entity.name}`, record: entity, sourceName: entity.name, isRelation: false, numericField: 'score',
        })),
        ...schema.relationChoices.map(choice => ({
            key: `relation:${choice.relation.name}`, record: choice.relation, sourceName: choice.relation.name!, isRelation: true,
            numericField: choice.linkProps.includes('weight') ? 'weight' : null,
        })),
        ...schema.filteredEntities.map(filtered => ({
            key: `filtered:${filtered.name}`, record: filtered.entity, sourceName: filtered.name, isRelation: false, numericField: 'score',
            basePredicate: filtered.predicate, baseName: filtered.baseName,
        })),
    ]
    const globalCount = 2 + int(rng, 3)
    for (let i = 0; i < globalCount; i++) {
        const source = pick(rng, sourceMenu)
        const menu = source.numericField ? AGG_MENU : AGG_MENU.filter(a => !a.needsField)
        const agg = pick(rng, menu)
        const field = source.numericField ?? ''
        const dictName = `fz_${i}_${agg.name}`
        const naive: GlobalCell['naive'] = agg.name === 'weighted'
            ? (rows) => rows.reduce((acc, r) => acc + 2 * numOf(r, field), 0)
            : (rows, empty) => agg.truthOverRows(rows, field, empty)
        try {
            const computation = agg.createForRecord(source.record, field)
            dictionaries.push(Dictionary.create({ name: dictName, type: agg.valueType, collection: false, computation } as any))
            globalCells.push({
                cell: `${source.key}/${agg.name}`, dictName,
                sourceName: source.sourceName, isRelation: source.isRelation,
                basePredicate: source.basePredicate, baseName: source.baseName,
                naive,
            })
        } catch (error) {
            declarationErrors.push(`${source.key}/${agg.name}: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    // property 级：1..3 个 (关系一侧 × 聚合)，宿主属性由计算维护
    const roleMenu = schema.relationChoices.flatMap(choice => {
        const roles = [{ host: choice.source, relationProperty: choice.sourceProperty, choice }]
        if (!choice.symmetric) roles.push({ host: choice.target, relationProperty: choice.targetProperty, choice })
        return roles
    })
    const propertyCount = 1 + int(rng, 3)
    for (let i = 0; i < propertyCount && roleMenu.length; i++) {
        const role = pick(rng, roleMenu)
        const agg = pick(rng, AGG_MENU)
        const hasWeight = role.choice.linkProps.includes('weight')
        const propertyName = `fzp${i}_${agg.name}`
        // property 级读的是关联**实体**行（score 恒在），weighted 额外读 & weight
        const naive: PropertyCell['naive'] = agg.name === 'weighted'
            ? (rows) => rows.reduce((acc, r) => acc + (hasWeight ? weightOf(r) : 2) * scoreOf(r), 0)
            : (rows, empty) => agg.truthOverRows(rows, 'score', empty)
        try {
            const computation = agg.createForProperty(role.relationProperty, hasWeight)
            const hostEntity = schema.entities.find(e => e.name === role.host)!
            hostEntity.properties.push(Property.create({ name: propertyName, type: agg.valueType, computation } as any))
            propertyCells.push({
                cell: `${role.host}.${role.relationProperty}/${agg.name}`,
                hostEntity: role.host, propertyName,
                relationProperty: role.relationProperty, hasWeight,
                naive,
            })
        } catch (error) {
            declarationErrors.push(`${role.host}.${role.relationProperty}/${agg.name}: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
    return { dictionaries, globalCells, propertyCells, declarationErrors }
}

// property 级空集约定（框架语义，与 symmetricAggregationMatrix 的断言一致）：
// count/sum/weighted/avg → 0；every(notEmpty:true) → false；any → false
const PROPERTY_EMPTY: Record<string, unknown> = {
    count: 0, countCb: 0, sum: 0, avg: 0, weighted: 0, every: false, any: false,
}

const near = (a: unknown, b: unknown) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9
    return a === b
}

// ---------- runner ----------
async function runComputationFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    // filtered entity 进入生成域（聚合源可以是视图）；merged 不进（EXT-1 收口前，见 fuzzSchema 注释）
    const schema = genSchema(rng, `C${seed}_`, { includeFiltered: true })
    const { dictionaries, globalCells, propertyCells, declarationErrors } = genComputationCells(rng, schema)

    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    let controller: Controller
    try {
        controller = new Controller({
            system,
            entities: schema.entities as any,
            relations: schema.relations as any,
            dict: dictionaries as any,
        })
        await controller.setup(true)
    } catch (error) {
        // 声明期拒绝：合法 fail-fast（如 mergeLinks 冲突、计算源不支持某拓扑的显式错误）
        if (error instanceof Error && /must|cannot|not supported|already|conflict/i.test(error.message)) {
            await system.destroy()
            return { seed, executed: 0, declarationRejected: true }
        }
        throw new Error(`[comp-fuzz seed=${seed}] setup threw an UNEXPECTED error: ${error instanceof Error ? error.message : String(error)}\n` +
            `cells: ${JSON.stringify([...globalCells.map(c => c.cell), ...propertyCells.map(c => c.cell)])}`)
    }
    const storage = system.storage

    // 空集约定：setup 后全局 dict 的初始值就是该声明的空集语义
    const globalEmpty: Record<string, unknown> = {}
    for (const cell of globalCells) {
        globalEmpty[cell.cell] = await storage.dict.get(cell.dictName)
    }

    const opLog: { step: number, op: string, detail: unknown, outcome: string }[] = []
    let executed = 0

    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-6)
        const cellDump = JSON.stringify([...globalCells.map(c => c.cell), ...propertyCells.map(c => c.cell)])
        throw new Error(`[comp-fuzz seed=${seed}] ${message}\ncells: ${cellDump}\n` +
            `declaration rejections: ${JSON.stringify(declarationErrors)}\n` +
            `op log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    const assertAllCells = async (context: string) => {
        // 全局格：值 = 朴素重算(源全集)
        for (const cell of globalCells) {
            const actual = await storage.dict.get(cell.dictName)
            let rows: Row[]
            if (cell.isRelation) {
                rows = await storage.findRelationByName(cell.sourceName, undefined, undefined,
                    ['*', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]) as Row[]
            } else if (cell.basePredicate && cell.baseName) {
                // filtered 源的真值独立于被测查询编译：从 base 全集 + 声明谓词重算
                const baseRows = await storage.find(cell.baseName, undefined, undefined, ['*']) as Row[]
                rows = baseRows.filter(cell.basePredicate)
            } else {
                rows = await storage.find(cell.sourceName, undefined, undefined, ['*']) as Row[]
            }
            const expected = cell.naive(rows, globalEmpty[cell.cell])
            if (!near(actual, expected)) {
                failWith(`${context}: global cell ${cell.cell} (dict ${cell.dictName}) diverges from naive recompute — expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`)
            }
        }
        // property 格：每个宿主的值 = 朴素重算(该宿主的关联行)
        for (const cell of propertyCells) {
            const hosts = await storage.find(cell.hostEntity, undefined, undefined,
                ['id', cell.propertyName,
                    [cell.relationProperty, { attributeQuery: ['id', 'score', ...(cell.hasWeight ? [['&', { attributeQuery: ['weight'] }]] as any[] : [])] }]]) as Row[]
            for (const host of hosts) {
                const related = host[cell.relationProperty]
                const relatedRows = (Array.isArray(related) ? related : (related ? [related] : [])) as Row[]
                const expected = cell.naive(relatedRows, PROPERTY_EMPTY[cell.cell.split('/')[1]])
                const actual = host[cell.propertyName]
                if (!near(actual, expected)) {
                    failWith(`${context}: property cell ${cell.cell} on ${cell.hostEntity}#${host.id} diverges from naive recompute — ` +
                        `expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)} (related: ${JSON.stringify(relatedRows)})`)
                }
            }
        }
    }

    await assertAllCells('after setup')

    const pools: IdPools = new Map(schema.entityNames.map(n => [n, []]))
    for (let step = 0; step < opsCount; step++) {
        for (const entityName of schema.entityNames) {
            const rows = await storage.find(entityName, undefined, undefined, ['id'])
            pools.set(entityName, rows.map((r: Row) => r.id))
        }
        // 前置条件不足（池空）时重抽几次：计算层 fuzz 的价值在「写序列触发增量维护」，
        // 空跑步浪费格子（重抽只消耗 rng，决策流仍由种子完全决定）
        let intent: FuzzOpIntent = null
        for (let attempt = 0; attempt < 8 && !intent; attempt++) {
            intent = await decideNextOp(rng, schema, pools,
                async (relationName) => (await storage.findRelationByName(relationName, undefined, undefined, ['id'])).map((r: Row) => r.id))
        }
        if (!intent) continue

        let threw: Error | null = null
        try {
            await executeOpIntent(storage, intent, [])
        } catch (error) {
            threw = error instanceof Error ? error : new Error(String(error))
        }
        if (threw) {
            opLog.push({ step, op: intent.op, detail: intent, outcome: `rejected: ${threw.message.slice(0, 120)}` })
            if (!isExpectedRejection(threw)) {
                failWith(`step ${step} ${intent.op} threw an UNEXPECTED error: ${threw.message}\ndetail: ${JSON.stringify(intent)}`)
            }
        } else {
            opLog.push({ step, op: intent.op, detail: intent, outcome: 'ok' })
            executed++
        }
        await assertAllCells(`step ${step} ${intent.op}(${threw ? 'rejected' : 'ok'})`)
    }

    // 覆盖度自检就地报告（带操作日志——全拒绝的空跑必须可诊断）
    if (executed === 0 && opsCount > 0) {
        failWith(`executed no ops (over-rejection? pools never filled?)`)
    }
    await system.destroy()
    return { seed, executed, declarationRejected: false }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_COMP_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_COMP_SEED_COUNT ?? 6)
const OPS = Number(process.env.FUZZ_COMP_OPS ?? 20)

describe('computation-layer generative fuzz (random aggregate declarations × random write sequences vs naive recompute)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: every declared aggregation equals naive recompute after every op', async (seed) => {
        const result = await runComputationFuzzCase(seed, OPS)
        if (!result.declarationRejected) {
            expect(result.executed, `comp seed ${seed} executed no ops`).toBeGreaterThan(0)
        }
    }, 300000)
})
