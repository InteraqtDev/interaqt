/**
 * 迁移生成式测试（r29，quality-plan §1.3 第 3 步）。
 *
 * 动机：migration.spec 的 90 个手工用例各覆盖一个决策路径，但「随机 v1 schema × 随机
 * 存量数据 × 随机加法变异 × migrate」的组合空间从未被机器探索——迁移引擎的正确性
 * 契约（存量数据保真、默认值回填、新计算回填、恢复幂等）是全局性质，正适合预言机判定。
 *
 * 机制（单条 rng 决策流，种子完全决定）：
 * - v1 schema：3 实体（label/score+default） × 2..3 关系（n:n / n:1 / 1:1，含 link 属性）——
 *   全部声明携带**稳定 uuid**（迁移按 uuid 对齐两版声明）；
 * - 存量数据：共享操作决策器直写 10..15 步（创建/更新/嵌套/关系增删全形态）；
 * - v2 = v1 + 1..3 个加法变异（菜单：加默认值属性 / 加实体 / 加 n:n 关系 /
 *   加全局 Count dict / 加 property 级 Count）；
 * - migrate：经 generateMigrationDiff → 全决策批准 → migrate（真实两步审查流）。
 *
 * 预言机：
 *  1. 存量保真：迁移前后 v1 逻辑快照逐字段相等（id、值字段、关系端点）；
 *  2. 默认值回填：加属性变异后，存量行的新列 = defaultValue()（migration.spec 固化的契约）；
 *  3. 新计算回填：加计算变异后，计算值 = 朴素全量重算（独立 JS 真值）；
 *  4. 迁移后可写：每个实体（含新增）创建冒烟写 + 计算联动断言；
 *  5. kill-resume（偶数种子）：首次 migrate 注入一次故障（第 N 次 DB 调用抛错）→
 *     重跑 migrate 必须成功收敛，且 1-4 全部成立（恢复幂等契约）。
 *
 * 再现：FUZZ_MIG_SEED_START / FUZZ_MIG_SEED_COUNT / FUZZ_MIG_OPS；FUZZ_VERBOSE=1。
 */
import { describe, expect, test } from "vitest";
import { Controller, Count, Dictionary, Entity, KlassByName, MonoSystem, Property, Relation } from 'interaqt';
import type { Database } from '@runtime';
import { PGLiteDB } from '@drivers';
import { mulberry32, chance, int, pick, isExpectedRejection, type Rng } from "../storage/helpers/fuzzSchema.js";
import { decideNextOp, executeOpIntent, type FuzzOpIntent, type IdPools } from "../storage/helpers/fuzzOps.js";
import type { FuzzSchema, RelationChoice } from "../storage/helpers/fuzzSchema.js";
import { snapshotLogicalState, type EventCompletenessSchema, type LogicalSnapshot } from "../storage/helpers/eventCompleteness.js";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";
import { createFaultInjectedDb } from "./helpers/faultInjection.js";

type Row = Record<string, unknown>

// ---------- 版本对生成（共享 uuid） ----------
type MutationDescriptor =
    | { kind: 'addProperty', entityName: string, propertyName: string, defaultValue: number }
    | { kind: 'addEntity', entityName: string }
    | { kind: 'addRelation', relationName: string, source: string, target: string, sourceProperty: string, targetProperty: string }
    | { kind: 'addGlobalCount', dictName: string, sourceEntity: string }
    | { kind: 'addPropertyCount', hostEntity: string, propertyName: string, relationProperty: string }

type VersionedDecls = {
    entities: unknown[]
    relations: unknown[]
    dictionaries: unknown[]
}

function genMigrationPair(rng: Rng, tag: string): {
    v1: VersionedDecls, v2: VersionedDecls,
    v1View: FuzzSchema, mutations: MutationDescriptor[],
} {
    const entityNames = ['A', 'B', 'C'].map(n => `Mg${tag}${n}`)
    const relTypeMenu = ['n:n', 'n:1', '1:1'] as const

    // 关系决策先抽好（两版共享同一决策）
    const relationCount = 2 + int(rng, 2)
    const relationDecisions: Array<{ relType: '1:1' | 'n:1' | 'n:n', source: string, target: string, hasWeight: boolean, index: number }> = []
    for (let i = 0; i < relationCount; i++) {
        const relType = pick(rng, relTypeMenu as unknown as Array<'1:1' | 'n:1' | 'n:n'>)
        const source = pick(rng, entityNames)
        let target = pick(rng, entityNames)
        if (target === source) target = entityNames[(entityNames.indexOf(source) + 1) % entityNames.length]
        relationDecisions.push({ relType, source, target, hasWeight: chance(rng, 0.5), index: i })
    }
    // 变异决策也先抽好
    const mutationCount = 1 + int(rng, 3)
    const mutationKinds: MutationDescriptor['kind'][] = []
    for (let i = 0; i < mutationCount; i++) {
        mutationKinds.push(pick(rng, ['addProperty', 'addEntity', 'addRelation', 'addGlobalCount', 'addPropertyCount'] as const))
    }
    const mutationTargets = mutationKinds.map(() => ({ entityPick: rng(), relationPick: rng() }))

    // 同一决策构造一版声明（uuid 稳定 ⇒ 两次调用产出可对齐的两套实例）
    const build = (version: 1 | 2): { decls: VersionedDecls, v1View?: FuzzSchema, mutations: MutationDescriptor[] } => {
        const entityByName = new Map<string, InstanceType<typeof Entity>>()
        const valueProps = new Map<string, { name: string, type: 'string' | 'number' }[]>()
        for (const name of entityNames) {
            const entity = new Entity({
                name,
                properties: [
                    new Property({ name: 'label', type: 'string' }, { uuid: `${tag}-${name}-label` }),
                    new Property({ name: 'score', type: 'number', defaultValue: () => 7 }, { uuid: `${tag}-${name}-score` }),
                ],
            }, { uuid: `${tag}-${name}` })
            entityByName.set(name, entity)
            valueProps.set(name, [{ name: 'label', type: 'string' }, { name: 'score', type: 'number' }])
        }
        const relations: unknown[] = []
        const relationChoices: RelationChoice[] = []
        for (const decision of relationDecisions) {
            const sourceProperty = `out${decision.index}`, targetProperty = `in${decision.index}`
            const linkProps = decision.hasWeight ? ['weight'] : []
            const relation = new Relation({
                source: entityByName.get(decision.source)!,
                sourceProperty,
                target: entityByName.get(decision.target)!,
                targetProperty,
                type: decision.relType,
                properties: decision.hasWeight
                    ? [new Property({ name: 'weight', type: 'number', defaultValue: () => 1 }, { uuid: `${tag}-rel${decision.index}-weight` })]
                    : [],
            } as any, { uuid: `${tag}-rel${decision.index}` })
            relations.push(relation)
            relationChoices.push({
                relation: relation as any, relType: decision.relType,
                source: decision.source, target: decision.target,
                sourceProperty, targetProperty, symmetric: false, linkProps,
            })
        }

        const dictionaries: unknown[] = []
        const mutations: MutationDescriptor[] = []
        if (version === 2) {
            for (let i = 0; i < mutationKinds.length; i++) {
                const kind = mutationKinds[i]
                const entityName = entityNames[Math.floor(mutationTargets[i].entityPick * entityNames.length)]
                const relationChoice = relationChoices[Math.floor(mutationTargets[i].relationPick * relationChoices.length)]
                if (kind === 'addProperty') {
                    const propertyName = `extra${i}`
                    entityByName.get(entityName)!.properties.push(
                        new Property({ name: propertyName, type: 'number', defaultValue: () => 5 }, { uuid: `${tag}-mut${i}-prop` }))
                    mutations.push({ kind, entityName, propertyName, defaultValue: 5 })
                } else if (kind === 'addEntity') {
                    const newName = `Mg${tag}N${i}`
                    const entity = new Entity({
                        name: newName,
                        properties: [
                            new Property({ name: 'label', type: 'string' }, { uuid: `${tag}-mut${i}-label` }),
                            new Property({ name: 'score', type: 'number', defaultValue: () => 7 }, { uuid: `${tag}-mut${i}-score` }),
                        ],
                    }, { uuid: `${tag}-mut${i}-entity` })
                    entityByName.set(newName, entity)
                    mutations.push({ kind, entityName: newName })
                } else if (kind === 'addRelation') {
                    const source = entityName
                    const target = entityNames[(entityNames.indexOf(source) + 1) % entityNames.length]
                    const sourceProperty = `mout${i}`, targetProperty = `min${i}`
                    const relation = new Relation({
                        source: entityByName.get(source)!, sourceProperty,
                        target: entityByName.get(target)!, targetProperty,
                        type: 'n:n', properties: [],
                    } as any, { uuid: `${tag}-mut${i}-rel` })
                    relations.push(relation)
                    mutations.push({ kind, relationName: (relation as { name?: string }).name!, source, target, sourceProperty, targetProperty })
                } else if (kind === 'addGlobalCount') {
                    const dictName = `mg_${tag}_cnt${i}`
                    dictionaries.push(Dictionary.create({
                        name: dictName, type: 'number', collection: false,
                        computation: Count.create({ record: entityByName.get(entityName)!, attributeQuery: [], callback: () => true } as any),
                    } as any))
                    mutations.push({ kind, dictName, sourceEntity: entityName })
                } else {
                    const propertyName = `mcnt${i}`
                    entityByName.get(relationChoice.source)!.properties.push(
                        new Property({
                            name: propertyName, type: 'number',
                            computation: Count.create({ property: relationChoice.sourceProperty } as any),
                        } as any, { uuid: `${tag}-mut${i}-pcnt` }))
                    mutations.push({ kind, hostEntity: relationChoice.source, propertyName, relationProperty: relationChoice.sourceProperty })
                }
            }
        }

        const v1View: FuzzSchema = {
            entities: [...entityByName.values()] as any,
            relations: relations as any,
            mergeLinks: [],
            entityNames,
            relationChoices,
            valueProps,
            filteredEntities: [],
            filteredRelations: [],
            mergedEntities: [],
        }
        return { decls: { entities: [...entityByName.values()], relations, dictionaries }, v1View, mutations }
    }

    // CAUTION 两次 build 消耗 rng 的方式必须一致（决策已提前抽好，build 内不再抽签）
    const v1Build = build(1)
    const v2Build = build(2)
    return { v1: v1Build.decls, v2: v2Build.decls, v1View: v1Build.v1View!, mutations: v2Build.mutations }
}

// ---------- runner ----------
async function runMigrationFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const tag = `S${seed}`
    const { v1, v2, v1View, mutations } = genMigrationPair(rng, tag)
    const injectFault = seed % 2 === 0 // 偶数种子注入 kill-resume

    const rawDb = new PGLiteDB()
    const db = createFaultInjectedDb(rawDb as unknown as Database, 5 + int(rng, 40))

    const failWith = (message: string): never => {
        throw new Error(`[mig-fuzz seed=${seed}${injectFault ? ' kill-resume' : ''}] ${message}\n` +
            `mutations: ${JSON.stringify(mutations)}\n` +
            `relations: ${JSON.stringify(v1View.relationChoices.map(c => ({ name: c.relation.name, relType: c.relType, source: c.source, target: c.target })))}`)
    }

    // ---- v1：setup + 存量数据 ----
    const systemV1 = new MonoSystem(db as any)
    systemV1.conceptClass = KlassByName
    const controllerV1 = new Controller({ system: systemV1, entities: v1.entities as any, relations: v1.relations as any })
    await controllerV1.setup(true)
    const storageV1 = systemV1.storage

    const pools: IdPools = new Map(v1View.entityNames.map(n => [n, []]))
    let executed = 0
    for (let step = 0; step < opsCount; step++) {
        for (const entityName of v1View.entityNames) {
            const rows = await storageV1.find(entityName, undefined, undefined, ['id'])
            pools.set(entityName, rows.map((r: Row) => r.id))
        }
        let intent: FuzzOpIntent = null
        for (let attempt = 0; attempt < 8 && !intent; attempt++) {
            intent = await decideNextOp(rng, v1View, pools,
                async (relationName) => (await storageV1.findRelationByName(relationName, undefined, undefined, ['id'])).map((r: Row) => r.id))
        }
        if (!intent) continue
        try {
            await executeOpIntent(storageV1, intent, [])
            executed++
        } catch (error) {
            const rejection = error instanceof Error ? error : new Error(String(error))
            if (!isExpectedRejection(rejection)) {
                failWith(`v1 data op ${intent.op} threw an UNEXPECTED error: ${rejection.message}\ndetail: ${JSON.stringify(intent)}`)
            }
        }
    }
    if (executed === 0) failWith('v1 phase executed no data ops')

    // ---- 迁移前快照（v1 声明面） ----
    const eventSchema: EventCompletenessSchema = {
        entities: v1View.entityNames,
        relations: v1View.relationChoices.map(c => c.relation.name!),
    }
    const beforeSnapshot = await snapshotLogicalState(storageV1, eventSchema)

    // ---- v2：migrate（偶数种子首跑注入故障，第二跑必须收敛） ----
    const makeV2Controller = () => {
        const systemV2 = new MonoSystem(db as any)
        systemV2.conceptClass = KlassByName
        return new Controller({
            system: systemV2,
            entities: v2.entities as any,
            relations: v2.relations as any,
            dict: v2.dictionaries as any,
        })
    }
    let controllerV2 = makeV2Controller()
    if (injectFault) {
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2)
        ;(db as { arm: () => void }).arm()
        let firstRunFailed = false
        try {
            await controllerV2.migrate({ approvedDiff })
        } catch (error) {
            firstRunFailed = true
        }
        if (process.env.FUZZ_MIG_DEBUG) console.log(`[mig-fuzz seed=${seed}] first migrate ${firstRunFailed ? 'CRASHED (injected)' : 'completed before fault point'}`)
        if (firstRunFailed) {
            // 崩溃后从头恢复：新 controller、重新生成/批准 diff（真实恢复路径）
            controllerV2 = makeV2Controller()
            try {
                const resumeDiff = await approveGeneratedMigrationDiff(controllerV2)
                await controllerV2.migrate({ approvedDiff: resumeDiff })
            } catch (error) {
                failWith(`kill-resume: second migrate failed to converge: ${error instanceof Error ? error.message : String(error)}`)
            }
        }
        // 故障点可能在 migrate 完成后才触到（调用数超过全程调用量）——两种情况都必须收敛到相同终态
    } else {
        try {
            const approvedDiff = await approveGeneratedMigrationDiff(controllerV2)
            await controllerV2.migrate({ approvedDiff })
        } catch (error) {
            failWith(`migrate threw: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
    const storageV2 = controllerV2.system.storage

    // ---- 预言机 1：存量保真 ----
    const afterSnapshot = await snapshotLogicalState(storageV2, eventSchema)
    for (const [recordName, beforeRows] of beforeSnapshot) {
        const afterRows = afterSnapshot.get(recordName)!
        const beforeIds = [...beforeRows.keys()].sort(), afterIds = [...afterRows.keys()].sort()
        if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
            failWith(`data fidelity: ${recordName} id sets diverge after migration\nbefore: ${JSON.stringify(beforeIds)}\nafter: ${JSON.stringify(afterIds)}`)
        }
        for (const [id, beforeRow] of beforeRows) {
            const afterRow = afterRows.get(id)!
            for (const [field, beforeValue] of Object.entries(beforeRow)) {
                const afterValue = afterRow[field]
                if (JSON.stringify(beforeValue ?? null) !== JSON.stringify(afterValue ?? null)) {
                    failWith(`data fidelity: ${recordName}#${id} field "${field}" changed across migration ` +
                        `(${JSON.stringify(beforeValue)} -> ${JSON.stringify(afterValue)})`)
                }
            }
        }
    }

    // ---- 预言机 2/3：默认值回填 + 新计算回填 = 朴素重算 ----
    for (const mutation of mutations) {
        if (mutation.kind === 'addProperty') {
            const rows = await storageV2.find(mutation.entityName, undefined, undefined, ['id', mutation.propertyName]) as Row[]
            for (const row of rows) {
                if (row[mutation.propertyName] !== mutation.defaultValue) {
                    failWith(`default backfill: ${mutation.entityName}#${row.id}.${mutation.propertyName} = ${JSON.stringify(row[mutation.propertyName])}, expected ${mutation.defaultValue}`)
                }
            }
        } else if (mutation.kind === 'addGlobalCount') {
            const actual = await storageV2.dict.get(mutation.dictName)
            const rows = await storageV2.find(mutation.sourceEntity, undefined, undefined, ['id']) as Row[]
            if (actual !== rows.length) {
                failWith(`computation backfill: dict ${mutation.dictName} = ${JSON.stringify(actual)}, naive recompute = ${rows.length}`)
            }
        } else if (mutation.kind === 'addPropertyCount') {
            const hosts = await storageV2.find(mutation.hostEntity, undefined, undefined,
                ['id', mutation.propertyName, [mutation.relationProperty, { attributeQuery: ['id'] }]]) as Row[]
            for (const host of hosts) {
                const related = host[mutation.relationProperty]
                const count = Array.isArray(related) ? related.length : (related ? 1 : 0)
                if (host[mutation.propertyName] !== count) {
                    failWith(`computation backfill: ${mutation.hostEntity}#${host.id}.${mutation.propertyName} = ${JSON.stringify(host[mutation.propertyName])}, naive recompute = ${count}`)
                }
            }
        } else if (mutation.kind === 'addEntity') {
            const rows = await storageV2.find(mutation.entityName, undefined, undefined, ['id']) as Row[]
            if (rows.length !== 0) failWith(`new entity ${mutation.entityName} must start empty, has ${rows.length} rows`)
        } else {
            const links = await storageV2.findRelationByName(mutation.relationName, undefined, undefined, ['id']) as Row[]
            if (links.length !== 0) failWith(`new relation ${mutation.relationName} must start empty, has ${links.length} links`)
        }
    }

    // ---- 预言机 4：迁移后可写（冒烟）----
    const newEntityNames = mutations.filter(m => m.kind === 'addEntity').map(m => m.entityName)
    for (const entityName of [...v1View.entityNames, ...newEntityNames]) {
        const created = await storageV2.create(entityName, { label: 'post-migration' }) as Row
        const found = await storageV2.findOne(entityName, undefined, undefined, ['id', 'label', 'score']) as Row | undefined
        if (!created?.id || !found) failWith(`post-migration write on ${entityName} failed`)
    }
    for (const mutation of mutations) {
        if (mutation.kind === 'addGlobalCount') {
            const actual = await storageV2.dict.get(mutation.dictName)
            const rows = await storageV2.find(mutation.sourceEntity, undefined, undefined, ['id']) as Row[]
            if (actual !== rows.length) {
                failWith(`post-migration incremental: dict ${mutation.dictName} = ${JSON.stringify(actual)}, naive = ${rows.length} (new computation not wired into incremental maintenance)`)
            }
        }
    }

    await (controllerV2.system as MonoSystem).destroy()
    return { seed, executed }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_MIG_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_MIG_SEED_COUNT ?? 6)
const OPS = Number(process.env.FUZZ_MIG_OPS ?? 12)

describe('migration generative fuzz (random schema pair + data -> migrate vs full-recompute oracles, incl. kill-resume)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: migration preserves data, backfills defaults/computations, survives injected crash', async (seed) => {
        const result = await runMigrationFuzzCase(seed, OPS)
        expect(result.executed).toBeGreaterThan(0)
    }, 300000)
})

describe('deterministic regressions from migration-fuzz findings (r29)', () => {
    test('adding a property-level Count over a to-one relation backfills via full recompute (seed 3)', async () => {
        // 聚合模板的全量 compute 曾裸 for...of 宿主的关系属性——x:1 关系查询返回对象而非
        // 数组，迁移回填（runFullRecompute）当场 TypeError。运行期增量路径从不带着已填充的
        // to-one 走全量 compute，所以 60 个计算层 fuzz 种子全绿、只有迁移轨现形。
        const db = new PGLiteDB()
        const mk = (version: 1 | 2) => {
            const A = new Entity({
                name: 'MigToOneA', properties: [
                    new Property({ name: 'label', type: 'string' }, { uuid: 'mig-toone-a-label' }),
                    ...(version === 2 ? [new Property({
                        name: 'outCount', type: 'number',
                        computation: Count.create({ property: 'out' } as any),
                    } as any, { uuid: 'mig-toone-a-cnt' })] : []),
                ]
            }, { uuid: 'mig-toone-a' })
            const B = new Entity({
                name: 'MigToOneB',
                properties: [new Property({ name: 'label', type: 'string' }, { uuid: 'mig-toone-b-label' })]
            }, { uuid: 'mig-toone-b' })
            const rel = new Relation({
                source: A, sourceProperty: 'out', target: B, targetProperty: 'in', type: 'n:1', properties: [],
            } as any, { uuid: 'mig-toone-rel' })
            return { A, B, rel }
        }
        const v1 = mk(1)
        const systemV1 = new MonoSystem(db)
        systemV1.conceptClass = KlassByName
        const controllerV1 = new Controller({ system: systemV1, entities: [v1.A, v1.B] as any, relations: [v1.rel] as any })
        await controllerV1.setup(true)
        const b1 = await systemV1.storage.create('MigToOneB', { label: 'b1' })
        await systemV1.storage.create('MigToOneA', { label: 'a-linked', out: { id: b1.id } })
        await systemV1.storage.create('MigToOneA', { label: 'a-lone' })

        const v2 = mk(2)
        const systemV2 = new MonoSystem(db)
        systemV2.conceptClass = KlassByName
        const controllerV2 = new Controller({ system: systemV2, entities: [v2.A, v2.B] as any, relations: [v2.rel] as any })
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2)
        await controllerV2.migrate({ approvedDiff })

        const rows = await systemV2.storage.find('MigToOneA', undefined, undefined, ['label', 'outCount']) as Row[]
        const byLabel = new Map(rows.map(r => [r.label, r.outCount]))
        expect(byLabel.get('a-linked')).toBe(1)
        expect(byLabel.get('a-lone')).toBe(0)
        await systemV2.destroy()
    }, 60000)
})
