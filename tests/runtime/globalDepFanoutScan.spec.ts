import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
    Controller,
    Count,
    Custom,
    Dictionary,
    KlassByName,
    MatchExp,
    MonoSystem,
    Scheduler,
} from 'interaqt';
import { recordDatabaseStatements } from './helpers/perfProbe.js';

/**
 * A2（performance-debt-plan §四 1.2 / core-runtime-builtins-review S3）：
 * global dict 变更对 property 计算的宿主扇出不得单条无界查询物化整张宿主表。
 *
 * 记录形态（S3，~15 轮复确）：每个依赖该 dict 的 property computation 触发一次
 * 无界 `find(host, ..., ['*'])`——事务内全行一次性物化，大表下是延迟与内存悬崖。
 *
 * 收口契约（Scheduler.computeDataBasedDirtyRecordsAndEvents global 分支）：
 *  keyset 分批（orderBy id ASC + id > cursor + limit）。列面保持 ['*'] 是**既有公开契约**
 *  ——property 计算的 compute(deps, record) 可直接读宿主任意字段
 *  （globalDataDependency.spec 的 `context.price` 用法固化），列裁剪是违约，不做
 *  （S3 的"全列"半场由该契约钉死；"无界物化"半场在此收口）。
 *
 * 判据：SQL 记录器（perfProbe.recordDatabaseStatements）——扇出批数 =
 * ceil(N/batchSize) × attempt 数、每批带 LIMIT；宿主表上不存在无界全列扫描；
 * 值正确性 = 每宿主重算结果正确。
 */

const HOST_COUNT = 7
const BATCH_SIZE = 3

describe('global dict fan-out scan narrowing (A2/S3)', () => {
    let savedBatchSize: number

    beforeEach(() => {
        savedBatchSize = Scheduler.GLOBAL_DEP_FANOUT_BATCH_SIZE
        Scheduler.GLOBAL_DEP_FANOUT_BATCH_SIZE = BATCH_SIZE
    })
    afterEach(() => {
        Scheduler.GLOBAL_DEP_FANOUT_BATCH_SIZE = savedBatchSize
    })

    test('custom property computation with global dep: batched keyset fetch, correct values', async () => {
        const hostEntity = Entity.create({
            name: 'A2Host',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
                // fat 列：扇出查询绝不该取它
                Property.create({ name: 'bio', type: 'string' })
            ]
        });
        const factorDict = Dictionary.create({ name: 'a2Factor', type: 'number', collection: false });
        hostEntity.properties.push(
            Property.create({
                name: 'weightedScore', type: 'number',
                computation: Custom.create({
                    name: 'A2WeightedScore',
                    dataDeps: {
                        factor: { type: 'global', source: factorDict },
                        self: { type: 'property', attributeQuery: ['score'] }
                    },
                    compute: async function (dataDeps: { factor?: number, self?: { score?: number } }) {
                        return (dataDeps.factor ?? 0) * (dataDeps.self?.score ?? 0)
                    }
                })
            })
        );

        const db = new PGLiteDB()
        const statements = recordDatabaseStatements(db)
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [hostEntity],
            relations: [],
            dict: [factorDict]
        });
        await controller.setup(true);

        for (let i = 0; i < HOST_COUNT; i++) {
            await system.storage.create('A2Host', { score: i + 1, bio: `bio-${i}` })
        }

        statements.length = 0
        await system.storage.dict.set('a2Factor', 10)

        // 值正确性：每个宿主的 weightedScore = 10 * score
        const hosts = await system.storage.find('A2Host', undefined, undefined, ['id', 'score', 'weightedScore'])
        expect(hosts.length).toBe(HOST_COUNT)
        for (const host of hosts) {
            expect(host.weightedScore).toBe(10 * host.score)
        }

        // CAUTION dict 扇出经全量重算路径，强制 SERIALIZABLE：首个 READ COMMITTED attempt
        //  抛 RequireSerializableRetry 整体作废重跑（隔离级放大是 A 家族的既定记录成本，
        //  见 performance-debt-plan §一 A 表头）。SQL 形状断言按 attempt 数归一——
        //  attempt 数 = dict 行 INSERT 的执行次数（每个 attempt 各写一次，失败的被回滚）。
        const dictInsertAttempts = statements.filter(statement =>
            statement.sql.trimStart().toUpperCase().startsWith('INSERT') && statement.sql.includes('_Dictionary_')
        ).length
        expect(dictInsertAttempts).toBeGreaterThan(0)

        // 扇出查询形状：每 attempt 按 keyset 分批 ceil(7/3) = 3 条（每批带 LIMIT + ORDER BY）
        const fanoutStatements = statements.filter(statement =>
            statement.sql.includes('"A2Host"') && /LIMIT/i.test(statement.sql) && /ORDER BY/i.test(statement.sql)
        )
        expect(fanoutStatements.length, `expected ceil(${HOST_COUNT}/${BATCH_SIZE}) batched fan-out queries per attempt (${dictInsertAttempts} attempts); statements:\n` +
            statements.map(s => s.sql.split('\n')[0]).join('\n')).toBe(Math.ceil(HOST_COUNT / BATCH_SIZE) * dictInsertAttempts)
        // 全表全列无界扫描（带 fat 列 bio、无 LIMIT、无参数化等值约束）不得出现在宿主表上。
        // 有界的单行读（update 前置的 WHERE id = $n 读）不在本判据辖区——那是 update 写路径
        // 的既有形态（NewRecordData computed 重算取数），属计划 A4/measured-first 项。
        const unboundedFullScans = statements.filter(statement =>
            statement.sql.includes('"A2Host"') && statement.sql.includes('bio') &&
            statement.sql.trimStart().startsWith('SELECT') &&
            !/LIMIT/i.test(statement.sql) && !statement.sql.includes('= $')
        )
        expect(unboundedFullScans, `unbounded full-column host scans found:\n${unboundedFullScans.map(s => s.sql).join('\n---\n')}`).toHaveLength(0)

        await system.destroy()
    })

    test('aggregation with global dataDep: dict change recomputes every host correctly through batched fan-out', async () => {
        const ownerEntity = Entity.create({
            name: 'A2Owner',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const taskEntity = Entity.create({
            name: 'A2Task',
            properties: [Property.create({ name: 'points', type: 'number' })]
        });
        const relation = Relation.create({
            source: ownerEntity,
            sourceProperty: 'tasks',
            target: taskEntity,
            targetProperty: 'owner',
            type: '1:n'
        });
        const thresholdDict = Dictionary.create({ name: 'a2Threshold', type: 'number', collection: false });
        ownerEntity.properties.push(
            Property.create({
                name: 'bigTaskCount', type: 'number',
                computation: Count.create({
                    property: 'tasks',
                    attributeQuery: ['points'],
                    dataDeps: { threshold: { type: 'global', source: thresholdDict } },
                    callback: function (task: { points?: number }, dataDeps?: { threshold?: number }) {
                        return (task.points ?? 0) > (dataDeps?.threshold ?? 0)
                    }
                })
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ownerEntity, taskEntity],
            relations: [relation],
            dict: [thresholdDict]
        });
        await controller.setup(true);

        await system.storage.dict.set('a2Threshold', 10)
        const owners: { id: string }[] = []
        for (let i = 0; i < 5; i++) {
            const owner = await system.storage.create('A2Owner', { name: `o${i}` })
            owners.push(owner)
            // 每个 owner 两个 task：points = 5 与 50
            await system.storage.create('A2Task', { points: 5, owner: { id: owner.id } })
            await system.storage.create('A2Task', { points: 50, owner: { id: owner.id } })
        }

        let rows = await system.storage.find('A2Owner', undefined, undefined, ['id', 'bigTaskCount'])
        for (const row of rows) expect(row.bigTaskCount).toBe(1)  // 只有 50 > 10

        // threshold 60：所有 task 都不再达标——每个宿主都被扇出重算
        await system.storage.dict.set('a2Threshold', 60)
        rows = await system.storage.find('A2Owner', undefined, undefined, ['id', 'bigTaskCount'])
        for (const row of rows) expect(row.bigTaskCount).toBe(0)

        // threshold 1：两个 task 都达标
        await system.storage.dict.set('a2Threshold', 1)
        rows = await system.storage.find('A2Owner', undefined, undefined, ['id', 'bigTaskCount'])
        for (const row of rows) expect(row.bigTaskCount).toBe(2)

        await system.destroy()
    })

    test('empty host table: dict change is a no-op fan-out (single empty batch, no error)', async () => {
        const hostEntity = Entity.create({
            name: 'A2Empty',
            properties: [Property.create({ name: 'score', type: 'number' })]
        });
        const factorDict = Dictionary.create({ name: 'a2EmptyFactor', type: 'number', collection: false });
        hostEntity.properties.push(
            Property.create({
                name: 'scaled', type: 'number',
                computation: Custom.create({
                    name: 'A2EmptyScaled',
                    dataDeps: {
                        factor: { type: 'global', source: factorDict },
                        self: { type: 'property', attributeQuery: ['score'] }
                    },
                    compute: async function (dataDeps: { factor?: number, self?: { score?: number } }) {
                        return (dataDeps.factor ?? 0) * (dataDeps.self?.score ?? 0)
                    }
                })
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [hostEntity],
            relations: [],
            dict: [factorDict]
        });
        await controller.setup(true);

        await system.storage.dict.set('a2EmptyFactor', 3)
        expect(await system.storage.dict.get('a2EmptyFactor')).toBe(3)

        // 空表之后建的宿主仍然正常计算（初始值路径不受扇出改动影响）
        await system.storage.create('A2Empty', { score: 4 })
        const row = await system.storage.findOne('A2Empty', MatchExp.atom({ key: 'score', value: ['=', 4] }), undefined, ['id', 'scaled'])
        expect(row.scaled).toBe(12)

        await system.destroy()
    })
})
