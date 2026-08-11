/**
 * Physical property-type registry and fieldType resolution (Entity/Relation columns only).
 *
 * Logical names live in @core/propertyTypes. This module maps
 * extended type → per-dialect storage (fieldType / codec / match) and is the
 * single choke point Setup uses instead of calling mapToDBFieldType on extension names.
 */

import {
  isBuiltinPropertyType,
  isExtendedPropertyType,
} from '@core'
import type { Database } from '@runtime'
import { getSchemaDialect, type SchemaDialectName } from './erstorage/SchemaDialect.js'

export type PropertyTypeResolveContext = {
  type: string
  args?: object
  collection?: boolean
  /** Attribute location for error messages */
  recordName?: string
  propertyName?: string
  dialect: SchemaDialectName
}

/**
 * Match compiler hook shape (wired in M-03). Stored here so definePropertyType
 * can accept the full storage contract in one registration.
 */
export type PropertyTypeMatchCompiler = (ctx: {
  key: string
  value: [string, unknown]
  fieldName: string
  fieldType: string
  isReferenceValue: boolean
  getReferenceFieldValue: (v: string) => string
  p: (name?: string) => string
  resolveCtx: PropertyTypeResolveContext
}) => { fieldValue: string; fieldParams: unknown[] }

export type PropertyTypeStorage = {
  /**
   * DDL / migration physical column type.
   * Function form is for args-dependent types (e.g. vector(n)).
   * collection:true must be handled explicitly or rejected — never silently become JSON.
   */
  fieldType: string | ((ctx: PropertyTypeResolveContext) => string)
  toDB?: (value: unknown, ctx: PropertyTypeResolveContext) => unknown
  fromDB?: (value: unknown, ctx: PropertyTypeResolveContext) => unknown
  match?: Record<string, PropertyTypeMatchCompiler>
}

const storageByType = new Map<string, Partial<Record<SchemaDialectName, PropertyTypeStorage>>>()

/**
 * Validate per-dialect storage entries without mutating the registry.
 * definePropertyType calls this before any logical/physical commit so a failed
 * define leaves neither table dirty (registration atomicity).
 */
export function assertPropertyTypeStorageEntries(
  typeName: string,
  storage: Partial<Record<SchemaDialectName, PropertyTypeStorage>>,
): void {
  // Half-wired codec: toDB without fromDB (or vice versa) is rejected at registration
  // so callers never observe a half-wired type name in the logical table.
  for (const [dialect, entry] of Object.entries(storage) as Array<[SchemaDialectName, PropertyTypeStorage | undefined]>) {
    if (!entry) continue
    const hasTo = entry.toDB !== undefined
    const hasFrom = entry.fromDB !== undefined
    if (hasTo !== hasFrom) {
      throw new Error(
        `definePropertyType("${typeName}") storage.${dialect} registers only one of toDB/fromDB. ` +
        `Provide both codecs or neither (opaque pass-through).`
      )
    }
    if (entry.fieldType === undefined || entry.fieldType === null || entry.fieldType === '') {
      throw new Error(
        `definePropertyType("${typeName}") storage.${dialect} requires a non-empty fieldType string or function.`
      )
    }
  }
}

export function registerPropertyTypeStorage(
  typeName: string,
  storage: Partial<Record<SchemaDialectName, PropertyTypeStorage>>,
): void {
  assertPropertyTypeStorageEntries(typeName, storage)
  storageByType.set(typeName, { ...storage })
}

export function resolvePropertyTypeStorage(
  typeName: string,
  dialect: SchemaDialectName,
): PropertyTypeStorage | undefined {
  return storageByType.get(typeName)?.[dialect]
}

export function getPropertyTypeStorageMap(
  typeName: string,
): Partial<Record<SchemaDialectName, PropertyTypeStorage>> | undefined {
  return storageByType.get(typeName)
}

export function isExtendedPropertyTypeWithStorage(typeName: string): boolean {
  return storageByType.has(typeName)
}

export type ApplyPropertyTypeCodecInput = {
  /** Logical Property.type */
  type?: string
  args?: object
  collection?: boolean
  recordName?: string
  propertyName?: string
  database: Database
  /** Raw JS value on write, or driver-returned value on read. */
  value: unknown
}

/**
 * Write-path choke point for extended Property columns (SQLBuilder.prepareFieldValue).
 *
 * - Builtin / unknown / missing type → not handled (caller keeps builtin json/timestamp path).
 * - Extended + toDB → encoded value (caller must not apply builtin json/timestamp transforms).
 * - Extended without codec → same value (opaque pass-through contract).
 *
 * Half-wired codecs are rejected at definePropertyType; both sides are present or neither.
 */
export function applyExtendedPropertyTypeToDB(
  input: ApplyPropertyTypeCodecInput,
): { handled: true; value: unknown } | { handled: false } {
  const type = input.type
  if (!type || !isExtendedPropertyType(type)) {
    return { handled: false }
  }
  const dialect = getSchemaDialect(input.database).name
  const entry = resolvePropertyTypeStorage(type, dialect)
  // Setup already required storage for this dialect when building the map.
  // If storage is missing here (test double / map without setup), treat as opaque.
  if (!entry?.toDB) {
    return { handled: true, value: input.value }
  }
  const ctx: PropertyTypeResolveContext = {
    type,
    args: input.args,
    collection: input.collection,
    recordName: input.recordName,
    propertyName: input.propertyName,
    dialect,
  }
  return { handled: true, value: entry.toDB(input.value, ctx) }
}

/**
 * Read-path choke point for extended Property columns (QueryExecutor.structureRawReturns).
 * Same handled/opaque contract as applyExtendedPropertyTypeToDB; uses fromDB when present.
 * Extended types never auto-JSON.parse — only the registered fromDB (or opaque) runs.
 */
export function applyExtendedPropertyTypeFromDB(
  input: ApplyPropertyTypeCodecInput,
): { handled: true; value: unknown } | { handled: false } {
  const type = input.type
  if (!type || !isExtendedPropertyType(type)) {
    return { handled: false }
  }
  const dialect = getSchemaDialect(input.database).name
  const entry = resolvePropertyTypeStorage(type, dialect)
  if (!entry?.fromDB) {
    return { handled: true, value: input.value }
  }
  const ctx: PropertyTypeResolveContext = {
    type,
    args: input.args,
    collection: input.collection,
    recordName: input.recordName,
    propertyName: input.propertyName,
    dialect,
  }
  return { handled: true, value: entry.fromDB(input.value, ctx) }
}

export type ApplyPropertyTypeMatchInput = {
  /** Logical Property.type */
  type?: string
  args?: object
  collection?: boolean
  recordName?: string
  propertyName?: string
  /** Required to resolve dialect storage; match compilation always has a Database in query paths. */
  database?: Database
  key: string
  value: [string, unknown]
  fieldName: string
  fieldType?: string
  isReferenceValue: boolean
  getReferenceFieldValue: (v: string) => string
  p: (name?: string) => string
}

/**
 * Match-path choke point for extended Property columns (MatchExp.getFinalFieldValue).
 *
 * - Builtin / unknown / missing type → not handled (caller keeps builtin operator paths).
 * - Extended + registered operator → compiler result (must use p() placeholders; never raw-splice values).
 * - Extended + unregistered operator (including default `=` / `in`) → compile-time Error.
 *
 * Having a column does not imply Match support: every operator must be explicit under storage.match.
 */
export function applyExtendedPropertyTypeMatch(
  input: ApplyPropertyTypeMatchInput,
): { handled: true; fieldValue: string; fieldParams: unknown[] } | { handled: false } {
  const type = input.type
  if (!type || !isExtendedPropertyType(type)) {
    return { handled: false }
  }

  const location = formatPropertyLocation(input.recordName, input.propertyName)
  if (!input.database) {
    throw new Error(
      `Extended property type "${type}"${location} cannot compile match without a Database ` +
      `(needed to resolve dialect storage and match operators).`
    )
  }

  const dialect = getSchemaDialect(input.database).name
  const entry = resolvePropertyTypeStorage(type, dialect)
  const opRaw = typeof input.value[0] === 'string' ? input.value[0] : String(input.value[0])
  const opLower = opRaw.toLowerCase()
  const matchTable = entry?.match
  // Exact key first (symbols like <->); then lowercase for letter ops (LIKE vs like), matching builtin normalization.
  const compiler =
    matchTable?.[opRaw] ??
    (opRaw !== opLower ? matchTable?.[opLower] : undefined)

  if (!compiler) {
    const registered = matchTable ? Object.keys(matchTable) : []
    const registeredHint = registered.length
      ? `Registered operators for dialect "${dialect}": ${registered.map((op) => JSON.stringify(op)).join(', ')}.`
      : `No match operators were registered for dialect "${dialect}".`
    throw new Error(
      `Extended property type "${type}"${location} does not support match operator ${JSON.stringify(opRaw)}. ` +
      `${registeredHint} ` +
      `Register the operator under storage.${dialect}.match via definePropertyType, ` +
      `or do not use Match on this column (having a column does not imply Match support).`
    )
  }

  const resolveCtx: PropertyTypeResolveContext = {
    type,
    args: input.args,
    collection: input.collection,
    recordName: input.recordName,
    propertyName: input.propertyName,
    dialect,
  }

  const result = compiler({
    key: input.key,
    value: input.value,
    fieldName: input.fieldName,
    fieldType: input.fieldType ?? '',
    isReferenceValue: input.isReferenceValue,
    getReferenceFieldValue: input.getReferenceFieldValue,
    p: input.p,
    resolveCtx,
  })

  if (!result || typeof result.fieldValue !== 'string') {
    throw new Error(
      `Extended property type "${type}"${location} match operator ${JSON.stringify(opRaw)} ` +
      `must return { fieldValue: string, fieldParams: unknown[] }.`
    )
  }

  return {
    handled: true,
    fieldValue: result.fieldValue,
    fieldParams: result.fieldParams ?? [],
  }
}

/**
 * Test-only: clear physical storage registrations.
 * Pair with core resetPropertyTypeDefinitionsForTests.
 */
export function resetPropertyTypeStorageForTests(): void {
  storageByType.clear()
}

export type ResolveFieldTypeInput = {
  type: string
  collection?: boolean
  args?: object
  database: Database
  recordName?: string
  propertyName?: string
}

/**
 * Single choke point for Entity/Relation value-column fieldType.
 * Builtins (and internal `pk`) go through database.mapToDBFieldType.
 * Extended types require dialect storage registered via definePropertyType.
 */
export function resolveFieldType(input: ResolveFieldTypeInput): string {
  const { type, collection, args, database, recordName, propertyName } = input
  const location = formatPropertyLocation(recordName, propertyName)

  // Internal pk and relation id endpoints are never extended logical types.
  if (type === 'pk' || isBuiltinPropertyType(type)) {
    return database.mapToDBFieldType(type, collection)
  }

  if (!isExtendedPropertyType(type)) {
    // Should be unreachable after Property.create gates; still fail loud at setup.
    throw new Error(
      `Cannot resolve fieldType for unknown property type "${type}"${location}. ` +
      `Register it with definePropertyType, or use a builtin type.`
    )
  }

  const dialect = getSchemaDialect(database).name
  const entry = resolvePropertyTypeStorage(type, dialect)
  if (!entry) {
    const registeredDialects = Object.keys(getPropertyTypeStorageMap(type) ?? {})
    const registeredHint = registeredDialects.length
      ? `storage is registered for: ${registeredDialects.join(', ')}`
      : `no dialect storage was registered for this type`
    throw new Error(
      `Extended property type "${type}"${location} has no storage binding for dialect "${dialect}". ` +
      `(${registeredHint}). ` +
      `Register storage.${dialect} via definePropertyType, switch to a driver in a registered dialect, ` +
      `or use a builtin property type.`
    )
  }

  const ctx: PropertyTypeResolveContext = {
    type,
    args,
    collection,
    recordName,
    propertyName,
    dialect,
  }

  if (collection) {
    // Extensions must not silently become JSON collections (builtin object/collection semantic).
    // fieldType function may accept collection; string fieldType with collection:true is rejected.
    if (typeof entry.fieldType === 'string') {
      throw new Error(
        `Extended property type "${type}"${location} was declared with collection:true, ` +
        `but storage.${dialect}.fieldType is a fixed string ("${entry.fieldType}"). ` +
        `Extended collection columns must provide a fieldType function that handles collection explicitly, ` +
        `or reject collection in validateArgs — they must not silently map to JSON.`
      )
    }
  }

  const fieldType = typeof entry.fieldType === 'function'
    ? entry.fieldType(ctx)
    : entry.fieldType

  if (typeof fieldType !== 'string' || fieldType.length === 0) {
    throw new Error(
      `Extended property type "${type}"${location} storage.${dialect}.fieldType resolved to an empty value.`
    )
  }
  return fieldType
}

function formatPropertyLocation(recordName?: string, propertyName?: string): string {
  if (recordName && propertyName) return ` on ${recordName}.${propertyName}`
  if (recordName) return ` on record "${recordName}"`
  if (propertyName) return ` on property "${propertyName}"`
  return ''
}
