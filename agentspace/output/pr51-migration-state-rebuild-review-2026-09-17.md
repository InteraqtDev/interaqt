# Review of PR #51 — migration omits bound-state rebuild when output is also rebuilt

PR: https://github.com/InteraqtDev/interaqt/pull/51
Reviewed against `main` at `f9f06b3` on 2026-09-17.

## Verdict

The defect described in the PR exists on current `main`. The two-line change in
`MigrationScheduler.run()` is correct for the scenario it reproduces, but it fixes one
instance of a wider problem: the migration pipeline has no mechanism for remapping a
StateMachine's persisted `currentState` when the state graph changes. A sibling scenario
(renaming a non-initial state) still fails with the PR applied, and a second consumer of
`rebuildStateDefaults` (Transform) would be damaged if the new branch were ever reached
for it.

## 1. Symptom and mechanism confirmed

`src/runtime/migration.ts` (`MigrationScheduler.run`, line 3659 on `main`):

```
if (item.rebuildState && !item.rebuildOutput) {
    await this.rebuildStateDefaults(computation);
    continue;
}
```

`buildRebuildPlan` (line 2418) sets `rebuildState = (stateOnly || stateChanged) && boundStates.length > 0`
and `rebuildOutput = stateOnly ? false : outputChanged || !seed`. Renaming a StateMachine's
initial state changes both signatures:

- `stateSignature` — `currentState`'s `defaultValue` is `initialState.name`
  (`StateMachine.ts` lines 156 and 215), so the default signature changes.
- `structuralSignature` — `argsSignature` canonicalizes `StateNode.name`, so the change is
  classified `changed` (not `state-only`) and the approved decision is `changed`, which puts
  the id into `outputChangedIds`.

Result: `rebuildState = true`, `rebuildOutput = true`, and the guard above skips
`rebuildStateDefaults`. The output rebuild path (`runFullRecompute` → event rebuild handler
→ `writeComputationResult`) never writes bound state; `setInternal` appears only in
`rebuildStateDefaults` (grep over `migration.ts`). The persisted `currentState` keeps the old
state name, `TransitionFinder.findNextState` finds no outgoing transfer from a name that is
no longer in the graph, `incrementalCompute` returns `ComputationResult.skip()`, and the
dispatch reports success with no effect.

Empirical confirmation: the PR's `migrationStateRebuild.spec.ts` run against unmodified
`main` fails the two `renamed=true` rows (property and global) and passes the three
controls, exactly as the PR table states. With the PR's `migration.ts` change applied, all
five pass and `tests/runtime/migration.spec.ts` (90 tests) still passes.

## 2. The fix covers one instance; the class remains

### 2.1 Non-initial state rename is not covered (verified)

Probe (temporary spec, removed after the run): states `pending → approved → archived`;
a record is moved to `approved`; the new model renames `approved` to `accepted`, with an
event rebuild handler that converts the output value.

Observed with the PR fix applied:

- diff classification: `changeType: changed`, `stateSignatureChanged: false`
  (the initial state's name is unchanged, so `currentState.defaultValue` is unchanged);
- rebuild plan: `{ rebuildState: false, rebuildOutput: true }`;
- after migration: `status = 'accepted'`, persisted `currentState = 'approved'`;
- `Archive` dispatch: `error` undefined, `status` and `currentState` unchanged.

Same symptom, same mechanism, different trigger. `stateSignature` only sees the *default*
of the bound state, not the set of legal values, so any rename of a non-initial state is
invisible to `rebuildState`.

Even if `rebuildState` were true here, `rebuildStateDefaults` would be the wrong action:
it resets every record to the initial state, so an `approved` record would silently become
`pending`. The correct action is a per-record mapping old-name → new-name, and the current
event rebuild handler contract (`({ controller, dataContext, record }) => outputValue`)
provides no channel to express it.

### 2.2 Transform ordering hazard introduced by the fix (latent)

With the PR change, a plan with `rebuildState && rebuildOutput` runs
`rebuildStateDefaults` *before* `runFullRecompute`. For Transform,
`recomputeTransformOutput` (line 3436) keys existing output rows by
`${row[sourceRecordId]}:${row[transformIndex]}`. Resetting those columns to their defaults
(`''`, `0`) first collapses every existing row onto the key `:0`; the `Map` keeps only one
of them, every recomputed item is created as new, and only the single surviving row is
deleted as stale. The outcome would be duplicated output rows with blank source pointers.

Reachability today: Transform's bound-state shape is fixed by the framework, so
`stateSignature` cannot change for an existing Transform through application declarations.
It can change across a framework upgrade that adds or renames a Transform bound state,
which is precisely when both flags would be true. The pre-existing `state-only` path has
the same problem for Transform (reset without recompute destroys the source mapping); the
PR widens the set of plans that walk into it.

For data-based aggregations (Count, Summation, Average, Every, Any, WeightedSummation)
the order is harmless: their `compute` / `persistFullResult` rewrite all bound state.

### 2.3 Readers of the `rebuildState` / `rebuildOutput` surface

- `MigrationScheduler.run` — the branch fixed by the PR. Also used by
  `simulateCascadeDeletionScope`, so the simulation and the real run stay consistent.
- `addMissingRebuildHandlerRequirements` (line 1902) — only `rebuildOutput`; unaffected.
- `getCascadeAwareDeletionScope` (lines 3597, 3611) — only `rebuildOutput`; unaffected.
- `rebuildStateDefaults` consumers by computation type: StateMachine (state not owned by
  output path — the PR's case), Custom with `createState` (same exposure as StateMachine
  if the handler does not rebuild state), Transform (state owned by output path — reset is
  harmful), aggregations (state rebuilt by `compute` — reset is redundant).

## 3. Assessment of the PR as submitted

Correct and minimal for its scenario. Concerns before merge:

1. It is a point fix. The registry entry it adds (`WritingComputationTests.md`) requires
   post-migration interaction checks, which is the right oracle, but the matrix it
   prescribes still only varies `rebuildState`/`rebuildOutput`. It should also vary
   *which* state is renamed (initial vs non-initial) and *which* computation family owns
   the state (StateMachine / Custom vs Transform vs aggregation).
2. A design decision is needed on how a StateMachine (or Custom) migration expresses the
   old-state → new-state mapping. Options, in increasing scope:
   - let the event rebuild handler return bound state alongside the output value
     (for example `{ value, state: { currentState: 'accepted' } }`), written through
     `RecordBoundState.setInternal` / `GlobalBoundState.setInternal` in
     `writeComputationResult`;
   - require a StateMachine-specific decision (`state-mapping`) in the approved diff when
     the set of state names changes, and fail fast at `migrate()` if a persisted state name
     is not in the new graph.
   Either way, `rebuildStateDefaults` should be restricted to states the output path does
   not own, or the ordering should be per-family, so Transform cannot reach it.
3. A setup-time or migration-time invariant is missing: "every persisted `currentState`
   value is a state name in the current graph". Both the PR's scenario and §2.1 violate it
   silently; a fail-fast (or at least a migration blocking change) would have surfaced both
   before any dispatch.
4. The real-PostgreSQL run (`tests/runtime/postgresql*.spec.ts`) is still pending, as the
   PR notes.

## 4. Verification performed

- `gh pr diff 51` applied to a scratch state: test file only → 2 failed / 3 passed on
  unmodified `main`; test + `migration.ts` change → 5 passed, `migration.spec.ts` 90 passed.
- Non-initial rename probe (§2.1) with the PR change applied → fails.
- Working tree restored; no repository files were left modified except this report.
