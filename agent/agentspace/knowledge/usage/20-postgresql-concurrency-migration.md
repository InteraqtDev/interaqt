# PostgreSQL Concurrency Migration

This note summarizes user-visible changes from the PostgreSQL reactive computation concurrency fix.

## What Changed

interaqt now uses PostgreSQL as the concurrency coordinator for multi-process deployments:

- Built-in computations use atomic state updates, row locks, unique indexes, or SERIALIZABLE retry where needed.
- PostgreSQL id generation uses native sequences instead of writing `_IDS_`.
- `ScopedSequence` uses an internal `_ScopedSequence_` table plus transactional `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` to allocate per-scope serial numbers safely across controllers and processes.
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

## ScopedSequence Atomic Counters

Use `ScopedSequence` when a number property needs a unique serial inside a business scope, for example `project + prefix + serialNumber`.

Key semantics:

- Allocation happens after the host record create mutation and before the dispatch transaction commits.
- First automatic value is `initialValue + step`.
- Rollback rolls back the sequence increment because counter state and business writes share the same transaction.
- Deleting a record does not decrement the counter.
- Manual values are rejected unless `allowManualValue: true`.
- `allowManualValue: true` is for import/backfill only and does not advance the counter.
- Keep a `UniqueConstraint` over the scope fields and allocated property as the database integrity backstop.
- PostgreSQL is the production-safe driver for cross-connection/cross-process allocation. PGLite and SQLite are test/local single-process options only.

Migration rules:

- Adding or changing a `ScopedSequence` is not an ordinary recompute. Approve it as unrebuildable plus a scoped sequence seed/no-seed decision.
- Use `initializeFrom` to seed counters from existing values with `MAX(valuePath)` per scope.
- Do not partial-seed with `initializeFrom.match` when future allocations cover all host rows; otherwise unseeded existing scopes can later collide.
- Removing a declared `ScopedSequence` must be reviewed explicitly. Do not silently drop the declaration from the manifest while leaving internal counter state behind.

## Transaction API

Use callback transactions for storage-only work:

```typescript
await system.storage.runInTransaction(
  { name: 'my-operation', isolation: 'SERIALIZABLE' },
  async () => {
    // transactional work
  }
)
```

Do not use old manual transaction APIs such as `beginTransaction`, `commitTransaction`, or `rollbackTransaction`.

### Business transactions (storage + dispatch)

When the same request must write rows and then `dispatch` interactions that **see those uncommitted writes**, use `controller.runInBusinessTransaction`. A bare outer `storage.runInTransaction` around `controller.dispatch` is a **hard runtime error** (`BusinessTransactionBoundaryError` / `code: 'DISPATCH_IN_NON_BT_TRANSACTION'`). Nested `dispatch` remains `NestedDispatchError`. Pure storage `runInTransaction` without `dispatch` stays legal (section above).

```typescript
await controller.runInBusinessTransaction(
  { name: 'create-and-activate', isolation: 'READ COMMITTED' },
  async () => {
    const draft = await controller.system.storage.create('Draft', { … })
    return controller.dispatch(ActivateDraft, { user, payload: { draftId: draft.id } })
  }
)
```

| Rule | Detail |
|------|--------|
| Ownership | BT opens the outermost `BEGIN`/`COMMIT`. Nested inside `storage.runInTransaction` → `BusinessTransactionBoundaryError` (`NESTED_STORAGE_TRANSACTION`). |
| Path uniqueness | `dispatch` while a non-BT storage transaction is active → `DISPATCH_IN_NON_BT_TRANSACTION` (must migrate to BT). |
| Attempts | Each `dispatch` attempt uses a SAVEPOINT; failure rolls back that attempt’s writes. |
| Default abort | Condition rejection **throws**; BT rejects and outer ROLLBACK. Side effects flush only after owned COMMIT. |
| SERIALIZABLE | Top-level dispatch may still promote via `RequireSerializableRetry`. **Inside BT**, S is fail-fast — open BT with `isolation: 'SERIALIZABLE'` when Transform update/delete, full recompute, or replace gates require it. |
| Nested dispatch | Still `NestedDispatchError`. Sequential dispatches inside one BT callback are allowed. |

Full contract: [06-attributive-permissions.md](./06-attributive-permissions.md#business-transactions-same-request-storage-write--dispatch).

### Declarative Condition locks (concurrent admission)

For concurrent check-then-act (for example two connections debiting the same balance), declare `Condition.locks` so the framework runs `lockRecord` / `lockRows` before Condition content. Prefer the `AdmissionSnapshot` second argument over unlocked re-reads. Do not implement application-level `FOR UPDATE` SQL for this pattern.

Real PostgreSQL contract: `tests/runtime/postgresqlConditionAdmission.spec.ts` (balance `B`, two concurrent full debits → at most one success, balance ≥ 0).

## Testing PostgreSQL Concurrency

Run the real PostgreSQL concurrency suite with:

```bash
INTERAQT_POSTGRES_DATABASE=interaqt_test npm run test:postgres-concurrency
```

This script intentionally fails when `INTERAQT_POSTGRES_DATABASE` is missing, so PostgreSQL concurrency coverage cannot silently skip in CI.

For `ScopedSequence`, also run:

```bash
INTERAQT_POSTGRES_DATABASE=interaqt_test npm run test:postgres-scoped-sequence
```

This is the critical acceptance test for cross-controller scoped counter allocation.

Condition admission + business transaction contracts on real PostgreSQL:

```bash
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
  npx vitest run tests/runtime/postgresqlConditionAdmission.spec.ts tests/runtime/postgresqlBusinessTransaction.spec.ts
# or the full matrix:
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
  npm run test:postgres
```
