import type { EntityInstance, PropertyInstance, RelationInstance } from "@core";
import { ComputationProtocolError } from "./errors/index.js";

/**
 * `Property.excludeFromOldRecord` — declaration-level rules.
 *
 * A property declared with `excludeFromOldRecord: true` is not read by the pre-update query of
 * `storage.update`, so the `oldRecord` of its record's update events does not contain it. Every
 * framework reader of `oldRecord` whose read set is declared is checked at setup:
 *
 * - here (declaration level): the property itself must be a plain fact column (no `computed`,
 *   no `computation`, no `defaultValue`), must not be part of `Entity.identity`, its record must
 *   not declare any `computed` property, and its record must be an ordinary entity or relation
 *   (not a filtered or merged record, and not an input of a merged record);
 * - in `ComputationSourceMapManager`: the `match` of a records dataDep on the record (evaluated on
 *   oldRecord to classify membership, absent column read as NULL), and `record` / `oldRecord`
 *   patterns of update triggers and eventDeps (including StateMachine transfer triggers);
 * - in `Scheduler.buildScopedSequenceScopeGuards` (ScopedSequence scope value fields).
 *
 * Readers that do not need the old value and stay allowed: dataDep values (re-queried from
 * storage; an excluded column only makes the "did a dependency change" comparison report a
 * written column as changed), filtered-entity membership (decided by queries before and after the
 * write), and the per-item state of aggregations. Readers whose read set is application code (side
 * effects, `storage.listen`, `computeTarget`, `computeValue`, Transform / Custom callbacks, and
 * the `record` argument of property computations on update-triggered runs, which is the old
 * snapshot) are not checked: for them the declaration is the documented contract.
 */

/** Physical record name → names of its properties declared with `excludeFromOldRecord: true`. */
export type OldRecordExclusions = ReadonlyMap<string, ReadonlySet<string>>

type DeclaredRecord = {
    kind: 'entity' | 'relation'
    record: EntityInstance | RelationInstance
}

function reject(message: string): never {
    throw new ComputationProtocolError(message, { computationPhase: 'old-record-exclusion-validation' })
}

export function resolveOldRecordExclusions(entities: readonly EntityInstance[], relations: readonly RelationInstance[]): OldRecordExclusions {
    const declared: DeclaredRecord[] = [
        ...entities.map(record => ({ kind: 'entity' as const, record })),
        ...relations.map(record => ({ kind: 'relation' as const, record })),
    ]
    const mergedInputs = new Set<unknown>([
        ...entities.flatMap(entity => entity.inputEntities || []),
        ...relations.flatMap(relation => relation.inputRelations || []),
    ])
    const result = new Map<string, Set<string>>()

    for (const { kind, record } of declared) {
        const properties = (record.properties || []) as PropertyInstance[]
        const excluded = properties.filter(property => property.excludeFromOldRecord === true)
        if (!excluded.length) continue
        const recordName = record.name!
        const where = (property: PropertyInstance) => `Property "${recordName}.${property.name}" declares excludeFromOldRecord`

        // Filtered records may only re-declare a base property (it resolves to the base column, so a
        //  flag on the view would be ignored); merged records cannot declare properties at all.
        const isView = kind === 'entity'
            ? !!((record as EntityInstance).baseEntity || (record as EntityInstance).inputEntities?.length)
            : !!((record as RelationInstance).baseRelation || (record as RelationInstance).inputRelations?.length)
        if (isView || mergedInputs.has(record)) {
            reject(
                `${where(excluded[0])}, but "${recordName}" is a ${isView ? 'filtered or merged' : 'merged-input'} ${kind}. ` +
                `excludeFromOldRecord is supported on ordinary entities and relations only: declare the column on a record that is not a view and not an input of a merged record.`
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
            const identity = kind === 'entity' ? (record as EntityInstance).identity : undefined
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
    return result
}
