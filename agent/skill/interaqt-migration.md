# interaqt Migration Guide

> Use this guide when upgrading an existing interaqt database after changing entities, relations, properties, dictionaries, or computations.

---

## What Migration Does

interaqt migration preserves existing fact data and recomputes derived data from the current reactive declarations.

Phase 1.5 uses a two-step review workflow:

1. Generate a structured diff with `controller.generateMigrationDiff()`.
2. Review the diff, set `status: "approved"`, add explicit decisions, then execute `controller.migrate({ approvedDiff })`.

Migration supports additive schema changes, changed/new computation recompute, downstream propagation, filtered membership rebuild, destructive-scope review, and post-backfill constraint verification.

Phase 1.5 does not guess or execute rename/copy/merge/split primitives. Rename candidates may be recorded for review, but compute-route migration will still obey physical layout and destructive-change safety gates.

---

## Core APIs

```typescript
await controller.setup(true)
await controller.setup(false)

const diff = await controller.generateMigrationDiff({
  includeFunctionText: false,
  includeDestructiveScope: true,
})

const approvedDiff = {
  ...diff,
  status: 'approved' as const,
  decisions: [
    ...diff.decisions,
    // one explicit decision for every item in diff.requiredDecisions
  ],
}

const dryRunPlan = await controller.migrate({ approvedDiff, dryRun: true })
const plan = await controller.migrate({ approvedDiff, handlers })

await controller.setup({ migrate: { approvedDiff, handlers } })
await controller.createMigrationBaseline()
```

Important exports include:

```typescript
import {
  createMigrationManifest,
  hashMigrationDiff,
  readMigrationManifest,
  writeMigrationManifest,
  MigrationDiffFile,
  MigrationDecision,
  MigrationDecisionRequirement,
  MigrationHandlers,
  MigrationBaselineError,
  PhysicalLayoutChangeError,
  UnrebuildableComputationError,
  AsyncMigrationComputationError,
  DestructiveComputedOutputError,
} from 'interaqt'
```

`setup({ migrate: true })` and bare `controller.migrate()` are intentionally unsupported. Migration execution must carry an approved review artifact.

---

## Recommended Lifecycle

### 1. First Install

Use `setup(true)` only for a fresh install or an intentional test reset. It creates tables, installs indexes/constraints, initializes computation state, and writes the baseline migration manifest.

### 2. Normal Startup

Use `setup(false)` when code and database manifest already match.

If the stored manifest differs from current definitions, `setup(false)` fails before installing the runtime map and tells you to generate and approve a migration diff.

### 3. Generate Review Diff

```typescript
const diff = await controller.generateMigrationDiff({
  includeFunctionText: true,
  includeDestructiveScope: true,
})

console.log(diff.changes)
console.log(diff.requiredDecisions)
console.log(diff.safety.blockingChanges)
console.log(diff.safety.destructiveScopes)
```

`changes` includes logical model changes (`record`, `property`, `relation`, `dictionary`), storage changes, and computation changes.

Function text/hash is review evidence only. interaqt does not automatically decide semantic change from `Function.toString()`.

### 4. Approve Decisions

```typescript
const approvedDiff = {
  ...diff,
  status: 'approved' as const,
  decisions: diff.requiredDecisions.map(item => {
    if (item.kind === 'computation') {
      return {
        kind: 'computation' as const,
        id: item.id,
        dataContext: item.dataContext,
        decision: item.recommendedDecision,
        reason: 'reviewed and approved',
      }
    }

    if (item.kind === 'event-rebuild-handler') {
      return {
        kind: 'event-rebuild-handler' as const,
        dataContext: item.dataContext,
        handlerRef: 'ticketStatus',
        reason: 'status can be reconstructed from durable facts',
      }
    }

    if (item.kind === 'async-completion-handler') {
      return {
        kind: 'async-completion-handler' as const,
        dataContext: item.dataContext,
        handlerRef: 'scoreCompletion',
        reason: 'async args contain final value',
      }
    }

    return {
      kind: 'destructive-scope' as const,
      dataContext: item.dataContext,
      recordName: item.recordName,
      ids: item.ids,
      reason: 'reviewed exact destructive scope',
    }
  }),
}
```

Approved decisions are audit data. Handler functions are not stored in the diff file.

### 5. Dry Run

```typescript
const dryRunPlan = await controller.migrate({
  approvedDiff,
  dryRun: true,
  handlers,
})

console.log(dryRunPlan.blockingChanges)
console.log(dryRunPlan.rebuildPlan)
console.log(dryRunPlan.deletionScope)
```

Dry-run validates approved decisions, handler references, safety gates, and destructive scope ids. It does not apply schema, recompute data, or write the manifest.

### 6. Execute

```typescript
const plan = await controller.migrate({
  approvedDiff,
  handlers,
})
```

On success, interaqt writes the new manifest and records approved diff metadata in the migration log.

---

## Identity and Model Hash

Phase 1.5 does not require migration-specific `uuid`, `version`, or `migrationKey`.

Default identity comes from stable name paths:

- `entity:Product`
- `property:Product.price`
- `relation:ProductCategory`
- `dictionary:globalProductCount`
- `computation:property:Product.doublePrice:Custom`

If the same kind/name path appears more than once in one model, diff generation fails and asks you to make names explicit.

`uuid` is recorded as an auxiliary review clue when present, but it does not drive migration identity or model hash. This prevents random generated uuids from causing false manifest mismatches.

---

## Computation Decisions

Use computation decisions to control recompute semantics:

```typescript
{ kind: 'computation', id, dataContext, decision: 'changed', reason: 'callback now doubles price' }
{ kind: 'computation', id, dataContext, decision: 'unchanged', reason: 'format-only callback change' }
{ kind: 'computation', id, dataContext, decision: 'state-only', reason: 'state default changed only' }
{ kind: 'computation', id, dataContext, decision: 'unrebuildable', reason: 'requires manual migration' }
```

Rules:

- `changed` is a seed rebuild and propagates downstream output events.
- `unchanged` is not a seed rebuild, but it can still rebuild if an upstream changed output affects it.
- `state-only` rebuilds bound state without propagating output events.
- `unrebuildable` becomes a blocking change.

New computations must be approved as `changed`.

---

## Event and Async Handlers

Event-based computations without full compute support require external rebuild handlers.

Async computations that return `ComputationResult.async()` require external completion handlers.

```typescript
const handlers = {
  eventRebuild: {
    ticketStatus: async ({ record }) => record?.closedAt ? 'closed' : 'open',
  },
  asyncCompletion: {
    scoreCompletion: async ({ args }) => (args as { finalValue: number }).finalValue,
  },
}

await controller.migrate({ approvedDiff, handlers })
```

Handler decisions reference handlers by `handlerRef`. Missing handlers fail fast. Handlers must return a direct final output; returning `ComputationResult.resolved()` or another async marker is rejected.

Do not put migration-only handlers on business model objects. `migrationCompute` and `migrationAsync` are not part of the Phase 1.5 workflow.

---

## Destructive Computed Outputs

Migration refuses destructive computed output unless the approved diff contains an exact matching `destructive-scope` decision.

This covers:

- `_isDeleted_` computed property that deletes host records.
- Transform stale derived row cleanup.
- Entity/relation delete patches.

`generateMigrationDiff({ includeDestructiveScope: true })` reports candidate scopes. `migrate({ dryRun: true })` recalculates actual scope and fails if approved ids differ. Execution recalculates again before recompute.

---

## Safety Gates

Approved diff cannot bypass core safety gates:

- Fact physical path moves remain blocked.
- Fact destructive schema changes remain blocked.
- Entity/relation output replacement still needs previous manifest ownership proof.
- Async computations require an approved async completion decision and runtime handler.
- Event-based computations without full compute require an approved event rebuild decision and runtime handler.
- Destructive computed output requires exact approved ids.
- Unique/non-null constraints are verified after backfill and before post-recompute indexes/constraints are created.

---

## Baseline Existing Databases

If an existing database has no migration manifest, normal setup and migration fail.

Use `createMigrationBaseline()` only when current definitions exactly match the existing schema:

```typescript
await controller.createMigrationBaseline()
```

Baseline creation fails if schema planning reports missing DDL or blocking changes. Do not use baseline to skip a real model change.

---

## Resume Behavior

Migration writes:

- `__interaqt_migration_manifest`
- `__interaqt_migration_log`
- `__interaqt_migration_lock`
- `__interaqt_migration_operation_log`

Resume is keyed by both `modelHash` and `approvedDiffHash`, so the same model with different review decisions does not reuse the wrong failed run.

Schema DDL, verification, post-recompute constraints, and manifest write use operation-log markers. Computation rebuild resume is phase-level, not per-computation checkpoint.

---

## Common Failure Messages

### `Model manifest mismatch`

You called `setup(false)` with changed model definitions. Run `controller.generateMigrationDiff()`, approve it, then call `controller.migrate({ approvedDiff })`.

### `Migration requires an approved diff`

You called migration without reviewed input. Generate and approve a diff first.

### `Migration approvedDiff is stale`

The diff was generated for a different database manifest or current model. Generate a fresh diff and review it again.

### `Missing migration decision`

Every current required decision must have exactly one matching decision in the approved diff. Execution rebuilds the expected diff and does not trust a user-edited `requiredDecisions` list as the source of truth.

### `Missing migration event rebuild handler`

The approved diff references an event rebuild handler, but `migrate({ handlers })` did not provide it.

### `Missing migration async completion handler`

The approved diff references an async completion handler, but `migrate({ handlers })` did not provide it.

### `physical-path-move`

A fact record/property/relation moved physical storage location. Phase 1.5 will not guess a copy/rename.

### `destructive-computed-output`

Migration would delete computed output or host records. Inspect `diff.safety.destructiveScopes` and dry-run `deletionScope`, then approve exact ids only when intended.

---

## Safe Migration Checklist

- [ ] Run `controller.generateMigrationDiff({ includeDestructiveScope: true })`.
- [ ] Review logical model changes, storage changes, function hashes/text, required decisions, and safety output.
- [ ] Add one explicit decision for every required decision.
- [ ] Provide runtime handlers for event rebuild and async completion decisions.
- [ ] Run `controller.migrate({ approvedDiff, dryRun: true, handlers })`.
- [ ] Confirm `blockingChanges` is empty and `rebuildPlan` is expected.
- [ ] Confirm destructive scopes match exactly when cleanup is intentional.
- [ ] Run `controller.migrate({ approvedDiff, handlers })`.
- [ ] Run integration tests for the production driver, especially PostgreSQL/MySQL.
