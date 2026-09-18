# StateMachine State Graph Migration

A StateMachine's persisted `currentState` (the bound state behind every computed
`status`-style property, and behind a global dictionary machine) is a **constrained
fact**: its legal values are exactly the state node names of the declared graph.
When a migration changes the graph — renaming a state, removing a node, renaming the
initial state — the persisted names must be **explicitly mapped** to the new graph.
Silently leaving a stale name produces the worst failure shape the framework has:
the next interaction that depends on that state reports success (`error: undefined`)
and does nothing, because `TransitionFinder` finds no outgoing transfer from a name
that no longer exists.

This note is the contract for what applications must provide when the state graph
changes, how the framework validates it, the exact failure shapes, and how to repair
a database that was already migrated incorrectly.

Reference tests: `tests/runtime/migrationStateMachineStateGraph.spec.ts` (PGLite,
detection + execution + invariant layers) and the `"PostgreSQL state graph mapping
migration"` describe block in `tests/runtime/postgresqlMigration.spec.ts`
(real PostgreSQL, env-gated).

## When a Mapping Is Required

`controller.generateMigrationDiff()` compares the stored manifest's state graph
(node names + initial state name) with the current declarations and reports:

- `changes[].detected.stateGraphChanged` — `true` when node names were removed or
  the initial state was renamed;
- a `state-graph-mapping` entry in `requiredDecisions`, carrying
  `removedStateNames` (old names that are no longer legal — this is exactly the set
  the mapping must cover), `addedStateNames`, `nextNodeNames`, and
  `nextInitialStateName`.

No mapping is required when only nodes were **added** and the initial state is
unchanged — every persisted name is still legal. A rename of the initial state
always requires a mapping decision, in both shapes:

- **Old initial name removed by the rename** (the usual shape): the old initial
  name appears in `removedStateNames` and must be mapped like any other removed
  name — records sitting on it have no legal successor without a mapping.
- **Old initial name retained as a node** (`removedStateNames` is empty): the
  required mapping is the empty mapping `{}`. Records sitting on the old
  initial name keep that still-legal name; the decision requirement exists to
  make the reviewer confirm that outcome explicitly.

The state graph is stored as diff-detection input only. It is excluded from
`modelHash` and from all signatures, so adding this field did not and will not make
unchanged models compare as changed.

## The Decision

Approve the diff by adding one decision per required `state-graph-mapping` item:

```json
{
  "kind": "state-graph-mapping",
  "dataContext": "property:Request.status",
  "mapping": { "approved": "accepted" },
  "reason": "approved was renamed to accepted"
}
```

Rules, all enforced at `migrate()` time inside diff validation (before any data
change; `dryRun: true` also triggers them):

- The mapping keys must be **exactly** `removedStateNames` — no extra keys for names
  that are still legal, no missing entries.
- Each value must be a name in `nextNodeNames`, or `null` to fall back to the new
  initial state. `null` is the explicit demotion decision for a **removed** state:
  records parked on a deleted node have no correct successor, so the application
  decides where they land.
- The same `dataContext`'s computation decision must be `changed` or `state-only`.
  Combining an approved mapping with `unchanged` (or `unrebuildable`) is rejected:
  such a computation never enters the rebuild plan, so the mapping would be silently
  dropped and the stale names would survive — the exact defect this mechanism exists
  to prevent.

For a removed node with no replacement:

```json
{ "kind": "state-graph-mapping", "dataContext": "property:Request.status",
  "mapping": { "archived": null }, "reason": "archived was removed; demote to initial" }
```

## What the Framework Does With an Approved Mapping

Inside the migration's recompute transaction, per StateMachine computation:

1. **Mapping application** — for record-scoped machines, every host record's
   persisted `currentState` whose value is a mapping key is rewritten to the mapped
   name (`null` → new initial state name). Values already legal in the new graph are
   left untouched; this is a per-record, intentional remap, **not** a reset to the
   initial state. Global dictionary machines get the same treatment on the single
   global value.
2. **Legality invariant** (see below).
3. **Output rebuild** — event rebuild handlers run after the mapping, so the
   `record` they receive already carries the new state name. Derive the output value
   from it.

The bound-state column name is `` `_${host}_${property}_bound_currentState` ``
(property scope). A typical event rebuild handler for a renamed graph:

```typescript
await controller.migrate({
  approvedDiff,
  handlers: {
    eventRebuild: {
      "property:Request.status": async ({ record }) =>
        record["_Request_status_bound_currentState"] ?? record.status,
    },
  },
});
```

Because mapping precedes output rebuild, the state column is the source of truth and
the handler stays trivial. Crash/resume semantics are the same as every other
bound-state write inside the recompute transaction: a failure rolls the whole
migration back and the resumed run replays it.

## The Legality Invariant

For every StateMachine that enters the rebuild plan (`rebuildState` or
`rebuildOutput` — deliberately wide, including state-only items), the migration
scans the persisted `currentState` values **after** mapping application and
**before** any reset or output rebuild. Any value outside the current graph's node
names fails the migration in-transaction:

```
MigrationError: StateMachine property:Request.status has persisted currentState
values outside the current state graph after migration processing: [approved].
Legal state names: [pending, accepted, archived]. Provide a state-graph-mapping
decision mapping every removed old name, or fix the corrupted persisted state
before migrating.
```

Scope and cost boundaries:

- The scan is one single-column `find` per affected StateMachine per migration
  (record scope), or one global read (global scope). StateMachines with no rebuild
  plan item are not scanned.
- `setup()` and `dispatch()` do **not** check legality. The invariant's jurisdiction
  is "migration must not create or pass through illegal state names", not runtime
  defense against arbitrary writes. A `currentState` corrupted outside migration
  still fails silently at dispatch time (transfer not found → skip).
- The wide trigger is the safety net for the **upgrade window**: manifests written
  before this mechanism have no `stateGraph` field, so graph comparison degrades to
  "no comparison" and no mapping requirement is generated. If such a migration
  renames states while persisted names go stale, the invariant is what fails fast
  instead of letting the stale names through.

## Failure Catalog

All of these are `MigrationError`s thrown by `controller.migrate()` (including with
`dryRun: true`), before any data modification:

| Condition | Message prefix |
|-----------|----------------|
| Mapping decision not provided | `Missing migration decision for required review item: state-graph-mapping:<dataContext>:` |
| Mapping covers names that stayed legal | `Migration state graph mapping for <dataContext> maps state names that remain legal in the new graph: …` |
| Mapping misses a removed name | `Migration state graph mapping for <dataContext> is missing entries for state names that no longer exist in the new graph: […]. Map each to a legal name (…) or null to fall back to the new initial state "…".` |
| Mapping target outside the new graph | `Migration state graph mapping for <dataContext> maps to names outside the new state graph: <old> -> <target>. Legal targets: … (or null for the new initial state).` |
| Computation decision contradicts the mapping | `Migration computation decision 'unchanged' for <dataContext> contradicts the approved state graph mapping: … Approve 'changed' or 'state-only' for this computation.` |
| Illegal persisted name survives mapping | `StateMachine <dataContext> has persisted currentState values outside the current state graph after migration processing: …` (in-transaction; rolls back) |

The last one is the only failure that occurs after writes start; it aborts and rolls
back the migration transaction, including any mapping writes already applied.

## Repairing a Wrongly-Migrated Database

The framework does not auto-repair databases that were migrated by an older version
and already carry stale state names (the stored manifest now matches the new
declarations, so the diff alone will not offer a mapping for the stale names). The
sanctioned repair uses the mechanism above as a **two-step migration**:

1. **Re-legalize.** Declare a graph in which the currently persisted (stale) names
   are legal nodes again — typically rename the new name back to the stale one, e.g.
   `accepted -> approved`. Approve the resulting migration with the mapping for the
   removed name (`{ "accepted": "approved" }`). After this migration every persisted
   `currentState` is legal.
2. **Rename properly.** Declare the intended graph (`approved -> accepted`) and
   approve with `{ "approved": "accepted" }`.

`controller.createMigrationBaseline()` rewrites the stored manifest to match the
current declarations without touching data. It clears manifest-level blockers (for
example after generator-version rejection) but does **not** make persisted state
names legal — after a baseline, a rebuild-triggering migration will still fail the
legality invariant until the data is repaired by a mapping-carrying migration.

For the upgrade-window case (first migration after adopting this mechanism, stored
manifest predates `stateGraph`, and the same migration also renames states) the
migration will fail fast on stale names. The same two exits apply: run the rename as
a separate second migration after the upgrade migration, or baseline and then run a
repair migration as above.

## Boundaries

- **Custom computations with `createState`** are not covered: their bound-state
  value domain is application semantics the framework does not interpret. They keep
  the pre-existing behavior (`state-only` / `changed` decisions; state-only rebuild
  resets to declared defaults). If a Custom state is a renamed enumeration, migrate
  it by changing the default and approving `state-only`, or carry the migration in
  application code.
- **Transform and aggregation bound state** (Transform's `sourceRecordId` /
  `transformIndex`, aggregation values and per-item contributions, RealTime
  timestamps) is owned by the output-rebuild path. Migration never resets these to
  defaults; `rebuildStateDefaults` only applies to states the output path does not
  own. This is a framework-internal ownership declaration on the computation
  handles, not an application surface.
- Runtime transition semantics are unchanged: `TransitionFinder` /
  `incrementalCompute` behave exactly as before. This contract is about the
  migration window only.
