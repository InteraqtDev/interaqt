/**
 * r21 深度审查回归（runtime 面）。
 *
 * F-1 —— records dataDep 的 match 本地求值与 SQL 判定分裂（增量 skip/entered 误判）：
 *   buildMatchEventContext 用事件快照对 match 做本地求值来决定 skip / entered / left。
 *   旧实现把「键缺席」与「值为 null」混为一谈（readMatchPath 返回 undefined 参与比较）、
 *   负向操作符不按 SQL 三值逻辑（NULL != x 在 SQL 是 UNKNOWN 不匹配，本地 undefined !== x 却为 true）：
 *   - match 建立在 computed 列上：create 事件不携带 computed 列 → 双 false → skip → 计算永久少计；
 *   - match ['=', null]（IS NULL）：create 不带该字段 → undefined === null 为 false → skip → 少计；
 *   - match ['!=', x]：create 不带该字段（库里 NULL，SQL 不匹配）→ 本地误判 entered → 多计；
 *   - match 跨关联路径 + 更新聚合自身字段：update 前置查询裁剪掉未涉及的关系 → oldRecord 无该键
 *     → 双 false → skip → 计算陈旧。
 *   修复：readMatchPath 区分缺席与 null（缺席的普通值属性按快照完整性契约解析为 NULL，
 *   computed/关系路径缺席则不可判定 → 保守 full recompute）；compareMatchValue 逐操作符
 *   镜像 SQL 三值逻辑与 MatchExp 编译语义（=/!= null → IS NULL/IS NOT NULL、in/not in 的
 *   r20 null 拆分语义、like/对象值不可判定）；and/or 按 Kleene 三值逻辑短路。
 *
 * F-4 —— PayloadItem.type 未知值静默零校验：
 *   运行期只有 string/number/boolean/object 有 primitive 校验、Entity/Relation 走 base 概念校验。
 *   'json'/'timestamp' 等任意字符串此前被静默接受且不做任何校验（声明形同虚设）；
 *   type: 'Entity' 而无 base 同样整段跳过。修复：声明期白名单 + Entity/Relation 必须携带 base。
 */
import { describe, expect, test } from "vitest";
import {
    Action, Controller, Custom, Dictionary, Entity, Interaction, KlassByName, MatchExp,
    MonoSystem, Payload, PayloadItem, Property, Relation,
} from "interaqt";
import { PGLiteDB } from "@drivers";

async function waitForListeners() {
    await new Promise(resolve => setTimeout(resolve, 50));
}

describe("r21 F-1 — records match local evaluation mirrors SQL semantics", () => {
    test("match on a computed column: matching create is counted (was: silent skip)", async () => {
        const Task = Entity.create({
            name: "R21Task",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({ name: "isActive", type: "boolean", computed: (r: any) => r.status === "active" }),
                Property.create({ name: "value", type: "number" }),
            ],
        });
        const total = Dictionary.create({
            name: "r21ActiveTotal",
            type: "number",
            computation: Custom.create({
                name: "R21ActiveTotal",
                dataDeps: {
                    items: {
                        type: "records",
                        source: Task,
                        match: MatchExp.atom({ key: "isActive", value: ["=", true] }),
                        attributeQuery: ["isActive", "value"],
                    },
                },
                compute(dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalDataDeps: ["items"],
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Task], relations: [], dict: [total] });
        await controller.setup(true);

        await system.storage.create("R21Task", { status: "active", value: 7 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21ActiveTotal")).toBe(7);

        // 对照：不匹配的 create 不计入
        await system.storage.create("R21Task", { status: "done", value: 100 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21ActiveTotal")).toBe(7);
        await system.destroy();
    });

    test("match ['=', null] (IS NULL): create without the field is counted (was: silent skip)", async () => {
        const Item = Entity.create({
            name: "R21NullItem",
            properties: [
                Property.create({ name: "assignee", type: "string" }),
                Property.create({ name: "value", type: "number" }),
            ],
        });
        const total = Dictionary.create({
            name: "r21UnassignedTotal",
            type: "number",
            computation: Custom.create({
                name: "R21UnassignedTotal",
                dataDeps: {
                    items: {
                        type: "records",
                        source: Item,
                        match: MatchExp.atom({ key: "assignee", value: ["=", null] }),
                        attributeQuery: ["assignee", "value"],
                    },
                },
                compute(dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalDataDeps: ["items"],
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [total] });
        await controller.setup(true);

        await system.storage.create("R21NullItem", { value: 5 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21UnassignedTotal")).toBe(5);

        // 对照：字段有值的 create 不计入（IS NULL 不命中）
        await system.storage.create("R21NullItem", { assignee: "bob", value: 100 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21UnassignedTotal")).toBe(5);
        await system.destroy();
    });

    test("match ['!=', x]: create without the field is NOT counted (SQL three-valued logic; was: phantom entered)", async () => {
        const Item = Entity.create({
            name: "R21NeqItem",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({ name: "value", type: "number" }),
            ],
        });
        let incrementalCalls = 0;
        const total = Dictionary.create({
            name: "r21NotArchivedTotal",
            type: "number",
            computation: Custom.create({
                name: "R21NotArchivedTotal",
                dataDeps: {
                    items: {
                        type: "records",
                        source: Item,
                        match: MatchExp.atom({ key: "status", value: ["!=", "archived"] }),
                        attributeQuery: ["status", "value"],
                    },
                },
                compute(dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(_lastValue: any, event: any) {
                    incrementalCalls++;
                    return (_lastValue || 0) + (event.record?.value || 0);
                },
                incrementalDataDeps: [],
                useLastValue: true,
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [total] });
        await controller.setup(true);

        await system.storage.create("R21NeqItem", { value: 9 });
        await waitForListeners();
        // SQL 面：status IS NULL 的行不满足 status != 'archived'
        expect(await system.storage.find("R21NeqItem", MatchExp.atom({ key: "status", value: ["!=", "archived"] }), undefined, ["id"])).toHaveLength(0);
        expect(await system.storage.dict.get("r21NotArchivedTotal")).toBe(0);
        expect(incrementalCalls).toBe(0);

        // 对照：真正满足 != 的 create 走增量
        await system.storage.create("R21NeqItem", { status: "open", value: 4 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21NotArchivedTotal")).toBe(4);
        expect(incrementalCalls).toBe(1);
        await system.destroy();
    });

    test("match on relation path + update to aggregated own field recomputes (was: silent skip)", async () => {
        const Team = Entity.create({
            name: "R21Team",
            properties: [Property.create({ name: "type", type: "string" })],
        });
        const TaskB = Entity.create({
            name: "R21TaskB",
            properties: [Property.create({ name: "value", type: "number" })],
        });
        const rel = Relation.create({
            source: TaskB, sourceProperty: "team", target: Team, targetProperty: "tasks", type: "n:1",
        });
        const total = Dictionary.create({
            name: "r21TechTotal",
            type: "number",
            computation: Custom.create({
                name: "R21TechTotal",
                dataDeps: {
                    items: {
                        type: "records",
                        source: TaskB,
                        match: MatchExp.atom({ key: "team.type", value: ["=", "tech"] }),
                        attributeQuery: ["value"],
                    },
                },
                compute(dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalDataDeps: ["items"],
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Team, TaskB], relations: [rel], dict: [total] });
        await controller.setup(true);

        const team = await system.storage.create("R21Team", { type: "tech" });
        const task = await system.storage.create("R21TaskB", { value: 1, team: { id: team.id } });
        await waitForListeners();
        expect(await system.storage.dict.get("r21TechTotal")).toBe(1);

        // 更新与 match 无关但被聚合的自身字段：oldRecord 不携带 team 关系 → 本地不可判定 → 全量重算
        await system.storage.update("R21TaskB", MatchExp.atom({ key: "id", value: ["=", task.id] }), { value: 5 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21TechTotal")).toBe(5);
        await system.destroy();
    });

    test("control: match fields present in payload keep incremental skip/enter semantics", async () => {
        const Item = Entity.create({
            name: "R21CtrlItem",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({ name: "value", type: "number" }),
            ],
        });
        let computeCalls = 0;
        let incrementalCalls = 0;
        const total = Dictionary.create({
            name: "r21CtrlTotal",
            type: "number",
            computation: Custom.create({
                name: "R21CtrlTotal",
                dataDeps: {
                    items: {
                        type: "records",
                        source: Item,
                        match: MatchExp.atom({ key: "status", value: ["=", "active"] }),
                        attributeQuery: ["status", "value"],
                    },
                },
                compute(dataDeps: any) {
                    computeCalls++;
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
                    incrementalCalls++;
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalDataDeps: ["items"],
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [total] });
        await controller.setup(true);

        // 明确不匹配的 create 仍然 skip（本地可判定，不触发任何计算）
        await system.storage.create("R21CtrlItem", { status: "inactive", value: 100 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21CtrlTotal")).toBe(0);
        expect(computeCalls + incrementalCalls).toBe(0);

        // 明确匹配的 create 走增量
        await system.storage.create("R21CtrlItem", { status: "active", value: 3 });
        await waitForListeners();
        expect(await system.storage.dict.get("r21CtrlTotal")).toBe(3);
        expect(incrementalCalls).toBeGreaterThan(0);
        await system.destroy();
    });
});

describe("r21 F-4 — PayloadItem.type declaration whitelist", () => {
    test("unknown type strings are rejected at declaration", () => {
        expect(() => PayloadItem.create({ name: "meta", type: "json" })).toThrowError(/unsupported type "json"/);
        expect(() => PayloadItem.create({ name: "ts", type: "timestamp" })).toThrowError(/unsupported type/);
        expect(() => PayloadItem.create({ name: "n", type: "Number" })).toThrowError(/unsupported type/);
    });

    test("type 'Entity'/'Relation' without base is rejected (validation would be silently skipped)", () => {
        expect(() => PayloadItem.create({ name: "post", type: "Entity" })).toThrowError(/no base/);
        expect(() => PayloadItem.create({ name: "link", type: "Relation" })).toThrowError(/no base/);
    });

    test("duplicate payload item names are rejected at declaration", () => {
        expect(() => Payload.create({
            items: [
                PayloadItem.create({ name: "title", type: "string" }),
                PayloadItem.create({ name: "title", type: "number" }),
            ],
        })).toThrowError(/duplicate item name "title"/);
    });

    test("supported declarations still work end-to-end", async () => {
        const Post = Entity.create({ name: "R21Post", properties: [Property.create({ name: "title", type: "string" })] });
        const CreatePost = Interaction.create({
            name: "R21CreatePost",
            action: Action.create({ name: "r21CreatePost" }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: "title", type: "string", required: true }),
                    PayloadItem.create({ name: "post", type: "Entity", base: Post, isRef: true }),
                ],
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Post], relations: [], eventSources: [CreatePost] });
        await controller.setup(true);
        const post = await system.storage.create("R21Post", { title: "t" });

        const ok = await controller.dispatch(CreatePost, { user: { id: "u1" }, payload: { title: "hello", post: { id: post.id } } });
        expect(ok.error).toBeUndefined();

        const bad = await controller.dispatch(CreatePost, { user: { id: "u1" }, payload: { title: 123 } });
        expect(bad.error).toBeDefined();
        await system.destroy();
    });
});
