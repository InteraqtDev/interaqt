/**
 * 「分类⇒消费」守恒律的结构审计（quality-plan §二.2 支柱项；r32/r33 两轮登记后落地）。
 *
 * 守恒律：**凡被 NewRecordData 分类的载荷，必须被执行者消费或被守卫拒绝**——不存在
 * 静默半处理（r27 F-1：combined 子记录分类列表上的次级结构无执行者，六种形态静默丢失，
 * 存活 26 轮）。该律有两个可失守的面：
 *
 * 1. **行为面**（某个具体输入被分类后既没消费也没拒绝）——由写路径 fuzzer 的事件完备性
 *    预言机承担（数据 diff ⟺ 事件流；F-1 正是它抓获的）。
 * 2. **结构面**（分类树与消费面的漂移）——本套件承担：
 *    a. 分类面 = 运行时反射 NewRecordData 实例的分类桶字段（真实实例、非源码解析——
 *       新增桶自动进入审计域，无法绕过）；
 *    b. 消费面 = 登记册中每个桶的已定谳消费者/守卫锚点（文件 × 标识符），
 *       对源码求存在性——删除消费点而不重新定谳 ⇒ 红灯；
 *    c. 差集断言：分类面 ⊆ 登记册 且 登记册 ⊆ 分类面——新增分类桶而不登记消费决策 ⇒ 红灯。
 *
 * 登记册维护规则：新增桶时必须写明「谁消费（create 轨 / update 轨）或谁拒绝」；
 * 消费点重构时同步更新锚点。锚点刻意用「桶名出现在消费者文件里」的弱断言——
 * 它只防"整个消费面消失"的漂移，不试图静态证明逐输入消费（那是行为面预言机的辖区）。
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Entity, Property, Relation } from '@core';
import { EntityToTableMap, DBSetup } from "@storage";
import { NewRecordData } from "../../src/storage/erstorage/NewRecordData.js";
import { PGLiteDB } from '@drivers';

const STORAGE_DIR = join(__dirname, '../../src/storage/erstorage')

/**
 * 消费面登记册：每个分类桶的已定谳消费者/守卫（文件 → 该文件中必须出现的桶引用）。
 * 「消费」= 执行者遍历该桶产生写入/递归；「拒绝」= 守卫对不支持的形态 fail-fast。
 */
const CONSUMPTION_REGISTRY: Record<string, { consumers: string[], adjudication: string }> = {
    // ---- 三表合一（combined）----
    combinedNewRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'create 轨 preprocessSameRowData 同行写入 + r27 F-1 子结构守卫；update 轨递归同行更新',
    },
    combinedRecordIdRefs: {
        consumers: ['CreationExecutor.ts', 'RecordQueryAgent.ts'],
        adjudication: 'create 轨 flashOut 行认领（physicalRowMatch）+ r27 F-4/F-5 置换/同住守卫；同 id 原地更新经 preprocessSameRowData',
    },
    combinedNullRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'update 轨 null 清除（unlink combined 配对，reliance 面 fail-fast）；create 轨忽略（无可清除）',
    },
    // ---- 关系并入本行（merged link，FK 在本行）----
    mergedLinkTargetNewRecords: {
        consumers: ['CreationExecutor.ts'],
        adjudication: 'create 轨先递归新建目标再回填本行 FK 列（getSameRowFieldAndValue 落列）',
    },
    mergedLinkTargetRecordIdRefs: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: '同行 FK 列直写 + link 数据（`&`）同行落列；update 轨 replace/同 id 原地契约（r17 F-2）',
    },
    mergedLinkTargetNullRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'FK 列置 NULL（unlink 事件由 update 轨发出）',
    },
    // ---- 关系并入对端行（merged link，FK 在属性方向）----
    differentTableMergedLinkNewRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'create 轨递归新建目标（FK 随目标行落列）；update 轨 replace 语义',
    },
    differentTableMergedLinkRecordIdRefs: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: '对端行 FK 认领（含 flashOut 抢夺占用行）；update 轨 replace 语义',
    },
    differentTableMergedLinkNullRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'update 轨清除对端 FK（unlink）；create 轨忽略',
    },
    // ---- 关系独立表（isolated）----
    isolatedNewRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'create 轨递归新建目标 + 独立 link 行插入',
    },
    isolatedRecordIdRefs: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'create 轨独立 link 行插入（幂等冲突 fail-fast "link already exist"）；update 轨 replace 语义',
    },
    isolatedNullRecords: {
        consumers: ['CreationExecutor.ts', 'UpdateExecutor.ts'],
        adjudication: 'update 轨删除既有 link（x:n 数组 replace 的差集删除同源）；create 轨忽略',
    },
    // ---- 非桶分类字段（单值/元数据面）----
    linkRecordData: {
        consumers: ['CreationExecutor.ts', 'NewRecordData.ts'],
        adjudication: '`&` link 数据：同行拓扑经 getSameRowFieldAndValue 落列，独立表经 link 行插入；矛盾重复 ref 在 dedupeRefItems fail-fast',
    },
    entityIdAttributes: {
        consumers: ['NewRecordData.ts'],
        adjudication: 'link record 的 source/target 端点 id：getSameRowFieldAndValue 落列（addRelationByNameById 轨）',
    },
    relatedEntitiesData: {
        consumers: ['NewRecordData.ts'],
        adjudication: '分类树的原料面（构造函数内部完全分拣进上述桶——本字段自身不得有执行者直接消费，防绕过分类）',
    },
    valueAttributes: {
        consumers: ['NewRecordData.ts'],
        adjudication: '值字段面：getSameRowFieldAndValue 落列（含 computed 联动重算与 defaults）',
    },
}

/**
 * 运行时反射分类面：真实 NewRecordData 树（父 + 携带 `&` 的嵌套子）上
 * 「载荷分类」类型的自有字段并集。用真实实例而非源码解析——新增桶自动进入审计域。
 */
async function reflectClassificationSurface(): Promise<string[]> {
    const Target = Entity.create({ name: 'ConsvTarget', properties: [Property.create({ name: 'label', type: 'string' })] })
    const Host = Entity.create({ name: 'ConsvHost', properties: [Property.create({ name: 'label', type: 'string' })] })
    Relation.create({ source: Host, sourceProperty: 'out', target: Target, targetProperty: 'in', type: 'n:n' })
    const db = new PGLiteDB()
    await db.open()
    const setup = new DBSetup([Host, Target], [Relation.instances.filter(r => (r.source as { name?: string }).name === 'ConsvHost')[0]!], db)
    const map = new EntityToTableMap(setup.map, setup.aliasManager)
    const parent = new NewRecordData(map, 'ConsvHost', { label: 'x', out: [{ label: 'y', '&': { }, }] })
    await db.close()

    const surface = new Set<string>()
    const collect = (instance: NewRecordData) => {
        for (const [key, value] of Object.entries(instance)) {
            if (key === 'map' || key === 'rawData' || key === 'info' || key === 'recordName' || key === 'originalRecordName' || key === 'defaultValues') continue
            // 分类桶（NewRecordData[] / AttributeInfo[]）与单值分类字段（linkRecordData）
            if (Array.isArray(value) || key === 'linkRecordData') surface.add(key)
        }
    }
    collect(parent)
    for (const child of parent.relatedEntitiesData) collect(child)
    return [...surface].sort()
}

describe('NewRecordData classification⇒consumption conservation audit', () => {
    test('classification surface (runtime-reflected) exactly equals the consumption registry', async () => {
        const surface = await reflectClassificationSurface()
        const registered = Object.keys(CONSUMPTION_REGISTRY).sort()
        // 差集双向为空：新增桶必须登记消费决策；删除桶必须从登记册除名（含定谳理由）
        expect(surface, 'classification buckets missing a registered consumption decision (register the consumer/guard in CONSUMPTION_REGISTRY or reject the shape)').toEqual(registered)
    })

    test('every registered consumer anchor still references its bucket (consumption face must not silently vanish)', () => {
        const sources = new Map<string, string>()
        for (const [bucket, { consumers }] of Object.entries(CONSUMPTION_REGISTRY)) {
            for (const file of consumers) {
                if (!sources.has(file)) sources.set(file, readFileSync(join(STORAGE_DIR, file), 'utf-8'))
                const source = sources.get(file)!
                expect(source.includes(bucket),
                    `consumption face drift: ${file} no longer references classification bucket "${bucket}" — ` +
                    `re-adjudicate the bucket's consumer/guard and update CONSUMPTION_REGISTRY (adjudication on file: ${CONSUMPTION_REGISTRY[bucket].adjudication})`
                ).toBe(true)
            }
        }
    })

    test('the raw material face is not consumed by executors directly (classification cannot be bypassed)', () => {
        // relatedEntitiesData 是分类前的原料：执行者直接遍历它 = 绕过分类树 = 守恒律失去辖区。
        for (const file of ['CreationExecutor.ts', 'UpdateExecutor.ts', 'DeletionExecutor.ts', 'RecordQueryAgent.ts']) {
            const source = readFileSync(join(STORAGE_DIR, file), 'utf-8')
            expect(source.includes('.relatedEntitiesData'),
                `${file} consumes .relatedEntitiesData directly — executors must consume classified buckets, never the raw material face`
            ).toBe(false)
        }
    })
})
