# Migration engine fatal-bug hunt (r35)

Date: 2026-07-16  
Scope: `src/runtime/migration.ts` (cascade-aware deletion scope, execution audit, storage-event forwarding, rebuild-epoch async invalidation, resume/DDL, `approvedDiffHash`), interactions with `Controller.migrate`, `MonoSystem` operation log, `Scheduler.invalidateUnappliedAsyncTasks`.  
Method: code audit of the six risk areas + minimal runtime reproduction where a candidate looked fatal.

---

## Fatal findings

### F-1 — Transform full recompute synthesizes base-name events only; filtered membership exits are invisible to incremental dependents (silent corruption)

**Severity:** FATAL (silent wrong computed values after a successful migration)

**Anchor:** `src/runtime/migration.ts` — `recomputeTransformOutput` (approx. L3364–3387) emits hand-built `{ recordName: <transform output>, type: update|delete }` events and does **not** capture storage’s derived events. Contrast `writeComputationPatch` / property `writeComputationResult` (L3213–3263), which forward the full storage event stream after r32.

**Mechanism:**
1. `MigrationScheduler` rebuilds a changed Transform via `recomputeTransformOutput`.
2. Downstream aggregates (Count / Summation / …) over a **filtered entity/relation whose base is that Transform output** are in `rebuildPlan` with `isSeed: false`.
3. If any pending events were queued, the dependent runs **incremental** recompute (`pendingEvents.length && !item.isSeed`).
4. Create/delete listeners for a filtered `records` dataDep are registered under the **filtered** name (`ComputationSourceMap.convertDataDepToERMutationEventsSourceMap`). Field updates are registered on the physical base with `filteredRecordName`.
5. Synthetic Transform events use the **physical** name only. Filtered membership `create`/`delete` never appear.
6. `resolveFilteredUpdateEvent` then sees a base `update` for a record that has already left the filtered set, finds it is not a current member, returns `null`, and skips the event — so the **exit is never applied**. The dict/property keeps the pre-migration aggregate.

**Minimal trigger (reproduced):**
- Entity `Product` → Transform entity `Discount{value}` → filtered `BigDiscount` (`value > 15`) → global `Summation` on `BigDiscount`.
- Seed: prices `10`, `20` → values `10`, `20` → sum `20`.
- Migrate Transform to `value = price * 0.5` → values `5`, `10` → both exit `BigDiscount` → sum must be `0`.
- Observed after `migrate`: sum still `20`. Migration status `succeeded`.

The existing test `changed Transform output recomputes downstream aggregations over an existing filtered entity` (`migration.spec.ts` ~L814) only covers enter/stay-in (`factor 1→2`, sum `20→60`) and therefore does not catch exits.

**Why tests missed it:** dimension gap — Transform × filtered-downstream × **membership exit** (update that leaves the predicate) was not in the migration matrix; the hand-written case only exercises enter/stay-in.

**Fix direction (convergence):** make Transform (and any other entity/relation migration write path that should feed dependents) capture storage events the same way as `writeComputationPatch` / property `applyResult`, so filtered membership create/delete and link cascades are in the chain. Alternatively, force full recompute for dependents of Transform outputs (weaker; still leaves other consumers blind).

---

### F-2 — `collectAuditedDeletions` never filters by `event.recordName` (comment/contract vs code; fail-closed death loop when simulation falls back)

**Severity:** FATAL for migration availability when cascade deletes exist and cascade-aware simulation is unavailable; HIGH contract corruption even when simulation succeeds

**Anchor:** `src/runtime/migration.ts` L3017–3037 (`collectAuditedDeletions`). Comment at L3025–3028 explicitly says only deletes whose `recordName` matches the computation output (or hard-deletion host) are audited, and that link cascade / filtered membership deletes must **not** enter the audit. The loop never checks `event.recordName`.

**Mechanism:**
- Hard-deletion recompute goes through `applyResult(..., storageEvents)` and therefore receives the full deletion ledger (`DeletionExecutor.deleteRecord` pushes link/cascade/reliance/filtered deletes into the same array).
- Every `type === "delete"` event’s id is attributed to `property:<Host>._isDeleted_:<Host>`.
- Simulation and enforce share this collector, so they agree when both run — which is why `migrationDestructiveFuzz` hardDeletion + links stays green.
- Analytical fallback (`getDestructiveDeletionScope`) lists **host** ids only. `assertExecutedDeletionsApproved` is bidirectional exact match → approved `[host]` vs executed `[host, link, …]` fails and rolls back forever.

**Minimal trigger (reproduced):**
- Host `B` with `_isDeleted_` + n:n link to `A`; one `B` labeled `gone` with a link.
- `generateMigrationDiff({ includeDestructiveScope: true })` scope under `recordName: "AuditB"` contained **two** ids (host + link). On SQLite integer ids, host and link were both `1` → scope ids `['1','1']`.

**When it becomes a hard failure:**
- Simulation infeasible (MySQL transactional-DDL bailout, missing handlers during generate-time simulation without `options.handlers`, any thrown error in the rolled-back run) → analytical host-only approval → real enforce collects polluted ids → permanent `DestructiveComputedOutputError`.

**Fix direction:** add the missing guard `if (event.recordName !== recordName) continue;` (and ideally dedupe ids). Align generate-time simulation options with migrate-time handlers so analytical fallback is rare.

---

## Areas checked and found sound (for the asked questions)

### simulateCascadeDeletionScope — callback / handle restoration
- `originalQueryHandle` / `map` / `schema` / `callbacks` saved; `callbacks.clear()` during run; **restored in `finally`** (L3491–3498). Exception-safe.
- Sentinel `DeletionScopeSimulationRollback` distinguished from real errors; infeasible → `undefined` → analytical fallback.
- MySQL skipped (non-transactional DDL). Sound.

### In-memory state / id allocators across simulation rollback
- `RecordBoundState` / `GlobalBoundState` are storage-backed (no durable in-process value cache that would survive rollback).
- `MigrationScheduler` builds a private `ComputationSourceMapManager`; does not re-register live scheduler listeners (`Controller.migrate` teardowns scheduler first).
- **SQLite / PGLite:** id allocation is transactional (`_IDS_` upsert) or UUID — rollback / uniqueness OK (gaps only for UUIDs).
- **Real PostgreSQL:** `nextval` is non-transactional → simulation that creates rows advances sequences permanently → **id gaps only**, not reuse/conflict. Not treated as fatal.
- Storage caller event arrays are truncated on rollback via `eventArrayBaselines` (r23). Sound.

### Kill-resume vs additive DDL
- `applyMigrationOperations`: scheme then operation-log mark — classic crash window.
- Mitigated in practice: every `migrate()` **re-plans** additive DDL from live catalog (`createAdditiveSchemaPlan` skips existing columns; `CREATE TABLE IF NOT EXISTS`). Resume after “DDL applied, log not written” re-plans without re-emitting that `ADD COLUMN`.
- Operation log + legacy key still cover index-stable resume. Phase updates for recompute/constraints/manifest participate in the SERIALIZABLE storage transaction (same `db` + ALS on PostgreSQL). Sound for the asked ADD-COLUMN double-apply case.

### `approvedDiffHash` stability
- `hashMigrationDiff` → `stableStringify` with sorted object keys, exotic-type encoding, undefined-key omission (L548–591).
- Array order is part of the hash (decisions/requirements); generation order is deterministic from manifest walks.
- `generatedAt` is inside the hashed document but fixed once the approved file is persisted — resume with the same file is stable. Does not spuriously accept a different decision set. Sound for resume identity.

### Storage-event forwarding duplication (property / patch paths)
- Property full write and entity/relation/property patch paths forward storage events only (no parallel synthetic host event). Global still synthesizes (no storage capture surface).
- `queueEvents` dedupes per `(computation, event)` when multiple dataDeps match. No double-apply of the same storage event on those paths.
- The Transform full path is the outlier (F-1): under-delivery, not duplication.

### Rebuild-epoch async invalidation + concurrency
- `invalidateUnappliedAsyncTasks(..., 'all')` runs before each async computation’s migration rebuild (L3597–3599), including simulate mode (rolled back with the simulation txn).
- Real migration recompute is `SERIALIZABLE`; invalidation deletes pending/success task rows; `handleAsyncReturn` re-reads by id and skips `missing-task`.
- Documented ops contract: do not migrate under live business listeners / traffic. Under that contract, interleaving is sound; delete-not-skip closes the blind worker rewrite race described in Scheduler comments.

### Bidirectional deletion audit (when recordName filter is fixed)
- `assertExecutedDeletionsApproved` keying and sorted id equality are otherwise consistent with `destructive-scope` decisions; takeover + hard-deletion existence gates are coherent with r30-E design.

---

## Suggested regression cells (for the dimension registry)

1. Transform output change × filtered entity on that output × **membership exit** (aggregate must reach empty/zero) — pins F-1.
2. Same topology × mix of stay-in update + exit (incremental path non-empty).
3. Hard deletion × existing relation links × `includeDestructiveScope` scope ids must equal **host ids only** — pins F-2.
4. Same as (3) with simulation forced off / analytical fallback × enforce must still accept host-only approval after F-2 fix.
5. SQLite integer ids where host id === link id (duplicate string in polluted collector).

---

## Summary

| ID | Class | Silent data corruption? | Reproduced? |
|----|--------|-------------------------|-------------|
| F-1 | Transform → filtered downstream incremental blind to membership exit | Yes | Yes (sum stuck at 20) |
| F-2 | Deletion audit missing `event.recordName` filter | No (fail-closed / wrong approval surface) | Yes (host+link ids; SQLite `['1','1']`) |

Highest priority fix: F-1 (converges with the r32 “storage events are the truth” rule already applied to patch/property paths). F-2 is a one-line filter that the comment already specifies and that unblocks analytical-fallback + cascade topologies.
