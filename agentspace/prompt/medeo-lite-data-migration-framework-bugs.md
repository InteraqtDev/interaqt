# Medeo Lite Data Migration Framework Bugs

## Scope

This document records only issues that appear to belong to the interaqt data migration framework or its generated migration model. Project-level workflow bugs, script bugs, or medeo-lite usage mistakes should be fixed in code and should not be tracked here.

These findings came from the `experiment/data-migration-validation` branch against the local PostgreSQL database. The experimental records and fields were isolated under the `data-migration-validation` module.

## Not Recorded Here

The `scripts/migrate-main.ts` bug where dry-run `blockingChanges` did not stop the real migration was a medeo-lite project script bug. It was fixed directly in `scripts/migrate-main.ts` and is intentionally not tracked as a framework bug in this document.

The `.computed = fn` backfill behavior is also not recorded as a confirmed framework bug here. It may be framework semantics rather than a migration defect. Until clarified, production data that must be migrated should use explicit interaqt computations instead of relying on `.computed = fn` same-run backfill.

## Bug: Dry Run Does Not Catch Some Unsupported Recompute Paths

When event-based `Transform` computations were incorrectly approved as `changed`, dry-run produced a rebuild plan and did not fail. The real migration then failed during recompute:

```text
Transform compute should not be called with eventDeps
```

Why this is framework-level:

The failure happens inside interaqt recompute execution. The migration dry-run and real migration disagree about whether the approved plan is executable.

Expected behavior:

Dry-run should validate recompute executability strongly enough to reject unsupported event-based `Transform` full recompute before the real migration phase.

Production risk:

A reviewed migration can pass dry-run and still fail during the real migration transaction. That makes dry-run less reliable as a production gate.

## Bug: StateMachine Rebuild Handler Requirement Cannot Be Approved

Adding a new `StateMachine` property computation to existing records produced a dry-run blocking change:

```text
unrebuildable-computation: property:MigrationProbe.lifecycle: event-based computation requires an approved event-rebuild-handler decision and runtime handler
```

However, when an explicit `event-rebuild-handler` decision was added for `property:MigrationProbe.lifecycle`, migration validation rejected it:

```text
Migration event rebuild decision does not match a required review item: property:MigrationProbe.lifecycle
```

Why this is framework-level:

Both the requirement and the rejection come from interaqt migration validation. The framework tells the user to provide a handler, but the approved diff validator does not accept that handler decision for the same data context.

Expected behavior:

If dry-run requires an event rebuild handler, the generated diff should include a matching required decision, or validation should accept the handler decision for that data context.

Production risk:

Some stateful computation changes cannot follow the documented migration approval path, blocking safe production migration for `StateMachine` changes that need existing data rebuild.

## Bug: Deleting Async Computation Creates Unapprovable Blocking Changes

Deleting the experimental `asyncNameCode` async `Custom` property produced blocking changes for internal async task fact records:

```text
unsupported-destructive-schema-change: _ASYNC_TASK__MigrationProbe_asyncNameCode
unsupported-destructive-schema-change: _ASYNC_TASK__MigrationProbe_asyncNameCode_MigrationProbe_asyncNameCode
```

Even with `--allow-destructive`, approval failed because these were emitted as blocking changes, not reviewed destructive scopes.

Why this is framework-level:

The blocked records are framework-generated internal async task records. Application code does not define these records directly, and the migration system gives no framework-supported cleanup path.

Expected behavior:

The framework should provide a documented cleanup/migration path for async computation task records, or classify them as reviewed destructive scopes when safe.

Production risk:

Once an async computation is shipped, removing it can be blocked by internal framework tables. This makes cleanup, rollback, or refactor of async computations unsafe.

## Bug: Deleting Fact Entity Is Blocking Instead Of Reviewable

Deleting the experimental `MigrationThrowaway` entity produced:

```text
unsupported-destructive-schema-change: MigrationThrowaway
reason: fact record was removed from the new schema
```

`--allow-destructive` did not help because the change was blocking, not a destructive scope.

Why this is framework-level:

Entity/table deletion is a core schema migration operation. The framework detected the removed fact record but did not expose a reviewable destructive migration path.

Expected behavior:

For an explicitly reviewed entity deletion, the framework should either generate a destructive scope decision that can be approved, or document that table deletion is unsupported and must be handled outside the migration workflow.

Production risk:

Production schema cleanup after removing entities is blocked by the migration approval flow.

## Bug: Deleting Non-Async Computed Property Leaves Orphan Physical Column

Deleting the experimental `MigrationProbe.nameCode` property removed it from the persisted manifest, but the physical PostgreSQL column remained:

```text
MigrationProbe.mig_nam_nctoeu
```

The diff reported `destructiveScopes=0`, so the workflow did not require explicit destructive approval and did not drop the column.

Why this is framework-level:

The framework owns the model-to-physical-schema migration. After migration, the persisted manifest and physical schema diverged: the model no longer contains the property, but the column still exists.

Expected behavior:

Property deletion should either generate an approved destructive scope and remove the column, or explicitly report that physical cleanup is unsupported.

Production risk:

Schema drift can accumulate silently. Code/model says a property is gone, but physical columns remain in production tables.
