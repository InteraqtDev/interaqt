/**
 * Regression tests for the 2026-07-08 second-round deep review fixes.
 * See agentspace/output/deep-review-2026-07-08-r2.md for the original findings.
 *
 * - F-1: changed filtered entity/relation matchExpression produces membership diff during migration
 * - F-2: bare `type:'property'` dataDep (no attributeQuery) fails fast at setup
 * - F-3: storage update events carry `keys`; StateTransfer trigger.keys matches with subset semantics
 * - F-4: self-referencing 1:1 isTargetReliance relation sets up and works (no table combine)
 * - R-4: ambiguous StateMachine transfers (same current, same event, different next) throw
 * - R-7: BoolExp.or standardizes raw ExpressionData like .and
 */
import { describe, expect, test } from "vitest";
import {
    BoolExp, Controller, Count, Custom, Dictionary, Entity, GlobalBoundState, KlassByName, MatchExp, MonoSystem,
    Property, Relation, StateMachine, StateNode, StateTransfer, createMigrationManifest,
} from "interaqt";
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

describe("review fixes 2026-07-08 r2", () => {

    // -------------------------------------------------------------------------
    // F-2: bare property dataDep fails fast at setup
    // -------------------------------------------------------------------------
    test("F-2: property dataDep without attributeQuery is rejected at setup", async () => {
        const db = new PGLiteDB();
        const Item = Entity.create({
            name: "R2DepFailItem",
            properties: [
                Property.create({ name: "price", type: "number" }),
                Property.create({
                    name: "double", type: "number",
                    computation: Custom.create({
                        name: "R2DoubleBare",
                        dataDeps: { _current: { type: "property" } },  // no attributeQuery
                        compute: async function (dataDeps: any) {
                            return (dataDeps._current?.price ?? 0) * 2;
                        },
                        getInitialValue: () => 0,
                    }),
                }),
            ],
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await expect(controller.setup(true)).rejects.toThrow(/must declare a non-empty attributeQuery/);
        await db.close();
    });

    test("F-2: property dataDep with attributeQuery still recomputes on update", async () => {
        const db = new PGLiteDB();
        const Item = Entity.create({
            name: "R2DepOkItem",
            properties: [
                Property.create({ name: "price", type: "number" }),
                Property.create({
                    name: "double", type: "number",
                    computation: Custom.create({
                        name: "R2DoubleOk",
                        dataDeps: { _current: { type: "property", attributeQuery: ["price"] } },
                        compute: async function (dataDeps: any) {
                            return (dataDeps._current?.price ?? 0) * 2;
                        },
                        getInitialValue: () => 0,
                    }),
                }),
            ],
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);
        const item = await system.storage.create("R2DepOkItem", { price: 10 });
        await system.storage.update("R2DepOkItem", MatchExp.atom({ key: "id", value: ["=", item.id] }), { price: 25 });
        const row = await system.storage.findOne("R2DepOkItem", MatchExp.atom({ key: "id", value: ["=", item.id] }), undefined, ["*"]);
        expect(row.double).toBe(50);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-3: update events carry keys; trigger.keys works with subset semantics
    // -------------------------------------------------------------------------
    test("F-3: storage update events carry the updated property names as keys", async () => {
        const db = new PGLiteDB();
        const Doc = Entity.create({
            name: "R2KeysEventDoc",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "reviewed", type: "boolean" }),
            ],
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Doc], relations: [] });
        await controller.setup(true);
        const doc = await system.storage.create("R2KeysEventDoc", { title: "t", reviewed: false });
        const events: any[] = [];
        await system.storage.update("R2KeysEventDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { reviewed: true }, events);
        const updateEvent = events.find(e => e.type === "update" && e.recordName === "R2KeysEventDoc");
        expect(updateEvent).toBeTruthy();
        expect(updateEvent.keys).toContain("reviewed");
        expect(updateEvent.keys).not.toContain("title");
        await db.close();
    });

    test("F-3: StateTransfer trigger with keys matches field-level updates", async () => {
        const db = new PGLiteDB();
        const draft = StateNode.create({ name: "draft" });
        const published = StateNode.create({ name: "published" });
        const Doc = Entity.create({
            name: "R2KeysDoc",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "reviewed", type: "boolean" }),
                Property.create({
                    name: "status", type: "string",
                    computation: StateMachine.create({
                        states: [draft, published],
                        initialState: draft,
                        transfers: [StateTransfer.create({
                            trigger: { recordName: "R2KeysDoc", type: "update", keys: ["reviewed"] },
                            current: draft, next: published,
                            computeTarget: (event: any) => ({ id: event.oldRecord?.id ?? event.record?.id }),
                        })],
                    }),
                }),
            ],
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Doc], relations: [] });
        await controller.setup(true);
        const doc = await system.storage.create("R2KeysDoc", { title: "t", reviewed: false });

        // updating an unrelated key must NOT transition
        await system.storage.update("R2KeysDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { title: "t2" });
        let row = await system.storage.findOne("R2KeysDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), undefined, ["*"]);
        expect(row.status).toBe("draft");

        // updating the declared key must transition
        await system.storage.update("R2KeysDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { reviewed: true });
        row = await system.storage.findOne("R2KeysDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), undefined, ["*"]);
        expect(row.status).toBe("published");
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-4: self-referencing 1:1 reliance relation
    // -------------------------------------------------------------------------
    test("F-4: self-referencing 1:1 isTargetReliance sets up and supports CRUD", async () => {
        const db = new PGLiteDB();
        const Node = Entity.create({
            name: "R2SelfNode",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const rel = Relation.create({
            source: Node, sourceProperty: "shadow",
            target: Node, targetProperty: "shadowOf",
            type: "1:1",
            isTargetReliance: true,
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Node], relations: [rel] });
        await controller.setup(true);

        const main = await system.storage.create("R2SelfNode", { name: "main", shadow: { name: "main-shadow" } });
        const withShadow = await system.storage.findOne(
            "R2SelfNode",
            MatchExp.atom({ key: "id", value: ["=", main.id] }),
            undefined,
            ["*", ["shadow", { attributeQuery: ["*"] }]]
        );
        expect(withShadow.name).toBe("main");
        expect(withShadow.shadow?.name).toBe("main-shadow");

        // reliance: deleting the source deletes the shadow
        await system.storage.delete("R2SelfNode", MatchExp.atom({ key: "id", value: ["=", main.id] }));
        const remaining = await system.storage.find("R2SelfNode", undefined, undefined, ["id", "name"]);
        expect(remaining.map((r: any) => r.name)).not.toContain("main");
        expect(remaining.map((r: any) => r.name)).not.toContain("main-shadow");
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-4: ambiguous transfers throw instead of silently taking the first
    // -------------------------------------------------------------------------
    test("R-4: ambiguous StateMachine transfers throw a clear error", async () => {
        const db = new PGLiteDB();
        const a = StateNode.create({ name: "a" });
        const b = StateNode.create({ name: "b" });
        const c = StateNode.create({ name: "c" });
        const Doc = Entity.create({
            name: "R2AmbiguousDoc",
            properties: [
                Property.create({ name: "flag", type: "boolean" }),
                Property.create({
                    name: "state", type: "string",
                    computation: StateMachine.create({
                        states: [a, b, c],
                        initialState: a,
                        transfers: [
                            StateTransfer.create({
                                trigger: { recordName: "R2AmbiguousDoc", type: "update" },
                                current: a, next: b,
                                computeTarget: (event: any) => ({ id: event.oldRecord?.id ?? event.record?.id }),
                            }),
                            StateTransfer.create({
                                trigger: { recordName: "R2AmbiguousDoc", type: "update" },
                                current: a, next: c,
                                computeTarget: (event: any) => ({ id: event.oldRecord?.id ?? event.record?.id }),
                            }),
                        ],
                    }),
                }),
            ],
        });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Doc], relations: [] });
        await controller.setup(true);
        const doc = await system.storage.create("R2AmbiguousDoc", { flag: false });
        await expect(
            system.storage.update("R2AmbiguousDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { flag: true })
        ).rejects.toThrow(/ambiguous/);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-7: BoolExp.or standardizes raw ExpressionData
    // -------------------------------------------------------------------------
    test("R-7: BoolExp.or keeps raw ExpressionData as an expression subtree", () => {
        const expr = BoolExp.atom({ key: "a", value: ["=", 1] }).and({ key: "b", value: ["=", 2] });
        const orWithRaw = BoolExp.atom({ key: "c", value: ["=", 3] }).or(expr.raw);
        expect((orWithRaw.raw as any).right?.type).toBe("expression");
        const staticOr = BoolExp.or<unknown>({ key: "c", value: ["=", 3] }, expr.raw)!;
        expect((staticOr.raw as any).right?.type).toBe("expression");
    });

    test("R-7 (superseded by r27 I-1): and/or without right operand evaluates as its left operand", () => {
        // 契约演化：r2 把「缺 right 直接解引用的 TypeError」升格为明确报错；r26 I-3 声明期
        //  确认单边包装（create({ left })）合法；r27 I-1 把求值语义统一为左透传（and/or 幺元），
        //  否则声明期合法的 Conditions 会让每次 dispatch 都以内部错误失败。
        const singleSided = new BoolExp<any>({ type: "expression", operator: "and", left: { type: "atom", data: { key: "a", value: ["=", 1] } } } as any);
        expect(singleSided.evaluate(() => true)).toBe(true);
        expect(singleSided.evaluate(() => false)).not.toBe(true);
        // De Morgan 取反随左子树传播：NOT(single-and(A)) ≡ NOT A
        expect(singleSided.not().evaluate(() => false)).toBe(true);
    });

    // -------------------------------------------------------------------------
    // R-5: SQLite update() returns RETURNING rows like PostgreSQL/PGLite
    // -------------------------------------------------------------------------
    test("R-5: SQLite driver update() returns rows when idField is given", async () => {
        const db = new SQLiteDB(":memory:");
        await db.open();
        await db.scheme(`CREATE TABLE "r5_test" ("_rowId" INTEGER PRIMARY KEY, "id" INT, "v" INT)`);
        await db.insert(`INSERT INTO "r5_test" ("id", "v") VALUES (?, ?)`, [1, 1]);
        const rows = await db.update(`UPDATE "r5_test" SET "v" = ? WHERE "v" = ?`, [2, 1], "id");
        expect(Array.isArray(rows)).toBe(true);
        expect(rows.map((r: any) => r.id)).toEqual([1]);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // R-8: function-valued bound-state defaultValue enters the state signature
    // -------------------------------------------------------------------------
    test("R-8: changing a function-valued state defaultValue changes the state signature", async () => {
        const buildController = (defaultValueFn: () => number, dbInstance: PGLiteDB) => {
            const dict = new Dictionary({
                name: "r8SignatureDict", type: "number", collection: false,
                computation: new Custom({
                    name: "R8SignatureCustom",
                    dataDeps: {},
                    compute: async () => 0,
                    getInitialValue: () => 0,
                    createState: () => ({ marker: new GlobalBoundState<unknown>(defaultValueFn) }),
                }, { uuid: "r8-signature-custom" }),
            }, { uuid: "r8-signature-dict" });
            const system = new MonoSystem(dbInstance);
            system.conceptClass = KlassByName;
            return new Controller({ system, entities: [], relations: [], dict: [dict] });
        };
        const db = new PGLiteDB();
        const manifestA = createMigrationManifest(buildController(() => 1, db));
        const manifestB = createMigrationManifest(buildController(() => 2, db));
        const manifestA2 = createMigrationManifest(buildController(() => 1, db));
        const signatureOf = (manifest: any) => manifest.computations.find((c: any) => c.dataContext === "global:r8SignatureDict")!.stateSignature;
        expect(signatureOf(manifestA)).not.toBe(signatureOf(manifestB));
        expect(signatureOf(manifestA)).toBe(signatureOf(manifestA2));
        await db.close();
    });

    // -------------------------------------------------------------------------
    // F-1: changed filtered predicate produces membership diff during migration
    // -------------------------------------------------------------------------
    test("F-1: changing a filtered entity predicate updates downstream Count after migration", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "R2FilterUser",
            properties: [new Property({ name: "age", type: "number" }, { uuid: "r2-filter-age" })],
        }, { uuid: "r2-filter-user" });
        const SeniorV1 = new Entity({
            name: "R2SeniorUser",
            baseEntity: UserV1,
            matchExpression: MatchExp.atom({ key: "age", value: [">=", 30] }),
        }, { uuid: "r2-senior-user" });
        const countV1 = new Dictionary({
            name: "r2SeniorCount", type: "number", collection: false,
            computation: new Count({ record: SeniorV1 }, { uuid: "r2-senior-count" }),
        }, { uuid: "r2-senior-count-dict" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [UserV1, SeniorV1], relations: [], dict: [countV1] });
        await controllerV1.setup(true);
        await systemV1.storage.create("R2FilterUser", { age: 20 });
        await systemV1.storage.create("R2FilterUser", { age: 40 });
        expect(await systemV1.storage.dict.get("r2SeniorCount")).toBe(1);

        // v2: only the predicate changes (>=30 → >=18); both rows now match
        const UserV2 = new Entity({
            name: "R2FilterUser",
            properties: [new Property({ name: "age", type: "number" }, { uuid: "r2-filter-age" })],
        }, { uuid: "r2-filter-user" });
        const SeniorV2 = new Entity({
            name: "R2SeniorUser",
            baseEntity: UserV2,
            matchExpression: MatchExp.atom({ key: "age", value: [">=", 18] }),
        }, { uuid: "r2-senior-user" });
        const countV2 = new Dictionary({
            name: "r2SeniorCount", type: "number", collection: false,
            computation: new Count({ record: SeniorV2 }, { uuid: "r2-senior-count" }),
        }, { uuid: "r2-senior-count-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, SeniorV2], relations: [], dict: [countV2] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        // the predicate change must be visible in the diff review items
        expect(JSON.stringify(approvedDiff.changes)).toMatch(/filtered-predicate-changed/);
        await controllerV2.migrate({ approvedDiff });

        expect(await systemV2.storage.find("R2SeniorUser", undefined, undefined, ["age"])).toHaveLength(2);
        expect(await systemV2.storage.dict.get("r2SeniorCount")).toBe(2);
        await db.close();
    });

    test("F-1: tightening a filtered entity predicate emits delete diffs for leaving members", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "R2FilterUserTighten",
            properties: [new Property({ name: "age", type: "number" }, { uuid: "r2t-filter-age" })],
        }, { uuid: "r2t-filter-user" });
        const SeniorV1 = new Entity({
            name: "R2SeniorUserTighten",
            baseEntity: UserV1,
            matchExpression: MatchExp.atom({ key: "age", value: [">=", 18] }),
        }, { uuid: "r2t-senior-user" });
        const countV1 = new Dictionary({
            name: "r2tSeniorCount", type: "number", collection: false,
            computation: new Count({ record: SeniorV1 }, { uuid: "r2t-senior-count" }),
        }, { uuid: "r2t-senior-count-dict" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [UserV1, SeniorV1], relations: [], dict: [countV1] });
        await controllerV1.setup(true);
        await systemV1.storage.create("R2FilterUserTighten", { age: 20 });
        await systemV1.storage.create("R2FilterUserTighten", { age: 40 });
        expect(await systemV1.storage.dict.get("r2tSeniorCount")).toBe(2);

        // v2: tighten the predicate (>=18 → >=30); age=20 leaves
        const UserV2 = new Entity({
            name: "R2FilterUserTighten",
            properties: [new Property({ name: "age", type: "number" }, { uuid: "r2t-filter-age" })],
        }, { uuid: "r2t-filter-user" });
        const SeniorV2 = new Entity({
            name: "R2SeniorUserTighten",
            baseEntity: UserV2,
            matchExpression: MatchExp.atom({ key: "age", value: [">=", 30] }),
        }, { uuid: "r2t-senior-user" });
        const countV2 = new Dictionary({
            name: "r2tSeniorCount", type: "number", collection: false,
            computation: new Count({ record: SeniorV2 }, { uuid: "r2t-senior-count" }),
        }, { uuid: "r2t-senior-count-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, SeniorV2], relations: [], dict: [countV2] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await controllerV2.migrate({ approvedDiff });

        expect(await systemV2.storage.find("R2SeniorUserTighten", undefined, undefined, ["age"])).toHaveLength(1);
        expect(await systemV2.storage.dict.get("r2tSeniorCount")).toBe(1);
        await db.close();
    });
});
