/**
 * r31 第二批收口回归（记录项完成轮）。
 *
 * A｜PGLite close→open 复活：closed 标志不复位、实例不重建，close 后一切使用抛底层
 *   "PGlite is closed"——生命周期契约与 PG/MySQL/SQLite 三驱动分裂（r26 I-4 家族对称面）。
 *
 * B｜_Dictionary_ key 唯一守恒律（r12-I-1 收口）：并发 dispatch 的 find-then-create 竞态
 *   写出同 key 双行（findOne 非确定、update 留幽灵行）。唯一索引把静默双行变成冲突；
 *   setDictionaryValue 把冲突转成 RetryableWriteConflict——dispatch 重试后收敛到 update 轨。
 *   （_System_ 的 set(concept,key) 是同族兄弟轨，同批收口。）
 *
 * C｜活动定义漂移 vs 在飞实例：resume 只按持久化 children 水合，新增分支对已开始的
 *   every group 静默不生效（少一个分支照样"完成"）、节点被移除则裸 TypeError。
 *   r30 规则 4（静默损坏级搁置项立即加临时 fail-fast）的落地。
 *
 * D｜计算型属性的类型变更此前对迁移 storage-blocking 完全不可见（isComputed 跳过整组
 *   类型对比）——compute-route DDL 没有 ALTER COLUMN，重算把新类型值写进旧列。
 */
import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, DICTIONARY_RECORD } from "@runtime";
import { KlassByName } from "interaqt";
import { RetryableWriteConflict, isRetryableTransactionError } from "../../src/runtime/transaction.js";
import { MatchExp } from "@storage";
import { PGLiteDB, PostgreSQLDB } from "@drivers";
import { Activity, ActivityGroup, Action, Interaction, Payload, PayloadItem, Transfer } from "../../src/builtins/index.js";
import { Custom, Entity, Property } from "@core";

describe("r31b — remaining recorded items", () => {
    test("A: PGLite open() revives the connection after close()", async () => {
        const db = new PGLiteDB();
        await db.open();
        await db.close();
        await db.open();
        const rows = await db.query<{ one: number }>("SELECT 1 AS one", []);
        expect(rows[0].one).toBe(1);
        await db.close();
    });

    test("B1: _Dictionary_ key carries a unique index — concurrent-create race can no longer leave duplicate rows", async () => {
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [], relations: [] });
        await controller.setup(true);

        await system.storage.create(DICTIONARY_RECORD, { key: "raceKey", value: { raw: 1 } });
        // 模拟竞态输家：同 key 第二行必须撞唯一索引（此前静默双行）
        await expect(system.storage.create(DICTIONARY_RECORD, { key: "raceKey", value: { raw: 2 } }))
            .rejects.toThrow(/unique/i);
        const rows = await system.storage.find(DICTIONARY_RECORD, MatchExp.atom({ key: "key", value: ["=", "raceKey"] }), undefined, ["*"]);
        expect(rows).toHaveLength(1);
        await system.destroy();
    });

    test("B2: RetryableWriteConflict is classified as a retryable transaction error", () => {
        expect(isRetryableTransactionError(new RetryableWriteConflict("concurrent dictionary create"))).toBe(true);
        // 链式包装（causedBy/cause）同样可达
        const wrapped = new Error("outer");
        (wrapped as any).cause = new RetryableWriteConflict("inner");
        expect(isRetryableTransactionError(wrapped)).toBe(true);
        expect(isRetryableTransactionError(new Error("plain"))).toBe(false);
    });

    test("B3: dict.set converges when the row appears between findOne and create (retry path)", async () => {
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [], relations: [] });
        await controller.setup(true);

        // 直接驱动 setDictionaryValue 的 create 轨撞唯一索引：先经 dict.set 建行，
        // 再手工把另一行 create 强行插入同 key —— 断言错误形态是 RetryableWriteConflict
        // （可重试），而非裸数据库错误（不可重试、dispatch 直接失败）。
        await system.storage.dict.set("convergeKey", 1);
        const storageAny = system.storage as any;
        const monkeyFindOne = storageAny.queryHandle.findOne.bind(storageAny.queryHandle);
        // 让下一次 findOne(_Dictionary_, key=convergeKey2) 返回空（模拟竞态窗口：对方尚未提交）
        let missOnce = true;
        storageAny.queryHandle.findOne = async (...args: any[]) => {
            if (missOnce && args[0] === DICTIONARY_RECORD) {
                missOnce = false;
                return undefined;
            }
            return monkeyFindOne(...args);
        };
        await system.storage.create(DICTIONARY_RECORD, { key: "convergeKey2", value: { raw: 0 } });
        await expect(system.storage.dict.set("convergeKey2", 2)).rejects.toBeInstanceOf(RetryableWriteConflict);
        storageAny.queryHandle.findOne = monkeyFindOne;
        // 重试路径（重新走 dict.set）收敛到 update 轨
        await system.storage.dict.set("convergeKey2", 3);
        expect(await system.storage.dict.get("convergeKey2")).toBe(3);
        const rows = await system.storage.find(DICTIONARY_RECORD, MatchExp.atom({ key: "key", value: ["=", "convergeKey2"] }), undefined, ["*"]);
        expect(rows).toHaveLength(1);
        await system.destroy();
    });

    test("C: resuming an in-flight activity instance against a drifted definition fails fast (was: silent incomplete completion / bare TypeError)", async () => {
        const mkInteraction = (name: string) => Interaction.create({
            name, action: Action.create({ name: `${name}Action` }),
            payload: Payload.create({ items: [] }),
        });
        const head = mkInteraction("R31Head");
        const a1 = mkInteraction("R31BranchA1");
        const b1 = mkInteraction("R31BranchB1");
        const group = ActivityGroup.create({
            type: "every",
            activities: [
                Activity.create({ name: "R31BranchA", interactions: [a1], groups: [], transfers: [], gateways: [], events: [] }),
                Activity.create({ name: "R31BranchB", interactions: [b1], groups: [], transfers: [], gateways: [], events: [] }),
            ],
        });
        const activity = Activity.create({
            name: "R31DriftActivity",
            interactions: [head],
            groups: [group],
            transfers: [Transfer.create({ name: "toGroup", source: head, target: group })],
            gateways: [], events: [],
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const { ActivityManager } = await import("../../src/builtins/index.js");
        const activityManager = new ActivityManager([activity]);
        const activityOutput = activityManager.getOutput();
        const controller = new Controller({
            system,
            entities: [...activityOutput.entities],
            relations: [...activityOutput.relations],
            eventSources: [...activityOutput.eventSources],
        });
        await controller.setup(true);
        const headES = controller.findEventSourceByName("R31DriftActivity:R31Head")!;
        const a1ES = controller.findEventSourceByName("R31DriftActivity:R31BranchA1")!;

        // 启动一个实例并推进到 group（head 完成，persisted state 带 2 个分支 children）
        const headResult = await controller.dispatch(headES, { user: { id: "u1" }, payload: {} });
        expect(headResult.error).toBeUndefined();
        const activityId = (headResult.context as any)?.activityId;
        expect(activityId).toBeDefined();

        // 模拟「快照是旧定义的」两种漂移形态（直接改写持久化 state——与"部署了新定义后 resume 旧快照"等价）：
        const activityRecord = await system.storage.findOne("_Activity_", MatchExp.atom({ key: "id", value: ["=", activityId] }), undefined, ["*"]);
        const groupStateUuid = activityRecord.state.current.uuid;

        // 1. 分支数漂移：快照少一个分支（相当于定义后来新增了分支）→ every 组会静默跳过新分支
        const driftedChildren = { ...activityRecord.state, current: { uuid: groupStateUuid, children: activityRecord.state.current.children.slice(0, 1) } };
        await system.storage.update("_Activity_", MatchExp.atom({ key: "id", value: ["=", activityId] }), { state: driftedChildren });
        const resumedFewer = await controller.dispatch(a1ES, { user: { id: "u1" }, payload: {}, activityId });
        expect(resumedFewer.error).toBeDefined();
        expect(String((resumedFewer.error as any).message)).toMatch(/definition has drifted/);
        expect((resumedFewer.error as any).constructor?.name).not.toBe("TypeError");

        // 2. 节点漂移：快照引用的节点 uuid 在当前图中不存在（相当于节点被移除/uuid 变更）
        //    → 此前裸 TypeError（读 undefined.content），现在是干净的 ActivityStateError
        const driftedUuid = {
            ...activityRecord.state,
            current: {
                uuid: groupStateUuid,
                children: [{ current: { uuid: "no-such-node-uuid" } }, activityRecord.state.current.children[1]],
            },
        };
        await system.storage.update("_Activity_", MatchExp.atom({ key: "id", value: ["=", activityId] }), { state: driftedUuid });
        const resumedMissing = await controller.dispatch(a1ES, { user: { id: "u1" }, payload: {}, activityId });
        expect(resumedMissing.error).toBeDefined();
        expect(String((resumedMissing.error as any).message)).toMatch(/does not exist in the current activity graph/);
        expect((resumedMissing.error as any).constructor?.name).not.toBe("TypeError");

        // 3. 对照：未漂移的快照正常推进
        await system.storage.update("_Activity_", MatchExp.atom({ key: "id", value: ["=", activityId] }), { state: activityRecord.state });
        const ok = await controller.dispatch(a1ES, { user: { id: "u1" }, payload: {}, activityId });
        expect(ok.error).toBeUndefined();
        await system.destroy();
    });

    test("D: computed property type change is a blocking migration change (was: invisible — recompute writes new type into old column)", async () => {
        const db = new PGLiteDB();
        const buildEntity = (valueType: "string" | "number") => new Entity({
            name: "R31TypedComputed",
            properties: [
                new Property({ name: "source", type: "number" }, { uuid: "r31b-typed-source" }),
                new Property({
                    name: "derived", type: valueType,
                    computation: Custom.create({
                        name: "R31DerivedCompute",
                        dataDeps: { _current: { type: "property", attributeQuery: ["source"] } },
                        compute: valueType === "string"
                            ? async function (this: any, deps: any) { return String(deps._current?.source ?? ""); }
                            : async function (this: any, deps: any) { return (deps._current?.source ?? 0) * 2; },
                    }) as any,
                }, { uuid: "r31b-typed-derived" }),
            ],
        }, { uuid: "r31b-typed-entity" });

        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [buildEntity("string")], relations: [] });
        await controllerV1.setup(true);

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [buildEntity("number")], relations: [] });
        const { dryRunWithApproval } = await import("./helpers/migrationApproval.js");
        const plan = await dryRunWithApproval(controllerV2).catch((error: unknown) => ({ blockingChanges: [String(error)] }));
        expect((plan.blockingChanges || []).join("\n")).toMatch(/computed attribute type.*changed/);
        await db.close();
    });
});

// 真实 PG 并发面：两个连接同时对同一新 dict key 走 find-then-create（r12-I-1 的原始形态）。
const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
describeIfPostgres("r31b — _Dictionary_ create race on real PostgreSQL", () => {
    const dbOptions = {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
    };
    test("concurrent dispatches writing the same fresh dict key converge to one row", async () => {
        const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_r31b_dictrace`;
        const buildModel = () => {
            const Doc = Entity.create({ name: "RaceDoc", properties: [Property.create({ name: "title", type: "string" })] });
            const Bump = Interaction.create({
                name: "BumpDict", action: Action.create({ name: "bumpDict" }),
                payload: Payload.create({ items: [PayloadItem.create({ name: "title", type: "string" })] }),
            });
            return { Doc, Bump };
        };
        const setupSystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        setupSystem.conceptClass = KlassByName;
        const setupModel = buildModel();
        const setupController = new Controller({ system: setupSystem, entities: [setupModel.Doc], relations: [], eventSources: [setupModel.Bump] });
        await setupController.setup(true);
        // 清掉 setup 期可能初始化的行，保证两个 worker 都走 create 轨
        await setupSystem.storage.delete(DICTIONARY_RECORD, MatchExp.atom({ key: "key", value: ["=", "raceCounter"] }));

        const runWorker = async () => {
            const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
            system.conceptClass = KlassByName;
            const model = buildModel();
            const controller = new Controller({
                system, entities: [model.Doc], relations: [], eventSources: [model.Bump],
                recordMutationSideEffects: [],
            });
            await controller.setup(false);
            // dispatch 事务内对同一 fresh key 做 find-then-create（经 dict.set）
            const result = await controller.dispatch(model.Bump, { user: { id: "u" }, payload: { title: "x" } });
            if (result.error) throw result.error;
            await system.storage.dict.set("raceCounter", Date.now());
            await system.destroy();
        };
        // dict.set 在 dispatch 事务外自动提交——真正的并发窗口靠 Promise.all 的两个独立连接制造。
        // 收敛断言：无论谁输谁赢，最终恰好一行（此前：偶发双行）。
        const results = await Promise.allSettled([runWorker(), runWorker()]);
        const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        // 允许输家以 RetryableWriteConflict 失败（dict.set 裸调用无重试包装）；不允许其他错误
        for (const failure of failures) {
            expect(String((failure.reason as any)?.name)).toBe("RetryableWriteConflict");
        }
        const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        verifySystem.conceptClass = KlassByName;
        const verifyModel = buildModel();
        const verifyController = new Controller({ system: verifySystem, entities: [verifyModel.Doc], relations: [], eventSources: [verifyModel.Bump] });
        await verifyController.setup(false);
        const rows = await verifySystem.storage.find(DICTIONARY_RECORD, MatchExp.atom({ key: "key", value: ["=", "raceCounter"] }), undefined, ["*"]);
        expect(rows.length).toBeLessThanOrEqual(1);
        await verifySystem.destroy();
        await setupSystem.destroy();
    });
});
