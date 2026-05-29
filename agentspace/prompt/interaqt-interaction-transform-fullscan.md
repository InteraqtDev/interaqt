# Interaqt InteractionEventEntity Transform Full-Scan Issue

Status: documented for separate follow-up.
Date: 2026-05-29.

## Summary

`Transform.create({ record: InteractionEventEntity })` currently behaves like an event-derived incremental transform at the API level, but the runtime still resolves its implicit `_source` data dependency with a full `storage.find('_Interaction_')` before entering the incremental patch path.

In Mesh this is amplified because many domain entities use `record: InteractionEventEntity` to mean "listen to one interaction name". Every read interaction also writes an `_Interaction_` event, so frequent polling of read interactions repeatedly triggers all data-based interaction transforms.

This should be treated as a separate framework/modeling issue.

This document records the issue only. Do not treat it as an implementation plan for the current Freecut polling investigation unless a follow-up task explicitly picks it up.

## Observed Impact

Tested with `ListPendingEditorRuntimeRequests` against the local PostgreSQL database:

```text
totalMs: 786
fullFind(_Interaction_): 49 calls, 639ms total
findOne(_Interaction_ by id): 49 calls, 99ms total
_Interaction_ rows: 12333
ListPendingEditorRuntimeRequests rows: 11364
```

Direct PostgreSQL sequential scan over `_Interaction_` is only around 1-2ms for this row count, so the slow request is caused by repeated runtime dispatch/query/mapping overhead, not one slow SQL scan.

## Root Cause

For a data-based Transform:

```ts
Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback(event) {
    if (event.interactionName !== SomeInteraction.name) return null
    return { ... }
  },
})
```

Interaqt internally creates an implicit records data dependency:

```ts
_source: {
  type: 'records',
  source: InteractionEventEntity,
  attributeQuery,
}
```

During dispatch, the scheduler does this:

1. A read interaction creates a new `_Interaction_` record.
2. Source maps match `_Interaction_ + create`.
3. Every data-based Transform whose `_source` is `InteractionEventEntity` is considered dirty.
4. `Scheduler.runComputation()` calls `resolveDataDeps()` before incremental patch compute.
5. `resolveDataDeps()` resolves records deps with `storage.find(source.name, undefined, {}, attributeQuery)`.
6. Only after that does `Transform.dataBasedIncrementalPatchCompute()` run, which performs the expected `findOne(_Interaction_, id = newEventId)`.

So each matching data-based Transform performs both:

```text
find(_Interaction_, undefined)       // full table read
findOne(_Interaction_, id = eventId) // incremental read
```

The full read is unnecessary for the create-event incremental patch path.

## Key Code References

- `node_modules/interaqt/dist/index.js:7647`
  `Transform` constructor converts `record` mode into implicit `_source` records data dependency.

- `node_modules/interaqt/dist/index.js:7708`
  `dataBasedIncrementalPatchCompute()` uses `findOne()` by the new source record id, which is the expected incremental behavior.

- `node_modules/interaqt/dist/index.js:9454`
  `runComputation()` resolves data deps before selecting incremental patch compute.

- `node_modules/interaqt/dist/index.js:9574`
  `resolveDataDeps()` resolves `records` deps using `storage.find(source.name, undefined, {}, attributeQuery)`.

- `node_modules/interaqt/dist/index.js:6422`
  Source map for `records` deps matches only by source record and mutation type, not by `interactionName`.

- `modules/editor-registry/definitions.ts:325`
  Example Mesh usage of `record: InteractionEventEntity`.

- `modules/_reference/crud.example.ts:180`
  Reference example using `eventDeps` for interaction-based Transform.

## Why This Looks Like A Framework Bug

The framework exposes and implements an incremental patch path for data-based Transform create events, but the scheduler preloads the full records dependency before invoking that path. That contradicts the practical expectation of incremental Transform behavior.

This is not just an index or database tuning issue. An index on `_Interaction_.id` helps the `findOne()` path, but not the `find(_Interaction_, undefined)` path.

## Mesh Modeling Contributor

Mesh currently uses `record: InteractionEventEntity` for many interaction-derived projections. The callback then filters by `event.interactionName`.

That means filtering happens too late. The scheduler has already:

- matched the Transform as dirty,
- resolved `_source`,
- read the whole `_Interaction_` table.

`eventDeps` is a better fit for "react to this interaction event" semantics because event deps can match the mutation event directly:

```ts
Transform.create({
  eventDeps: {
    createRequest: {
      recordName: InteractionEventEntity.name,
      type: 'create',
      record: { interactionName: CreateEditorRuntimeRequest.name },
    },
  },
  callback(mutationEvent) {
    const event = mutationEvent.record
    return { ... }
  },
})
```

## Candidate Fixes

### Framework-Level Fix

Avoid resolving data deps that are not needed by `incrementalPatchCompute()`.

For `Transform` create events in data-based mode, the runtime can call the incremental patch compute directly and let it fetch the single source record by id. It should not pre-resolve `_source` with a full-table `find()`.

Possible approaches:

- Skip `resolveDataDeps()` before `incrementalPatchCompute()` when the computation does not consume resolved deps.
- Let computations declare which deps are needed for incremental mode.
- Special-case Transform `_source` for create events and provide only the created source record.

### Mesh-Level Mitigation

Migrate interaction-derived entity projections from:

```ts
record: InteractionEventEntity
```

to:

```ts
eventDeps: {
  someInteraction: {
    recordName: InteractionEventEntity.name,
    type: 'create',
    record: { interactionName: SomeInteraction.name },
  },
}
```

This prevents unrelated read interactions from dirtying every interaction-derived Transform.

## Suggested Follow-Up Task

Open a dedicated task to:

1. Build a minimal reproduction with one read interaction and one `record: InteractionEventEntity` Transform.
2. Confirm whether the latest interaqt version still full-scans before incremental patch compute.
3. Patch or report the framework issue.
4. Migrate Mesh interaction-derived Transforms to `eventDeps` where compatible.
5. Add a regression test asserting that read interactions do not perform unrelated `_Interaction_` full-table reads.
