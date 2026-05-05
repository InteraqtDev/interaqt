import type { Controller } from "./Controller.js";
import type { Computation, ComputationResultPatch, DataBasedComputation, DataContext, EventBasedComputation, GlobalBoundState, RecordBoundState } from "./computations/Computation.js";
import { ComputationResultAsync, ComputationResultFullRecompute, ComputationResultResolved, ComputationResultSkip } from "./computations/Computation.js";
import type { RecordMutationEvent, StorageSchemaMetadata, System } from "./System.js";
import { DICTIONARY_RECORD } from "./System.js";
import { LINK_SYMBOL, MatchExp } from "@storage";
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

export type MigrationOptions = {
    mode?: "compute";
    dryRun?: boolean;
    hints?: unknown[];
    allowDestructiveCleanup?: boolean;
    destructiveScope?: Array<{ dataContext: string; recordName?: string; ids?: string[] }>;
};

export type SetupOptions = {
    install?: boolean;
    migrate?: boolean | MigrationOptions;
};

export type ComputationManifest = {
    id: string;
    type: string;
    dataContext: string;
    outputRecord?: string;
    outputProperty?: string;
    deps: Array<{ type: string; source?: string; phase?: unknown; attributeQuery?: unknown }>;
    eventDeps: Array<{ recordName: string; type: string; phase?: unknown }>;
    stateKeys: string[];
    boundStates: BoundStateManifest[];
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
    version: 1;
    frameworkVersion: string;
    modelHash: string;
    records: Array<{
        id: string;
        name: string;
        kind: "entity" | "relation";
        properties: Array<{
            id: string;
            name: string;
            type: string;
            collection: boolean;
            computed: boolean;
        }>;
    }>;
    relations: Array<{
        id: string;
        name: string;
        source: string;
        target: string;
        sourceProperty?: string;
        targetProperty?: string;
        type: string;
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
    postRecomputeDDL: AdditiveDDLOperation[];
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
    hints?: unknown[];
};

function hash(value: unknown) {
    return createHash("sha256").update(stableStringify(value)).digest("hex");
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

function getInstanceId(instance: { uuid?: string; name?: string }, label: string) {
    if (instance.uuid) return instance.uuid;
    throw new AmbiguousComputationSignatureError(`Migration requires stable uuid for ${label} "${instance.name || "anonymous"}"`);
}

export function dataContextPath(dataContext: DataContext): string {
    if (dataContext.type === "property") {
        return `property:${dataContext.host.name}.${dataContext.id.name}`;
    }
    return `${dataContext.type}:${dataContext.id.name}`;
}

export function computationManifestId(computation: { args: { uuid?: string }; dataContext: DataContext }) {
    if (computation.args.uuid) return computation.args.uuid;
    throw new AmbiguousComputationSignatureError(`Migration requires stable uuid for computation ${dataContextPath(computation.dataContext)}`);
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

function assertVersionedUserFunctions(computation: { args: Record<string, unknown>; dataContext: DataContext }) {
    const hasFunction = hasFunctionDeep(computation.args);
    const hasVersion = computation.args.version !== undefined || computation.args.migrationKey !== undefined;
    if (hasFunction && !hasVersion) {
        throw new Error(`Migration requires explicit version or migrationKey for function-based computation ${dataContextPath(computation.dataContext)}`);
    }
}

function createComputationManifest(computation: Computation): ComputationManifest {
    const args = computation.args as Record<string, unknown>;
    const deps = serializeDataDeps(computation as Partial<DataBasedComputation>);
    const eventDeps = serializeEventDeps(computation as Partial<EventBasedComputation>);
    const boundStates = serializeState(computation);
    const stateKeys = boundStates.map(state => state.key);
    const id = computationManifestId(computation);
    const dataContext = dataContextPath(computation.dataContext);
    const outputRecord = computation.dataContext.type === "entity" || computation.dataContext.type === "relation" ? computation.dataContext.id.name : undefined;
    const outputSignature = hash({
        type: computation.constructor?.name || args._type || args.constructor?.name,
        dataContext,
        version: args.version,
        migrationKey: args.migrationKey,
        dataDeps: deps,
        eventDeps,
        hasCompute: typeof (computation as DataBasedComputation).compute === "function",
        hasIncrementalCompute: typeof computation.incrementalCompute === "function",
        hasIncrementalPatchCompute: typeof computation.incrementalPatchCompute === "function",
    });
    const stateSignature = hash({ stateKeys, boundStates });
    const signature = hash({ outputSignature, stateSignature });

    return {
        id,
        type: computation.constructor?.name || String(args._type || args.constructor?.name || "UnknownComputation"),
        dataContext,
        outputRecord,
        outputProperty: computation.dataContext.type === "property" ? computation.dataContext.id.name : undefined,
        deps: deps.map(dep => ({ type: String(dep.type), source: (dep as { source?: string }).source, phase: (dep as { phase?: unknown }).phase, attributeQuery: (dep as { attributeQuery?: unknown }).attributeQuery })),
        eventDeps,
        stateKeys,
        boundStates,
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
        signature,
    };
}

export function createMigrationManifest(controller: Controller, storageSchema: StorageSchemaMetadata = controller.system.storage.schema): MigrationManifest {
    const records = [
        ...controller.entities.map(entity => ({
            id: getInstanceId(entity, "entity"),
            name: entity.name,
            kind: "entity" as const,
            properties: (entity.properties || []).map(property => ({
                id: getInstanceId(property, `${entity.name}.${property.name}`),
                name: property.name,
                type: property.type,
                collection: property.collection === true,
                computed: !!property.computation,
            })),
        })),
        ...controller.relations.map(relation => ({
            id: getInstanceId(relation, "relation"),
            name: relation.name!,
            kind: "relation" as const,
            properties: (relation.properties || []).map(property => ({
                id: getInstanceId(property, `${relation.name}.${property.name}`),
                name: property.name,
                type: property.type,
                collection: property.collection === true,
                computed: !!property.computation,
            })),
        })),
    ];
    const relations = controller.relations.map(relation => ({
        id: getInstanceId(relation, "relation"),
        name: relation.name!,
        source: relation.source.name!,
        target: relation.target.name!,
        sourceProperty: relation.sourceProperty,
        targetProperty: relation.targetProperty,
        type: relation.type,
    }));
    const computations = Array.from(controller.scheduler.computationsHandles.values())
        .map(createComputationManifest);
    const model = { records, relations, computations, storage: storageSchema };

    return {
        version: 1,
        frameworkVersion: "1",
        modelHash: hash(model),
        records,
        relations,
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

export function buildAffectedRebuildPlan(oldManifest: MigrationManifest, newManifest: MigrationManifest, changedComputations: ComputationManifest[], changedDataContexts: string[] = []): ComputationRebuildItem[] {
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
            return !old || old.outputSignature !== item.outputSignature;
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
        const outputChanged = !old || old.outputSignature !== computation.outputSignature;
        const stateChanged = !old || old.stateSignature !== computation.stateSignature;
        const seed = changedComputations.some(item => item.id === id);
        return {
            computationId: id,
            dataContext: computation.dataContext,
            rebuildState: stateChanged && computation.boundStates.length > 0,
            rebuildOutput: outputChanged || !seed,
            propagateOutputEvents: outputChanged || !seed,
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
    for (const oldRecord of oldManifest.storage.records) {
        if (!newRecords.has(oldRecord.recordName) && !oldRecord.isFiltered) {
            blocking.push({
                kind: "unsupported-destructive-schema-change",
                logicalPath: oldRecord.recordName,
                oldPhysicalPath: oldRecord.tableName,
                reason: "fact record was removed from the new schema",
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
            if (!newAttr && !oldAttr.name.startsWith("_") && !isComputed(oldRecord.recordName, oldAttr.name, oldManifest)) {
                blocking.push({
                    kind: "unsupported-destructive-schema-change",
                    logicalPath: `${oldRecord.recordName}.${oldAttr.name}`,
                    oldPhysicalPath: physicalPath(oldAttr.tableName, oldAttr.fieldName || oldAttr.sourceField || oldAttr.targetField),
                    reason: "fact attribute was removed from the new schema",
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

export function getRecomputeBlockingChanges(controller: Controller, rebuildPlan: ComputationRebuildItem[], options: MigrationOptions = {}, oldManifest?: MigrationManifest) {
    const blockingChanges: StorageBlockingChange[] = [];
    const rebuildIds = new Set(rebuildPlan.map(item => item.computationId));
    for (const computation of controller.scheduler.computationsHandles.values()) {
        const computationId = computationManifestId(computation as DataBasedComputation);
        if (!rebuildIds.has(computationId)) continue;

        const dataContext = dataContextPath(computation.dataContext);
        if (computation.dataContext.type === "property" && computation.dataContext.id.name === HARD_DELETION_PROPERTY_NAME && !options.allowDestructiveCleanup) {
            blockingChanges.push({ kind: "destructive-computed-output", logicalPath: dataContext, reason: "destructive computed output requires allowDestructiveCleanup" });
        }
        const migrationAsync = (computation as unknown as { migrationAsync?: Function, args?: { migrationAsync?: Function } }).migrationAsync ||
            (computation as unknown as { args?: { migrationAsync?: Function } }).args?.migrationAsync;
        if ((computation as DataBasedComputation).asyncReturn && !migrationAsync) {
            blockingChanges.push({ kind: "async-computation", logicalPath: dataContext, reason: "ordinary async task completion is not a migration completion contract" });
        }
        if ((computation.dataContext.type === "entity" || computation.dataContext.type === "relation") && !(computation as DataBasedComputation).compute) {
            blockingChanges.push({ kind: "unrebuildable-computation", logicalPath: dataContext, reason: "entity/relation output lacks a full compute contract" });
        }
        if ((computation.dataContext.type === "entity" || computation.dataContext.type === "relation") && oldManifest && !hasExclusiveOutputOwnershipProof(oldManifest, computationId, dataContext, computation.dataContext.id.name)) {
            blockingChanges.push({
                kind: "destructive-computed-output",
                logicalPath: dataContext,
                reason: "entity/relation output replacement requires exclusive output ownership proof in the previous manifest",
            });
        }
        if (typeof (computation as EventBasedComputation).eventDeps === "object" && !(computation as unknown as { migrationCompute?: Function }).migrationCompute && !(computation as DataBasedComputation).compute) {
            blockingChanges.push({ kind: "unrebuildable-computation", logicalPath: dataContext, reason: "event-based computation requires explicit migrationCompute contract" });
        }
        try {
            assertVersionedUserFunctions({
                args: (computation as DataBasedComputation).args as Record<string, unknown>,
                dataContext: computation.dataContext,
            });
        } catch (error) {
            blockingChanges.push({ kind: "unrebuildable-computation", logicalPath: dataContext, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return blockingChanges;
}

export async function getDestructiveDeletionScope(controller: Controller, rebuildPlan: ComputationRebuildItem[]) {
    const handles = computationById(controller);
    const scope: Array<{ dataContext: string; recordName?: string; ids?: string[]; count?: number; reason: string }> = [];
    for (const item of rebuildPlan) {
        const computation = handles.get(item.computationId);
        if (computation?.dataContext.type === "property" && computation.dataContext.id.name === HARD_DELETION_PROPERTY_NAME) {
            const hostName = computation.dataContext.host.name!;
            const queryHandle = (controller.system.storage as unknown as { queryHandle?: unknown }).queryHandle;
            const records = queryHandle ? await controller.system.storage.find(hostName, undefined, undefined, ["*"]) : undefined;
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
    }
    return scope;
}

function assertDestructiveScopeAllowed(options: MigrationOptions, actualScope: Array<{ dataContext: string; recordName?: string; ids?: string[] }>) {
    if (!actualScope.length) return;
    if (!options.allowDestructiveCleanup) {
        throw new DestructiveComputedOutputError("Destructive migration requires allowDestructiveCleanup");
    }
    const expected = options.destructiveScope || [];
    const key = (item: { dataContext: string; recordName?: string }) => `${item.dataContext}:${item.recordName || ""}`;
    const expectedByKey = new Map(expected.map(item => [key(item), [...(item.ids || [])].sort().join(",")]));
    for (const item of actualScope) {
        const actualIds = [...(item.ids || [])].sort().join(",");
        if (expectedByKey.get(key(item)) !== actualIds) {
            throw new DestructiveComputedOutputError(`Destructive migration scope mismatch for ${item.dataContext}`);
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

async function resolveMigrationAsyncResult(controller: Controller, computation: Computation, result: ComputationResultAsync, record?: Record<string, unknown>) {
    const migrationAsync = (computation as unknown as { migrationAsync?: Function, args?: { migrationAsync?: Function } }).migrationAsync ||
        (computation as unknown as { args?: { migrationAsync?: Function } }).args?.migrationAsync;
    if (!migrationAsync) {
        throw new AsyncMigrationComputationError(`Migration cannot treat async task creation as completion for ${dataContextPath(computation.dataContext)}`);
    }
    return migrationAsync.call(controller, {
        controller,
        dataContext: computation.dataContext,
        record,
        args: result.args,
        result,
    });
}

async function writeComputationResult(controller: Controller, computation: Computation, result: unknown, record?: Record<string, unknown>) {
    if (result instanceof ComputationResultSkip) return undefined;
    if (result instanceof ComputationResultAsync) {
        result = await resolveMigrationAsyncResult(controller, computation, result, record);
    }
    if (result instanceof ComputationResultResolved) {
        throw new AsyncMigrationComputationError(`Migration requires direct final output, not asyncReturn resolution, for ${dataContextPath(computation.dataContext)}`);
    }
    const previous = await controller.retrieveLastValue(computation.dataContext, record);
    if (isEqualValue(previous, result)) return undefined;
    await controller.applyResult(computation.dataContext, result, record);
    return createMutationEventForOutput(computation.dataContext, result, previous, record);
}

async function writeComputationPatch(controller: Controller, computation: Computation, patch: ComputationResultPatch | ComputationResultPatch[] | unknown, record?: Record<string, unknown>) {
    if (patch instanceof ComputationResultSkip || patch === undefined) return [];
    if (patch instanceof ComputationResultAsync) {
        patch = await resolveMigrationAsyncResult(controller, computation, patch, record);
    }
    if (patch instanceof ComputationResultResolved) {
        throw new AsyncMigrationComputationError(`Migration requires direct final output for ${dataContextPath(computation.dataContext)}`);
    }
    const patches = Array.isArray(patch) ? patch : [patch];
    const events: RecordMutationEvent[] = [];
    for (const item of patches) {
        if (!item || typeof item !== "object" || !("type" in item)) {
            const event = await writeComputationResult(controller, computation, item, record);
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

async function recomputeTransformOutput(controller: Controller, computation: DataBasedComputation, allowDestructiveCleanup = false) {
    if (computation.dataContext.type !== "entity" && computation.dataContext.type !== "relation") return [];
    if (!allowDestructiveCleanup) {
        // Entity/relation Transform owns its derived output. Replacing it is safe only
        // because the manifest marks computed entity/relation outputs as exclusive.
    }
    let result = await computation.compute(await controller.scheduler.resolveDataDeps(computation));
    if (result instanceof ComputationResultAsync) {
        result = await resolveMigrationAsyncResult(controller, computation as unknown as Computation, result);
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
        if (!allowDestructiveCleanup) {
            throw new DestructiveComputedOutputError(`Migration would delete stale derived ${recordName} record ${stale.id}; run dryRun to inspect scope before allowDestructiveCleanup`);
        }
        await controller.system.storage.delete(recordName, MatchExp.atom({ key: "id", value: ["=", stale.id] }));
        events.push({ recordName, type: "delete", record: stale });
    }
    return events;
}

export async function recomputeChangedComputations(controller: Controller, rebuildPlan: ComputationRebuildItem[], options: MigrationOptions = {}, initialEvents: RecordMutationEvent[] = []) {
    assertDestructiveScopeAllowed(options, await getDestructiveDeletionScope(controller, rebuildPlan));
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

        if (computation.dataContext.type === "property" && computation.dataContext.id.name === HARD_DELETION_PROPERTY_NAME && !this.options.allowDestructiveCleanup) {
            throw new DestructiveComputedOutputError(`Migration refuses to recompute destructive property ${dataContextPath(computation.dataContext)} without allowDestructiveCleanup`);
        }
        const migrationCompute = (computation as unknown as { migrationCompute?: Function }).migrationCompute;
        if (typeof (computation as DataBasedComputation).compute !== "function" && typeof migrationCompute !== "function") {
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
        const migrationCompute = (computation as unknown as { migrationCompute?: Function }).migrationCompute;
        if (migrationCompute) {
            if (computation.dataContext.type === "property") {
                const hostName = computation.dataContext.host.name!;
                const records = await this.controller.system.storage.find(hostName, undefined, undefined, ["*"]);
                const events: RecordMutationEvent[] = [];
                for (const record of records) {
                    const result = await migrationCompute.call(this.controller, { controller: this.controller, dataContext: computation.dataContext, record });
                    const event = await writeComputationResult(this.controller, computation, result, record);
                    if (event) events.push(event);
                }
                return events;
            }
            const result = await migrationCompute.call(this.controller, { controller: this.controller, dataContext: computation.dataContext });
            const event = await writeComputationResult(this.controller, computation, result);
            return event ? [event] : [];
        }
        if (computation.dataContext.type === "global") {
            const dataDeps = await this.controller.scheduler.resolveDataDeps(computation as DataBasedComputation);
            const event = await writeComputationResult(this.controller, computation, await (computation as DataBasedComputation).compute(dataDeps));
            return event ? [event] : [];
        }
        if (computation.dataContext.type === "entity" || computation.dataContext.type === "relation") {
            return recomputeTransformOutput(this.controller, computation as DataBasedComputation, this.options.allowDestructiveCleanup);
        }

        const hostName = computation.dataContext.host.name!;
        const records = await this.controller.system.storage.find(hostName, undefined, undefined, ["*"]);
        const events: RecordMutationEvent[] = [];
        for (const record of records) {
            const result = await (computation as DataBasedComputation).compute(
                await this.controller.scheduler.resolveDataDeps(computation as DataBasedComputation, record),
                record,
            );
            const event = await writeComputationResult(this.controller, computation, result, record);
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
                    const migrationCompute = (computation as unknown as { migrationCompute?: Function }).migrationCompute;
                    if (!migrationCompute) {
                        throw new UnrebuildableComputationError(`Event-based migration requires explicit migrationCompute for ${dataContextPath(computation.dataContext)}`);
                    }
                    const result = await migrationCompute.call(this.controller, { controller: this.controller, mutationEvent });
                    const event = await writeComputationResult(this.controller, computation, result);
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
                const event = await writeComputationResult(this.controller, computation, result, record);
                return event ? [event] : [];
            }
            return writeComputationPatch(this.controller, computation, result, record);
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
        const event = await writeComputationResult(this.controller, computation, result, record);
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
