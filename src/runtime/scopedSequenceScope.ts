import type { ScopedSequenceScopeItem } from "@core";
import type { AtomicSequenceScope, AtomicSequenceScopeItem, AtomicSequenceScopeValue } from "./System.js";

export function readScopedSequencePath(record: Record<string, unknown>, path: string) {
    const parts = path.split('.');
    let current: unknown = record;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

export function canonicalizeScopedSequenceScopeValue(item: ScopedSequenceScopeItem | Record<string, unknown>, value: unknown): AtomicSequenceScopeValue {
    if (value === undefined) {
        throw new Error(`ScopedSequence scope "${String(item.name)}" is missing`);
    }
    if (item.type === 'ref') {
        const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value;
        if (typeof id !== 'string' && typeof id !== 'number') {
            throw new Error(`ScopedSequence ref scope "${String(item.name)}" must be an id or { id } value`);
        }
        const base = (item as ScopedSequenceScopeItem & { base?: { name?: string } }).base;
        if (!base?.name) {
            throw new Error(`ScopedSequence ref scope "${String(item.name)}" must declare a base entity`);
        }
        return { type: 'ref', entity: base.name, id: String(id) };
    }
    if (item.type === 'string') {
        if (typeof value !== 'string') throw new Error(`ScopedSequence scope "${String(item.name)}" must be a string`);
        return value;
    }
    if (item.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`ScopedSequence scope "${String(item.name)}" must be a finite number`);
        return value;
    }
    if (item.type === 'boolean') {
        if (typeof value !== 'boolean') throw new Error(`ScopedSequence scope "${String(item.name)}" must be a boolean`);
        return value;
    }
    throw new Error(`Unsupported ScopedSequence scope type "${String(item.type)}"`);
}

export function atomicSequenceScopeItem(name: string, value: AtomicSequenceScopeValue): AtomicSequenceScopeItem {
    return {
        name,
        type: typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'ref'
            ? 'ref'
            : value === null
            ? 'null'
            : typeof value as AtomicSequenceScopeItem['type'],
        value,
    };
}

export function resolveScopedSequenceScope(scope: ScopedSequenceScopeItem[], record: Record<string, unknown>): AtomicSequenceScope {
    const resolved: AtomicSequenceScope = [];
    for (const item of scope) {
        resolved.push(atomicSequenceScopeItem(item.name, canonicalizeScopedSequenceScopeValue(item, readScopedSequencePath(record, item.path))));
    }
    return resolved;
}

export function canonicalizeScopedSequenceScopeFromValues(
    scope: Array<ScopedSequenceScopeItem | Record<string, unknown>>,
    valuesByName: Map<string, unknown> | Record<string, unknown>,
) {
    const resolved: AtomicSequenceScope = [];
    for (const item of scope) {
        const value = valuesByName instanceof Map ? valuesByName.get(String(item.name)) : valuesByName[String(item.name)];
        resolved.push(atomicSequenceScopeItem(String(item.name), canonicalizeScopedSequenceScopeValue(item, value)));
    }
    return resolved;
}
