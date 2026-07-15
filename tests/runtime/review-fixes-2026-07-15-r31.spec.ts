/**
 * r31 深度 review 修复回归（runtime 面）。
 *
 * A｜事件驱动计算的消费者与匹配器读不同事件视图（r20 契约的消费侧缺口，fatal）。
 *   r20 把 trigger / eventDep 的 record 模式匹配统一到「合并后的当前状态」视图
 *   （mergedMutationEventView），但匹配命中后交给消费者的仍是 partial record：
 *   - StateMachine computeTarget 读取未变更字段得到 undefined → 返回空目标 → 转移无声失效；
 *   - StateMachine computeValue / Transform event callback 读取未变更字段得到 undefined
 *     → 写入错误值 / 派生记录字段静默缺失。
 *   收敛修复：Scheduler.computeEventBasedDirtyRecordsAndEvents 统一把 merged view
 *   传给事件驱动计算的全部消费入口（computeDirtyRecords + incremental*）。
 *   keys / oldRecord 原样保留：「本次更新触及了哪些字段」的语义仍由 keys 表达。
 *
 * B｜StateMachine computeDirtyRecords 的按 id 去重用裸值 Set（string/number id 形态分裂时
 *   同一记录被处理两次——一次事件连走两个状态）。修复：String(id) 归一（与 sameRecordId 同族）。
 *
 * C｜checkPayload：required 字段显式传 undefined（{field: undefined}）时 `in` 判存在、
 *   值判 undefined 跳过全部校验——required 声明被静默绕过（守卫 fail-open）。
 *   修复：required 按「值是否 undefined」判定。同时拒绝非对象 payload（string/array）。
 *
 * D｜迁移 destructive scope 的 count 用 `ids.length || records.length`：重算结果为
 *   「一行都不删」（ids=[]）时 count 被误报成全表行数（审查面误导）。
 */
import { describe, expect, test } from "vitest";
import { Controller, MonoSystem } from "@runtime";
import { KlassByName } from "interaqt";
import { MatchExp } from "@storage";
import { PGLiteDB } from "@drivers";
import { Entity, Property, StateMachine, StateNode, StateTransfer, Transform } from "@core";
import { Action, Interaction, Payload, PayloadItem } from "../../src/builtins/index.js";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";

describe("r31 runtime review fixes", () => {
    test("A1: StateMachine update-trigger — computeTarget sees the merged record view (was: partial record, silent transfer skip)", async () => {
        const normal = StateNode.create({ name: "normal" });
        const flagged = StateNode.create({ name: "flagged" });
        const Post = Entity.create({
            name: "Post",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string" }),
                Property.create({
                    name: "flag", type: "string",
                    computation: StateMachine.create({
                        states: [normal, flagged],
                        initialState: normal,
                        transfers: [StateTransfer.create({
                            current: normal, next: flagged,
                            trigger: { recordName: "Post", type: "update", record: { status: "published" } },
                            // 与 trigger 相同的判定写在 computeTarget 里——两个读者必须看到同一投影
                            computeTarget: (event: any) => event.record.status === "published" ? { id: event.record.id } : undefined,
                        })],
                    }),
                }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Post], relations: [] });
        await controller.setup(true);

        const post = await system.storage.create("Post", { title: "t0", status: "published" });
        expect((await system.storage.findOne("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), undefined, ["*"])).flag).toBe("normal");

        // title-only update：partial record 不含 status，合并视图含 status='published' → 必须转移
        await system.storage.update("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), { title: "t1" });
        const updated = await system.storage.findOne("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), undefined, ["*"]);
        expect(updated.flag).toBe("flagged");
        await system.destroy();
    });

    test("A1-guard: non-matching current state stays put (merged view must not over-trigger)", async () => {
        const normal = StateNode.create({ name: "normal" });
        const flagged = StateNode.create({ name: "flagged" });
        const Post = Entity.create({
            name: "PostG",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string" }),
                Property.create({
                    name: "flag", type: "string",
                    computation: StateMachine.create({
                        states: [normal, flagged],
                        initialState: normal,
                        transfers: [StateTransfer.create({
                            current: normal, next: flagged,
                            trigger: { recordName: "PostG", type: "update", record: { status: "published" } },
                            computeTarget: (event: any) => event.record.status === "published" ? { id: event.record.id } : undefined,
                        })],
                    }),
                }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Post], relations: [] });
        await controller.setup(true);

        const draft = await system.storage.create("PostG", { title: "d0", status: "draft" });
        await system.storage.update("PostG", MatchExp.atom({ key: "id", value: ["=", draft.id] }), { title: "d1" });
        expect((await system.storage.findOne("PostG", MatchExp.atom({ key: "id", value: ["=", draft.id] }), undefined, ["*"])).flag).toBe("normal");
        await system.destroy();
    });

    test("A2: event-based Transform callback sees the merged record view; keys still carry what changed", async () => {
        const seenKeys: (string[] | undefined)[] = [];
        const Doc = Entity.create({
            name: "Doc",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string" }),
            ],
        });
        const AuditLog = Entity.create({
            name: "AuditLog",
            properties: [Property.create({ name: "docTitle", type: "string" })],
            computation: Transform.create({
                eventDeps: { published: { recordName: "Doc", type: "update", record: { status: "published" } } },
                callback: function (event: any) {
                    seenKeys.push(event.keys);
                    // title 不在本次 update 的写入集合里——merged view 下必须可读
                    return { docTitle: event.record.title };
                },
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Doc, AuditLog], relations: [] });
        await controller.setup(true);

        const doc = await system.storage.create("Doc", { title: "Hello", status: "draft" });
        await system.storage.update("Doc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { status: "published" });
        const logs = await system.storage.find("AuditLog", undefined, undefined, ["*"]);
        expect(logs).toHaveLength(1);
        expect(logs[0].docTitle).toBe("Hello");
        // 「本次更新触及了哪些字段」仍由 keys 表达（merged view 不吞 keys）
        expect(seenKeys).toHaveLength(1);
        expect(seenKeys[0]).toContain("status");
        expect(seenKeys[0]).not.toContain("title");
        await system.destroy();
    });

    test("B: computeTarget id-form split (string vs native) — one event must apply exactly one transition", async () => {
        const idle = StateNode.create({ name: "idle" });
        const active = StateNode.create({ name: "active" });
        const done = StateNode.create({ name: "done" });
        const Task = Entity.create({
            name: "Task",
            properties: [
                Property.create({ name: "touch", type: "number" }),
                Property.create({
                    name: "phase", type: "string",
                    computation: StateMachine.create({
                        states: [idle, active, done],
                        initialState: idle,
                        // keys: ['touch'] 把两条 transfer 都锚定在 touch 字段更新上，
                        // 排除本状态机自身 phase 写回事件的回声（r7-I-8 已知形态），
                        // 从而单独暴露「两个 computeTarget 返回不同 id 形态时去重失效」。
                        transfers: [
                            StateTransfer.create({
                                current: idle, next: active,
                                trigger: { recordName: "Task", type: "update", keys: ["touch"] },
                                // 用户载荷形态：字符串 id
                                computeTarget: (event: any) => ({ id: String(event.record.id) }),
                            }),
                            StateTransfer.create({
                                current: active, next: done,
                                trigger: { recordName: "Task", type: "update", keys: ["touch"] },
                                // 存储查询形态：原生 id（SQLite 下是 number）
                                computeTarget: (event: any) => ({ id: event.record.id }),
                            }),
                        ],
                    }),
                }),
            ],
        });
        // SQLite：整型发号，String(id) 与原生 id 的 JS 类型必然分裂
        const { SQLiteDB } = await import("@drivers");
        const system = new MonoSystem(new SQLiteDB());
        const controller = new Controller({ system, entities: [Task], relations: [] });
        await controller.setup(true);

        const task = await system.storage.create("Task", { touch: 0 });
        // 第一次 update：idle -> active（绝不能一次连走 idle -> active -> done）
        await system.storage.update("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), { touch: 1 });
        expect((await system.storage.findOne("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), undefined, ["*"])).phase).toBe("active");
        // 第二次 update：active -> done
        await system.storage.update("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), { touch: 2 });
        expect((await system.storage.findOne("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), undefined, ["*"])).phase).toBe("done");
        await system.destroy();
    });

    test("C: required payload rejects explicit undefined; non-object payload gets a clean guard error", async () => {
        const Doc = Entity.create({ name: "GuardDoc", properties: [Property.create({ name: "title", type: "string" })] });
        const CreateDoc = Interaction.create({
            name: "CreateGuardDoc", action: Action.create({ name: "createGuardDoc" }),
            payload: Payload.create({ items: [PayloadItem.create({ name: "title", type: "string", required: true })] }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Doc], relations: [], eventSources: [CreateDoc] });
        await controller.setup(true);

        const ok = await controller.dispatch(CreateDoc, { user: { id: "u1" }, payload: { title: "hello" } });
        expect(ok.error).toBeUndefined();

        const explicitUndefined = await controller.dispatch(CreateDoc, { user: { id: "u1" }, payload: { title: undefined } as any });
        expect(explicitUndefined.error).toBeDefined();
        expect(String((explicitUndefined.error as any).message)).toMatch(/missing/);

        for (const badPayload of ["oops", [1, 2]] as const) {
            const res = await controller.dispatch(CreateDoc, { user: { id: "u1" }, payload: badPayload as any });
            expect(res.error).toBeDefined();
            expect(String((res.error as any).message)).toMatch(/must be a plain object/);
        }
        await system.destroy();
    });

    test("E: unknown trigger pattern field is rejected at declaration (was: silently dead transfer)", async () => {
        const a = StateNode.create({ name: "a" });
        const b = StateNode.create({ name: "b" });
        const Doc = Entity.create({
            name: "TypoDoc",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({
                    name: "flag", type: "string",
                    computation: StateMachine.create({
                        states: [a, b], initialState: a,
                        transfers: [StateTransfer.create({
                            current: a, next: b,
                            // 'recrod' 是 'record' 的 typo：deepPartialMatch 在事件上永远找不到该字段
                            // → transfer 永不触发（静默死转移）。必须声明期拒绝。
                            trigger: { recordName: "TypoDoc", type: "update", recrod: { status: "x" } } as any,
                            computeTarget: (e: any) => ({ id: e.record.id }),
                        })],
                    }),
                }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        expect(() => new Controller({ system, entities: [Doc], relations: [] }))
            .toThrow(/unknown pattern field "recrod"/);
        await system.destroy();
    });

    test("E2: eventDep with unknown field / non-object record pattern / invalid keys is rejected at declaration (was: silently dropped)", async () => {
        const makeDoc = (suffix: string) => Entity.create({
            name: `EvDoc${suffix}`,
            properties: [Property.create({ name: "status", type: "string" })],
        });
        const makeAudit = (suffix: string, eventDep: any) => Entity.create({
            name: `EvAudit${suffix}`,
            properties: [Property.create({ name: "note", type: "string" })],
            computation: Transform.create({
                eventDeps: { dep: eventDep },
                callback: () => null,
            }),
        });

        // 未知字段（typo）此前被注册面静默丢弃（过滤条件消失 → 每次匹配事件都触发）
        const doc2 = makeDoc("T");
        const system2 = new MonoSystem(new PGLiteDB());
        expect(() => new Controller({ system: system2, entities: [doc2, makeAudit("T", { recordName: "EvDocT", type: "update", recrod: { status: "x" } })], relations: [] }))
            .toThrow(/unknown pattern field "recrod"/);

        // record 模式必须是普通对象（原始值与对象事件永不相等——静默死声明）
        const doc3 = makeDoc("P");
        const system3 = new MonoSystem(new PGLiteDB());
        expect(() => new Controller({ system: system3, entities: [doc3, makeAudit("P", { recordName: "EvDocP", type: "update", record: "published" })], relations: [] }))
            .toThrow(/"record" must be a plain object/);

        // keys 只能声明在 update 模式上（create/delete 事件不携带 keys，声明永不命中）
        const doc4 = makeDoc("C");
        const system4 = new MonoSystem(new PGLiteDB());
        expect(() => new Controller({ system: system4, entities: [doc4, makeAudit("C", { recordName: "EvDocC", type: "create", keys: ["status"] })], relations: [] }))
            .toThrow(/keys can only be declared on 'update' patterns/);

        // keys 的属性名 typo 永不命中
        const doc5 = makeDoc("Y");
        const system5 = new MonoSystem(new PGLiteDB());
        expect(() => new Controller({ system: system5, entities: [doc5, makeAudit("Y", { recordName: "EvDocY", type: "update", keys: ["statuss"] })], relations: [] }))
            .toThrow(/does not match any declared property/);
    });

    test("E3: eventDep keys — 'this update touched X' subset semantics (same contract as trigger.keys)", async () => {
        const Doc = Entity.create({
            name: "KeysDoc",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string" }),
            ],
        });
        const AuditLog = Entity.create({
            name: "KeysAudit",
            properties: [Property.create({ name: "status", type: "string" })],
            computation: Transform.create({
                eventDeps: { statusTouched: { recordName: "KeysDoc", type: "update", keys: ["status"] } },
                callback: (event: any) => ({ status: event.record.status }),
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Doc, AuditLog], relations: [] });
        await controller.setup(true);

        const doc = await system.storage.create("KeysDoc", { title: "t0", status: "draft" });
        // title-only update：keys=['title'] ⊉ ['status'] → 不触发（此前 keys 被静默丢弃会误触发）
        await system.storage.update("KeysDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { title: "t1" });
        expect(await system.storage.find("KeysAudit", undefined, undefined, ["*"])).toHaveLength(0);
        // status update：keys 命中 → 触发一次
        await system.storage.update("KeysDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { status: "published" });
        const audits = await system.storage.find("KeysAudit", undefined, undefined, ["*"]);
        expect(audits).toHaveLength(1);
        expect(audits[0].status).toBe("published");
        await system.destroy();
    });

    test("D: destructive deletion scope count reports 0 (not the whole table) when recompute deletes nothing", async () => {
        const db = new PGLiteDB();
        const { Custom } = await import("@core");
        const UserV1 = new Entity({
            name: "R31ScopeCountUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "r31-scope-count-name" })],
        }, { uuid: "r31-scope-count-user" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [UserV1], relations: [] });
        await controllerV1.setup(true);
        await systemV1.storage.create("R31ScopeCountUser", { name: "keep-1" });
        await systemV1.storage.create("R31ScopeCountUser", { name: "keep-2" });

        // V2 引入 _isDeleted_ 硬删除计算——对存量记录全部重算为 false（一行都不删）
        const UserV2 = new Entity({
            name: "R31ScopeCountUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "r31-scope-count-name" }),
                new Property({
                    name: "_isDeleted_", type: "boolean",
                    computation: Custom.create({
                        name: "R31NeverDelete",
                        dataDeps: { _current: { type: "property", attributeQuery: ["name"] } },
                        compute: async function () { return false; },
                    }) as any,
                }, { uuid: "r31-scope-count-deleted" }),
            ],
        }, { uuid: "r31-scope-count-user" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        const scope = diff.safety.destructiveScopes.find(item => item.recordName === "R31ScopeCountUser");
        expect(scope).toBeDefined();
        expect(scope!.ids).toEqual([]);
        // 修复前：count 被 `ids.length || records.length` 误报为 2（全表行数）
        expect(scope!.count).toBe(0);
        await db.close();
    });
});
