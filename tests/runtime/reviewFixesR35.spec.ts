import { describe, expect, test } from "vitest";
import {
    Controller, MonoSystem, KlassByName,
    Entity, Property, Relation, Dictionary,
    Count, Every, Any, WeightedSummation, Summation, Transform, Custom, RealTime,
    MatchExp, ActivityManager,
} from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import { approveGeneratedMigrationDiff } from './helpers/migrationApproval.js';
import { createData } from './data/activity/index.js';

/**
 * r35 深审修复的回归集（exist 关联作用域族见 tests/storage/existCorrelationScope.spec.ts）：
 *
 * 1. 同步契约回调面 × async 函数：声明期拒绝（klassValidation.assertSynchronousFunctionArg /
 *    PublicFieldDef.synchronous）+ 聚合消费点 thenable 守卫（aggregationTemplate.assertSyncCallbackResult）。
 *    此前 `!!promise === true` / `Number(promise) === NaN` / `JSON.stringify(promise) === '{}'`
 *    静默落库。
 * 2. 迁移 Transform 重建以 storage 事件为真相源：filtered 视图成员资格**退出**的派生
 *    delete 事件此前在合成流中不存在，链式依赖的聚合残留退出成员旧值（迁移成功报告 + 静默错值）。
 * 3. 迁移删除审计按 recordName 过滤：link 级联/派生 delete 的 id 此前被记入宿主 scope
 *    （注释声明了过滤、代码没有）——模拟侧 scope 呈现污染 id；分析性回退时进入无法批准的失败循环。
 * 4. atomic.compareAndSet 的 timestamp 写参归一化（与 replace 同一契约的兄弟读者，r26 漏格）。
 * 5. activity 头交互 postCommit 拿到已提交尝试的 args（含 guard 补全的 activityId）。
 */

describe('r35: sync-contract callback surfaces reject async functions at declaration time', () => {
    const expectAsyncRejected = (build: () => unknown, surface: string) => {
        expect(build, surface).toThrowError(/async function.*consumed synchronously/s)
    }

    test('aggregation callbacks (Count/Every/Any/WeightedSummation)', () => {
        const Item = Entity.create({ name: 'R35CbItem', properties: [Property.create({ name: 'flag', type: 'boolean' })] })
        expectAsyncRejected(() => Count.create({ record: Item, attributeQuery: ['flag'], callback: async (item: any) => item.flag }), 'Count.callback')
        expectAsyncRejected(() => Every.create({ record: Item, attributeQuery: ['flag'], callback: async (item: any) => item.flag }), 'Every.callback')
        expectAsyncRejected(() => Any.create({ record: Item, attributeQuery: ['flag'], callback: async (item: any) => item.flag }), 'Any.callback')
        expectAsyncRejected(() => WeightedSummation.create({ record: Item, attributeQuery: ['flag'], callback: async () => ({ weight: 1, value: 1 }) }), 'WeightedSummation.callback')
    })

    test('Property.computed / Property.defaultValue / Dictionary.defaultValue', () => {
        expectAsyncRejected(() => Property.create({ name: 'p1', type: 'number', computed: async (r: any) => r.x }), 'Property.computed')
        expectAsyncRejected(() => Property.create({ name: 'p2', type: 'string', defaultValue: async () => 'x' }), 'Property.defaultValue')
        expectAsyncRejected(() => Dictionary.create({ name: 'r35d1', type: 'string', collection: false, defaultValue: async () => 'x' }), 'Dictionary.defaultValue')
    })

    test('RealTime.nextRecomputeTime / Custom.createState / Custom.planIncremental', () => {
        expectAsyncRejected(() => RealTime.create({
            callback: async () => null as never,
            nextRecomputeTime: (async () => 1000) as never
        }), 'RealTime.nextRecomputeTime')
        expectAsyncRejected(() => Custom.create({
            name: 'R35C1',
            createState: (async () => ({})) as never
        }), 'Custom.createState')
        expectAsyncRejected(() => Custom.create({
            name: 'R35C2',
            planIncremental: (async () => ({ type: 'skip' })) as never
        }), 'Custom.planIncremental')
    })

    test('legitimately awaited surfaces still accept async functions', () => {
        const Src = Entity.create({ name: 'R35CbSrc', properties: [Property.create({ name: 'v', type: 'number' })] })
        expect(() => Transform.create({ record: Src, attributeQuery: ['v'], callback: async (item: any) => ({ v: item.v }) })).not.toThrow()
        expect(() => Custom.create({ name: 'R35C3', compute: async () => 1 })).not.toThrow()
        expect(() => RealTime.create({ callback: async () => null as never })).not.toThrow()
    })

    test('consumption-time thenable guard catches a sync function returning a Promise', async () => {
        const Item = Entity.create({ name: 'R35ThenItem', properties: [Property.create({ name: 'flag', type: 'boolean' })] })
        const dict = Dictionary.create({
            name: 'r35ThenCount',
            type: 'number',
            collection: false,
            computation: Count.create({
                record: Item,
                attributeQuery: ['flag'],
                // 非 async 声明（逃过声明期构造器名检测），但返回 Promise
                callback: (item: any) => Promise.resolve(item.flag === true)
            })
        })
        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [Item], relations: [], eventSources: [], dict: [dict] })
        await controller.setup(true)
        await expect(system.storage.create('R35ThenItem', { flag: true })).rejects.toThrow(/returned a Promise/)
        await system.destroy()
    })
})

describe('r35: migration Transform rebuild feeds filtered-membership exits to dependents', () => {
    test('downstream aggregation over a filtered view reaches zero when all members exit', async () => {
        const db = new PGLiteDB();
        const build = (half: boolean) => {
            const Product = new Entity({
                name: "R35MigProduct",
                properties: [new Property({ name: "price", type: "number" }, { uuid: "r35-mig-price" })],
            }, { uuid: "r35-mig-product" });
            const Discount = new Entity({
                name: "R35MigDiscount",
                properties: [new Property({ name: "value", type: "number" }, { uuid: "r35-mig-value" })],
                computation: new Transform({
                    record: Product,
                    attributeQuery: ["id", "price"],
                    callback: half ? (item: any) => ({ value: item.price * 0.5 }) : (item: any) => ({ value: item.price }),
                }, { uuid: "r35-mig-transform" }),
            }, { uuid: "r35-mig-discount" });
            const BigDiscount = new Entity({
                name: "R35MigBigDiscount",
                baseEntity: Discount,
                matchExpression: MatchExp.atom({ key: "value", value: [">", 15] }),
            }, { uuid: "r35-mig-big" });
            const bigSum = new Dictionary({
                name: "r35MigBigSum",
                type: "number",
                collection: false,
                computation: new Summation({
                    record: BigDiscount,
                    attributeQuery: ["value"],
                }, { uuid: "r35-mig-big-sum-computation" }),
            }, { uuid: "r35-mig-big-sum" });
            return { entities: [Product, Discount, BigDiscount], dict: [bigSum] };
        };
        const v1 = build(false);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: [], dict: v1.dict }).setup(true);
        await systemV1.storage.create("R35MigProduct", { price: 10 });
        await systemV1.storage.create("R35MigProduct", { price: 20 });
        expect(await systemV1.storage.dict.get("r35MigBigSum")).toBe(20);

        const v2 = build(true);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: [], dict: v2.dict });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:entity:R35MigDiscount:Transform": "changed",
            },
        });
        await controllerV2.migrate({ approvedDiff });
        // 迁移后 value 变为 5/10：两个成员全部退出 BigDiscount，sum 必须归零。
        //  修复前：合成事件流缺成员资格 delete，增量轨静默丢弃退出，sum 残留 20。
        expect(await systemV2.storage.dict.get("r35MigBigSum")).toBe(0);
        await db.close();
    });

    test('mixed stay-in update and exit both reach the aggregate', async () => {
        const db = new PGLiteDB();
        const build = (factor: number) => {
            const Product = new Entity({
                name: "R35MigMixProduct",
                properties: [new Property({ name: "price", type: "number" }, { uuid: "r35-mig-mix-price" })],
            }, { uuid: "r35-mig-mix-product" });
            const Discount = new Entity({
                name: "R35MigMixDiscount",
                properties: [new Property({ name: "value", type: "number" }, { uuid: "r35-mig-mix-value" })],
                computation: new Transform({
                    record: Product,
                    attributeQuery: ["id", "price"],
                    callback: factor === 1 ? (item: any) => ({ value: item.price }) : (item: any) => ({ value: item.price * 0.5 }),
                }, { uuid: "r35-mig-mix-transform" }),
            }, { uuid: "r35-mig-mix-discount" });
            const BigDiscount = new Entity({
                name: "R35MigMixBig",
                baseEntity: Discount,
                matchExpression: MatchExp.atom({ key: "value", value: [">", 15] }),
            }, { uuid: "r35-mig-mix-big" });
            const bigSum = new Dictionary({
                name: "r35MigMixBigSum",
                type: "number",
                collection: false,
                computation: new Summation({
                    record: BigDiscount,
                    attributeQuery: ["value"],
                }, { uuid: "r35-mig-mix-big-sum-computation" }),
            }, { uuid: "r35-mig-mix-big-sum" });
            return { entities: [Product, Discount, BigDiscount], dict: [bigSum] };
        };
        const v1 = build(1);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: [], dict: v1.dict }).setup(true);
        await systemV1.storage.create("R35MigMixProduct", { price: 20 });  // 20 -> 10（退出）
        await systemV1.storage.create("R35MigMixProduct", { price: 100 }); // 100 -> 50（留在视图内、值变化）
        expect(await systemV1.storage.dict.get("r35MigMixBigSum")).toBe(120);

        const v2 = build(2);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: [], dict: v2.dict });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:entity:R35MigMixDiscount:Transform": "changed",
            },
        });
        await controllerV2.migrate({ approvedDiff });
        expect(await systemV2.storage.dict.get("r35MigMixBigSum")).toBe(50);
        await db.close();
    });
});

describe('r35: migration deletion audit filters by recordName', () => {
    test('hard-deletion destructive scope lists host ids only, excluding cascade link deletions', async () => {
        const db = new SQLiteDB(':memory:');
        const build = (withDeletion: boolean) => {
            const A = new Entity({
                name: "R35AuditA",
                properties: [new Property({ name: "name", type: "string" }, { uuid: "r35-audit-a-name" })],
            }, { uuid: "r35-audit-a" });
            const B = new Entity({
                name: "R35AuditB",
                properties: [
                    new Property({ name: "label", type: "string" }, { uuid: "r35-audit-b-label" }),
                    ...(withDeletion ? [new Property({
                        name: "_isDeleted_",
                        type: "boolean",
                        computation: new Custom({
                            name: "R35AuditBDeleted",
                            dataDeps: { current: { type: "property", attributeQuery: ["label"] } },
                            compute: async (_deps: any, record: any) => record.label === 'gone',
                        }, { uuid: "r35-audit-b-deleted-computation" }),
                    }, { uuid: "r35-audit-b-deleted" })] : []),
                ],
            }, { uuid: "r35-audit-b" });
            const rel = new Relation({
                source: A, sourceProperty: 'bs', target: B, targetProperty: 'as',
                name: 'R35AuditAB', type: 'n:n',
            }, { uuid: "r35-audit-ab" });
            return { entities: [A, B], relations: [rel] };
        };
        const v1 = build(false);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: v1.relations }).setup(true);
        // SQLite 整型发号：宿主 B 与 link 行的 id 都从 1 开始——修复前 link 级联 delete 的 id
        //  被记入宿主 scope（['1','1'] 的重复形态正是污染证据）。
        const gone = await systemV1.storage.create("R35AuditB", { label: 'gone' });
        const keep = await systemV1.storage.create("R35AuditB", { label: 'keep' });
        await systemV1.storage.create("R35AuditA", { name: 'a1', bs: [{ id: gone.id }, { id: keep.id }] });

        const v2 = build(true);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: v2.relations });
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        const scopes = [...(diff.decisions || []), ...(diff.requiredDecisions || [])]
            .filter((decision): decision is Extract<typeof decision, { kind: 'destructive-scope' }> => decision.kind === 'destructive-scope');
        const hostScope = scopes.find(scope => scope.recordName === 'R35AuditB');
        expect(hostScope).toBeTruthy();
        expect((hostScope!.ids || []).map(String).sort()).toEqual([String(gone.id)]);

        // 端到端：按 host-only scope 批准后迁移单轮收敛（修复前执行侧污染集合与批准集合永不相等）。
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await controllerV2.migrate({ approvedDiff });
        const left = await systemV2.storage.find("R35AuditB", undefined as never, undefined, ['label']);
        expect(left.map(record => record.label)).toEqual(['keep']);
        await db.close();
    });
});

describe('r35: atomic.compareAndSet timestamp normalization (sibling of the r26 replace fix)', () => {
    test('CAS accepts Date | ms | ISO on SQLite and PGLite', async () => {
        for (const db of [new SQLiteDB(':memory:'), new PGLiteDB()] as const) {
            const E = Entity.create({
                name: 'R35TsCas',
                properties: [
                    Property.create({ name: 'label', type: 'string' }),
                    Property.create({ name: 'at', type: 'timestamp' }),
                ],
            })
            const system = new MonoSystem(db as never)
            system.conceptClass = KlassByName
            const controller = new Controller({ system, entities: [E], relations: [], eventSources: [] })
            await controller.setup(true)

            const ms = Date.UTC(2023, 0, 2, 3, 4, 5)
            const row = await system.storage.create('R35TsCas', { label: 'x', at: ms })
            const target = { recordName: 'R35TsCas', id: row.id, field: 'at' }

            // ms -> ms
            expect(await system.storage.atomic.compareAndSet(target, ms, ms + 1000)).toBe(true)
            // Date -> Date（修复前 SQLite 直接抛绑定错误）
            expect(await system.storage.atomic.compareAndSet(target, new Date(ms + 1000), new Date(ms + 2000))).toBe(true)
            // ISO -> ISO（修复前 SQLite 与 INT 毫秒列恒不相等，静默 false）
            expect(await system.storage.atomic.compareAndSet(target, new Date(ms + 2000).toISOString(), new Date(ms + 3000).toISOString())).toBe(true)
            // 不匹配的 expected 仍然正确返回 false
            expect(await system.storage.atomic.compareAndSet(target, ms, ms + 9999)).toBe(false)
            const after = await system.storage.findOne('R35TsCas', MatchExp.atom({ key: 'id', value: ['=', row.id] }), undefined, ['at'])
            expect(after.at).toBe(ms + 3000)
            await system.destroy()
        }
    })
})

describe('r35: activity head postCommit receives the committed attempt args', () => {
    test('postCommit sees the activityId created by the head interaction guard', async () => {
        const { entities, relations, interactions, activities, dicts } = createData()
        const system = new MonoSystem(new SQLiteDB(':memory:'))
        system.conceptClass = KlassByName

        const activityManager = new ActivityManager(activities)
        const activityOutput = activityManager.getOutput()
        const controller = new Controller({
            system,
            entities: [...entities, ...activityOutput.entities],
            relations: [...relations, ...activityOutput.relations],
            eventSources: [...interactions, ...activityOutput.eventSources],
            dict: dicts
        })
        await controller.setup(true)

        const sendRequestES = controller.findEventSourceByName('createFriendRelation:sendRequest')!
        let postCommitArgsActivityId: unknown = 'not-called'
        ;(sendRequestES as { postCommit?: unknown }).postCommit = async (args: { activityId?: unknown }) => {
            postCommitArgsActivityId = args.activityId
        }

        const userA = await system.storage.create('User', { name: 'a', age: 20 })
        const userB = await system.storage.create('User', { name: 'b', age: 21 })
        const result = await controller.dispatch(sendRequestES, {
            user: { ...userA, roles: ['user'] },
            payload: { to: userB }
        } as never)
        expect(result.error).toBeUndefined()
        const committedActivityId = (result.context as { activityId?: unknown })?.activityId
        expect(committedActivityId).toBeDefined()
        // 修复前 postCommit 拿到的是未回写的原始 args：activityId === undefined
        expect(postCommitArgsActivityId).toBe(committedActivityId)
        await system.destroy()
    })
})
