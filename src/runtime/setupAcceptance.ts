import { MIGRATION_MANIFEST_CONCEPT, MIGRATION_MANIFEST_CURRENT_KEY, MigrationError, type SetupOptions } from "./migration.js";

/**
 * N-1 model acceptance for `controller.setup({ acceptModelHashes, requireSchemaSuperset })`.
 *
 * Normal attach (`setup(false)`) requires the stored migration manifest's modelHash to equal
 * the modelHash of the current declarations. An accept set lets the code of release N-1
 * start on a database already migrated to release N (rollback, canary restart) when the
 * application has declared that model compatible. The guarantee is read compatibility only;
 * write-semantics compatibility is the application's expand/contract discipline and is not
 * checked here. See `SetupOptions.acceptModelHashes`.
 */

/** Hard limit on `acceptModelHashes`: the current release and the previous one. */
export const MAX_ACCEPTED_MODEL_HASHES = 2;

/**
 * How setup admitted the stored manifest: `exact` — the stored modelHash equals the declared
 * one; `accepted` — it differs and is listed in `acceptModelHashes`.
 */
export type SetupManifestMode = "exact" | "accepted";

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
 * The attach-time mismatch message. With an empty accept set this is the exact pre-existing
 * text (callers and runbooks match on it); with an accept set it additionally lists the
 * database's hash, the declared hash, and the accept set.
 */
export function createModelManifestMismatchMessage(databaseModelHash: string, declaredModelHash: string, acceptModelHashes: string[]) {
    const message = `Model manifest mismatch. Call controller.generateMigrationDiff(), review it, then call controller.migrate({ approvedDiff }). Manifest key: ${MIGRATION_MANIFEST_CONCEPT}/${MIGRATION_MANIFEST_CURRENT_KEY}`;
    if (!acceptModelHashes.length) return message;
    return `${message}. Database modelHash ${databaseModelHash} is neither the declared modelHash ${declaredModelHash} nor in acceptModelHashes [${acceptModelHashes.join(", ")}].`;
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
    }
}

export function createSchemaSupersetMessage(violations: SchemaSupersetViolation[], declaredModelHash: string, acceptedModelHash: string) {
    return `Database schema is not a superset of the declared model, so the accepted modelHash ${acceptedModelHash} is not read-compatible with the declared modelHash ${declaredModelHash} ` +
        `(${violations.length} problem${violations.length === 1 ? "" : "s"}): ${violations.map(describeSchemaSupersetViolation).join("; ")}. ` +
        `Either the acceptModelHashes declaration is wrong for this database, or the database was changed outside interaqt migration. ` +
        `Remove the hash from acceptModelHashes, or migrate the database to the declared model.`;
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
