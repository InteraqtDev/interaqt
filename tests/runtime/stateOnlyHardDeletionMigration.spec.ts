import { describe, expect, test } from "vitest";
import {
    Action,
    Controller,
    Custom,
    DELETED_STATE,
    Entity,
    HardDeletionProperty,
    Interaction,
    InteractionEventEntity,
    KlassByName,
    MonoSystem,
    NON_DELETED_STATE,
    Payload,
    PayloadItem,
    Property,
    StateMachine,
    StateTransfer,
    Transform,
} from "interaqt";
import { PGLiteDB } from "@drivers";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";

const STATE_ONLY_CONTEXT = "property:MigrationStateOnlyHardDeleteSample._isDeleted_";
const CHANGED_CONTEXT = "property:MigrationChangedHardDeleteSample._isDeleted_";

describe("state-only hard-deletion migration", () => {
    test("applies a new hard-deletion state machine on an empty host without an output scope", async () => {
        const db = new PGLiteDB();
        const createSample = Interaction.create({
            name: "CreateMigrationStateOnlyHardDeleteSample",
            action: Action.create({ name: "createMigrationStateOnlyHardDeleteSample" }),
            payload: Payload.create({ items: [PayloadItem.create({ name: "name", type: "string", required: true })] }),
        });
        const deleteSample = Interaction.create({
            name: "DeleteMigrationStateOnlyHardDeleteSample",
            action: Action.create({ name: "deleteMigrationStateOnlyHardDeleteSample" }),
            payload: Payload.create({ items: [PayloadItem.create({ name: "sampleId", type: "string", required: true })] }),
        });
        const oldSystem = new MonoSystem(db);
        oldSystem.conceptClass = KlassByName;
        const oldController = new Controller({ system: oldSystem, entities: [], relations: [], eventSources: [] });
        let nextController: Controller | undefined;

        try {
            await oldController.setup(true);
            oldController.teardown();

            const hardDeletion = HardDeletionProperty.create();
            hardDeletion.computation = StateMachine.create({
                states: [NON_DELETED_STATE, DELETED_STATE],
                initialState: NON_DELETED_STATE,
                transfers: [StateTransfer.create({
                    current: NON_DELETED_STATE,
                    next: DELETED_STATE,
                    trigger: {
                        recordName: InteractionEventEntity.name,
                        type: "create",
                        record: { interactionName: deleteSample.name },
                    },
                    computeTarget: (event: any) => ({ id: event.record.payload.sampleId }),
                })],
            });
            const sampleRecord = Entity.create({
                name: "MigrationStateOnlyHardDeleteSample",
                properties: [Property.create({ name: "name", type: "string" }), hardDeletion],
                computation: Transform.create({
                    eventDeps: {
                        CreateMigrationStateOnlyHardDeleteSample: {
                            recordName: InteractionEventEntity.name,
                            type: "create",
                            record: { interactionName: createSample.name },
                        },
                    },
                    callback(event: any) {
                        return event?.record?.interactionName === createSample.name
                            ? { name: event.record.payload.name }
                            : null;
                    },
                }),
            });
            const nextSystem = new MonoSystem(db);
            nextSystem.conceptClass = KlassByName;
            nextController = new Controller({
                system: nextSystem,
                entities: [sampleRecord],
                relations: [],
                eventSources: [createSample, deleteSample],
            });

            const raw = await nextController.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true });
            const computation = raw.requiredDecisions.find((item: any) =>
                item.kind === "computation" && item.dataContext === STATE_ONLY_CONTEXT,
            );
            expect(computation).toBeDefined();
            const eventHandlers = Object.fromEntries(raw.requiredDecisions
                .filter((item: any) => item.kind === "event-rebuild-handler")
                .map((item: any) => [item.dataContext, "preserveExistingValue"]));
            const approved = await approveGeneratedMigrationDiff(nextController, {
                eventHandlers,
                computationDecisions: Object.fromEntries(raw.requiredDecisions
                    .filter((item: any) => item.kind === "computation")
                    .map((item: any) => [item.id, "state-only"])),
            });
            const effectiveDiff = {
                ...approved,
                requiredDecisions: approved.requiredDecisions.filter((item: any) => item.kind !== "destructive-scope"),
                decisions: approved.decisions.filter((item: any) => item.kind !== "destructive-scope"),
                safety: { ...approved.safety, destructiveScopes: [] },
            };
            const handlers = {
                eventRebuild: {
                    preserveExistingValue: async ({ dataContext, record }: any) =>
                        dataContext.type === "property" ? record?.[dataContext.id.name] : undefined,
                },
            };

            const plan = await nextController.migrate({ approvedDiff: effectiveDiff, handlers });

            expect(plan.rebuildPlan.find((item: any) => item.dataContext === STATE_ONLY_CONTEXT))
                .toMatchObject({ rebuildState: true, rebuildOutput: false });
            expect(plan.deletionScope).toEqual([]);
            expect(await nextSystem.storage.find("MigrationStateOnlyHardDeleteSample", undefined, undefined, ["id"]))
                .toEqual([]);
        } finally {
            (nextController ?? oldController).teardown();
            await db.close();
        }
    });

    test("still requires a scope when changed output would delete a stored host row", async () => {
        const db = new PGLiteDB();
        const userV1 = Entity.create({
            name: "MigrationChangedHardDeleteSample",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const oldSystem = new MonoSystem(db);
        oldSystem.conceptClass = KlassByName;
        const oldController = new Controller({ system: oldSystem, entities: [userV1], relations: [] });
        let nextController: Controller | undefined;

        try {
            await oldController.setup(true);
            const stored = await oldSystem.storage.create("MigrationChangedHardDeleteSample", { name: "delete" });

            const hardDeletion = HardDeletionProperty.create();
            hardDeletion.computation = Custom.create({
                name: "MigrationChangedHardDeleteFlag",
                dataDeps: { current: { type: "property", attributeQuery: ["name"] } },
                compute: async (_deps: unknown, record: any) => record.name === "delete",
            });
            const userV2 = Entity.create({
                name: "MigrationChangedHardDeleteSample",
                properties: [Property.create({ name: "name", type: "string" }), hardDeletion],
            });
            const nextSystem = new MonoSystem(db);
            nextSystem.conceptClass = KlassByName;
            nextController = new Controller({ system: nextSystem, entities: [userV2], relations: [] });
            const approved = await approveGeneratedMigrationDiff(nextController, { includeDestructiveScope: false });
            expect(approved.requiredDecisions.some((item: any) => item.kind === "destructive-scope")).toBe(false);

            await expect(nextController.migrate({ approvedDiff: approved }))
                .rejects.toThrow(`Destructive migration scope mismatch for ${CHANGED_CONTEXT}`);
            expect(await oldSystem.storage.find("MigrationChangedHardDeleteSample", undefined, undefined, ["id"]))
                .toEqual([{ id: stored.id }]);
        } finally {
            (nextController ?? oldController).teardown();
            await db.close();
        }
    });
});
