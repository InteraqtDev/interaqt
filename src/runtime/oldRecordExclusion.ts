import type { EntityInstance, RelationInstance } from "@core";
import { OldRecordExclusionError, validateOldRecordExclusions } from "../storage/erstorage/oldRecordExclusion.js";
import { ComputationProtocolError } from "./errors/index.js";

/**
 * `Property.excludeFromOldRecord` — declaration-level rules.
 *
 * A property declared with `excludeFromOldRecord: true` is not read by the pre-update query of
 * `storage.update`, so the `oldRecord` of its record's update events does not contain it. Every
 * framework reader of `oldRecord` whose read set is declared is checked at setup:
 *
 * - in storage schema compilation: the property itself must be a plain fact column (no `computed`,
 *   no `computation`, no `defaultValue`), must not be part of `Entity.identity`, its record must
 *   not declare any `computed` property, and its record must be an ordinary entity or relation.
 *   Columns supplied to merged records and computation outputs declared on filtered views are also
 *   subject to these checks;
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

export type { OldRecordExclusions } from "../storage/erstorage/oldRecordExclusion.js";

/** Fallback for a custom storage implementation without a compiled ER map. */
export function resolveOldRecordExclusions(entities: readonly EntityInstance[], relations: readonly RelationInstance[]) {
    try {
        return validateOldRecordExclusions(entities, relations)
    } catch (error) {
        if (!(error instanceof OldRecordExclusionError)) throw error
        throw new ComputationProtocolError(error.message, { computationPhase: 'old-record-exclusion-validation', causedBy: error })
    }
}
