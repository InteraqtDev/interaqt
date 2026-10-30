import type { ManagedConstraintKind } from "@storage";
import {
    getStorageBlockingChanges,
    MIGRATION_MANIFEST_CONCEPT,
    MIGRATION_MANIFEST_CURRENT_KEY,
    MigrationError,
    type FactPropertyBackfill,
    type MigrationCompatibility,
    type MigrationConstraintChange,
    type MigrationDecision,
    type MigrationDecisionRequirement,
    type MigrationManifest,
    type SetupOptions,
    type StorageBlockingChange,
} from "./migration.js";

/**
 * N-1 attach (one2x-ai/mesh#2826): letting the code of release N-1 start on a database already
 * migrated to release N (rollback, canary restart).
 *
 * Normal attach requires the stored manifest's modelHash to equal the hash of the current
 * declarations. Two sources can admit a different stored model, both through
 * `resolveManifestMode`:
 * - the migration's own declaration: migrate classifies itself (`classifyMigrationCompatibility`)
 *   and records `compatibleFrom: [previous modelHash]` in the manifest when compatible
 *   (`manifestMode: 'declared-compatible'`, the default path, no option needed);
 * - the explicit override `setup({ acceptModelHashes })` (`manifestMode: 'accepted'`).
 * Either way the schema superset check then verifies the database. The guarantee is read
 * compatibility only; write-semantics compatibility is the application's expand/contract
 * discipline and is not checked here.
 */

/** Hard limit on `acceptModelHashes`: the current release and the previous one. */
export const MAX_ACCEPTED_MODEL_HASHES = 2;

/**
 * How setup admitted the stored manifest: `exact` — the stored modelHash equals the declared
 * one; `declared-compatible` — it differs and the manifest's `compatibleFrom` lists the declared
 * modelHash; `accepted` — it differs and is listed in `acceptModelHashes`.
 */
export type SetupManifestMode = "exact" | "declared-compatible" | "accepted";

export type SetupAcceptance = {
    acceptModelHashes: string[];
    requireSchemaSuperset: boolean;
};

/**
 * One reason the live database is not a superset of what the current model maps to.
 * Physical names (`tableName`, `columnName`) are the database identifiers; `logicalPath`
 * (`Record.property`) is present when the column belongs to a declared value property.
 */
export type SchemaSupersetViolation =
    | {
        kind: "missing-table";
        tableName: string;
        /** Declared records stored in this table; empty for framework-internal tables. */
        recordNames: string[];
    }
    | {
        kind: "missing-column";
        tableName: string;
        columnName: string;
        logicalPath?: string;
        declaredType?: string;
    }
    | {
        kind: "incompatible-column-type";
        tableName: string;
        columnName: string;
        logicalPath?: string;
        /** Column type as the current model declares it (the DDL fragment). */
        declaredType: string;
        /** The declared type in the dialect's catalog form. */
        expectedType: string;
        /** The column's type as read from the database catalog. */
        actualType: string;
    }
    | {
        /**
         * Logical difference between the declared model and the database's manifest model:
         * a record or attribute the current code maps to is absent from the database model,
         * stored at another physical location, or typed differently. Derived with the
         * migration planner's own blocking-change rules (getStorageBlockingChanges, declared
         * model as "old", database model as "new"), plus computed-attribute moves, which a
         * migration may perform but which leave the current code reading a stale column.
         */
        kind: "model-difference";
        logicalPath: string;
        change: StorageBlockingChange["kind"] | "computed-physical-path-move";
        declaredPhysicalPath?: string;
        databasePhysicalPath?: string;
        reason: string;
    }
    | {
        /**
         * A managed constraint object that differs between the declared model and the live
         * catalog, using the same predicate as the attach-time reconciliation. `extra` is an
         * object the accepted (newer) model installed and the current code does not declare;
         * it can reject this code's writes, so it counts as incompatible.
         */
        kind: "constraint-mismatch";
        status: "missing" | "extra" | "different";
        constraintKind: ManagedConstraintKind;
        tableName: string;
        physicalName: string;
        constraintName?: string;
        recordName?: string;
        reason: string;
    };

/** setup refused to attach in accepted mode: the live schema lacks what the current model needs. */
export class SchemaSupersetError extends MigrationError {}

/**
 * Validate and normalize the acceptance options. Boolean and omitted forms yield an empty
 * accept set, which keeps the strict comparison. Conflicting combinations fail fast instead
 * of being ignored: install writes the declared manifest and migrate moves the database to
 * the declared model, so neither has a stored model to accept.
 */
export function resolveSetupAcceptance(options: boolean | SetupOptions | undefined): SetupAcceptance {
    if (typeof options !== "object" || options === null) {
        return { acceptModelHashes: [], requireSchemaSuperset: true };
    }
    const { acceptModelHashes, requireSchemaSuperset } = options;
    if (requireSchemaSuperset !== undefined && typeof requireSchemaSuperset !== "boolean") {
        throw new Error(`setup(): requireSchemaSuperset must be a boolean when present; got ${typeof requireSchemaSuperset}.`);
    }
    if (acceptModelHashes === undefined) {
        return { acceptModelHashes: [], requireSchemaSuperset: requireSchemaSuperset !== false };
    }
    if (!Array.isArray(acceptModelHashes)) {
        throw new Error(`setup(): acceptModelHashes must be an array of model hash strings; got ${typeof acceptModelHashes}.`);
    }
    if (acceptModelHashes.length > MAX_ACCEPTED_MODEL_HASHES) {
        throw new Error(
            `setup(): acceptModelHashes accepts at most ${MAX_ACCEPTED_MODEL_HASHES} hashes (the current release and the previous one); got ${acceptModelHashes.length}.`
        );
    }
    const seen = new Set<string>();
    for (const hash of acceptModelHashes) {
        if (typeof hash !== "string" || hash.length === 0) {
            throw new Error(`setup(): acceptModelHashes entries must be non-empty strings; got ${JSON.stringify(hash)}.`);
        }
        if (seen.has(hash)) {
            throw new Error(`setup(): acceptModelHashes contains a duplicate hash "${hash}".`);
        }
        seen.add(hash);
    }
    if (acceptModelHashes.length > 0) {
        if (options.install === true) {
            throw new Error("setup(): acceptModelHashes cannot be combined with install: true. install creates the database and writes the declared model's manifest; there is no stored model to accept.");
        }
        if (options.migrate) {
            throw new Error("setup(): acceptModelHashes cannot be combined with migrate. migrate moves the database to the declared model; acceptModelHashes only applies to attaching without migration.");
        }
    }
    return { acceptModelHashes: [...acceptModelHashes], requireSchemaSuperset: requireSchemaSuperset !== false };
}

/**
 * The single acceptance decision for attach. Returns how the stored manifest is admitted, or
 * throws the mismatch error. Every rule about which stored model the current code may start on
 * lives here: the database's own declaration first, then the explicit override.
 */
export function resolveManifestMode(databaseManifest: MigrationManifest, declaredModelHash: string, acceptModelHashes: string[]): SetupManifestMode {
    if (databaseManifest.modelHash === declaredModelHash) return "exact";
    if (databaseManifest.compatibleFrom?.includes(declaredModelHash)) return "declared-compatible";
    if (acceptModelHashes.includes(databaseManifest.modelHash)) return "accepted";
    throw new Error(createModelManifestMismatchMessage(databaseManifest, declaredModelHash, acceptModelHashes));
}

export type MigrationCompatibilityInput = {
    previousManifest: MigrationManifest;
    nextManifest: MigrationManifest;
    /** The schema plan's constraint changes (catalog reconciliation against the next model). */
    constraintChanges: MigrationConstraintChange[];
    requiredDecisions: MigrationDecisionRequirement[];
    /** Approved decisions. Omitted for a freshly generated diff: the classification is then provisional. */
    decisions?: MigrationDecision[];
    /** New fact properties whose application-side default the migration backfills. */
    factPropertyBackfills: FactPropertyBackfill[];
};

/**
 * Classify a migration from `previousManifest` to `nextManifest`: can code built for the previous
 * model keep reading the database after it? Not compatible when
 * - the previous model's records or attributes are removed, moved, or retyped (the same logical
 *   check setup runs, `findModelSupersetViolations`);
 * - a constraint object changes on a table the previous model uses (an added one can reject the
 *   previous code's writes; a removed or changed one fails its attach-time reconciliation).
 *   Indexes of Transform outputs added to such a table are exempt, as at attach;
 * - an existing computation changes, is removed, or takes over a fact property (the previous
 *   code keeps maintaining that data with the old semantics), unless the change is approved
 *   as 'unchanged';
 * - a StateMachine's persisted states are remapped (the previous code writes the old names);
 * - a new fact property on an existing record relies on an application-side default (the
 *   database has no DEFAULT, so rows the previous code inserts hold NULL).
 * New tables, new columns without defaults, and new computations on new data stay compatible.
 */
export function classifyMigrationCompatibility(input: MigrationCompatibilityInput): MigrationCompatibility {
    const { previousManifest, nextManifest } = input;
    const reasons: string[] = findModelSupersetViolations(previousManifest, nextManifest).map(describeSchemaSupersetViolation);

    const previousTables = new Set((previousManifest.storage.tables || []).map(table => table.tableName));
    for (const change of input.constraintChanges) {
        if (!previousTables.has(change.tableName)) continue;
        if (change.reconciliation === "undecidable") continue;
        if (change.changeType === "added" && change.constraintKind === "transform-unique") continue;
        const subject = change.constraintName ? `"${change.constraintName}" (${change.physicalName})` : change.physicalName;
        reasons.push(`constraint ${change.changeType} on existing table "${change.tableName}": ${change.constraintKind} ${subject}`);
    }

    const provisional = input.decisions === undefined;
    const nextComputations = new Map(nextManifest.computations.map(computation => [computation.id, computation]));
    for (const previous of previousManifest.computations) {
        const next = nextComputations.get(previous.id);
        if (!next) {
            reasons.push(`existing computation removed: ${previous.dataContext}`);
            continue;
        }
        if (next.signature === previous.signature) continue;
        if (provisional) {
            reasons.push(`existing computation changed: ${next.dataContext} (not yet decided; approve it as 'unchanged' if the change is not semantic)`);
            continue;
        }
        const decision = input.decisions!.find(item => item.kind === "computation" && item.id === previous.id) as Extract<MigrationDecision, { kind: "computation" }> | undefined;
        if (decision?.decision === "unchanged") continue;
        reasons.push(`existing computation changed: ${next.dataContext} (decision: ${decision?.decision ?? "none"})`);
    }
    const takeovers = provisional
        ? input.requiredDecisions.filter(item => item.kind === "computation-takeover")
        : input.decisions!.filter(item => item.kind === "computation-takeover");
    for (const dataContext of [...new Set(takeovers.map(item => item.dataContext))].sort()) {
        reasons.push(`existing fact property taken over by a computation: ${dataContext}`);
    }

    const remaps = [...input.requiredDecisions, ...(input.decisions || [])].filter(item => item.kind === "state-graph-mapping");
    for (const dataContext of [...new Set(remaps.map(item => item.dataContext))].sort()) {
        reasons.push(`StateMachine state remap: ${dataContext} (persisted state names change; the previous code would keep writing the old names)`);
    }

    const previousRecords = new Set(previousManifest.records.map(record => record.name));
    for (const backfill of input.factPropertyBackfills) {
        if (!previousRecords.has(backfill.recordName)) continue;
        reasons.push(`new fact property ${backfill.recordName}.${backfill.propertyName} relies on an application-side default value; the database has no DEFAULT, so rows the previous code inserts would hold NULL`);
    }
    return { fromModelHash: previousManifest.modelHash, compatible: reasons.length === 0, reasons };
}

/**
 * The manifest a migration writes, carrying its declaration. Only the immediately previous
 * model is declared (`compatibleFrom` never chains). A migration that leaves the model unchanged
 * (reconciling constraint objects, for example) keeps the declaration of the migration that
 * produced the model.
 */
export function declareMigrationCompatibility(nextManifest: MigrationManifest, previousManifest: MigrationManifest, compatibility: MigrationCompatibility): MigrationManifest {
    if (previousManifest.modelHash === nextManifest.modelHash) {
        return {
            ...nextManifest,
            ...(previousManifest.compatibleFrom !== undefined ? { compatibleFrom: previousManifest.compatibleFrom } : {}),
            ...(previousManifest.compatibility !== undefined ? { compatibility: previousManifest.compatibility } : {}),
        };
    }
    return {
        ...nextManifest,
        compatibleFrom: compatibility.compatible ? [previousManifest.modelHash] : [],
        compatibility,
    };
}

/**
 * Logical superset check between the declared manifest and the database's manifest. Reuses the
 * migration planner's blocking-change rules: a change that would block migrating the declared
 * model to the database model is exactly something the current code needs and the database
 * model removed, moved, or retyped. Computed-attribute moves are exempt there (a migration
 * recomputes them into the new column) but not here: the current code would keep reading the
 * old column, which the newer release no longer maintains.
 */
export function findModelSupersetViolations(declaredManifest: MigrationManifest, databaseManifest: MigrationManifest): SchemaSupersetViolation[] {
    const violations: SchemaSupersetViolation[] = getStorageBlockingChanges(declaredManifest, databaseManifest).map(change => ({
        kind: "model-difference" as const,
        logicalPath: change.logicalPath,
        change: change.kind,
        declaredPhysicalPath: change.oldPhysicalPath,
        databasePhysicalPath: change.newPhysicalPath,
        reason: change.reason,
    }));
    const databaseRecords = new Map(databaseManifest.storage.records.map(record => [record.recordName, record]));
    for (const record of declaredManifest.storage.records) {
        const databaseRecord = databaseRecords.get(record.recordName);
        if (!databaseRecord) continue;
        const declaredLogical = declaredManifest.records.find(item => item.name === record.recordName);
        const databaseAttributes = new Map((databaseRecord.attributeDetails || []).map(attribute => [attribute.name, attribute]));
        for (const attribute of record.attributeDetails || []) {
            const databaseAttribute = databaseAttributes.get(attribute.name);
            if (!databaseAttribute) continue;
            const computed = declaredLogical?.properties.find(property => property.name === attribute.name)?.computed === true;
            if (!computed) continue;
            const declaredPath = attributePhysicalPath(attribute);
            const databasePath = attributePhysicalPath(databaseAttribute);
            if (declaredPath === databasePath) continue;
            violations.push({
                kind: "model-difference",
                logicalPath: `${record.recordName}.${attribute.name}`,
                change: "computed-physical-path-move",
                declaredPhysicalPath: declaredPath,
                databasePhysicalPath: databasePath,
                reason: "computed attribute is stored at a different physical location in the database model; the current code would read the old location, which the newer release no longer maintains",
            });
        }
    }
    return violations;
}

function attributePhysicalPath(attribute: { tableName?: string; fieldName?: string; sourceField?: string; targetField?: string }) {
    return `${attribute.tableName ?? "?"}.${attribute.fieldName ?? attribute.sourceField ?? attribute.targetField ?? "?"}`;
}

/**
 * The attach-time mismatch message. When the manifest carries no declaration and the accept set
 * is empty this is the exact pre-existing text (callers and runbooks match on it). Otherwise it
 * also lists the database's hash, the declared hash, the manifest's `compatibleFrom`, the accept
 * set, and the reasons the migration that wrote the manifest was classified incompatible.
 */
export function createModelManifestMismatchMessage(databaseManifest: MigrationManifest, declaredModelHash: string, acceptModelHashes: string[]) {
    const message = `Model manifest mismatch. Call controller.generateMigrationDiff(), review it, then call controller.migrate({ approvedDiff }). Manifest key: ${MIGRATION_MANIFEST_CONCEPT}/${MIGRATION_MANIFEST_CURRENT_KEY}`;
    const declaration = databaseManifest.compatibleFrom;
    if (!acceptModelHashes.length && declaration === undefined) return message;
    const details = [`database modelHash ${databaseManifest.modelHash}`, `declared modelHash ${declaredModelHash}`];
    if (declaration !== undefined) details.push(`the database manifest declares compatibleFrom [${declaration.join(", ")}]`);
    if (acceptModelHashes.length) details.push(`acceptModelHashes [${acceptModelHashes.join(", ")}]`);
    let text = `${message}. Not admitted: ${details.join("; ")}.`;
    const assessment = databaseManifest.compatibility;
    if (assessment && !assessment.compatible) {
        text += ` The migration from ${assessment.fromModelHash} to ${databaseManifest.modelHash} was classified incompatible: ${assessment.reasons.join("; ")}.`;
    }
    return text;
}

function describeColumn(tableName: string, columnName: string, logicalPath?: string) {
    return `"${tableName}"."${columnName}"${logicalPath ? ` (${logicalPath})` : ""}`;
}

export function describeSchemaSupersetViolation(violation: SchemaSupersetViolation) {
    switch (violation.kind) {
        case "missing-table":
            return `missing table "${violation.tableName}"${violation.recordNames.length ? ` (records: ${violation.recordNames.join(", ")})` : " (framework-internal table)"}`;
        case "missing-column":
            return `missing column ${describeColumn(violation.tableName, violation.columnName, violation.logicalPath)}${violation.declaredType ? `, declared ${violation.declaredType}` : ""}`;
        case "incompatible-column-type":
            return `column ${describeColumn(violation.tableName, violation.columnName, violation.logicalPath)} has catalog type ${violation.actualType}; the current model declares ${violation.declaredType} (catalog form ${violation.expectedType})`;
        case "model-difference": {
            const paths = violation.declaredPhysicalPath || violation.databasePhysicalPath
                ? ` (declared ${violation.declaredPhysicalPath ?? "?"}, database model ${violation.databasePhysicalPath ?? "absent"})`
                : "";
            return `model difference at ${violation.logicalPath}${paths}: ${violation.reason}`;
        }
        case "constraint-mismatch": {
            const subject = `${violation.constraintKind} constraint ${violation.constraintName ? `"${violation.constraintName}" (${violation.physicalName})` : violation.physicalName} on "${violation.tableName}"`;
            if (violation.status === "extra") {
                return `extra ${subject}: installed in the database but not declared by the current code, so it can reject this code's writes`;
            }
            return `${violation.status} ${subject}: ${violation.reason}`;
        }
    }
}

export function createSchemaSupersetMessage(violations: SchemaSupersetViolation[], declaredModelHash: string, acceptedModelHash: string, manifestMode: Exclude<SetupManifestMode, "exact">) {
    return `Database schema is not a superset of the declared model, so the database model ${acceptedModelHash} (manifestMode: ${manifestMode}) is not read-compatible with the declared model ${declaredModelHash} ` +
        `(${violations.length} problem${violations.length === 1 ? "" : "s"}): ${violations.map(describeSchemaSupersetViolation).join("; ")}. ` +
        (manifestMode === "declared-compatible"
            ? `The database manifest declares this model compatible, but the database disagrees: it was changed outside interaqt migration. Deploy the release that matches the database model, or repair the database.`
            : `Either the acceptModelHashes declaration is wrong for this database, or the database was changed outside interaqt migration. ` + DIRECTION_ADVICE);
}

// Both directions reach accepted mode: older code on a newer database (rollback), or newer code
// wrongly accepting an older database. Migration is the fix only in the second case.
const DIRECTION_ADVICE =
    `Remove the hash from acceptModelHashes. If the database model is older than the declared model, migrate it to the declared model; ` +
    `if it is newer, deploy the release that matches it — migrating older code against a newer database would remove what the newer model added.`;

/**
 * Attach-time constraint reconciliation message when the stored manifest was admitted without an
 * exact match (reached with requireSchemaSuperset: false, which skips the earlier check). The
 * default advice — migrate to reconcile — would downgrade the newer model's constraints.
 */
export function createAcceptedConstraintMismatchMessage(details: string, count: number, acceptedModelHash: string, manifestMode: Exclude<SetupManifestMode, "exact">) {
    const admission = manifestMode === "accepted"
        ? "was admitted through acceptModelHashes"
        : "was admitted because the migration that wrote it declared this code's model compatible";
    return `The database's constraint objects do not match the declared model (${count}): ${details}. ` +
        `The database manifest (modelHash ${acceptedModelHash}) ${admission}; an extra constraint object installed by a newer model can reject this code's writes, so it counts as incompatible. ` +
        DIRECTION_ADVICE;
}

// ---------------------------------------------------------------------------------------
// Column type comparison. Declared column types are DDL fragments produced by the driver's
// mapToDBFieldType (or an extended property type), e.g. 'INT GENERATED ALWAYS AS IDENTITY',
// 'SERIAL PRIMARY KEY', 'INT(2)', 'DOUBLE PRECISION'. Each dialect compares in the form its
// catalog reports:
// - PostgreSQL: pg_type.typname (information_schema.columns.udt_name); the declared type is
//   resolved by the database itself (to_regtype), so synonyms such as INT/integer/int4
//   compare equal. Type modifiers (lengths, vector dimensions) are not compared.
// - SQLite: the catalog keeps only the declared type text (PRAGMA table_info), so the
//   normalized declared text is compared.
// - MySQL: information_schema.columns.data_type (base type without modifiers).
// ---------------------------------------------------------------------------------------

const COLUMN_CONSTRAINT_CLAUSE = /\s+(?:PRIMARY\s+KEY|GENERATED|NOT\s+NULL|NULL|DEFAULT|UNIQUE|REFERENCES|CHECK|COLLATE|AUTO_INCREMENT|AUTOINCREMENT|CONSTRAINT)\b.*$/is;

/** The type part of a column DDL fragment, without column constraint clauses. */
export function stripColumnConstraintClauses(fieldType: string) {
    return fieldType.trim().replace(COLUMN_CONSTRAINT_CLAUSE, "").trim();
}

/** PostgreSQL serial pseudo-types are not catalog types; they create integer columns. */
export function postgresTypeLookupName(fieldType: string) {
    const typeName = stripColumnConstraintClauses(fieldType);
    const serial: Record<string, string> = { serial: "integer", serial4: "integer", bigserial: "bigint", serial8: "bigint", smallserial: "smallint", serial2: "smallint" };
    return serial[typeName.toLowerCase()] ?? typeName;
}

export function canonicalSQLiteColumnType(fieldType: string) {
    return stripColumnConstraintClauses(fieldType).replace(/\s+/g, " ").replace(/\s*\(\s*/g, "(").replace(/\s*,\s*/g, ",").replace(/\s*\)/g, ")").toUpperCase();
}

export function canonicalMySQLColumnType(fieldType: string) {
    const base = stripColumnConstraintClauses(fieldType).replace(/\(.*$/s, "").replace(/\s+/g, " ").trim().toLowerCase();
    const synonyms: Record<string, string> = {
        integer: "int",
        bool: "tinyint",
        boolean: "tinyint",
        "double precision": "double",
        real: "double",
        dec: "decimal",
        numeric: "decimal",
        fixed: "decimal",
        "character varying": "varchar",
        character: "char",
    };
    return synonyms[base] ?? base;
}
