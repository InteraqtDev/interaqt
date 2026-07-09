/**
 * Regression tests for the 2026-07-09 third-round deep review fixes.
 * See agentspace/output/deep-review-2026-07-09-r3.md for the original findings.
 *
 * - F-1: filtered entity over a `computed` property emits membership events when the
 *        input field changes (changedFields = actual write set, same source as event keys)
 * - F-2: filtered relation attributeQuery accepts compound (and/or) matchExpression
 * - F-3: Custom records dataDep without attributeQuery fails fast at setup;
 *        explicit [] means "membership only" and stays legal
 * - F-4: x:n relation attribute on a relation record (relation-as-source) is queryable
 *        from the relation side (direct query and nested & query)
 * - F-5: Custom incrementalDataDeps only feeds declared-dep events to incrementalCompute;
 *        events from other deps trigger full recompute; unrelated dict creates are filtered by key
 * - R-1: StateMachine trigger.keys referencing relation attributes / unknown properties /
 *        empty arrays are rejected at setup
 * - R-2: SQLiteDB insert() returns RETURNING rows; created records carry no driver metadata
 * - R-3: PropertyEvery/PropertyAny fall back to fullRecompute when the relation record
 *        is gone between event and incremental computation (no bare dereference crash)
 * - R-9: recomputeFilteredMemberships evaluates old membership on the OLD base record
 */
import { describe, expect, test } from "vitest";
import {
    Controller, Count, Custom, Dictionary, Entity, Every, KlassByName, MatchExp, MonoSystem,
    Property, Relation, StateMachine, StateNode, StateTransfer, createMigrationManifest,
} from "interaqt";
import { recomputeFilteredMemberships } from "@runtime";
import { PGLiteDB, SQLiteDB } from "@drivers";

async function approveGeneratedMigrationDiff(controller: Controller) {
    const diff = await controller.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true });
    const decisions = [
        ...diff.decisions,
        ...diff.requiredDecisions.map((requirement: any) => {
            if (requirement.kind === "computation") {
                return { kind: "computation" as const, id: requirement.id, dataContext: requirement.dataContext, decision: requirement.recommendedDecision, reason: "approved by regression test" };
            }
            if (requirement.kind === "event-rebuild-handler") {
                return { kind: "event-rebuild-handler" as const, dataContext: requirement.dataContext, handlerRef: requirement.dataContext, reason: "approved by regression test" };
            }
            if (requirement.kind === "destructive-scope") {
                return { kind: "destructive-scope" as const, dataContext: requirement.dataContext, recordName: requirement.recordName, ids: requirement.ids, reason: "approved by regression test" };
            }
            return { ...requirement, reason: "approved by regression test" };
        }),
    ];
    return { ...diff, status: "approved" as const, decisions };
}

describe("review fixes 2026-07-09 r3", () => {

    // -------------------------------------------------------------------------
    // F-1: filtered entity over computed property
    // -------------------------------------------------------------------------
    test("F-1: updating the input of a computed predicate column emits membership events and updates downstream Count", async () => {
        const Task = Entity.create({
            name: "R3FixTask",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({
                    name: "isActive", type: "boolean",
                    computed: (record: any) => record.status === "active",
                }),
            ],
        });
        const ActiveTask = Entity.create({
            name: "R3FixActiveTask",
            baseEntity: Task,
            matchExpression: MatchExp.atom({ key: "isActive", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system, entities: [Task, ActiveTask], relations: [],
            dict: [Dictionary.create({
                name: "r3FixActiveTaskCount", type: "number", collection: false,
                computation: Count.create({ record: ActiveTask, callback: () => true }),
            })],
        });
        await controller.setup(true);

        const task = await system.storage.create("R3FixTask", { status: "active" });
        expect(await system.storage.dict.get("r3FixActiveTaskCount")).toBe(1);

        // leave: computed column flips through an update of its input field only
        const leaveEvents: any[] = [];
        await system.storage.update("R3FixTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), { status: "inactive" }, leaveEvents);
        expect(leaveEvents.filter(e => e.recordName === "R3FixActiveTask" && e.type === "delete")).toHaveLength(1);
        // the host update event carries the computed column in keys (same write set)
        const hostUpdate = leaveEvents.find(e => e.recordName === "R3FixTask" && e.type === "update");
        expect(hostUpdate?.keys).toContain("status");
        expect(hostUpdate?.keys).toContain("isActive");
        expect(await system.storage.find("R3FixActiveTask", undefined, undefined, ["id"])).toHaveLength(0);
        expect(await system.storage.dict.get("r3FixActiveTaskCount")).toBe(0);

        // re-enter
        const enterEvents: any[] = [];
        await system.storage.update("R3FixTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), { status: "active" }, enterEvents);
        expect(enterEvents.filter(e => e.recordName === "R3FixActiveTask" && e.type === "create")).toHaveLength(1);
        expect(await system.storage.dict.get("r3FixActiveTaskCount")).toBe(1);

        // irrelevant update: no membership events
        const noopEvents: any[] = [];
        await system.storage.update("R3FixTask", MatchExp.atom({ key: "id", value: ["=", task.id] }), { status: "active" }, noopEvents);
        expect(noopEvents.filter(e => e.recordName === "R3FixActiveTask")).toHaveLength(0);
        expect(await system.storage.dict.get("r3FixActiveTaskCount")).toBe(1);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-2: filtered relation compound matchExpression
    // -------------------------------------------------------------------------
    test("F-2: filtered relation attributeQuery accepts compound and single-atom matchExpression", async () => {
        const User = Entity.create({
            name: "R3FixUser",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const Post = Entity.create({
            name: "R3FixPost",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string" }),
            ],
        });
        const UserPost = Relation.create({
            source: User, sourceProperty: "posts",
            target: Post, targetProperty: "author",
            type: "1:n",
            properties: [Property.create({ name: "isPinned", type: "boolean" })],
        });
        const PinnedPosts = Relation.create({
            name: "R3FixPinnedPosts",
            baseRelation: UserPost,
            sourceProperty: "pinnedPosts",
            targetProperty: "pinnedAuthor",
            matchExpression: MatchExp.atom({ key: "isPinned", value: ["=", true] }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User, Post], relations: [UserPost, PinnedPosts] });
        await controller.setup(true);

        const user = await system.storage.create("R3FixUser", { name: "u" });
        const relationName = UserPost.name!;
        const createPinnedPost = async (title: string, status: string, isPinned: boolean) => {
            const post = await system.storage.create("R3FixPost", { title, status });
            await system.storage.create(relationName, { source: { id: user.id }, target: { id: post.id }, isPinned });
        };
        await createPinnedPost("Alpha", "published", true);
        await createPinnedPost("Alps", "draft", true);
        await createPinnedPost("Beta", "published", true);
        await createPinnedPost("Album", "published", false);

        // compound .and()
        const andRows = await system.storage.find("R3FixUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, [
            "name",
            ["pinnedPosts", {
                attributeQuery: ["title"],
                matchExpression: MatchExp.atom({ key: "title", value: ["like", "Al%"] })
                    .and({ key: "status", value: ["=", "published"] }),
            }],
        ]);
        expect((andRows[0].pinnedPosts ?? []).map((p: any) => p.title).sort()).toEqual(["Alpha"]);

        // compound .or()
        const orRows = await system.storage.find("R3FixUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, [
            "name",
            ["pinnedPosts", {
                attributeQuery: ["title"],
                matchExpression: MatchExp.atom({ key: "title", value: ["=", "Alpha"] })
                    .or({ key: "title", value: ["=", "Beta"] }),
            }],
        ]);
        expect((orRows[0].pinnedPosts ?? []).map((p: any) => p.title).sort()).toEqual(["Alpha", "Beta"]);

        // single atom regression (previously working path)
        const atomRows = await system.storage.find("R3FixUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, [
            "name",
            ["pinnedPosts", {
                attributeQuery: ["title"],
                matchExpression: MatchExp.atom({ key: "status", value: ["=", "published"] }),
            }],
        ]);
        expect((atomRows[0].pinnedPosts ?? []).map((p: any) => p.title).sort()).toEqual(["Alpha", "Beta"]);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-3: Custom records dataDep requires explicit attributeQuery
    // -------------------------------------------------------------------------
    test("F-3: Custom records dataDep without attributeQuery is rejected at setup", async () => {
        const Item = Entity.create({
            name: "R3FixDepItem",
            properties: [Property.create({ name: "price", type: "number" })],
        });
        const dict = Dictionary.create({
            name: "r3FixDepTotal", type: "number", collection: false,
            computation: Custom.create({
                name: "R3FixDepTotal",
                dataDeps: { items: { type: "records", source: Item } }, // no attributeQuery
                compute: async (dataDeps: any) => (dataDeps.items || []).length,
                getInitialValue: () => 0,
            }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        // 校验发生在 Controller 构造期（Scheduler 创建 handle 时）
        expect(() => new Controller({ system, entities: [Item], relations: [], dict: [dict] })).toThrow(/must declare attributeQuery/);
        await db.close();
    });

    test("F-3: Custom records dataDep with declared attributeQuery recomputes on field update", async () => {
        const Item = Entity.create({
            name: "R3FixDepOkItem",
            properties: [Property.create({ name: "price", type: "number" })],
        });
        const dict = Dictionary.create({
            name: "r3FixDepOkTotal", type: "number", collection: false,
            computation: Custom.create({
                name: "R3FixDepOkTotal",
                dataDeps: { items: { type: "records", source: Item, attributeQuery: ["price"] } },
                compute: async (dataDeps: any) => (dataDeps.items || []).reduce((acc: number, item: any) => acc + (item.price ?? 0), 0),
                getInitialValue: () => 0,
            }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [dict] });
        await controller.setup(true);
        const item = await system.storage.create("R3FixDepOkItem", { price: 10 });
        expect(await system.storage.dict.get("r3FixDepOkTotal")).toBe(10);
        await system.storage.update("R3FixDepOkItem", MatchExp.atom({ key: "id", value: ["=", item.id] }), { price: 99 });
        expect(await system.storage.dict.get("r3FixDepOkTotal")).toBe(99);
        await db.close();
    });

    test("F-3: Custom records dataDep with explicit empty attributeQuery is legal membership-only dependency", async () => {
        const Item = Entity.create({
            name: "R3FixDepIdItem",
            properties: [Property.create({ name: "price", type: "number" })],
        });
        const dict = Dictionary.create({
            name: "r3FixDepIdCount", type: "number", collection: false,
            computation: Custom.create({
                name: "R3FixDepIdCount",
                dataDeps: { items: { type: "records", source: Item, attributeQuery: [] } },
                compute: async (dataDeps: any) => (dataDeps.items || []).length,
                getInitialValue: () => 0,
            }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [dict] });
        await controller.setup(true);
        await system.storage.create("R3FixDepIdItem", { price: 1 });
        await system.storage.create("R3FixDepIdItem", { price: 2 });
        expect(await system.storage.dict.get("r3FixDepIdCount")).toBe(2);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-4: relation-as-source x:n attribute queryable from the relation side
    // -------------------------------------------------------------------------
    test("F-4: x:n relation attribute on a relation record works for writes and queries from every side", async () => {
        const Profile = Entity.create({ name: "R3FixProfile", properties: [Property.create({ name: "bio", type: "string" })] });
        const Tag = Entity.create({ name: "R3FixTag", properties: [Property.create({ name: "label", type: "string" })] });
        const Person = Entity.create({ name: "R3FixPerson", properties: [Property.create({ name: "name", type: "string" })] });
        const PersonProfile = Relation.create({
            source: Person, sourceProperty: "profile", target: Profile, targetProperty: "owner", type: "1:1",
        });
        const LinkTag = Relation.create({
            source: PersonProfile, sourceProperty: "tags", target: Tag, targetProperty: "links", type: "n:n",
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Person, Profile, Tag], relations: [PersonProfile, LinkTag] });
        await controller.setup(true);

        await system.storage.create("R3FixPerson", { name: "p1", profile: { bio: "hi" } });
        await system.storage.create("R3FixPerson", { name: "p2" }); // no profile
        const relName = PersonProfile.name!;
        const rel = await system.storage.findOne(relName, undefined, undefined, ["id"]);
        await system.storage.create("R3FixTag", { label: "vip", links: [{ id: rel.id }] });

        // relation-side direct query
        const rels = await system.storage.find(relName, undefined, undefined, ["id", ["tags", { attributeQuery: ["label"] }]]);
        expect(rels).toHaveLength(1);
        expect((rels[0].tags ?? []).map((t: any) => t.label)).toEqual(["vip"]);

        // entity-side nested & query, including a person with NO profile (null x:1 must not crash)
        const people = await system.storage.find("R3FixPerson", undefined, undefined, [
            "name",
            ["profile", { attributeQuery: ["bio", ["&", { attributeQuery: [["tags", { attributeQuery: ["label"] }]] }]] }],
        ]);
        expect(people).toHaveLength(2);
        const withProfile = people.find((p: any) => p.name === "p1")!;
        expect((withProfile.profile["&"].tags ?? []).map((t: any) => t.label)).toEqual(["vip"]);

        // tag-side query still works
        const tags = await system.storage.find("R3FixTag", undefined, undefined, ["label", ["links", { attributeQuery: ["id"] }]]);
        expect(tags[0].links).toHaveLength(1);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-5: Custom incrementalDataDeps event contract
    // -------------------------------------------------------------------------
    test("F-5: own-output and undeclared dict events never reach incrementalCompute; declared dep events do", async () => {
        // 契约（transactionRetry / migration spec 同样依赖）：incrementalDataDeps 声明的是
        // "增量执行时解析并传入的依赖值"，任何已声明 dataDep 的事件都进入 incrementalCompute，
        // 由用户按 event.recordName 区分。本测试锁定的是修复点：
        // 计算自身的输出 dict 以及未声明的 dict 的 create/update 事件不再触发计算（source map 按 key 过滤）。
        const Item = Entity.create({ name: "R3FixIncItem", properties: [Property.create({ name: "value", type: "number" })] });
        const threshold = Dictionary.create({ name: "r3FixThreshold", type: "number", collection: false, defaultValue: () => 1 });
        const unrelated = Dictionary.create({ name: "r3FixIncUnrelated", type: "number", collection: false, defaultValue: () => 0 });
        const incrementalEvents: any[] = [];
        const sumDict = Dictionary.create({
            name: "r3FixIncSum", type: "number", collection: false,
            computation: Custom.create({
                name: "R3FixIncSum",
                useLastValue: true,
                dataDeps: {
                    items: { type: "records", source: Item, attributeQuery: ["value"] },
                    threshold: { type: "global", source: threshold },
                },
                incrementalDataDeps: ["threshold"],
                incrementalCompute: async function (lastValue: number, event: any) {
                    incrementalEvents.push({ recordName: event?.recordName, type: event?.type, key: event?.record?.key });
                    // 按契约区分事件来源
                    if (event?.recordName === "R3FixIncItem") {
                        return (lastValue ?? 0) + (event.record?.value ?? 0);
                    }
                    return lastValue ?? 0;
                },
                compute: async function (dataDeps: any) {
                    return (dataDeps.items || []).reduce((acc: number, item: any) => acc + (item.value ?? 0), 0);
                },
                getInitialValue: () => 0,
            }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [threshold, sumDict, unrelated] });
        await controller.setup(true);

        await system.storage.create("R3FixIncItem", { value: 5 });
        expect(await system.storage.dict.get("r3FixIncSum")).toBe(5);
        await system.storage.dict.set("r3FixIncUnrelated", 99);
        await system.storage.dict.set("r3FixThreshold", 42);
        await system.storage.create("R3FixIncItem", { value: 7 });
        expect(await system.storage.dict.get("r3FixIncSum")).toBe(12);

        // 到达 incrementalCompute 的 dict 事件只可能来自声明的 threshold；
        // 自身输出 dict（r3FixIncSum）与无关 dict（r3FixIncUnrelated）的事件都被 source map 过滤。
        const dictEvents = incrementalEvents.filter(e => e.recordName === "_Dictionary_");
        expect(dictEvents.length).toBeGreaterThan(0);
        expect(dictEvents.every(e => e.key === "r3FixThreshold")).toBe(true);
        await db.close();
    });

    test("F-5: unrelated dictionary creates/updates no longer trigger computations with global deps", async () => {
        const threshold = Dictionary.create({ name: "r3FixKeyedThreshold", type: "number", collection: false, defaultValue: () => 1 });
        let computeCalls = 0;
        const doubled = Dictionary.create({
            name: "r3FixKeyedDoubled", type: "number", collection: false,
            computation: Custom.create({
                name: "R3FixKeyedDoubled",
                dataDeps: { threshold: { type: "global", source: threshold } },
                compute: async function (dataDeps: any) {
                    computeCalls++;
                    return (dataDeps.threshold ?? 0) * 2;
                },
                getInitialValue: () => 0,
            }),
        });
        const unrelated = Dictionary.create({ name: "r3FixUnrelatedDict", type: "number", collection: false, defaultValue: () => 0 });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [], relations: [], dict: [threshold, doubled, unrelated] });
        await controller.setup(true);

        const callsAfterSetup = computeCalls;
        // mutating an unrelated dict must not re-trigger the computation
        await system.storage.dict.set("r3FixUnrelatedDict", 123);
        expect(computeCalls).toBe(callsAfterSetup);
        // mutating the declared dep does
        await system.storage.dict.set("r3FixKeyedThreshold", 21);
        expect(computeCalls).toBe(callsAfterSetup + 1);
        expect(await system.storage.dict.get("r3FixKeyedDoubled")).toBe(42);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-1: trigger.keys validation at setup
    // -------------------------------------------------------------------------
    const buildKeysController = (keys: string[], db: PGLiteDB) => {
        const Profile = Entity.create({ name: `R3KeysProfile${keys.join("_") || "empty"}`, properties: [Property.create({ name: "bio", type: "string" })] });
        const draft = StateNode.create({ name: "draft" });
        const assigned = StateNode.create({ name: "assigned" });
        const personName = `R3KeysPerson${keys.join("_") || "empty"}`;
        const Person = Entity.create({
            name: personName,
            properties: [
                Property.create({ name: "name", type: "string" }),
                Property.create({
                    name: "status", type: "string",
                    computation: StateMachine.create({
                        states: [draft, assigned],
                        initialState: draft,
                        transfers: [StateTransfer.create({
                            trigger: { recordName: personName, type: "update", keys } as any,
                            current: draft, next: assigned,
                            computeTarget: (event: any) => ({ id: event.oldRecord?.id ?? event.record?.id }),
                        })],
                    }),
                }),
            ],
        });
        const PersonProfile = Relation.create({
            source: Person, sourceProperty: "profile", target: Profile, targetProperty: "owner", type: "1:1",
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        return new Controller({ system, entities: [Person, Profile], relations: [PersonProfile] });
    };

    test("R-1: trigger.keys referencing a relation attribute is rejected at setup", async () => {
        const db = new PGLiteDB();
        // 校验发生在 Controller 构造期（Scheduler 创建 handle 时）
        expect(() => buildKeysController(["profile"], db)).toThrow(/relation attribute/);
        await db.close();
    });

    test("R-1: trigger.keys referencing an unknown property is rejected at setup", async () => {
        const db = new PGLiteDB();
        expect(() => buildKeysController(["nmae"], db)).toThrow(/does not match any declared property/);
        await db.close();
    });

    test("R-1: empty trigger.keys array is rejected at setup", async () => {
        const db = new PGLiteDB();
        expect(() => buildKeysController([], db)).toThrow(/non-empty array/);
        await db.close();
    });

    test("R-1: trigger.keys on merged entity properties (from inputEntities) is accepted", async () => {
        // merged entity 自身没有 properties，有效属性来自输入实体的并集——校验不能误拒。
        const Employee = Entity.create({
            name: "R3KeysMergedEmployee",
            properties: [Property.create({ name: "level", type: "number" })],
        });
        const Partner = Entity.create({
            name: "R3KeysMergedPartner",
            properties: [Property.create({ name: "level", type: "number" })],
        });
        const Staff = Entity.create({ name: "R3KeysMergedStaff", inputEntities: [Employee, Partner] });
        const idle = StateNode.create({ name: "idle" });
        const touched = StateNode.create({ name: "touched" });
        const marker = Dictionary.create({
            name: "r3KeysMergedMarker", type: "string", collection: false,
            computation: StateMachine.create({
                states: [idle, touched],
                initialState: idle,
                transfers: [StateTransfer.create({
                    trigger: { recordName: "R3KeysMergedStaff", type: "update", keys: ["level"] } as any,
                    current: idle, next: touched,
                })],
            }),
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        // 构造不抛错即为通过（level 是输入实体贡献的合法属性）
        const controller = new Controller({ system, entities: [Employee, Partner, Staff], relations: [], dict: [marker] });
        await controller.setup(true);
        expect(await system.storage.dict.get("r3KeysMergedMarker")).toBe("idle");
        await db.close();
    });

    test("R-1: trigger.keys on declared value properties still transitions", async () => {
        const db = new PGLiteDB();
        const controller = buildKeysController(["name"], db);
        await controller.setup(true);
        const system = controller.system;
        const personName = "R3KeysPersonname";
        const person = await system.storage.create(personName, { name: "p" });
        await system.storage.update(personName, MatchExp.atom({ key: "id", value: ["=", person.id] }), { name: "p2" });
        const row = await system.storage.findOne(personName, MatchExp.atom({ key: "id", value: ["=", person.id] }), undefined, ["*"]);
        expect(row.status).toBe("assigned");
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-2: SQLite insert() driver contract
    // -------------------------------------------------------------------------
    test("R-2: SQLiteDB created records carry no better-sqlite3 run() metadata", async () => {
        const Doc = Entity.create({
            name: "R3SqliteDoc",
            properties: [Property.create({ name: "title", type: "string" })],
        });
        const db = new SQLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Doc], relations: [] });
        await controller.setup(true);
        const events: any[] = [];
        const created = await system.storage.create("R3SqliteDoc", { title: "t" }, events);
        expect(created).not.toHaveProperty("changes");
        expect(created).not.toHaveProperty("lastInsertRowid");
        const createEvent = events.find(e => e.type === "create" && e.recordName === "R3SqliteDoc");
        expect(createEvent?.record).not.toHaveProperty("changes");
        expect(createEvent?.record).not.toHaveProperty("lastInsertRowid");
        const row = await system.storage.findOne("R3SqliteDoc", MatchExp.atom({ key: "id", value: ["=", created.id] }), undefined, ["*"]);
        expect(row.title).toBe("t");
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-3: PropertyEvery/PropertyAny fullRecompute fallback when relation row is gone
    // -------------------------------------------------------------------------
    test("R-3: PropertyEvery incrementalCompute falls back to fullRecompute when the relation record is not found", async () => {
        const Task = Entity.create({
            name: "R3GuardTask",
            properties: [Property.create({ name: "done", type: "boolean" })],
        });
        const Project = Entity.create({
            name: "R3GuardProject",
            properties: [
                Property.create({ name: "name", type: "string" }),
                Property.create({
                    name: "allDone", type: "boolean",
                    computation: Every.create({
                        record: Task, property: "tasks",
                        attributeQuery: ["done"],
                        callback: (task: any) => !!task.done,
                        notEmpty: true,
                    }),
                }),
            ],
        });
        const ProjectTask = Relation.create({
            source: Project, sourceProperty: "tasks", target: Task, targetProperty: "project", type: "1:n",
        });
        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Project, Task], relations: [ProjectTask] });
        await controller.setup(true);

        const project = await system.storage.create("R3GuardProject", { name: "p" });
        await system.storage.create("R3GuardTask", { done: true, project: { id: project.id } });

        // locate the PropertyEvery handle and invoke it with a synthetic create event
        // whose relation id does not exist (simulates the delete race)
        const handles = Array.from((controller.scheduler as any).computationsHandles.values()) as any[];
        const everyHandle = handles.find(handle => handle.dataContext?.type === "property" && handle.dataContext?.id?.name === "allDone");
        expect(everyHandle).toBeTruthy();
        const syntheticEvent = {
            recordName: "R3GuardProject",
            type: "update",
            relatedAttribute: ["tasks"],
            record: { id: project.id },
            oldRecord: { id: project.id },
            relatedMutationEvent: {
                recordName: everyHandle.relation.name,
                type: "create",
                record: { id: "00000000-0000-0000-0000-000000000000" },
            },
        };
        const result = await system.storage.runInTransaction({ name: "r3-guard-test" }, async () =>
            everyHandle.incrementalCompute(true, syntheticEvent, { id: project.id }, {})
        );
        expect(result?.type ?? result?.constructor?.name).toMatch(/fullRecompute|ComputationResultFullRecompute/i);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // I-18: filtered RELATION predicate change during migration (coverage gap:
    //       r2 F-1 covered filtered entities only)
    // -------------------------------------------------------------------------
    test("I-18: changing a filtered relation predicate updates downstream Count after migration", async () => {
        const db = new PGLiteDB();
        const buildModel = (threshold: number) => {
            const User = new Entity({
                name: "R3MigRelUser",
                properties: [new Property({ name: "name", type: "string" }, { uuid: "r3-migrel-user-name" })],
            }, { uuid: "r3-migrel-user" });
            const Post = new Entity({
                name: "R3MigRelPost",
                properties: [new Property({ name: "title", type: "string" }, { uuid: "r3-migrel-post-title" })],
            }, { uuid: "r3-migrel-post" });
            const UserPost = new Relation({
                source: User, sourceProperty: "posts", target: Post, targetProperty: "author", type: "1:n",
                properties: [new Property({ name: "amount", type: "number" }, { uuid: "r3-migrel-amount" })],
            }, { uuid: "r3-migrel-userpost" });
            const BigDeals = new Relation({
                name: "R3MigBigDeals",
                baseRelation: UserPost,
                sourceProperty: "bigDeals",
                targetProperty: "bigDealAuthor",
                matchExpression: MatchExp.atom({ key: "amount", value: [">=", threshold] }),
            } as any, { uuid: "r3-migrel-bigdeals" });
            const countDict = new Dictionary({
                name: "r3MigBigDealCount", type: "number", collection: false,
                computation: new Count({ record: BigDeals }, { uuid: "r3-migrel-count" }),
            }, { uuid: "r3-migrel-count-dict" });
            return { User, Post, UserPost, BigDeals, countDict };
        };

        const v1 = buildModel(100);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({
            system: systemV1, entities: [v1.User, v1.Post], relations: [v1.UserPost, v1.BigDeals], dict: [v1.countDict],
        });
        await controllerV1.setup(true);
        const user = await systemV1.storage.create("R3MigRelUser", { name: "u" });
        const relName = v1.UserPost.name!;
        for (const amount of [10, 50, 200]) {
            const post = await systemV1.storage.create("R3MigRelPost", { title: `p${amount}` });
            await systemV1.storage.create(relName, { source: { id: user.id }, target: { id: post.id }, amount });
        }
        expect(await systemV1.storage.dict.get("r3MigBigDealCount")).toBe(1);

        // v2: 只放宽谓词（>=100 → >=50）
        const v2 = buildModel(50);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({
            system: systemV2, entities: [v2.User, v2.Post], relations: [v2.UserPost, v2.BigDeals], dict: [v2.countDict],
        });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        expect(JSON.stringify(approvedDiff.changes)).toMatch(/filtered-predicate-changed/);
        await controllerV2.migrate({ approvedDiff });

        expect(await systemV2.storage.find("R3MigBigDeals", undefined, undefined, ["id"])).toHaveLength(2);
        expect(await systemV2.storage.dict.get("r3MigBigDealCount")).toBe(2);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-9: recomputeFilteredMemberships uses the OLD base for old membership
    // -------------------------------------------------------------------------
    test("R-9: rebase membership diff evaluates old members on the old base record", async () => {
        const UserV1 = new Entity({
            name: "R3RebaseUser",
            properties: [new Property({ name: "flag", type: "boolean" }, { uuid: "r3-rebase-user-flag" })],
        }, { uuid: "r3-rebase-user" });
        const ProfileV1 = new Entity({
            name: "R3RebaseProfile",
            properties: [new Property({ name: "flag", type: "boolean" }, { uuid: "r3-rebase-profile-flag" })],
        }, { uuid: "r3-rebase-profile" });
        const ViewV1 = new Entity({
            name: "R3RebaseView",
            baseEntity: UserV1,
            matchExpression: MatchExp.atom({ key: "flag", value: ["=", true] }),
        }, { uuid: "r3-rebase-view" });
        const db = new PGLiteDB();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [UserV1, ProfileV1, ViewV1], relations: [] });
        await controllerV1.setup(true);
        const u1 = await systemV1.storage.create("R3RebaseUser", { flag: true });
        const u2 = await systemV1.storage.create("R3RebaseUser", { flag: true });
        const p1 = await systemV1.storage.create("R3RebaseProfile", { flag: true });
        const oldManifest = createMigrationManifest(controllerV1);

        // v2: same filtered name, base swapped to Profile (normally blocked by migrate();
        // this exercises the membership-diff primitive directly)
        const UserV2 = new Entity({
            name: "R3RebaseUser",
            properties: [new Property({ name: "flag", type: "boolean" }, { uuid: "r3-rebase-user-flag" })],
        }, { uuid: "r3-rebase-user" });
        const ProfileV2 = new Entity({
            name: "R3RebaseProfile",
            properties: [new Property({ name: "flag", type: "boolean" }, { uuid: "r3-rebase-profile-flag" })],
        }, { uuid: "r3-rebase-profile" });
        const ViewV2 = new Entity({
            name: "R3RebaseView",
            baseEntity: ProfileV2,
            matchExpression: MatchExp.atom({ key: "flag", value: ["=", true] }),
        }, { uuid: "r3-rebase-view" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, ProfileV2, ViewV2], relations: [] });
        // createMigrationManifest 默认读 storage.schema（需要 setup 后才有）——
        // 这里与 Controller.prepareMigrationContext 一致，用 prepareMigrationSchema 的 schema plan。
        const statesV2 = controllerV2.scheduler.createStates();
        const internalRequirementsV2 = controllerV2.scheduler.createInternalSchemaRequirements();
        const schemaPlanV2 = await (systemV2 as any).prepareMigrationSchema(
            controllerV2.entities, controllerV2.relations, statesV2, { internalRequirements: internalRequirementsV2 });
        const newManifest = createMigrationManifest(controllerV2, schemaPlanV2.schema);

        const events = await recomputeFilteredMemberships(controllerV1, oldManifest, newManifest);
        const creates = events.filter(e => e.type === "create").map(e => String(e.record!.id));
        const deletes = events.filter(e => e.type === "delete").map(e => String(e.record!.id));
        // profile enters (only member of the new base), both users leave (members of the old base)
        expect(creates).toEqual([String(p1.id)]);
        expect(deletes.sort()).toEqual([String(u1.id), String(u2.id)].sort());
        await db.close();
    });
});
