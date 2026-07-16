/**
 * 迁移破坏性变异生成式测试（quality-plan §1.3 第 3 步剩余扩张点：破坏性变异
 * （destructive-scope 决策轨）+ 计算**变更**（非新增）轨；r30-E / r32 级联感知
 * destructive scope 机制的生成式覆盖）。
 *
 * 动机：migrationGenerativeFuzz 只探索加法变异；破坏性轨（Transform 输出收缩、
 * `_isDeleted_` 硬删除、空 fact 表退役、计算变更 changed/unchanged 决策、被拒绝的
 * 非空删除/类型变更）此前只有逐格手写用例。本 fuzzer 把「随机存量数据 × 一个破坏性
 * 变异 × 审批决策 × kill-resume」放进生成域：
 *
 * - v1 schema 固定拓扑（A/B 实体 + n:n 关系 + 数据驱动 Transform 派生实体 + 两个
 *   全局 Count），存量数据由共享操作决策器随机产生 + 确定性插入保证变异命中面非空
 *   （'gone' 标签、阈值两侧的 score）；
 * - 变异菜单（每种子恰好一个）：
 *   1. transformShrink：Transform 阈值 0→50（changed 决策 + 自动 destructive-scope）；
 *   2. hardDeletion：v2 给 B 加 `_isDeleted_`（Custom label==='gone'）——级联感知
 *      scope 批准 + link 级联 + 下游 Count 重算；
 *   3. removeEmptyEntity：退役空独占表（empty-fact-record-removal 决策 → DROP）；
 *   4. countChange：Count 加 callback 过滤（changed / unchanged 两个决策分支——
 *      changed = 按新声明重算；unchanged = 冻结旧值、增量继续走新代码）；
 *   5. blockedRemoveNonEmptyEntity：删除非空实体+关系——必须整体拒绝且数据无损；
 *   6. blockedTypeChange：值属性 string→number——必须整体拒绝且数据无损；
 *   7. computationTypeChange（r34）：cntA 的计算种类 Count→Summation（manifest id 变化
 *      = removed+added 双决策）——值 = 新声明朴素重算，增量走新代码；
 *   8. takeover（r34）：A.tag 从存量事实属性→computed（computation-takeover 决策，
 *      discard-and-rebuild）——旧手工值全部废弃、按新计算重算，迁移后新建行同样计算。
 * - kill-resume（偶数种子 × 非阻塞变异）：首跑注入 DB 调用故障 → 从头重新
 *   生成/批准/迁移必须收敛到同一终态（SERIALIZABLE 回滚保证无半迁移状态）。
 * - 预言机：无关面存量保真（逐字段快照对账）+ 变异特定终态（朴素重算对照）+
 *   迁移后可写冒烟（增量维护接线）。
 *
 * 再现：FUZZ_MIGD_SEED_START / FUZZ_MIGD_SEED_COUNT / FUZZ_MIGD_OPS；FUZZ_VERBOSE=1。
 */
import { describe, expect, test } from "vitest";
import { Controller, Count, Custom, Dictionary, Entity, KlassByName, MonoSystem, Property, Relation, Summation, Transform } from 'interaqt';
import { MatchExp } from '@storage';
import type { Database } from '@runtime';
import { PGLiteDB } from '@drivers';
import { mulberry32, chance, int, pick, isExpectedRejection, type Rng } from "../storage/helpers/fuzzSchema.js";
import type { FuzzSchema, RelationChoice } from "../storage/helpers/fuzzSchema.js";
import { decideNextOp, executeOpIntent, type FuzzOpIntent, type IdPools } from "../storage/helpers/fuzzOps.js";
import { isComputationInternalField, snapshotLogicalState, type EventCompletenessSchema } from "../storage/helpers/eventCompleteness.js";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";
import { createFaultInjectedDb } from "./helpers/faultInjection.js";

type Row = Record<string, unknown>

type DestructiveMutation =
    | { kind: 'transformShrink' }
    | { kind: 'hardDeletion' }
    | { kind: 'removeEmptyEntity' }
    | { kind: 'countChange', decision: 'changed' | 'unchanged' }
    | { kind: 'blockedRemoveNonEmptyEntity' }
    | { kind: 'blockedTypeChange' }
    | { kind: 'computationTypeChange' }
    | { kind: 'takeover' }

const MUTATION_MENU: DestructiveMutation['kind'][] = [
    'transformShrink', 'hardDeletion', 'removeEmptyEntity', 'countChange',
    'blockedRemoveNonEmptyEntity', 'blockedTypeChange',
    'computationTypeChange', 'takeover',
]

// CAUTION 两版共用代码路径的回调必须字面量相同（函数哈希参与 changed 判定），
//  版本差异只能来自「选不同的字面量」，不能来自闭包变量。
const TRANSFORM_CALLBACK_V1 = function (row: Row) { return (row.score as number) > 0 ? { tag: `d:${row.label}` } : null }
const TRANSFORM_CALLBACK_V2 = function (row: Row) { return (row.score as number) > 50 ? { tag: `d:${row.label}` } : null }
const COUNT_CALLBACK_V2 = function (row: Row) { return (row.score as number) > 50 }

function buildVersion(tag: string, version: 1 | 2, mutation: DestructiveMutation) {
    const uuid = (suffix: string) => `migd-${tag}-${suffix}`
    const mkValueProps = (entity: string, labelType: 'string' | 'number') => [
        new Property({ name: 'label', type: labelType }, { uuid: uuid(`${entity}-label`) }),
        new Property({ name: 'score', type: 'number', defaultValue: () => 7 }, { uuid: uuid(`${entity}-score`) }),
    ]
    const aProps = mkValueProps('a', 'string')
    if (mutation.kind === 'takeover') {
        aProps.push(version === 1
            ? new Property({ name: 'tag', type: 'string' }, { uuid: uuid('a-tag') })
            : new Property({
                name: 'tag', type: 'string',
                computation: new Custom({
                    name: `MigD${tag}TagComputed`,
                    dataDeps: { current: { type: 'property', attributeQuery: ['label'] } },
                    compute: async (_deps: unknown, record: Row) => `t:${record.label}`,
                }, { uuid: uuid('a-tag-computation') }),
            }, { uuid: uuid('a-tag') }))
    }
    const A = new Entity({ name: `MigD${tag}A`, properties: aProps }, { uuid: uuid('a') })
    const bLabelType = mutation.kind === 'blockedTypeChange' && version === 2 ? 'number' : 'string'
    const bProps = mkValueProps('b', bLabelType as 'string')
    if (mutation.kind === 'hardDeletion' && version === 2) {
        bProps.push(new Property({
            name: '_isDeleted_', type: 'boolean',
            computation: new Custom({
                name: `MigD${tag}GoneFlag`,
                dataDeps: { current: { type: 'property', attributeQuery: ['label'] } },
                compute: async (_deps: unknown, record: Row) => record.label === 'gone',
            }, { uuid: uuid('gone-flag-computation') }),
        }, { uuid: uuid('b-isdeleted') }))
    }
    const B = new Entity({ name: `MigD${tag}B`, properties: bProps }, { uuid: uuid('b') })

    const removeB = mutation.kind === 'blockedRemoveNonEmptyEntity' && version === 2
    const relation = removeB ? null : new Relation({
        source: A, sourceProperty: 'out0', target: B, targetProperty: 'in0', type: 'n:n', properties: [],
    } as any, { uuid: uuid('rel') })

    const transformCallback = mutation.kind === 'transformShrink' && version === 2 ? TRANSFORM_CALLBACK_V2 : TRANSFORM_CALLBACK_V1
    const Derived = new Entity({
        name: `MigD${tag}Drv`,
        properties: [new Property({ name: 'tag', type: 'string' }, { uuid: uuid('drv-tag') })],
        computation: new Transform({ record: A, attributeQuery: ['label', 'score'], callback: transformCallback } as any, { uuid: uuid('drv-transform') }),
    } as any, { uuid: uuid('drv') })

    const cntA = new Dictionary({
        name: `migd${tag}CntA`, type: 'number', collection: false,
        computation: mutation.kind === 'countChange' && version === 2
            ? new Count({ record: A, attributeQuery: ['score'], callback: COUNT_CALLBACK_V2 } as any, { uuid: uuid('cnta-computation') })
            : mutation.kind === 'computationTypeChange' && version === 2
                ? new Summation({ record: A, attributeQuery: ['score'] } as any, { uuid: uuid('cnta-sum-computation') })
                : new Count({ record: A } as any, { uuid: uuid('cnta-computation') }),
    } as any, { uuid: uuid('cnta') })
    const cntB = removeB ? null : new Dictionary({
        name: `migd${tag}CntB`, type: 'number', collection: false,
        computation: new Count({ record: B } as any, { uuid: uuid('cntb-computation') }),
    } as any, { uuid: uuid('cntb') })

    const entities: unknown[] = [A, Derived]
    if (!removeB) entities.push(B)
    if (mutation.kind === 'removeEmptyEntity' && version === 1) {
        entities.push(new Entity({
            name: `MigD${tag}Retired`,
            properties: [new Property({ name: 'note', type: 'string' }, { uuid: uuid('retired-note') })],
        }, { uuid: uuid('retired') }))
    }
    const dictionaries: unknown[] = [cntA]
    if (cntB) dictionaries.push(cntB)

    return {
        entities, dictionaries,
        relations: relation ? [relation] : [],
        names: {
            A: `MigD${tag}A`, B: `MigD${tag}B`, Derived: `MigD${tag}Drv`,
            Retired: `MigD${tag}Retired`,
            relation: relation ? (relation as { name?: string }).name! : null,
            cntA: `migd${tag}CntA`, cntB: `migd${tag}CntB`,
        },
        A, B, relationChoice: relation ? {
            relation: relation as any, relType: 'n:n' as const,
            source: `MigD${tag}A`, target: `MigD${tag}B`,
            sourceProperty: 'out0', targetProperty: 'in0', symmetric: false, linkProps: [],
        } : null,
    }
}

// ---------- runner ----------
async function runDestructiveMigrationFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const tag = `S${seed}`
    const mutationKind = pick(rng, MUTATION_MENU)
    const mutation: DestructiveMutation = mutationKind === 'countChange'
        ? { kind: 'countChange', decision: chance(rng, 0.5) ? 'changed' : 'unchanged' }
        : { kind: mutationKind } as DestructiveMutation
    const blocked = mutation.kind === 'blockedRemoveNonEmptyEntity' || mutation.kind === 'blockedTypeChange'
    const injectFault = !blocked && seed % 2 === 0

    const v1 = buildVersion(tag, 1, mutation)
    const rawDb = new PGLiteDB()
    const db = createFaultInjectedDb(rawDb as unknown as Database, 5 + int(rng, 60))

    const failWith = (message: string): never => {
        throw new Error(`[migd-fuzz seed=${seed} mutation=${JSON.stringify(mutation)}${injectFault ? ' kill-resume' : ''}] ${message}`)
    }

    // ---- v1：setup + 存量数据 ----
    const systemV1 = new MonoSystem(db as any)
    systemV1.conceptClass = KlassByName
    const controllerV1 = new Controller({
        system: systemV1, entities: v1.entities as any, relations: v1.relations as any, dict: v1.dictionaries as any,
    })
    await controllerV1.setup(true)
    const storageV1 = systemV1.storage

    // 随机存量数据（共享操作决策器，A/B + 关系）
    const v1View: FuzzSchema = {
        entities: [v1.A, v1.B] as any,
        relations: v1.relationChoice ? [v1.relationChoice.relation] : [],
        mergeLinks: [],
        entityNames: [v1.names.A, v1.names.B],
        relationChoices: v1.relationChoice ? [v1.relationChoice as RelationChoice] : [],
        valueProps: new Map([
            [v1.names.A, [
                { name: 'label', type: 'string' }, { name: 'score', type: 'number' },
                // takeover 面：存量数据必须有手工事实值可被废弃（expectedExistingCount > 0）
                ...(mutation.kind === 'takeover' ? [{ name: 'tag', type: 'string' as const }] : []),
            ]],
            [v1.names.B, [{ name: 'label', type: 'string' }, { name: 'score', type: 'number' }]],
        ]),
        filteredEntities: [], filteredRelations: [], mergedEntities: [],
    }
    const pools: IdPools = new Map([[v1.names.A, []], [v1.names.B, []]])
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
    // 确定性覆盖：变异命中面必须非空（'gone' 标签、阈值两侧 score、关系连到 gone 行）
    const bGone = await storageV1.create(v1.names.B, { label: 'gone', score: int(rng, 100) }) as Row
    await storageV1.create(v1.names.B, { label: 'keep', score: int(rng, 100) })
    const aLow = await storageV1.create(v1.names.A, { label: 'low', score: 10, ...(mutation.kind === 'takeover' ? { tag: 'manual-low' } : {}) }) as Row
    await storageV1.create(v1.names.A, { label: 'high', score: 80, ...(mutation.kind === 'takeover' ? { tag: 'manual-high' } : {}) })
    if (v1.relationChoice) {
        try {
            await storageV1.addRelationByNameById(v1.names.relation!, String(aLow.id), String(bGone.id), {})
        } catch (error) {
            const rejection = error instanceof Error ? error : new Error(String(error))
            if (!isExpectedRejection(rejection)) throw rejection
        }
    }
    executed += 4

    // ---- 迁移前快照 ----
    // 计算绑定状态列（如 _cntA_bound_isItemMatch）随计算变更合法重建，不属于存量保真面；
    // takeover 面的 tag 值合法废弃重算，同样豁免（其正确性由变异特定预言机断言）
    const snapshotSchema: EventCompletenessSchema = {
        entities: [v1.names.A, v1.names.B],
        relations: v1.names.relation ? [v1.names.relation] : [],
        ignoreField: (fieldName: string) => isComputationInternalField(fieldName)
            || (mutation.kind === 'takeover' && fieldName === 'tag'),
    }
    const beforeSnapshot = await snapshotLogicalState(storageV1, snapshotSchema)
    const beforeCntA = await storageV1.dict.get(v1.names.cntA)
    const goneBIds = new Set(
        [...beforeSnapshot.get(v1.names.B)!.entries()].filter(([, row]) => row.label === 'gone').map(([id]) => id))

    // ---- v2：migrate ----
    const v2 = buildVersion(tag, 2, mutation)
    const makeV2Controller = () => {
        const systemV2 = new MonoSystem(db as any)
        systemV2.conceptClass = KlassByName
        return new Controller({
            system: systemV2, entities: v2.entities as any, relations: v2.relations as any, dict: v2.dictionaries as any,
        })
    }
    let controllerV2 = makeV2Controller()

    const approve = async (controller: Controller) => {
        const computationDecisions: Record<string, 'changed' | 'unchanged' | 'state-only' | 'unrebuildable'> = {}
        if (mutation.kind === 'countChange' && mutation.decision === 'unchanged') {
            const diff = await controller.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true })
            for (const requirement of diff.requiredDecisions) {
                if (requirement.kind === 'computation' && requirement.dataContext === `global:${v1.names.cntA}`) {
                    computationDecisions[requirement.id] = 'unchanged'
                }
            }
        }
        return approveGeneratedMigrationDiff(controller, { computationDecisions })
    }

    if (blocked) {
        // 阻塞面：diff 必须报告 unsupported-destructive-schema-change，migrate 必须整体拒绝
        const diff = await controllerV2.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true })
        const hasBlocking = diff.safety.blockingChanges.some(change => change.kind === 'unsupported-destructive-schema-change')
        if (!hasBlocking) {
            failWith(`blocked mutation produced NO unsupported-destructive-schema-change blocking entry: ${JSON.stringify(diff.safety.blockingChanges)}`)
        }
        let migrateError: Error | null = null
        try {
            const approvedDiff = await approve(controllerV2)
            await controllerV2.migrate({ approvedDiff })
        } catch (error) {
            migrateError = error instanceof Error ? error : new Error(String(error))
        }
        if (!migrateError) failWith('blocked destructive mutation was silently migrated (fail-open)')
        // 数据无损：v1 声明面重新水合后快照逐字段相等
        const systemProbe = new MonoSystem(db as any)
        systemProbe.conceptClass = KlassByName
        const v1Probe = buildVersion(tag, 1, mutation)
        const controllerProbe = new Controller({
            system: systemProbe, entities: v1Probe.entities as any, relations: v1Probe.relations as any, dict: v1Probe.dictionaries as any,
        })
        await controllerProbe.setup(false)
        const afterSnapshot = await snapshotLogicalState(systemProbe.storage, snapshotSchema)
        assertSnapshotEqual(beforeSnapshot, afterSnapshot, new Set(), new Set(), failWith, 'blocked migration must not touch data')
        await (systemProbe as MonoSystem).destroy()
        return { seed, executed, mutation, blockedRejected: true }
    }

    if (injectFault) {
        const approvedDiff = await approve(controllerV2)
        ;(db as { arm: () => void }).arm()
        let firstRunFailed = false
        try {
            await controllerV2.migrate({ approvedDiff })
        } catch {
            firstRunFailed = true
        }
        if (firstRunFailed) {
            controllerV2 = makeV2Controller()
            try {
                const resumeDiff = await approve(controllerV2)
                await controllerV2.migrate({ approvedDiff: resumeDiff })
            } catch (error) {
                failWith(`kill-resume: second migrate failed to converge: ${error instanceof Error ? error.message : String(error)}`)
            }
        }
    } else {
        try {
            const approvedDiff = await approve(controllerV2)
            await controllerV2.migrate({ approvedDiff })
        } catch (error) {
            failWith(`migrate threw: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
    const storageV2 = controllerV2.system.storage

    // ---- 预言机 1：无关面存量保真 ----
    const afterSnapshot = await snapshotLogicalState(storageV2, snapshotSchema)
    const expectDeletedB = mutation.kind === 'hardDeletion' ? goneBIds : new Set<string>()
    assertSnapshotEqual(beforeSnapshot, afterSnapshot, expectDeletedB, new Set([v1.names.B]), failWith, 'post-migration fidelity')

    // ---- 预言机 2：变异特定终态（朴素重算对照） ----
    const aRows = await storageV2.find(v1.names.A, undefined, undefined, ['id', 'label', 'score']) as Row[]
    if (mutation.kind === 'transformShrink') {
        const derivedRows = await storageV2.find(v1.names.Derived, undefined, undefined, ['tag']) as Row[]
        const actual = derivedRows.map(r => String(r.tag)).sort()
        const expected = aRows.filter(r => (r.score as number) > 50).map(r => `d:${r.label}`).sort()
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failWith(`transformShrink: derived rows diverge from naive recompute of the NEW callback\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`)
        }
    } else if (mutation.kind === 'hardDeletion') {
        const bRows = await storageV2.find(v1.names.B, undefined, undefined, ['id', 'label']) as Row[]
        if (bRows.some(r => r.label === 'gone')) {
            failWith(`hardDeletion: 'gone' rows survived the _isDeleted_ recompute: ${JSON.stringify(bRows)}`)
        }
        const expectedSurvivors = [...beforeSnapshot.get(v1.names.B)!.keys()].filter(id => !goneBIds.has(id)).sort()
        const actualSurvivors = bRows.map(r => String(r.id)).sort()
        if (JSON.stringify(actualSurvivors) !== JSON.stringify(expectedSurvivors)) {
            failWith(`hardDeletion: survivor id set diverges\nexpected: ${JSON.stringify(expectedSurvivors)}\nactual: ${JSON.stringify(actualSurvivors)}`)
        }
        // link 级联：端点被硬删除的 link 必须一并消失
        if (v1.names.relation) {
            const links = await storageV2.findRelationByName(v1.names.relation, undefined, undefined,
                ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]) as Row[]
            for (const link of links) {
                const targetId = String((link.target as Row)?.id)
                if (goneBIds.has(targetId)) {
                    failWith(`hardDeletion: link #${link.id} still references hard-deleted B#${targetId} (cascade missed)`)
                }
            }
        }
        // 下游 Count 重算
        const cntB = await storageV2.dict.get(v1.names.cntB)
        if (cntB !== bRows.length) {
            failWith(`hardDeletion: downstream count ${v1.names.cntB} = ${JSON.stringify(cntB)}, survivors = ${bRows.length}`)
        }
    } else if (mutation.kind === 'removeEmptyEntity') {
        const tables = await (storageV2 as unknown as { getExistingTables: () => Promise<Set<string>> }).getExistingTables()
        if (tables.has(v1.names.Retired)) {
            failWith(`removeEmptyEntity: retired table ${v1.names.Retired} still exists after approved removal`)
        }
    } else if (mutation.kind === 'countChange') {
        const cntA = await storageV2.dict.get(v1.names.cntA)
        if (mutation.decision === 'changed') {
            const expected = aRows.filter(r => (r.score as number) > 50).length
            if (cntA !== expected) {
                failWith(`countChange(changed): ${v1.names.cntA} = ${JSON.stringify(cntA)}, naive filtered recompute = ${expected}`)
            }
        } else {
            if (cntA !== beforeCntA) {
                failWith(`countChange(unchanged): ${v1.names.cntA} = ${JSON.stringify(cntA)}, must stay frozen at pre-migration ${JSON.stringify(beforeCntA)}`)
            }
        }
    } else if (mutation.kind === 'computationTypeChange') {
        // Count→Summation：manifest id 变化（removed+added），值 = 新声明朴素重算
        const cntA = await storageV2.dict.get(v1.names.cntA)
        const expected = aRows.reduce((acc, r) => acc + (r.score as number), 0)
        if (cntA !== expected) {
            failWith(`computationTypeChange: ${v1.names.cntA} = ${JSON.stringify(cntA)}, naive Summation recompute = ${expected}`)
        }
    } else if (mutation.kind === 'takeover') {
        // discard-and-rebuild：全部手工事实值废弃、按新计算重算
        const tagged = await storageV2.find(v1.names.A, undefined, undefined, ['id', 'label', 'tag']) as Row[]
        for (const row of tagged) {
            if (row.tag !== `t:${row.label}`) {
                failWith(`takeover: A#${row.id}.tag = ${JSON.stringify(row.tag)}, computed takeover expects ${JSON.stringify(`t:${row.label}`)}`)
            }
        }
    }

    // ---- 预言机 3：迁移后可写冒烟（增量维护接线：新代码生效） ----
    const cntABefore = await storageV2.dict.get(v1.names.cntA) as number
    const derivedBefore = (await storageV2.find(v1.names.Derived, undefined, undefined, ['id']) as Row[]).length
    const smokeRow = await storageV2.create(v1.names.A, { label: 'post', score: 80 }) as Row
    const cntAAfter = await storageV2.dict.get(v1.names.cntA) as number
    // score 80 通过两个版本的全部 callback（>0、>50、无 callback）；Summation 面 +score
    const expectedIncrement = mutation.kind === 'computationTypeChange' ? 80 : 1
    if (cntAAfter !== cntABefore + expectedIncrement) {
        failWith(`post-migration smoke: ${v1.names.cntA} ${cntABefore} -> ${cntAAfter}, expected +${expectedIncrement} (incremental maintenance not wired to the new code)`)
    }
    if (mutation.kind === 'takeover') {
        const smokeRead = await storageV2.findOne(v1.names.A, MatchExp.atom({ key: 'id', value: ['=', smokeRow.id] }), undefined, ['tag']) as Row
        if (smokeRead.tag !== 't:post') {
            failWith(`post-migration smoke: takeover computation not wired for new rows — tag = ${JSON.stringify(smokeRead.tag)}`)
        }
    }
    const derivedAfter = (await storageV2.find(v1.names.Derived, undefined, undefined, ['id']) as Row[]).length
    if (derivedAfter !== derivedBefore + 1) {
        failWith(`post-migration smoke: derived rows ${derivedBefore} -> ${derivedAfter}, expected +1 (live Transform not wired)`)
    }

    await (controllerV2.system as MonoSystem).destroy()
    return { seed, executed, mutation, blockedRejected: false }
}

/** 快照对账：expectDeletedIds 之外的记录必须逐字段相等；被删除记录必须真的消失。 */
function assertSnapshotEqual(
    before: Map<string, Map<string, Row>>,
    after: Map<string, Map<string, Row>>,
    expectDeletedIds: Set<string>,
    deletionRecordNames: Set<string>,
    failWith: (message: string) => never,
    context: string,
) {
    for (const [recordName, beforeRows] of before) {
        const afterRows = after.get(recordName) ?? new Map<string, Row>()
        for (const [id, beforeRow] of beforeRows) {
            const isDeletionTarget = deletionRecordNames.has(recordName) && expectDeletedIds.has(id)
            const afterRow = afterRows.get(id)
            if (isDeletionTarget) {
                if (afterRow) failWith(`${context}: ${recordName}#${id} was approved for deletion but survived`)
                continue
            }
            if (!afterRow) {
                // link 的级联删除：端点属于被删除集时合法消失
                const source = String(beforeRow.source ?? '')
                const target = String(beforeRow.target ?? '')
                if (expectDeletedIds.size && (expectDeletedIds.has(source) || expectDeletedIds.has(target))) continue
                failWith(`${context}: ${recordName}#${id} disappeared across migration`)
            }
            for (const [field, beforeValue] of Object.entries(beforeRow)) {
                if (JSON.stringify(beforeValue ?? null) !== JSON.stringify(afterRow![field] ?? null)) {
                    failWith(`${context}: ${recordName}#${id}.${field} changed across migration ` +
                        `(${JSON.stringify(beforeValue)} -> ${JSON.stringify(afterRow![field])})`)
                }
            }
        }
        for (const [id] of afterRows) {
            if (!beforeRows.has(id)) failWith(`${context}: ${recordName}#${id} appeared out of nowhere across migration`)
        }
    }
}

// ---------- 入口 ----------
// 默认池 1–24（r34 菜单扩到 8 种后重派生）：覆盖全部变异种类各至少一次 + 破坏性种类的
// kill-resume 变体（4 takeover+fault / 8 hardDeletion+fault / 12,24 removeEmptyEntity+fault /
// 14 countChange(changed)+fault / 18 countChange(unchanged)+fault / 20 computationTypeChange+fault；
// 非 fault：7,19,23 transformShrink / 9,15 hardDeletion / 21 countChange(changed)）。
// CAUTION 决策流契约（r34 版）：菜单扩容重派了 seed→mutation 映射，r33 默认池编号失效。
const SEED_START = Number(process.env.FUZZ_MIGD_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_MIGD_SEED_COUNT ?? 24)
const OPS = Number(process.env.FUZZ_MIGD_OPS ?? 10)

describe('migration destructive-mutation generative fuzz (random data × destructive mutation × approval decisions × kill-resume)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: destructive migration converges to the approved end state; blocked shapes reject losslessly', async (seed) => {
        const result = await runDestructiveMigrationFuzzCase(seed, OPS)
        expect(result.executed, `migd seed ${seed} executed no ops`).toBeGreaterThan(0)
    }, 300000)
})
