import { describe, expect, test } from "vitest";
import { Controller, ComputationResult, Count, Custom, Dictionary, Entity, GlobalBoundState, KlassByName, MatchExp, MonoSystem, NonNullConstraint, Property, RecordMutationSideEffect, Relation, StateMachine, StateNode, StateTransfer, Summation, Transform, UniqueConstraint, createMigrationManifest, hashMigrationDiff, readMigrationManifest, writeMigrationManifest } from "interaqt";
import { PGLiteDB } from "@drivers";

async function approveGeneratedMigrationDiff(controller: Controller, options: {
    includeFunctionText?: boolean;
    includeDestructiveScope?: boolean;
    eventHandlers?: Record<string, string>;
    asyncHandlers?: Record<string, string>;
    computationDecisions?: Record<string, "changed" | "unchanged" | "state-only" | "unrebuildable">;
} = {}) {
    const diff = await controller.generateMigrationDiff({
        includeFunctionText: options.includeFunctionText ?? true,
        includeDestructiveScope: options.includeDestructiveScope ?? true,
    });
    const decisions = [
        ...diff.decisions,
        ...diff.requiredDecisions.map(requirement => {
            if (requirement.kind === "computation") {
                return {
                    kind: "computation" as const,
                    id: requirement.id,
                    dataContext: requirement.dataContext,
                    decision: options.computationDecisions?.[requirement.id] || requirement.recommendedDecision,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "event-rebuild-handler") {
                return {
                    kind: "event-rebuild-handler" as const,
                    dataContext: requirement.dataContext,
                    handlerRef: options.eventHandlers?.[requirement.dataContext] || requirement.dataContext,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "async-completion-handler") {
                return {
                    kind: "async-completion-handler" as const,
                    dataContext: requirement.dataContext,
                    handlerRef: options.asyncHandlers?.[requirement.dataContext] || requirement.dataContext,
                    reason: "approved by migration test",
                };
            }
            return {
                kind: "destructive-scope" as const,
                dataContext: requirement.dataContext,
                recordName: requirement.recordName,
                ids: requirement.ids,
                reason: "approved by migration test",
            };
        }),
    ];
    return {
        ...diff,
        status: "approved" as const,
        decisions,
    };
}

async function migrateWithApproval(controller: Controller, options: Parameters<Controller["migrate"]>[0] = {}) {
    const approvedDiff = options.approvedDiff || await approveGeneratedMigrationDiff(controller);
    return controller.migrate({ ...options, approvedDiff });
}

async function dryRunWithApproval(controller: Controller, options: Parameters<Controller["migrate"]>[0] = {}) {
    return migrateWithApproval(controller, { ...options, dryRun: true });
}

describe("Data migration phase 1", () => {
    test("generateMigrationDiff and approvedDiff validation enforce two-step review", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationReviewProduct",
            properties: [new Property({ name: "price", type: "number" })],
        });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [ProductV1], relations: [] });
        await controllerV1.setup(true);
        await systemV1.storage.create("MigrationReviewProduct", { price: 2 });
        const baselineHash = (await readMigrationManifest(controllerV1))!.modelHash;
        const ProductV1Again = new Entity({
            name: "MigrationReviewProduct",
            properties: [new Property({ name: "price", type: "number" })],
        });
        expect(createMigrationManifest(new Controller({ system: systemV1, entities: [ProductV1Again], relations: [] })).modelHash).toBe(baselineHash);

        const doublePrice = new Custom({
            name: "MigrationReviewDouble",
            dataDeps: { current: { type: "property", attributeQuery: ["price"] } },
            compute: async (_deps: any, record: any) => record.price * 2,
        });
        const ProductV2 = new Entity({
            name: "MigrationReviewProduct",
            properties: [
                new Property({ name: "price", type: "number" }),
                new Property({ name: "doublePrice", type: "number", computation: doublePrice }),
            ],
        });
        const ReviewCategory = new Entity({
            name: "MigrationReviewCategory",
            properties: [new Property({ name: "name", type: "string" })],
        });
        const ProductCategory = new Relation({
            source: ProductV2,
            sourceProperty: "categories",
            target: ReviewCategory,
            targetProperty: "products",
            name: "MigrationReviewProductCategory",
            type: "n:n",
        });
        const reviewDict = new Dictionary({
            name: "migrationReviewDict",
            type: "number",
            collection: false,
        });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, ReviewCategory], relations: [ProductCategory], dict: [reviewDict] });

        await expect(controllerV2.migrate()).rejects.toThrow(/approved diff/);
        const diff = await controllerV2.generateMigrationDiff({ includeFunctionText: true });
        expect(diff.changes.some(change => change.kind === "record" && change.dataContext === "entity:MigrationReviewCategory")).toBe(true);
        expect(diff.changes.some(change => change.kind === "property" && change.dataContext === "property:MigrationReviewProduct.doublePrice")).toBe(true);
        expect(diff.changes.some(change => change.kind === "relation" && change.dataContext === "relation:MigrationReviewProductCategory")).toBe(true);
        expect(diff.changes.some(change => change.kind === "dictionary" && change.dataContext === "global:migrationReviewDict")).toBe(true);
        expect(diff.requiredDecisions.some(item => item.kind === "computation" && item.dataContext === "property:MigrationReviewProduct.doublePrice")).toBe(true);
        const computationChange = diff.changes.find(change => change.kind === "computation" && change.dataContext === "property:MigrationReviewProduct.doublePrice");
        expect(computationChange?.kind === "computation" ? computationChange.detected.functionHash : undefined).toBeTruthy();

        const missingDecision = { ...diff, status: "approved" as const, decisions: [] };
        await expect(controllerV2.migrate({ approvedDiff: missingDecision })).rejects.toThrow(/Missing migration decision/);
        await expect(controllerV2.migrate({ approvedDiff: { ...missingDecision, requiredDecisions: [] } })).rejects.toThrow(/Missing migration decision/);

        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await expect(controllerV2.migrate({
            approvedDiff: { ...approvedDiff, toModelHash: "stale" },
        })).rejects.toThrow(/stale/);
        await expect(controllerV2.migrate({
            approvedDiff: {
                ...approvedDiff,
                decisions: [
                    ...approvedDiff.decisions,
                    { kind: "rename-candidate-reviewed" as const, from: "A", to: "B", decision: "not-accepted" as const, reason: "extra" },
                ],
            },
        })).rejects.toThrow(/rename candidate/);

        await db.close();
    });

    test("setup(false) rejects model changes when a migration manifest exists", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationProductGuard",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-product-guard-name" }),
            ],
        }, { uuid: "migration-product-guard" });

        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({
            system: systemV1,
            entities: [ProductV1],
            relations: [],
        });
        await controllerV1.setup(true);

        const ProductV2 = new Entity({
            name: "MigrationProductGuard",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-product-guard-name" }),
                new Property({ name: "price", type: "number" }, { uuid: "migration-product-guard-price" }),
            ],
        }, { uuid: "migration-product-guard" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({
            system: systemV2,
            entities: [ProductV2],
            relations: [],
        });

        await expect(controllerV2.setup(false)).rejects.toThrow(/Model manifest mismatch/);
        expect((systemV2.storage as any).queryHandle).toBeUndefined();
        await db.close();
    });

    test("migrate adds computed property columns and recomputes existing records", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-user-name" }),
            ],
        }, { uuid: "migration-user" });
        const TaskV1 = new Entity({
            name: "MigrationTask",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-task-title" }),
            ],
        }, { uuid: "migration-task" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-owns-task" });

        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({
            system: systemV1,
            entities: [UserV1, TaskV1],
            relations: [OwnsTaskV1],
        });
        await controllerV1.setup(true);

        const alice = await systemV1.storage.create("MigrationUser", { name: "Alice" });
        const bob = await systemV1.storage.create("MigrationUser", { name: "Bob" });
        const task1 = await systemV1.storage.create("MigrationTask", { title: "T1" });
        const task2 = await systemV1.storage.create("MigrationTask", { title: "T2" });
        const task3 = await systemV1.storage.create("MigrationTask", { title: "T3" });
        await systemV1.storage.addRelationByNameById("MigrationOwnsTask", alice.id, task1.id);
        await systemV1.storage.addRelationByNameById("MigrationOwnsTask", alice.id, task2.id);
        await systemV1.storage.addRelationByNameById("MigrationOwnsTask", bob.id, task3.id);

        const UserV2 = new Entity({
            name: "MigrationUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-user-name" }),
                new Property({
                    name: "taskCount",
                    type: "number",
                    computation: new Count({
                        property: "tasks",
                    }, { uuid: "migration-user-task-count-computation" }),
                }, { uuid: "migration-user-task-count" }),
            ],
        }, { uuid: "migration-user" });
        const TaskV2 = new Entity({
            name: "MigrationTask",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-task-title" }),
            ],
        }, { uuid: "migration-task" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-owns-task" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({
            system: systemV2,
            entities: [UserV2, TaskV2],
            relations: [OwnsTaskV2],
        });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.changedComputations).toHaveLength(1);
        const migratedAlice = await systemV2.storage.findOne("MigrationUser", MatchExp.atom({ key: "id", value: ["=", alice.id] }), undefined, ["*"]);
        const migratedBob = await systemV2.storage.findOne("MigrationUser", MatchExp.atom({ key: "id", value: ["=", bob.id] }), undefined, ["*"]);
        expect(migratedAlice.taskCount).toBe(2);
        expect(migratedBob.taskCount).toBe(1);

        const task4 = await systemV2.storage.create("MigrationTask", { title: "T4" });
        await systemV2.storage.addRelationByNameById("MigrationOwnsTask", alice.id, task4.id);
        const updatedAlice = await systemV2.storage.findOne("MigrationUser", MatchExp.atom({ key: "id", value: ["=", alice.id] }), undefined, ["*"]);
        expect(updatedAlice.taskCount).toBe(3);
        await db.close();
    });

    test("migrate recomputes added global computations from existing facts", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationGlobalProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-global-product-name" }),
            ],
        }, { uuid: "migration-global-product" });

        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({
            system: systemV1,
            entities: [ProductV1],
            relations: [],
        });
        await controllerV1.setup(true);
        await systemV1.storage.create("MigrationGlobalProduct", { name: "A" });
        await systemV1.storage.create("MigrationGlobalProduct", { name: "B" });

        const ProductV2 = new Entity({
            name: "MigrationGlobalProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-global-product-name" }),
            ],
        }, { uuid: "migration-global-product" });
        const productCount = new Dictionary({
            name: "migrationGlobalProductCount",
            type: "number",
            collection: false,
            computation: new Count({
                record: ProductV2,
            }, { uuid: "migration-global-product-count-computation" }),
        }, { uuid: "migration-global-product-count" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({
            system: systemV2,
            entities: [ProductV2],
            relations: [],
            dict: [productCount],
        });
        await migrateWithApproval(controllerV2);

        expect(await systemV2.storage.dict.get("migrationGlobalProductCount")).toBe(2);
        await db.close();
    });

    test("dry-run builds a plan without applying additive schema", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationDryRunProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-dry-product-name" }),
            ],
        }, { uuid: "migration-dry-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationDryRunProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-dry-product-name" }),
                new Property({ name: "price", type: "number" }, { uuid: "migration-dry-product-price" }),
            ],
        }, { uuid: "migration-dry-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await controllerV2.migrate({ approvedDiff, dryRun: true });

        expect(plan.schemaPlan?.preRecomputeDDL.some(operation => operation.kind === "add-column")).toBe(true);
                const columns = await db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            ["MigrationDryRunProduct"],
        );
        expect(columns.map(column => column.column_name).some(column => column.includes("price"))).toBe(false);
        await db.close();
    });

    test("createMigrationBaseline restores a missing manifest for an existing matching schema", async () => {
        const db = new PGLiteDB();
        const Product = new Entity({
            name: "MigrationBaselineProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-baseline-product-name" }),
            ],
        }, { uuid: "migration-baseline-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [Product], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationBaselineProduct", { name: "A" });
        await db.scheme(`DELETE FROM "__interaqt_migration_manifest" WHERE "key" = 'current'`);

        const ProductAgain = new Entity({
            name: "MigrationBaselineProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-baseline-product-name" }),
            ],
        }, { uuid: "migration-baseline-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductAgain], relations: [] });
        const manifest = await controllerV2.createMigrationBaseline();

        expect(manifest.modelHash).toBeTruthy();
        await controllerV2.setup(false);
        await db.close();
    });

    test("migration dry-run reports async computations as blocking changes", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationAsyncSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-async-source-value" })],
        }, { uuid: "migration-async-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationAsyncSource", { value: 1 });

        const SourceV2 = new Entity({
            name: "MigrationAsyncSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-async-source-value" })],
        }, { uuid: "migration-async-source" });
        const asyncComputation = new Custom({
            name: "MigrationAsyncCustom",
            dataDeps: { records: { type: "records", source: SourceV2, attributeQuery: ["value"] } },
            compute: async () => ComputationResult.async({}),
            asyncReturn: async () => 1,
        }, { uuid: "migration-async-custom" });
        const asyncDict = new Dictionary({
            name: "migrationAsyncValue",
            type: "number",
            collection: false,
            computation: asyncComputation,
        }, { uuid: "migration-async-dict" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [asyncDict] });
        const diff = await controllerV2.generateMigrationDiff();
        const beforeFailureManifest = await readMigrationManifest(controllerV2);

        expect(diff.requiredDecisions.some(item => item.kind === "async-completion-handler" && item.dataContext === "global:migrationAsyncValue")).toBe(true);
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/Missing migration async completion handler/);
        expect((await readMigrationManifest(controllerV2))!.modelHash).toBe(beforeFailureManifest!.modelHash);
        await db.close();
    });

    test("async completion handler resolves async computation before success", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationAsyncContractSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-async-contract-source-value" })],
        }, { uuid: "migration-async-contract-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);

        const SourceV2 = new Entity({
            name: "MigrationAsyncContractSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-async-contract-source-value" })],
        }, { uuid: "migration-async-contract-source" });
        const asyncComputation = new Custom({
            name: "MigrationAsyncContractCustom",
            compute: async () => ComputationResult.async({ finalValue: 7 }),
            asyncReturn: async () => 1,
        }, { uuid: "migration-async-contract-custom" });
        const asyncDict = new Dictionary({
            name: "migrationAsyncContractValue",
            type: "number",
            collection: false,
            computation: asyncComputation,
        }, { uuid: "migration-async-contract-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [asyncDict] });
        await expect(migrateWithApproval(controllerV2, {
            handlers: {
                asyncCompletion: {
                    "global:migrationAsyncContractValue": async () => ComputationResult.resolved(7),
                },
            },
        })).rejects.toThrow(/direct final output|asyncReturn resolution/);
        const plan = await migrateWithApproval(controllerV2, {
            handlers: {
                asyncCompletion: {
                    "global:migrationAsyncContractValue": async ({ args }: any) => args.finalValue,
                },
            },
        });

        expect(plan.blockingChanges).toHaveLength(0);
        expect(await systemV2.storage.dict.get("migrationAsyncContractValue")).toBe(7);
        expect((await readMigrationManifest(controllerV2))?.modelHash).toBeTruthy();
        await db.close();
    });

    test("migration dry-run blocks destructive _isDeleted_ output by default", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationDeleteUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-delete-user-name" })],
        }, { uuid: "migration-delete-user" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationDeleteUser", { name: "A" });

        const deleteComputation = new Custom({
            name: "MigrationDeleteCustom",
            compute: async () => true,
        }, { uuid: "migration-delete-custom" });
        const UserV2 = new Entity({
            name: "MigrationDeleteUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-delete-user-name" }),
                new Property({ name: "_isDeleted_", type: "boolean", computation: deleteComputation }, { uuid: "migration-delete-user-is-deleted" }),
            ],
        }, { uuid: "migration-delete-user" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        const plan = await dryRunWithApproval(controllerV2);

        expect(diff.requiredDecisions.some(item => item.kind === "destructive-scope")).toBe(true);
        expect(plan.deletionScope).toHaveLength(1);
        expect(plan.deletionScope[0].recordName).toBe("MigrationDeleteUser");
        const users = await systemV1.storage.find("MigrationDeleteUser", undefined, undefined, ["id"]);
        expect(users).toHaveLength(1);
        await db.close();
    });

    test("destructive migration requires the audited record scope to match", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationDeleteScopeUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-delete-scope-name" })],
        }, { uuid: "migration-delete-scope-user" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1], relations: [] }).setup(true);
        const user = await systemV1.storage.create("MigrationDeleteScopeUser", { name: "A" });

        const deleteComputation = new Custom({
            name: "MigrationDeleteScopeCustom",
            compute: async () => true,
        }, { uuid: "migration-delete-scope-custom" });
        const UserV2 = new Entity({
            name: "MigrationDeleteScopeUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-delete-scope-name" }),
                new Property({ name: "_isDeleted_", type: "boolean", computation: deleteComputation }, { uuid: "migration-delete-scope-is-deleted" }),
            ],
        }, { uuid: "migration-delete-scope-user" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2], relations: [] });
        const wrongDiff = await approveGeneratedMigrationDiff(controllerV2);
        const wrongScopeDiff = {
            ...wrongDiff,
            decisions: wrongDiff.decisions.map(decision => decision.kind === "destructive-scope"
                ? { ...decision, ids: [] }
                : decision),
        };
        await expect(migrateWithApproval(controllerV2, { approvedDiff: wrongScopeDiff, dryRun: true })).rejects.toThrow(/scope mismatch/);
        await expect(migrateWithApproval(controllerV2, { approvedDiff: wrongScopeDiff })).rejects.toThrow(/scope mismatch/);
        await migrateWithApproval(controllerV2);
        const remaining = await systemV2.storage.find("MigrationDeleteScopeUser", undefined, undefined, ["id"]);
        expect(remaining).toHaveLength(0);
        await db.close();
    });

    test("migrate rebuilds added Transform entity output from existing source records", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationTransformProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-transform-product-price" })],
        }, { uuid: "migration-transform-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationTransformProduct", { price: 10 });
        await systemV1.storage.create("MigrationTransformProduct", { price: 20 });

        const ProductV2 = new Entity({
            name: "MigrationTransformProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-transform-product-price" })],
        }, { uuid: "migration-transform-product" });
        const transform = new Transform({
            record: ProductV2,
            attributeQuery: ["id", "price"],
            callback: function (item: any) {
                return { discounted: item.price / 2 };
            },
        }, { uuid: "migration-transform-computation" });
        const Discount = new Entity({
            name: "MigrationDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-discount-value" })],
            computation: transform,
        }, { uuid: "migration-discount" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, Discount], relations: [] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.schemaPlan?.postRecomputeDDL.some(operation => operation.description.includes("transform unique index"))).toBe(true);
        const discounts = await systemV2.storage.find("MigrationDiscount", undefined, undefined, ["discounted"]);
        expect(discounts.map(item => item.discounted).sort((a, b) => a - b)).toEqual([5, 10]);
        const operationLogs = await db.query<{ operationKey: string }>(
            `SELECT "operationKey" FROM "__interaqt_migration_operation_log" WHERE "operationKey" LIKE 'constraints:%MigrationDiscount.%'`,
            [],
        );
        expect(operationLogs.length).toBeGreaterThan(0);
        await db.close();
    });

    test("changed Transform output recomputes downstream aggregations", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationTransformChangeProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-transform-change-product-price" })],
        }, { uuid: "migration-transform-change-product" });
        const transformV1 = new Transform({
            record: ProductV1,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price }),
        }, { uuid: "migration-transform-change-computation" });
        const DiscountV1 = new Entity({
            name: "MigrationTransformChangeDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-transform-change-discounted" })],
            computation: transformV1,
        }, { uuid: "migration-transform-change-discount" });
        const discountSumV1 = new Dictionary({
            name: "migrationTransformChangeSum",
            type: "number",
            collection: false,
            computation: new Summation({
                record: DiscountV1,
                attributeQuery: ["discounted"],
            }, { uuid: "migration-transform-change-sum-computation" }),
        }, { uuid: "migration-transform-change-sum" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, DiscountV1], relations: [], dict: [discountSumV1] }).setup(true);
        await systemV1.storage.create("MigrationTransformChangeProduct", { price: 10 });
        await systemV1.storage.create("MigrationTransformChangeProduct", { price: 20 });
        expect(await systemV1.storage.dict.get("migrationTransformChangeSum")).toBe(30);

        const ProductV2 = new Entity({
            name: "MigrationTransformChangeProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-transform-change-product-price" })],
        }, { uuid: "migration-transform-change-product" });
        const transformV2 = new Transform({
            record: ProductV2,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price * 2 }),
        }, { uuid: "migration-transform-change-computation" });
        const DiscountV2 = new Entity({
            name: "MigrationTransformChangeDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-transform-change-discounted" })],
            computation: transformV2,
        }, { uuid: "migration-transform-change-discount" });
        const discountSumV2 = new Dictionary({
            name: "migrationTransformChangeSum",
            type: "number",
            collection: false,
            computation: new Summation({
                record: DiscountV2,
                attributeQuery: ["discounted"],
            }, { uuid: "migration-transform-change-sum-computation" }),
        }, { uuid: "migration-transform-change-sum" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, DiscountV2], relations: [], dict: [discountSumV2] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("global:migrationTransformChangeSum");
        expect(await systemV2.storage.dict.get("migrationTransformChangeSum")).toBe(60);
        await db.close();
    });

    test("changed Transform output requires destructive opt-in before deleting stale derived rows", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationTransformDeleteProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-transform-delete-product-price" })],
        }, { uuid: "migration-transform-delete-product" });
        const transformV1 = new Transform({
            record: ProductV1,
            attributeQuery: ["id", "price"],
            callback: (item: any) => [{ value: item.price }, { value: item.price + 1 }],
        }, { uuid: "migration-transform-delete-computation" });
        const OutputV1 = new Entity({
            name: "MigrationTransformDeleteOutput",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-transform-delete-output-value" })],
            computation: transformV1,
        }, { uuid: "migration-transform-delete-output" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, OutputV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationTransformDeleteProduct", { price: 10 });
        expect(await systemV1.storage.find("MigrationTransformDeleteOutput", undefined, undefined, ["id"])).toHaveLength(2);

        const ProductV2 = new Entity({
            name: "MigrationTransformDeleteProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-transform-delete-product-price" })],
        }, { uuid: "migration-transform-delete-product" });
        const transformV2 = new Transform({
            record: ProductV2,
            attributeQuery: ["id", "price"],
            callback: (item: any) => [{ value: item.price * 2 }],
        }, { uuid: "migration-transform-delete-computation" });
        const OutputV2 = new Entity({
            name: "MigrationTransformDeleteOutput",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-transform-delete-output-value" })],
            computation: transformV2,
        }, { uuid: "migration-transform-delete-output" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, OutputV2], relations: [] });
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/scope mismatch|delete stale derived/);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const dryRunPlan = await controllerV2.migrate({ approvedDiff, dryRun: true });
        const approvedScope = dryRunPlan.deletionScope.find(scope => scope.dataContext === "entity:MigrationTransformDeleteOutput");
        await migrateWithApproval(controllerV2, {
            approvedDiff: {
                ...approvedDiff,
                decisions: approvedDiff.decisions.map(decision => decision.kind === "destructive-scope" && decision.dataContext === "entity:MigrationTransformDeleteOutput"
                    ? { ...decision, ids: approvedScope?.ids || [], reason: "approved stale transform cleanup" }
                    : decision),
            },
        });

        const outputs = await systemV2.storage.find("MigrationTransformDeleteOutput", undefined, undefined, ["value"]);
        expect(outputs.map(output => output.value)).toEqual([20]);
        await db.close();
    });

    test("entity output replacement requires previous manifest ownership proof", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationOwnershipProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-ownership-product-price" })],
        }, { uuid: "migration-ownership-product" });
        const transformV1 = new Transform({
            record: ProductV1,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price / 2 }),
        }, { uuid: "migration-ownership-transform" });
        const DiscountV1 = new Entity({
            name: "MigrationOwnershipDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-ownership-discount-value" })],
            computation: transformV1,
        }, { uuid: "migration-ownership-discount" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [ProductV1, DiscountV1], relations: [] });
        await controllerV1.setup(true);
        const manifest = await readMigrationManifest(controllerV1);
        const tampered = structuredClone(manifest!);
        const transformManifest = tampered.computations.find(computation => computation.dataContext === "entity:MigrationOwnershipDiscount")!;
        delete transformManifest.ownershipProof;
        await writeMigrationManifest(controllerV1, tampered);

        const ProductV2 = new Entity({
            name: "MigrationOwnershipProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-ownership-product-price" })],
        }, { uuid: "migration-ownership-product" });
        const transformV2 = new Transform({
            record: ProductV2,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price / 4 }),
        }, { uuid: "migration-ownership-transform" });
        const DiscountV2 = new Entity({
            name: "MigrationOwnershipDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-ownership-discount-value" })],
            computation: transformV2,
        }, { uuid: "migration-ownership-discount" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, DiscountV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/exclusive output ownership proof/);
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/exclusive output ownership proof/);
        await db.close();
    });

    test("existing fact records cannot be taken over by a new computed entity output", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationFactTakeoverProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-fact-takeover-product-price" })],
        }, { uuid: "migration-fact-takeover-product" });
        const DiscountV1 = new Entity({
            name: "MigrationFactTakeoverDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-fact-takeover-discount-value" })],
        }, { uuid: "migration-fact-takeover-discount" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, DiscountV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationFactTakeoverDiscount", { discounted: 10 });

        const ProductV2 = new Entity({
            name: "MigrationFactTakeoverProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-fact-takeover-product-price" })],
        }, { uuid: "migration-fact-takeover-product" });
        const transform = new Transform({
            record: ProductV2,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price }),
        }, { uuid: "migration-fact-takeover-transform" });
        const DiscountV2 = new Entity({
            name: "MigrationFactTakeoverDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-fact-takeover-discount-value" })],
            computation: transform,
        }, { uuid: "migration-fact-takeover-discount" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, DiscountV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/exclusive output ownership proof/);
        await db.close();
    });

    test("migrate initializes added filtered entity membership flags", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationFilteredUser",
            properties: [
                new Property({ name: "age", type: "number" }, { uuid: "migration-filtered-user-age" }),
            ],
        }, { uuid: "migration-filtered-user" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationFilteredUser", { age: 20 });
        await systemV1.storage.create("MigrationFilteredUser", { age: 40 });

        const UserV2 = new Entity({
            name: "MigrationFilteredUser",
            properties: [
                new Property({ name: "age", type: "number" }, { uuid: "migration-filtered-user-age" }),
            ],
        }, { uuid: "migration-filtered-user" });
        const AdultUser = new Entity({
            name: "MigrationAdultUser",
            baseEntity: UserV2,
            matchExpression: MatchExp.atom({ key: "age", value: [">=", 30] }),
        }, { uuid: "migration-adult-user" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, AdultUser], relations: [] });
        await migrateWithApproval(controllerV2);

        const adults = await systemV2.storage.find("MigrationAdultUser", undefined, undefined, ["age"]);
        expect(adults).toHaveLength(1);
        expect(adults[0].age).toBe(40);
        await db.close();
    });

    test("dry-run reports fact physical path moves before applying schema", async () => {
        const db = new PGLiteDB();
        const Product = new Entity({
            name: "MigrationPhysicalProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-physical-product-name" }),
            ],
        }, { uuid: "migration-physical-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [Product], relations: [] });
        await controllerV1.setup(true);

        const manifest = await readMigrationManifest(controllerV1);
        const tampered = structuredClone(manifest!);
        const productRecord = tampered.storage.records.find(record => record.recordName === "MigrationPhysicalProduct")!;
        const nameAttribute = productRecord.attributeDetails!.find(attribute => attribute.name === "name")!;
        nameAttribute.fieldName = "old_field_that_moved";
        await writeMigrationManifest(controllerV1, tampered);

        const ProductAgain = new Entity({
            name: "MigrationPhysicalProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-physical-product-name" }),
            ],
        }, { uuid: "migration-physical-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductAgain], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/physical-path-move/);
        await db.close();
    });

    test("dry-run reports relation source target physical field moves", async () => {
        const db = new PGLiteDB();
        const User = new Entity({
            name: "MigrationPhysicalRelationUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-physical-relation-user-name" })],
        }, { uuid: "migration-physical-relation-user" });
        const Task = new Entity({
            name: "MigrationPhysicalRelationTask",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-physical-relation-task-title" })],
        }, { uuid: "migration-physical-relation-task" });
        const OwnsTask = new Relation({
            source: User,
            sourceProperty: "tasks",
            target: Task,
            targetProperty: "owner",
            name: "MigrationPhysicalRelationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-physical-relation-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [User, Task], relations: [OwnsTask] });
        await controllerV1.setup(true);

        const manifest = await readMigrationManifest(controllerV1);
        const tampered = structuredClone(manifest!);
        const relationRecord = tampered.storage.records.find(record => record.recordName === "MigrationPhysicalRelationOwnsTask")!;
        const sourceAttribute = relationRecord.attributeDetails!.find(attribute => attribute.name === "source")!;
        sourceAttribute.sourceField = "old_source_field_that_moved";
        await writeMigrationManifest(controllerV1, tampered);

        const UserAgain = new Entity({
            name: "MigrationPhysicalRelationUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-physical-relation-user-name" })],
        }, { uuid: "migration-physical-relation-user" });
        const TaskAgain = new Entity({
            name: "MigrationPhysicalRelationTask",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-physical-relation-task-title" })],
        }, { uuid: "migration-physical-relation-task" });
        const OwnsTaskAgain = new Relation({
            source: UserAgain,
            sourceProperty: "tasks",
            target: TaskAgain,
            targetProperty: "owner",
            name: "MigrationPhysicalRelationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-physical-relation-owns-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserAgain, TaskAgain], relations: [OwnsTaskAgain] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/MigrationPhysicalRelationOwnsTask\.source/);
        expect(plan.blockingChanges.join("\n")).toMatch(/physical-path-move/);
        await db.close();
    });

    test("dry-run places relation computed properties through merged physical table mapping", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationRelationComputedUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-computed-user-name" })],
        }, { uuid: "migration-relation-computed-user" });
        const ProfileV1 = new Entity({
            name: "MigrationRelationComputedProfile",
            properties: [new Property({ name: "level", type: "number" }, { uuid: "migration-relation-computed-profile-level" })],
        }, { uuid: "migration-relation-computed-profile" });
        const ProfileOwnerV1 = new Relation({
            source: UserV1,
            sourceProperty: "profile",
            target: ProfileV1,
            targetProperty: "owner",
            name: "MigrationRelationComputedProfileOwner",
            type: "1:1",
            isTargetReliance: true,
        }, { uuid: "migration-relation-computed-profile-owner" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, ProfileV1], relations: [ProfileOwnerV1] }).setup(true);

        const relationScore = new Custom({
            name: "MigrationRelationComputedScore",
            compute: async (_deps: any, record: any) => record.id ? 10 : 0,
        }, { uuid: "migration-relation-computed-score-computation" });
        const UserV2 = new Entity({
            name: "MigrationRelationComputedUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-computed-user-name" })],
        }, { uuid: "migration-relation-computed-user" });
        const ProfileV2 = new Entity({
            name: "MigrationRelationComputedProfile",
            properties: [new Property({ name: "level", type: "number" }, { uuid: "migration-relation-computed-profile-level" })],
        }, { uuid: "migration-relation-computed-profile" });
        const ProfileOwnerV2 = new Relation({
            source: UserV2,
            sourceProperty: "profile",
            target: ProfileV2,
            targetProperty: "owner",
            name: "MigrationRelationComputedProfileOwner",
            type: "1:1",
            isTargetReliance: true,
            properties: [
                new Property({ name: "score", type: "number", computation: relationScore }, { uuid: "migration-relation-computed-score" }),
            ],
        }, { uuid: "migration-relation-computed-profile-owner" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, ProfileV2], relations: [ProfileOwnerV2] });
        const plan = await dryRunWithApproval(controllerV2);
        const relationRecord = plan.schemaPlan!.schema.records.find(record => record.recordName === "MigrationRelationComputedProfileOwner")!;
        const scoreAttribute = relationRecord.attributeDetails!.find(attribute => attribute.name === "score")!;
        const addScoreColumn = plan.schemaPlan!.preRecomputeDDL.find(operation => operation.columnName === scoreAttribute.fieldName);

        expect(relationRecord.tableName).not.toBe("MigrationRelationComputedProfileOwner");
        expect(addScoreColumn?.tableName).toBe(scoreAttribute.tableName);
        expect(addScoreColumn?.tableName).toBe(relationRecord.tableName);
        await db.close();
    });

    test("dry-run reports destructive fact property removal and type changes", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationDestructiveProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-destructive-name" }),
                new Property({ name: "price", type: "number" }, { uuid: "migration-destructive-price" }),
            ],
        }, { uuid: "migration-destructive-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationDestructiveProduct",
            properties: [
                new Property({ name: "name", type: "number" }, { uuid: "migration-destructive-name" }),
            ],
        }, { uuid: "migration-destructive-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await controllerV2.migrate({ approvedDiff, dryRun: true });

        expect(plan.blockingChanges.join("\n")).toMatch(/fact attribute was removed/);
        expect(plan.blockingChanges.join("\n")).toMatch(/fact attribute type/);
        await db.close();
    });

    test("migrate recomputes downstream global computations in dependency order", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationGraphSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-graph-source-value" })],
        }, { uuid: "migration-graph-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationGraphSource", { value: 2 });
        await systemV1.storage.create("MigrationGraphSource", { value: 3 });

        const SourceV2 = new Entity({
            name: "MigrationGraphSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-graph-source-value" })],
        }, { uuid: "migration-graph-source" });
        const sumComputation = new Custom({
            name: "MigrationGraphSum",
            dataDeps: { records: { type: "records", source: SourceV2, attributeQuery: ["value"] } },
            compute: async ({ records }: any) => records.reduce((total: number, record: any) => total + record.value, 0),
        }, { uuid: "migration-graph-sum-computation" });
        const sumDict = new Dictionary({
            name: "migrationGraphSum",
            type: "number",
            collection: false,
            computation: sumComputation,
        }, { uuid: "migration-graph-sum" });
        const doubleComputation = new Custom({
            name: "MigrationGraphDouble",
            dataDeps: { sum: { type: "global", source: sumDict } },
            compute: async ({ sum }: any) => sum * 2,
        }, { uuid: "migration-graph-double-computation" });
        const doubleDict = new Dictionary({
            name: "migrationGraphDouble",
            type: "number",
            collection: false,
            computation: doubleComputation,
        }, { uuid: "migration-graph-double" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [sumDict, doubleDict] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(item => item.dataContext)).toEqual(["global:migrationGraphSum", "global:migrationGraphDouble"]);
        expect(await systemV2.storage.dict.get("migrationGraphSum")).toBe(5);
        expect(await systemV2.storage.dict.get("migrationGraphDouble")).toBe(10);
        await db.close();
    });

    test("migrate orders computed property dependencies", async () => {
        const db = new PGLiteDB();
        const ItemV1 = new Entity({
            name: "MigrationPropertyChainItem",
            properties: [new Property({ name: "base", type: "number" }, { uuid: "migration-property-chain-base" })],
        }, { uuid: "migration-property-chain-item" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ItemV1], relations: [] }).setup(true);
        const item = await systemV1.storage.create("MigrationPropertyChainItem", { base: 3 });

        const itemA = new Custom({
            name: "MigrationPropertyChainA",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async (_deps: any, record: any) => record.base * 2,
        }, { uuid: "migration-property-chain-a-computation" });
        const itemB = new Custom({
            name: "MigrationPropertyChainB",
            dataDeps: { current: { type: "property", attributeQuery: ["a"] } },
            compute: async (_deps: any, record: any) => record.a + 1,
        }, { uuid: "migration-property-chain-b-computation" });
        const ItemV2 = new Entity({
            name: "MigrationPropertyChainItem",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-chain-base" }),
                new Property({ name: "a", type: "number", computation: itemA }, { uuid: "migration-property-chain-a" }),
                new Property({ name: "b", type: "number", computation: itemB }, { uuid: "migration-property-chain-b" }),
            ],
        }, { uuid: "migration-property-chain-item" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ItemV2], relations: [] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toEqual([
            "property:MigrationPropertyChainItem.a",
            "property:MigrationPropertyChainItem.b",
        ]);
        const migrated = await systemV2.storage.findOne("MigrationPropertyChainItem", MatchExp.atom({ key: "id", value: ["=", item.id] }), undefined, ["*"]);
        expect(migrated.a).toBe(6);
        expect(migrated.b).toBe(7);
        await db.close();
    });

    test("relation aggregate migration events preserve related mutation details", async () => {
        const db = new PGLiteDB();
        const TaskV1 = new Entity({
            name: "MigrationRelationAggregateTask",
            properties: [
                new Property({ name: "status", type: "string" }, { uuid: "migration-relation-aggregate-task-status" }),
                new Property({ name: "active", type: "boolean" }, { uuid: "migration-relation-aggregate-task-active" }),
            ],
        }, { uuid: "migration-relation-aggregate-task" });
        const activeTaskCountV1 = new Count({
            property: "tasks",
            attributeQuery: ["active"],
            callback: (task: any) => task.active === true,
        }, { uuid: "migration-relation-aggregate-count-computation" });
        const UserV1 = new Entity({
            name: "MigrationRelationAggregateUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-relation-aggregate-user-name" }),
                new Property({ name: "activeTaskCount", type: "number", computation: activeTaskCountV1 }, { uuid: "migration-relation-aggregate-user-count" }),
            ],
        }, { uuid: "migration-relation-aggregate-user" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationRelationAggregateOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-aggregate-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationRelationAggregateUser", { name: "Alice" });
        const task1 = await systemV1.storage.create("MigrationRelationAggregateTask", { status: "open", active: true });
        const task2 = await systemV1.storage.create("MigrationRelationAggregateTask", { status: "open", active: false });
        await systemV1.storage.addRelationByNameById("MigrationRelationAggregateOwnsTask", user.id, task1.id);
        await systemV1.storage.addRelationByNameById("MigrationRelationAggregateOwnsTask", user.id, task2.id);
        const before = await systemV1.storage.findOne("MigrationRelationAggregateUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
        expect(before.activeTaskCount).toBe(1);

        const activeComputation = new Custom({
            name: "MigrationRelationAggregateActive",
            dataDeps: { current: { type: "property", attributeQuery: ["status"] } },
            compute: async (_deps: any, record: any) => record.status === "open",
        }, { uuid: "migration-relation-aggregate-active-computation" });
        const TaskV2 = new Entity({
            name: "MigrationRelationAggregateTask",
            properties: [
                new Property({ name: "status", type: "string" }, { uuid: "migration-relation-aggregate-task-status" }),
                new Property({ name: "active", type: "boolean", computation: activeComputation }, { uuid: "migration-relation-aggregate-task-active" }),
            ],
        }, { uuid: "migration-relation-aggregate-task" });
        const activeTaskCountV2 = new Count({
            property: "tasks",
            attributeQuery: ["active"],
            callback: (task: any) => task.active === true,
        }, { uuid: "migration-relation-aggregate-count-computation" });
        const UserV2 = new Entity({
            name: "MigrationRelationAggregateUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-relation-aggregate-user-name" }),
                new Property({ name: "activeTaskCount", type: "number", computation: activeTaskCountV2 }, { uuid: "migration-relation-aggregate-user-count" }),
            ],
        }, { uuid: "migration-relation-aggregate-user" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationRelationAggregateOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-aggregate-owns-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toEqual([
            "property:MigrationRelationAggregateTask.active",
            "property:MigrationRelationAggregateUser.activeTaskCount",
        ]);
        const migrated = await systemV2.storage.findOne("MigrationRelationAggregateUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
        expect(migrated.activeTaskCount).toBe(2);
        await db.close();
    });

    test("relation path migration dirty events expose relatedAttribute and relatedMutationEvent", async () => {
        const db = new PGLiteDB();
        const TaskV1 = new Entity({
            name: "MigrationEventShapeTask",
            properties: [
                new Property({ name: "status", type: "string" }, { uuid: "migration-event-shape-task-status" }),
                new Property({ name: "active", type: "boolean" }, { uuid: "migration-event-shape-task-active" }),
            ],
        }, { uuid: "migration-event-shape-task" });
        const probeV1 = new Custom({
            name: "MigrationEventShapeProbe",
            dataDeps: { current: { type: "property", attributeQuery: [["tasks", { attributeQuery: ["active"] }]] } },
            compute: async () => 0,
            incrementalCompute: async (lastValue: number) => lastValue,
        }, { uuid: "migration-event-shape-probe-computation" });
        const UserV1 = new Entity({
            name: "MigrationEventShapeUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-event-shape-user-name" }),
                new Property({ name: "probe", type: "number", computation: probeV1 }, { uuid: "migration-event-shape-user-probe" }),
            ],
        }, { uuid: "migration-event-shape-user" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationEventShapeOwnsTask",
            type: "1:n",
        }, { uuid: "migration-event-shape-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationEventShapeUser", { name: "Alice" });
        const task = await systemV1.storage.create("MigrationEventShapeTask", { status: "open", active: false });
        await systemV1.storage.addRelationByNameById("MigrationEventShapeOwnsTask", user.id, task.id);

        const activeComputation = new Custom({
            name: "MigrationEventShapeActive",
            dataDeps: { current: { type: "property", attributeQuery: ["status"] } },
            compute: async (_deps: any, record: any) => record.status === "open",
        }, { uuid: "migration-event-shape-active-computation" });
        const TaskV2 = new Entity({
            name: "MigrationEventShapeTask",
            properties: [
                new Property({ name: "status", type: "string" }, { uuid: "migration-event-shape-task-status" }),
                new Property({ name: "active", type: "boolean", computation: activeComputation }, { uuid: "migration-event-shape-task-active" }),
            ],
        }, { uuid: "migration-event-shape-task" });
        let sawRelationEventShape = false;
        const probeV2 = new Custom({
            name: "MigrationEventShapeProbe",
            dataDeps: { current: { type: "property", attributeQuery: [["tasks", { attributeQuery: ["active"] }]] } },
            compute: async () => 0,
            incrementalCompute: async (lastValue: number, mutationEvent: any) => {
                sawRelationEventShape =
                    mutationEvent.relatedAttribute?.[0] === "tasks" &&
                    mutationEvent.relatedMutationEvent?.recordName === "MigrationEventShapeTask" &&
                    mutationEvent.relatedMutationEvent?.keys?.includes("active");
                return lastValue;
            },
        }, { uuid: "migration-event-shape-probe-computation" });
        const UserV2 = new Entity({
            name: "MigrationEventShapeUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-event-shape-user-name" }),
                new Property({ name: "probe", type: "number", computation: probeV2 }, { uuid: "migration-event-shape-user-probe" }),
            ],
        }, { uuid: "migration-event-shape-user" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationEventShapeOwnsTask",
            type: "1:n",
        }, { uuid: "migration-event-shape-owns-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await migrateWithApproval(controllerV2, {
            approvedDiff: {
                ...approvedDiff,
                decisions: approvedDiff.decisions.map(decision => decision.kind === "computation" && decision.dataContext === "property:MigrationEventShapeUser.probe"
                    ? { ...decision, decision: "unchanged" as const }
                    : decision),
            },
        });

        expect(sawRelationEventShape).toBe(true);
        await db.close();
    });

    test("multi-level relation path aggregates recompute through migration events", async () => {
        const db = new PGLiteDB();
        const CommentV1 = new Entity({
            name: "MigrationDeepComment",
            properties: [
                new Property({ name: "status", type: "string" }, { uuid: "migration-deep-comment-status" }),
                new Property({ name: "flagged", type: "boolean" }, { uuid: "migration-deep-comment-flagged" }),
            ],
        }, { uuid: "migration-deep-comment" });
        const TaskV1 = new Entity({
            name: "MigrationDeepTask",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-deep-task-title" })],
        }, { uuid: "migration-deep-task" });
        const flaggedTaskCountV1 = new Count({
            property: "tasks",
            attributeQuery: [["comments", { attributeQuery: ["flagged"] }]],
            callback: (task: any) => (task.comments || []).some((comment: any) => comment.flagged === true),
        }, { uuid: "migration-deep-user-count-computation" });
        const UserV1 = new Entity({
            name: "MigrationDeepUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-deep-user-name" }),
                new Property({ name: "flaggedTaskCount", type: "number", computation: flaggedTaskCountV1 }, { uuid: "migration-deep-user-count" }),
            ],
        }, { uuid: "migration-deep-user" });
        const UserTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationDeepUserTask",
            type: "1:n",
        }, { uuid: "migration-deep-user-task" });
        const TaskCommentV1 = new Relation({
            source: TaskV1,
            sourceProperty: "comments",
            target: CommentV1,
            targetProperty: "task",
            name: "MigrationDeepTaskComment",
            type: "1:n",
        }, { uuid: "migration-deep-task-comment" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1, CommentV1], relations: [UserTaskV1, TaskCommentV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationDeepUser", { name: "Alice" });
        const task1 = await systemV1.storage.create("MigrationDeepTask", { title: "T1" });
        const task2 = await systemV1.storage.create("MigrationDeepTask", { title: "T2" });
        const comment1 = await systemV1.storage.create("MigrationDeepComment", { status: "normal", flagged: true });
        const comment2 = await systemV1.storage.create("MigrationDeepComment", { status: "flagged", flagged: false });
        await systemV1.storage.addRelationByNameById("MigrationDeepUserTask", user.id, task1.id);
        await systemV1.storage.addRelationByNameById("MigrationDeepUserTask", user.id, task2.id);
        await systemV1.storage.addRelationByNameById("MigrationDeepTaskComment", task1.id, comment1.id);
        await systemV1.storage.addRelationByNameById("MigrationDeepTaskComment", task2.id, comment2.id);
        const before = await systemV1.storage.findOne("MigrationDeepUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
        expect(before.flaggedTaskCount).toBe(1);

        const flaggedComputation = new Custom({
            name: "MigrationDeepFlagged",
            dataDeps: { current: { type: "property", attributeQuery: ["status"] } },
            compute: async (_deps: any, record: any) => record.status === "flagged",
        }, { uuid: "migration-deep-flagged-computation" });
        const CommentV2 = new Entity({
            name: "MigrationDeepComment",
            properties: [
                new Property({ name: "status", type: "string" }, { uuid: "migration-deep-comment-status" }),
                new Property({ name: "flagged", type: "boolean", computation: flaggedComputation }, { uuid: "migration-deep-comment-flagged" }),
            ],
        }, { uuid: "migration-deep-comment" });
        const TaskV2 = new Entity({
            name: "MigrationDeepTask",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-deep-task-title" })],
        }, { uuid: "migration-deep-task" });
        const flaggedTaskCountV2 = new Count({
            property: "tasks",
            attributeQuery: [["comments", { attributeQuery: ["flagged"] }]],
            callback: (task: any) => (task.comments || []).some((comment: any) => comment.flagged === true),
        }, { uuid: "migration-deep-user-count-computation" });
        const UserV2 = new Entity({
            name: "MigrationDeepUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-deep-user-name" }),
                new Property({ name: "flaggedTaskCount", type: "number", computation: flaggedTaskCountV2 }, { uuid: "migration-deep-user-count" }),
            ],
        }, { uuid: "migration-deep-user" });
        const UserTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationDeepUserTask",
            type: "1:n",
        }, { uuid: "migration-deep-user-task" });
        const TaskCommentV2 = new Relation({
            source: TaskV2,
            sourceProperty: "comments",
            target: CommentV2,
            targetProperty: "task",
            name: "MigrationDeepTaskComment",
            type: "1:n",
        }, { uuid: "migration-deep-task-comment" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2, CommentV2], relations: [UserTaskV2, TaskCommentV2] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("property:MigrationDeepUser.flaggedTaskCount");
        const migrated = await systemV2.storage.findOne("MigrationDeepUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
        expect(migrated.flaggedTaskCount).toBe(1);
        await db.close();
    });

    test("filtered membership events trigger downstream computations", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationFilteredCountUser",
            properties: [new Property({ name: "age", type: "number" }, { uuid: "migration-filter-count-age" })],
        }, { uuid: "migration-filter-count-user" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationFilteredCountUser", { age: 20 });
        await systemV1.storage.create("MigrationFilteredCountUser", { age: 40 });

        const UserV2 = new Entity({
            name: "MigrationFilteredCountUser",
            properties: [new Property({ name: "age", type: "number" }, { uuid: "migration-filter-count-age" })],
        }, { uuid: "migration-filter-count-user" });
        const SeniorUser = new Entity({
            name: "MigrationSeniorUser",
            baseEntity: UserV2,
            matchExpression: MatchExp.atom({ key: "age", value: [">=", 30] }),
        }, { uuid: "migration-senior-user" });
        const seniorCount = new Dictionary({
            name: "migrationSeniorUserCount",
            type: "number",
            collection: false,
            computation: new Count({ record: SeniorUser }, { uuid: "migration-senior-count" }),
        }, { uuid: "migration-senior-count-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, SeniorUser], relations: [], dict: [seniorCount] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toContain("global:migrationSeniorUserCount");
        expect(await systemV2.storage.dict.get("migrationSeniorUserCount")).toBe(1);
        await db.close();
    });

    test("filtered relation membership events trigger downstream computations", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationFilteredRelationUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-filtered-relation-user-name" })],
        }, { uuid: "migration-filtered-relation-user" });
        const TaskV1 = new Entity({
            name: "MigrationFilteredRelationTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-filtered-relation-task-status" })],
        }, { uuid: "migration-filtered-relation-task" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationFilteredRelationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-filtered-relation-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationFilteredRelationUser", { name: "A" });
        const highTask = await systemV1.storage.create("MigrationFilteredRelationTask", { status: "high" });
        const lowTask = await systemV1.storage.create("MigrationFilteredRelationTask", { status: "low" });
        await systemV1.storage.addRelationByNameById("MigrationFilteredRelationOwnsTask", user.id, highTask.id);
        await systemV1.storage.addRelationByNameById("MigrationFilteredRelationOwnsTask", user.id, lowTask.id);

        const UserV2 = new Entity({
            name: "MigrationFilteredRelationUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-filtered-relation-user-name" })],
        }, { uuid: "migration-filtered-relation-user" });
        const TaskV2 = new Entity({
            name: "MigrationFilteredRelationTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-filtered-relation-task-status" })],
        }, { uuid: "migration-filtered-relation-task" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationFilteredRelationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-filtered-relation-owns-task" });
        const HighOwnsTask = new Relation({
            baseRelation: OwnsTaskV2,
            sourceProperty: "highTasks",
            targetProperty: "highOwner",
            name: "MigrationHighOwnsTask",
            matchExpression: MatchExp.atom({ key: "target.status", value: ["=", "high"] }),
        }, { uuid: "migration-high-owns-task" });
        const highRelationCount = new Dictionary({
            name: "migrationHighRelationCount",
            type: "number",
            collection: false,
            computation: new Count({ record: HighOwnsTask }, { uuid: "migration-high-relation-count" }),
        }, { uuid: "migration-high-relation-count-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2, HighOwnsTask], dict: [highRelationCount] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toContain("global:migrationHighRelationCount");
        expect(await systemV2.storage.dict.get("migrationHighRelationCount")).toBe(1);
        await db.close();
    });

    test("migrate creates new unique constraints after additive schema", async () => {
        const db = new PGLiteDB();
        const AccountV1 = new Entity({
            name: "MigrationConstraintAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-constraint-account-email" }),
            ],
        }, { uuid: "migration-constraint-account" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [AccountV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationConstraintAccount", { email: "a@example.com" });

        const AccountV2 = new Entity({
            name: "MigrationConstraintAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-constraint-account-email" }),
            ],
            constraints: [
                new UniqueConstraint({ name: "email_unique", properties: ["email"] }, { uuid: "migration-constraint-account-email-unique" }),
            ],
        }, { uuid: "migration-constraint-account" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [AccountV2], relations: [] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.schemaPlan?.postRecomputeDDL.some(operation => operation.kind === "create-constraint")).toBe(true);
        await expect(systemV2.storage.create("MigrationConstraintAccount", { email: "a@example.com" })).rejects.toThrow();
        const logs = await db.query<{ status: string, phase: string, approvedDiffHash: string, approvedDiffSummary: string, decisionCount: number }>(`SELECT "status", "phase", "approvedDiffHash", "approvedDiffSummary", "decisionCount" FROM "__interaqt_migration_log" ORDER BY "updatedAt" DESC LIMIT 1`, []);
        expect(logs[0].status).toBe("succeeded");
        expect(logs[0].phase).toBe("manifest-written");
        expect(logs[0].approvedDiffHash).toBe(plan.approvedDiffHash);
        expect(JSON.parse(logs[0].approvedDiffSummary)).toHaveProperty("changeCount");
        expect(Number(logs[0].decisionCount)).toBeGreaterThanOrEqual(0);
        const operationLogs = await db.query<{ operationKey: string }>(
            `SELECT "operationKey" FROM "__interaqt_migration_operation_log" WHERE "operationKey" LIKE 'verification:%' OR "operationKey" LIKE 'manifest:%'`,
            [],
        );
        expect(operationLogs.some(row => row.operationKey.startsWith("verification:"))).toBe(true);
        expect(operationLogs.some(row => row.operationKey.startsWith("manifest:"))).toBe(true);
        await db.close();
    });

    test("migrate verifies unique constraints before post-recompute creation", async () => {
        const db = new PGLiteDB();
        const AccountV1 = new Entity({
            name: "MigrationConstraintDuplicateAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-constraint-dup-account-email" }),
            ],
        }, { uuid: "migration-constraint-dup-account" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [AccountV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationConstraintDuplicateAccount", { email: "a@example.com" });
        await systemV1.storage.create("MigrationConstraintDuplicateAccount", { email: "a@example.com" });

        const AccountV2 = new Entity({
            name: "MigrationConstraintDuplicateAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-constraint-dup-account-email" }),
            ],
            constraints: [
                new UniqueConstraint({ name: "email_unique", properties: ["email"] }, { uuid: "migration-constraint-dup-account-email-unique" }),
            ],
        }, { uuid: "migration-constraint-dup-account" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [AccountV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await controllerV2.migrate({ approvedDiff, dryRun: true });

        expect(plan.schemaPlan?.verificationDDL.some(operation => operation.kind === "verify")).toBe(true);
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/Migration verification failed/);
        await db.close();
    });

    test("migrate verifies computed non-null constraints before post-recompute creation", async () => {
        const db = new PGLiteDB();
        const AccountV1 = new Entity({
            name: "MigrationNonNullAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-non-null-account-email" }),
            ],
        }, { uuid: "migration-non-null-account" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [AccountV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationNonNullAccount", { email: "a@example.com" });

        const badComputation = new Custom({
            name: "MigrationNonNullCustom",
            dataDeps: { current: { type: "property", attributeQuery: ["email"] } },
            compute: async () => null,
        }, { uuid: "migration-non-null-custom" });
        const AccountV2 = new Entity({
            name: "MigrationNonNullAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-non-null-account-email" }),
                new Property({ name: "normalizedEmail", type: "string", computation: badComputation }, { uuid: "migration-non-null-normalized-email" }),
            ],
            constraints: [
                new NonNullConstraint({ name: "normalized_email_required", property: "normalizedEmail" }, { uuid: "migration-non-null-required" }),
            ],
        }, { uuid: "migration-non-null-account" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [AccountV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.schemaPlan?.verificationDDL.some(operation => operation.logicalPath === "MigrationNonNullAccount.normalizedEmail")).toBe(true);
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/Migration verification failed/);
        await db.close();
    });

    test("migrate verifies computed unique properties after backfill before creating indexes", async () => {
        const db = new PGLiteDB();
        const AccountV1 = new Entity({
            name: "MigrationComputedUniqueAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-computed-unique-email" }),
            ],
        }, { uuid: "migration-computed-unique-account" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [AccountV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationComputedUniqueAccount", { email: "A@example.com" });
        await systemV1.storage.create("MigrationComputedUniqueAccount", { email: "a@example.com" });

        const normalizedEmail = new Custom({
            name: "MigrationComputedUniqueNormalize",
            dataDeps: { current: { type: "property", attributeQuery: ["email"] } },
            compute: async (_deps: any, record: any) => record.email.toLowerCase(),
        }, { uuid: "migration-computed-unique-normalize" });
        const AccountV2 = new Entity({
            name: "MigrationComputedUniqueAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-computed-unique-email" }),
                new Property({ name: "normalizedEmail", type: "string", computation: normalizedEmail }, { uuid: "migration-computed-unique-normalized" }),
            ],
            constraints: [
                new UniqueConstraint({ name: "normalized_email_unique", properties: ["normalizedEmail"] }, { uuid: "migration-computed-unique-constraint" }),
            ],
        }, { uuid: "migration-computed-unique-account" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [AccountV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.schemaPlan?.preRecomputeDDL.some(operation => operation.kind === "add-column" && operation.logicalPath === undefined)).toBe(true);
        expect(plan.schemaPlan?.verificationDDL.some(operation => operation.logicalPath === "MigrationComputedUniqueAccount.normalizedEmail")).toBe(true);
        expect(plan.schemaPlan?.postRecomputeDDL.some(operation => operation.logicalPath === "MigrationComputedUniqueAccount.normalizedEmail")).toBe(true);
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/Migration verification failed for MigrationComputedUniqueAccount\.normalizedEmail/);
        await db.close();
    });

    test("dry-run fails clearly when the driver cannot add post-recompute unique constraints", async () => {
        const db = new PGLiteDB();
        const AccountV1 = new Entity({
            name: "MigrationUnsupportedConstraintAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-unsupported-constraint-email" }),
            ],
        }, { uuid: "migration-unsupported-constraint-account" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [AccountV1], relations: [] }).setup(true);
        (db.schemaDialect as any).constraints.unique = false;

        const AccountV2 = new Entity({
            name: "MigrationUnsupportedConstraintAccount",
            properties: [
                new Property({ name: "email", type: "string" }, { uuid: "migration-unsupported-constraint-email" }),
            ],
            constraints: [
                new UniqueConstraint({ name: "email_unique", properties: ["email"] }, { uuid: "migration-unsupported-constraint-unique" }),
            ],
        }, { uuid: "migration-unsupported-constraint-account" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [AccountV2], relations: [] });

        await expect(dryRunWithApproval(controllerV2)).rejects.toThrow(/post-recompute unique constraints are not supported/);
        await db.close();
    });

    test("function-based changed computations require diff review without migrationKey", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationFunctionSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-function-source-value" })],
        }, { uuid: "migration-function-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);

        const SourceV2 = new Entity({
            name: "MigrationFunctionSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-function-source-value" })],
        }, { uuid: "migration-function-source" });
        const computation = new Custom({
            name: "MigrationFunctionCustom",
            dataDeps: { records: { type: "records", source: SourceV2, attributeQuery: ["value"] } },
            compute: async () => 1,
        }, { uuid: "migration-function-custom" });
        const dict = new Dictionary({
            name: "migrationFunctionValue",
            type: "number",
            collection: false,
            computation,
        }, { uuid: "migration-function-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [dict] });
        const diff = await controllerV2.generateMigrationDiff({ includeFunctionText: true });

        expect(diff.requiredDecisions.some(item => item.kind === "computation" && item.dataContext === "global:migrationFunctionValue")).toBe(true);
        await db.close();
    });

    test("nested function semantics require diff review without migrationKey", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationNestedFunctionSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-nested-function-source-value" })],
        }, { uuid: "migration-nested-function-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);

        const SourceV2 = new Entity({
            name: "MigrationNestedFunctionSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-nested-function-source-value" })],
        }, { uuid: "migration-nested-function-source" });
        const dict = new Dictionary({
            name: "migrationNestedFunctionCount",
            type: "number",
            collection: false,
            computation: new Count({
                record: SourceV2,
                dataDeps: {
                    extra: {
                        type: "records",
                        source: SourceV2,
                        match: () => true,
                    } as any,
                },
            }, { uuid: "migration-nested-function-count-computation" }),
        }, { uuid: "migration-nested-function-count" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [dict] });
        const diff = await controllerV2.generateMigrationDiff({ includeFunctionText: true });

        expect(diff.requiredDecisions.some(item => item.kind === "computation" && item.dataContext === "global:migrationNestedFunctionCount")).toBe(true);
        await db.close();
    });

    test("event-based computations without external rebuild handler are blocked", async () => {
        const db = new PGLiteDB();
        const TicketV1 = new Entity({
            name: "MigrationEventTicket",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-event-ticket-title" })],
        }, { uuid: "migration-event-ticket" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [TicketV1], relations: [] }).setup(true);

        const open = new StateNode({ name: "open" }, { uuid: "migration-event-open" });
        const closed = new StateNode({ name: "closed" }, { uuid: "migration-event-closed" });
        const stateMachine = new StateMachine({
            states: [open, closed],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationEventTicket", type: "update" },
                    current: open,
                    next: closed,
                }, { uuid: "migration-event-transfer" }),
            ],
            initialState: open,
        }, { uuid: "migration-event-state-machine" });
        const TicketV2 = new Entity({
            name: "MigrationEventTicket",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-event-ticket-title" }),
                new Property({ name: "status", type: "string", computation: stateMachine }, { uuid: "migration-event-ticket-status" }),
            ],
        }, { uuid: "migration-event-ticket" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [TicketV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.requiredDecisions.some(item => item.kind === "event-rebuild-handler" && item.dataContext === "property:MigrationEventTicket.status")).toBe(true);
        await expect(dryRunWithApproval(controllerV2)).rejects.toThrow(/Missing migration event rebuild handler/);
        await db.close();
    });

    test("eventDeps are included when upstream computed properties change", async () => {
        const db = new PGLiteDB();
        const openV1 = new StateNode({ name: "open" }, { uuid: "migration-eventdeps-open" });
        const closedV1 = new StateNode({ name: "closed" }, { uuid: "migration-eventdeps-closed" });
        const stateMachineV1 = new StateMachine({
            states: [openV1, closedV1],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationEventDepsTicket", type: "update" },
                    current: openV1,
                    next: closedV1,
                }, { uuid: "migration-eventdeps-transfer" }),
            ],
            initialState: openV1,
        }, { uuid: "migration-eventdeps-machine" });
        const TicketV1 = new Entity({
            name: "MigrationEventDepsTicket",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-eventdeps-title" }),
                new Property({ name: "status", type: "string", computation: stateMachineV1 }, { uuid: "migration-eventdeps-status" }),
            ],
        }, { uuid: "migration-eventdeps-ticket" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [TicketV1], relations: [] }).setup(true);

        const flagComputation = new Custom({
            name: "MigrationEventDepsFlag",
            dataDeps: { current: { type: "property", attributeQuery: ["title"] } },
            compute: async (_deps: any, record: any) => record.title.length > 0,
        }, { uuid: "migration-eventdeps-flag-computation" });
        const openV2 = new StateNode({ name: "open" }, { uuid: "migration-eventdeps-open" });
        const closedV2 = new StateNode({ name: "closed" }, { uuid: "migration-eventdeps-closed" });
        const stateMachineV2 = new StateMachine({
            states: [openV2, closedV2],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationEventDepsTicket", type: "update" },
                    current: openV2,
                    next: closedV2,
                }, { uuid: "migration-eventdeps-transfer" }),
            ],
            initialState: openV2,
        }, { uuid: "migration-eventdeps-machine" });
        const TicketV2 = new Entity({
            name: "MigrationEventDepsTicket",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-eventdeps-title" }),
                new Property({ name: "flag", type: "boolean", computation: flagComputation }, { uuid: "migration-eventdeps-flag" }),
                new Property({ name: "status", type: "string", computation: stateMachineV2 }, { uuid: "migration-eventdeps-status" }),
            ],
        }, { uuid: "migration-eventdeps-ticket" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [TicketV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2, {
            handlers: {
                eventRebuild: {
                    "property:MigrationEventDepsTicket.status": async () => "open",
                },
            },
        });

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("property:MigrationEventDepsTicket.status");
        await db.close();
    });

    test("StateMachine event rebuild handler is executed when provided", async () => {
        const db = new PGLiteDB();
        const TicketV1 = new Entity({
            name: "MigrationStateMachineContractTicket",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-sm-contract-title" })],
        }, { uuid: "migration-sm-contract-ticket" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [TicketV1], relations: [] }).setup(true);
        const ticket = await systemV1.storage.create("MigrationStateMachineContractTicket", { title: "A" });

        const open = new StateNode({ name: "open" }, { uuid: "migration-sm-contract-open" });
        const closed = new StateNode({ name: "closed", computeValue: () => "closed" }, { uuid: "migration-sm-contract-closed" });
        const stateMachine = new StateMachine({
            states: [open, closed],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationStateMachineContractTicket", type: "update" },
                    current: open,
                    next: closed,
                }, { uuid: "migration-sm-contract-transfer" }),
            ],
            initialState: open,
        }, { uuid: "migration-sm-contract-machine" });
        const TicketV2 = new Entity({
            name: "MigrationStateMachineContractTicket",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-sm-contract-title" }),
                new Property({ name: "status", type: "string", computation: stateMachine }, { uuid: "migration-sm-contract-status" }),
            ],
        }, { uuid: "migration-sm-contract-ticket" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [TicketV2], relations: [] });
        await expect(migrateWithApproval(controllerV2, {
            handlers: {
                eventRebuild: {
                    "property:MigrationStateMachineContractTicket.status": async () => ComputationResult.resolved("migrated"),
                },
            },
        })).rejects.toThrow(/direct final output|asyncReturn resolution/);
        await migrateWithApproval(controllerV2, {
            handlers: {
                eventRebuild: {
                    "property:MigrationStateMachineContractTicket.status": async () => "migrated",
                },
            },
        });

        const migrated = await systemV2.storage.findOne("MigrationStateMachineContractTicket", MatchExp.atom({ key: "id", value: ["=", ticket.id] }), undefined, ["*"]);
        expect(migrated.status).toBe("migrated");
        await db.close();
    });

    test("custom full compute contract is executed during migration", async () => {
        const db = new PGLiteDB();
        const TicketV1 = new Entity({
            name: "MigrationEventContractTicket",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-event-contract-title" })],
        }, { uuid: "migration-event-contract-ticket" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [TicketV1], relations: [] }).setup(true);

        const TicketV2 = new Entity({
            name: "MigrationEventContractTicket",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-event-contract-title" })],
        }, { uuid: "migration-event-contract-ticket" });
        const migrationOnly = new Custom({
            name: "MigrationEventContractCustom",
            compute: async () => 42,
        }, { uuid: "migration-event-contract-custom" });
        const dict = new Dictionary({
            name: "migrationEventContractValue",
            type: "number",
            collection: false,
            computation: migrationOnly,
        }, { uuid: "migration-event-contract-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [TicketV2], relations: [], dict: [dict] });
        await migrateWithApproval(controllerV2);

        expect(await systemV2.storage.dict.get("migrationEventContractValue")).toBe(42);
        await db.close();
    });

    test("state-only changes rebuild bound state without changing output", async () => {
        const db = new PGLiteDB();
        const stateV1 = new Custom({
            name: "MigrationStateOnlyCustom",
            createState: function () {
                return { tracker: new GlobalBoundState(0) };
            },
            compute: async () => 1,
        }, { uuid: "migration-state-only-custom" });
        const dictV1 = new Dictionary({
            name: "migrationStateOnlyValue",
            type: "number",
            collection: false,
            computation: stateV1,
        }, { uuid: "migration-state-only-dict" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [], relations: [], dict: [dictV1] }).setup(true);
        expect(await systemV1.storage.atomic.get({ key: "_migrationStateOnlyValue_bound_tracker", valueType: "number", defaultValue: 0 })).toBe(0);

        const stateV2 = new Custom({
            name: "MigrationStateOnlyCustom",
            createState: function () {
                return { tracker: new GlobalBoundState(10) };
            },
            compute: async () => 1,
        }, { uuid: "migration-state-only-custom" });
        const dictV2 = new Dictionary({
            name: "migrationStateOnlyValue",
            type: "number",
            collection: false,
            computation: stateV2,
        }, { uuid: "migration-state-only-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [], relations: [], dict: [dictV2] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan[0]).toMatchObject({ rebuildState: true, rebuildOutput: false, propagateOutputEvents: false });
        expect(await systemV2.storage.dict.get("migrationStateOnlyValue")).toBeUndefined();
        expect(await systemV2.storage.atomic.get({ key: "_migrationStateOnlyValue_bound_tracker", valueType: "number", defaultValue: 10 })).toBe(10);
        await db.close();
    });

    test("state-only changes do not execute downstream computations", async () => {
        const db = new PGLiteDB();
        const stateV1 = new Custom({
            name: "MigrationStateOnlyNoDownstreamSource",
            createState: function () {
                return { tracker: new GlobalBoundState(0) };
            },
            compute: async () => 1,
        }, { uuid: "migration-state-only-no-downstream-source" });
        const sourceDictV1 = new Dictionary({
            name: "migrationStateOnlyNoDownstreamSource",
            type: "number",
            collection: false,
            computation: stateV1,
        }, { uuid: "migration-state-only-no-downstream-source-dict" });
        const downstreamV1 = new Custom({
            name: "MigrationStateOnlyNoDownstream",
            dataDeps: { source: { type: "global", source: sourceDictV1 } },
            compute: async ({ source }: any) => source + 1,
        }, { uuid: "migration-state-only-no-downstream-computation" });
        const downstreamDictV1 = new Dictionary({
            name: "migrationStateOnlyNoDownstream",
            type: "number",
            collection: false,
            computation: downstreamV1,
        }, { uuid: "migration-state-only-no-downstream-dict" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [], relations: [], dict: [sourceDictV1, downstreamDictV1] }).setup(true);

        let downstreamCalls = 0;
        const stateV2 = new Custom({
            name: "MigrationStateOnlyNoDownstreamSource",
            createState: function () {
                return { tracker: new GlobalBoundState(10) };
            },
            compute: async () => 1,
        }, { uuid: "migration-state-only-no-downstream-source" });
        const sourceDictV2 = new Dictionary({
            name: "migrationStateOnlyNoDownstreamSource",
            type: "number",
            collection: false,
            computation: stateV2,
        }, { uuid: "migration-state-only-no-downstream-source-dict" });
        const downstreamV2 = new Custom({
            name: "MigrationStateOnlyNoDownstream",
            dataDeps: { source: { type: "global", source: sourceDictV2 } },
            compute: async ({ source }: any) => {
                downstreamCalls++;
                return source + 1;
            },
        }, { uuid: "migration-state-only-no-downstream-computation" });
        const downstreamDictV2 = new Dictionary({
            name: "migrationStateOnlyNoDownstream",
            type: "number",
            collection: false,
            computation: downstreamV2,
        }, { uuid: "migration-state-only-no-downstream-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [], relations: [], dict: [sourceDictV2, downstreamDictV2] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await migrateWithApproval(controllerV2, {
            approvedDiff: {
                ...approvedDiff,
                decisions: approvedDiff.decisions.map(decision => decision.kind === "computation" && decision.dataContext === "global:migrationStateOnlyNoDownstream"
                    ? { ...decision, decision: "unchanged" as const }
                    : decision),
            },
        });

        expect(plan.rebuildPlan.map(item => item.dataContext)).toEqual(["global:migrationStateOnlyNoDownstreamSource"]);
        expect(downstreamCalls).toBe(0);
        await db.close();
    });

    test("rerunning migration after success returns an empty plan", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationRerunProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-rerun-product-name" })],
        }, { uuid: "migration-rerun-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationRerunProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-rerun-product-name" }),
            ],
        }, { uuid: "migration-rerun-product" });
        const countDict = new Dictionary({
            name: "migrationRerunCount",
            type: "number",
            collection: false,
            computation: new Count({ record: ProductV2 }, { uuid: "migration-rerun-count" }),
        }, { uuid: "migration-rerun-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [], dict: [countDict] });
        await migrateWithApproval(controllerV2);
        const secondPlan = await dryRunWithApproval(controllerV2);

        expect(secondPlan.changedComputations).toHaveLength(0);
        expect(secondPlan.rebuildPlan).toHaveLength(0);
        await db.close();
    });

    test("migration does not trigger record mutation side effects", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationSideEffectUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-side-effect-name" })],
        }, { uuid: "migration-side-effect-user" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationSideEffectUser", { name: "A" });

        const computeLength = new Custom({
            name: "MigrationSideEffectLength",
            dataDeps: { current: { type: "property", attributeQuery: ["name"] } },
            compute: async (_deps: any, record: any) => record.name.length,
        }, { uuid: "migration-side-effect-computation" });
        const UserV2 = new Entity({
            name: "MigrationSideEffectUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-side-effect-name" }),
                new Property({ name: "nameLength", type: "number", computation: computeLength }, { uuid: "migration-side-effect-length" }),
            ],
        }, { uuid: "migration-side-effect-user" });
        let sideEffectCalls = 0;
        const sideEffect = RecordMutationSideEffect.create({
            name: "migrationSideEffectProbe",
            record: { name: "MigrationSideEffectUser" },
            content: async () => {
                sideEffectCalls++;
            },
        });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2], relations: [], recordMutationSideEffects: [sideEffect] });
        await migrateWithApproval(controllerV2);

        expect(sideEffectCalls).toBe(0);
        await db.close();
    });

    test("migration resume ignores failed runs with a different approved diff hash", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationDiffHashResumeProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-diffhash-resume-name" })],
        }, { uuid: "migration-diffhash-resume-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationDiffHashResumeProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-diffhash-resume-name" }),
                new Property({ name: "tag", type: "string" }, { uuid: "migration-diffhash-resume-tag" }),
            ],
        }, { uuid: "migration-diffhash-resume-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const states = controllerV2.scheduler.createStates();
        const schemaPlan = await (systemV2 as any).prepareMigrationSchema(controllerV2.entities, controllerV2.relations, states);
        const modelHash = createMigrationManifest(controllerV2, schemaPlan.schema).modelHash;
        await db.scheme(`INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "phase", "status", "createdAt", "updatedAt") VALUES ('wrong-diff-resume-migration', '${modelHash}', 'different-approved-diff', 'schema-applied', 'failed', 'now', 'now')`);

        await controllerV2.migrate({ approvedDiff });

        const columns = await db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            ["MigrationDiffHashResumeProduct"],
        );
        expect(columns.map(column => column.column_name)).toContain(schemaPlan.preRecomputeDDL[0].columnName);
        await db.close();
    });

    test("migration resumes from a recorded schema-applied phase", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationResumeProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-resume-name" })],
        }, { uuid: "migration-resume-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationResumeProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-resume-name" }),
                new Property({ name: "tag", type: "string" }, { uuid: "migration-resume-tag" }),
            ],
        }, { uuid: "migration-resume-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await controllerV2.migrate({ approvedDiff, dryRun: true });
        for (const operation of plan.schemaPlan!.preRecomputeDDL) {
            if (operation.sql) await db.scheme(operation.sql);
        }
        const states = controllerV2.scheduler.createStates();
        const schemaPlan = await (systemV2 as any).prepareMigrationSchema(controllerV2.entities, controllerV2.relations, states);
        const modelHash = createMigrationManifest(controllerV2, schemaPlan.schema).modelHash;
        const migrationId = "resume-migration";
        await db.scheme(`INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "phase", "status", "createdAt", "updatedAt") VALUES ('${migrationId}', '${modelHash}', '${hashMigrationDiff(approvedDiff)}', 'schema-applied', 'failed', 'now', 'now')`);
        await controllerV2.migrate({ approvedDiff });

        const columns = await db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            ["MigrationResumeProduct"],
        );
        expect(columns.length).toBeGreaterThan(0);
        await db.close();
    });

    test("migration resumes within schema phase using operation log", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationOperationResumeProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-op-resume-name" })],
        }, { uuid: "migration-op-resume-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationOperationResumeProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-op-resume-name" }),
                new Property({ name: "tag", type: "string" }, { uuid: "migration-op-resume-tag" }),
                new Property({ name: "category", type: "string" }, { uuid: "migration-op-resume-category" }),
            ],
        }, { uuid: "migration-op-resume-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await controllerV2.migrate({ approvedDiff, dryRun: true });
        const firstOperation = plan.schemaPlan!.preRecomputeDDL[0];
        await db.scheme(firstOperation.sql!);

        const states = controllerV2.scheduler.createStates();
        const schemaPlan = await (systemV2 as any).prepareMigrationSchema(controllerV2.entities, controllerV2.relations, states);
        const modelHash = createMigrationManifest(controllerV2, schemaPlan.schema).modelHash;
        const migrationId = "operation-resume-migration";
        const operationKey = `schema:0:${firstOperation.kind}:${firstOperation.tableName || ""}:${firstOperation.columnName || ""}:${firstOperation.logicalPath || ""}:${firstOperation.sql || firstOperation.description}`;
        await db.scheme(`INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "phase", "status", "createdAt", "updatedAt") VALUES ('${migrationId}', '${modelHash}', '${hashMigrationDiff(approvedDiff)}', 'pending', 'failed', 'now', 'now')`);
        await db.scheme(`INSERT INTO "__interaqt_migration_operation_log" ("migrationId", "operationKey", "status") VALUES ('${migrationId}', '${operationKey.replace(/'/g, "''")}', 'succeeded')`);
        await controllerV2.migrate({ approvedDiff });

        const columns = await db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            ["MigrationOperationResumeProduct"],
        );
        const columnNames = columns.map(column => column.column_name);
        expect(columnNames).toContain(plan.schemaPlan!.preRecomputeDDL[0].columnName);
        expect(columnNames).toContain(plan.schemaPlan!.preRecomputeDDL[1].columnName);
        await db.close();
    });
});
