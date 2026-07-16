import { describe, expect, test } from "vitest";
import { Average, Any, Controller, ComputationResult, Count, Custom, Dictionary, Entity, Every, Expression, GlobalBoundState, KlassByName, MatchExp, MonoSystem, NonNullConstraint, Property, RealTime, RecordMutationSideEffect, Relation, StateMachine, StateNode, StateTransfer, Summation, Transform, UniqueConstraint, WeightedSummation, computationManifestId, createMigrationManifest, hashMigrationDiff, readMigrationManifest, validateApprovedDiff, writeMigrationManifest } from "interaqt";
import { PGLiteDB } from "@drivers";
import { approveGeneratedMigrationDiff, dryRunWithApproval, migrateWithApproval } from "./helpers/migrationApproval.js";

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

    test("deleting async computed property reports unsupported internal task cleanup", async () => {
        const db = new PGLiteDB();
        const asyncNameCode = new Custom({
            name: "MigrationAsyncDeleteNameCode",
            compute: async () => ComputationResult.async({ value: "A" }),
            asyncReturn: async () => "A",
        }, { uuid: "migration-async-delete-name-code-computation" });
        const ProbeV1 = new Entity({
            name: "MigrationAsyncDeleteProbe",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-async-delete-name" }),
                new Property({ name: "asyncNameCode", type: "string", computation: asyncNameCode }, { uuid: "migration-async-delete-name-code" }),
            ],
        }, { uuid: "migration-async-delete-probe" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProbeV1], relations: [] }).setup(true);

        const ProbeV2 = new Entity({
            name: "MigrationAsyncDeleteProbe",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-async-delete-name" }),
            ],
        }, { uuid: "migration-async-delete-probe" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProbeV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/_ASYNC_TASK__MigrationAsyncDeleteProbe_asyncNameCode/);
        expect(plan.blockingChanges.join("\n")).toMatch(/async task record cleanup is not supported/);
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

    test("hard deletion recompute emits delete events and recomputes downstream counts", async () => {
        const db = new PGLiteDB();
        const build = (withDeletion: boolean) => {
            const User = new Entity({
                name: "MigrationHardDeleteDownstreamUser",
                properties: [
                    new Property({ name: "name", type: "string" }, { uuid: "migration-hd-downstream-name" }),
                    ...(withDeletion ? [new Property({
                        name: "_isDeleted_",
                        type: "boolean",
                        computation: new Custom({
                            name: "MigrationHardDeleteDownstreamFlag",
                            dataDeps: { current: { type: "property", attributeQuery: ["name"] } },
                            compute: async (_deps: any, record: any) => record.name === "gone",
                        }, { uuid: "migration-hd-downstream-flag-computation" }),
                    }, { uuid: "migration-hd-downstream-flag" })] : []),
                ],
            }, { uuid: "migration-hd-downstream-user" });
            const userCount = new Dictionary({
                name: "migrationHardDeleteDownstreamCount",
                type: "number",
                collection: false,
                computation: new Count({ record: User }, { uuid: "migration-hd-downstream-count-computation" }),
            }, { uuid: "migration-hd-downstream-count" });
            return { entities: [User], dict: [userCount] };
        };
        const v1 = build(false);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: [], dict: v1.dict }).setup(true);
        await systemV1.storage.create("MigrationHardDeleteDownstreamUser", { name: "keep" });
        await systemV1.storage.create("MigrationHardDeleteDownstreamUser", { name: "gone" });
        expect(await systemV1.storage.dict.get("migrationHardDeleteDownstreamCount")).toBe(2);

        const v2 = build(true);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: [], dict: v2.dict });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("global:migrationHardDeleteDownstreamCount");
        const remaining = await systemV2.storage.find("MigrationHardDeleteDownstreamUser", undefined, undefined, ["name"]);
        expect(remaining.map(user => user.name)).toEqual(["keep"]);
        expect(await systemV2.storage.dict.get("migrationHardDeleteDownstreamCount")).toBe(1);
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

    test("changed Transform-derived relation recomputes downstream aggregations over the relation", async () => {
        const db = new PGLiteDB();
        const build = (factor: number) => {
            const User = new Entity({
                name: "MigrationRelationDownstreamUser",
                properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-downstream-user-name" })],
            }, { uuid: "migration-relation-downstream-user" });
            const Item = new Entity({
                name: "MigrationRelationDownstreamItem",
                properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-relation-downstream-item-price" })],
            }, { uuid: "migration-relation-downstream-item" });
            const creatorRel = new Relation({
                source: Item,
                sourceProperty: "creator",
                target: User,
                targetProperty: "created",
                name: "MigrationRelationDownstreamCreator",
                type: "n:1",
            }, { uuid: "migration-relation-downstream-creator" });
            const derivedRel = new Relation({
                source: User,
                sourceProperty: "items",
                target: Item,
                targetProperty: "owner",
                name: "MigrationRelationDownstreamOwn",
                type: "n:n",
                properties: [new Property({ name: "weight", type: "number" }, { uuid: "migration-relation-downstream-own-weight" })],
                computation: new Transform({
                    record: Item,
                    attributeQuery: ["id", "price", ["creator", { attributeQuery: ["id"] }]],
                    callback: function (item: any) {
                        return item.creator ? { source: item.creator, target: item, weight: item.price * factor } : null;
                    },
                }, { uuid: "migration-relation-downstream-own-transform" }),
            }, { uuid: "migration-relation-downstream-own" });
            const weightSum = new Dictionary({
                name: "migrationRelationDownstreamWeightSum",
                type: "number",
                collection: false,
                computation: new Summation({
                    record: derivedRel,
                    attributeQuery: ["weight"],
                }, { uuid: "migration-relation-downstream-weight-sum-computation" }),
            }, { uuid: "migration-relation-downstream-weight-sum" });
            return { entities: [User, Item], relations: [derivedRel, creatorRel], dict: [weightSum] };
        };
        const v1 = build(1);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: v1.relations, dict: v1.dict }).setup(true);
        const user = await systemV1.storage.create("MigrationRelationDownstreamUser", { name: "u" });
        await systemV1.storage.create("MigrationRelationDownstreamItem", { price: 10, creator: { id: user.id } });
        await systemV1.storage.create("MigrationRelationDownstreamItem", { price: 20, creator: { id: user.id } });
        expect(await systemV1.storage.dict.get("migrationRelationDownstreamWeightSum")).toBe(30);

        const v2 = build(2);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: v2.relations, dict: v2.dict });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:relation:MigrationRelationDownstreamOwn:Transform": "changed",
            },
        });
        const plan = await controllerV2.migrate({ approvedDiff });

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("global:migrationRelationDownstreamWeightSum");
        expect(await systemV2.storage.dict.get("migrationRelationDownstreamWeightSum")).toBe(60);
        await db.close();
    });

    test("changed property computation recomputes aggregations whose records dep queries the property", async () => {
        const db = new PGLiteDB();
        const build = (factor: number) => {
            const Product = new Entity({
                name: "MigrationRecordsDepProduct",
                properties: [
                    new Property({ name: "price", type: "number" }, { uuid: "migration-records-dep-price" }),
                    new Property({
                        name: "adjusted",
                        type: "number",
                        computation: new Custom({
                            name: "MigrationRecordsDepAdjusted",
                            dataDeps: { current: { type: "property", attributeQuery: ["price"] } },
                            compute: factor === 1
                                ? (async (_deps: any, record: any) => record.price * 1)
                                : (async (_deps: any, record: any) => record.price * 2),
                        }, { uuid: "migration-records-dep-adjusted-computation" }),
                    }, { uuid: "migration-records-dep-adjusted" }),
                ],
            }, { uuid: "migration-records-dep-product" });
            const total = new Dictionary({
                name: "migrationRecordsDepTotal",
                type: "number",
                collection: false,
                computation: new Summation({
                    record: Product,
                    attributeQuery: ["adjusted"],
                }, { uuid: "migration-records-dep-total-computation" }),
            }, { uuid: "migration-records-dep-total" });
            return { entities: [Product], dict: [total] };
        };
        const v1 = build(1);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: [], dict: v1.dict }).setup(true);
        await systemV1.storage.create("MigrationRecordsDepProduct", { price: 10 });
        await systemV1.storage.create("MigrationRecordsDepProduct", { price: 20 });
        expect(await systemV1.storage.dict.get("migrationRecordsDepTotal")).toBe(30);

        const v2 = build(2);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: [], dict: v2.dict });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:property:MigrationRecordsDepProduct.adjusted:Custom": "changed",
            },
        });
        const plan = await controllerV2.migrate({ approvedDiff });

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("global:migrationRecordsDepTotal");
        expect(await systemV2.storage.dict.get("migrationRecordsDepTotal")).toBe(60);
        await db.close();
    });

    test("changed Transform output recomputes downstream aggregations over an existing filtered entity", async () => {
        const db = new PGLiteDB();
        const build = (factor: number) => {
            const Product = new Entity({
                name: "MigrationFilteredDownstreamProduct",
                properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-filtered-downstream-price" })],
            }, { uuid: "migration-filtered-downstream-product" });
            const Discount = new Entity({
                name: "MigrationFilteredDownstreamDiscount",
                properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-filtered-downstream-value" })],
                computation: new Transform({
                    record: Product,
                    attributeQuery: ["id", "price"],
                    callback: (item: any) => ({ value: item.price * factor }),
                }, { uuid: "migration-filtered-downstream-transform" }),
            }, { uuid: "migration-filtered-downstream-discount" });
            const BigDiscount = new Entity({
                name: "MigrationFilteredDownstreamBigDiscount",
                baseEntity: Discount,
                matchExpression: MatchExp.atom({ key: "value", value: [">", 15] }),
            }, { uuid: "migration-filtered-downstream-big-discount" });
            const bigSum = new Dictionary({
                name: "migrationFilteredDownstreamBigSum",
                type: "number",
                collection: false,
                computation: new Summation({
                    record: BigDiscount,
                    attributeQuery: ["value"],
                }, { uuid: "migration-filtered-downstream-big-sum-computation" }),
            }, { uuid: "migration-filtered-downstream-big-sum" });
            return { entities: [Product, Discount, BigDiscount], dict: [bigSum] };
        };
        const v1 = build(1);
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: v1.entities, relations: [], dict: v1.dict }).setup(true);
        await systemV1.storage.create("MigrationFilteredDownstreamProduct", { price: 10 });
        await systemV1.storage.create("MigrationFilteredDownstreamProduct", { price: 20 });
        expect(await systemV1.storage.dict.get("migrationFilteredDownstreamBigSum")).toBe(20);

        const v2 = build(2);
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: [], dict: v2.dict });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:entity:MigrationFilteredDownstreamDiscount:Transform": "changed",
            },
        });
        const plan = await controllerV2.migrate({ approvedDiff });

        expect(plan.rebuildPlan.map(item => item.dataContext)).toContain("global:migrationFilteredDownstreamBigSum");
        expect(await systemV2.storage.dict.get("migrationFilteredDownstreamBigSum")).toBe(60);
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
        // r30-E 收口后：diff 的 destructive scope 经模拟执行携带精确 stale ids——审批即知情
        //  opt-in。守住的性质不变：没有（或错误的）destructive-scope 决策仍然拒绝执行。
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const withoutOptIn = {
            ...approvedDiff,
            decisions: approvedDiff.decisions.filter(decision => decision.kind !== "destructive-scope"),
        };
        await expect(migrateWithApproval(controllerV2, { approvedDiff: withoutOptIn })).rejects.toThrow(/scope mismatch/);
        const wrongIds = {
            ...approvedDiff,
            decisions: approvedDiff.decisions.map(decision => decision.kind === "destructive-scope"
                ? { ...decision, ids: ["999999"] }
                : decision),
        };
        await expect(migrateWithApproval(controllerV2, { approvedDiff: wrongIds })).rejects.toThrow(/scope mismatch/);
        // 拒绝路径整体回滚：存量输出未被销毁（经 V1 storage 读取——V2 的 queryHandle 在失败前未初始化）
        expect(await systemV1.storage.find("MigrationTransformDeleteOutput", undefined, undefined, ["id"])).toHaveLength(2);
        // 生成的 diff 自带精确 stale ids（dryRun 的 deletionScope 与之一致）
        const dryRunPlan = await controllerV2.migrate({ approvedDiff, dryRun: true });
        const generatedScope = approvedDiff.decisions.find(decision => decision.kind === "destructive-scope" && decision.dataContext === "entity:MigrationTransformDeleteOutput") as { ids: string[] } | undefined;
        const dryRunScope = dryRunPlan.deletionScope.find(scope => scope.dataContext === "entity:MigrationTransformDeleteOutput");
        expect(generatedScope?.ids?.length).toBe(1);
        expect([...(dryRunScope?.ids || [])].sort()).toEqual([...(generatedScope?.ids || [])].sort());
        await migrateWithApproval(controllerV2, { approvedDiff });

        const outputs = await systemV2.storage.find("MigrationTransformDeleteOutput", undefined, undefined, ["value"]);
        expect(outputs.map(output => output.value)).toEqual([20]);
        await db.close();
    });

    test("event-based Transform dry-run requires an external rebuild handler", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationEventTransformSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-event-transform-source-value" })],
        }, { uuid: "migration-event-transform-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);

        const SourceV2 = new Entity({
            name: "MigrationEventTransformSource",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-event-transform-source-value" })],
        }, { uuid: "migration-event-transform-source" });
        const eventTransform = new Transform({
            eventDeps: {
                sourceUpdated: { recordName: "MigrationEventTransformSource", type: "update" },
            },
            callback: (event: any) => ({ value: event.record?.value ?? 0 }),
        }, { uuid: "migration-event-transform-computation" });
        const Output = new Entity({
            name: "MigrationEventTransformOutput",
            properties: [new Property({ name: "value", type: "number" }, { uuid: "migration-event-transform-output-value" })],
            computation: eventTransform,
        }, { uuid: "migration-event-transform-output" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2, Output], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.requiredDecisions.some(item => item.kind === "event-rebuild-handler" && item.dataContext === "entity:MigrationEventTransformOutput")).toBe(true);
        await expect(dryRunWithApproval(controllerV2)).rejects.toThrow(/Missing migration event rebuild handler/);
        await db.close();
    });

    test("migrate rebuilds added Transform relation output from existing relation records", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationRelationTransformUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-transform-user-name" })],
        }, { uuid: "migration-relation-transform-user" });
        const TaskV1 = new Entity({
            name: "MigrationRelationTransformTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-relation-transform-task-status" })],
        }, { uuid: "migration-relation-transform-task" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationRelationTransformOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-transform-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationRelationTransformUser", { name: "Alice" });
        const openTask = await systemV1.storage.create("MigrationRelationTransformTask", { status: "open" });
        const closedTask = await systemV1.storage.create("MigrationRelationTransformTask", { status: "closed" });
        await systemV1.storage.addRelationByNameById("MigrationRelationTransformOwnsTask", user.id, openTask.id);
        await systemV1.storage.addRelationByNameById("MigrationRelationTransformOwnsTask", user.id, closedTask.id);

        const UserV2 = new Entity({
            name: "MigrationRelationTransformUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-transform-user-name" })],
        }, { uuid: "migration-relation-transform-user" });
        const TaskV2 = new Entity({
            name: "MigrationRelationTransformTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-relation-transform-task-status" })],
        }, { uuid: "migration-relation-transform-task" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationRelationTransformOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-transform-owns-task" });
        const transform = new Transform({
            record: OwnsTaskV2,
            attributeQuery: [
                ["source", { attributeQuery: ["id"] }],
                ["target", { attributeQuery: ["id", "status"] }],
            ],
            callback: (relation: any) => relation.target.status === "open"
                ? { source: relation.source, target: relation.target }
                : null,
        }, { uuid: "migration-relation-transform-computation" });
        const OpenTask = new Relation({
            source: UserV2,
            sourceProperty: "openTasks",
            target: TaskV2,
            targetProperty: "openOwner",
            name: "MigrationRelationTransformOpenTask",
            type: "1:n",
            computation: transform,
        }, { uuid: "migration-relation-transform-open-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2, OpenTask] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toContain("relation:MigrationRelationTransformOpenTask");
        const migratedUser = await systemV2.storage.findOne(
            "MigrationRelationTransformUser",
            MatchExp.atom({ key: "id", value: ["=", user.id] }),
            undefined,
            [["openTasks", { attributeQuery: ["id", "status"] }]],
        );
        expect(migratedUser.openTasks).toHaveLength(1);
        expect(migratedUser.openTasks[0].id).toBe(openTask.id);
        await db.close();
    });

    test("non-Transform entity and relation output computations are blocked in dry-run", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationCustomOutputUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-output-user-name" })],
        }, { uuid: "migration-custom-output-user" });
        const TaskV1 = new Entity({
            name: "MigrationCustomOutputTask",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-output-task-name" })],
        }, { uuid: "migration-custom-output-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [] }).setup(true);

        const UserV2 = new Entity({
            name: "MigrationCustomOutputUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-output-user-name" })],
        }, { uuid: "migration-custom-output-user" });
        const TaskV2 = new Entity({
            name: "MigrationCustomOutputTask",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-output-task-name" })],
        }, { uuid: "migration-custom-output-task" });
        const customEntity = new Custom({
            name: "MigrationCustomOutputEntityComputation",
            compute: async () => [{ label: "derived" }],
        }, { uuid: "migration-custom-output-entity-computation" });
        const DerivedEntity = new Entity({
            name: "MigrationCustomOutputDerived",
            properties: [new Property({ name: "label", type: "string" }, { uuid: "migration-custom-output-derived-label" })],
            computation: customEntity,
        }, { uuid: "migration-custom-output-derived" });
        const customRelation = new Custom({
            name: "MigrationCustomOutputRelationComputation",
            compute: async () => [],
        }, { uuid: "migration-custom-output-relation-computation" });
        const DerivedRelation = new Relation({
            source: UserV2,
            sourceProperty: "derivedTasks",
            target: TaskV2,
            targetProperty: "derivedUsers",
            name: "MigrationCustomOutputDerivedRelation",
            type: "n:n",
            computation: customRelation,
        }, { uuid: "migration-custom-output-derived-relation" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2, DerivedEntity], relations: [DerivedRelation] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/entity:MigrationCustomOutputDerived/);
        expect(plan.blockingChanges.join("\n")).toMatch(/relation:MigrationCustomOutputDerivedRelation/);
        expect(plan.blockingChanges.join("\n")).toMatch(/data-based Transform with sourceRecordId and transformIndex/);
        await db.close();
    });

    test("fact entity and relation takeover to non-Transform output computations remains blocked", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationCustomTakeoverUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-takeover-user-name" })],
        }, { uuid: "migration-custom-takeover-user" });
        const TaskV1 = new Entity({
            name: "MigrationCustomTakeoverTask",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-takeover-task-name" })],
        }, { uuid: "migration-custom-takeover-task" });
        const DerivedEntityV1 = new Entity({
            name: "MigrationCustomTakeoverDerived",
            properties: [new Property({ name: "label", type: "string" }, { uuid: "migration-custom-takeover-derived-label" })],
        }, { uuid: "migration-custom-takeover-derived" });
        const DerivedRelationV1 = new Relation({
            source: UserV1,
            sourceProperty: "derivedTasks",
            target: TaskV1,
            targetProperty: "derivedUsers",
            name: "MigrationCustomTakeoverDerivedRelation",
            type: "n:n",
        }, { uuid: "migration-custom-takeover-derived-relation" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1, DerivedEntityV1], relations: [DerivedRelationV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationCustomTakeoverUser", { name: "Alice" });
        const task = await systemV1.storage.create("MigrationCustomTakeoverTask", { name: "T1" });
        await systemV1.storage.create("MigrationCustomTakeoverDerived", { label: "legacy" });
        await systemV1.storage.addRelationByNameById("MigrationCustomTakeoverDerivedRelation", user.id, task.id);

        const UserV2 = new Entity({
            name: "MigrationCustomTakeoverUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-takeover-user-name" })],
        }, { uuid: "migration-custom-takeover-user" });
        const TaskV2 = new Entity({
            name: "MigrationCustomTakeoverTask",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-custom-takeover-task-name" })],
        }, { uuid: "migration-custom-takeover-task" });
        const customEntity = new Custom({
            name: "MigrationCustomTakeoverEntityComputation",
            compute: async () => [{ label: "derived" }],
        }, { uuid: "migration-custom-takeover-entity-computation" });
        const DerivedEntityV2 = new Entity({
            name: "MigrationCustomTakeoverDerived",
            properties: [new Property({ name: "label", type: "string" }, { uuid: "migration-custom-takeover-derived-label" })],
            computation: customEntity,
        }, { uuid: "migration-custom-takeover-derived" });
        const customRelation = new Custom({
            name: "MigrationCustomTakeoverRelationComputation",
            compute: async () => [],
        }, { uuid: "migration-custom-takeover-relation-computation" });
        const DerivedRelationV2 = new Relation({
            source: UserV2,
            sourceProperty: "derivedTasks",
            target: TaskV2,
            targetProperty: "derivedUsers",
            name: "MigrationCustomTakeoverDerivedRelation",
            type: "n:n",
            computation: customRelation,
        }, { uuid: "migration-custom-takeover-derived-relation" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2, DerivedEntityV2], relations: [DerivedRelationV2] });
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        expect(diff.requiredDecisions).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "computation-takeover", dataContext: "entity:MigrationCustomTakeoverDerived" }),
            expect.objectContaining({ kind: "computation-takeover", dataContext: "relation:MigrationCustomTakeoverDerivedRelation" }),
        ]));

        const plan = await dryRunWithApproval(controllerV2);
        expect(plan.blockingChanges.join("\n")).toMatch(/entity:MigrationCustomTakeoverDerived/);
        expect(plan.blockingChanges.join("\n")).toMatch(/relation:MigrationCustomTakeoverDerivedRelation/);
        expect(plan.blockingChanges.join("\n")).toMatch(/data-based Transform with sourceRecordId and transformIndex/);
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

    test("existing fact records require explicit takeover approval before becoming computed entity output", async () => {
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
        await systemV1.storage.create("MigrationFactTakeoverProduct", { price: 20 });
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
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        expect(diff.requiredDecisions.some(item => item.kind === "computation-takeover" && item.dataContext === "entity:MigrationFactTakeoverDiscount")).toBe(true);
        await expect(controllerV2.migrate({
            dryRun: true,
            approvedDiff: {
                ...diff,
                status: "approved",
                decisions: diff.requiredDecisions
                    .filter(item => item.kind !== "computation-takeover")
                    .flatMap((requirement): any[] => {
                        if (requirement.kind === "computation") {
                            return [{ kind: "computation" as const, id: requirement.id, dataContext: requirement.dataContext, decision: requirement.recommendedDecision, reason: "approved without takeover" }];
                        }
                        if (requirement.kind === "destructive-scope") {
                            return [{ kind: "destructive-scope" as const, dataContext: requirement.dataContext, recordName: requirement.recordName, ids: requirement.ids, reason: "approved without takeover" }];
                        }
                        return [];
                    }),
            },
        })).rejects.toThrow(/Missing migration decision.*computation-takeover/);

        await migrateWithApproval(controllerV2);
        const outputs = await systemV2.storage.find("MigrationFactTakeoverDiscount", undefined, undefined, ["discounted"]);
        expect(outputs.map(item => item.discounted)).toEqual([20]);
        await db.close();
    });

    test("entity takeover fails when approved destructive scope no longer matches execution state", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationEntityTakeoverScopeProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-entity-takeover-scope-product-price" })],
        }, { uuid: "migration-entity-takeover-scope-product" });
        const DiscountV1 = new Entity({
            name: "MigrationEntityTakeoverScopeDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-entity-takeover-scope-discount-value" })],
        }, { uuid: "migration-entity-takeover-scope-discount" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, DiscountV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationEntityTakeoverScopeProduct", { price: 20 });
        await systemV1.storage.create("MigrationEntityTakeoverScopeDiscount", { discounted: 10 });

        const ProductV2 = new Entity({
            name: "MigrationEntityTakeoverScopeProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "migration-entity-takeover-scope-product-price" })],
        }, { uuid: "migration-entity-takeover-scope-product" });
        const transform = new Transform({
            record: ProductV2,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price }),
        }, { uuid: "migration-entity-takeover-scope-transform" });
        const DiscountV2 = new Entity({
            name: "MigrationEntityTakeoverScopeDiscount",
            properties: [new Property({ name: "discounted", type: "number" }, { uuid: "migration-entity-takeover-scope-discount-value" })],
            computation: transform,
        }, { uuid: "migration-entity-takeover-scope-discount" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2, DiscountV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await systemV1.storage.create("MigrationEntityTakeoverScopeDiscount", { discounted: 99 });

        await expect(controllerV2.migrate({ approvedDiff })).rejects.toThrow(/Computation takeover count mismatch|destructive scope mismatch/);
        await db.close();
    });

    test("existing fact relation links are cleared before computed relation takeover rebuilds", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationRelationTakeoverUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-takeover-user-name" })],
        }, { uuid: "migration-relation-takeover-user" });
        const TaskV1 = new Entity({
            name: "MigrationRelationTakeoverTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-relation-takeover-task-status" })],
        }, { uuid: "migration-relation-takeover-task" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationRelationTakeoverOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-takeover-owns-task" });
        const OpenTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "openTasks",
            target: TaskV1,
            targetProperty: "openOwner",
            name: "MigrationRelationTakeoverOpenTask",
            type: "1:n",
        }, { uuid: "migration-relation-takeover-open-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1, OpenTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationRelationTakeoverUser", { name: "u" });
        const openTask = await systemV1.storage.create("MigrationRelationTakeoverTask", { status: "open" });
        const closedTask = await systemV1.storage.create("MigrationRelationTakeoverTask", { status: "closed" });
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverOwnsTask", user.id, openTask.id);
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverOwnsTask", user.id, closedTask.id);
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverOpenTask", user.id, closedTask.id);

        const UserV2 = new Entity({
            name: "MigrationRelationTakeoverUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-takeover-user-name" })],
        }, { uuid: "migration-relation-takeover-user" });
        const TaskV2 = new Entity({
            name: "MigrationRelationTakeoverTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-relation-takeover-task-status" })],
        }, { uuid: "migration-relation-takeover-task" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationRelationTakeoverOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-takeover-owns-task" });
        const transform = new Transform({
            record: OwnsTaskV2,
            attributeQuery: [
                ["source", { attributeQuery: ["id"] }],
                ["target", { attributeQuery: ["id", "status"] }],
            ],
            callback: (relation: any) => relation.target.status === "open"
                ? { source: relation.source, target: relation.target }
                : null,
        }, { uuid: "migration-relation-takeover-transform" });
        const OpenTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "openTasks",
            target: TaskV2,
            targetProperty: "openOwner",
            name: "MigrationRelationTakeoverOpenTask",
            type: "1:n",
            computation: transform,
        }, { uuid: "migration-relation-takeover-open-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2, OpenTaskV2] });
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        expect(diff.requiredDecisions.some(item => item.kind === "computation-takeover" && item.dataContext === "relation:MigrationRelationTakeoverOpenTask")).toBe(true);
        await migrateWithApproval(controllerV2);

        const migratedUser = await systemV2.storage.findOne(
            "MigrationRelationTakeoverUser",
            MatchExp.atom({ key: "id", value: ["=", user.id] }),
            undefined,
            [["openTasks", { attributeQuery: ["id", "status"] }]],
        );
        expect(migratedUser.openTasks).toHaveLength(1);
        expect(migratedUser.openTasks[0].id).toBe(openTask.id);
        await db.close();
    });

    test("relation takeover fails when approved destructive scope no longer matches execution links", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationRelationTakeoverScopeUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-takeover-scope-user-name" })],
        }, { uuid: "migration-relation-takeover-scope-user" });
        const TaskV1 = new Entity({
            name: "MigrationRelationTakeoverScopeTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-relation-takeover-scope-task-status" })],
        }, { uuid: "migration-relation-takeover-scope-task" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationRelationTakeoverScopeOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-takeover-scope-owns-task" });
        const OpenTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "openTasks",
            target: TaskV1,
            targetProperty: "openOwner",
            name: "MigrationRelationTakeoverScopeOpenTask",
            type: "1:n",
        }, { uuid: "migration-relation-takeover-scope-open-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1, OpenTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationRelationTakeoverScopeUser", { name: "u" });
        const openTask = await systemV1.storage.create("MigrationRelationTakeoverScopeTask", { status: "open" });
        const closedTask = await systemV1.storage.create("MigrationRelationTakeoverScopeTask", { status: "closed" });
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverScopeOwnsTask", user.id, openTask.id);
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverScopeOwnsTask", user.id, closedTask.id);
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverScopeOpenTask", user.id, closedTask.id);

        const UserV2 = new Entity({
            name: "MigrationRelationTakeoverScopeUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-relation-takeover-scope-user-name" })],
        }, { uuid: "migration-relation-takeover-scope-user" });
        const TaskV2 = new Entity({
            name: "MigrationRelationTakeoverScopeTask",
            properties: [new Property({ name: "status", type: "string" }, { uuid: "migration-relation-takeover-scope-task-status" })],
        }, { uuid: "migration-relation-takeover-scope-task" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationRelationTakeoverScopeOwnsTask",
            type: "1:n",
        }, { uuid: "migration-relation-takeover-scope-owns-task" });
        const transform = new Transform({
            record: OwnsTaskV2,
            attributeQuery: [
                ["source", { attributeQuery: ["id"] }],
                ["target", { attributeQuery: ["id", "status"] }],
            ],
            callback: (relation: any) => relation.target.status === "open"
                ? { source: relation.source, target: relation.target }
                : null,
        }, { uuid: "migration-relation-takeover-scope-transform" });
        const OpenTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "openTasks",
            target: TaskV2,
            targetProperty: "openOwner",
            name: "MigrationRelationTakeoverScopeOpenTask",
            type: "1:n",
            computation: transform,
        }, { uuid: "migration-relation-takeover-scope-open-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2, OpenTaskV2] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await systemV1.storage.addRelationByNameById("MigrationRelationTakeoverScopeOpenTask", user.id, openTask.id);

        await expect(controllerV2.migrate({ approvedDiff })).rejects.toThrow(/Computation takeover count mismatch|destructive scope mismatch/);
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

    test("dry-run blocks record table moves even when the record hosts computation state attributes", async () => {
        const db = new PGLiteDB();
        const build = () => {
            const User = new Entity({
                name: "MigrationStateMoveUser",
                properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-state-move-user-name" })],
            }, { uuid: "migration-state-move-user" });
            const Post = new Entity({
                name: "MigrationStateMovePost",
                properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-state-move-post-title" })],
            }, { uuid: "migration-state-move-post" });
            const rel = new Relation({
                source: User,
                sourceProperty: "posts",
                target: Post,
                targetProperty: "author",
                name: "MigrationStateMoveAuthored",
                type: "1:n",
            }, { uuid: "migration-state-move-authored" });
            // property Count injects record-bound state (underscore attributes) onto User
            User.properties.push(new Property({
                name: "postCount",
                type: "number",
                computation: new Count({ property: "posts" }, { uuid: "migration-state-move-count-computation" }),
            }, { uuid: "migration-state-move-post-count" }));
            return { entities: [User, Post], relations: [rel] };
        };
        const v1 = build();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: v1.entities, relations: v1.relations });
        await controllerV1.setup(true);

        const manifest = await readMigrationManifest(controllerV1);
        const tampered = structuredClone(manifest!);
        const userRecord = tampered.storage.records.find(record => record.recordName === "MigrationStateMoveUser")!;
        expect(userRecord.attributes.some(attribute => attribute.startsWith("_"))).toBe(true);
        userRecord.tableName = "OldUserTableThatMoved";
        tampered.modelHash = "migration-state-move-tampered-hash";
        await writeMigrationManifest(controllerV1, tampered);

        const v2 = build();
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: v2.entities, relations: v2.relations });
        const plan = await dryRunWithApproval(controllerV2);
        expect(plan.blockingChanges.join("\n")).toMatch(/physical-path-move/);
        expect(plan.blockingChanges.join("\n")).toMatch(/MigrationStateMoveUser/);
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

    test("computation identity requires an explicitly declared type name", () => {
        const MinifiedArgs = class {
            uuid = "minified-computation-uuid";
        };
        const computation = {
            constructor: class {},
            args: new MinifiedArgs(),
            dataContext: { type: "property", host: { name: "MinifiedHost" }, id: { name: "value" } },
        };
        // Class names are rewritten by minifiers, so they must never become
        // migration identity. The manifest generator fails fast instead.
        expect(() => computationManifestId(computation as any)).toThrow(/stable migration identity.*displayName/s);
        expect(() => computationManifestId(computation as any)).toThrow(/property:MinifiedHost\.value/);
    });

    test("changed computation type ids appear as removed plus added", async () => {
        const db = new PGLiteDB();
        const Product = new Entity({
            name: "MigrationLegacyChangedFunctionProduct",
            properties: [
                new Property({ name: "price", type: "number" }, { uuid: "migration-legacy-changed-function-price" }),
                new Property({
                    name: "doublePrice",
                    type: "number",
                    computation: new Custom({
                        name: "MigrationLegacyChangedFunctionDouble",
                        dataDeps: { current: { type: "property", attributeQuery: ["price"] } },
                        compute: async (_deps: any, record: any) => record.price * 2,
                    }, { uuid: "migration-legacy-changed-function-double" }),
                }, { uuid: "migration-legacy-changed-function-double-price" }),
            ],
        }, { uuid: "migration-legacy-changed-function-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [Product], relations: [] });
        await controllerV1.setup(true);

        const manifest = await readMigrationManifest(controllerV1);
        const tampered = structuredClone(manifest!);
        const computation = tampered.computations.find(item => item.dataContext === "property:MigrationLegacyChangedFunctionProduct.doublePrice")!;
        computation.id = "computation:property:MigrationLegacyChangedFunctionProduct.doublePrice:Gr";
        computation.identity = {
            ...computation.identity,
            key: computation.id,
            namePath: computation.id,
        };
        computation.type = "Gr";
        computation.functionSignature = {
            ...computation.functionSignature!,
            hash: "legacy-different-function-hash",
        };
        tampered.modelHash = "legacy-changed-function-model-hash";
        await writeMigrationManifest(controllerV1, tampered);

        const ProductAgain = new Entity({
            name: "MigrationLegacyChangedFunctionProduct",
            properties: [
                new Property({ name: "price", type: "number" }, { uuid: "migration-legacy-changed-function-price" }),
                new Property({
                    name: "doublePrice",
                    type: "number",
                    computation: new Custom({
                        name: "MigrationLegacyChangedFunctionDouble",
                        dataDeps: { current: { type: "property", attributeQuery: ["price"] } },
                        compute: async (_deps: any, record: any) => record.price * 2,
                    }, { uuid: "migration-legacy-changed-function-double" }),
                }, { uuid: "migration-legacy-changed-function-double-price" }),
            ],
        }, { uuid: "migration-legacy-changed-function-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductAgain], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.changes.filter(change => change.kind === "computation")).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "computation", id: "computation:property:MigrationLegacyChangedFunctionProduct.doublePrice:Gr", changeType: "removed" }),
            expect.objectContaining({ kind: "computation", id: "computation:property:MigrationLegacyChangedFunctionProduct.doublePrice:Custom", changeType: "added" }),
        ]));
        await db.close();
    });

    test("approved empty fact record removal drops the retired table", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationEmptyFactProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-empty-fact-product-name" })],
        }, { uuid: "migration-empty-fact-product" });
        const EmptyFactV1 = new Entity({
            name: "MigrationEmptyFactRetired",
            properties: [new Property({ name: "note", type: "string" }, { uuid: "migration-empty-fact-retired-note" })],
        }, { uuid: "migration-empty-fact-retired" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, EmptyFactV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationEmptyFactProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-empty-fact-product-name" })],
        }, { uuid: "migration-empty-fact-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.requiredDecisions).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "empty-fact-record-removal", recordName: "MigrationEmptyFactRetired", expectedCount: 0 }),
        ]));
        expect(diff.safety.blockingChanges.some(change => change.logicalPath === "MigrationEmptyFactRetired")).toBe(false);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const plan = await controllerV2.migrate({ approvedDiff });
        expect(plan.schemaPlan?.postRecomputeDDL).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "drop-empty-fact-table", logicalPath: "MigrationEmptyFactRetired" }),
        ]));
        const tables = await (systemV2.storage as any).getExistingTables();
        expect(tables.has("MigrationEmptyFactRetired")).toBe(false);
        await db.close();
    });

    test("empty fact record removal fails if the approved table becomes non-empty before execution", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationEmptyFactRecheckProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-empty-fact-recheck-product-name" })],
        }, { uuid: "migration-empty-fact-recheck-product" });
        const EmptyFactV1 = new Entity({
            name: "MigrationEmptyFactRecheckRetired",
            properties: [new Property({ name: "note", type: "string" }, { uuid: "migration-empty-fact-recheck-note" })],
        }, { uuid: "migration-empty-fact-recheck-retired" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, EmptyFactV1], relations: [] }).setup(true);

        const ProductV2 = new Entity({
            name: "MigrationEmptyFactRecheckProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-empty-fact-recheck-product-name" })],
        }, { uuid: "migration-empty-fact-recheck-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const originalApplyMigrationSchema = (systemV2 as any).applyMigrationSchema.bind(systemV2);
        (systemV2 as any).applyMigrationSchema = async (...args: any[]) => {
            await originalApplyMigrationSchema(...args);
            await systemV1.storage.create("MigrationEmptyFactRecheckRetired", { note: "late write" });
        };

        await expect(controllerV2.migrate({ approvedDiff })).rejects.toThrow(/Empty fact record removal count mismatch/);
        const tables = await (systemV1.storage as any).getExistingTables();
        expect(tables.has("MigrationEmptyFactRecheckRetired")).toBe(true);
        await db.close();
    });

    test("empty fact records on shared physical tables remain blocked", async () => {
        const db = new PGLiteDB();
        const UserV1 = new Entity({
            name: "MigrationSharedTableUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-shared-table-user-name" })],
        }, { uuid: "migration-shared-table-user" });
        const ProfileV1 = new Entity({
            name: "MigrationSharedTableProfile",
            properties: [new Property({ name: "level", type: "number" }, { uuid: "migration-shared-table-profile-level" })],
        }, { uuid: "migration-shared-table-profile" });
        const ProfileOwnerV1 = new Relation({
            source: UserV1,
            sourceProperty: "profile",
            target: ProfileV1,
            targetProperty: "owner",
            name: "MigrationSharedTableProfileOwner",
            type: "1:1",
            isTargetReliance: true,
        }, { uuid: "migration-shared-table-profile-owner" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, ProfileV1], relations: [ProfileOwnerV1] }).setup(true);

        const manifest = await readMigrationManifest(new Controller({ system: systemV1, entities: [UserV1, ProfileV1], relations: [ProfileOwnerV1] }));
        const relationRecord = manifest!.storage.records.find(record => record.recordName === "MigrationSharedTableProfileOwner")!;
        const sharedRecord = manifest!.storage.records.find(record => record.recordName !== relationRecord.recordName && record.tableName === relationRecord.tableName);
        expect(sharedRecord).toBeTruthy();

        const UserV2 = new Entity({
            name: "MigrationSharedTableUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-shared-table-user-name" })],
        }, { uuid: "migration-shared-table-user" });
        const ProfileV2 = new Entity({
            name: "MigrationSharedTableProfile",
            properties: [new Property({ name: "level", type: "number" }, { uuid: "migration-shared-table-profile-level" })],
        }, { uuid: "migration-shared-table-profile" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, ProfileV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.requiredDecisions.some(item => item.kind === "empty-fact-record-removal")).toBe(false);
        expect(diff.safety.blockingChanges).toEqual(expect.arrayContaining([
            expect.objectContaining({ logicalPath: "MigrationSharedTableProfileOwner", reason: "fact record was removed from the new schema" }),
        ]));
        await db.close();
    });

    test("non-empty removed fact records remain destructive blocking changes", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationNonEmptyFactProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-non-empty-fact-product-name" })],
        }, { uuid: "migration-non-empty-fact-product" });
        const RetiredFactV1 = new Entity({
            name: "MigrationNonEmptyFactRetired",
            properties: [new Property({ name: "note", type: "string" }, { uuid: "migration-non-empty-fact-retired-note" })],
        }, { uuid: "migration-non-empty-fact-retired" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1, RetiredFactV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationNonEmptyFactRetired", { note: "keep" });

        const ProductV2 = new Entity({
            name: "MigrationNonEmptyFactProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-non-empty-fact-product-name" })],
        }, { uuid: "migration-non-empty-fact-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.requiredDecisions.some(item => item.kind === "empty-fact-record-removal")).toBe(false);
        expect(diff.safety.blockingChanges).toEqual(expect.arrayContaining([
            expect.objectContaining({ logicalPath: "MigrationNonEmptyFactRetired", reason: "fact record was removed from the new schema" }),
        ]));
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/fact record was removed from the new schema/);
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

    test("dry-run explicitly blocks removed fact entities", async () => {
        const db = new PGLiteDB();
        const Kept = new Entity({
            name: "MigrationEntityDeleteKept",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-entity-delete-kept-name" })],
        }, { uuid: "migration-entity-delete-kept" });
        const Throwaway = new Entity({
            name: "MigrationEntityDeleteThrowaway",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-entity-delete-throwaway-name" })],
        }, { uuid: "migration-entity-delete-throwaway" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [Kept, Throwaway], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationEntityDeleteThrowaway", { name: "not empty" });

        const KeptV2 = new Entity({
            name: "MigrationEntityDeleteKept",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-entity-delete-kept-name" })],
        }, { uuid: "migration-entity-delete-kept" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [KeptV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/unsupported-destructive-schema-change: MigrationEntityDeleteThrowaway/);
        expect(plan.blockingChanges.join("\n")).toMatch(/fact record was removed/);
        await db.close();
    });

    test("dry-run reports computed property deletion physical cleanup as unsupported", async () => {
        const db = new PGLiteDB();
        const nameCode = new Custom({
            name: "MigrationComputedDeleteNameCode",
            dataDeps: { current: { type: "property", attributeQuery: ["name"] } },
            compute: async (_deps: any, record: any) => record.name.toUpperCase(),
        }, { uuid: "migration-computed-delete-name-code-computation" });
        const ProbeV1 = new Entity({
            name: "MigrationComputedDeleteProbe",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-computed-delete-name" }),
                new Property({ name: "nameCode", type: "string", computation: nameCode }, { uuid: "migration-computed-delete-name-code" }),
            ],
        }, { uuid: "migration-computed-delete-probe" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProbeV1], relations: [] }).setup(true);

        const ProbeV2 = new Entity({
            name: "MigrationComputedDeleteProbe",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-computed-delete-name" }),
            ],
        }, { uuid: "migration-computed-delete-probe" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProbeV2], relations: [] });
        const plan = await dryRunWithApproval(controllerV2);

        expect(plan.blockingChanges.join("\n")).toMatch(/MigrationComputedDeleteProbe\.nameCode/);
        expect(plan.blockingChanges.join("\n")).toMatch(/computed attribute physical cleanup is not supported/);
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

    test("fact property takeover overwrites old values and recomputes downstream even when upstream value is unchanged", async () => {
        const db = new PGLiteDB();
        const ItemV1 = new Entity({
            name: "MigrationPropertyTakeoverItem",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-takeover-base" }),
                new Property({ name: "a", type: "number" }, { uuid: "migration-property-takeover-a" }),
                new Property({ name: "b", type: "number" }, { uuid: "migration-property-takeover-b" }),
            ],
        }, { uuid: "migration-property-takeover-item" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ItemV1], relations: [] }).setup(true);
        const item = await systemV1.storage.create("MigrationPropertyTakeoverItem", { base: 3, a: 6, b: 0 });

        const itemA = new Custom({
            name: "MigrationPropertyTakeoverA",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async (_deps: any, record: any) => record.base * 2,
        }, { uuid: "migration-property-takeover-a-computation" });
        const itemB = new Custom({
            name: "MigrationPropertyTakeoverB",
            dataDeps: { current: { type: "property", attributeQuery: ["a"] } },
            compute: async (_deps: any, record: any) => record.a + 1,
        }, { uuid: "migration-property-takeover-b-computation" });
        const ItemV2 = new Entity({
            name: "MigrationPropertyTakeoverItem",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-takeover-base" }),
                new Property({ name: "a", type: "number", computation: itemA }, { uuid: "migration-property-takeover-a" }),
                new Property({ name: "b", type: "number", computation: itemB }, { uuid: "migration-property-takeover-b" }),
            ],
        }, { uuid: "migration-property-takeover-item" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ItemV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions.some(requirement => requirement.kind === "computation-takeover" && requirement.dataContext === "property:MigrationPropertyTakeoverItem.a")).toBe(true);
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toContain("property:MigrationPropertyTakeoverItem.b");
        const migrated = await systemV2.storage.findOne("MigrationPropertyTakeoverItem", MatchExp.atom({ key: "id", value: ["=", item.id] }), undefined, ["*"]);
        expect(migrated.a).toBe(6);
        expect(migrated.b).toBe(7);
        const logs = await db.query<{ approvedDiffSummary: string }>(`SELECT "approvedDiffSummary" FROM "__interaqt_migration_log" ORDER BY "updatedAt" DESC LIMIT 1`, []);
        expect(JSON.parse(logs[0].approvedDiffSummary).computationTakeovers).toEqual(expect.arrayContaining([
            expect.objectContaining({
                dataContext: "property:MigrationPropertyTakeoverItem.a",
                targetType: "property",
                expectedExistingCount: 1,
                expectedHostCount: 1,
            }),
        ]));
        await db.close();
    });

    test("property takeover fails when approved counts no longer match execution state", async () => {
        const db = new PGLiteDB();
        const ItemV1 = new Entity({
            name: "MigrationPropertyTakeoverCountItem",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-takeover-count-base" }),
                new Property({ name: "computed", type: "number" }, { uuid: "migration-property-takeover-count-computed" }),
            ],
        }, { uuid: "migration-property-takeover-count-item" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ItemV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationPropertyTakeoverCountItem", { base: 1, computed: 1 });

        const computed = new Custom({
            name: "MigrationPropertyTakeoverCountComputed",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async (_deps: any, record: any) => record.base,
        }, { uuid: "migration-property-takeover-count-computation" });
        const ItemV2 = new Entity({
            name: "MigrationPropertyTakeoverCountItem",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-takeover-count-base" }),
                new Property({ name: "computed", type: "number", computation: computed }, { uuid: "migration-property-takeover-count-computed" }),
            ],
        }, { uuid: "migration-property-takeover-count-item" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ItemV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        await systemV1.storage.create("MigrationPropertyTakeoverCountItem", { base: 2, computed: 2 });

        await expect(controllerV2.migrate({ approvedDiff })).rejects.toThrow(/Computation takeover count mismatch|host count mismatch/);
        await db.close();
    });

    test("property takeover recomputes host records even when old fact value is missing", async () => {
        const db = new PGLiteDB();
        const ItemV1 = new Entity({
            name: "MigrationPropertyTakeoverMissingValue",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-takeover-missing-base" }),
                new Property({ name: "computed", type: "number" }, { uuid: "migration-property-takeover-missing-computed" }),
            ],
        }, { uuid: "migration-property-takeover-missing-item" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ItemV1], relations: [] }).setup(true);
        const first = await systemV1.storage.create("MigrationPropertyTakeoverMissingValue", { base: 1, computed: 10 });
        const second = await systemV1.storage.create("MigrationPropertyTakeoverMissingValue", { base: 2 });

        const computed = new Custom({
            name: "MigrationPropertyTakeoverMissingComputed",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async (_deps: any, record: any) => record.base * 10,
        }, { uuid: "migration-property-takeover-missing-computation" });
        const ItemV2 = new Entity({
            name: "MigrationPropertyTakeoverMissingValue",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-property-takeover-missing-base" }),
                new Property({ name: "computed", type: "number", computation: computed }, { uuid: "migration-property-takeover-missing-computed" }),
            ],
        }, { uuid: "migration-property-takeover-missing-item" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ItemV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: "computation-takeover",
                dataContext: "property:MigrationPropertyTakeoverMissingValue.computed",
                expectedExistingCount: 1,
                expectedHostCount: 2,
            }),
        ]));

        await migrateWithApproval(controllerV2);
        const migrated = await systemV2.storage.find("MigrationPropertyTakeoverMissingValue", undefined, undefined, ["id", "computed"]);
        const valuesById = new Map(migrated.map(item => [item.id, item.computed]));
        expect(valuesById.get(first.id)).toBe(10);
        expect(valuesById.get(second.id)).toBe(20);
        await db.close();
    });

    test("property takeover converts skip to null only for nullable properties", async () => {
        const db = new PGLiteDB();
        const NullableV1 = new Entity({
            name: "MigrationTakeoverSkipNullable",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-takeover-skip-nullable-base" }),
                new Property({ name: "value", type: "number" }, { uuid: "migration-takeover-skip-nullable-value" }),
            ],
        }, { uuid: "migration-takeover-skip-nullable" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [NullableV1], relations: [] }).setup(true);
        const record = await systemV1.storage.create("MigrationTakeoverSkipNullable", { base: 1, value: 10 });

        const skipValue = new Custom({
            name: "MigrationTakeoverSkipNullableValue",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async () => ComputationResult.skip(),
        }, { uuid: "migration-takeover-skip-nullable-computation" });
        const NullableV2 = new Entity({
            name: "MigrationTakeoverSkipNullable",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-takeover-skip-nullable-base" }),
                new Property({ name: "value", type: "number", computation: skipValue }, { uuid: "migration-takeover-skip-nullable-value" }),
            ],
        }, { uuid: "migration-takeover-skip-nullable" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [NullableV2], relations: [] });
        await migrateWithApproval(controllerV2);

        const migrated = await systemV2.storage.findOne("MigrationTakeoverSkipNullable", MatchExp.atom({ key: "id", value: ["=", record.id] }), undefined, ["*"]);
        expect(migrated.value ?? null).toBeNull();
        await db.close();
    });

    test("property takeover compute cannot read the old target value from the record input", async () => {
        const db = new PGLiteDB();
        const ItemV1 = new Entity({
            name: "MigrationTakeoverInputBoundary",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-takeover-input-boundary-base" }),
                new Property({ name: "value", type: "number" }, { uuid: "migration-takeover-input-boundary-value" }),
            ],
        }, { uuid: "migration-takeover-input-boundary" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ItemV1], relations: [] }).setup(true);
        const record = await systemV1.storage.create("MigrationTakeoverInputBoundary", { base: 1, value: 10 });

        const controlledValue = new Custom({
            name: "MigrationTakeoverInputBoundaryValue",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async (_deps: any, computeRecord: any) => computeRecord.value ?? 99,
        }, { uuid: "migration-takeover-input-boundary-computation" });
        const ItemV2 = new Entity({
            name: "MigrationTakeoverInputBoundary",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-takeover-input-boundary-base" }),
                new Property({ name: "value", type: "number", computation: controlledValue }, { uuid: "migration-takeover-input-boundary-value" }),
            ],
        }, { uuid: "migration-takeover-input-boundary" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ItemV2], relations: [] });
        await migrateWithApproval(controllerV2);

        const migrated = await systemV2.storage.findOne("MigrationTakeoverInputBoundary", MatchExp.atom({ key: "id", value: ["=", record.id] }), undefined, ["*"]);
        expect(migrated.value).toBe(99);
        await db.close();
    });

    test("property takeover fails fast when skip would preserve a non-null old value", async () => {
        const db = new PGLiteDB();
        const RequiredV1 = new Entity({
            name: "MigrationTakeoverSkipRequired",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-takeover-skip-required-base" }),
                new Property({ name: "value", type: "number" }, { uuid: "migration-takeover-skip-required-value" }),
            ],
        }, { uuid: "migration-takeover-skip-required" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [RequiredV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationTakeoverSkipRequired", { base: 1, value: 10 });

        const skipValue = new Custom({
            name: "MigrationTakeoverSkipRequiredValue",
            dataDeps: { current: { type: "property", attributeQuery: ["base"] } },
            compute: async () => ComputationResult.skip(),
        }, { uuid: "migration-takeover-skip-required-computation" });
        const RequiredV2 = new Entity({
            name: "MigrationTakeoverSkipRequired",
            properties: [
                new Property({ name: "base", type: "number" }, { uuid: "migration-takeover-skip-required-base" }),
                new Property({ name: "value", type: "number", computation: skipValue }, { uuid: "migration-takeover-skip-required-value" }),
            ],
            constraints: [
                new NonNullConstraint({ name: "takeover_skip_value_required", property: "value" }, { uuid: "migration-takeover-skip-required-constraint" }),
            ],
        }, { uuid: "migration-takeover-skip-required" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [RequiredV2], relations: [] });

        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/cannot keep old value for non-null property/);
        await db.close();
    });

    test("fact property takeover matrix covers built-in property computations", async () => {
        const db = new PGLiteDB();
        const TaskV1 = new Entity({
            name: "MigrationTakeoverMatrixTask",
            properties: [
                new Property({ name: "score", type: "number" }, { uuid: "migration-takeover-matrix-task-score" }),
                new Property({ name: "weight", type: "number" }, { uuid: "migration-takeover-matrix-task-weight" }),
                new Property({ name: "priority", type: "string" }, { uuid: "migration-takeover-matrix-task-priority" }),
                new Property({ name: "done", type: "boolean" }, { uuid: "migration-takeover-matrix-task-done" }),
            ],
        }, { uuid: "migration-takeover-matrix-task" });
        const UserV1 = new Entity({
            name: "MigrationTakeoverMatrixUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-takeover-matrix-user-name" }),
                new Property({ name: "taskCount", type: "number" }, { uuid: "migration-takeover-matrix-user-count" }),
                new Property({ name: "scoreSum", type: "number" }, { uuid: "migration-takeover-matrix-user-sum" }),
                new Property({ name: "avgScore", type: "number" }, { uuid: "migration-takeover-matrix-user-avg" }),
                new Property({ name: "weightedScore", type: "number" }, { uuid: "migration-takeover-matrix-user-weighted" }),
                new Property({ name: "hasHighPriority", type: "boolean" }, { uuid: "migration-takeover-matrix-user-any" }),
                new Property({ name: "allDone", type: "boolean" }, { uuid: "migration-takeover-matrix-user-every" }),
                new Property({ name: "clockValue", type: "number" }, { uuid: "migration-takeover-matrix-user-realtime" }),
            ],
        }, { uuid: "migration-takeover-matrix-user" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationTakeoverMatrixOwnsTask",
            type: "1:n",
        }, { uuid: "migration-takeover-matrix-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationTakeoverMatrixUser", {
            name: "Alice",
            taskCount: 999,
            scoreSum: 999,
            avgScore: 999,
            weightedScore: 999,
            hasHighPriority: false,
            allDone: false,
            clockValue: 999,
        });
        const task1 = await systemV1.storage.create("MigrationTakeoverMatrixTask", { score: 10, weight: 1, priority: "low", done: true });
        const task2 = await systemV1.storage.create("MigrationTakeoverMatrixTask", { score: 20, weight: 2, priority: "high", done: true });
        await systemV1.storage.addRelationByNameById("MigrationTakeoverMatrixOwnsTask", user.id, task1.id);
        await systemV1.storage.addRelationByNameById("MigrationTakeoverMatrixOwnsTask", user.id, task2.id);

        const TaskV2 = new Entity({
            name: "MigrationTakeoverMatrixTask",
            properties: [
                new Property({ name: "score", type: "number" }, { uuid: "migration-takeover-matrix-task-score" }),
                new Property({ name: "weight", type: "number" }, { uuid: "migration-takeover-matrix-task-weight" }),
                new Property({ name: "priority", type: "string" }, { uuid: "migration-takeover-matrix-task-priority" }),
                new Property({ name: "done", type: "boolean" }, { uuid: "migration-takeover-matrix-task-done" }),
            ],
        }, { uuid: "migration-takeover-matrix-task" });
        const UserV2 = new Entity({
            name: "MigrationTakeoverMatrixUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-takeover-matrix-user-name" }),
                new Property({
                    name: "taskCount",
                    type: "number",
                    computation: new Count({ property: "tasks" }, { uuid: "migration-takeover-matrix-count-computation" }),
                }, { uuid: "migration-takeover-matrix-user-count" }),
                new Property({
                    name: "scoreSum",
                    type: "number",
                    computation: new Summation({ property: "tasks", attributeQuery: ["score"] }, { uuid: "migration-takeover-matrix-sum-computation" }),
                }, { uuid: "migration-takeover-matrix-user-sum" }),
                new Property({
                    name: "avgScore",
                    type: "number",
                    computation: new Average({ property: "tasks", attributeQuery: ["score"] }, { uuid: "migration-takeover-matrix-avg-computation" }),
                }, { uuid: "migration-takeover-matrix-user-avg" }),
                new Property({
                    name: "weightedScore",
                    type: "number",
                    computation: new WeightedSummation({
                        property: "tasks",
                        attributeQuery: ["score", "weight"],
                        callback: (task: any) => ({ value: task.score, weight: task.weight }),
                    }, { uuid: "migration-takeover-matrix-weighted-computation" }),
                }, { uuid: "migration-takeover-matrix-user-weighted" }),
                new Property({
                    name: "hasHighPriority",
                    type: "boolean",
                    computation: new Any({
                        property: "tasks",
                        attributeQuery: ["priority"],
                        callback: (task: any) => task.priority === "high",
                    }, { uuid: "migration-takeover-matrix-any-computation" }),
                }, { uuid: "migration-takeover-matrix-user-any" }),
                new Property({
                    name: "allDone",
                    type: "boolean",
                    computation: new Every({
                        property: "tasks",
                        attributeQuery: ["done"],
                        callback: (task: any) => task.done === true,
                        notEmpty: true,
                    }, { uuid: "migration-takeover-matrix-every-computation" }),
                }, { uuid: "migration-takeover-matrix-user-every" }),
                new Property({
                    name: "clockValue",
                    type: "number",
                    computation: new RealTime({
                        attributeQuery: ["name"],
                        callback: async (now: Expression) => now.subtract(now).add(2),
                        nextRecomputeTime: () => 1000,
                    }, { uuid: "migration-takeover-matrix-realtime-computation" }),
                }, { uuid: "migration-takeover-matrix-user-realtime" }),
            ],
        }, { uuid: "migration-takeover-matrix-user" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationTakeoverMatrixOwnsTask",
            type: "1:n",
        }, { uuid: "migration-takeover-matrix-owns-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2] });
        const diff = await controllerV2.generateMigrationDiff();
        const takeoverContexts = diff.requiredDecisions
            .filter(requirement => requirement.kind === "computation-takeover")
            .map(requirement => requirement.dataContext);
        expect(takeoverContexts).toEqual(expect.arrayContaining([
            "property:MigrationTakeoverMatrixUser.taskCount",
            "property:MigrationTakeoverMatrixUser.scoreSum",
            "property:MigrationTakeoverMatrixUser.avgScore",
            "property:MigrationTakeoverMatrixUser.weightedScore",
            "property:MigrationTakeoverMatrixUser.hasHighPriority",
            "property:MigrationTakeoverMatrixUser.allDone",
            "property:MigrationTakeoverMatrixUser.clockValue",
        ]));

        const plan = await migrateWithApproval(controllerV2);
        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toEqual(expect.arrayContaining(takeoverContexts));
        const migrated = await systemV2.storage.findOne("MigrationTakeoverMatrixUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
        expect(migrated.taskCount).toBe(2);
        expect(migrated.scoreSum).toBe(30);
        expect(migrated.avgScore).toBe(15);
        expect(migrated.weightedScore).toBe(50);
        expect(migrated.hasHighPriority).toBe(true);
        expect(migrated.allDone).toBe(true);
        expect(migrated.clockValue).toBe(2);
        await db.close();
    });

    test("migrates added global built-in aggregate computations", async () => {
        const cases = [
            {
                key: "Average",
                type: "number",
                createComputation: (Source: Entity) => new Average({
                    record: Source,
                    attributeQuery: ["value"],
                }, { uuid: "migration-builtin-global-average-computation" }),
                expected: 15,
            },
            {
                key: "WeightedSummation",
                type: "number",
                createComputation: (Source: Entity) => new WeightedSummation({
                    record: Source,
                    attributeQuery: ["value"],
                    callback: (item: any) => ({ weight: 2, value: item.value }),
                }, { uuid: "migration-builtin-global-weighted-computation" }),
                expected: 60,
            },
            {
                key: "Any",
                type: "boolean",
                createComputation: (Source: Entity) => new Any({
                    record: Source,
                    attributeQuery: ["value"],
                    callback: (item: any) => item.value > 15,
                }, { uuid: "migration-builtin-global-any-computation" }),
                expected: true,
            },
            {
                key: "Every",
                type: "boolean",
                createComputation: (Source: Entity) => new Every({
                    record: Source,
                    attributeQuery: ["value"],
                    callback: (item: any) => item.value >= 10,
                    notEmpty: true,
                }, { uuid: "migration-builtin-global-every-computation" }),
                expected: true,
            },
        ];

        for (const item of cases) {
            const db = new PGLiteDB();
            const SourceV1 = new Entity({
                name: `MigrationBuiltinGlobal${item.key}Source`,
                properties: [
                    new Property({ name: "value", type: "number" }, { uuid: `migration-builtin-global-${item.key}-value` }),
                ],
            }, { uuid: `migration-builtin-global-${item.key}-source` });
            const systemV1 = new MonoSystem(db);
            systemV1.conceptClass = KlassByName;
            await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);
            await systemV1.storage.create(`MigrationBuiltinGlobal${item.key}Source`, { value: 10 });
            await systemV1.storage.create(`MigrationBuiltinGlobal${item.key}Source`, { value: 20 });

            const SourceV2 = new Entity({
                name: `MigrationBuiltinGlobal${item.key}Source`,
                properties: [
                    new Property({ name: "value", type: "number" }, { uuid: `migration-builtin-global-${item.key}-value` }),
                ],
            }, { uuid: `migration-builtin-global-${item.key}-source` });
            const dictName = `migrationBuiltinGlobal${item.key}Value`;
            const dict = new Dictionary({
                name: dictName,
                type: item.type,
                collection: false,
                computation: item.createComputation(SourceV2),
            }, { uuid: `migration-builtin-global-${item.key}-dict` });
            const systemV2 = new MonoSystem(db);
            systemV2.conceptClass = KlassByName;
            const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [dict] });
            const plan = await migrateWithApproval(controllerV2);

            expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toContain(`global:${dictName}`);
            expect(await systemV2.storage.dict.get(dictName)).toBe(item.expected);
            await db.close();
        }
    });

    // 该用例顺序跑 5 个内置聚合的完整 setup+migrate 流程，耗时贴近默认 5s 超时（慢机器上会环境性超时），显式放宽。
    test("approved changed and unchanged decisions control built-in global aggregate rebuilds", { timeout: 30000 }, async () => {
        const cases = [
            {
                key: "Average",
                type: "number",
                createInitial: (Source: Entity) => new Average({ record: Source, attributeQuery: ["value"] }, { uuid: "migration-builtin-review-average-computation" }),
                createChanged: (Source: Entity) => new Average({ record: Source, attributeQuery: ["bonus"] }, { uuid: "migration-builtin-review-average-computation" }),
                initial: 15,
                changed: 150,
            },
            {
                key: "WeightedSummation",
                type: "number",
                createInitial: (Source: Entity) => new WeightedSummation({
                    record: Source,
                    attributeQuery: ["value", "bonus"],
                    callback: (item: any) => ({ weight: 1, value: item.value }),
                }, { uuid: "migration-builtin-review-weighted-computation" }),
                createChanged: (Source: Entity) => new WeightedSummation({
                    record: Source,
                    attributeQuery: ["value", "bonus"],
                    callback: (item: any) => ({ weight: 2, value: item.bonus }),
                }, { uuid: "migration-builtin-review-weighted-computation" }),
                initial: 30,
                changed: 600,
            },
            {
                key: "Any",
                type: "boolean",
                createInitial: (Source: Entity) => new Any({
                    record: Source,
                    attributeQuery: ["value", "bonus"],
                    callback: (item: any) => item.value > 15,
                }, { uuid: "migration-builtin-review-any-computation" }),
                createChanged: (Source: Entity) => new Any({
                    record: Source,
                    attributeQuery: ["value", "bonus"],
                    callback: (item: any) => item.bonus > 250,
                }, { uuid: "migration-builtin-review-any-computation" }),
                initial: true,
                changed: false,
            },
            {
                key: "Every",
                type: "boolean",
                createInitial: (Source: Entity) => new Every({
                    record: Source,
                    attributeQuery: ["value", "bonus"],
                    callback: (item: any) => item.value >= 10,
                    notEmpty: true,
                }, { uuid: "migration-builtin-review-every-computation" }),
                createChanged: (Source: Entity) => new Every({
                    record: Source,
                    attributeQuery: ["value", "bonus"],
                    callback: (item: any) => item.bonus > 150,
                    notEmpty: true,
                }, { uuid: "migration-builtin-review-every-computation" }),
                initial: true,
                changed: false,
            },
        ];

        for (const item of cases) {
            for (const decision of ["changed", "unchanged"] as const) {
                const db = new PGLiteDB();
                const SourceV1 = new Entity({
                    name: `MigrationBuiltinReview${item.key}Source${decision}`,
                    properties: [
                        new Property({ name: "value", type: "number" }, { uuid: `migration-builtin-review-${item.key}-${decision}-value` }),
                        new Property({ name: "bonus", type: "number" }, { uuid: `migration-builtin-review-${item.key}-${decision}-bonus` }),
                    ],
                }, { uuid: `migration-builtin-review-${item.key}-${decision}-source` });
                const dictName = `migrationBuiltinReview${item.key}Value${decision}`;
                const dictV1 = new Dictionary({
                    name: dictName,
                    type: item.type,
                    collection: false,
                    computation: item.createInitial(SourceV1),
                }, { uuid: `migration-builtin-review-${item.key}-${decision}-dict` });
                const systemV1 = new MonoSystem(db);
                systemV1.conceptClass = KlassByName;
                await new Controller({ system: systemV1, entities: [SourceV1], relations: [], dict: [dictV1] }).setup(true);
                await systemV1.storage.create(`MigrationBuiltinReview${item.key}Source${decision}`, { value: 10, bonus: 100 });
                await systemV1.storage.create(`MigrationBuiltinReview${item.key}Source${decision}`, { value: 20, bonus: 200 });
                expect(await systemV1.storage.dict.get(dictName)).toBe(item.initial);

                const SourceV2 = new Entity({
                    name: `MigrationBuiltinReview${item.key}Source${decision}`,
                    properties: [
                        new Property({ name: "value", type: "number" }, { uuid: `migration-builtin-review-${item.key}-${decision}-value` }),
                        new Property({ name: "bonus", type: "number" }, { uuid: `migration-builtin-review-${item.key}-${decision}-bonus` }),
                    ],
                }, { uuid: `migration-builtin-review-${item.key}-${decision}-source` });
                const dictV2 = new Dictionary({
                    name: dictName,
                    type: item.type,
                    collection: false,
                    computation: item.createChanged(SourceV2),
                }, { uuid: `migration-builtin-review-${item.key}-${decision}-dict` });
                const systemV2 = new MonoSystem(db);
                systemV2.conceptClass = KlassByName;
                const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [dictV2] });
                const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
                const reviewedDiff = {
                    ...approvedDiff,
                    decisions: approvedDiff.decisions.map(itemDecision => itemDecision.kind === "computation" && itemDecision.dataContext === `global:${dictName}`
                        ? { ...itemDecision, decision }
                        : itemDecision),
                };
                const plan = await migrateWithApproval(controllerV2, { approvedDiff: reviewedDiff });

                if (decision === "changed") {
                    expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toContain(`global:${dictName}`);
                    expect(await systemV2.storage.dict.get(dictName)).toBe(item.changed);
                } else {
                    expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).not.toContain(`global:${dictName}`);
                    expect(await systemV2.storage.dict.get(dictName)).toBe(item.initial);
                }
                await db.close();
            }
        }
    });

    test("migrates added relation property aggregate built-ins", async () => {
        const db = new PGLiteDB();
        const TaskV1 = new Entity({
            name: "MigrationBuiltinRelationTask",
            properties: [
                new Property({ name: "score", type: "number" }, { uuid: "migration-builtin-relation-task-score" }),
                new Property({ name: "weight", type: "number" }, { uuid: "migration-builtin-relation-task-weight" }),
                new Property({ name: "priority", type: "string" }, { uuid: "migration-builtin-relation-task-priority" }),
                new Property({ name: "done", type: "boolean" }, { uuid: "migration-builtin-relation-task-done" }),
            ],
        }, { uuid: "migration-builtin-relation-task" });
        const UserV1 = new Entity({
            name: "MigrationBuiltinRelationUser",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-builtin-relation-user-name" })],
        }, { uuid: "migration-builtin-relation-user" });
        const OwnsTaskV1 = new Relation({
            source: UserV1,
            sourceProperty: "tasks",
            target: TaskV1,
            targetProperty: "owner",
            name: "MigrationBuiltinRelationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-builtin-relation-owns-task" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [UserV1, TaskV1], relations: [OwnsTaskV1] }).setup(true);
        const user = await systemV1.storage.create("MigrationBuiltinRelationUser", { name: "Alice" });
        const task1 = await systemV1.storage.create("MigrationBuiltinRelationTask", { score: 10, weight: 1, priority: "low", done: true });
        const task2 = await systemV1.storage.create("MigrationBuiltinRelationTask", { score: 20, weight: 2, priority: "high", done: true });
        await systemV1.storage.addRelationByNameById("MigrationBuiltinRelationOwnsTask", user.id, task1.id);
        await systemV1.storage.addRelationByNameById("MigrationBuiltinRelationOwnsTask", user.id, task2.id);

        const TaskV2 = new Entity({
            name: "MigrationBuiltinRelationTask",
            properties: [
                new Property({ name: "score", type: "number" }, { uuid: "migration-builtin-relation-task-score" }),
                new Property({ name: "weight", type: "number" }, { uuid: "migration-builtin-relation-task-weight" }),
                new Property({ name: "priority", type: "string" }, { uuid: "migration-builtin-relation-task-priority" }),
                new Property({ name: "done", type: "boolean" }, { uuid: "migration-builtin-relation-task-done" }),
            ],
        }, { uuid: "migration-builtin-relation-task" });
        const avgScore = new Average({
            property: "tasks",
            attributeQuery: ["score"],
        }, { uuid: "migration-builtin-relation-average-computation" });
        const weightedScore = new WeightedSummation({
            property: "tasks",
            attributeQuery: ["score", "weight"],
            callback: (task: any) => ({ value: task.score, weight: task.weight }),
        }, { uuid: "migration-builtin-relation-weighted-computation" });
        const hasHighPriority = new Any({
            property: "tasks",
            attributeQuery: ["priority"],
            callback: (task: any) => task.priority === "high",
        }, { uuid: "migration-builtin-relation-any-computation" });
        const allDone = new Every({
            property: "tasks",
            attributeQuery: ["done"],
            callback: (task: any) => task.done === true,
            notEmpty: true,
        }, { uuid: "migration-builtin-relation-every-computation" });
        const UserV2 = new Entity({
            name: "MigrationBuiltinRelationUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-builtin-relation-user-name" }),
                new Property({ name: "avgScore", type: "number", computation: avgScore }, { uuid: "migration-builtin-relation-user-avg" }),
                new Property({ name: "weightedScore", type: "number", computation: weightedScore }, { uuid: "migration-builtin-relation-user-weighted" }),
                new Property({ name: "hasHighPriority", type: "boolean", computation: hasHighPriority }, { uuid: "migration-builtin-relation-user-any" }),
                new Property({ name: "allDone", type: "boolean", computation: allDone }, { uuid: "migration-builtin-relation-user-every" }),
            ],
        }, { uuid: "migration-builtin-relation-user" });
        const OwnsTaskV2 = new Relation({
            source: UserV2,
            sourceProperty: "tasks",
            target: TaskV2,
            targetProperty: "owner",
            name: "MigrationBuiltinRelationOwnsTask",
            type: "1:n",
        }, { uuid: "migration-builtin-relation-owns-task" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [UserV2, TaskV2], relations: [OwnsTaskV2] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toEqual([
            "property:MigrationBuiltinRelationUser.avgScore",
            "property:MigrationBuiltinRelationUser.weightedScore",
            "property:MigrationBuiltinRelationUser.hasHighPriority",
            "property:MigrationBuiltinRelationUser.allDone",
        ]);
        const migrated = await systemV2.storage.findOne("MigrationBuiltinRelationUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
        expect(migrated.avgScore).toBe(15);
        expect(migrated.weightedScore).toBe(50);
        expect(migrated.hasHighPriority).toBe(true);
        expect(migrated.allDone).toBe(true);
        await db.close();
    });

    test("migrates added RealTime global and property computations", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationRealTimeSource",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-realtime-source-name" })],
        }, { uuid: "migration-realtime-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);
        const source = await systemV1.storage.create("MigrationRealTimeSource", { name: "A" });

        const globalClock = new RealTime({
            callback: async (now: Expression) => now.subtract(now).add(1),
            nextRecomputeTime: () => 1000,
        }, { uuid: "migration-realtime-global-computation" });
        const clockDict = new Dictionary({
            name: "migrationRealTimeGlobal",
            type: "number",
            collection: false,
            computation: globalClock,
        }, { uuid: "migration-realtime-global-dict" });
        const propertyClock = new RealTime({
            attributeQuery: ["name"],
            callback: async (now: Expression) => now.subtract(now).add(2),
            nextRecomputeTime: () => 1000,
        }, { uuid: "migration-realtime-property-computation" });
        const SourceV2 = new Entity({
            name: "MigrationRealTimeSource",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-realtime-source-name" }),
                new Property({ name: "clockValue", type: "number", computation: propertyClock }, { uuid: "migration-realtime-source-clock" }),
            ],
        }, { uuid: "migration-realtime-source" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [clockDict] });
        const plan = await migrateWithApproval(controllerV2);

        expect(plan.rebuildPlan.map(rebuild => rebuild.dataContext)).toEqual([
            "global:migrationRealTimeGlobal",
            "property:MigrationRealTimeSource.clockValue",
        ]);
        expect(await systemV2.storage.dict.get("migrationRealTimeGlobal")).toBe(1);
        const migrated = await systemV2.storage.findOne("MigrationRealTimeSource", MatchExp.atom({ key: "id", value: ["=", source.id] }), undefined, ["*"]);
        expect(migrated.clockValue).toBe(2);
        await db.close();
    });

    test("global StateMachine migration uses approved event rebuild handler", async () => {
        const db = new PGLiteDB();
        const SourceV1 = new Entity({
            name: "MigrationGlobalStateMachineSource",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-global-sm-source-title" })],
        }, { uuid: "migration-global-sm-source" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [SourceV1], relations: [] }).setup(true);

        const SourceV2 = new Entity({
            name: "MigrationGlobalStateMachineSource",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-global-sm-source-title" })],
        }, { uuid: "migration-global-sm-source" });
        const idle = new StateNode({ name: "idle" }, { uuid: "migration-global-sm-idle" });
        const active = new StateNode({ name: "active" }, { uuid: "migration-global-sm-active" });
        const machine = new StateMachine({
            states: [idle, active],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationGlobalStateMachineSource", type: "update" },
                    current: idle,
                    next: active,
                }, { uuid: "migration-global-sm-transfer" }),
            ],
            initialState: idle,
        }, { uuid: "migration-global-sm-computation" });
        const dict = new Dictionary({
            name: "migrationGlobalStateMachine",
            type: "string",
            collection: false,
            computation: machine,
        }, { uuid: "migration-global-sm-dict" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2], relations: [], dict: [dict] });
        await migrateWithApproval(controllerV2, {
            handlers: {
                eventRebuild: {
                    "global:migrationGlobalStateMachine": async () => "migrated",
                },
            },
        });

        expect(await systemV2.storage.dict.get("migrationGlobalStateMachine")).toBe("migrated");
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
            incrementalDataDeps: [],
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
            incrementalDataDeps: [],
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
                    computeTarget: (event: any) => ({ id: event.record.id }),
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

    test("StateMachine fact property takeover is blocked until state rebuild handlers exist", async () => {
        const db = new PGLiteDB();
        const TicketV1 = new Entity({
            name: "MigrationStateMachineTakeoverTicket",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-sm-takeover-title" }),
                new Property({ name: "status", type: "string" }, { uuid: "migration-sm-takeover-status" }),
            ],
        }, { uuid: "migration-sm-takeover-ticket" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [TicketV1], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationStateMachineTakeoverTicket", { title: "A", status: "legacy" });

        const open = new StateNode({ name: "open" }, { uuid: "migration-sm-takeover-open" });
        const closed = new StateNode({ name: "closed" }, { uuid: "migration-sm-takeover-closed" });
        const stateMachine = new StateMachine({
            states: [open, closed],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationStateMachineTakeoverTicket", type: "update" },
                    current: open,
                    next: closed,
                    computeTarget: (event: any) => ({ id: event.record.id }),
                }, { uuid: "migration-sm-takeover-transfer" }),
            ],
            initialState: open,
        }, { uuid: "migration-sm-takeover-machine" });
        const TicketV2 = new Entity({
            name: "MigrationStateMachineTakeoverTicket",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-sm-takeover-title" }),
                new Property({ name: "status", type: "string", computation: stateMachine }, { uuid: "migration-sm-takeover-status" }),
            ],
        }, { uuid: "migration-sm-takeover-ticket" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [TicketV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions.some(requirement => requirement.kind === "computation-takeover" && requirement.dataContext === "property:MigrationStateMachineTakeoverTicket.status")).toBe(true);

        await expect(migrateWithApproval(controllerV2, {
            handlers: {
                eventRebuild: {
                    "property:MigrationStateMachineTakeoverTicket.status": async () => "open",
                },
            },
        })).rejects.toThrow(/StateMachine computation takeover requires a state rebuild handler/);
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
                    computeTarget: (event: any) => ({ id: event.record.id }),
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
                    computeTarget: (event: any) => ({ id: event.record.id }),
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
                    computeTarget: (event: any) => ({ id: event.record.id }),
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

    test("unchanged StateMachine does not demand event rebuild handlers for unrelated migrations", async () => {
        const db = new PGLiteDB();
        const build = (withNote: boolean) => {
            const open = new StateNode({ name: "open" }, { uuid: "migration-sm-untouched-open" });
            const closed = new StateNode({ name: "closed" }, { uuid: "migration-sm-untouched-closed" });
            const lifecycle = new StateMachine({
                states: [open, closed],
                transfers: [
                    new StateTransfer({
                        trigger: { recordName: "MigrationSmUntouchedTicket", type: "update" },
                        current: open,
                        next: closed,
                        computeTarget: (event: any) => ({ id: event.record.id }),
                    }, { uuid: "migration-sm-untouched-transfer" }),
                ],
                initialState: open,
            }, { uuid: "migration-sm-untouched-lifecycle" });
            return new Entity({
                name: "MigrationSmUntouchedTicket",
                properties: [
                    new Property({ name: "title", type: "string" }, { uuid: "migration-sm-untouched-title" }),
                    new Property({ name: "status", type: "string", computation: lifecycle }, { uuid: "migration-sm-untouched-status" }),
                    ...(withNote ? [new Property({ name: "note", type: "string" }, { uuid: "migration-sm-untouched-note" })] : []),
                ],
            }, { uuid: "migration-sm-untouched-ticket" });
        };
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [build(false)], relations: [] }).setup(true);

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [build(true)], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions.some(requirement =>
            requirement.kind === "event-rebuild-handler" &&
            requirement.dataContext === "property:MigrationSmUntouchedTicket.status"
        )).toBe(false);

        // Adding an unrelated plain property must not demand runtime handlers
        // for the untouched StateMachine.
        const plan = await migrateWithApproval(controllerV2);
        expect(plan.rebuildPlan.map(item => item.dataContext)).not.toContain("property:MigrationSmUntouchedTicket.status");
        await db.close();
    });

    test("StateMachine without transfers generates and accepts an event rebuild handler decision", async () => {
        const db = new PGLiteDB();
        const ProbeV1 = new Entity({
            name: "MigrationProbeNoTransfer",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-probe-no-transfer-name" }),
            ],
        }, { uuid: "migration-probe-no-transfer" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProbeV1], relations: [] }).setup(true);
        const alpha = await systemV1.storage.create("MigrationProbeNoTransfer", { name: "Alpha" });
        const longer = await systemV1.storage.create("MigrationProbeNoTransfer", { name: "LongerName" });

        const draft = new StateNode({
            name: "current_lifecycle",
            computeValue() {
                return "draft";
            },
        }, { uuid: "migration-probe-no-transfer-draft" });
        const lifecycle = new StateMachine({
            states: [draft],
            initialState: draft,
            transfers: [],
        }, { uuid: "migration-probe-no-transfer-lifecycle-computation" });
        const ProbeV2 = new Entity({
            name: "MigrationProbeNoTransfer",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-probe-no-transfer-name" }),
                new Property({ name: "lifecycle", type: "string", computation: lifecycle }, { uuid: "migration-probe-no-transfer-lifecycle" }),
            ],
        }, { uuid: "migration-probe-no-transfer" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProbeV2], relations: [] });
        const diff = await controllerV2.generateMigrationDiff();

        expect(diff.requiredDecisions.some(requirement =>
            requirement.kind === "event-rebuild-handler" &&
            requirement.dataContext === "property:MigrationProbeNoTransfer.lifecycle"
        )).toBe(true);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            eventHandlers: {
                "property:MigrationProbeNoTransfer.lifecycle": "migrationProbeLifecycleDraft",
            },
        });
        await controllerV2.migrate({
            approvedDiff,
            handlers: {
                eventRebuild: {
                    migrationProbeLifecycleDraft: async () => "draft",
                },
            },
        });

        const migratedAlpha = await systemV2.storage.findOne("MigrationProbeNoTransfer", MatchExp.atom({ key: "id", value: ["=", alpha.id] }), undefined, ["*"]);
        const migratedLonger = await systemV2.storage.findOne("MigrationProbeNoTransfer", MatchExp.atom({ key: "id", value: ["=", longer.id] }), undefined, ["*"]);
        expect(migratedAlpha.lifecycle).toBe("draft");
        expect(migratedLonger.lifecycle).toBe("draft");
        await db.close();
    });

    test("StateMachine event rebuild decisions remain valid when regenerated expected diff omits the handler requirement", async () => {
        const db = new PGLiteDB();
        const ProbeV1 = new Entity({
            name: "MigrationProbe",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "migration-probe-title" })],
        }, { uuid: "migration-probe" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProbeV1], relations: [] }).setup(true);

        const open = new StateNode({ name: "open" }, { uuid: "migration-probe-open" });
        const closed = new StateNode({ name: "closed" }, { uuid: "migration-probe-closed" });
        const lifecycle = new StateMachine({
            states: [open, closed],
            transfers: [
                new StateTransfer({
                    trigger: { recordName: "MigrationProbe", type: "update" },
                    current: open,
                    next: closed,
                    computeTarget: (event: any) => ({ id: event.record.id }),
                }, { uuid: "migration-probe-transfer" }),
            ],
            initialState: open,
        }, { uuid: "migration-probe-lifecycle-computation" });
        const ProbeV2 = new Entity({
            name: "MigrationProbe",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-probe-title" }),
                new Property({ name: "lifecycle", type: "string", computation: lifecycle }, { uuid: "migration-probe-lifecycle" }),
            ],
        }, { uuid: "migration-probe" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProbeV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            eventHandlers: {
                "property:MigrationProbe.lifecycle": "probeLifecycleHandler",
            },
        });
        const generatedDiff = await controllerV2.generateMigrationDiff();
        const expectedDiffMissingEventRequirement = {
            ...generatedDiff,
            requiredDecisions: generatedDiff.requiredDecisions.filter(requirement =>
                !(requirement.kind === "event-rebuild-handler" && requirement.dataContext === "property:MigrationProbe.lifecycle")
            ),
        };
        const context = await (controllerV2 as any).prepareMigrationContext();

        expect(() => validateApprovedDiff(
            approvedDiff,
            context.previousManifest,
            context.nextManifest,
            { eventRebuild: { probeLifecycleHandler: async () => "open" } },
            expectedDiffMissingEventRequirement,
        )).not.toThrow();
        await db.close();
    });

    test("new plain property defaultValue is backfilled for existing rows", async () => {
        const db = new PGLiteDB();
        const build = (withStatus: boolean) => new Entity({
            name: "MigrationDefaultBackfillDoc",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-default-backfill-title" }),
                ...(withStatus ? [new Property({ name: "status", type: "string", defaultValue: () => "draft" }, { uuid: "migration-default-backfill-status" })] : []),
            ],
        }, { uuid: "migration-default-backfill-doc" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [build(false)], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationDefaultBackfillDoc", { title: "old" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [build(true)], relations: [] });
        const plan = await migrateWithApproval(controllerV2);
        expect(plan.factPropertyBackfills).toEqual([{ recordName: "MigrationDefaultBackfillDoc", propertyName: "status" }]);

        const docs = await systemV2.storage.find("MigrationDefaultBackfillDoc", undefined, undefined, ["title", "status"]);
        expect(docs.find(doc => doc.title === "old")?.status).toBe("draft");
        await db.close();
    });

    test("defaultValue backfill does not trigger StateMachine transitions on the same record", async () => {
        const db = new PGLiteDB();
        const build = (withNote: boolean) => {
            const open = new StateNode({ name: "open" }, { uuid: "migration-backfill-sm-open" });
            const closed = new StateNode({ name: "closed" }, { uuid: "migration-backfill-sm-closed" });
            const lifecycle = new StateMachine({
                states: [open, closed],
                transfers: [
                    new StateTransfer({
                        trigger: { recordName: "MigrationBackfillSmTicket", type: "update" },
                        current: open,
                        next: closed,
                        computeTarget: (event: any) => ({ id: event.record.id }),
                    }, { uuid: "migration-backfill-sm-transfer" }),
                ],
                initialState: open,
            }, { uuid: "migration-backfill-sm-lifecycle" });
            return new Entity({
                name: "MigrationBackfillSmTicket",
                properties: [
                    new Property({ name: "title", type: "string" }, { uuid: "migration-backfill-sm-title" }),
                    new Property({ name: "status", type: "string", computation: lifecycle }, { uuid: "migration-backfill-sm-status" }),
                    ...(withNote ? [new Property({ name: "note", type: "string", defaultValue: () => "n/a" }, { uuid: "migration-backfill-sm-note" })] : []),
                ],
            }, { uuid: "migration-backfill-sm-ticket" });
        };
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [build(false)], relations: [] });
        await controllerV1.setup(true);
        await systemV1.storage.create("MigrationBackfillSmTicket", { title: "t" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [build(true)], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const statusBefore = (await systemV1.storage.find("MigrationBackfillSmTicket", undefined, undefined, ["status"]))[0].status;
        const plan = await controllerV2.migrate({ approvedDiff });
        expect(plan.rebuildPlan).toEqual([]);
        expect(plan.factPropertyBackfills).toEqual([{ recordName: "MigrationBackfillSmTicket", propertyName: "note" }]);

        const tickets = await systemV2.storage.find("MigrationBackfillSmTicket", undefined, undefined, ["title", "status", "note"]);
        expect(tickets).toHaveLength(1);
        expect(tickets[0].note).toBe("n/a");
        // The backfill update must not fire the update-triggered transition:
        // status stays exactly what it was before migration.
        expect(tickets[0].status).toBe(statusBefore);
        await db.close();
    });

    test("new non-null property with defaultValue passes constraint verification through backfill", async () => {
        const db = new PGLiteDB();
        const build = (withStatus: boolean) => new Entity({
            name: "MigrationDefaultNonNullDoc",
            properties: [
                new Property({ name: "title", type: "string" }, { uuid: "migration-default-non-null-title" }),
                ...(withStatus ? [new Property({ name: "status", type: "string", defaultValue: () => "draft" }, { uuid: "migration-default-non-null-status" })] : []),
            ],
            constraints: withStatus ? [
                new NonNullConstraint({ name: "default_non_null_status_required", property: "status" }, { uuid: "migration-default-non-null-constraint" }),
            ] : [],
        }, { uuid: "migration-default-non-null-doc" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [build(false)], relations: [] }).setup(true);
        await systemV1.storage.create("MigrationDefaultNonNullDoc", { title: "old" });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [build(true)], relations: [] });
        await migrateWithApproval(controllerV2);

        const docs = await systemV2.storage.find("MigrationDefaultNonNullDoc", undefined, undefined, ["title", "status"]);
        expect(docs.find(doc => doc.title === "old")?.status).toBe("draft");
        await db.close();
    });

    test("StateNode.computeValue changes are visible in the manifest and migration diff", async () => {
        const db = new PGLiteDB();
        const build = (computeValue: () => string) => {
            const open = new StateNode({
                name: "open",
                computeValue,
            }, { uuid: "migration-sm-function-open" });
            const closed = new StateNode({ name: "closed" }, { uuid: "migration-sm-function-closed" });
            const lifecycle = new StateMachine({
                states: [open, closed],
                transfers: [
                    new StateTransfer({
                        trigger: { recordName: "MigrationSmFunctionTicket", type: "update" },
                        current: open,
                        next: closed,
                        computeTarget: (event: any) => ({ id: event.record.id }),
                    }, { uuid: "migration-sm-function-transfer" }),
                ],
                initialState: open,
            }, { uuid: "migration-sm-function-lifecycle" });
            return new Entity({
                name: "MigrationSmFunctionTicket",
                properties: [
                    new Property({ name: "title", type: "string" }, { uuid: "migration-sm-function-title" }),
                    new Property({ name: "status", type: "string", computation: lifecycle }, { uuid: "migration-sm-function-status" }),
                ],
            }, { uuid: "migration-sm-function-ticket" });
        };
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [build(() => "open-v1")], relations: [] });
        await controllerV1.setup(true);
        const manifestV1 = createMigrationManifest(controllerV1);
        const computationV1 = manifestV1.computations.find(item => item.dataContext === "property:MigrationSmFunctionTicket.status")!;
        expect(computationV1.functionSignature?.hasFunction).toBe(true);
        expect(computationV1.functionSignature?.callbackPaths).toContain("args.initialState.computeValue");

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [build(() => "open-v2-changed")], relations: [] });
        const computationV2 = createMigrationManifest(controllerV2).computations.find(item => item.dataContext === "property:MigrationSmFunctionTicket.status")!;
        expect(computationV2.signature).not.toBe(computationV1.signature);

        await expect(controllerV2.setup(false)).rejects.toThrow(/Model manifest mismatch/);
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.changes.find(change => change.kind === "computation" && change.dataContext === "property:MigrationSmFunctionTicket.status")).toMatchObject({
            changeType: "possibly-changed",
            recommendation: "needs-review",
        });
        await db.close();
    });

    test("manifests from an incompatible generator version are rejected and recovered via baseline", async () => {
        const db = new PGLiteDB();
        const build = () => {
            const open = new StateNode({
                name: "open",
                computeValue: () => "open",
            }, { uuid: "migration-sm-legacy-open" });
            const closed = new StateNode({ name: "closed" }, { uuid: "migration-sm-legacy-closed" });
            const lifecycle = new StateMachine({
                states: [open, closed],
                transfers: [
                    new StateTransfer({
                        trigger: { recordName: "MigrationSmLegacyTicket", type: "update" },
                        current: open,
                        next: closed,
                        computeTarget: (event: any) => ({ id: event.record.id }),
                    }, { uuid: "migration-sm-legacy-transfer" }),
                ],
                initialState: open,
            }, { uuid: "migration-sm-legacy-lifecycle" });
            return new Entity({
                name: "MigrationSmLegacyTicket",
                properties: [
                    new Property({ name: "title", type: "string" }, { uuid: "migration-sm-legacy-title" }),
                    new Property({ name: "status", type: "string", computation: lifecycle }, { uuid: "migration-sm-legacy-status" }),
                ],
            }, { uuid: "migration-sm-legacy-ticket" });
        };
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [build()], relations: [] });
        await controllerV1.setup(true);

        // Simulate a manifest written by generator "1", which could not see
        // StateNode.computeValue / StateTransfer.computeTarget.
        const manifest = await readMigrationManifest(controllerV1);
        const legacy = structuredClone(manifest!);
        legacy.frameworkVersion = "1";
        legacy.modelHash = "legacy-generator-model-hash";
        const legacyComputation = legacy.computations.find(item => item.dataContext === "property:MigrationSmLegacyTicket.status")!;
        legacyComputation.functionSignature = undefined;
        await writeMigrationManifest(controllerV1, legacy);

        // No backward compatibility: both startup validation and diff
        // generation refuse the old-generator manifest explicitly.
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [build()], relations: [] });
        await expect(controllerV2.setup(false)).rejects.toThrow(/incompatible interaqt manifest generator.*createMigrationBaseline/s);
        await expect(controllerV2.generateMigrationDiff()).rejects.toThrow(/incompatible interaqt manifest generator/);
        await expect(controllerV2.migrate({})).rejects.toThrow(/incompatible interaqt manifest generator/);

        // Explicit recovery: re-baseline (definitions match the schema), then
        // normal startup works again.
        await controllerV2.createMigrationBaseline();
        const systemV3 = new MonoSystem(db);
        systemV3.conceptClass = KlassByName;
        const controllerV3 = new Controller({ system: systemV3, entities: [build()], relations: [] });
        await controllerV3.setup(false);
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

    test("migration bookkeeping statements are parameterized instead of interpolated", async () => {
        const calls: Array<{ kind: string; sql: string; params: unknown[] }> = [];
        const stubDb = {
            logger: { info() {}, error() {}, child() { return this; } },
            schemaDialect: { name: "mysql" as const },
            async open() {},
            async scheme(sql: string) { calls.push({ kind: "scheme", sql, params: [] }); return undefined; },
            async query(sql: string, params: unknown[] = []) { calls.push({ kind: "query", sql, params }); return []; },
            async update(sql: string, params: unknown[] = []) { calls.push({ kind: "update", sql, params }); return []; },
            async insert() { return { id: "" }; },
            async delete() { return []; },
            async close() {},
        };
        const system = new MonoSystem(stubDb as any);
        // Backslash sequences corrupt interpolated literals under MySQL escaping.
        const hostile = `back\\slash 'quote' "double" \\' end\\`;

        await system.writeMigrationManifest({ hostileField: hostile } as any);
        await system.beginMigration("model-hash", "diff-hash", { reason: hostile }, 1);
        await system.updateMigrationPhase("migration-id", "schema-applied");
        await system.finishMigration("migration-id", "failed", new Error(hostile));

        const statements = calls.filter(call => call.kind !== "scheme");
        expect(statements.length).toBeGreaterThan(0);
        for (const call of statements) {
            expect(call.sql).not.toContain("back\\slash");
            expect(call.sql).not.toContain(hostile);
        }
        const manifestWrite = calls.find(call => call.kind === "update" && call.sql.includes("__interaqt_migration_manifest"))!;
        expect(String(manifestWrite.params[1])).toContain("back\\\\slash");
        const logWrite = calls.find(call => call.kind === "update" && call.sql.includes("INSERT INTO \"__interaqt_migration_log\""))!;
        expect(String(logWrite.params[3])).toContain("back\\\\slash");
        const finishWrite = calls.find(call => call.kind === "update" && call.sql.includes("SET \"status\""))!;
        expect(String(finishWrite.params[1])).toContain("back\\slash");
    });

    test("migration manifest with quotes and backslashes round-trips through storage", async () => {
        const db = new PGLiteDB();
        const Product = new Entity({
            name: "MigrationHostileManifestProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-hostile-manifest-name" })],
        }, { uuid: "migration-hostile-manifest-product" });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Product], relations: [] });
        await controller.setup(true);

        const manifest = await readMigrationManifest(controller);
        const hostile = structuredClone(manifest!);
        (hostile as any).hostileField = `back\\slash 'quote' "double" \\' end\\`;
        await writeMigrationManifest(controller, hostile);
        const restored = await readMigrationManifest(controller);
        expect(restored).toEqual(hostile);
        await db.close();
    });

    test("crashed migration lock can be force released and migration retried", async () => {
        const db = new PGLiteDB();
        const ProductV1 = new Entity({
            name: "MigrationLockRecoveryProduct",
            properties: [new Property({ name: "name", type: "string" }, { uuid: "migration-lock-recovery-name" })],
        }, { uuid: "migration-lock-recovery-product" });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);

        // Simulate a migration process that died while holding the lock.
        await db.scheme(`INSERT INTO "__interaqt_migration_lock" ("key", "migrationId") VALUES ('current', 'crashed-migration')`);

        const ProductV2 = new Entity({
            name: "MigrationLockRecoveryProduct",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "migration-lock-recovery-name" }),
                new Property({ name: "tag", type: "string" }, { uuid: "migration-lock-recovery-tag" }),
            ],
        }, { uuid: "migration-lock-recovery-product" });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
        await expect(migrateWithApproval(controllerV2)).rejects.toThrow(/Migration is already running: crashed-migration.*forceReleaseMigrationLock/s);

        await controllerV2.forceReleaseMigrationLock();
        await migrateWithApproval(controllerV2);
        const record = await systemV2.storage.create("MigrationLockRecoveryProduct", { name: "n", tag: "t" });
        expect(record.id).toBeDefined();
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
