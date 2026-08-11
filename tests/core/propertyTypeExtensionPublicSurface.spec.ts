/**
 * M-05 — public surface: exports + documentation contracts.
 *
 * Lightweight read-only assertions so docs/export regressions fail in CI
 * without requiring a full prose review each round.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  ALLOWED_PROPERTY_TYPES,
  Dictionary,
  Property,
  PropertyTypes,
  definePropertyType,
  formatAllowedPropertyTypesForError,
  isAllowedPropertyType,
  isBuiltinPropertyType,
  resetPropertyTypeRegistryForTests,
  resolveFieldType,
  type DefinePropertyTypeInput,
  type PropertyTypeDefinition,
  type PropertyTypeMatchCompiler,
  type PropertyTypeResolveContext,
  type PropertyTypeStorage,
} from 'interaqt'

const root = resolve(__dirname, '../..')

function readDoc(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8')
}

describe('property type extension — public exports', () => {
  test('main package exports registration API and builtin constants', () => {
    expect(typeof definePropertyType).toBe('function')
    expect(typeof resetPropertyTypeRegistryForTests).toBe('function')
    expect(typeof resolveFieldType).toBe('function')
    expect(typeof isAllowedPropertyType).toBe('function')
    expect(typeof isBuiltinPropertyType).toBe('function')
    expect(typeof formatAllowedPropertyTypesForError).toBe('function')
    expect(PropertyTypes.String).toBe('string')
    expect(ALLOWED_PROPERTY_TYPES).toEqual(
      expect.arrayContaining(['string', 'number', 'boolean', 'timestamp', 'object', 'id', 'json']),
    )

    // Type-only imports must resolve (compile-time); keep runtime touch light.
    const _types: Array<
      DefinePropertyTypeInput | PropertyTypeDefinition | PropertyTypeStorage | PropertyTypeResolveContext | PropertyTypeMatchCompiler
    > = []
    expect(Array.isArray(_types)).toBe(true)

    resetPropertyTypeRegistryForTests()
    definePropertyType({ name: 'pte_public_export_probe' })
    expect(isAllowedPropertyType('pte_public_export_probe')).toBe(true)
    expect(() => Property.create({ name: 'p', type: 'pte_public_export_probe' })).not.toThrow()
    expect(() => Dictionary.create({ name: 'd', type: 'pte_public_export_probe' })).toThrow(
      /Extended property types apply only to Entity\/Relation Property/,
    )
    resetPropertyTypeRegistryForTests()
  })
})

describe('property type extension — documentation contracts', () => {
  test('each required guide carries its contract; changelog Unreleased is complete', () => {
    // Per-file pins: a joined-corpus check can pass while one guide drops its clause.
    const propertyGuide = readDoc('agent/agentspace/knowledge/usage/02-define-entities-properties.md')
    expect(propertyGuide).toMatch(/definePropertyType/)
    expect(propertyGuide).toMatch(/Property columns only/)
    expect(propertyGuide).toMatch(/Match is not free/)
    expect(propertyGuide).toMatch(/No silent DDL passthrough|no longer accept unknown logical types/i)
    expect(propertyGuide).toMatch(/PayloadItem\.create/)
    expect(propertyGuide).toMatch(/Dictionary\.create/)
    expect(propertyGuide).toMatch(/_Dictionary_\.value|fixed JSON key\/value/i)

    const payloadGuide = readDoc('agent/agentspace/knowledge/usage/07-payload-parameters.md')
    expect(payloadGuide).toMatch(/definePropertyType/)
    expect(payloadGuide).toMatch(/independent/i)
    expect(payloadGuide).toMatch(/never widen PayloadItem|does \*\*not\*\* accept/i)

    const dictionaryGuide = readDoc('agent/agentspace/knowledge/usage/11-global-dictionaries.md')
    expect(dictionaryGuide).toMatch(/definePropertyType/)
    expect(dictionaryGuide).toMatch(/_Dictionary_/)
    expect(dictionaryGuide).toMatch(/only to Entity\/Relation Property/i)
    expect(dictionaryGuide).toMatch(/omit `args`|must \*\*omit `args`\*\*|Do not pass args/i)

    const queryGuide = readDoc('agent/agentspace/knowledge/usage/12-data-querying.md')
    expect(queryGuide).toMatch(/definePropertyType/)
    // Prose wraps after **not**; require the non-inheritance claim, not a single-line phrase.
    expect(queryGuide).toMatch(/do \*\*not\*\*[\s\S]{0,40}inherit/i)
    expect(queryGuide).toMatch(/storage\.<dialect>\.match|Unregistered operators fail/i)

    const apiRef = readDoc('agent/agentspace/knowledge/usage/14-api-reference.md')
    expect(apiRef).toMatch(/### definePropertyType\(\)/)
    expect(apiRef).toMatch(/no operators are inherited by default/)
    expect(apiRef).toMatch(/not Dictionary, not PayloadItem|Property\*\* columns only/i)
    expect(apiRef).toMatch(/fixed `_Dictionary_` JSON KV|Builtin logical type only/i)

    const exportsRef = readDoc('agent/agentspace/knowledge/usage/18-api-exports-reference.md')
    expect(exportsRef).toMatch(/definePropertyType/)
    expect(exportsRef).toMatch(/PropertyTypes/)
    expect(exportsRef).toMatch(/ALLOWED_PROPERTY_TYPES/)
    expect(exportsRef).toMatch(/Property\*\* columns only|Property columns only/i)
    expect(exportsRef).toMatch(/opt-in|no longer accept unknown logical types/i)

    const antiPatterns = readDoc('agent/agentspace/knowledge/usage/19-common-anti-patterns.md')
    expect(antiPatterns).toMatch(/Treating raw SQL \/ plugin type strings/)
    expect(antiPatterns).toMatch(/definePropertyType/)
    expect(antiPatterns).toMatch(/operators are NOT free/i)
    expect(antiPatterns).toMatch(/Dictionary\.create\(\{ name: 'embedding', type: 'vector' \}\)/)
    expect(antiPatterns).toMatch(/PayloadItem\.create\(\{ name: 'embedding', type: 'vector' \}\)/)

    const generatorApi = readDoc('agent/agentspace/knowledge/generator/api-reference.md')
    expect(generatorApi).toMatch(/definePropertyType/)
    expect(generatorApi).toMatch(/no longer passthrough unknown types/i)
    expect(generatorApi).toMatch(/Extended Match operators are never free/i)
    expect(generatorApi).toMatch(/Dictionary and PayloadItem do not accept extended property types/)

    const storageGuide = readDoc('src/storage/USAGE_GUIDE.md')
    expect(storageGuide).toMatch(/definePropertyType/)
    expect(storageGuide).toMatch(/never passthrough into DDL/i)
    expect(storageGuide).toMatch(/fixed JSON KV/i)

    // CHANGELOG Unreleased (after "# Changelog") must call out the feature + breaking change.
    // Note: released 4.7.0 notes currently appear above the Unreleased section in this file.
    const changelog = readDoc('CHANGELOG.md')
    const unreleasedStart = changelog.indexOf('## [Unreleased]')
    expect(unreleasedStart).toBeGreaterThanOrEqual(0)
    const nextHeading = changelog.indexOf('\n## [', unreleasedStart + 1)
    const unreleased = changelog.slice(
      unreleasedStart,
      nextHeading === -1 ? undefined : nextHeading,
    )
    expect(unreleased).toMatch(/definePropertyType/)
    expect(unreleased).toMatch(/Property\*\* columns only|Property columns only/i)
    expect(unreleased).toMatch(/Dictionary\.create` remains builtin-only|builtin-only \(fixed `_Dictionary_`/i)
    expect(unreleased).toMatch(/PayloadItem/)
    expect(unreleased).toMatch(/opt-in Match/)
    expect(unreleased).toMatch(/### Breaking changes/)
    expect(unreleased).toMatch(/mapToDBFieldType/)
    expect(unreleased).toMatch(/no longer passthrough-returns|passthrough-returns/i)
  })
})
