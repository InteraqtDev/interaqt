import { createHash } from "node:crypto";

export type ScopedSequenceAllocationManifest = {
    kind: "scoped-sequence";
    timing: "post-create-pre-commit";
    rebuildable: false;
    sequenceName: string;
    scope: Array<{
        name: unknown;
        type: unknown;
        path: unknown;
        base?: unknown;
    }>;
    initialValue: number;
    step: number;
    allowManualValue: boolean;
    initializeFrom?: {
        record?: unknown;
        valuePath?: unknown;
        scope?: unknown;
        aggregate?: unknown;
        match?: unknown;
    };
};

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

export function stableHash(value: unknown) {
    return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function createScopedSequenceAllocationManifest(args: Record<string, unknown>): ScopedSequenceAllocationManifest | undefined {
    if (args._type !== "ScopedSequence") return undefined;
    const scope = ((args.scope as Array<Record<string, unknown>>) || []).map(item => ({
        name: item.name,
        type: item.type,
        path: item.path,
        base: item.type === "ref" ? (item.base as { name?: string } | undefined)?.name : undefined,
    }));
    const initializeFrom = args.initializeFrom as Record<string, unknown> | undefined;
    return {
        kind: "scoped-sequence",
        timing: "post-create-pre-commit",
        rebuildable: false,
        sequenceName: String(args.name),
        scope,
        initialValue: Number(args.initialValue ?? 0),
        step: Number(args.step ?? 1),
        allowManualValue: args.allowManualValue === true,
        initializeFrom: initializeFrom ? {
            record: (initializeFrom.record as { name?: string } | undefined)?.name,
            valuePath: initializeFrom.valuePath,
            scope: initializeFrom.scope,
            aggregate: initializeFrom.aggregate,
            match: initializeFrom.match,
        } : undefined,
    };
}

export function createScopedSequenceSignatures(args: Record<string, unknown>) {
    const allocation = createScopedSequenceAllocationManifest(args);
    return {
        allocation,
        scopeSignature: allocation ? stableHash(allocation.scope) : undefined,
        allocationSignature: allocation ? stableHash(allocation) : undefined,
    };
}

export function scopedSequenceComputationId(hostRecord: string, property: string) {
    return `computation:property:${hostRecord}.${property}:ScopedSequence`;
}
