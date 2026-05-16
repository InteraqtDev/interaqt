import {
    BoolExp,
    normalizeScopedSequenceMatchExpression,
    type ExpressionData,
    type ScopedSequenceMatchAtom,
    type ScopedSequenceMatchExpression,
} from "@core";

function isNullish(value: unknown) {
    return value === undefined || value === null;
}

function comparableValue(value: unknown) {
    return typeof value === "object" && value !== null && "id" in value
        ? (value as { id?: unknown }).id
        : value;
}

function equalScopedSequenceMatchValue(left: unknown, right: unknown) {
    return comparableValue(left) === comparableValue(right);
}

export function readScopedSequenceMatchPath(record: Record<string, unknown>, path: string) {
    const parts = path.split(".");
    let current: unknown = record;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== "object") {
            return part === "id" ? current : undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function evaluateAtom(atom: ScopedSequenceMatchAtom, record: Record<string, unknown>) {
    const [operator, operand] = atom.value;
    const value = readScopedSequenceMatchPath(record, atom.key);
    switch (operator) {
        case "is null":
            return isNullish(value);
        case "is not null":
            return !isNullish(value);
        case "=":
            return operand === null ? isNullish(value) : !isNullish(value) && equalScopedSequenceMatchValue(value, operand);
        case "!=":
            return operand === null ? !isNullish(value) : !isNullish(value) && !equalScopedSequenceMatchValue(value, operand);
        case "in": {
            if (!Array.isArray(operand)) throw new Error("ScopedSequence.match in value must be an array");
            if (isNullish(value)) return operand.includes(null);
            return operand.some(item => item !== null && equalScopedSequenceMatchValue(value, item));
        }
        case "not in": {
            if (!Array.isArray(operand)) throw new Error("ScopedSequence.match not in value must be an array");
            if (isNullish(value)) return false;
            return operand.every(item => item === null || !equalScopedSequenceMatchValue(value, item));
        }
    }
}

function evaluateExpression(node: ExpressionData<ScopedSequenceMatchAtom>, record: Record<string, unknown>): boolean {
    if (node.type === "atom") return evaluateAtom(node.data, record);
    if (node.operator === "and") return evaluateExpression(node.left, record) && Boolean(node.right && evaluateExpression(node.right, record));
    if (node.operator === "or") return evaluateExpression(node.left, record) || Boolean(node.right && evaluateExpression(node.right, record));
    if (node.operator === "not") return !evaluateExpression(node.left, record);
    throw new Error(`ScopedSequence.match has unsupported boolean operator "${String(node.operator)}"`);
}

export function matchesScopedSequenceRecord(
    match: ScopedSequenceMatchExpression | undefined,
    record: Record<string, unknown>,
) {
    const normalized = normalizeScopedSequenceMatchExpression(match);
    return normalized ? evaluateExpression(normalized, record) : true;
}

export function collectScopedSequenceMatchPaths(match: ScopedSequenceMatchExpression | undefined) {
    const normalized = normalizeScopedSequenceMatchExpression(match);
    const paths: string[] = [];
    if (!normalized) return paths;
    const visit = (node: ExpressionData<ScopedSequenceMatchAtom>) => {
        if (node.type === "atom") {
            paths.push(node.data.key);
            return;
        }
        visit(node.left);
        if (node.right) visit(node.right);
    };
    visit(normalized);
    return Array.from(new Set(paths));
}

export function scopedSequenceMatchTopLevelKeys(match: ScopedSequenceMatchExpression | undefined) {
    return collectScopedSequenceMatchPaths(match).map(path => path.split(".")[0]);
}

export function scopedSequenceMatchAttributeQuery(match: ScopedSequenceMatchExpression | undefined) {
    const paths = collectScopedSequenceMatchPaths(match);
    if (paths.some(path => {
        const parts = path.split(".");
        return parts.length > 2 || (parts.length === 2 && parts[1] !== "id");
    })) {
        return ["*"];
    }
    return paths.map(path => path.split(".")[0]);
}

export function scopedSequenceMatchFromUnknown(match: unknown): ScopedSequenceMatchExpression | undefined {
    if (match === undefined) return undefined;
    if (match instanceof BoolExp || BoolExp.isExpressionData(match)) {
        return match as ScopedSequenceMatchExpression;
    }
    throw new Error("ScopedSequence.match must be a BoolExp expression");
}
