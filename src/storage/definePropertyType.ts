/**
 * Public API: register an extended logical property type and optional per-dialect storage.
 *
 * Adapters (e.g. @scope/pgvector-interaqt) call this once at process startup,
 * before any Property.create({ type: extendedName }).
 *
 * Physical model applies only to Entity/Relation Property columns (Decision A).
 * Dictionary.create never accepts extended names.
 */

import {
  registerPropertyTypeDefinition,
  resetPropertyTypeDefinitionsForTests,
  type PropertyTypeDefinition,
} from '@core'
import type { SchemaDialectName } from './erstorage/SchemaDialect.js'
import {
  assertPropertyTypeStorageEntries,
  registerPropertyTypeStorage,
  resetPropertyTypeStorageForTests,
  type PropertyTypeStorage,
} from './propertyTypeStorage.js'

export type DefinePropertyTypeInput = PropertyTypeDefinition & {
  storage?: Partial<Record<SchemaDialectName, PropertyTypeStorage>>
}

/**
 * Register a logical type and optional per-dialect storage atomically.
 *
 * Physical storage entries are fully validated before either registry is
 * mutated. A failed call therefore leaves no logical name and no physical map
 * entry, so callers may immediately retry the same name with a corrected
 * definition (registration atomicity).
 */
export function definePropertyType(def: DefinePropertyTypeInput): void {
  if (!def || typeof def !== 'object') {
    throw new Error(`definePropertyType requires a definition object with a name.`)
  }
  // Validate physical entries first — before any logical commit — so half-wired
  // codec / empty fieldType failures cannot leave isExtendedPropertyType true.
  if (def.storage) {
    assertPropertyTypeStorageEntries(def.name, def.storage)
  }
  registerPropertyTypeDefinition({
    name: def.name,
    validateArgs: def.validateArgs,
  })
  // Validation already succeeded; this only commits the map entry.
  if (def.storage) {
    registerPropertyTypeStorage(def.name, def.storage)
  }
}

/**
 * Test-only: clear both logical and physical extension registries.
 * Call from beforeEach/afterEach in suites that register extension types.
 */
export function resetPropertyTypeRegistryForTests(): void {
  resetPropertyTypeDefinitionsForTests()
  resetPropertyTypeStorageForTests()
}

export type {
  PropertyTypeStorage,
  PropertyTypeResolveContext,
  PropertyTypeMatchCompiler,
  ApplyPropertyTypeCodecInput,
  ApplyPropertyTypeMatchInput,
} from './propertyTypeStorage.js'
export {
  resolveFieldType,
  resolvePropertyTypeStorage,
  getPropertyTypeStorageMap,
  applyExtendedPropertyTypeToDB,
  applyExtendedPropertyTypeFromDB,
  applyExtendedPropertyTypeMatch,
} from './propertyTypeStorage.js'
