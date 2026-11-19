import type { EntityInstance, PropertyInstance, RelationInstance } from "@core";
import type { MapData, ValueAttribute } from "./EntityToTableMap.js";

/** Physical record name to properties omitted from its update event's oldRecord. */
export type OldRecordExclusions = ReadonlyMap<string, ReadonlySet<string>>

export class OldRecordExclusionError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OldRecordExclusionError'
    }
}

type DeclaredRecord = EntityInstance | RelationInstance

function getName(record: DeclaredRecord): string {
    if ('sourceProperty' in record) {
        return record.name || `${record.source.name}_${record.sourceProperty}_${record.targetProperty}_${record.target.name}`
    }
    return record.name
}

function getRoot(record: DeclaredRecord): DeclaredRecord {
    const visited = new Set<DeclaredRecord>()
    let current = record
    while (!visited.has(current)) {
        visited.add(current)
        const base = 'sourceProperty' in current ? current.baseRelation : current.baseEntity
        if (!base) break
        current = base
    }
    return current
}

function reject(message: string): never {
    throw new OldRecordExclusionError(message)
}

/** Validate the original declarations before merged inputs are rebased and filtered attributes copied. */
export function validateOldRecordExclusions(entities: readonly EntityInstance[], relations: readonly RelationInstance[]): OldRecordExclusions {
    const declared: DeclaredRecord[] = [...entities, ...relations]
    const mergedInputNames = new Set(
        [...entities.flatMap(entity => entity.inputEntities ?? []), ...relations.flatMap(relation => relation.inputRelations ?? [])]
            .flatMap(input => [getName(input), getName(getRoot(input))])
    )
    const result = new Map<string, Set<string>>()

    for (const record of declared) {
        const properties = record.properties
        const excluded = [...properties, ...(record.commonProperties ?? [])].filter(property => property.excludeFromOldRecord === true)
        if (!excluded.length) continue
        const recordName = getName(record)
        const where = (property: PropertyInstance) => `Property "${recordName}.${property.name}" declares excludeFromOldRecord`
        const kind = 'sourceProperty' in record ? 'relation' : 'entity'
        const isView = 'sourceProperty' in record
            ? !!(record.baseRelation || record.inputRelations)
            : !!(record.baseEntity || record.inputEntities)
        if (isView || mergedInputNames.has(recordName)) {
            reject(
                `${where(excluded[0])}, but "${recordName}" is a ${isView ? 'filtered or merged' : 'merged-input'} ${kind}. ` +
                `Declare the exclusion on an ordinary record whose columns are not shared by a merged record.`
            )
        }

        for (const property of excluded) {
            if (property.computed) {
                reject(`${where(property)} and computed. A computed column is recomputed on every write from the old row; remove excludeFromOldRecord.`)
            }
            if (property.computation) {
                reject(
                    `${where(property)} and a computation. A computation output is read back as the previous value (last value, ScopedSequence guards); ` +
                    `declare excludeFromOldRecord on plain fact properties only.`
                )
            }
            if (property.defaultValue) {
                reject(
                    `${where(property)} and a defaultValue. On update, the write path applies defaultValue to columns that are absent from the old row, ` +
                    `so an excluded column would be overwritten by its default; remove the defaultValue or excludeFromOldRecord.`
                )
            }
            const identity = 'sourceProperty' in record ? undefined : record.identity
            if (identity?.properties.includes(property.name)) {
                reject(
                    `${where(property)}, but it is part of the identity "${identity.name}" of "${recordName}". ` +
                    `Identity properties are immutable, and the update guard reads the stored value from the old row to report an attempted change; remove excludeFromOldRecord.`
                )
            }
        }

        const computedSibling = properties.find(property => property.computed)
        if (computedSibling) {
            reject(
                `${where(excluded[0])}, but "${recordName}" also declares the computed property "${computedSibling.name}". ` +
                `computed functions are evaluated on every update against the merged old row, and their read set is not declared, ` +
                `so an excluded column would silently read as undefined. Replace the computed property with a computation, or remove excludeFromOldRecord.`
            )
        }

        result.set(recordName, new Set(excluded.map(property => property.name)))
    }
    if (!result.size) return result

    // Filtered views can attach a runtime computation to a base column by redeclaring it.
    for (const record of declared) {
        const root = getRoot(record)
        if (root === record) continue
        const excluded = result.get(getName(root))
        if (!excluded) continue
        const output = record.properties.find(property => property.computation && excluded.has(property.name))
        if (output) {
            reject(
                `Property "${getName(root)}.${output.name}" declares excludeFromOldRecord, but the filtered record "${getName(record)}" ` +
                `declares a computation on the same column. Remove excludeFromOldRecord from the computation output.`
            )
        }
    }
    return result
}

type CompiledRecord = MapData['records'][string]

// EntityToTableMap treats compiled record metadata as immutable.
const excludedByRecord = new WeakMap<CompiledRecord, ReadonlySet<string>>()

export function getExcludedValueAttributes(record: CompiledRecord): ReadonlySet<string> {
    const cached = excludedByRecord.get(record)
    if (cached) return cached

    const excluded = new Set<string>()
    for (const [name, attribute] of Object.entries(record.attributes)) {
        if ((attribute as ValueAttribute).excludeFromOldRecord === true) excluded.add(name)
    }
    excludedByRecord.set(record, excluded)
    return excluded
}

export function getOldRecordExclusions(map: MapData): OldRecordExclusions {
    const exclusions = new Map<string, ReadonlySet<string>>()
    for (const [name, record] of Object.entries(map.records)) {
        if (record.resolvedBaseRecordName !== name) continue
        const excluded = getExcludedValueAttributes(record)
        if (excluded.size) exclusions.set(name, excluded)
    }
    return exclusions
}

/** Copy an update snapshot before removing excluded columns, leaving the storage snapshot intact. */
export function projectOldRecord<T extends object>(record: T, excluded: ReadonlySet<string> | undefined): T {
    const projected = { ...record }
    excluded?.forEach(property => { delete (projected as Record<string, unknown>)[property] })
    return projected
}
