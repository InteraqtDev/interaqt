# PostgreSQL Concurrency Migration

This note summarizes user-visible changes from the PostgreSQL reactive computation concurrency fix.

## What Changed

interaqt now uses PostgreSQL as the concurrency coordinator for multi-process deployments:

- Built-in computations use atomic state updates, row locks, unique indexes, or SERIALIZABLE retry where needed.
- PostgreSQL id generation uses native sequences instead of writing `_IDS_`.
- Custom computations default to retryable `SERIALIZABLE` execution.
- Async return handling runs in a retryable transaction and applies freshness checks.

## Callback Replay Rules

The following callbacks may be replayed after SERIALIZABLE promotion, `40001`, or `40P01`:

- `guard`
- `mapEventData`
- `resolve`
- computation callbacks
- `afterDispatch`
- `asyncReturn`

Keep these callbacks deterministic. Do not send emails, charge payments, call irreversible external APIs, publish messages, or write non-transactional resources from these callbacks.

Use `recordMutationSideEffects` for irreversible external IO. Side effects run after the final successful commit and are not replayed for failed attempts.

## Custom Computation Concurrency

`Custom.create()` now defaults to:

```typescript
Custom.create({
  name: 'MyComputation',
  concurrency: 'serializable',
  // ...
})
```

Use `concurrency: 'atomic-safe'` only when the custom computation is explicitly safe under concurrent PostgreSQL `READ COMMITTED` execution, for example because it only uses atomic state or idempotent patches.

Even with `atomic-safe`, full recompute and entity/relation full replace paths still require SERIALIZABLE.

## Async Return Freshness

`handleAsyncReturn()` locks the task row and checks whether the task is still current.

Default freshness streams:

- Property async computation: scoped to the host record.
- Global async computation: scoped to the global result.
- Entity/relation async computation: scoped to the result target.

Pass an explicit `freshnessKey` when one entity or relation target needs multiple independent async streams:

```typescript
return ComputationResult.async({
  freshnessKey: `tenant:${tenantId}:job:${jobId}`,
  // task args...
})
```

Stale tasks are marked `skipped` and do not call `asyncReturn`.

## PostgreSQL ID Sequences

PostgreSQL ids are allocated with native sequences.

Migration behavior:

- New databases start at id `1`.
- Existing table max id is used to initialize the sequence.
- Existing `_IDS_` rows are read as legacy migration input when the table exists.
- Databases without `_IDS_` are supported.
- Shared physical tables use one sequence per physical table/id field.

Do not write `_IDS_` to control ids. `_IDS_` is legacy input only.

PostgreSQL sequence gaps are normal after rollback or failed transactions. Do not depend on contiguous ids.

## Transaction API

Use callback transactions:

```typescript
await system.storage.runInTransaction(
  { name: 'my-operation', isolation: 'SERIALIZABLE' },
  async () => {
    // transactional work
  }
)
```

Do not use old manual transaction APIs such as `beginTransaction`, `commitTransaction`, or `rollbackTransaction`.

## Testing PostgreSQL Concurrency

Run the real PostgreSQL concurrency suite with:

```bash
INTERAQT_POSTGRES_DATABASE=interaqt_test npm run test:postgres-concurrency
```

This script intentionally fails when `INTERAQT_POSTGRES_DATABASE` is missing, so PostgreSQL concurrency coverage cannot silently skip in CI.
