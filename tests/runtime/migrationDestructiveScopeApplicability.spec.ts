/**
 * Destructive-scope applicability (issue #55, supersedes #54).
 *
 * A migration rebuild item needs an approved `destructive-scope` decision only when it
 * can delete stored rows: it rebuilds output (`rebuildOutput`), its output can delete
 * records (entity/relation output or the `_isDeleted_` hard-deletion property), and the
 * record whose rows would be deleted exists in the source schema (unknown source schema
 * counts as existing). Before this fix the decision was re-implemented by six readers
 * with different subsets of these conditions, so a migration that creates the host
 * table of a `HardDeletionProperty` demanded (and refused without) an approval that
 * covered nothing, and a `state-only` hard-deletion decision could not be applied at
 * all (refused without an approval, refused with one).
 *
 * Matrix dimensions (registered in tests/runtime/WritingComputationTests.md):
 *  - deletable record type in the source schema: absent (created by this migration) /
 *    present with stored rows / unknown source schema (analytic reader only);
 *  - computation decision: changed / state-only;
 *  - approval: none / the diff estimate / the exact executed ids / a non-empty approval
 *    for a deletion that will not execute;
 *  - scope estimation path: rolled-back simulation (data-based `_isDeleted_`, and the
 *    migrate-time check with handlers) / analytic fallback (diff of an event-based
 *    `_isDeleted_` without handlers, and the exported analytic reader);
 *  - output kind: `_isDeleted_` host / entity output of a Transform.
 */
import { describe, expect, test } from "vitest";
import {
    Controller, Custom, DELETED_STATE, Entity, HardDeletionProperty, KlassByName, MonoSystem, NON_DELETED_STATE,
    Property, StateMachine, Transform, computationManifestId, getDestructiveDeletionScope, readMigrationManifest,
} from "interaqt";
import type { ComputationRebuildItem, MigrationManifest } from "interaqt";
import { PGLiteDB } from "@drivers";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";

type Row = Record<string, unknown>;
type Decision = "changed" | "state-only";
type Approval = "none" | "estimate" | "exact" | "stale-exact";

const HOST = "ScopeApplicabilityRecord";
const HOST_IS_DELETED = `property:${HOST}._isDeleted_`;

const plainHost = () => Entity.create({ name: HOST, properties: [Property.create({ name: "name", type: "string" })] });

/** The issue's target model: an event-based `_isDeleted_` StateMachine with no transfers. */
function hardDeletionHost() {
    const hardDeletion = HardDeletionProperty.create();
    hardDeletion.computation = StateMachine.create({
        states: [NON_DELETED_STATE, DELETED_STATE], initialState: NON_DELETED_STATE, transfers: [],
    });
    return Entity.create({ name: HOST, properties: [Property.create({ name: "name", type: "string" }), hardDeletion] });
}

const handlers = {
    eventRebuild: {
        // Rebuilds `_isDeleted_` as true only for `stored-a`: on an existing table the
        // migration really deletes one row.
        markStoredA: async ({ dataContext, record }: { dataContext: { type: string }; record?: Row }) =>
            (dataContext.type === "property" ? record?.name === "stored-a" : undefined),
    },
};

function newSystem(db: PGLiteDB) {
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    return system;
}

async function runHardDeletionMigration(sourceHasHost: boolean, decision: Decision, approval: Approval) {
    const db = new PGLiteDB();
    const oldController = new Controller({ system: newSystem(db), entities: sourceHasHost ? [plainHost()] : [], relations: [], eventSources: [] });
    await oldController.setup(true);
    const storedA = sourceHasHost ? await oldController.system.storage.create(HOST, { name: "stored-a" }) as Row : undefined;
    if (sourceHasHost) await oldController.system.storage.create(HOST, { name: "stored-b" });

    const controller = new Controller({ system: newSystem(db), entities: [hardDeletionHost()], relations: [], eventSources: [] });
    const diff = await controller.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true });
    const scopeRequirement = diff.requiredDecisions.find(item => item.kind === "destructive-scope" && item.dataContext === HOST_IS_DELETED) as
        { kind: "destructive-scope"; dataContext: string; recordName?: string; ids: string[] } | undefined;
    const decisions: unknown[] = diff.requiredDecisions.flatMap((requirement): unknown[] => {
        if (requirement.kind === "destructive-scope") return [];
        if (requirement.kind === "computation") return [{ ...requirement, decision }];
        if (requirement.kind === "state-graph-mapping") return [{ ...requirement, decision: "changed", mapping: {} }];
        return [{ ...requirement, decision: "changed", handlerRef: "markStoredA" }];
    });
    if (approval !== "none") {
        const ids = approval === "estimate" ? (scopeRequirement?.ids ?? []) : [String(storedA!.id)];
        decisions.push({ kind: "destructive-scope", dataContext: HOST_IS_DELETED, recordName: HOST, ids, reason: "approved by test" });
    }
    const approvedDiff = { ...diff, status: "approved" as const, decisions } as NonNullable<NonNullable<Parameters<Controller["migrate"]>[0]>["approvedDiff"]>;

    let error: Error | undefined;
    let dryRunPlan: Awaited<ReturnType<Controller["migrate"]>> | undefined;
    try {
        dryRunPlan = await controller.migrate({ approvedDiff, dryRun: true, handlers } as any);
        await controller.migrate({ approvedDiff, dryRun: false, handlers } as any);
    } catch (caught) {
        error = caught instanceof Error ? caught : new Error(String(caught));
    }
    // Read through the source-version controller when the migration was refused (the
    // target controller's storage is only set up by a successful migrate).
    const reader = error ? oldController : controller;
    const rows = sourceHasHost || !error
        ? (await reader.system.storage.find(HOST, undefined, undefined, ["name"]) as Row[]).map(row => String(row.name)).sort()
        : [];
    await db.close();
    return { diff, scopeRequirement, dryRunPlan, error, rows, storedAId: storedA ? String(storedA.id) : undefined };
}

describe("migration destructive-scope applicability (issue #55)", () => {
    describe("_isDeleted_ host created by the same migration", () => {
        test.each<[Decision]>([["changed"], ["state-only"]])("decision %s: the diff demands no scope and the migration applies without one", async (decision) => {
            const result = await runHardDeletionMigration(false, decision, "none");
            expect(result.scopeRequirement).toBeUndefined();
            expect(result.diff.safety.destructiveScopes).toEqual([]);
            expect(result.error).toBeUndefined();
            // The migrate-time check, the recompute blocking gate and the dry-run scope all agree.
            expect(result.dryRunPlan!.deletionScope).toEqual([]);
            expect(result.dryRunPlan!.blockingChanges).toEqual([]);
            expect(result.rows).toEqual([]);
        });

        test("an empty approval left over from an older diff is accepted (it approves no deletion)", async () => {
            const result = await runHardDeletionMigration(false, "changed", "estimate");
            expect(result.error).toBeUndefined();
        });
    });

    describe("_isDeleted_ host with stored rows (behaviour preserved)", () => {
        test("changed without approval is refused and deletes nothing", async () => {
            const result = await runHardDeletionMigration(true, "changed", "none");
            // The diff of an event-based `_isDeleted_` has no handlers, so the scope is the
            // analytic estimate: ids unknown, count = stored rows (an upper bound).
            expect(result.scopeRequirement).toMatchObject({ recordName: HOST, ids: [] });
            expect(result.diff.safety.destructiveScopes).toEqual([expect.objectContaining({ dataContext: HOST_IS_DELETED, ids: [], count: 2 })]);
            expect(result.error?.message).toMatch(new RegExp(`approved ids \\[<missing decision>\\] != expected deletions \\[${result.storedAId}\\]`));
            expect(result.rows).toEqual(["stored-a", "stored-b"]);
        });

        test("changed with the empty estimate is refused: an empty estimate does not mean the step is safe", async () => {
            const result = await runHardDeletionMigration(true, "changed", "estimate");
            expect(result.error?.message).toMatch(new RegExp(`approved ids \\[\\] != expected deletions \\[${result.storedAId}\\]`));
            expect(result.rows).toEqual(["stored-a", "stored-b"]);
        });

        test("changed with the exact executed id applies and deletes exactly that row", async () => {
            const result = await runHardDeletionMigration(true, "changed", "exact");
            expect(result.error).toBeUndefined();
            expect(result.dryRunPlan!.deletionScope).toEqual([expect.objectContaining({ dataContext: HOST_IS_DELETED, ids: [result.storedAId] })]);
            expect(result.rows).toEqual(["stored-b"]);
        });

        test("state-only without approval applies: the output is not rebuilt, so no row can be deleted", async () => {
            const result = await runHardDeletionMigration(true, "state-only", "none");
            expect(result.error).toBeUndefined();
            expect(result.dryRunPlan!.deletionScope).toEqual([]);
            expect(result.dryRunPlan!.blockingChanges).toEqual([]);
            expect(result.rows).toEqual(["stored-a", "stored-b"]);
        });

        test("state-only with the diff's empty scope approved applies (the approval covers no deletion)", async () => {
            const result = await runHardDeletionMigration(true, "state-only", "estimate");
            expect(result.error).toBeUndefined();
            expect(result.rows).toEqual(["stored-a", "stored-b"]);
        });

        test("state-only with a non-empty approval is refused: the approved deletion would not execute", async () => {
            const result = await runHardDeletionMigration(true, "state-only", "stale-exact");
            expect(result.error?.message).toMatch(/Destructive migration scope mismatch/);
            expect(result.rows).toEqual(["stored-a", "stored-b"]);
        });
    });

    test("state-only on a stateless data-based _isDeleted_ never recomputes output (no row is deleted)", async () => {
        // A Custom `_isDeleted_` has no bound state, so a state-only decision yields a plan
        // item with rebuildState=false and rebuildOutput=false. The scheduler must not fall
        // through to a full output recompute for it: that would delete `gone` rows although
        // the decision says the output is kept and no destructive scope is required.
        const db = new PGLiteDB();
        const userV1 = new Entity({ name: "ScopeStatelessUser", properties: [new Property({ name: "name", type: "string" }, { uuid: "scope-stateless-name" })] }, { uuid: "scope-stateless-user" });
        const oldController = new Controller({ system: newSystem(db), entities: [userV1], relations: [] });
        await oldController.setup(true);
        await oldController.system.storage.create("ScopeStatelessUser", { name: "gone" });
        await oldController.system.storage.create("ScopeStatelessUser", { name: "keep" });

        const userV2 = new Entity({
            name: "ScopeStatelessUser",
            properties: [
                new Property({ name: "name", type: "string" }, { uuid: "scope-stateless-name" }),
                new Property({
                    name: "_isDeleted_", type: "boolean",
                    computation: new Custom({
                        name: "ScopeStatelessGone",
                        dataDeps: { current: { type: "property", attributeQuery: ["name"] } },
                        compute: async (_deps: unknown, record: Row) => record.name === "gone",
                    }, { uuid: "scope-stateless-gone-computation" }),
                }, { uuid: "scope-stateless-is-deleted" }),
            ],
        }, { uuid: "scope-stateless-user" });
        const controller = new Controller({ system: newSystem(db), entities: [userV2], relations: [] });
        const generated = await approveGeneratedMigrationDiff(controller);
        const computationRequirement = generated.requiredDecisions.find(item => item.kind === "computation")!;
        const approvedDiff = {
            ...generated,
            decisions: generated.decisions
                .filter(decision => decision.kind !== "destructive-scope")
                .map(decision => decision.kind === "computation" && decision.id === (computationRequirement as { id: string }).id
                    ? { ...decision, decision: "state-only" as const }
                    : decision),
        };
        const plan = await controller.migrate({ approvedDiff, dryRun: true });
        expect(plan.rebuildPlan.find(item => item.dataContext === "property:ScopeStatelessUser._isDeleted_"))
            .toMatchObject({ rebuildState: false, rebuildOutput: false });
        await controller.migrate({ approvedDiff });
        const names = (await controller.system.storage.find("ScopeStatelessUser", undefined, undefined, ["name"]) as Row[]).map(row => row.name).sort();
        expect(names).toEqual(["gone", "keep"]);
        await db.close();
    });

    test("a data-based _isDeleted_ on a host populated by the same migration's Transform needs no approval", async () => {
        // The new host's rows are created by the migration itself (Transform over an existing
        // record) and some of them are hard-deleted by the new `_isDeleted_` in the same run.
        // No stored row is destroyed. Before the fix the rolled-back simulation reported the
        // simulation's own (random) ids as the scope, so the approval could never match the
        // ids allocated by the real run.
        const db = new PGLiteDB();
        const sourceV1 = new Entity({ name: "ScopeMirrorSource", properties: [new Property({ name: "label", type: "string" }, { uuid: "scope-mirror-source-label" })] }, { uuid: "scope-mirror-source" });
        const oldController = new Controller({ system: newSystem(db), entities: [sourceV1], relations: [] });
        await oldController.setup(true);
        for (const label of ["keep-1", "gone-1", "keep-2", "gone-2"]) {
            await oldController.system.storage.create("ScopeMirrorSource", { label });
        }

        const sourceV2 = new Entity({ name: "ScopeMirrorSource", properties: [new Property({ name: "label", type: "string" }, { uuid: "scope-mirror-source-label" })] }, { uuid: "scope-mirror-source" });
        const mirror = new Entity({
            name: "ScopeMirror",
            properties: [
                new Property({ name: "label", type: "string" }, { uuid: "scope-mirror-label" }),
                new Property({
                    name: "_isDeleted_", type: "boolean",
                    computation: new Custom({
                        name: "ScopeMirrorGone",
                        dataDeps: { current: { type: "property", attributeQuery: ["label"] } },
                        compute: async (_deps: unknown, record: Row) => String(record.label).startsWith("gone"),
                    }, { uuid: "scope-mirror-gone-computation" }),
                }, { uuid: "scope-mirror-is-deleted" }),
            ],
            computation: new Transform({
                record: sourceV2, attributeQuery: ["label"],
                callback: function (row: Row) { return { label: row.label }; },
            } as any, { uuid: "scope-mirror-transform" }),
        } as any, { uuid: "scope-mirror" });
        const controller = new Controller({ system: newSystem(db), entities: [sourceV2, mirror], relations: [] });

        const approvedDiff = await approveGeneratedMigrationDiff(controller);
        expect(approvedDiff.requiredDecisions.filter(item => item.kind === "destructive-scope")).toEqual([]);
        expect(approvedDiff.safety.destructiveScopes).toEqual([]);
        await controller.migrate({ approvedDiff });

        const mirrored = (await controller.system.storage.find("ScopeMirror", undefined, undefined, ["label"]) as Row[]).map(row => row.label).sort();
        expect(mirrored).toEqual(["keep-1", "keep-2"]);
        const sources = (await controller.system.storage.find("ScopeMirrorSource", undefined, undefined, ["label"]) as Row[]).map(row => row.label).sort();
        expect(sources).toEqual(["gone-1", "gone-2", "keep-1", "keep-2"]);
        // Live wiring after the migration: a new `gone` source is mirrored and hard-deleted at once.
        await controller.system.storage.create("ScopeMirrorSource", { label: "gone-3" });
        await controller.system.storage.create("ScopeMirrorSource", { label: "keep-3" });
        const mirroredAfter = (await controller.system.storage.find("ScopeMirror", undefined, undefined, ["label"]) as Row[]).map(row => row.label).sort();
        expect(mirroredAfter).toEqual(["keep-1", "keep-2", "keep-3"]);
        await db.close();
    });

    test("an entity output whose record is created by the same migration stays scope-free", async () => {
        const db = new PGLiteDB();
        const sourceV1 = new Entity({ name: "ScopeDerivedSource", properties: [new Property({ name: "label", type: "string" }, { uuid: "scope-derived-source-label" })] }, { uuid: "scope-derived-source" });
        const oldController = new Controller({ system: newSystem(db), entities: [sourceV1], relations: [] });
        await oldController.setup(true);
        await oldController.system.storage.create("ScopeDerivedSource", { label: "a" });

        const sourceV2 = new Entity({ name: "ScopeDerivedSource", properties: [new Property({ name: "label", type: "string" }, { uuid: "scope-derived-source-label" })] }, { uuid: "scope-derived-source" });
        const derived = new Entity({
            name: "ScopeDerived",
            properties: [new Property({ name: "label", type: "string" }, { uuid: "scope-derived-label" })],
            computation: new Transform({
                record: sourceV2, attributeQuery: ["label"],
                callback: function (row: Row) { return { label: row.label }; },
            } as any, { uuid: "scope-derived-transform" }),
        } as any, { uuid: "scope-derived" });
        const controller = new Controller({ system: newSystem(db), entities: [sourceV2, derived], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controller);
        expect(approvedDiff.safety.destructiveScopes).toEqual([]);
        await controller.migrate({ approvedDiff });
        expect((await controller.system.storage.find("ScopeDerived", undefined, undefined, ["label"]) as Row[]).map(row => row.label)).toEqual(["a"]);
        await db.close();
    });

    test("the analytic scope reader applies the same rule per rebuild item", async () => {
        // getDestructiveDeletionScope is the fallback used when the rolled-back simulation is
        // infeasible. It used to ignore `rebuildOutput` per item and the source schema for
        // `_isDeleted_`; it must now agree with every other reader.
        const db = new PGLiteDB();
        const oldController = new Controller({ system: newSystem(db), entities: [plainHost()], relations: [] });
        await oldController.setup(true);
        await oldController.system.storage.create(HOST, { name: "stored-a" });
        const oldManifest = (await readMigrationManifest(oldController))!;

        const controller = new Controller({ system: newSystem(db), entities: [hardDeletionHost()], relations: [] });
        const computation = [...controller.scheduler.computationsHandles.values()]
            .find(handle => handle.dataContext.type === "property" && handle.dataContext.id.name === "_isDeleted_")!;
        const item = (rebuildOutput: boolean): ComputationRebuildItem => ({
            computationId: computationManifestId(computation as any),
            dataContext: HOST_IS_DELETED,
            rebuildState: true,
            rebuildOutput,
            propagateOutputEvents: true,
            isSeed: true,
        });
        const withoutHost: MigrationManifest = {
            ...oldManifest,
            storage: { ...oldManifest.storage, records: oldManifest.storage.records.filter(record => record.recordName !== HOST) },
        };

        expect(await getDestructiveDeletionScope(controller, [item(false)], oldManifest)).toEqual([]);
        expect(await getDestructiveDeletionScope(controller, [item(true)], withoutHost)).toEqual([]);
        expect(await getDestructiveDeletionScope(controller, [item(true)], oldManifest)).toEqual([
            expect.objectContaining({ dataContext: HOST_IS_DELETED, recordName: HOST, ids: [], count: 1 }),
        ]);
        // Unknown source schema: treat the host as existing (fail closed).
        expect(await getDestructiveDeletionScope(controller, [item(true)], undefined)).toEqual([
            expect.objectContaining({ dataContext: HOST_IS_DELETED, recordName: HOST }),
        ]);
        await db.close();
    });
});
