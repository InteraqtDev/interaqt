import type { Controller } from "./Controller.js";
import type { Computation, ComputationResultPatch, DataBasedComputation, DataContext, EventBasedComputation, GlobalBoundState, RecordBoundState } from "./computations/Computation.js";
import { ComputationResultAsync, ComputationResultFullRecompute, ComputationResultResolved, ComputationResultSkip } from "./computations/Computation.js";
import type { RecordMutationEvent, StorageSchemaMetadata, System } from "./System.js";
import { DICTIONARY_RECORD } from "./System.js";
import { EntityQueryHandle, EntityToTableMap, getSchemaDialect, LINK_SYMBOL, MatchExp, quoteIdentifier } from "@storage";
import { createHash } from "node:crypto";
import { ComputationSourceMapManager, type DataBasedEntityEventsSourceMap, type EntityEventSourceMap, type EventBasedEntityEventsSourceMap, type EtityMutationEvent } from "./ComputationSourceMap.js";

export const MIGRATION_MANIFEST_CONCEPT = "_MigrationManifest_";
export const MIGRATION_MANIFEST_CURRENT_KEY = "current";
const HARD_DELETION_PROPERTY_NAME = "_isDeleted_";

export class MigrationError extends Error {
    constructor(message: string, public details?: Record<string, unknown>) {
        super(message);
        this.name = new.target.name;
    }
}

export class MigrationBaselineError extends MigrationError {}
export class PhysicalLayoutChangeError extends MigrationError {}
export class UnrebuildableComputationError extends MigrationError {}
export class AsyncMigrationComputationError extends MigrationError {}
export class DestructiveComputedOutputError extends MigrationError {}
export class AmbiguousComputationSignatureError extends MigrationError {}

export type MigrationIdentity = {
    key: string;
    kind: "entity" | "relation" | "property" | "dictionary" | "computation";
    namePath: string;
    uuid?: string;
};

export type ComputationFunctionSignature = {
    hasFunction: boolean;
    hash?: string;
    text?: string;
    callbackPaths: string[];
};

export type MigrationDiffSummary = {
    changeCount: number;
    requiredDecisionCount: number;
    blockingChangeCount: number;
    computationTakeovers?: Array<{
        dataContext: string;
        computationId: string;
        targetType: "property" | "entity" | "relation";
        expectedExistingCount: number;
        expectedHostCount?: number;
    }>;
};

export type MigrationChange =
    | {
        kind: "computation";
        id: string;
        dataContext: string;
        computationType: string;
        changeType: "added" | "removed" | "changed" | "state-only" | "possibly-changed" | "unchanged";
        detected: {
            dataDepsChanged?: boolean;
            eventDepsChanged?: boolean;
            outputSignatureChanged?: boolean;
            stateSignatureChanged?: boolean;
            functionTextChanged?: boolean;
            functionHash?: string;
            previousFunctionHash?: string;
            hasFunction?: boolean;
            hasClosureRisk?: boolean;
            needsEventRebuildHandler?: boolean;
            needsAsyncCompletionHandler?: boolean;
        };
        recommendation: "rebuild" | "ignore" | "needs-review" | "blocked";
        reason: string;
    }
    | {
        kind: "computation-takeover";
        id: string;
        dataContext: string;
        computationId: string;
        targetType: "property" | "entity" | "relation";
        previousAuthority: "fact";
        nextAuthority: "computation";
        expectedExistingCount: number;
        expectedHostCount?: number;
        reason: string;
    }
    | {
        kind: "storage";
        id: string;
        changeType: "added" | "removed" | "changed" | "blocked";
        dataContext: string;
        reason: string;
    }
    | {
        kind: "empty-fact-record-removal";
        id: string;
        recordName: string;
        tableName: string;
        expectedCount: 0;
        reason: string;
    }
    | {
        kind: "record";
        id: string;
        changeType: "added" | "removed" | "changed";
        dataContext: string;
        reason: string;
    }
    | {
        kind: "property";
        id: string;
        changeType: "added" | "removed" | "changed";
        dataContext: string;
        reason: string;
    }
    | {
        kind: "relation";
        id: string;
        changeType: "added" | "removed" | "changed";
        dataContext: string;
        reason: string;
    }
    | {
        kind: "dictionary";
        id: string;
        changeType: "added" | "removed" | "changed" | "unchanged";
        dataContext: string;
        reason: string;
    };

export type MigrationDecisionRequirement =
    | {
        kind: "computation";
        id: string;
        dataContext: string;
        recommendedDecision: "changed" | "unchanged" | "state-only" | "unrebuildable";
        reason: string;
    }
    | {
        kind: "computation-takeover";
        dataContext: string;
        computationId: string;
        targetType: "property" | "entity" | "relation";
        previousAuthority: "fact";
        nextAuthority: "computation";
        oldDataStrategy: "discard-and-rebuild";
        expectedExistingCount: number;
        expectedHostCount?: number;
        destructiveScopeRef?: string;
        reason: string;
    }
    | {
        kind: "event-rebuild-handler";
        dataContext: string;
        reason: string;
    }
    | {
        kind: "async-completion-handler";
        dataContext: string;
        reason: string;
    }
    | {
        kind: "destructive-scope";
        dataContext: string;
        recordName?: string;
        ids: string[];
        reason: string;
    }
    | {
        kind: "empty-fact-record-removal";
        recordName: string;
        tableName: string;
        expectedCount: 0;
        reason: string;
    };

export type MigrationDecision =
    | {
        kind: "computation";
        id: string;
        dataContext: string;
        decision: "changed" | "unchanged" | "state-only" | "unrebuildable";
        reason: string;
    }
    | {
        kind: "computation-takeover";
        dataContext: string;
        computationId: string;
        targetType: "property" | "entity" | "relation";
        previousAuthority: "fact";
        nextAuthority: "computation";
        oldDataStrategy: "discard-and-rebuild";
        expectedExistingCount: number;
        expectedHostCount?: number;
        destructiveScopeRef?: string;
        reason: string;
    }
    | {
        kind: "event-rebuild-handler";
        dataContext: string;
        handlerRef: string;
        reason: string;
    }
    | {
        kind: "async-completion-handler";
        dataContext: string;
        handlerRef: string;
        reason: string;
    }
    | {
        kind: "destructive-scope";
        dataContext: string;
        recordName?: string;
        ids: string[];
        reason: string;
    }
    | {
        kind: "empty-fact-record-removal";
        recordName: string;
        tableName: string;
        expectedCount: 0;
        reason: string;
    }
    | {
        kind: "rename-candidate-reviewed";
        from: string;
        to: string;
        decision: "not-accepted" | "accepted-for-future-primitive";
        reason: string;
    };

export type MigrationSafetyReview = {
    blockingChanges: StorageBlockingChange[];
    destructiveScopes: Array<{ dataContext: string; recordName?: string; ids?: string[]; count?: number; reason: string }>;
};

export type MigrationDiffFile = {
    kind: "interaqt-migration-diff";
    version: 2;
    status: "generated" | "approved";
    fromModelHash: string;
    toModelHash: string;
    generatedAt: string;
    generatorVersion: string;
    summary: MigrationDiffSummary;
    changes: MigrationChange[];
    requiredDecisions: MigrationDecisionRequirement[];
    decisions: MigrationDecision[];
    safety: MigrationSafetyReview;
};

export type GenerateMigrationDiffOptions = {
    includeFunctionText?: boolean;
    includeDestructiveScope?: boolean;
};

export type MigrationEventRebuildHandler = (context: {
    controller: Controller;
    dataContext: DataContext;
    record?: Record<string, unknown>;
    mutationEvent?: RecordMutationEvent;
}) => unknown | Promise<unknown>;

export type MigrationAsyncCompletionHandler = (context: {
    controller: Controller;
    dataContext: DataContext;
    record?: Record<string, unknown>;
    args: unknown;
    result: ComputationResultAsync;
}) => unknown | Promise<unknown>;

export type MigrationHandlers = {
    eventRebuild?: Record<string, MigrationEventRebuildHandler>;
    asyncCompletion?: Record<string, MigrationAsyncCompletionHandler>;
};

export type MigrationOptions = {
    dryRun?: boolean;
    approvedDiff?: MigrationDiffFile;
    handlers?: MigrationHandlers;
};

export type SetupOptions = {
    install?: boolean;
    migrate?: boolean | MigrationOptions;
};

export type ComputationManifest = {
    id: string;
    identity: MigrationIdentity;
    type: string;
    dataContext: string;
    outputRecord?: string;
    outputProperty?: string;
    deps: Array<{ type: string; source?: string; phase?: unknown; attributeQuery?: unknown }>;
    eventDeps: Array<{ recordName: string; type: string; phase?: unknown }>;
    stateKeys: string[];
    boundStates: BoundStateManifest[];
    asyncReturn: boolean;
    owner?: "exclusive" | "shared" | "unknown";
    ownershipProof?: {
        kind: "computed-output";
        owner: "exclusive";
        ownerComputationId: string;
        dataContext: string;
        outputRecord: string;
    };
    outputSignature: string;
    stateSignature: string;
    structuralSignature: string;
    functionSignature?: ComputationFunctionSignature;
    signature: string;
};

export type BoundStateManifest = {
    key: string;
    scope: "global" | "record";
    hostRecord?: string;
    defaultSignature: string;
    valueType?: string;
};

export type MigrationManifest = {
    version: 2;
    frameworkVersion: string;
    modelHash: string;
    records: Array<{
        id: string;
        identity: MigrationIdentity;
        name: string;
        kind: "entity" | "relation";
        properties: Array<{
            id: string;
            identity: MigrationIdentity;
            name: string;
            type: string;
            collection: boolean;
            computed: boolean;
        }>;
    }>;
    relations: Array<{
        id: string;
        identity: MigrationIdentity;
        name: string;
        source: string;
        target: string;
        sourceProperty?: string;
        targetProperty?: string;
        type: string;
    }>;
    dictionaries: Array<{
        id: string;
        identity: MigrationIdentity;
        name: string;
        type: string;
        collection: boolean;
        computed: boolean;
    }>;
    computations: ComputationManifest[];
    storage: StorageSchemaMetadata;
};

export type AdditiveDDLOperation = {
    kind: "create-table" | "add-column" | "create-constraint" | "verify";
    sql?: string;
    tableName?: string;
    columnName?: string;
    logicalPath?: string;
    description: string;
};

export type DestructiveCleanupOperation = {
    kind: "drop-empty-fact-table";
    tableName: string;
    logicalPath: string;
    description: string;
    precondition: {
        kind: "empty-table";
        recordName: string;
        expectedCount: 0;
    };
};

export type MigrationDDLOperation = AdditiveDDLOperation | DestructiveCleanupOperation;

export type StorageBlockingChange = {
    kind: "physical-path-move" | "unsupported-destructive-schema-change" | "unrebuildable-computation" | "destructive-computed-output" | "async-computation";
    logicalPath: string;
    oldPhysicalPath?: string;
    newPhysicalPath?: string;
    reason: string;
};

export type MigrationSchemaPlan = {
    schema: StorageSchemaMetadata;
    preRecomputeDDL: AdditiveDDLOperation[];
    postRecomputeDDL: MigrationDDLOperation[];
    verificationDDL: AdditiveDDLOperation[];
    blockingChanges: StorageBlockingChange[];
    internal?: unknown;
};

export type MigrationPhase = "pending" | "schema-applied" | "computation-applied" | "constraints-applied" | "manifest-written" | "succeeded" | "failed";

export type MigrationRunState = {
    id: string;
    phase: MigrationPhase;
};

export type ComputationRebuildItem = {
    computationId: string;
    dataContext: string;
    rebuildState: boolean;
    rebuildOutput: boolean;
    propagateOutputEvents: boolean;
    isSeed: boolean;
};

export type MigrationPlan = {
    mode: "compute";
    dryRun: boolean;
    changedComputations: ComputationManifest[];
    rebuildPlan: ComputationRebuildItem[];
    schemaPlan?: Omit<MigrationSchemaPlan, "internal">;
    blockingChanges: string[];
    deletionScope: Array<{ dataContext: string; recordName?: string; ids?: string[]; count?: number; reason: string }>;
    approvedDiffHash?: string;
};

function hash(value: unknown) {
    return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function hashMigrationDiff(diff: MigrationDiffFile) {
    return hash(diff);
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        if (typeof value === "function") return "[Function]";
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function identityKey(identity: MigrationIdentity) {
    return identity.namePath;
}

function createIdentity(kind: MigrationIdentity["kind"], namePath: string, uuid?: string): MigrationIdentity {
    return {
        key: namePath,
        kind,
        namePath,
        uuid,
    };
}

function stripIdentityUUID<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(item => stripIdentityUUID(item)) as T;
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
        if (key === "uuid" && "kind" in record && "namePath" in record && "key" in record) continue;
        output[key] = stripIdentityUUID(record[key]);
    }
    return output as T;
}

function stripUndefinedDeep<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(item => stripUndefinedDeep(item)) as T;
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
        if (record[key] === undefined) continue;
        output[key] = stripUndefinedDeep(record[key]);
    }
    return output as T;
}

function assertUniqueIdentities(identities: MigrationIdentity[]) {
    const seen = new Map<string, MigrationIdentity>();
    for (const identity of identities) {
        const key = `${identity.kind}:${identity.namePath}`;
        const existing = seen.get(key);
        if (existing) {
            throw new AmbiguousComputationSignatureError(`Migration identity is ambiguous for ${identity.namePath}`);
        }
        seen.set(key, identity);
    }
}

export function dataContextPath(dataContext: DataContext): string {
    if (dataContext.type === "property") {
        return `property:${dataContext.host.name}.${dataContext.id.name}`;
    }
    return `${dataContext.type}:${dataContext.id.name}`;
}

function computationSemanticType(computation: { constructor?: { computationType?: { displayName?: string; name?: string }; displayName?: string; name?: string }; args: { _type?: string; constructor?: { displayName?: string; name?: string } } }) {
    return computation.constructor?.computationType?.displayName ||
        computation.constructor?.computationType?.name ||
        computation.args._type ||
        computation.args.constructor?.displayName ||
        computation.args.constructor?.name ||
        computation.constructor?.displayName ||
        computation.constructor?.name ||
        "UnknownComputation";
}

export function computationManifestId(computation: { constructor?: { computationType?: { displayName?: string; name?: string }; displayName?: string; name?: string }; args: { uuid?: string; _type?: string; constructor?: { displayName?: string; name?: string } }; dataContext: DataContext }) {
    return `computation:${dataContextPath(computation.dataContext)}:${computationSemanticType(computation)}`;
}

function serializeDataDeps(computation: Partial<DataBasedComputation>) {
    return Object.entries(computation.dataDeps || {}).map(([name, dep]) => {
        if (dep.type === "records") {
            return {
                name,
                type: dep.type,
                source: dep.source.name,
                match: dep.match,
                modifier: dep.modifier,
                attributeQuery: dep.attributeQuery,
                phase: dep.phase,
            };
        }
        if (dep.type === "global") {
            return {
                name,
                type: dep.type,
                source: dep.source.name,
                phase: dep.phase,
            };
        }
        return { name, ...dep };
    });
}

function serializeEventDeps(computation: Partial<EventBasedComputation>) {
    return Object.values(computation.eventDeps || {}).map(dep => ({
        recordName: dep.recordName,
        type: dep.type,
        phase: dep.phase,
    }));
}

function serializeState(computation: Computation): BoundStateManifest[] {
    return Object.values(computation.state || {}).map(state => {
        const isRecordState = "record" in state;
        return {
            key: state.key,
            scope: isRecordState ? "record" : "global",
            hostRecord: isRecordState ? (state as RecordBoundState<unknown>).record : undefined,
            defaultSignature: stableStringify((state as RecordBoundState<unknown> | GlobalBoundState<unknown>).defaultValue),
            valueType: typeof (state as RecordBoundState<unknown> | GlobalBoundState<unknown>).defaultValue,
        };
    });
}

function hasFunctionDeep(value: unknown, seen = new WeakSet<object>(), isRoot = true): boolean {
    if (typeof value === "function") return true;
    if (value === null || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (!isRoot && typeof record._type === "string" && ["Entity", "Relation", "Property", "Dictionary", "StateNode", "StateTransfer"].includes(record._type)) {
        return false;
    }
    if (Array.isArray(value)) return value.some(item => hasFunctionDeep(item, seen, false));
    return Object.values(record).some(item => hasFunctionDeep(item, seen, false));
}

function collectFunctionText(value: unknown, path = "args", seen = new WeakSet<object>()): Array<{ path: string; text: string }> {
    if (typeof value === "function") {
        return [{ path, text: value.toString() }];
    }
    if (value === null || typeof value !== "object") return [];
    if (seen.has(value)) return [];
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record._type === "string" && ["Entity", "Relation", "Property", "Dictionary", "StateNode", "StateTransfer"].includes(record._type)) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectFunctionText(item, `${path}[${index}]`, seen));
    }
    return Object.keys(record).sort().flatMap(key => collectFunctionText(record[key], `${path}.${key}`, seen));
}

function createFunctionSignature(args: Record<string, unknown>, includeText = false): ComputationFunctionSignature | undefined {
    const functions = collectFunctionText(args);
    if (!functions.length && !hasFunctionDeep(args)) return undefined;
    return {
        hasFunction: functions.length > 0,
        hash: hash(functions.map(item => ({ path: item.path, text: item.text }))),
        text: includeText ? functions.map(item => `// ${item.path}\n${item.text}`).join("\n\n") : undefined,
        callbackPaths: functions.map(item => item.path),
    };
}

function createComputationManifest(computation: Computation, includeFunctionText = false): ComputationManifest {
    const args = computation.args as Record<string, unknown>;
    const deps = serializeDataDeps(computation as Partial<DataBasedComputation>);
    const eventDeps = serializeEventDeps(computation as Partial<EventBasedComputation>);
    const boundStates = serializeState(computation);
    const stateKeys = boundStates.map(state => state.key);
    const id = computationManifestId(computation);
    const dataContext = dataContextPath(computation.dataContext);
    const outputRecord = computation.dataContext.type === "entity" || computation.dataContext.type === "relation" ? computation.dataContext.id.name : undefined;
    const type = computationSemanticType(computation);
    const identity = createIdentity("computation", id, computation.args.uuid);
    const functionSignature = createFunctionSignature(args, includeFunctionText);
    const outputSignature = hash({
        type,
        dataContext,
        dataDeps: deps,
        eventDeps,
        hasCompute: typeof (computation as DataBasedComputation).compute === "function",
        hasIncrementalCompute: typeof computation.incrementalCompute === "function",
        hasIncrementalPatchCompute: typeof computation.incrementalPatchCompute === "function",
    });
    const stateSignature = hash({ stateKeys, boundStates });
    const structuralSignature = hash({
        type,
        dataContext,
        outputRecord,
        outputProperty: computation.dataContext.type === "property" ? computation.dataContext.id.name : undefined,
        deps,
        eventDeps,
        callbackPaths: functionSignature?.callbackPaths || [],
        hasFunction: functionSignature?.hasFunction === true,
        hasCompute: typeof (computation as DataBasedComputation).compute === "function",
        hasIncrementalCompute: typeof computation.incrementalCompute === "function",
        hasIncrementalPatchCompute: typeof computation.incrementalPatchCompute === "function",
    });
    const signature = hash({ structuralSignature, stateSignature, functionHash: functionSignature?.hash });

    return {
        id,
        identity,
        type,
        dataContext,
        outputRecord,
        outputProperty: computation.dataContext.type === "property" ? computation.dataContext.id.name : undefined,
        deps: deps.map(dep => ({ type: String(dep.type), source: (dep as { source?: string }).source, phase: (dep as { phase?: unknown }).phase, attributeQuery: (dep as { attributeQuery?: unknown }).attributeQuery })),
        eventDeps,
        stateKeys,
        boundStates,
        asyncReturn: typeof (computation as DataBasedComputation).asyncReturn === "function",
        owner: computation.dataContext.type === "entity" || computation.dataContext.type === "relation" ? "exclusive" : undefined,
        ownershipProof: outputRecord ? {
            kind: "computed-output",
            owner: "exclusive",
            ownerComputationId: id,
            dataContext,
            outputRecord,
        } : undefined,
        outputSignature,
        stateSignature,
        structuralSignature,
        functionSignature,
        signature,
    };
}

export function createMigrationManifest(controller: Controller, storageSchema: StorageSchemaMetadata = controller.system.storage.schema, options: { includeFunctionText?: boolean } = {}): MigrationManifest {
    const records = [
        ...controller.entities.map(entity => {
            const identity = createIdentity("entity", `entity:${entity.name}`, entity.uuid);
            return ({
            id: identityKey(identity),
            identity,
            name: entity.name,
            kind: "entity" as const,
            properties: (entity.properties || []).map(property => {
                const propertyIdentity = createIdentity("property", `property:${entity.name}.${property.name}`, property.uuid);
                return ({
                id: identityKey(propertyIdentity),
                identity: propertyIdentity,
                name: property.name,
                type: property.type,
                collection: property.collection === true,
                computed: !!property.computation,
            });
            }),
        });
        }),
        ...controller.relations.map(relation => {
            const identity = createIdentity("relation", `relation:${relation.name}`, relation.uuid);
            return ({
            id: identityKey(identity),
            identity,
            name: relation.name!,
            kind: "relation" as const,
            properties: (relation.properties || []).map(property => {
                const propertyIdentity = createIdentity("property", `property:${relation.name}.${property.name}`, property.uuid);
                return ({
                id: identityKey(propertyIdentity),
                identity: propertyIdentity,
                name: property.name,
                type: property.type,
                collection: property.collection === true,
                computed: !!property.computation,
            });
            }),
        });
        }),
    ];
    const relations = controller.relations.map(relation => {
        const identity = createIdentity("relation", `relation:${relation.name}`, relation.uuid);
        return ({
        id: identityKey(identity),
        identity,
        name: relation.name!,
        source: relation.source.name!,
        target: relation.target.name!,
        sourceProperty: relation.sourceProperty,
        targetProperty: relation.targetProperty,
        type: relation.type,
    });
    });
    const dictionaries = controller.dict.map(dictionary => {
        const identity = createIdentity("dictionary", `dictionary:${dictionary.name}`, dictionary.uuid);
        return {
            id: identityKey(identity),
            identity,
            name: dictionary.name,
            type: dictionary.type,
            collection: dictionary.collection === true,
            computed: !!dictionary.computation,
        };
    });
    const computations = Array.from(controller.scheduler.computationsHandles.values())
        .map(computation => createComputationManifest(computation, options.includeFunctionText === true));
    assertUniqueIdentities([
        ...records.flatMap(record => [record.identity, ...record.properties.map(property => property.identity)]),
        ...dictionaries.map(dictionary => dictionary.identity),
        ...computations.map(computation => computation.identity),
    ]);
    const hashComputations = computations.map(computation => ({
        ...computation,
        functionSignature: computation.functionSignature ? {
            ...computation.functionSignature,
            text: undefined,
        } : undefined,
    }));
    const model = stripIdentityUUID({ records, relations, dictionaries, computations: hashComputations, storage: storageSchema });

    return {
        version: 2,
        frameworkVersion: "1",
        modelHash: hash(model),
        records,
        relations,
        dictionaries,
        computations,
        storage: storageSchema,
    };
}

export function getChangedComputations(oldManifest: MigrationManifest, newManifest: MigrationManifest) {
    const oldById = new Map(oldManifest.computations.map(item => [item.id, item]));
    return newManifest.computations.filter(item => {
        const oldItem = oldById.get(item.id);
        return !oldItem || oldItem.signature !== item.signature;
    });
}

function normalizeComputationOwnershipProof(computation: ComputationManifest, ownerComputationId: string): ComputationManifest["ownershipProof"] {
    if (!computation.ownershipProof) return undefined;
    return {
        ...computation.ownershipProof,
        ownerComputationId,
    };
}

function hasSameSemanticComputationShape(oldComputation: ComputationManifest, nextComputation: ComputationManifest) {
    const oldFunctionHash = oldComputation.functionSignature?.hash;
    const nextFunctionHash = nextComputation.functionSignature?.hash;
    const hasStableUuid = oldComputation.identity.uuid !== undefined &&
        oldComputation.identity.uuid === nextComputation.identity.uuid;
    const hasMatchingFunctionHash = oldFunctionHash !== undefined && oldFunctionHash === nextFunctionHash;
    if (!hasStableUuid && !hasMatchingFunctionHash) return false;
    if (oldFunctionHash !== nextFunctionHash) return false;
    return oldComputation.dataContext === nextComputation.dataContext &&
        oldComputation.outputRecord === nextComputation.outputRecord &&
        oldComputation.outputProperty === nextComputation.outputProperty &&
        oldComputation.asyncReturn === nextComputation.asyncReturn &&
        oldComputation.owner === nextComputation.owner &&
        isEqualValue(stripUndefinedDeep(oldComputation.deps), stripUndefinedDeep(nextComputation.deps)) &&
        isEqualValue(stripUndefinedDeep(oldComputation.eventDeps), stripUndefinedDeep(nextComputation.eventDeps)) &&
        isEqualValue(stripUndefinedDeep(oldComputation.stateKeys), stripUndefinedDeep(nextComputation.stateKeys)) &&
        isEqualValue(stripUndefinedDeep(oldComputation.boundStates), stripUndefinedDeep(nextComputation.boundStates)) &&
        oldComputation.functionSignature?.hasFunction === nextComputation.functionSignature?.hasFunction &&
        isEqualValue(oldComputation.functionSignature?.callbackPaths || [], nextComputation.functionSignature?.callbackPaths || []);
}

function normalizeLegacyComputationManifest(oldComputation: ComputationManifest, nextComputation: ComputationManifest): ComputationManifest {
    const stateSignature = oldComputation.stateSignature;
    const structuralSignature = nextComputation.structuralSignature;
    return {
        ...oldComputation,
        id: nextComputation.id,
        identity: {
            ...oldComputation.identity,
            key: nextComputation.id,
            namePath: nextComputation.id,
        },
        type: nextComputation.type,
        outputSignature: nextComputation.outputSignature,
        stateSignature,
        structuralSignature,
        signature: hash({ structuralSignature, stateSignature, functionHash: oldComputation.functionSignature?.hash }),
        ownershipProof: normalizeComputationOwnershipProof(oldComputation, nextComputation.id),
    };
}

export function normalizePreviousComputationManifest(previousManifest: MigrationManifest, nextManifest: MigrationManifest): MigrationManifest {
    const nextById = new Map(nextManifest.computations.map(item => [item.id, item]));
    const usedNextIds = new Set<string>();
    const normalizedComputations = previousManifest.computations.map(oldComputation => {
        const sameId = nextById.get(oldComputation.id);
        if (sameId) {
            usedNextIds.add(sameId.id);
            return oldComputation;
        }
        const semanticMatch = nextManifest.computations.find(nextComputation =>
            !usedNextIds.has(nextComputation.id) &&
            hasSameSemanticComputationShape(oldComputation, nextComputation)
        );
        if (!semanticMatch) return oldComputation;
        usedNextIds.add(semanticMatch.id);
        return normalizeLegacyComputationManifest(oldComputation, semanticMatch);
    });
    return {
        ...previousManifest,
        computations: normalizedComputations,
    };
}

function requirementKey(requirement: MigrationDecisionRequirement) {
    if (requirement.kind === "computation") return `${requirement.kind}:${requirement.id}`;
    const recordName = requirement.kind === "destructive-scope" ? requirement.recordName || "" : "";
    if (requirement.kind === "empty-fact-record-removal") return `${requirement.kind}:${requirement.recordName}`;
    return `${requirement.kind}:${requirement.dataContext}:${recordName}`;
}

function decisionKey(decision: MigrationDecision) {
    if (decision.kind === "computation") return `${decision.kind}:${decision.id}`;
    if (decision.kind === "rename-candidate-reviewed") return `${decision.kind}:${decision.from}:${decision.to}`;
    const recordName = decision.kind === "destructive-scope" ? decision.recordName || "" : "";
    if (decision.kind === "empty-fact-record-removal") return `${decision.kind}:${decision.recordName}`;
    return `${decision.kind}:${decision.dataContext}:${recordName}`;
}

function changeKey(change: MigrationChange) {
    if (change.kind === "computation") return `computation:${change.id}`;
    if (change.kind === "computation-takeover") return `computation-takeover:${change.dataContext}`;
    if (change.kind === "empty-fact-record-removal") return `empty-fact-record-removal:${change.recordName}`;
    if (change.kind === "dictionary") return `dictionary:${change.id}`;
    if (change.kind === "record") return `record:${change.id}`;
    if (change.kind === "property") return `property:${change.id}`;
    if (change.kind === "relation") return `relation:${change.id}`;
    return `storage:${change.dataContext}`;
}

function hasDecision(diff: MigrationDiffFile | undefined, predicate: (decision: MigrationDecision) => boolean) {
    return (diff?.decisions || []).some(predicate);
}

function getDecision(diff: MigrationDiffFile | undefined, predicate: (decision: MigrationDecision) => boolean) {
    return (diff?.decisions || []).find(predicate);
}

function handlerForDecision<THandler>(handlers: Record<string, THandler> | undefined, handlerRef: string | undefined) {
    return handlerRef ? handlers?.[handlerRef] : undefined;
}

function getEventRebuildHandler(options: MigrationOptions | undefined, dataContext: string) {
    const decision = getDecision(options?.approvedDiff, item => item.kind === "event-rebuild-handler" && item.dataContext === dataContext) as Extract<MigrationDecision, { kind: "event-rebuild-handler" }> | undefined;
    return handlerForDecision(options?.handlers?.eventRebuild, decision?.handlerRef);
}

function getAsyncCompletionHandler(options: MigrationOptions | undefined, dataContext: string) {
    const decision = getDecision(options?.approvedDiff, item => item.kind === "async-completion-handler" && item.dataContext === dataContext) as Extract<MigrationDecision, { kind: "async-completion-handler" }> | undefined;
    return handlerForDecision(options?.handlers?.asyncCompletion, decision?.handlerRef);
}

function computationDecision(diff: MigrationDiffFile, id: string) {
    return diff.decisions.find((decision): decision is Extract<MigrationDecision, { kind: "computation" }> =>
        decision.kind === "computation" && decision.id === id
    );
}

function takeoverDecision(diff: MigrationDiffFile | undefined, dataContext: string) {
    return diff?.decisions.find((decision): decision is Extract<MigrationDecision, { kind: "computation-takeover" }> =>
        decision.kind === "computation-takeover" && decision.dataContext === dataContext
    );
}

function isFactToComputationTakeover(previousManifest: MigrationManifest, nextManifest: MigrationManifest, computation: ComputationManifest) {
    const dataContext = computation.dataContext;
    if (dataContext.startsWith("property:")) {
        const match = dataContext.match(/^property:([^.]*)\.([^.]*)$/);
        if (!match) return false;
        const [, hostName, propertyName] = match;
        const oldRecord = previousManifest.records.find(record => record.name === hostName);
        const nextRecord = nextManifest.records.find(record => record.name === hostName);
        const oldProperty = oldRecord?.properties.find(property => property.name === propertyName);
        const nextProperty = nextRecord?.properties.find(property => property.name === propertyName);
        return oldProperty?.computed === false && nextProperty?.computed === true;
    }
    if (dataContext.startsWith("entity:") || dataContext.startsWith("relation:")) {
        const [targetType, recordName] = dataContext.split(":") as ["entity" | "relation", string];
        const oldRecord = previousManifest.records.find(record => record.kind === targetType && record.name === recordName);
        const nextRecord = nextManifest.records.find(record => record.kind === targetType && record.name === recordName);
        if (!oldRecord || !nextRecord) return false;
        const oldComputedOwner = previousManifest.computations.some(item => item.dataContext === dataContext);
        const nextComputedOwner = nextManifest.computations.some(item =>
            item.id === computation.id &&
            item.dataContext === dataContext &&
            item.ownershipProof?.kind === "computed-output"
        );
        return !oldComputedOwner && nextComputedOwner;
    }
    return false;
}

function takeoverTargetType(dataContext: string): "property" | "entity" | "relation" {
    if (dataContext.startsWith("property:")) return "property";
    if (dataContext.startsWith("entity:")) return "entity";
    return "relation";
}

type MigrationReadHandle = Pick<EntityQueryHandle, "find">;

function dbQuery(controller: Controller) {
    return (controller.system.storage as unknown as { db?: { query?: Function } }).db ||
        (controller.system as unknown as { db?: { query?: Function } }).db;
}

async function readStorageRecordCount(controller: Controller, tableName: string) {
    const db = dbQuery(controller);
    if (typeof db?.query !== "function") {
        throw new MigrationError(`Cannot verify empty fact record removal because database query is unavailable for table ${tableName}`);
    }
    const rows = await db.query(`SELECT COUNT(*) AS ${quoteIdentifier("count", getSchemaDialect(db as never))} FROM ${quoteIdentifier(tableName, getSchemaDialect(db as never))}`, []);
    const count = (rows[0] as { count?: number | string | bigint } | undefined)?.count ?? 0;
    return Number(count);
}

async function readOldStorageRecordCount(controller: Controller, previousManifest: MigrationManifest, recordName: string) {
    const oldRecord = previousManifest.storage.records.find(record => record.recordName === recordName);
    if (!oldRecord?.tableName) {
        throw new MigrationError(`Cannot find old storage record for empty fact record removal: ${recordName}`);
    }
    return readStorageRecordCount(controller, oldRecord.tableName);
}

function canReviewEmptyFactRecordRemoval(previousManifest: MigrationManifest, nextManifest: MigrationManifest, recordName: string) {
    const oldRecord = previousManifest.storage.records.find(record => record.recordName === recordName);
    if (!oldRecord?.tableName || oldRecord.isFiltered) return false;
    const oldTableRecords = previousManifest.storage.records.filter(record => record.tableName === oldRecord.tableName);
    const newTableRecords = nextManifest.storage.records.filter(record => record.tableName === oldRecord.tableName);
    return oldTableRecords.length === 1 && newTableRecords.length === 0;
}

function isRemovedFactRecordBlocking(change: StorageBlockingChange) {
    return change.kind === "unsupported-destructive-schema-change" &&
        change.reason === "fact record was removed from the new schema" &&
        change.oldPhysicalPath !== undefined;
}

export async function addEmptyFactRecordRemovalReview(
    controller: Controller,
    diff: MigrationDiffFile,
    previousManifest: MigrationManifest,
    nextManifest: MigrationManifest,
) {
    const removedEmptyFactRecordNames = new Set<string>();
    const changes = new Map(diff.changes.map(change => [changeKey(change), change]));
    const requirements = new Map(diff.requiredDecisions.map(requirement => [requirementKey(requirement), requirement]));

    for (const blockingChange of diff.safety.blockingChanges) {
        if (!isRemovedFactRecordBlocking(blockingChange)) continue;
        const recordName = blockingChange.logicalPath;
        if (nextManifest.storage.records.some(record => record.recordName === recordName)) continue;
        if (!canReviewEmptyFactRecordRemoval(previousManifest, nextManifest, recordName)) continue;
        const count = await readOldStorageRecordCount(controller, previousManifest, recordName);
        if (count !== 0) continue;
        const tableName = blockingChange.oldPhysicalPath!;
        removedEmptyFactRecordNames.add(recordName);
        const reason = "empty fact record was removed from the new schema and requires explicit approval before cleanup";
        changes.set(`empty-fact-record-removal:${recordName}`, {
            kind: "empty-fact-record-removal",
            id: `empty-fact-record-removal:${recordName}`,
            recordName,
            tableName,
            expectedCount: 0,
            reason,
        });
        requirements.set(`empty-fact-record-removal:${recordName}`, {
            kind: "empty-fact-record-removal",
            recordName,
            tableName,
            expectedCount: 0,
            reason,
        });
    }

    if (!removedEmptyFactRecordNames.size) return diff;

    diff.changes = Array.from(changes.values());
    diff.requiredDecisions = Array.from(requirements.values());
    diff.safety = {
        ...diff.safety,
        blockingChanges: diff.safety.blockingChanges.filter(change => !removedEmptyFactRecordNames.has(change.logicalPath)),
    };
    diff.summary = {
        ...diff.summary,
        changeCount: diff.changes.length,
        requiredDecisionCount: diff.requiredDecisions.length,
        blockingChangeCount: diff.safety.blockingChanges.length,
    };
    return diff;
}

export async function getApprovedEmptyFactRecordRemovals(controller: Controller, approvedDiff: MigrationDiffFile | undefined, previousManifest: MigrationManifest) {
    const removals = (approvedDiff?.decisions || [])
        .filter((decision): decision is Extract<MigrationDecision, { kind: "empty-fact-record-removal" }> => decision.kind === "empty-fact-record-removal");
    const approved = new Set<string>();
    for (const removal of removals) {
        if (removal.expectedCount !== 0) {
            throw new MigrationError(`Invalid empty fact record removal expectedCount for ${removal.recordName}`);
        }
        const oldRecord = previousManifest.storage.records.find(record => record.recordName === removal.recordName);
        if (!oldRecord || oldRecord.tableName !== removal.tableName) {
            throw new MigrationError(`Empty fact record removal decision does not match previous manifest: ${removal.recordName}`);
        }
        const count = await readStorageRecordCount(controller, oldRecord.tableName);
        if (count !== 0) {
            throw new DestructiveComputedOutputError(`Empty fact record removal count mismatch for ${removal.recordName}`);
        }
        approved.add(removal.recordName);
    }
    return approved;
}

export async function assertApprovedEmptyFactRecordRemovalsStillEmpty(controller: Controller, approvedDiff: MigrationDiffFile | undefined, previousManifest: MigrationManifest) {
    await getApprovedEmptyFactRecordRemovals(controller, approvedDiff, previousManifest);
}

export function createEmptyFactRecordRemovalOperations(previousManifest: MigrationManifest, recordNames: Set<string>): DestructiveCleanupOperation[] {
    return previousManifest.storage.records
        .filter(record => recordNames.has(record.recordName))
        .map(record => ({
            kind: "drop-empty-fact-table" as const,
            tableName: record.tableName,
            logicalPath: record.recordName,
            description: `migration drop empty fact table ${record.tableName}`,
            precondition: {
                kind: "empty-table" as const,
                recordName: record.recordName,
                expectedCount: 0 as const,
            },
        }));
}

export function createMigrationReadHandle(controller: Controller, schemaPlan: MigrationSchemaPlan): MigrationReadHandle | undefined {
    const dbSetup = (schemaPlan.internal as { dbSetup?: { map: ConstructorParameters<typeof EntityToTableMap>[0]; aliasManager?: ConstructorParameters<typeof EntityToTableMap>[1] } } | undefined)?.dbSetup;
    if (!dbSetup) return undefined;
    const db = (controller.system.storage as unknown as { db?: ConstructorParameters<typeof EntityQueryHandle>[1] }).db ||
        (controller.system as unknown as { db?: ConstructorParameters<typeof EntityQueryHandle>[1] }).db;
    if (!db) return undefined;
    return new EntityQueryHandle(new EntityToTableMap(dbSetup.map, dbSetup.aliasManager), db);
}

async function readManifestRecords(controller: Controller, manifest: MigrationManifest | undefined, recordName: string, attributes: string[], readHandle?: MigrationReadHandle) {
    if (readHandle) {
        return readHandle.find(recordName, undefined, undefined, attributes);
    }
    if ((controller.system.storage as unknown as { queryHandle?: unknown }).queryHandle) {
        return controller.system.storage.find(recordName, undefined, undefined, attributes);
    }
    if (manifest?.storage.records.some(item => item.recordName === recordName)) {
        throw new MigrationError(`Cannot read migration takeover scope for ${recordName} before storage query handle is initialized`);
    }
    return [];
}

async function readTakeoverScope(controller: Controller, dataContext: string, manifest?: MigrationManifest, readHandle?: MigrationReadHandle) {
    if (dataContext.startsWith("property:")) {
        const match = dataContext.match(/^property:([^.]*)\.([^.]*)$/);
        if (!match) throw new MigrationError(`Invalid property data context for computation takeover: ${dataContext}`);
        const [, hostName, propertyName] = match;
        const records = await readManifestRecords(controller, manifest, hostName, ["id", propertyName], readHandle);
        return {
            expectedExistingCount: records.filter(record => record[propertyName] !== undefined && record[propertyName] !== null).length,
            expectedHostCount: records.length,
        };
    }
    const [, recordName] = dataContext.split(":");
    const records = await readManifestRecords(controller, manifest, recordName, ["id"], readHandle);
    return {
        expectedExistingCount: records.length,
        ids: records.map(record => String(record.id)).sort(),
    };
}

export async function addComputationTakeoverReview(
    controller: Controller,
    diff: MigrationDiffFile,
    previousManifest: MigrationManifest,
    nextManifest: MigrationManifest,
    readHandle?: MigrationReadHandle,
) {
    const changes = new Map(diff.changes.map(change => [changeKey(change), change]));
    const requirements = new Map(diff.requiredDecisions.map(requirement => [requirementKey(requirement), requirement]));
    const destructiveScopes = new Map(diff.safety.destructiveScopes.map(scope => [`${scope.dataContext}:${scope.recordName || ""}`, scope]));

    for (const computation of nextManifest.computations) {
        if (!isFactToComputationTakeover(previousManifest, nextManifest, computation)) continue;
        const targetType = takeoverTargetType(computation.dataContext);
        const scope = await readTakeoverScope(controller, computation.dataContext, previousManifest, readHandle);
        const requirement: Extract<MigrationDecisionRequirement, { kind: "computation-takeover" }> = {
            kind: "computation-takeover",
            dataContext: computation.dataContext,
            computationId: computation.id,
            targetType,
            previousAuthority: "fact",
            nextAuthority: "computation",
            oldDataStrategy: "discard-and-rebuild",
            expectedExistingCount: scope.expectedExistingCount,
            expectedHostCount: scope.expectedHostCount,
            destructiveScopeRef: targetType === "property" ? undefined : `${computation.dataContext}:${computation.outputRecord || computation.dataContext.split(":")[1]}`,
            reason: `${computation.dataContext} changes from fact authority to computation authority and existing output must be discarded before rebuild`,
        };
        changes.set(`computation-takeover:${computation.dataContext}`, {
            kind: "computation-takeover",
            id: `computation-takeover:${computation.dataContext}`,
            dataContext: computation.dataContext,
            computationId: computation.id,
            targetType,
            previousAuthority: "fact",
            nextAuthority: "computation",
            expectedExistingCount: scope.expectedExistingCount,
            expectedHostCount: scope.expectedHostCount,
            reason: requirement.reason,
        });
        requirements.set(requirementKey(requirement), requirement);
        if (targetType !== "property") {
            const recordName = computation.outputRecord || computation.dataContext.split(":")[1];
            const key = `${computation.dataContext}:${recordName}`;
            if (!destructiveScopes.has(key)) {
                const destructiveScope = {
                    dataContext: computation.dataContext,
                    recordName,
                    ids: scope.ids || [],
                    count: scope.expectedExistingCount,
                    reason: "fact output records will be discarded during computation takeover",
                };
                destructiveScopes.set(key, destructiveScope);
                requirements.set(requirementKey({ kind: "destructive-scope", ...destructiveScope }), {
                    kind: "destructive-scope",
                    dataContext: destructiveScope.dataContext,
                    recordName: destructiveScope.recordName,
                    ids: destructiveScope.ids,
                    reason: destructiveScope.reason,
                });
            }
        }
    }

    diff.changes = Array.from(changes.values());
    diff.requiredDecisions = Array.from(requirements.values());
    diff.safety = {
        ...diff.safety,
        destructiveScopes: Array.from(destructiveScopes.values()),
    };
    diff.summary = {
        ...diff.summary,
        changeCount: diff.changes.length,
        requiredDecisionCount: diff.requiredDecisions.length,
        computationTakeovers: diff.requiredDecisions
            .filter((requirement): requirement is Extract<MigrationDecisionRequirement, { kind: "computation-takeover" }> => requirement.kind === "computation-takeover")
            .map(requirement => ({
                dataContext: requirement.dataContext,
                computationId: requirement.computationId,
                targetType: requirement.targetType,
                expectedExistingCount: requirement.expectedExistingCount,
                expectedHostCount: requirement.expectedHostCount,
            })),
    };
    return diff;
}

export function buildMigrationDiff(
    previousManifest: MigrationManifest,
    nextManifest: MigrationManifest,
    schemaPlan: MigrationSchemaPlan,
    safety: MigrationSafetyReview,
): MigrationDiffFile {
    const changes: MigrationChange[] = [];
    const requiredDecisions: MigrationDecisionRequirement[] = [];
    const oldById = new Map(previousManifest.computations.map(item => [item.id, item]));
    const newById = new Map(nextManifest.computations.map(item => [item.id, item]));
    const oldRecords = new Map(previousManifest.records.map(item => [item.id, item]));
    const newRecords = new Map(nextManifest.records.map(item => [item.id, item]));
    const oldRelations = new Map(previousManifest.relations.map(item => [item.id, item]));
    const newRelations = new Map(nextManifest.relations.map(item => [item.id, item]));
    const oldDictionaries = new Map((previousManifest.dictionaries || []).map(item => [item.id, item]));
    const newDictionaries = new Map((nextManifest.dictionaries || []).map(item => [item.id, item]));

    for (const oldRecord of previousManifest.records) {
        if (!newRecords.has(oldRecord.id)) {
            changes.push({
                kind: "record",
                id: oldRecord.id,
                changeType: "removed",
                dataContext: `${oldRecord.kind}:${oldRecord.name}`,
                reason: `${oldRecord.kind} no longer exists in the new model`,
            });
        }
    }

    for (const record of nextManifest.records) {
        const old = oldRecords.get(record.id);
        if (!old) {
            changes.push({
                kind: "record",
                id: record.id,
                changeType: "added",
                dataContext: `${record.kind}:${record.name}`,
                reason: `${record.kind} was added`,
            });
        } else if (old.kind !== record.kind || old.name !== record.name) {
            changes.push({
                kind: "record",
                id: record.id,
                changeType: "changed",
                dataContext: `${record.kind}:${record.name}`,
                reason: "record kind or name changed",
            });
        }

        const oldProperties = new Map((old?.properties || []).map(property => [property.id, property]));
        const newProperties = new Map(record.properties.map(property => [property.id, property]));
        for (const oldProperty of old?.properties || []) {
            if (!newProperties.has(oldProperty.id)) {
                changes.push({
                    kind: "property",
                    id: oldProperty.id,
                    changeType: "removed",
                    dataContext: `property:${old?.name}.${oldProperty.name}`,
                    reason: "property no longer exists in the new model",
                });
            }
        }
        for (const property of record.properties) {
            const oldProperty = oldProperties.get(property.id);
            if (!oldProperty) {
                changes.push({
                    kind: "property",
                    id: property.id,
                    changeType: "added",
                    dataContext: `property:${record.name}.${property.name}`,
                    reason: "property was added",
                });
            } else if (
                oldProperty.name !== property.name ||
                oldProperty.type !== property.type ||
                oldProperty.collection !== property.collection ||
                oldProperty.computed !== property.computed
            ) {
                changes.push({
                    kind: "property",
                    id: property.id,
                    changeType: "changed",
                    dataContext: `property:${record.name}.${property.name}`,
                    reason: "property name, type, collection, or computed flag changed",
                });
            }
        }
    }

    for (const oldRelation of previousManifest.relations) {
        if (!newRelations.has(oldRelation.id)) {
            changes.push({
                kind: "relation",
                id: oldRelation.id,
                changeType: "removed",
                dataContext: `relation:${oldRelation.name}`,
                reason: "relation no longer exists in the new model",
            });
        }
    }

    for (const relation of nextManifest.relations) {
        const old = oldRelations.get(relation.id);
        if (!old) {
            changes.push({
                kind: "relation",
                id: relation.id,
                changeType: "added",
                dataContext: `relation:${relation.name}`,
                reason: "relation was added",
            });
        } else if (
            old.name !== relation.name ||
            old.source !== relation.source ||
            old.target !== relation.target ||
            old.sourceProperty !== relation.sourceProperty ||
            old.targetProperty !== relation.targetProperty ||
            old.type !== relation.type
        ) {
            changes.push({
                kind: "relation",
                id: relation.id,
                changeType: "changed",
                dataContext: `relation:${relation.name}`,
                reason: "relation endpoints, properties, or type changed",
            });
        }
    }

    for (const oldDictionary of previousManifest.dictionaries || []) {
        if (!newDictionaries.has(oldDictionary.id)) {
            changes.push({
                kind: "dictionary",
                id: oldDictionary.id,
                changeType: "removed",
                dataContext: `global:${oldDictionary.name}`,
                reason: "dictionary no longer exists in the new model",
            });
        }
    }

    for (const dictionary of nextManifest.dictionaries || []) {
        const old = oldDictionaries.get(dictionary.id);
        let changeType: Extract<MigrationChange, { kind: "dictionary" }>["changeType"] = "unchanged";
        let reason = "dictionary is unchanged";
        if (!old) {
            changeType = "added";
            reason = "dictionary was added";
        } else if (old.type !== dictionary.type || old.collection !== dictionary.collection || old.computed !== dictionary.computed) {
            changeType = "changed";
            reason = "dictionary type, collection, or computed flag changed";
        }
        if (changeType !== "unchanged") {
            changes.push({
                kind: "dictionary",
                id: dictionary.id,
                changeType,
                dataContext: `global:${dictionary.name}`,
                reason,
            });
        }
    }

    for (const oldComputation of previousManifest.computations) {
        if (!newById.has(oldComputation.id)) {
            changes.push({
                kind: "computation",
                id: oldComputation.id,
                dataContext: oldComputation.dataContext,
                computationType: oldComputation.type,
                changeType: "removed",
                detected: {},
                recommendation: "ignore",
                reason: "computation no longer exists in the new model",
            });
        }
    }

    for (const computation of nextManifest.computations) {
        const old = oldById.get(computation.id);
        const detected = {
            dataDepsChanged: old ? !isEqualValue(old.deps, computation.deps) : true,
            eventDepsChanged: old ? !isEqualValue(old.eventDeps, computation.eventDeps) : true,
            outputSignatureChanged: old ? old.outputSignature !== computation.outputSignature : true,
            stateSignatureChanged: old ? old.stateSignature !== computation.stateSignature : true,
            functionTextChanged: old ? old.functionSignature?.hash !== computation.functionSignature?.hash : computation.functionSignature?.hasFunction === true,
            functionHash: computation.functionSignature?.hash,
            previousFunctionHash: old?.functionSignature?.hash,
            hasFunction: computation.functionSignature?.hasFunction === true,
            hasClosureRisk: computation.functionSignature?.hasFunction === true,
            needsEventRebuildHandler: computation.eventDeps.length > 0,
            needsAsyncCompletionHandler: computation.asyncReturn,
        };
        let changeType: Extract<MigrationChange, { kind: "computation" }>["changeType"] = "unchanged";
        let recommendation: Extract<MigrationChange, { kind: "computation" }>["recommendation"] = "ignore";
        let recommendedDecision: Extract<MigrationDecisionRequirement, { kind: "computation" }>["recommendedDecision"] = "unchanged";
        let reason = "computation is structurally unchanged";

        if (!old) {
            changeType = "added";
            recommendation = "rebuild";
            recommendedDecision = "changed";
            reason = "new computation requires approved rebuild";
        } else if (old.structuralSignature !== computation.structuralSignature) {
            changeType = "changed";
            recommendation = "needs-review";
            recommendedDecision = "changed";
            reason = "computation structure changed";
        } else if (old.stateSignature !== computation.stateSignature && old.outputSignature === computation.outputSignature) {
            changeType = "state-only";
            recommendation = "needs-review";
            recommendedDecision = "state-only";
            reason = "computation state changed without output structure changes";
        } else if (old.functionSignature?.hash !== computation.functionSignature?.hash) {
            changeType = "possibly-changed";
            recommendation = "needs-review";
            recommendedDecision = "changed";
            reason = "function text changed and requires human semantic review";
        } else if (computation.functionSignature?.hasFunction) {
            recommendation = "needs-review";
            reason = "function callback has closure risk and requires human review";
        }

        changes.push({
            kind: "computation",
            id: computation.id,
            dataContext: computation.dataContext,
            computationType: computation.type,
            changeType,
            detected,
            recommendation,
            reason,
        });

        if (recommendation !== "ignore") {
            requiredDecisions.push({
                kind: "computation",
                id: computation.id,
                dataContext: computation.dataContext,
                recommendedDecision,
                reason,
            });
        }
        if (detected.needsEventRebuildHandler) {
            requiredDecisions.push({
                kind: "event-rebuild-handler",
                dataContext: computation.dataContext,
                reason: "event-based computation needs an external migration rebuild handler",
            });
        }
        if (detected.needsAsyncCompletionHandler) {
            requiredDecisions.push({
                kind: "async-completion-handler",
                dataContext: computation.dataContext,
                reason: "async computation needs an external migration completion handler",
            });
        }
    }

    for (const operation of schemaPlan.preRecomputeDDL) {
        changes.push({
            kind: "storage",
            id: operation.logicalPath || operation.description,
            changeType: "added",
            dataContext: operation.logicalPath || operation.tableName || operation.description,
            reason: operation.description,
        });
    }
    for (const change of safety.blockingChanges) {
        changes.push({
            kind: "storage",
            id: change.logicalPath,
            changeType: "blocked",
            dataContext: change.logicalPath,
            reason: change.reason,
        });
    }
    for (const scope of safety.destructiveScopes) {
        requiredDecisions.push({
            kind: "destructive-scope",
            dataContext: scope.dataContext,
            recordName: scope.recordName,
            ids: scope.ids || [],
            reason: scope.reason,
        });
    }

    const uniqueRequirements = Array.from(new Map(requiredDecisions.map(item => [requirementKey(item), item])).values());
    return {
        kind: "interaqt-migration-diff",
        version: 2,
        status: "generated",
        fromModelHash: previousManifest.modelHash,
        toModelHash: nextManifest.modelHash,
        generatedAt: new Date().toISOString(),
        generatorVersion: "phase-1.5",
        summary: {
            changeCount: changes.length,
            requiredDecisionCount: uniqueRequirements.length,
            blockingChangeCount: safety.blockingChanges.length,
        },
        changes,
        requiredDecisions: uniqueRequirements,
        decisions: [],
        safety,
    };
}

export function addMissingRebuildHandlerRequirements(diff: MigrationDiffFile, controller: Controller, rebuildPlan: ComputationRebuildItem[]) {
    const handles = computationById(controller);
    const requirements = new Map(diff.requiredDecisions.map(requirement => [requirementKey(requirement), requirement]));
    for (const item of rebuildPlan) {
        if (!item.rebuildOutput) continue;
        const computation = handles.get(item.computationId);
        if (!computation || typeof (computation as DataBasedComputation).compute === "function") continue;
        const requirement: MigrationDecisionRequirement = {
            kind: "event-rebuild-handler",
            dataContext: item.dataContext,
            reason: "computation without full compute support needs an external migration rebuild handler",
        };
        requirements.set(requirementKey(requirement), requirement);
    }
    diff.requiredDecisions = Array.from(requirements.values());
    diff.summary = {
        ...diff.summary,
        requiredDecisionCount: diff.requiredDecisions.length,
    };
    return diff;
}

export function validateApprovedDiff(
    approvedDiff: MigrationDiffFile | undefined,
    previousManifest: MigrationManifest,
    nextManifest: MigrationManifest,
    handlers: MigrationHandlers | undefined,
    expectedDiff?: MigrationDiffFile,
) {
    if (!approvedDiff) {
        throw new MigrationError("Migration requires an approved diff. Call controller.generateMigrationDiff(), review it, set status to 'approved', then pass it as migrate({ approvedDiff }).");
    }
    if (approvedDiff.kind !== "interaqt-migration-diff" || approvedDiff.version !== 2) {
        throw new MigrationError("Invalid migration approvedDiff kind or version");
    }
    if (approvedDiff.status !== "approved") {
        throw new MigrationError("Migration approvedDiff must have status 'approved'");
    }
    if (approvedDiff.fromModelHash !== previousManifest.modelHash || approvedDiff.toModelHash !== nextManifest.modelHash) {
        throw new MigrationError("Migration approvedDiff is stale: model hash does not match current database and code");
    }
    const expectedReview = expectedDiff || approvedDiff;
    const approvedRequirementKeys = new Set(approvedDiff.requiredDecisions.map(requirementKey));
    const requirementKeys = new Set([
        ...expectedReview.requiredDecisions.map(requirementKey),
        ...approvedRequirementKeys,
    ]);
    const changeKeys = new Set(expectedReview.changes.map(changeKey));
    const decisionKeys = new Set<string>();
    for (const decision of approvedDiff.decisions) {
        const key = decisionKey(decision);
        if (decisionKeys.has(key)) {
            throw new MigrationError(`Duplicate migration decision: ${key}`);
        }
        decisionKeys.add(key);
        if (decision.kind === "computation" && !changeKeys.has(`computation:${decision.id}`)) {
            throw new MigrationError(`Migration decision references a computation that is not present in the approved diff: ${decision.id}`);
        }
        if (decision.kind === "computation-takeover") {
            if (!requirementKeys.has(key)) {
                throw new MigrationError(`Migration computation takeover decision does not match a required review item: ${decision.dataContext}`);
            }
            if (decision.oldDataStrategy !== "discard-and-rebuild" || decision.previousAuthority !== "fact" || decision.nextAuthority !== "computation") {
                throw new MigrationError(`Invalid computation takeover decision for ${decision.dataContext}`);
            }
            if (!Number.isInteger(decision.expectedExistingCount) || decision.expectedExistingCount < 0) {
                throw new MigrationError(`Invalid computation takeover expectedExistingCount for ${decision.dataContext}`);
            }
            if (decision.expectedHostCount !== undefined && (!Number.isInteger(decision.expectedHostCount) || decision.expectedHostCount < 0)) {
                throw new MigrationError(`Invalid computation takeover expectedHostCount for ${decision.dataContext}`);
            }
            const computation = nextManifest.computations.find(item => item.id === decision.computationId);
            if (!computation || computation.dataContext !== decision.dataContext) {
                throw new MigrationError(`Migration computation takeover references unknown output computation: ${decision.computationId}`);
            }
            if (takeoverTargetType(decision.dataContext) !== decision.targetType) {
                throw new MigrationError(`Migration computation takeover target type does not match data context: ${decision.dataContext}`);
            }
            if (!isFactToComputationTakeover(previousManifest, nextManifest, computation)) {
                throw new MigrationError(`Migration computation takeover can only discard previous fact output: ${decision.dataContext}`);
            }
            const computationReview = approvedDiff.decisions.find(item =>
                item.kind === "computation" &&
                item.id === decision.computationId &&
                item.decision === "changed"
            );
            if (!computationReview) {
                throw new MigrationError(`Migration computation takeover requires an approved changed computation decision: ${decision.computationId}`);
            }
            if (decision.targetType !== "property") {
                const recordName = computation.outputRecord || decision.dataContext.split(":")[1];
                const destructiveReview = approvedDiff.decisions.find(item =>
                    item.kind === "destructive-scope" &&
                    item.dataContext === decision.dataContext &&
                    item.recordName === recordName
                );
                if (!destructiveReview) {
                    throw new MigrationError(`Migration computation takeover requires an approved destructive-scope decision: ${decision.dataContext}`);
                }
            }
            if (decision.targetType === "property" && computation.type.includes("StateMachine") && computation.boundStates.length > 0) {
                throw new MigrationError(`StateMachine computation takeover requires a state rebuild handler, which is not supported in this migration phase: ${decision.dataContext}`);
            }
        }
        if (decision.kind === "event-rebuild-handler") {
            if (!requirementKeys.has(key)) {
                throw new MigrationError(`Migration event rebuild decision does not match a required review item: ${decision.dataContext}`);
            }
            if (!handlers?.eventRebuild?.[decision.handlerRef]) {
                throw new MigrationError(`Missing migration event rebuild handler '${decision.handlerRef}' for ${decision.dataContext}`);
            }
        }
        if (decision.kind === "async-completion-handler") {
            if (!requirementKeys.has(key)) {
                throw new MigrationError(`Migration async completion decision does not match a required review item: ${decision.dataContext}`);
            }
            if (!handlers?.asyncCompletion?.[decision.handlerRef]) {
                throw new MigrationError(`Missing migration async completion handler '${decision.handlerRef}' for ${decision.dataContext}`);
            }
        }
        if (decision.kind === "empty-fact-record-removal") {
            if (!requirementKeys.has(key)) {
                throw new MigrationError(`Migration empty fact record removal decision does not match a required review item: ${decision.recordName}`);
            }
            const previousRecord = previousManifest.storage.records.find(record => record.recordName === decision.recordName);
            const nextRecord = nextManifest.storage.records.find(record => record.recordName === decision.recordName);
            if (!previousRecord || nextRecord || previousRecord.tableName !== decision.tableName || decision.expectedCount !== 0 || !canReviewEmptyFactRecordRemoval(previousManifest, nextManifest, decision.recordName)) {
                throw new MigrationError(`Invalid empty fact record removal decision for ${decision.recordName}`);
            }
        }
        if (decision.kind === "rename-candidate-reviewed") {
            throw new MigrationError(`Migration rename candidate decision does not match any Phase 1.5 executable review item: ${decision.from} -> ${decision.to}`);
        }
    }
    for (const requirement of expectedReview.requiredDecisions) {
        if (!decisionKeys.has(requirementKey(requirement))) {
            throw new MigrationError(`Missing migration decision for required review item: ${requirementKey(requirement)}`);
        }
    }
    const validComputationIds = new Set(nextManifest.computations.map(item => item.id));
    for (const decision of approvedDiff.decisions) {
        if (decision.kind === "computation" && !validComputationIds.has(decision.id)) {
            throw new MigrationError(`Migration decision references unknown computation: ${decision.id}`);
        }
    }
}

export function getChangedComputationsFromApprovedDiff(previousManifest: MigrationManifest, nextManifest: MigrationManifest, approvedDiff: MigrationDiffFile) {
    const changedComputations: ComputationManifest[] = [];
    const outputChangedIds = new Set<string>();
    const stateOnlyIds = new Set<string>();
    const newById = new Map(nextManifest.computations.map(item => [item.id, item]));
    for (const decision of approvedDiff.decisions) {
        if (decision.kind !== "computation") continue;
        const computation = newById.get(decision.id);
        if (!computation) continue;
        if (decision.decision === "unrebuildable") {
            continue;
        }
        if (decision.decision === "changed" || decision.decision === "state-only") {
            changedComputations.push(computation);
        }
        if (decision.decision === "changed") {
            outputChangedIds.add(decision.id);
        }
        if (decision.decision === "state-only") {
            stateOnlyIds.add(decision.id);
        }
    }
    for (const computation of nextManifest.computations) {
        if (!previousManifest.computations.some(item => item.id === computation.id) && !changedComputations.some(item => item.id === computation.id)) {
            throw new MigrationError(`New computation requires approved changed decision: ${computation.id}`);
        }
    }
    const blocking = approvedDiff.decisions
        .filter((decision): decision is Extract<MigrationDecision, { kind: "computation" }> => decision.kind === "computation" && decision.decision === "unrebuildable")
        .map(decision => ({ kind: "unrebuildable-computation" as const, logicalPath: decision.dataContext, reason: decision.reason }));
    return { changedComputations, outputChangedIds, stateOnlyIds, blocking };
}

function computationById(controller: Controller) {
    return new Map(Array.from(controller.scheduler.computationsHandles.values()).map(computation => [computationManifestId(computation), computation]));
}

function outputNode(computation: ComputationManifest) {
    return computation.dataContext;
}

function relationForAttribute(manifest: MigrationManifest, hostName: string, attributeName: string) {
    return manifest.relations.find(relation =>
        (relation.source === hostName && relation.sourceProperty === attributeName) ||
        (relation.target === hostName && relation.targetProperty === attributeName)
    );
}

function relationDepNodes(manifest: MigrationManifest, hostName: string, attributes: unknown[]): string[] {
    return attributes.flatMap(attribute => {
        if (!Array.isArray(attribute) || typeof attribute[0] !== "string") return [];
        const relation = relationForAttribute(manifest, hostName, attribute[0]);
        if (!relation) return [];
        const relatedRecordName = relation.source === hostName ? relation.target : relation.source;
        const subQuery = attribute[1] as { attributeQuery?: unknown };
        const subAttributes = Array.isArray(subQuery?.attributeQuery) ? subQuery.attributeQuery : [];
        const nestedNodes = subAttributes.flatMap(subAttribute => {
            if (typeof subAttribute === "string" && subAttribute !== "*" && subAttribute !== LINK_SYMBOL) {
                return [`property:${relatedRecordName}.${subAttribute}`];
            }
            if (Array.isArray(subAttribute) && subAttribute[0] === LINK_SYMBOL) {
                return [`relation:${relation.name}`];
            }
            if (Array.isArray(subAttribute)) {
                return relationDepNodes(manifest, relatedRecordName, [subAttribute]);
            }
            return [];
        });
        return [`relation:${relation.name}`, ...nestedNodes];
    });
}

function depNodes(dep: { type: string; source?: string; attributeQuery?: unknown }, computation: ComputationManifest, manifest: MigrationManifest) {
    if (dep.type === "global" && dep.source) return [`global:${dep.source}`];
    if (dep.type === "records" && dep.source) return [`entity:${dep.source}`];
    if (dep.type === "property") {
        const match = computation.dataContext.match(/^property:([^.]*)\./);
        if (!match) return [];
        const hostName = match[1];
        const attributes = Array.isArray(dep.attributeQuery) ? dep.attributeQuery : [];
        const relationNodes = relationDepNodes(manifest, hostName, attributes);
        const propertyNodes = attributes
            .filter((item): item is string => typeof item === "string" && item !== "*")
            .map(attribute => `property:${hostName}.${attribute}`);
        const nodes = [...propertyNodes, ...relationNodes];
        return nodes.length ? nodes : [`entity:${hostName}`];
    }
    return [];
}

function eventDepNodes(eventDep: { recordName: string; type: string }, manifest: MigrationManifest) {
    const nodes = [`entity:${eventDep.recordName}`];
    if (eventDep.type === "update") {
        const record = manifest.records.find(item => item.name === eventDep.recordName);
        nodes.push(...(record?.properties || []).map(property => `property:${eventDep.recordName}.${property.name}`));
    }
    return nodes;
}

export function buildAffectedRebuildPlan(
    oldManifest: MigrationManifest,
    newManifest: MigrationManifest,
    changedComputations: ComputationManifest[],
    changedDataContexts: string[] = [],
    options: { outputChangedIds?: Set<string>; stateOnlyIds?: Set<string> } = {},
): ComputationRebuildItem[] {
    const byOutput = new Map(newManifest.computations.map(item => [outputNode(item), item]));
    const oldById = new Map(oldManifest.computations.map(item => [item.id, item]));
    const dependents = new Map<string, Set<string>>();
    for (const computation of newManifest.computations) {
        for (const dep of computation.deps) {
            for (const node of depNodes(dep, computation, newManifest)) {
                if (!dependents.has(node)) dependents.set(node, new Set());
                dependents.get(node)!.add(computation.id);
            }
        }
        for (const eventDep of computation.eventDeps) {
            for (const node of eventDepNodes(eventDep, newManifest)) {
                if (node === computation.dataContext) continue;
                if (!dependents.has(node)) dependents.set(node, new Set());
                dependents.get(node)!.add(computation.id);
            }
        }
    }

    const affected = new Set(changedComputations.map(item => item.id));
    const outputChangedNodes = changedComputations
        .filter(item => {
            const old = oldById.get(item.id);
            return options.outputChangedIds?.has(item.id) || !old || old.outputSignature !== item.outputSignature;
        })
        .map(item => outputNode(item));
    const queue = [...outputChangedNodes, ...changedDataContexts];
    while (queue.length) {
        const node = queue.shift()!;
        for (const dependentId of dependents.get(node) || []) {
            if (affected.has(dependentId)) continue;
            affected.add(dependentId);
            const dependent = newManifest.computations.find(item => item.id === dependentId);
            if (dependent) queue.push(outputNode(dependent));
        }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: string[] = [];
    const visit = (id: string) => {
        if (visited.has(id)) return;
        if (visiting.has(id)) {
            throw new UnrebuildableComputationError(`Migration detected a derived computation cycle at ${id}`);
        }
        visiting.add(id);
        const computation = newManifest.computations.find(item => item.id === id);
        if (computation) {
            for (const dep of computation.deps) {
                for (const upstream of depNodes(dep, computation, newManifest)) {
                    const upstreamComputation = byOutput.get(upstream);
                    if (upstreamComputation && affected.has(upstreamComputation.id)) visit(upstreamComputation.id);
                }
            }
            for (const eventDep of computation.eventDeps) {
                for (const upstream of eventDepNodes(eventDep, newManifest)) {
                    if (upstream === computation.dataContext) continue;
                    const upstreamComputation = byOutput.get(upstream);
                    if (upstreamComputation && affected.has(upstreamComputation.id)) visit(upstreamComputation.id);
                }
            }
        }
        visiting.delete(id);
        visited.add(id);
        ordered.push(id);
    };
    affected.forEach(visit);

    return ordered.map(id => {
        const computation = newManifest.computations.find(item => item.id === id)!;
        const old = oldById.get(id);
        const stateOnly = options.stateOnlyIds?.has(id) === true;
        const outputChanged = options.outputChangedIds?.has(id) || !old || old.outputSignature !== computation.outputSignature;
        const stateChanged = !old || old.stateSignature !== computation.stateSignature;
        const seed = changedComputations.some(item => item.id === id);
        return {
            computationId: id,
            dataContext: computation.dataContext,
            rebuildState: (stateOnly || stateChanged) && computation.boundStates.length > 0,
            rebuildOutput: stateOnly ? false : outputChanged || !seed,
            propagateOutputEvents: stateOnly ? false : outputChanged || !seed,
            isSeed: seed,
        };
    });
}

function physicalPath(tableName?: string, fieldName?: string) {
    return `${tableName || "?"}.${fieldName || "?"}`;
}

export function getStorageBlockingChanges(oldManifest: MigrationManifest, newManifest: MigrationManifest) {
    const blocking: StorageBlockingChange[] = [];
    const oldRecords = new Map(oldManifest.storage.records.map(record => [record.recordName, record]));
    const newRecords = new Map(newManifest.storage.records.map(record => [record.recordName, record]));
    const oldLogicalRecords = new Map(oldManifest.records.map(record => [record.name, record]));
    const newLogicalRecords = new Map(newManifest.records.map(record => [record.name, record]));
    const isAsyncTaskRecord = (recordName: string) => recordName.startsWith("_ASYNC_TASK__");
    const isComputedOutputRecord = (recordName: string) =>
        oldManifest.computations.some(computation => computation.outputRecord === recordName);
    for (const oldRecord of oldManifest.storage.records) {
        if (!newRecords.has(oldRecord.recordName) && !oldRecord.isFiltered) {
            const reason = isAsyncTaskRecord(oldRecord.recordName)
                ? "framework-generated async task record cleanup is not supported by compute-route schema migration"
                : isComputedOutputRecord(oldRecord.recordName)
                    ? "computed output record physical cleanup is not supported by compute-route schema migration"
                    : "fact record was removed from the new schema";
            blocking.push({
                kind: "unsupported-destructive-schema-change",
                logicalPath: oldRecord.recordName,
                oldPhysicalPath: oldRecord.tableName,
                reason,
            });
        }
    }
    for (const newRecord of newManifest.storage.records) {
        const oldRecord = oldRecords.get(newRecord.recordName);
        if (!oldRecord) continue;
        if (oldRecord.tableName !== newRecord.tableName && !newRecord.attributes.some(attr => attr.startsWith("_"))) {
            blocking.push({
                kind: "physical-path-move",
                logicalPath: newRecord.recordName,
                oldPhysicalPath: oldRecord.tableName,
                newPhysicalPath: newRecord.tableName,
                reason: "fact record table changed",
            });
        }
        const oldAttrs = new Map((oldRecord.attributeDetails || []).map(attr => [attr.name, attr]));
        const newAttrs = new Map((newRecord.attributeDetails || []).map(attr => [attr.name, attr]));
        const oldLogical = oldLogicalRecords.get(oldRecord.recordName);
        const newLogical = newLogicalRecords.get(newRecord.recordName);
        const isComputed = (recordName: string, attrName: string, manifest: MigrationManifest) => {
            const record = manifest.records.find(item => item.name === recordName);
            return record?.properties.find(prop => prop.name === attrName)?.computed === true;
        };
        for (const oldAttr of oldRecord.attributeDetails || []) {
            const newAttr = newAttrs.get(oldAttr.name);
            if (!newAttr && !oldAttr.name.startsWith("_")) {
                const oldComputed = isComputed(oldRecord.recordName, oldAttr.name, oldManifest);
                blocking.push({
                    kind: "unsupported-destructive-schema-change",
                    logicalPath: `${oldRecord.recordName}.${oldAttr.name}`,
                    oldPhysicalPath: physicalPath(oldAttr.tableName, oldAttr.fieldName || oldAttr.sourceField || oldAttr.targetField),
                    reason: oldComputed
                        ? "computed attribute physical cleanup is not supported by compute-route schema migration"
                        : "fact attribute was removed from the new schema",
                });
            }
        }
        for (const attr of newRecord.attributeDetails || []) {
            const oldAttr = oldAttrs.get(attr.name);
            if (!oldAttr || isComputed(oldRecord.recordName, attr.name, oldManifest) || isComputed(newRecord.recordName, attr.name, newManifest)) continue;
            if (oldAttr.kind !== attr.kind || oldAttr.tableName !== attr.tableName || oldAttr.fieldName !== attr.fieldName || oldAttr.sourceField !== attr.sourceField || oldAttr.targetField !== attr.targetField) {
                blocking.push({
                    kind: "physical-path-move",
                    logicalPath: `${newRecord.recordName}.${attr.name}`,
                    oldPhysicalPath: physicalPath(oldAttr.tableName, oldAttr.fieldName || oldAttr.sourceField || oldAttr.targetField),
                    newPhysicalPath: physicalPath(attr.tableName, attr.fieldName || attr.sourceField || attr.targetField),
                    reason: "fact attribute physical path changed",
                });
            }
            if (oldAttr.type !== attr.type || oldAttr.fieldType !== attr.fieldType || oldAttr.collection !== attr.collection) {
                blocking.push({
                    kind: "unsupported-destructive-schema-change",
                    logicalPath: `${newRecord.recordName}.${attr.name}`,
                    oldPhysicalPath: `${oldAttr.type || "?"}/${oldAttr.fieldType || "?"}/${oldAttr.collection === true}`,
                    newPhysicalPath: `${attr.type || "?"}/${attr.fieldType || "?"}/${attr.collection === true}`,
                    reason: "fact attribute type, field type, or collection flag changed",
                });
            }
        }
    }
    return blocking;
}

function hasExclusiveOutputOwnershipProof(oldManifest: MigrationManifest, computationId: string, dataContext: string, outputRecord?: string) {
    const oldComputation = oldManifest.computations.find(computation => computation.id === computationId && computation.dataContext === dataContext);
    if (!oldComputation) {
        const oldRecordExists = outputRecord !== undefined && (
            oldManifest.records.some(record => record.name === outputRecord) ||
            oldManifest.storage.records.some(record => record.recordName === outputRecord)
        );
        return !oldRecordExists;
    }
    return oldComputation.owner === "exclusive" &&
        oldComputation.ownershipProof?.kind === "computed-output" &&
        oldComputation.ownershipProof.owner === "exclusive" &&
        oldComputation.ownershipProof.ownerComputationId === computationId &&
        oldComputation.ownershipProof.dataContext === dataContext &&
        oldComputation.ownershipProof.outputRecord === oldComputation.outputRecord;
}

function hasApprovedComputationTakeover(options: MigrationOptions, oldManifest: MigrationManifest | undefined, computationId: string, dataContext: string) {
    const decision = takeoverDecision(options.approvedDiff, dataContext);
    if (!decision || decision.computationId !== computationId || decision.oldDataStrategy !== "discard-and-rebuild") return false;
    return oldManifest === undefined || oldManifest.computations.every(item => item.dataContext !== dataContext);
}

export function getRecomputeBlockingChanges(controller: Controller, rebuildPlan: ComputationRebuildItem[], options: MigrationOptions = {}, oldManifest?: MigrationManifest) {
    const blockingChanges: StorageBlockingChange[] = [];
    const rebuildIds = new Set(rebuildPlan.map(item => item.computationId));
    for (const computation of controller.scheduler.computationsHandles.values()) {
        const computationId = computationManifestId(computation as DataBasedComputation);
        if (!rebuildIds.has(computationId)) continue;

        const dataContext = dataContextPath(computation.dataContext);
        if (computation.dataContext.type === "property" && computation.dataContext.id.name === HARD_DELETION_PROPERTY_NAME && !hasDecision(options.approvedDiff, decision => decision.kind === "destructive-scope" && decision.dataContext === dataContext)) {
            blockingChanges.push({ kind: "destructive-computed-output", logicalPath: dataContext, reason: "destructive computed output requires an approved destructive-scope decision" });
        }
        if ((computation as DataBasedComputation).asyncReturn && !getAsyncCompletionHandler(options, dataContext)) {
            blockingChanges.push({ kind: "async-computation", logicalPath: dataContext, reason: "async computation requires an approved async-completion-handler decision and runtime handler" });
        }
        if ((computation.dataContext.type === "entity" || computation.dataContext.type === "relation") && !(computation as DataBasedComputation).compute) {
            blockingChanges.push({ kind: "unrebuildable-computation", logicalPath: dataContext, reason: "entity/relation output lacks a full compute contract" });
        }
        if (computation.dataContext.type === "entity" || computation.dataContext.type === "relation") {
            const sourceKey = (computation.state as any)?.sourceRecordId?.key;
            const indexKey = (computation.state as any)?.transformIndex?.key;
            if (!sourceKey || !indexKey || typeof (computation as EventBasedComputation).eventDeps === "object") {
                blockingChanges.push({
                    kind: "unrebuildable-computation",
                    logicalPath: dataContext,
                    reason: "entity/relation output migration requires a data-based Transform with sourceRecordId and transformIndex state",
                });
            }
        }
        if (
            (computation.dataContext.type === "entity" || computation.dataContext.type === "relation") &&
            oldManifest &&
            !hasExclusiveOutputOwnershipProof(oldManifest, computationId, dataContext, computation.dataContext.id.name) &&
            !hasApprovedComputationTakeover(options, oldManifest, computationId, dataContext)
        ) {
            blockingChanges.push({
                kind: "destructive-computed-output",
                logicalPath: dataContext,
                reason: "entity/relation output replacement requires exclusive output ownership proof in the previous manifest",
            });
        }
        if (typeof (computation as EventBasedComputation).eventDeps === "object" && !getEventRebuildHandler(options, dataContext)) {
            blockingChanges.push({ kind: "unrebuildable-computation", logicalPath: dataContext, reason: "event-based computation requires an approved event-rebuild-handler decision and runtime handler" });
        }
    }
    return blockingChanges;
}

export async function getDestructiveDeletionScope(controller: Controller, rebuildPlan: ComputationRebuildItem[], oldManifest?: MigrationManifest) {
    const handles = computationById(controller);
    const scope: Array<{ dataContext: string; recordName?: string; ids?: string[]; count?: number; reason: string }> = [];
    const readExistingRecords = async (recordName: string) => {
        const queryHandle = (controller.system.storage as unknown as { queryHandle?: unknown }).queryHandle;
        if (queryHandle) {
            return controller.system.storage.find(recordName, undefined, undefined, ["*"]);
        }
        if (!oldManifest) return undefined;
        const record = oldManifest.storage.records.find(item => item.recordName === recordName);
        const tableName = record?.tableName;
        const attrs = (record?.attributeDetails || []).filter(attr => attr.kind === "value" && attr.fieldName);
        if (!record || !tableName || attrs.length === 0) return undefined;
        const db = (controller.system.storage as unknown as { db?: { query?: Function } }).db ||
            (controller.system as unknown as { db?: { query?: Function } }).db;
        if (typeof db?.query !== "function") return undefined;
        const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const select = attrs
            .map(attr => `${quote(attr.fieldName!)} AS ${quote(attr.name)}`)
            .join(", ");
        return db.query(`SELECT ${select} FROM ${quote(tableName)}`, []);
    };
    for (const item of rebuildPlan) {
        const computation = handles.get(item.computationId);
        if (computation?.dataContext.type === "property" && computation.dataContext.id.name === HARD_DELETION_PROPERTY_NAME) {
            const hostName = computation.dataContext.host.name!;
            const records = await readExistingRecords(hostName);
            const ids: string[] = [];
            if (records && typeof (computation as DataBasedComputation).compute === "function") {
                for (const record of records) {
                    const result = await (computation as DataBasedComputation).compute(
                        await controller.scheduler.resolveDataDeps(computation as DataBasedComputation, record),
                        record,
                    );
                    if (result === true) ids.push(String(record.id));
                }
            }
            scope.push({
                dataContext: dataContextPath(computation.dataContext),
                recordName: hostName,
                ids,
                count: ids.length || records?.length,
                reason: "hard deletion computed property may delete host records whose recomputed value is true",
            });
        }
        if (
            (computation?.dataContext.type === "entity" || computation?.dataContext.type === "relation") &&
            oldManifest?.storage.records.some(record => record.recordName === computation.dataContext.id.name) &&
            typeof (computation as DataBasedComputation).compute === "function"
        ) {
            if (!(controller.system.storage as unknown as { queryHandle?: unknown }).queryHandle) continue;
            const recordName = computation.dataContext.id.name!;
            const sourceKey = (computation.state as any)?.sourceRecordId?.key;
            const indexKey = (computation.state as any)?.transformIndex?.key;
            if (!sourceKey || !indexKey) continue;
            const result = await (computation as DataBasedComputation).compute(await controller.scheduler.resolveDataDeps(computation as DataBasedComputation));
            if (!Array.isArray(result)) continue;
            const nextKeys = new Set(result.map(item => `${item[sourceKey]}:${item[indexKey]}`));
            const existing = await readExistingRecords(recordName) as Record<string, unknown>[] || [];
            const staleIds = existing
                .filter(record => !nextKeys.has(`${record[sourceKey]}:${record[indexKey]}`))
                .map(record => String(record.id));
            if (staleIds.length) {
                scope.push({
                    dataContext: dataContextPath(computation.dataContext),
                    recordName,
                    ids: staleIds,
                    count: staleIds.length,
                    reason: "transform recompute would delete stale derived output records",
                });
            }
        }
    }
    return scope;
}

export function assertDestructiveScopeAllowed(options: MigrationOptions, actualScope: Array<{ dataContext: string; recordName?: string; ids?: string[] }>) {
    const expected = (options.approvedDiff?.decisions || [])
        .filter((decision): decision is Extract<MigrationDecision, { kind: "destructive-scope" }> => decision.kind === "destructive-scope");
    const takeoverContexts = new Set((options.approvedDiff?.decisions || [])
        .filter((decision): decision is Extract<MigrationDecision, { kind: "computation-takeover" }> => decision.kind === "computation-takeover")
        .filter(decision => decision.targetType !== "property")
        .map(decision => decision.dataContext));
    const key = (item: { dataContext: string; recordName?: string }) => `${item.dataContext}:${item.recordName || ""}`;
    const expectedByKey = new Map(expected.map(item => [key(item), [...(item.ids || [])].sort().join(",")]));
    const actualKeys = new Set(actualScope.map(key));
    for (const item of expected) {
        if (takeoverContexts.has(item.dataContext)) continue;
        if (!actualKeys.has(key(item))) {
            throw new DestructiveComputedOutputError(`Destructive migration scope mismatch for ${item.dataContext}`);
        }
    }
    for (const item of actualScope) {
        const actualIds = [...(item.ids || [])].sort().join(",");
        if (expectedByKey.get(key(item)) !== actualIds) {
            throw new DestructiveComputedOutputError(`Destructive migration scope mismatch for ${item.dataContext}`);
        }
    }
}

export async function assertComputationTakeoverAllowed(controller: Controller, options: MigrationOptions, oldManifest?: MigrationManifest, readHandle?: MigrationReadHandle) {
    const decisions = (options.approvedDiff?.decisions || [])
        .filter((decision): decision is Extract<MigrationDecision, { kind: "computation-takeover" }> => decision.kind === "computation-takeover");
    for (const decision of decisions) {
        const actual = await readTakeoverScope(controller, decision.dataContext, oldManifest, readHandle);
        if (actual.expectedExistingCount !== decision.expectedExistingCount) {
            throw new DestructiveComputedOutputError(`Computation takeover count mismatch for ${decision.dataContext}`);
        }
        if (decision.expectedHostCount !== undefined && actual.expectedHostCount !== decision.expectedHostCount) {
            throw new DestructiveComputedOutputError(`Computation takeover host count mismatch for ${decision.dataContext}`);
        }
        if (decision.targetType !== "property") {
            const actualIds = [...(actual.ids || [])].sort().join(",");
            const recordName = decision.dataContext.split(":")[1];
            const scope = options.approvedDiff?.decisions.find(item =>
                item.kind === "destructive-scope" &&
                item.dataContext === decision.dataContext &&
                item.recordName === recordName
            ) as Extract<MigrationDecision, { kind: "destructive-scope" }> | undefined;
            if (!scope || [...(scope.ids || [])].sort().join(",") !== actualIds) {
                throw new DestructiveComputedOutputError(`Computation takeover destructive scope mismatch for ${decision.dataContext}`);
            }
        }
    }
}

export function getNewFilteredDataContexts(oldManifest: MigrationManifest, newManifest: MigrationManifest) {
    const oldFiltered = new Set(oldManifest.storage.records.filter(record => record.isFiltered).map(record => record.recordName));
    return newManifest.storage.records
        .filter(record => record.isFiltered && !oldFiltered.has(record.recordName))
        .map(record => `entity:${record.recordName}`);
}

export function createPlanBlockingMessages(changes: StorageBlockingChange[]) {
    return changes.map(change => {
        const movement = change.oldPhysicalPath || change.newPhysicalPath ? ` (${change.oldPhysicalPath || "?"} -> ${change.newPhysicalPath || "?"})` : "";
        return `${change.kind}: ${change.logicalPath}${movement}: ${change.reason}`;
    });
}

export async function readMigrationManifest(controller: Controller): Promise<MigrationManifest | undefined> {
    const manifestSystem = controller.system as System & {
        readMigrationManifest?: () => Promise<MigrationManifest | undefined>
    };
    if (manifestSystem.readMigrationManifest) {
        return manifestSystem.readMigrationManifest();
    }
    return controller.system.storage.get(MIGRATION_MANIFEST_CONCEPT, MIGRATION_MANIFEST_CURRENT_KEY) as Promise<MigrationManifest | undefined>;
}

export async function writeMigrationManifest(controller: Controller, manifest: MigrationManifest) {
    const manifestSystem = controller.system as System & {
        writeMigrationManifest?: (manifest: MigrationManifest) => Promise<void>
    };
    if (manifestSystem.writeMigrationManifest) {
        await manifestSystem.writeMigrationManifest(manifest);
        return;
    }
    await controller.system.storage.set(MIGRATION_MANIFEST_CONCEPT, MIGRATION_MANIFEST_CURRENT_KEY, manifest);
}

function isEqualValue(a: unknown, b: unknown) {
    return stableStringify(a) === stableStringify(b);
}

async function resolveMigrationAsyncResult(controller: Controller, computation: Computation, result: ComputationResultAsync, record?: Record<string, unknown>, options: MigrationOptions = {}) {
    const handler = getAsyncCompletionHandler(options, dataContextPath(computation.dataContext));
    if (!handler) {
        throw new AsyncMigrationComputationError(`Migration cannot treat async task creation as completion for ${dataContextPath(computation.dataContext)}`);
    }
    return handler({
        controller,
        dataContext: computation.dataContext,
        record,
        args: result.args,
        result,
    });
}

async function writeComputationResult(
    controller: Controller,
    computation: Computation,
    result: unknown,
    record?: Record<string, unknown>,
    options: MigrationOptions = {},
    writeOptions: { forceMutationEvent?: boolean; skipAsNull?: boolean } = {},
) {
    if (result instanceof ComputationResultSkip) {
        if (!writeOptions.skipAsNull || computation.dataContext.type !== "property") return undefined;
        const propertyContext = computation.dataContext;
        const nonNull = controller.system.storage.schema.constraints.some(constraint =>
            constraint.kind === "non-null" &&
            constraint.recordName === propertyContext.host.name &&
            constraint.property === propertyContext.id.name
        );
        if (nonNull) {
            throw new MigrationError(`Computation takeover cannot keep old value for non-null property ${dataContextPath(computation.dataContext)} when computation returns skip`);
        }
        result = null;
    }
    if (result instanceof ComputationResultAsync) {
        result = await resolveMigrationAsyncResult(controller, computation, result, record, options);
    }
    if (result instanceof ComputationResultResolved) {
        throw new AsyncMigrationComputationError(`Migration requires direct final output, not asyncReturn resolution, for ${dataContextPath(computation.dataContext)}`);
    }
    const previous = await controller.retrieveLastValue(computation.dataContext, record);
    if (!writeOptions.forceMutationEvent && isEqualValue(previous, result)) return undefined;
    if (!isEqualValue(previous, result)) {
        await controller.applyResult(computation.dataContext, result, record);
    }
    return createMutationEventForOutput(computation.dataContext, result, previous, record);
}

async function writeComputationPatch(controller: Controller, computation: Computation, patch: ComputationResultPatch | ComputationResultPatch[] | unknown, record?: Record<string, unknown>, options: MigrationOptions = {}) {
    if (patch instanceof ComputationResultSkip || patch === undefined) return [];
    if (patch instanceof ComputationResultAsync) {
        patch = await resolveMigrationAsyncResult(controller, computation, patch, record, options);
    }
    if (patch instanceof ComputationResultResolved) {
        throw new AsyncMigrationComputationError(`Migration requires direct final output for ${dataContextPath(computation.dataContext)}`);
    }
    const patches = Array.isArray(patch) ? patch : [patch];
    const events: RecordMutationEvent[] = [];
    for (const item of patches) {
        if (!item || typeof item !== "object" || !("type" in item)) {
            const event = await writeComputationResult(controller, computation, item, record, options);
            if (event) events.push(event);
            continue;
        }
        const typedPatch = item as ComputationResultPatch;
        if ((typedPatch.type === "delete") && (computation.dataContext.type === "entity" || computation.dataContext.type === "relation")) {
            throw new DestructiveComputedOutputError(`Migration refuses delete patch for ${dataContextPath(computation.dataContext)} without explicit audited scope`);
        }
        await controller.applyResultPatch(computation.dataContext, typedPatch, record);
        if (computation.dataContext.type === "entity" || computation.dataContext.type === "relation") {
            events.push({
                recordName: computation.dataContext.id.name!,
                type: typedPatch.type === "insert" ? "create" : typedPatch.type,
                record: typedPatch.type === "delete" ? { id: String(typedPatch.affectedId) } as any : typedPatch.data as any,
                oldRecord: typedPatch.type === "update" || typedPatch.type === "delete" ? { id: String(typedPatch.affectedId) } as any : undefined,
                keys: typedPatch.data && typeof typedPatch.data === "object" ? Object.keys(typedPatch.data as Record<string, unknown>) : undefined,
            });
        } else {
            const event = createMutationEventForOutput(computation.dataContext, (typedPatch as any).data, undefined, record);
            if (event) events.push(event);
        }
    }
    return events;
}

function createMutationEventForOutput(dataContext: DataContext, result: unknown, previous: unknown, record?: Record<string, unknown>): RecordMutationEvent | undefined {
    if (dataContext.type === "global") {
        return {
            recordName: DICTIONARY_RECORD,
            type: previous === undefined ? "create" : "update",
            record: { key: dataContext.id.name, value: result, id: dataContext.id.name } as any,
            oldRecord: previous === undefined ? undefined : { key: dataContext.id.name, value: previous, id: dataContext.id.name } as any,
            keys: ["value"],
        };
    }
    if (dataContext.type === "property" && record) {
        return {
            recordName: dataContext.host.name!,
            type: "update",
            record: { ...record, [dataContext.id.name]: result } as any,
            oldRecord: { ...record, [dataContext.id.name]: previous } as any,
            keys: [dataContext.id.name],
        };
    }
    return undefined;
}

function stripPropertyFromInput<T>(value: T, propertyName: string, seen = new WeakSet<object>()): T {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map(item => stripPropertyFromInput(item, propertyName, seen)) as T;
    }
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
        if (key === propertyName) continue;
        output[key] = stripPropertyFromInput(item, propertyName, seen);
    }
    return output as T;
}

async function recomputeTransformOutput(controller: Controller, computation: DataBasedComputation, options: MigrationOptions = {}) {
    if (computation.dataContext.type !== "entity" && computation.dataContext.type !== "relation") return [];
    let result = await computation.compute(await controller.scheduler.resolveDataDeps(computation));
    if (result instanceof ComputationResultAsync) {
        result = await resolveMigrationAsyncResult(controller, computation as unknown as Computation, result, undefined, options);
    }
    if (!Array.isArray(result)) {
        throw new UnrebuildableComputationError(`Entity/relation migration compute must return an array for ${dataContextPath(computation.dataContext)}`);
    }
    const recordName = computation.dataContext.id.name!;
    const sourceKey = (computation.state as any)?.sourceRecordId?.key;
    const indexKey = (computation.state as any)?.transformIndex?.key;
    if (!sourceKey || !indexKey) {
        throw new UnrebuildableComputationError(`Transform migration requires sourceRecordId and transformIndex state for ${dataContextPath(computation.dataContext)}`);
    }
    const takeover = takeoverDecision(options.approvedDiff, dataContextPath(computation.dataContext));
    if (takeover?.targetType === computation.dataContext.type) {
        const decision = getDecision(options.approvedDiff, item =>
            item.kind === "destructive-scope" &&
            item.dataContext === dataContextPath(computation.dataContext) &&
            item.recordName === recordName
        ) as Extract<MigrationDecision, { kind: "destructive-scope" }> | undefined;
        if (!decision) {
            throw new DestructiveComputedOutputError(`Migration takeover requires approved destructive scope before clearing ${recordName}`);
        }
        const existing = await controller.system.storage.find(recordName, undefined, undefined, ["*"]);
        const approvedIds = new Set(decision.ids.map(String));
        const actualIds = new Set(existing.map(record => String(record.id)));
        if (approvedIds.size !== actualIds.size || [...actualIds].some(id => !approvedIds.has(id))) {
            throw new DestructiveComputedOutputError(`Migration takeover destructive scope mismatch for ${dataContextPath(computation.dataContext)}`);
        }
        const events: RecordMutationEvent[] = [];
        for (const record of existing) {
            await controller.system.storage.delete(recordName, MatchExp.atom({ key: "id", value: ["=", record.id] }));
            events.push({ recordName, type: "delete", record });
        }
        for (const item of result) {
            const created = await controller.system.storage.create(recordName, item);
            events.push({ recordName, type: "create", record: created });
        }
        return events;
    }
    const existing = await controller.system.storage.find(recordName, undefined, undefined, ["*"]);
    const existingByKey = new Map(existing.map(record => [`${record[sourceKey]}:${record[indexKey]}`, record]));
    const events: RecordMutationEvent[] = [];
    for (const item of result) {
        const key = `${item[sourceKey]}:${item[indexKey]}`;
        const oldRecord = existingByKey.get(key);
        existingByKey.delete(key);
        if (oldRecord) {
            if (!isEqualValue({ ...oldRecord, id: undefined }, { ...item, id: undefined })) {
                await controller.system.storage.update(recordName, MatchExp.atom({ key: "id", value: ["=", oldRecord.id] }), item);
                events.push({ recordName, type: "update", record: { ...oldRecord, ...item }, oldRecord, keys: Object.keys(item) });
            }
        } else {
            const created = await controller.system.storage.create(recordName, item);
            events.push({ recordName, type: "create", record: created });
        }
    }
    for (const stale of existingByKey.values()) {
        const decision = getDecision(options.approvedDiff, item =>
            item.kind === "destructive-scope" &&
            item.dataContext === dataContextPath(computation.dataContext) &&
            item.recordName === recordName
        ) as Extract<MigrationDecision, { kind: "destructive-scope" }> | undefined;
        if (!decision?.ids.map(String).includes(String(stale.id))) {
            throw new DestructiveComputedOutputError(`Migration would delete stale derived ${recordName} record ${stale.id}; approve destructive scope before executing`);
        }
        await controller.system.storage.delete(recordName, MatchExp.atom({ key: "id", value: ["=", stale.id] }));
        events.push({ recordName, type: "delete", record: stale });
    }
    return events;
}

export async function recomputeChangedComputations(controller: Controller, rebuildPlan: ComputationRebuildItem[], options: MigrationOptions = {}, initialEvents: RecordMutationEvent[] = [], oldManifest?: MigrationManifest) {
    assertDestructiveScopeAllowed(options, await getDestructiveDeletionScope(controller, rebuildPlan, oldManifest));
    const scheduler = new MigrationScheduler(controller, rebuildPlan, options, initialEvents);
    return scheduler.run();
}

class MigrationScheduler {
    private handles = computationById(this.controller);
    private sourceMapManager = new ComputationSourceMapManager(this.controller, this.controller.scheduler);
    private affectedIds = new Set(this.rebuildPlan.map(item => item.computationId));
    private pendingEventsByComputation = new Map<string, RecordMutationEvent[]>();

    constructor(private controller: Controller, private rebuildPlan: ComputationRebuildItem[], private options: MigrationOptions = {}, private initialEvents: RecordMutationEvent[] = []) {
        this.sourceMapManager.initialize(new Set(
            Array.from(this.handles.entries())
                .filter(([id]) => this.affectedIds.has(id))
                .map(([, computation]) => computation)
        ));
    }

    async run() {
    const emittedEvents: RecordMutationEvent[] = [];
    this.queueEvents(this.initialEvents, "__migration_seed__");
    for (const item of this.rebuildPlan) {
        const computation = this.handles.get(item.computationId);
        if (!computation) continue;

        if (computation.dataContext.type === "property" && computation.dataContext.id.name === HARD_DELETION_PROPERTY_NAME && !hasDecision(this.options.approvedDiff, decision => decision.kind === "destructive-scope" && decision.dataContext === dataContextPath(computation.dataContext))) {
            throw new DestructiveComputedOutputError(`Migration refuses to recompute destructive property ${dataContextPath(computation.dataContext)} without approved destructive scope`);
        }
        if (typeof (computation as DataBasedComputation).compute !== "function" && !getEventRebuildHandler(this.options, dataContextPath(computation.dataContext))) {
            throw new UnrebuildableComputationError(`Migration requires full compute support for ${dataContextPath(computation.dataContext)}`);
        }

        if (item.rebuildState && !item.rebuildOutput) {
            await this.rebuildStateDefaults(computation);
            continue;
        }

        const pendingEvents = this.pendingEventsByComputation.get(item.computationId) || [];
        const events = pendingEvents.length && !item.isSeed
            ? await this.runIncrementalRecompute(computation, pendingEvents)
            : await this.runFullRecompute(computation);
        emittedEvents.push(...events);
        if (item.propagateOutputEvents) {
            this.queueEvents(events, item.computationId);
        }
    }
    return emittedEvents;
    }

    private queueEvents(events: RecordMutationEvent[], sourceComputationId: string) {
        for (const event of events) {
            const sourceMaps = this.sourceMapManager.findSourceMapsForMutation(event);
            for (const source of sourceMaps) {
                const targetId = computationManifestId(source.computation);
                if (targetId === sourceComputationId || !this.affectedIds.has(targetId)) continue;
                if (!this.sourceMapManager.shouldTriggerUpdateComputation(source, event)) continue;
                if (!("dataDep" in source) && !this.sourceMapManager.shouldTriggerEventBasedComputation(source as EventBasedEntityEventsSourceMap, event)) continue;
                if (!this.pendingEventsByComputation.has(targetId)) this.pendingEventsByComputation.set(targetId, []);
                this.pendingEventsByComputation.get(targetId)!.push(event);
            }
        }
    }

    private async runFullRecompute(computation: Computation) {
        const takeover = takeoverDecision(this.options.approvedDiff, dataContextPath(computation.dataContext));
        const takeoverWriteOptions = takeover?.targetType === "property"
            ? { forceMutationEvent: true, skipAsNull: true }
            : {};
        const eventRebuildHandler = getEventRebuildHandler(this.options, dataContextPath(computation.dataContext));
        if (eventRebuildHandler && typeof (computation as DataBasedComputation).compute !== "function") {
            if (computation.dataContext.type === "property") {
                const hostName = computation.dataContext.host.name!;
                const records = await this.controller.system.storage.find(hostName, undefined, undefined, ["*"]);
                const events: RecordMutationEvent[] = [];
                for (const record of records) {
                    const handlerRecord = takeover?.targetType === "property"
                        ? stripPropertyFromInput(record, computation.dataContext.id.name)
                        : record;
                    const result = await eventRebuildHandler({ controller: this.controller, dataContext: computation.dataContext, record: handlerRecord });
                    const event = await writeComputationResult(this.controller, computation, result, record, this.options, takeoverWriteOptions);
                    if (event) events.push(event);
                }
                return events;
            }
            const result = await eventRebuildHandler({ controller: this.controller, dataContext: computation.dataContext });
            const event = await writeComputationResult(this.controller, computation, result, undefined, this.options);
            return event ? [event] : [];
        }
        if (computation.dataContext.type === "global") {
            const dataDeps = await this.controller.scheduler.resolveDataDeps(computation as DataBasedComputation);
            const event = await writeComputationResult(this.controller, computation, await (computation as DataBasedComputation).compute(dataDeps), undefined, this.options);
            return event ? [event] : [];
        }
        if (computation.dataContext.type === "entity" || computation.dataContext.type === "relation") {
            return recomputeTransformOutput(this.controller, computation as DataBasedComputation, this.options);
        }

        const hostName = computation.dataContext.host.name!;
        const records = await this.controller.system.storage.find(hostName, undefined, undefined, ["*"]);
        const events: RecordMutationEvent[] = [];
        for (const record of records) {
            const dataDeps = await this.controller.scheduler.resolveDataDeps(computation as DataBasedComputation, record);
            const computeRecord = takeover?.targetType === "property"
                ? stripPropertyFromInput(record, computation.dataContext.id.name)
                : record;
            const computeDeps = takeover?.targetType === "property"
                ? stripPropertyFromInput(dataDeps, computation.dataContext.id.name)
                : dataDeps;
            const result = await (computation as DataBasedComputation).compute(
                computeDeps,
                computeRecord,
            );
            const event = await writeComputationResult(this.controller, computation, result, record, this.options, takeoverWriteOptions);
            if (event) events.push(event);
        }
        return events;
    }

    private async rebuildStateDefaults(computation: Computation) {
        for (const state of Object.values(computation.state || {})) {
            if ("record" in state) {
                const recordState = state as RecordBoundState<unknown>;
                if (!recordState.record) continue;
                const records = await this.controller.system.storage.find(recordState.record, undefined, undefined, ["id"]);
                for (const record of records) {
                    await recordState.setInternal(record, recordState.defaultValue);
                }
            } else {
                const globalState = state as GlobalBoundState<unknown>;
                await globalState.setInternal(globalState.defaultValue);
            }
        }
    }

    private async runIncrementalRecompute(computation: Computation, mutationEvents: RecordMutationEvent[]) {
        const events: RecordMutationEvent[] = [];
        for (const mutationEvent of mutationEvents) {
            const sourceMaps = this.sourceMapManager.findSourceMapsForMutation(mutationEvent)
                .filter(source => source.computation === computation);
            for (const source of sourceMaps) {
                if (!("dataDep" in source)) {
                    const eventRebuildHandler = getEventRebuildHandler(this.options, dataContextPath(computation.dataContext));
                    if (!eventRebuildHandler) {
                        throw new UnrebuildableComputationError(`Event-based migration requires an approved event rebuild handler for ${dataContextPath(computation.dataContext)}`);
                    }
                    const result = await eventRebuildHandler({ controller: this.controller, dataContext: computation.dataContext, mutationEvent });
                    const event = await writeComputationResult(this.controller, computation, result, undefined, this.options);
                    if (event) events.push(event);
                    continue;
                }
                const dirtyRecordsAndEvents = await this.controller.scheduler.computeDataBasedDirtyRecordsAndEvents(source as DataBasedEntityEventsSourceMap, mutationEvent);
                for (const [record, event] of dirtyRecordsAndEvents) {
                    events.push(...await this.runOneDirtyComputation(computation as DataBasedComputation, event, record));
                }
            }
        }
        return events;
    }

    private async runOneDirtyComputation(computation: DataBasedComputation, mutationEvent: EtityMutationEvent, record?: Record<string, unknown>) {
        const dataDeps = await this.controller.scheduler.resolveDataDeps(computation, record);
        let result: unknown;
        if (computation.incrementalPatchCompute) {
            result = await computation.incrementalPatchCompute(undefined, mutationEvent, record, dataDeps);
            if (result instanceof ComputationResultFullRecompute) {
                result = await computation.compute(dataDeps, record);
                const event = await writeComputationResult(this.controller, computation, result, record, this.options);
                return event ? [event] : [];
            }
            return writeComputationPatch(this.controller, computation, result, record, this.options);
        }
        if (computation.incrementalCompute) {
            const lastValue = computation.useLastValue ? await this.controller.retrieveLastValue(computation.dataContext, record) : undefined;
            result = await computation.incrementalCompute(lastValue, mutationEvent, record, dataDeps);
            if (result instanceof ComputationResultFullRecompute) {
                result = await computation.compute(dataDeps, record);
            }
        } else {
            result = await computation.compute(dataDeps, record);
        }
        const event = await writeComputationResult(this.controller, computation, result, record, this.options);
        return event ? [event] : [];
    }
}

export async function recomputeFilteredMemberships(controller: Controller, oldManifest: MigrationManifest, newManifest: MigrationManifest) {
    const oldFiltered = new Set(oldManifest.storage.records.filter(record => record.isFiltered).map(record => record.recordName));
    const affectedFilteredRecords = newManifest.storage.records.filter(record => record.isFiltered && !oldFiltered.has(record.recordName));
    const events: RecordMutationEvent[] = [];
    for (const filteredRecord of affectedFilteredRecords) {
        const baseRecordName = filteredRecord.resolvedBaseRecordName;
        if (!baseRecordName || !filteredRecord.resolvedMatchExpression) continue;
        const allBaseRecords = await controller.system.storage.find(baseRecordName, undefined, undefined, ["id", "__filtered_entities"]);
        const matchedRecords = await controller.system.storage.find(baseRecordName, filteredRecord.resolvedMatchExpression, undefined, ["id"]);
        const matchedIds = new Set(matchedRecords.map(record => String(record.id)));
        for (const baseRecord of allBaseRecords) {
            const flags = {
                ...((baseRecord.__filtered_entities && typeof baseRecord.__filtered_entities === "object") ? baseRecord.__filtered_entities : {}),
                [filteredRecord.recordName]: matchedIds.has(String(baseRecord.id)),
            };
            await controller.system.storage.update(
                baseRecordName,
                MatchExp.atom({ key: "id", value: ["=", baseRecord.id] }),
                { __filtered_entities: flags },
            );
            events.push({
                recordName: filteredRecord.recordName,
                type: matchedIds.has(String(baseRecord.id)) ? "create" : "delete",
                record: { ...baseRecord, __filtered_entities: flags } as any,
                oldRecord: baseRecord as any,
                keys: ["__filtered_entities"],
            });
        }
    }
    return events;
}
