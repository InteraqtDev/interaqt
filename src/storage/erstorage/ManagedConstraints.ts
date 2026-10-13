import { createHash } from "node:crypto";
import type { Database } from "@runtime";
import type { ConstraintPredicate, ConstraintPredicateValue } from "@core";
import type { DBSetup } from "./Setup.js";
import {
    createFrameworkApplicationIdentityIndexSQL,
    createFrameworkLogicalIdUniqueIndexSQL,
    createUniqueIndexSQL,
    quoteIdentifier,
    type SchemaDialect,
} from "./SchemaDialect.js";

/**
 * Managed constraints are the physical constraint objects the framework derives from
 * declarations: user `UniqueConstraint` indexes (including the framework-internal kv
 * constraints that share that pipeline), `NonNullConstraint` CHECK constraints,
 * `Entity.identity` indexes, logical-id indexes and Transform unique indexes.
 *
 * Every reader of the installed state goes through this module. Install, attach
 * (`setup(false)`), migration planning and the post-migration invariant all compare
 * one desired set (built from the declarations) with one installed set (read from the
 * database catalog). The migration manifest is not a source for the installed state:
 * databases migrated by interaqt <= 4.11.2 can hold constraints the manifest no longer
 * lists, or an older definition under a name the manifest lists with a newer one.
 *
 * Ownership: an index or CHECK constraint on a table of the model is framework-owned
 * when its name carries one of the reserved prefixes below.
 */
export type ManagedConstraintKind = 'unique' | 'non-null' | 'identity' | 'logical-id' | 'transform-unique'

export type ManagedConstraintObjectType = 'index' | 'check'

const IDENTITY_PREFIX = 'interaqt_ident_'
const LOGICAL_ID_PREFIX = 'interaqt_id_'
const TRANSFORM_PREFIX = 'idx_transform_'
const USER_CONSTRAINT_PREFIX = 'uniq_'

export function classifyManagedConstraintName(name: string, objectType: ManagedConstraintObjectType): ManagedConstraintKind | undefined {
    if (objectType === 'check') return name.startsWith(USER_CONSTRAINT_PREFIX) ? 'non-null' : undefined
    if (name.startsWith(IDENTITY_PREFIX)) return 'identity'
    if (name.startsWith(LOGICAL_ID_PREFIX)) return 'logical-id'
    if (name.startsWith(TRANSFORM_PREFIX)) return 'transform-unique'
    if (name.startsWith(USER_CONSTRAINT_PREFIX)) return 'unique'
    return undefined
}

/**
 * Canonical form of a partial-index predicate over physical fields. Equality is the
 * same as for the SQL the framework generates from a `ConstraintPredicate`
 * (`predicateSQLForOperator`): `equals v` and `in [v]` both become membership in {v};
 * `isNull` / `equals null` become membership in {NULL}; the negative operators mirror this.
 */
export type ManagedPredicateTerm =
    | { field: string, op: 'in', values: ConstraintPredicateValue[], includesNull: boolean }
    | { field: string, op: 'notIn', values: ConstraintPredicateValue[], excludesNull: boolean }

export type ManagedConstraintDefinition = {
    objectType: ManagedConstraintObjectType
    tableName: string
    fields: string[]
    where?: ManagedPredicateTerm[]
}

export type DesiredManagedConstraint = {
    kind: ManagedConstraintKind
    physicalName: string
    recordName: string
    /** Declared name: the UniqueConstraint / NonNullConstraint name or the identity name. */
    constraintName?: string
    properties?: string[]
    logicalPath: string
    definition: ManagedConstraintDefinition
    fingerprint: string
    createSQL: string
}

export type InstalledManagedConstraint = {
    kind: ManagedConstraintKind
    physicalName: string
    objectType: ManagedConstraintObjectType
    tableName: string
    fields: string[]
    unique: boolean
    hasPredicate: boolean
    /** PostgreSQL: the predicate as deparsed by the server (`pg_get_expr`). */
    predicate?: string
    hasExpressions?: boolean
    /** The catalog's own definition text. Shown to reviewers and pinned by removal approvals. */
    definitionText: string
    /** Definition fingerprint the framework recorded when it created the object (PostgreSQL comment). */
    fingerprint?: string
    /** SQLite: the CREATE statement text kept in sqlite_master. */
    storedSQL?: string
}

export type ManagedConstraintStatus = 'equal' | 'missing' | 'extra' | 'different' | 'undecidable'

export type ManagedConstraintReconciliationEntry = {
    status: ManagedConstraintStatus
    kind: ManagedConstraintKind
    physicalName: string
    tableName: string
    desired?: DesiredManagedConstraint
    installed?: InstalledManagedConstraint
    /** Equal, but the catalog does not yet record the definition fingerprint. */
    needsFingerprint?: boolean
    reason: string
}

// ---------------------------------------------------------------------------
// Canonical predicates
// ---------------------------------------------------------------------------

function valueKey(value: ConstraintPredicateValue) {
    return `${typeof value}:${String(value)}`
}

function normalizeValues(values: ConstraintPredicateValue[]) {
    const byKey = new Map<string, ConstraintPredicateValue>()
    for (const value of values) {
        if (value !== null) byKey.set(valueKey(value), value)
    }
    return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, value]) => value)
}

function inTerm(field: string, values: ConstraintPredicateValue[], includesNull: boolean): ManagedPredicateTerm {
    return { field, op: 'in', values: normalizeValues(values), includesNull }
}

function notInTerm(field: string, values: ConstraintPredicateValue[], excludesNull: boolean): ManagedPredicateTerm {
    return { field, op: 'notIn', values: normalizeValues(values), excludesNull }
}

// AND of several terms on one field occurs when the server flattens
// `(x IS NOT NULL AND x NOT IN (...))` into the surrounding conjunction.
function mergeConjunction(terms: ManagedPredicateTerm[]): ManagedPredicateTerm[] | undefined {
    const byField = new Map<string, ManagedPredicateTerm>()
    for (const term of terms) {
        const existing = byField.get(term.field)
        if (!existing) {
            byField.set(term.field, term)
            continue
        }
        if (existing.op !== 'notIn' || term.op !== 'notIn') return undefined
        byField.set(term.field, notInTerm(term.field, [...existing.values, ...term.values], existing.excludesNull || term.excludesNull))
    }
    return [...byField.values()].sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0))
}

export function canonicalizeConstraintPredicate(where: ConstraintPredicate | undefined, resolveField: (property: string) => string): ManagedPredicateTerm[] | undefined {
    const entries = Object.entries(where || {})
    if (!entries.length) return undefined
    const terms = entries.map(([property, operator]): ManagedPredicateTerm => {
        const field = resolveField(property)
        switch (operator.op) {
            case 'isNull':
                return inTerm(field, [], true)
            case 'isNotNull':
                return notInTerm(field, [], true)
            case 'equals':
                return operator.value === null ? inTerm(field, [], true) : inTerm(field, [operator.value], false)
            case 'notEquals':
                return operator.value === null ? notInTerm(field, [], true) : notInTerm(field, [operator.value], false)
            case 'in':
                return inTerm(field, operator.value, operator.value.some(value => value === null))
            case 'notIn':
                return notInTerm(field, operator.value, operator.value.some(value => value === null))
        }
    })
    const merged = mergeConjunction(terms)
    if (!merged) throw new Error(`constraint predicate assigns conflicting operators to one physical field`)
    return merged
}

function predicatesEqual(a: ManagedPredicateTerm[] | undefined, b: ManagedPredicateTerm[] | undefined) {
    return stableJSON(a || []) === stableJSON(b || [])
}

// ---------------------------------------------------------------------------
// PostgreSQL predicate parser
// ---------------------------------------------------------------------------
//
// Indexes created before the framework recorded definition fingerprints carry no
// comment. For a partial index, the only catalog form of the predicate is the server's
// deparsed text (`((status = 'active'::text) AND (n = (1)::double precision))`). The
// parser accepts the closed set of shapes the framework generates (six operators,
// AND-combined, with the server's casts, `= ANY (ARRAY[...])` and `<> ALL (ARRAY[...])`
// rewrites). Any other text is reported as undecidable, never as equal.

type Token =
    | { type: 'string', value: string }
    | { type: 'ident', value: string }
    | { type: 'word', value: string }
    | { type: 'number', value: number }
    | { type: 'punct', value: string }

const KEYWORDS = new Set(['AND', 'OR', 'IS', 'NOT', 'NULL', 'ANY', 'ALL', 'ARRAY', 'TRUE', 'FALSE'])
const NUMERIC_TYPES = /^(integer|int|int2|int4|int8|bigint|smallint|numeric|decimal|real|double precision|float4|float8)$/

function tokenize(text: string): Token[] | undefined {
    const tokens: Token[] = []
    let i = 0
    while (i < text.length) {
        const char = text[i]
        if (/\s/.test(char)) { i++; continue }
        if (char === "'" || char === '"') {
            let value = ''
            i++
            for (;;) {
                if (i >= text.length) return undefined
                if (text[i] === char) {
                    if (text[i + 1] === char) { value += char; i += 2; continue }
                    i++
                    break
                }
                value += text[i++]
            }
            tokens.push(char === "'" ? { type: 'string', value } : { type: 'ident', value })
            continue
        }
        if (text.startsWith('::', i)) { tokens.push({ type: 'punct', value: '::' }); i += 2; continue }
        if (text.startsWith('<>', i) || text.startsWith('!=', i)) { tokens.push({ type: 'punct', value: '<>' }); i += 2; continue }
        if ('=()[],'.includes(char)) { tokens.push({ type: 'punct', value: char }); i++; continue }
        const number = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
        if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); i += number[0].length; continue }
        const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(text.slice(i))
        if (word) { tokens.push({ type: 'word', value: word[0] }); i += word[0].length; continue }
        return undefined
    }
    return tokens
}

type ParsedNode =
    | { type: 'and' | 'or', items: ParsedNode[] }
    | { type: 'term', term: ManagedPredicateTerm }

class PredicateParser {
    private position = 0
    constructor(private tokens: Token[]) {}

    parse(): ParsedNode | undefined {
        const node = this.parseOr()
        return node && this.position === this.tokens.length ? node : undefined
    }

    private peek() { return this.tokens[this.position] }
    private isPunct(value: string) { const token = this.peek(); return token?.type === 'punct' && token.value === value }
    private isKeyword(value: string) { const token = this.peek(); return token?.type === 'word' && token.value.toUpperCase() === value }
    private eatPunct(value: string) { if (!this.isPunct(value)) return false; this.position++; return true }
    private eatKeyword(value: string) { if (!this.isKeyword(value)) return false; this.position++; return true }

    private parseOr(): ParsedNode | undefined {
        const items = [this.parseAnd()]
        while (this.eatKeyword('OR')) items.push(this.parseAnd())
        if (items.some(item => !item)) return undefined
        return items.length === 1 ? items[0] : { type: 'or', items: items as ParsedNode[] }
    }

    private parseAnd(): ParsedNode | undefined {
        const items = [this.parseUnary()]
        while (this.eatKeyword('AND')) items.push(this.parseUnary())
        if (items.some(item => !item)) return undefined
        return items.length === 1 ? items[0] : { type: 'and', items: items as ParsedNode[] }
    }

    private parseUnary(): ParsedNode | undefined {
        const start = this.position
        const comparison = this.parseComparison()
        if (comparison) return comparison
        this.position = start
        if (!this.eatPunct('(')) return undefined
        const inner = this.parseOr()
        if (!inner || !this.eatPunct(')')) return undefined
        return inner
    }

    private parseComparison(): ParsedNode | undefined {
        const field = this.parseOperand()
        if (field === undefined) return undefined
        if (this.eatKeyword('IS')) {
            const negated = this.eatKeyword('NOT')
            if (!this.eatKeyword('NULL')) return undefined
            return { type: 'term', term: negated ? notInTerm(field, [], true) : inTerm(field, [], true) }
        }
        const positive = this.eatPunct('=')
        if (!positive && !this.eatPunct('<>')) return undefined
        if (this.isKeyword('ANY') || this.isKeyword('ALL')) {
            const quantifier = (this.peek() as { value: string }).value.toUpperCase()
            if ((quantifier === 'ANY') !== positive) return undefined
            this.position++
            if (!this.eatPunct('(')) return undefined
            const values = this.parseArray()
            if (!values || !this.eatPunct(')')) return undefined
            return { type: 'term', term: positive ? inTerm(field, values, false) : notInTerm(field, values, false) }
        }
        const value = this.parseLiteral()
        if (value === undefined) return undefined
        return { type: 'term', term: positive ? inTerm(field, [value], false) : notInTerm(field, [value], false) }
    }

    private parseOperand(): string | undefined {
        if (this.eatPunct('(')) {
            const inner = this.parseOperand()
            if (inner === undefined || !this.eatPunct(')')) return undefined
            this.parseCast()
            return inner
        }
        const token = this.peek()
        if (token?.type === 'ident' || (token?.type === 'word' && !KEYWORDS.has(token.value.toUpperCase()))) {
            this.position++
            if (this.parseCast() === null) return undefined
            return token.value
        }
        return undefined
    }

    /** Returns the cast type name, undefined when there is no cast, null when malformed. */
    private parseCast(): string | undefined | null {
        if (!this.eatPunct('::')) return undefined
        const words: string[] = []
        for (let token = this.peek(); token?.type === 'word' && !KEYWORDS.has(token.value.toUpperCase()); token = this.peek()) {
            words.push(token.value.toLowerCase())
            this.position++
        }
        if (!words.length) return null
        if (this.isPunct('(')) {
            const start = this.position
            this.position++
            while (this.peek()?.type === 'number' || this.isPunct(',')) this.position++
            if (!this.eatPunct(')')) this.position = start
        }
        while (this.isPunct('[') && this.tokens[this.position + 1]?.type === 'punct' && (this.tokens[this.position + 1] as { value: string }).value === ']') {
            this.position += 2
        }
        return words.join(' ')
    }

    private parseArray(): ConstraintPredicateValue[] | undefined {
        if (!this.eatKeyword('ARRAY') || !this.eatPunct('[')) return undefined
        const values: ConstraintPredicateValue[] = []
        for (;;) {
            const value = this.parseLiteral()
            if (value === undefined) return undefined
            values.push(value)
            if (this.eatPunct(']')) break
            if (!this.eatPunct(',')) return undefined
        }
        if (this.parseCast() === null) return undefined
        return values
    }

    private parseLiteral(): ConstraintPredicateValue | undefined {
        let value: ConstraintPredicateValue | undefined
        if (this.eatPunct('(')) {
            value = this.parseLiteral()
            if (value === undefined || !this.eatPunct(')')) return undefined
        } else {
            const token = this.peek()
            if (token?.type === 'string' || token?.type === 'number') {
                value = token.value
            } else if (this.isKeyword('TRUE') || this.isKeyword('FALSE')) {
                value = (token as { value: string }).value.toUpperCase() === 'TRUE'
            } else {
                return undefined
            }
            this.position++
        }
        const cast = this.parseCast()
        if (cast === null) return undefined
        if (typeof value === 'string' && cast && NUMERIC_TYPES.test(cast)) {
            const number = Number(value)
            return Number.isFinite(number) ? number : undefined
        }
        if (typeof value === 'string' && cast === 'boolean') {
            if (/^(t|true)$/i.test(value)) return true
            if (/^(f|false)$/i.test(value)) return false
            return undefined
        }
        return value
    }
}

function flatten(node: ParsedNode, type: 'and' | 'or'): ParsedNode[] {
    return node.type === type ? node.items.flatMap(item => flatten(item, type)) : [node]
}

function disjunctionTerm(node: ParsedNode): ManagedPredicateTerm | undefined {
    if (node.type === 'term') return node.term
    if (node.type !== 'or') return undefined
    const terms = flatten(node, 'or').map(item => item.type === 'term' ? item.term : undefined)
    if (terms.some(term => !term || term.op !== 'in' || term.field !== terms[0]!.field)) return undefined
    const inTerms = terms as Extract<ManagedPredicateTerm, { op: 'in' }>[]
    return inTerm(inTerms[0].field, inTerms.flatMap(term => term.values), inTerms.some(term => term.includesNull))
}

export function parsePostgresPredicate(text: string): ManagedPredicateTerm[] | undefined {
    const tokens = tokenize(text)
    if (!tokens) return undefined
    const node = new PredicateParser(tokens).parse()
    if (!node) return undefined
    const terms = flatten(node, 'and').map(disjunctionTerm)
    if (terms.some(term => !term)) return undefined
    return mergeConjunction(terms as ManagedPredicateTerm[])
}

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

function stableJSON(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableJSON((value as Record<string, unknown>)[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}

export function managedConstraintFingerprint(definition: ManagedConstraintDefinition) {
    return createHash('sha1').update(stableJSON(definition)).digest('hex').slice(0, 20)
}

const FINGERPRINT_COMMENT_PREFIX = 'interaqt-constraint:v1:'

export function managedConstraintFingerprintComment(fingerprint: string) {
    return `${FINGERPRINT_COMMENT_PREFIX}${fingerprint}`
}

export function parseManagedConstraintFingerprintComment(comment: unknown): string | undefined {
    if (typeof comment !== 'string' || !comment.startsWith(FINGERPRINT_COMMENT_PREFIX)) return undefined
    return comment.slice(FINGERPRINT_COMMENT_PREFIX.length) || undefined
}

// ---------------------------------------------------------------------------
// Desired set
// ---------------------------------------------------------------------------

export function createDesiredManagedConstraint(input: Omit<DesiredManagedConstraint, 'fingerprint'>): DesiredManagedConstraint {
    return { ...input, fingerprint: managedConstraintFingerprint(input.definition) }
}

export function createDesiredTransformUniqueIndex(input: {
    recordName: string
    logicalPath: string
    tableName: string
    fields: string[]
    physicalName: string
    dialect: SchemaDialect
}): DesiredManagedConstraint {
    return createDesiredManagedConstraint({
        kind: 'transform-unique',
        physicalName: input.physicalName,
        recordName: input.recordName,
        logicalPath: input.logicalPath,
        definition: { objectType: 'index', tableName: input.tableName, fields: [...input.fields] },
        createSQL: createUniqueIndexSQL(input.physicalName, input.tableName, input.fields, input.dialect),
    })
}

/**
 * The single desired set: everything a fresh install of the model creates, in creation
 * order. `dbSetup.createConstraintSQL()` throws for constraints the dialect cannot
 * express; callers keep that fail-fast.
 */
export function buildDesiredManagedConstraints(dbSetup: DBSetup, dialect: SchemaDialect, extra: DesiredManagedConstraint[] = []): DesiredManagedConstraint[] {
    const desired: DesiredManagedConstraint[] = []
    for (const statement of dbSetup.createConstraintSQL()) {
        const item = statement.item
        if (item.kind === 'unique') {
            desired.push(createDesiredManagedConstraint({
                kind: 'unique',
                physicalName: item.physicalName,
                recordName: item.recordName,
                constraintName: item.constraintName,
                properties: [...item.properties],
                logicalPath: `${item.recordName}.${item.properties.join('.')}`,
                definition: {
                    objectType: 'index',
                    tableName: item.tableName,
                    fields: [...item.fields],
                    where: canonicalizeConstraintPredicate(item.where, property => statement.predicateFields?.[property] ?? property),
                },
                createSQL: statement.sql,
            }))
        } else {
            desired.push(createDesiredManagedConstraint({
                kind: 'non-null',
                physicalName: item.physicalName,
                recordName: item.recordName,
                constraintName: item.constraintName,
                properties: [item.property],
                logicalPath: `${item.recordName}.${item.property}`,
                definition: { objectType: 'check', tableName: item.tableName, fields: [item.field] },
                createSQL: statement.sql,
            }))
        }
    }
    for (const item of createFrameworkLogicalIdUniqueIndexSQL(dbSetup.map, dialect)) {
        desired.push(createDesiredManagedConstraint({
            kind: 'logical-id',
            physicalName: item.indexName,
            recordName: item.recordName,
            properties: ['id'],
            logicalPath: `${item.recordName}.id`,
            definition: { objectType: 'index', tableName: item.table, fields: [item.idField] },
            createSQL: item.sql,
        }))
    }
    for (const item of createFrameworkApplicationIdentityIndexSQL(dbSetup.map, dialect)) {
        desired.push(createDesiredManagedConstraint({
            kind: 'identity',
            physicalName: item.indexName,
            recordName: item.recordName,
            constraintName: dbSetup.map.records[item.recordName]?.identity?.name,
            properties: [...item.properties],
            logicalPath: `${item.recordName}.identity.${item.properties.join('.')}`,
            definition: { objectType: 'index', tableName: item.table, fields: [...item.fields] },
            createSQL: item.sql,
        }))
    }
    desired.push(...extra)
    const names = new Set<string>()
    for (const item of desired) {
        if (names.has(item.physicalName)) {
            throw new Error(`two managed constraints resolve to the same physical name "${item.physicalName}"`)
        }
        names.add(item.physicalName)
    }
    return desired
}

// ---------------------------------------------------------------------------
// Installed set (catalog)
// ---------------------------------------------------------------------------

function parseJSONArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === 'string' && value) {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
    }
    return []
}

async function readPostgresManagedConstraints(db: Database): Promise<InstalledManagedConstraint[]> {
    const indexRows = await db.query<{ name: string, tableName: string, isUnique: boolean, columns: string | null, predicate: string | null, hasExpressions: boolean, definition: string, comment: string | null }>(
        `SELECT c.relname AS "name", t.relname AS "tableName", i.indisunique AS "isUnique",
            (SELECT json_agg(a.attname::text ORDER BY k.ord) FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)::text AS "columns",
            pg_get_expr(i.indpred, i.indrelid) AS "predicate",
            (i.indexprs IS NOT NULL) AS "hasExpressions",
            pg_get_indexdef(i.indexrelid) AS "definition",
            obj_description(c.oid, 'pg_class') AS "comment"
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'`,
        [],
        'read managed constraint indexes',
    )
    const checkRows = await db.query<{ name: string, tableName: string, columns: string | null, definition: string, comment: string | null }>(
        `SELECT con.conname AS "name", t.relname AS "tableName",
            (SELECT json_agg(a.attname::text ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum)::text AS "columns",
            pg_get_constraintdef(con.oid) AS "definition",
            obj_description(con.oid, 'pg_constraint') AS "comment"
        FROM pg_constraint con
        JOIN pg_class t ON t.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'c'`,
        [],
        'read managed constraint checks',
    )
    const installed: InstalledManagedConstraint[] = []
    for (const row of indexRows) {
        const kind = classifyManagedConstraintName(row.name, 'index')
        if (!kind) continue
        installed.push({
            kind,
            physicalName: row.name,
            objectType: 'index',
            tableName: row.tableName,
            fields: parseJSONArray(row.columns),
            unique: row.isUnique === true,
            hasPredicate: row.predicate !== null && row.predicate !== undefined,
            predicate: row.predicate ?? undefined,
            hasExpressions: row.hasExpressions === true,
            definitionText: row.definition,
            fingerprint: parseManagedConstraintFingerprintComment(row.comment),
        })
    }
    for (const row of checkRows) {
        const kind = classifyManagedConstraintName(row.name, 'check')
        if (!kind) continue
        installed.push({
            kind,
            physicalName: row.name,
            objectType: 'check',
            tableName: row.tableName,
            fields: parseJSONArray(row.columns),
            unique: false,
            hasPredicate: false,
            definitionText: row.definition,
            fingerprint: parseManagedConstraintFingerprintComment(row.comment),
        })
    }
    return installed
}

function sqliteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`
}

async function readSQLiteManagedConstraints(db: Database): Promise<InstalledManagedConstraint[]> {
    const indexRows = await db.query<{ name: string, tableName: string, sql: string }>(
        `SELECT name AS "name", tbl_name AS "tableName", sql AS "sql" FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`,
        [],
        'read managed constraint indexes',
    )
    const installed: InstalledManagedConstraint[] = []
    for (const row of indexRows) {
        const kind = classifyManagedConstraintName(row.name, 'index')
        if (!kind) continue
        const columns = await db.query<{ name: string }>(
            `SELECT name AS "name" FROM pragma_index_info(${sqliteLiteral(row.name)}) ORDER BY seqno`,
            [],
            'read managed constraint index columns',
        )
        const flags = await db.query<{ isUnique: number, partial: number }>(
            `SELECT "unique" AS "isUnique", partial AS "partial" FROM pragma_index_list(${sqliteLiteral(row.tableName)}) WHERE name = ${sqliteLiteral(row.name)}`,
            [],
            'read managed constraint index flags',
        )
        installed.push({
            kind,
            physicalName: row.name,
            objectType: 'index',
            tableName: row.tableName,
            fields: columns.map(column => column.name),
            unique: Number(flags[0]?.isUnique) === 1,
            hasPredicate: Number(flags[0]?.partial) === 1,
            definitionText: row.sql,
            storedSQL: row.sql,
        })
    }
    return installed
}

async function readMySQLManagedConstraints(db: Database, dialect: SchemaDialect): Promise<InstalledManagedConstraint[]> {
    // information_schema returns upper-case column headers on MySQL 8: alias every column.
    const rows = await db.query<{ name: string, tableName: string, columnName: string, seq: number | string, nonUnique: number | string }>(
        'SELECT INDEX_NAME AS `name`, TABLE_NAME AS `tableName`, COLUMN_NAME AS `columnName`, SEQ_IN_INDEX AS `seq`, NON_UNIQUE AS `nonUnique` FROM information_schema.statistics WHERE table_schema = DATABASE()',
        [],
        'read managed constraint indexes',
    )
    const byName = new Map<string, typeof rows>()
    for (const row of rows) {
        if (!classifyManagedConstraintName(row.name, 'index')) continue
        if (!byName.has(row.name)) byName.set(row.name, [])
        byName.get(row.name)!.push(row)
    }
    return [...byName.entries()].map(([name, indexRows]) => {
        const sorted = [...indexRows].sort((a, b) => Number(a.seq) - Number(b.seq))
        const unique = Number(sorted[0].nonUnique) === 0
        const tableName = sorted[0].tableName
        const fields = sorted.map(row => row.columnName)
        return {
            kind: classifyManagedConstraintName(name, 'index')!,
            physicalName: name,
            objectType: 'index' as const,
            tableName,
            fields,
            unique,
            hasPredicate: false,
            definitionText: `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(name, dialect)} ON ${quoteIdentifier(tableName, dialect)} (${fields.map(field => quoteIdentifier(field, dialect)).join(', ')})`,
        }
    })
}

/** Framework-owned constraint objects on the given tables, read from the catalog. */
export async function readInstalledManagedConstraints(db: Database, dialect: SchemaDialect, tableNames: Iterable<string>): Promise<InstalledManagedConstraint[]> {
    const tables = new Set(tableNames)
    const installed = dialect.name === 'postgres'
        ? await readPostgresManagedConstraints(db)
        : dialect.name === 'sqlite'
        ? await readSQLiteManagedConstraints(db)
        : await readMySQLManagedConstraints(db, dialect)
    return installed.filter(item => tables.has(item.tableName))
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

function sameFields(a: string[], b: string[]) {
    return a.length === b.length && a.every((field, index) => field === b[index])
}

function normalizeSQLiteIndexSQL(sql: string | undefined) {
    return (sql || '').replace(/^CREATE UNIQUE INDEX IF NOT EXISTS /i, 'CREATE UNIQUE INDEX ').trim()
}

function isNonNullCheckDefinition(definitionText: string, field: string) {
    const match = /^CHECK \(\(?(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*)) IS NOT NULL\)?\)$/.exec(definitionText.trim())
    if (!match) return false
    return (match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]) === field
}

function compareManagedConstraint(desired: DesiredManagedConstraint, installed: InstalledManagedConstraint, dialect: SchemaDialect): { status: 'equal' | 'different' | 'undecidable', reason: string } {
    const definition = desired.definition
    if (definition.objectType !== installed.objectType) return { status: 'different', reason: `installed object is a ${installed.objectType}, declared ${definition.objectType}` }
    if (definition.tableName !== installed.tableName) return { status: 'different', reason: `installed on table "${installed.tableName}", declared on "${definition.tableName}"` }
    if (!sameFields(definition.fields, installed.fields)) return { status: 'different', reason: `installed columns (${installed.fields.join(', ')}) differ from declared (${definition.fields.join(', ')})` }
    if (installed.objectType === 'check') {
        return isNonNullCheckDefinition(installed.definitionText, definition.fields[0])
            ? { status: 'equal', reason: 'installed definition matches the declaration' }
            : { status: 'different', reason: `installed check "${installed.definitionText}" is not the declared non-null check` }
    }
    if (!installed.unique) return { status: 'different', reason: 'installed index is not unique' }
    if (installed.hasExpressions) return { status: 'different', reason: 'installed index uses expressions' }
    const declaredPartial = !!definition.where?.length
    if (declaredPartial !== installed.hasPredicate) {
        return { status: 'different', reason: declaredPartial ? 'installed index has no predicate; the declaration has one' : 'installed index has a predicate; the declaration has none' }
    }
    if (installed.fingerprint !== undefined) {
        return installed.fingerprint === desired.fingerprint
            ? { status: 'equal', reason: 'recorded definition fingerprint matches the declaration' }
            : { status: 'different', reason: 'recorded definition fingerprint differs from the declaration' }
    }
    if (!declaredPartial) return { status: 'equal', reason: 'installed definition matches the declaration' }
    if (dialect.name === 'sqlite') {
        return normalizeSQLiteIndexSQL(installed.storedSQL) === normalizeSQLiteIndexSQL(desired.createSQL)
            ? { status: 'equal', reason: 'installed definition matches the declaration' }
            : { status: 'undecidable', reason: 'installed predicate text differs from the generated statement and cannot be compared structurally' }
    }
    if (dialect.name === 'postgres' && installed.predicate !== undefined) {
        const parsed = parsePostgresPredicate(installed.predicate)
        if (!parsed) return { status: 'undecidable', reason: `installed predicate "${installed.predicate}" is outside the predicate forms the framework generates` }
        return predicatesEqual(parsed, definition.where)
            ? { status: 'equal', reason: 'installed predicate matches the declaration' }
            : { status: 'different', reason: `installed predicate "${installed.predicate}" differs from the declaration` }
    }
    return { status: 'undecidable', reason: 'installed predicate cannot be read on this dialect' }
}

export function reconcileManagedConstraints(desired: DesiredManagedConstraint[], installed: InstalledManagedConstraint[], dialect: SchemaDialect): ManagedConstraintReconciliationEntry[] {
    const installedByName = new Map(installed.map(item => [item.physicalName, item]))
    const entries: ManagedConstraintReconciliationEntry[] = []
    for (const item of desired) {
        const current = installedByName.get(item.physicalName)
        installedByName.delete(item.physicalName)
        if (!current) {
            entries.push({ status: 'missing', kind: item.kind, physicalName: item.physicalName, tableName: item.definition.tableName, desired: item, reason: 'declared but not installed' })
            continue
        }
        const comparison = compareManagedConstraint(item, current, dialect)
        entries.push({
            status: comparison.status,
            kind: item.kind,
            physicalName: item.physicalName,
            tableName: item.definition.tableName,
            desired: item,
            installed: current,
            needsFingerprint: comparison.status === 'equal' && dialect.name === 'postgres' && current.fingerprint === undefined,
            reason: comparison.reason,
        })
    }
    for (const current of installedByName.values()) {
        entries.push({ status: 'extra', kind: current.kind, physicalName: current.physicalName, tableName: current.tableName, installed: current, reason: 'installed but no longer declared' })
    }
    return entries
}

/**
 * Removing or redefining a declared guarantee (UniqueConstraint, NonNullConstraint,
 * Entity.identity) needs an explicit migration decision. Framework-internal indexes
 * (logical id, Transform) are rebuilt or dropped as listed changes.
 */
export function requiresConstraintRemovalApproval(entry: ManagedConstraintReconciliationEntry) {
    return (entry.status === 'extra' || entry.status === 'different')
        && (entry.kind === 'unique' || entry.kind === 'non-null' || entry.kind === 'identity')
}

/**
 * setup(false) refuses to start on every decidable difference except leftover Transform
 * indexes: those cover bound-state columns that the model no longer writes (NULL never
 * conflicts) or duplicate the current index under the pre-r26 name. Undecidable
 * definitions do not block startup; the next migration rebuilds them.
 */
export function isStartupBlockingConstraintMismatch(entry: ManagedConstraintReconciliationEntry) {
    if (entry.status === 'missing' || entry.status === 'different') return true
    return entry.status === 'extra' && entry.kind !== 'transform-unique'
}

export function describeManagedConstraintEntry(entry: ManagedConstraintReconciliationEntry) {
    const subject = entry.desired?.constraintName
        ? `${entry.kind} "${entry.desired.constraintName}" (${entry.physicalName})`
        : `${entry.kind} ${entry.physicalName}`
    return `${entry.status} ${subject} on "${entry.tableName}": ${entry.reason}`
}

export function managedConstraintDropSQL(installed: InstalledManagedConstraint, dialect: SchemaDialect) {
    const name = quoteIdentifier(installed.physicalName, dialect)
    const table = quoteIdentifier(installed.tableName, dialect)
    if (installed.objectType === 'check') return `ALTER TABLE ${table} DROP CONSTRAINT ${name}`
    return dialect.name === 'mysql' ? `DROP INDEX ${name} ON ${table}` : `DROP INDEX ${name}`
}

/** PostgreSQL records the definition fingerprint as an object comment; other dialects need none. */
export function managedConstraintFingerprintSQL(desired: DesiredManagedConstraint, dialect: SchemaDialect): string | undefined {
    if (dialect.name !== 'postgres') return undefined
    const comment = `'${managedConstraintFingerprintComment(desired.fingerprint)}'`
    const name = quoteIdentifier(desired.physicalName, dialect)
    return desired.definition.objectType === 'check'
        ? `COMMENT ON CONSTRAINT ${name} ON ${quoteIdentifier(desired.definition.tableName, dialect)} IS ${comment}`
        : `COMMENT ON INDEX ${name} IS ${comment}`
}
