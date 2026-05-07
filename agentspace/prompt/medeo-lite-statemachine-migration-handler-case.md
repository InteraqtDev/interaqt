# StateMachine Migration Handler Approval Case

## Purpose

This document isolates the `StateMachine` data migration approval failure so it can be handled independently from other data migration validation work.

The expected behavior is that an approved migration can add a new `StateMachine` property computation to an existing entity with existing records, use a migration-only rebuild handler, and backfill old records.

The actual behavior on `interaqt@1.5.3` is that the approved diff validator rejects the `event-rebuild-handler` decision:

```text
Migration event rebuild decision does not match a required review item: property:MigrationProbe.lifecycle
```

## Environment

Repository:

```text
/Users/camus/Work/medeo/medeo-lite
```

Branch:

```text
experiment/data-migration-validation
```

Package version:

```text
interaqt@1.5.3
```

Database:

```text
CONFIG_MODE=local
NODE_ENV=development
PostgreSQL: postgresql://pgadmin:pgadmin@localhost:5433/litdb
```

Validation records present before the migration:

```text
MigrationProbe
  id:   11111111-1111-4111-8111-111111111101
  name: Alpha

MigrationProbe
  id:   11111111-1111-4111-8111-111111111102
  name: LongerName
```

## Baseline Model

The baseline experimental module is `modules/data-migration-validation/definitions.ts`.

Before the failing migration, `MigrationProbe` exists and has these relevant properties:

```ts
export const MigrationProbe = Entity.create({
  name: 'MigrationProbe',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }),
    Property.create({ name: 'metadata', type: 'object', defaultValue: () => ({}) }),
    Property.create({ name: 'nameLength', type: 'number' }),
    Property.create({ name: 'nameCode', type: 'number' }),
    Property.create({ name: 'asyncNameCode', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'string' }),
  ],
})
```

The baseline model hash in the failing diff:

```text
fromModelHash = 706a87657beb243f6bff765cbc96079a0c9c808d6bbce6ab8f05a8a756200428
```

## Model Change Under Test

The test adds a new `lifecycle` property and a `StateMachine` computation:

```ts
import {
  StateMachine,
  StateNode,
} from 'interaqt'

export const MigrationProbe = Entity.create({
  name: 'MigrationProbe',
  properties: [
    // ... existing properties ...
    Property.create({ name: 'lifecycle', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' }),
  ],
})

const migrationProbeLifecycleState = StateNode.create({
  name: 'current_lifecycle',
  computeValue() {
    return 'draft'
  },
})

MigrationProbe.properties.find((property) => property.name === 'lifecycle')!.computation = StateMachine.create({
  states: [migrationProbeLifecycleState],
  initialState: migrationProbeLifecycleState,
  transfers: [],
})
```

The target model hash in the failing diff:

```text
toModelHash = 3cf61a4c46306baef166c889b10ca9e28bd0050b111e3e518a655d74374e7b0e
```

Expected data after a successful migration:

```text
MigrationProbe.lifecycle = draft
```

for both existing rows.

## Migration Handler

`migrations/interaqt/handlers.ts` contains this migration-only handler:

```ts
import type { MigrationHandlers } from 'interaqt'

export const migrationHandlers: MigrationHandlers = {
  eventRebuild: {
    unchangedComputationNoop: () => undefined,
    migrationProbeLifecycleDraft: () => 'draft',
  },
  asyncCompletion: {
    migrationProbeAsyncNameCode: ({ args }) => {
      if (args && typeof args === 'object' && 'value' in args) {
        return Number((args as { value: unknown }).value)
      }
      return 0
    },
  },
}
```

The intended handler for this case is:

```text
migrationProbeLifecycleDraft
```

## Commands Used

Generate diff:

```bash
npm run dev:diff:main
```

Patch the generated diff decisions:

```js
if (item.kind === 'computation') {
  decisions.push({
    kind: 'computation',
    id: item.id,
    dataContext: item.dataContext,
    decision: String(item.dataContext).includes('MigrationProbe.lifecycle')
      ? 'changed'
      : (item.recommendedDecision || 'unchanged'),
    reason: item.reason,
  })
}

if (item.kind === 'event-rebuild-handler') {
  decisions.push({
    kind: 'event-rebuild-handler',
    dataContext: item.dataContext,
    handlerRef: String(item.dataContext).includes('MigrationProbe.lifecycle')
      ? 'migrationProbeLifecycleDraft'
      : 'unchangedComputationNoop',
    reason: item.reason,
  })
}

if (!decisions.some(
  (decision) => decision.kind === 'event-rebuild-handler'
    && decision.dataContext === 'property:MigrationProbe.lifecycle',
)) {
  decisions.push({
    kind: 'event-rebuild-handler',
    dataContext: 'property:MigrationProbe.lifecycle',
    handlerRef: 'migrationProbeLifecycleDraft',
    reason: 'Verify StateMachine rebuild handler on latest interaqt',
  })
}
```

Approve diff:

```bash
npm run dev:approve-diff:main -- migrations/diff/2026-05-07T09-25-13-086Z-main.json
```

Run migration:

```bash
npm run dev:migrate:main -- migrations/current-main.json
```

## Generated Diff

Diff file:

```text
migrations/diff/2026-05-07T09-25-13-086Z-main.json
```

Diff header:

```json
{
  "kind": "interaqt-migration-diff",
  "version": 2,
  "status": "generated",
  "fromModelHash": "706a87657beb243f6bff765cbc96079a0c9c808d6bbce6ab8f05a8a756200428",
  "toModelHash": "3cf61a4c46306baef166c889b10ca9e28bd0050b111e3e518a655d74374e7b0e",
  "generatorVersion": "phase-1.5",
  "summary": {
    "changeCount": 87,
    "requiredDecisionCount": 82,
    "blockingChangeCount": 0
  }
}
```

Relevant property change:

```json
{
  "kind": "property",
  "id": "property:MigrationProbe.lifecycle",
  "changeType": "added",
  "dataContext": "property:MigrationProbe.lifecycle",
  "reason": "property was added"
}
```

Relevant required decision generated by the diff:

```json
{
  "kind": "computation",
  "id": "computation:property:MigrationProbe.lifecycle:Cr",
  "dataContext": "property:MigrationProbe.lifecycle",
  "recommendedDecision": "changed",
  "reason": "new computation requires approved rebuild"
}
```

Important detail:

The generated diff has a required `computation` decision for `property:MigrationProbe.lifecycle`, but it does not generate a required `event-rebuild-handler` decision for the same data context.

## Approved Decisions

Approved diff file:

```text
migrations/approved/2026-05-07T09-25-13-086Z-main.json
```

Relevant approved decisions:

```json
[
  {
    "kind": "computation",
    "id": "computation:property:MigrationProbe.lifecycle:Cr",
    "dataContext": "property:MigrationProbe.lifecycle",
    "decision": "changed",
    "reason": "new computation requires approved rebuild"
  },
  {
    "kind": "event-rebuild-handler",
    "dataContext": "property:MigrationProbe.lifecycle",
    "handlerRef": "migrationProbeLifecycleDraft",
    "reason": "Verify StateMachine rebuild handler on latest interaqt"
  }
]
```

## Actual Failure

Approval command succeeds and writes the approved diff:

```text
[approve-diff:main] Approved diff: /Users/camus/Work/medeo/medeo-lite/migrations/diff/2026-05-07T09-25-13-086Z-main.json
[approve-diff:main] Wrote approved copy: migrations/approved/2026-05-07T09-25-13-086Z-main.json
[approve-diff:main] Updated current pointer: migrations/current-main.json
```

Migration fails during interaqt validation:

```text
[migrate:main] Failed: M: Migration event rebuild decision does not match a required review item: property:MigrationProbe.lifecycle
    at validateApprovedDiff (/Users/camus/Work/medeo/medeo-lite/node_modules/interaqt/src/runtime/migration.ts:1071:23)
    at xs.migrate (/Users/camus/Work/medeo/medeo-lite/node_modules/interaqt/src/runtime/Controller.ts:342:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async main (/Users/camus/Work/medeo/medeo-lite/scripts/migrate-main.ts:57:22)
```

## Why This Looks Like A Framework Bug

The migration system produces a required `computation` decision for a new `StateMachine` computation. The runtime then needs an `event-rebuild-handler` decision to rebuild the existing records, but the validator only accepts handler decisions that match required review items.

For this case:

- Required item exists:
  - `kind=computation`
  - `dataContext=property:MigrationProbe.lifecycle`
- Handler decision is supplied:
  - `kind=event-rebuild-handler`
  - `dataContext=property:MigrationProbe.lifecycle`
  - `handlerRef=migrationProbeLifecycleDraft`
- Validation rejects it because there is no required item with key:
  - `event-rebuild-handler:property:MigrationProbe.lifecycle:`

So the framework simultaneously needs a handler and rejects the handler approval path.

## Expected Fix Direction

One of these should be true:

1. Diff generation should add a matching required decision:

```json
{
  "kind": "event-rebuild-handler",
  "dataContext": "property:MigrationProbe.lifecycle",
  "reason": "event-based/stateful computation needs an external migration rebuild handler"
}
```

2. Or approved diff validation should allow an `event-rebuild-handler` decision when there is a corresponding `computation` decision for the same data context and the migration plan requires a handler.

## Current Status

Status on `interaqt@1.5.3`:

```text
Still failing.
```

The same failure also occurred on `interaqt@1.5.2`.
