/**
 * Filtered membership combination matrix.
 *
 * 三轮 review 的共同规律：filtered entity/relation 的 bug 都出现在「正交特性的交叉点」上
 * （computed 列 × filtered、关系属性 × filtered、嵌套 filtered……），而单特性主干测试全绿。
 * 本 spec 用统一的生命周期驱动这些组合，并在每一步之后断言三方一致性不变式：
 *
 *     查询侧 find(filtered).length
 *  == 事件侧 累计(create) - 累计(delete)（filtered recordName 上的成员资格事件）
 *  == 计算侧 Count({record: filtered}) 的 dict 值
 *
 * 任何一方掉队（查询对、事件丢、计数错）都会在对应步骤立刻暴露。
 *
 * 覆盖的组合维度：
 *  - 谓词列类型：普通属性 / computed 属性 / 跨实体路径（related entity field）
 *  - 宿主类型：entity / relation（filtered relation）
 *  - filtered 层级：单层 / 嵌套（filtered on filtered）
 *  - 变更方式：create（命中/不命中）/ update 进入 / update 退出 / 无关字段 update / delete
 */
import { describe, expect, test } from "vitest";
import {
    Controller, Count, Dictionary, Entity, KlassByName, MatchExp, MonoSystem, Property, Relation,
} from "interaqt";
import { PGLiteDB } from "@drivers";

/**
 * 三方一致性校验器：包装 storage 变更，累计 filtered recordName 上的成员资格事件，
 * 每次断言 查询 == 事件推导 == Count。
 */
function createInvariantChecker(system: any, filteredNames: { recordName: string, countKey: string }[]) {
    const eventDerived: Record<string, number> = Object.fromEntries(filteredNames.map(f => [f.recordName, 0]));
    return {
        async mutate(operation: (events: any[]) => Promise<unknown>) {
            const events: any[] = [];
            await operation(events);
            for (const { recordName } of filteredNames) {
                for (const event of events) {
                    if (event.recordName !== recordName) continue;
                    if (event.type === "create") eventDerived[recordName]++;
                    if (event.type === "delete") eventDerived[recordName]--;
                }
            }
            return events;
        },
        async assertConsistent(step: string) {
            for (const { recordName, countKey } of filteredNames) {
                const queryCount = (await system.storage.find(recordName, undefined, undefined, ["id"])).length;
                const computedCount = await system.storage.dict.get(countKey);
                expect(eventDerived[recordName], `[${step}] ${recordName}: event-derived vs query`).toBe(queryCount);
                expect(computedCount, `[${step}] ${recordName}: Count dict vs query`).toBe(queryCount);
            }
        },
    };
}

describe("filtered membership combination matrix", () => {

    test("matrix: filtered entity over a PLAIN property", async () => {
        const Task = Entity.create({
            name: "MxPlainTask",
            properties: [
                Property.create({ name: "isActive", type: "boolean" }),
                Property.create({ name: "note", type: "string" }),
            ],
        });
        const ActiveTask = Entity.create({
            name: "MxPlainActiveTask",
            baseEntity: Task,
            matchExpression: MatchExp.atom({ key: "isActive", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [Task, ActiveTask], relations: [],
            dict: [Dictionary.create({
                name: "mxPlainCount", type: "number", collection: false,
                computation: Count.create({ record: ActiveTask, callback: () => true }),
            })],
        });
        await controller.setup(true);
        const check = createInvariantChecker(system, [{ recordName: "MxPlainActiveTask", countKey: "mxPlainCount" }]);

        let matching: any, nonMatching: any;
        await check.mutate(async events => { matching = await system.storage.create("MxPlainTask", { isActive: true, note: "a" }, events); });
        await check.assertConsistent("create matching");
        await check.mutate(async events => { nonMatching = await system.storage.create("MxPlainTask", { isActive: false, note: "b" }, events); });
        await check.assertConsistent("create non-matching");
        await check.mutate(events => system.storage.update("MxPlainTask", MatchExp.atom({ key: "id", value: ["=", nonMatching.id] }), { isActive: true }, events));
        await check.assertConsistent("update into membership");
        await check.mutate(events => system.storage.update("MxPlainTask", MatchExp.atom({ key: "id", value: ["=", matching.id] }), { isActive: false }, events));
        await check.assertConsistent("update out of membership");
        await check.mutate(events => system.storage.update("MxPlainTask", MatchExp.atom({ key: "id", value: ["=", nonMatching.id] }), { note: "changed" }, events));
        await check.assertConsistent("irrelevant field update");
        await check.mutate(events => system.storage.delete("MxPlainTask", MatchExp.atom({ key: "id", value: ["=", nonMatching.id] }), events));
        await check.assertConsistent("delete member");
        await db.close();
    });

    test("matrix: filtered entity over a COMPUTED property (input-field driven)", async () => {
        const Task = Entity.create({
            name: "MxComputedTask",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({ name: "note", type: "string" }),
                Property.create({
                    name: "isActive", type: "boolean",
                    computed: (record: any) => record.status === "active",
                }),
            ],
        });
        const ActiveTask = Entity.create({
            name: "MxComputedActiveTask",
            baseEntity: Task,
            matchExpression: MatchExp.atom({ key: "isActive", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [Task, ActiveTask], relations: [],
            dict: [Dictionary.create({
                name: "mxComputedCount", type: "number", collection: false,
                computation: Count.create({ record: ActiveTask, callback: () => true }),
            })],
        });
        await controller.setup(true);
        const check = createInvariantChecker(system, [{ recordName: "MxComputedActiveTask", countKey: "mxComputedCount" }]);

        let matching: any, nonMatching: any;
        await check.mutate(async events => { matching = await system.storage.create("MxComputedTask", { status: "active", note: "a" }, events); });
        await check.assertConsistent("create matching");
        await check.mutate(async events => { nonMatching = await system.storage.create("MxComputedTask", { status: "idle", note: "b" }, events); });
        await check.assertConsistent("create non-matching");
        // 关键组合：只更新 computed 的输入字段，谓词列由框架联动重算
        await check.mutate(events => system.storage.update("MxComputedTask", MatchExp.atom({ key: "id", value: ["=", nonMatching.id] }), { status: "active" }, events));
        await check.assertConsistent("update input-field into membership");
        await check.mutate(events => system.storage.update("MxComputedTask", MatchExp.atom({ key: "id", value: ["=", matching.id] }), { status: "done" }, events));
        await check.assertConsistent("update input-field out of membership");
        await check.mutate(events => system.storage.update("MxComputedTask", MatchExp.atom({ key: "id", value: ["=", nonMatching.id] }), { note: "changed" }, events));
        await check.assertConsistent("irrelevant field update");
        await check.mutate(events => system.storage.delete("MxComputedTask", MatchExp.atom({ key: "id", value: ["=", nonMatching.id] }), events));
        await check.assertConsistent("delete member");
        await db.close();
    });

    test("matrix: filtered entity over a CROSS-ENTITY predicate (related field + relink)", async () => {
        const Team = Entity.create({
            name: "MxTeam",
            properties: [Property.create({ name: "type", type: "string" })],
        });
        const User = Entity.create({
            name: "MxUser",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const UserTeam = Relation.create({
            source: User, sourceProperty: "team", target: Team, targetProperty: "members", type: "n:1",
        });
        const TechUser = Entity.create({
            name: "MxTechUser",
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: "team.type", value: ["=", "tech"] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [User, Team, TechUser], relations: [UserTeam],
            dict: [Dictionary.create({
                name: "mxTechUserCount", type: "number", collection: false,
                computation: Count.create({ record: TechUser, callback: () => true }),
            })],
        });
        await controller.setup(true);
        const check = createInvariantChecker(system, [{ recordName: "MxTechUser", countKey: "mxTechUserCount" }]);

        let tech: any, sales: any, user: any;
        await check.mutate(async events => {
            tech = await system.storage.create("MxTeam", { type: "tech" }, events);
            sales = await system.storage.create("MxTeam", { type: "sales" }, events);
        });
        await check.mutate(async events => { user = await system.storage.create("MxUser", { name: "u", team: { id: tech.id } }, events); });
        await check.assertConsistent("create matching (linked to tech team)");
        // 关联实体字段更新：整队退出
        await check.mutate(events => system.storage.update("MxTeam", MatchExp.atom({ key: "id", value: ["=", tech.id] }), { type: "ops" }, events));
        await check.assertConsistent("related entity field update out");
        await check.mutate(events => system.storage.update("MxTeam", MatchExp.atom({ key: "id", value: ["=", tech.id] }), { type: "tech" }, events));
        await check.assertConsistent("related entity field update back in");
        // 关系重连：换队导致成员资格变化
        await check.mutate(events => system.storage.update("MxUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), { team: { id: sales.id } }, events));
        await check.assertConsistent("relink to non-matching team");
        await check.mutate(events => system.storage.update("MxUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), { team: { id: tech.id } }, events));
        await check.assertConsistent("relink back to matching team");
        // 删除关联实体：级联退出
        await check.mutate(events => system.storage.delete("MxTeam", MatchExp.atom({ key: "id", value: ["=", tech.id] }), events));
        await check.assertConsistent("delete related team");
        await db.close();
    });

    test("matrix: filtered RELATION over a PLAIN relation property", async () => {
        const User = Entity.create({ name: "MxRelUser", properties: [Property.create({ name: "name", type: "string" })] });
        const Post = Entity.create({ name: "MxRelPost", properties: [Property.create({ name: "title", type: "string" })] });
        const UserPost = Relation.create({
            source: User, sourceProperty: "posts", target: Post, targetProperty: "author", type: "1:n",
            properties: [
                Property.create({ name: "isPinned", type: "boolean" }),
                Property.create({ name: "weight", type: "number" }),
            ],
        });
        const PinnedPosts = Relation.create({
            name: "MxPinnedPosts",
            baseRelation: UserPost,
            sourceProperty: "pinnedPosts",
            targetProperty: "pinnedAuthor",
            matchExpression: MatchExp.atom({ key: "isPinned", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [User, Post], relations: [UserPost, PinnedPosts],
            dict: [Dictionary.create({
                name: "mxPinnedCount", type: "number", collection: false,
                computation: Count.create({ record: PinnedPosts, callback: () => true }),
            })],
        });
        await controller.setup(true);
        const check = createInvariantChecker(system, [{ recordName: "MxPinnedPosts", countKey: "mxPinnedCount" }]);
        const relName = UserPost.name!;

        const user = await system.storage.create("MxRelUser", { name: "u" });
        const postA = await system.storage.create("MxRelPost", { title: "a" });
        const postB = await system.storage.create("MxRelPost", { title: "b" });
        let relA: any, relB: any;
        await check.mutate(async events => { relA = await system.storage.create(relName, { source: { id: user.id }, target: { id: postA.id }, isPinned: true, weight: 1 }, events); });
        await check.assertConsistent("create matching relation");
        await check.mutate(async events => { relB = await system.storage.create(relName, { source: { id: user.id }, target: { id: postB.id }, isPinned: false, weight: 1 }, events); });
        await check.assertConsistent("create non-matching relation");
        await check.mutate(events => system.storage.update(relName, MatchExp.atom({ key: "id", value: ["=", relB.id] }), { isPinned: true }, events));
        await check.assertConsistent("relation update into membership");
        await check.mutate(events => system.storage.update(relName, MatchExp.atom({ key: "id", value: ["=", relA.id] }), { isPinned: false }, events));
        await check.assertConsistent("relation update out of membership");
        await check.mutate(events => system.storage.update(relName, MatchExp.atom({ key: "id", value: ["=", relB.id] }), { weight: 9 }, events));
        await check.assertConsistent("irrelevant relation field update");
        await check.mutate(events => system.storage.delete(relName, MatchExp.atom({ key: "id", value: ["=", relB.id] }), events));
        await check.assertConsistent("delete member relation");
        await db.close();
    });

    test("matrix: filtered RELATION over a COMPUTED relation property", async () => {
        const User = Entity.create({ name: "MxCRelUser", properties: [Property.create({ name: "name", type: "string" })] });
        const Post = Entity.create({ name: "MxCRelPost", properties: [Property.create({ name: "title", type: "string" })] });
        const UserPost = Relation.create({
            source: User, sourceProperty: "posts", target: Post, targetProperty: "author", type: "1:n",
            properties: [
                Property.create({ name: "amount", type: "number" }),
                Property.create({
                    name: "isBig", type: "boolean",
                    computed: (record: any) => (record.amount ?? 0) >= 100,
                }),
            ],
        });
        const BigDeals = Relation.create({
            name: "MxBigDeals",
            baseRelation: UserPost,
            sourceProperty: "bigDeals",
            targetProperty: "bigDealAuthor",
            matchExpression: MatchExp.atom({ key: "isBig", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [User, Post], relations: [UserPost, BigDeals],
            dict: [Dictionary.create({
                name: "mxBigDealCount", type: "number", collection: false,
                computation: Count.create({ record: BigDeals, callback: () => true }),
            })],
        });
        await controller.setup(true);
        const check = createInvariantChecker(system, [{ recordName: "MxBigDeals", countKey: "mxBigDealCount" }]);
        const relName = UserPost.name!;

        const user = await system.storage.create("MxCRelUser", { name: "u" });
        const postA = await system.storage.create("MxCRelPost", { title: "a" });
        const postB = await system.storage.create("MxCRelPost", { title: "b" });
        let relA: any, relB: any;
        await check.mutate(async events => { relA = await system.storage.create(relName, { source: { id: user.id }, target: { id: postA.id }, amount: 500 }, events); });
        await check.assertConsistent("create matching (computed via input)");
        await check.mutate(async events => { relB = await system.storage.create(relName, { source: { id: user.id }, target: { id: postB.id }, amount: 10 }, events); });
        await check.assertConsistent("create non-matching");
        // 关键组合：只更新 computed 的输入字段（关系记录上）
        await check.mutate(events => system.storage.update(relName, MatchExp.atom({ key: "id", value: ["=", relB.id] }), { amount: 200 }, events));
        await check.assertConsistent("relation input-field update into membership");
        await check.mutate(events => system.storage.update(relName, MatchExp.atom({ key: "id", value: ["=", relA.id] }), { amount: 1 }, events));
        await check.assertConsistent("relation input-field update out of membership");
        await check.mutate(events => system.storage.delete(relName, MatchExp.atom({ key: "id", value: ["=", relB.id] }), events));
        await check.assertConsistent("delete member relation");
        await db.close();
    });

    test("matrix: NESTED filtered entity (filtered on filtered, plain + computed mix)", async () => {
        const Task = Entity.create({
            name: "MxNestedTask",
            properties: [
                Property.create({ name: "priority", type: "string" }),
                Property.create({ name: "status", type: "string" }),
                Property.create({
                    name: "isActive", type: "boolean",
                    computed: (record: any) => record.status === "active",
                }),
            ],
        });
        const HighTask = Entity.create({
            name: "MxHighTask",
            baseEntity: Task,
            matchExpression: MatchExp.atom({ key: "priority", value: ["=", "high"] }),
        });
        // 嵌套：在 filtered 上再 filter，且谓词是 computed 列
        const HighActiveTask = Entity.create({
            name: "MxHighActiveTask",
            baseEntity: HighTask,
            matchExpression: MatchExp.atom({ key: "isActive", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [Task, HighTask, HighActiveTask], relations: [],
            dict: [
                Dictionary.create({
                    name: "mxHighCount", type: "number", collection: false,
                    computation: Count.create({ record: HighTask, callback: () => true }),
                }),
                Dictionary.create({
                    name: "mxHighActiveCount", type: "number", collection: false,
                    computation: Count.create({ record: HighActiveTask, callback: () => true }),
                }),
            ],
        });
        await controller.setup(true);
        const check = createInvariantChecker(system, [
            { recordName: "MxHighTask", countKey: "mxHighCount" },
            { recordName: "MxHighActiveTask", countKey: "mxHighActiveCount" },
        ]);

        let task: any;
        await check.mutate(async events => { task = await system.storage.create("MxNestedTask", { priority: "high", status: "active" }, events); });
        await check.assertConsistent("create matching both levels");
        // 内层退出（computed 输入字段），外层不变
        await check.mutate(events => system.storage.update("MxNestedTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), { status: "done" }, events));
        await check.assertConsistent("inner level exit via computed input");
        // 外层退出 → 内层即使谓词命中也不可见
        await check.mutate(events => system.storage.update("MxNestedTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), { priority: "low", status: "active" }, events));
        await check.assertConsistent("outer level exit");
        // 双层同时进入
        await check.mutate(events => system.storage.update("MxNestedTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), { priority: "high" }, events));
        await check.assertConsistent("re-enter both levels");
        await check.mutate(events => system.storage.delete("MxNestedTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), events));
        await check.assertConsistent("delete member");
        await db.close();
    });
});
