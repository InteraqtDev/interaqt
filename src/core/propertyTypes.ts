/**
 * Logical property-type registry.
 *
 * Built-in names are closed. Extended names are registered via
 * `registerPropertyTypeDefinition` (called from storage `definePropertyType`).
 * Physical fieldType / codec / Match live in storage — never here.
 *
 * Property.create consults builtins ∪ extensions.
 * Dictionary.create consults builtins only (Decision A).
 */

export enum PropertyTypes {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Timestamp = 'timestamp',
  /** Structured JSON payload (maps to JSON/JSONB column). */
  Object = 'object',
  /** Relation endpoint / foreign-key style id column (maps to INT). */
  Id = 'id',
}

/** Property / Dictionary `type` values accepted by create() for builtins. */
export const ALLOWED_PROPERTY_TYPES = [
  PropertyTypes.String,
  PropertyTypes.Number,
  PropertyTypes.Boolean,
  PropertyTypes.Timestamp,
  PropertyTypes.Object,
  PropertyTypes.Id,
  // Framework internals (async task tables) and some apps use 'json' as an alias of object.
  'json',
] as const

export type AllowedPropertyType = (typeof ALLOWED_PROPERTY_TYPES)[number]
export type BuiltinPropertyType = AllowedPropertyType

export type PropertyTypeDefinition = {
  name: string
  /**
   * Called synchronously from Property.create after the type name is accepted.
   * May receive `undefined` when the declaration omits args.
   * Throw to reject the declaration.
   */
  validateArgs?: (args: unknown) => void
}

const extendedDefinitions = new Map<string, PropertyTypeDefinition>()

export function isBuiltinPropertyType(type: string): boolean {
  return (ALLOWED_PROPERTY_TYPES as readonly string[]).includes(type)
}

export function isExtendedPropertyType(type: string): boolean {
  return extendedDefinitions.has(type)
}

/** True when Property.create may accept this logical type name. */
export function isAllowedPropertyType(type: string): boolean {
  return isBuiltinPropertyType(type) || isExtendedPropertyType(type)
}

export function getPropertyTypeDefinition(type: string): PropertyTypeDefinition | undefined {
  return extendedDefinitions.get(type)
}

export function listExtendedPropertyTypeNames(): string[] {
  return Array.from(extendedDefinitions.keys()).sort()
}

/**
 * Register a logical property type. Rejects empty names, builtin collisions,
 * the driver-private `pk` name, and duplicate registrations.
 */
export function registerPropertyTypeDefinition(def: PropertyTypeDefinition): void {
  const name = def?.name
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(
      `definePropertyType requires a non-empty name string.`
    )
  }
  if (name === 'pk') {
    throw new Error(
      `definePropertyType cannot register "pk": that name is reserved for the driver-private primary-key column type.`
    )
  }
  if (isBuiltinPropertyType(name)) {
    throw new Error(
      `definePropertyType cannot register "${name}": it collides with a builtin property type ` +
      `(${ALLOWED_PROPERTY_TYPES.join(', ')}).`
    )
  }
  if (extendedDefinitions.has(name)) {
    throw new Error(
      `definePropertyType("${name}") was already registered. ` +
      `Duplicate registration is rejected (explicit control). ` +
      `Tests may call resetPropertyTypeRegistryForTests() between cases.`
    )
  }
  extendedDefinitions.set(name, {
    name,
    validateArgs: def.validateArgs,
  })
}

/**
 * Test-only: clear extended logical definitions.
 * Production code must not rely on this; adapters register once per process.
 */
export function resetPropertyTypeDefinitionsForTests(): void {
  extendedDefinitions.clear()
}

export function formatAllowedPropertyTypesForError(): string {
  const extended = listExtendedPropertyTypeNames()
  if (extended.length === 0) {
    return `Allowed types: ${ALLOWED_PROPERTY_TYPES.join(', ')}. ` +
      `To add a custom column type, call definePropertyType before Property.create.`
  }
  return `Allowed types: ${ALLOWED_PROPERTY_TYPES.join(', ')} ` +
    `(extended: ${extended.join(', ')}). ` +
    `To add a custom column type, call definePropertyType before Property.create.`
}

export function formatBuiltinPropertyTypesForError(): string {
  return `Allowed Dictionary types: ${ALLOWED_PROPERTY_TYPES.join(', ')}.`
}
