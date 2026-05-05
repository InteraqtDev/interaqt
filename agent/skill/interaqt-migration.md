# interaqt Migration Guide

> Use this guide when upgrading an existing interaqt database after changing entities, relations, properties, dictionaries, or computations.

---

## What Migration Does

interaqt migration preserves existing fact data and recomputes derived data from the current reactive declarations.

Phase 1 migration supports the compute route:

- Additive schema changes: new tables, new columns, internal migration tables, deferred indexes/constraints.
- Recompute changed or newly added computations only.
- Propagate recomputed outputs to affected downstream computations.
- Rebuild filtered entity/relation membership flags.
- Verify unique/non-null constraints after backfill and before creating post-recompute indexes.
- Persist a migration manifest so later changes can be diffed safely.

Phase 1 does **not** guess renames, copies, merges, or splits. If a fact field moved physically, migration fails and asks for a later primitive/handler.

---

## Core APIs

```typescript
await controller.setup(true)
await controller.setup(false)
await controller.setup({ migrate: true })
await controller.setup({ migrate: { dryRun: true } })

const plan = await controller.migrate({
  mode: 'compute',
  dryRun: true,
  hints: [],
  allowDestructiveCleanup: false,
})

await controller.createMigrationBaseline()
```

Important exports:

```typescript
import {
  Controller,
  createMigrationManifest,
  readMigrationManifest,
  writeMigrationManifest,
  MigrationBaselineError,
  PhysicalLayoutChangeError,
  UnrebuildableComputationError,
  AsyncMigrationComputationError,
  DestructiveComputedOutputError,
} from 'interaqt'
```

---

## Recommended Lifecycle

### 1. First Install

Use `setup(true)` only for a fresh install or a test reset.

```typescript
const system = new MonoSystem(db)
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities,
  relations,
  dict,
  eventSources,
})

await controller.setup(true)
```

This creates tables, installs indexes/constraints, initializes computation state, and writes the baseline migration manifest.

Do not call `setup(true)` against production data unless you intentionally want a destructive reset.

### 2. Normal Startup

Use `setup(false)` when code and database manifest already match.

```typescript
await controller.setup(false)
```

If the stored manifest differs from the current definitions, `setup(false)` fails before installing the new runtime map. The error tells you to run migration instead.

### 3. Dry Run After Model Changes

Always run dry-run first.

```typescript
const plan = await controller.migrate({ dryRun: true })

console.log(plan.changedComputations)
console.log(plan.rebuildPlan)
console.log(plan.schemaPlan?.preRecomputeDDL)
console.log(plan.schemaPlan?.verificationDDL)
console.log(plan.schemaPlan?.postRecomputeDDL)
console.log(plan.blockingChanges)
console.log(plan.deletionScope)
```

Dry-run opens the database for schema reading and builds a plan without applying additive schema or recomputing data.

### 4. Execute Migration

Run migration only after dry-run has no blocking changes.

```typescript
const plan = await controller.migrate()
```

On success, interaqt writes the new migration manifest. Running dry-run again should produce an empty `changedComputations` and `rebuildPlan`.

```typescript
const secondPlan = await controller.migrate({ dryRun: true })
// secondPlan.changedComputations.length === 0
// secondPlan.rebuildPlan.length === 0
```

---

## Baseline Existing Databases

If a database already contains data but has no migration manifest, normal setup and migration fail. Create a baseline only when the current definitions exactly match the existing schema.

```typescript
const manifest = await controller.createMigrationBaseline()
```

Baseline creation fails if schema diff requires new DDL or reports blocking changes.

Use baseline for:

- Existing deployments created before migration support.
- Restored databases where the manifest was lost.
- One-time adoption of the migration system.

Do not use baseline to skip a real model change. Baseline means "the database already matches this model."

---

## Production Identity Requirements

Migration compares old and new manifests. Production migration requires stable identities for public model objects and computations.

In this codebase, tests use explicit constructor options:

```typescript
const Product = new Entity({
  name: 'Product',
  properties: [
    new Property({ name: 'price', type: 'number' }, { uuid: 'product-price' }),
  ],
}, { uuid: 'product' })

const doublePrice = new Custom({
  name: 'DoublePrice',
  dataDeps: { current: { type: 'property', attributeQuery: ['price'] } },
  compute: async (_deps, record) => record.price * 2,
}, { uuid: 'product-double-price-computation' })
;(doublePrice as any).migrationKey = 'v1'
```

Rules:

- Entity/relation/property/dictionary/computation identity must stay stable across versions.
- Function-based computations must provide `version` or `migrationKey`.
- If callback semantics change, update `migrationKey` or `version`.
- Do not rely on `Function.toString()` or inferred callback identity.

If stable identity is missing, migration fails fast with an ambiguous signature or unrebuildable computation error.

---

## Computation Changes

### Add a Computed Property

Version 1:

```typescript
const Product = new Entity({
  name: 'Product',
  properties: [
    new Property({ name: 'price', type: 'number' }, { uuid: 'product-price' }),
  ],
}, { uuid: 'product' })
```

Version 2:

```typescript
const doublePrice = new Custom({
  name: 'DoublePrice',
  dataDeps: { current: { type: 'property', attributeQuery: ['price'] } },
  compute: async (_deps, record) => record.price * 2,
}, { uuid: 'product-double-price-computation' })
;(doublePrice as any).migrationKey = 'v1'

const Product = new Entity({
  name: 'Product',
  properties: [
    new Property({ name: 'price', type: 'number' }, { uuid: 'product-price' }),
    new Property({
      name: 'doublePrice',
      type: 'number',
      computation: doublePrice,
    }, { uuid: 'product-double-price' }),
  ],
}, { uuid: 'product' })
```

Migration adds the column, computes `doublePrice` for existing rows, emits migration events, and recomputes affected downstream computations.

### Change a Computation

When a function changes, bump `migrationKey`.

```typescript
;(doublePrice as any).migrationKey = 'v2'
```

Only changed computations and downstream affected computations rebuild. Unaffected computations do not rerun.

### State-Only Changes

If only bound state schema/default changes and output does not change, migration rebuilds state but does not propagate output events downstream.

---

## Transform Entity/Relation Outputs

Transform outputs are derived entity/relation records. Migration aligns old and new output rows using Transform bound state:

- `sourceRecordId`
- `transformIndex`

Migration updates existing derived rows, inserts new derived rows, and blocks stale derived row deletion unless destructive cleanup is explicitly allowed.

Default:

```typescript
await controller.migrate()
// throws if stale derived rows would be deleted
```

Audited destructive cleanup:

```typescript
await controller.migrate({
  allowDestructiveCleanup: true,
})
```

Use dry-run first to inspect `deletionScope` and blocking changes.

---

## Destructive Computed Outputs

Migration refuses destructive computed output by default.

Blocked by default:

- `_isDeleted_` computed property that would delete host records.
- Transform/entity/relation delete patches.
- Stale derived output cleanup.

For `_isDeleted_`, pass an audited scope:

```typescript
const dryRun = await controller.migrate({ dryRun: true })
console.log(dryRun.deletionScope)

await controller.migrate({
  allowDestructiveCleanup: true,
  destructiveScope: [
    {
      dataContext: 'property:User._isDeleted_',
      recordName: 'User',
      ids: ['1', '2'],
    },
  ],
})
```

The actual deletion scope must match exactly, otherwise migration fails.

---

## Async Computations

Ordinary `ComputationResult.async()` is not a migration completion contract. Migration must know the final output is written before verification and manifest write.

Without migration async contract:

```typescript
const c = new Custom({
  name: 'AsyncValue',
  compute: async () => ComputationResult.async({}),
  asyncReturn: async () => 1,
}, { uuid: 'async-value-computation' })
;(c as any).migrationKey = 'v1'

await controller.migrate({ dryRun: true })
// plan.blockingChanges contains async-computation
```

With migration async contract:

```typescript
const c = new Custom({
  name: 'AsyncValue',
  compute: async () => ComputationResult.async({ finalValue: 7 }),
  asyncReturn: async () => 1,
}, { uuid: 'async-value-computation' })

;(c as any).migrationKey = 'v1'
;(c as any).migrationAsync = async ({ args }) => args.finalValue
```

Migration waits for `migrationAsync` and writes the returned final output.

---

## Event-Based Computations

Event-based computations such as `StateMachine` cannot be reconstructed from historical runtime events unless they provide a migration contract.

Blocked:

```typescript
const sm = new StateMachine({
  states,
  transfers,
  initialState,
}, { uuid: 'order-status-machine' })
;(sm as any).migrationKey = 'v1'
```

Allowed:

```typescript
const sm = new StateMachine({
  states,
  transfers,
  initialState,
  migrationCompute: async ({ record }) => 'migrated',
}, { uuid: 'order-status-machine' })
;(sm as any).migrationKey = 'v1'
```

Use `migrationCompute` only when it deterministically computes the final current value from durable facts.

---

## Constraints

Migration uses a two-phase constraint flow:

1. Add columns/tables in writable form.
2. Recompute/backfill derived values.
3. Verify unique/non-null constraints.
4. Create post-recompute indexes/constraints.

If verification finds bad data, migration fails before creating the constraint.

Example computed unique property:

```typescript
const normalizedEmail = new Custom({
  name: 'NormalizeEmail',
  dataDeps: { current: { type: 'property', attributeQuery: ['email'] } },
  compute: async (_deps, record) => record.email.toLowerCase(),
}, { uuid: 'account-normalized-email-computation' })
;(normalizedEmail as any).migrationKey = 'v1'

const Account = new Entity({
  name: 'Account',
  properties: [
    new Property({ name: 'email', type: 'string' }, { uuid: 'account-email' }),
    new Property({
      name: 'normalizedEmail',
      type: 'string',
      computation: normalizedEmail,
    }, { uuid: 'account-normalized-email' }),
  ],
  constraints: [
    new UniqueConstraint({
      name: 'normalized_email_unique',
      properties: ['normalizedEmail'],
    }, { uuid: 'account-normalized-email-unique' }),
  ],
}, { uuid: 'account' })
```

If the driver cannot safely add post-recompute unique/non-null constraints, migration fails with a driver capability error.

---

## Physical Layout Safety

interaqt storage may merge records into one table or split relation links into physical fields. Migration never assumes one entity equals one table.

Migration blocks fact data physical moves:

- Fact property field moved.
- Fact relation `source`/`target` physical field moved.
- Fact record table changed.
- Fact property type/collection changed.
- Fact attribute removed.

Computed outputs may move only when ownership proof shows the output is exclusively managed by that computation.

If you see `physical-path-move`, do not force the migration. Use a future primitive/handler or a manual data migration strategy.

---

## Ownership Proof

Entity/relation computed outputs can replace or delete old derived records only when the previous manifest proves exclusive ownership.

Blocked cases:

- A fact entity becomes a computed entity with the same name.
- A previous manifest lacks output ownership proof.
- A shared output is treated as exclusive.

This prevents accidental deletion of user facts.

---

## Resume Behavior

Migration writes:

- Migration log.
- Migration lock.
- Operation log for schema DDL, verification, post constraints/indexes, and manifest write.

If a migration fails after a DDL operation succeeds, retrying skips the recorded operation.

Current limitation:

- Computation rebuild resume is phase-level, not per-computation checkpoint.
- If computation rebuild fails midway, retry recomputes the whole computation phase.

This is intentional until emitted migration events or dirty sets can be safely journaled and replayed.

---

## Hints

`hints` are accepted and included in the plan, but Phase 1 does not execute acceleration primitives.

```typescript
const plan = await controller.migrate({
  dryRun: true,
  hints: [
    { kind: 'from', target: 'Staff.fullName', source: 'Worker.name' },
  ],
})
```

Use hints only as future metadata. Do not expect Phase 1 to rename/copy/backfill from hints.

---

## PostgreSQL Integration

Real PostgreSQL migration tests are gated by environment variables:

```bash
INTERAQT_POSTGRES_DATABASE=interaqt_migration_test \
PGHOST=127.0.0.1 \
PGPORT=5432 \
PGUSER=postgres \
npx vitest run tests/runtime/postgresqlMigration.spec.ts
```

The test covers:

- Real PostgreSQL compute migration and manifest persistence.
- Real PostgreSQL schema operation-log resume.

---

## Common Failure Messages

### `Model manifest mismatch`

You called `setup(false)` with changed model definitions. Run dry-run migration.

```typescript
await controller.migrate({ dryRun: true })
```

### `Migration baseline manifest not found`

The database has no manifest. Use `setup(true)` for a fresh DB or `createMigrationBaseline()` for an existing matching DB.

### `physical-path-move`

A fact record/property/relation moved physical storage location. Phase 1 will not guess a copy/rename.

### `version or migrationKey`

A function-based computation needs explicit semantic versioning.

### `async-computation`

The computation returns ordinary async tasks but lacks `migrationAsync`.

### `destructive-computed-output`

Migration would delete computed output or host records. Inspect dry-run and pass audited destructive options only when intended.

---

## Safe Migration Checklist

- [ ] Run `controller.migrate({ dryRun: true })` first.
- [ ] Confirm `blockingChanges` is empty.
- [ ] Confirm `changedComputations` contains only intended computations.
- [ ] Confirm `rebuildPlan` includes expected downstream computations.
- [ ] Confirm `deletionScope` is empty unless destructive cleanup is intentional.
- [ ] Confirm function-based computations have `migrationKey` or `version`.
- [ ] Confirm event-based computations have `migrationCompute` when they must migrate.
- [ ] Confirm async computations have `migrationAsync` if they return `ComputationResult.async()`.
- [ ] Run integration tests for the production driver, especially PostgreSQL/MySQL.
- [ ] After migration, run dry-run again and expect an empty plan.

