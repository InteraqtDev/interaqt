# Permission Control (Attributive — Removed)

The `Attributive` / `Attributives` concept has been **removed** from the interaqt framework, along with all of its attachment points:

- `Interaction.userAttributives` / `Interaction.userRef`
- `PayloadItem.attributives` / `PayloadItem.itemRef`
- `createUserRoleAttributive` / `boolExpToAttributives`
- activity `refs` and `isRef` user binding

Declaring any of these now fails fast at declaration time with an error pointing here.

## Use Conditions instead

`Condition` is the single guard concept. A condition callback receives the **full event args** (`user`, `payload`, `query`, `activityId`, optional `context`) with the Controller as `this`, so every form previously expressed with attributives is expressible as a condition:

```typescript
// Role check (was: createUserRoleAttributive)
const AdminOnly = Condition.create({
  name: 'AdminOnly',
  content: async function(event) {
    return !!(event.user.roles && event.user.roles.includes('admin'))
  }
})

// Payload-content check (was: PayloadItem.attributives)
const PublishedPostOnly = Condition.create({
  name: 'PublishedPostOnly',
  content: async function(this: Controller, event) {
    const post = await this.system.storage.findOne('Post',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.post.id] }),
      undefined, ['status'])
    return post?.status === 'published'
  }
})

// Activity user binding (was: userRef/itemRef + isRef attributive):
// query this activity's own interaction events to locate the bound user.
const MustBeRequestReceiver = Condition.create({
  name: 'MustBeRequestReceiver',
  content: async function(this: Controller, event) {
    if (!event.activityId) return false
    const sendEvent = await this.system.storage.findOne(InteractionEventEntity.name,
      MatchExp.atom({ key: 'interactionName', value: ['=', 'sendRequest'] })
        .and({ key: 'activity.id', value: ['=', event.activityId] }),
      undefined, ['*'])
    return !!sendEvent && sendEvent.payload?.to?.id === event.user.id
  }
})
```

Combine conditions with `Conditions.create({ content: BoolExp.atom(a).and(b).or(c) })`.

## Contract

- Conditions run inside the dispatch transaction, before the event record is persisted.
- **Result algebra (fail-closed)**:
  - `true` — allow
  - `false` — reject with default code `CONDITION_REJECTED` (boolean polarity; inverted by BoolExp `not`)
  - `{ allowed: true, context?: Record<string, unknown> }` — allow; optional `context` is shallow-merged into a read-only `event.context.admission` bag for the same dispatch (computations / StateMachine see it via the interaction event)
  - `{ allowed: false, code: string, message?: string, details?: unknown }` — **structured rejection** (not flipped by `not`); stable `code` reaches the caller on `InteractionGuardError` / soft `result.error`
  - any other value (including `undefined`, `{ ok: true }`, missing `allowed`) — reject with `CONDITION_INVALID_RESULT`
  - thrown errors — reject with `error.code` when it is a non-empty string, otherwise `CONDITION_THROWN`
- Discriminator field is **only** `allowed`. Informal fields such as `ok` / `success` / `pass` are never treated as allow/deny synonyms.
- Do **not** mutate `event.payload` to pass parsed data downstream; use `{ allowed: true, context }` → `context.admission`.
- For row-level data access control on queries, use `dataPolicy` (match/modifier/attributeQuery) on GetAction interactions.
- Row filtering and column projection are independent: `dataPolicy.match` without `dataPolicy.attributeQuery`
  leaves the projection caller-controlled (including `['*']` — every column of matched rows). Whenever
  `dataPolicy.match` guards an entity with sensitive columns, declare `dataPolicy.attributeQuery` as well.

## Declarative admission locks (concurrent check-then-act)

When a Condition must decide from rows that a later computation in the **same** dispatch will update (for example balance check then debit), declare those rows on `Condition.locks`. The framework acquires them with `storage.atomic.lockRecord` / `lockRows` **before** evaluating any Condition content, holds them for the rest of the dispatch transaction attempt, and passes a read-only `AdmissionSnapshot` as the **second** argument to `content`.

```typescript
import { Condition, Controller /* ... */ } from 'interaqt'

const HasBalance = Condition.create({
  name: 'HasBalance',
  locks: [
    {
      // mode defaults to 'record'
      recordName: 'Account',
      id: (event) => event.payload.accountId,
      attributeQuery: ['id', 'balance'],
    },
    // match form (locks every matching row):
    // {
    //   mode: 'match',
    //   recordName: 'Account',
    //   match: (event) => MatchExp.atom({ key: 'ownerId', value: ['=', event.user.id] }),
    //   attributeQuery: ['id', 'balance'],
    // }
  ],
  content: async function (this: Controller, event, admission) {
    const account = admission.get('Account', event.payload.accountId)
    if (!account) {
      return {
        allowed: false,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account does not exist',
      }
    }
    if (Number(account.balance) < Number(event.payload.amount)) {
      return {
        allowed: false,
        code: 'INSUFFICIENT_BALANCE',
        details: { balance: account.balance, amount: event.payload.amount },
      }
    }
    // Optional: pass locked ids / amounts to computations without mutating payload
    return {
      allowed: true,
      context: { accountId: account.id, debitedAmount: event.payload.amount },
    }
  },
})
```

Rules:

- Omitting `locks` keeps historical behavior (no extra locks).
- For BoolExp combinations (`and` / `or` / `not`), the framework **unions** locks from every atomic Condition (including atoms under `not`) and acquires them in a stable order (`recordName`, then id) before evaluation.
- Prefer `admission.get` / `admission.getAll` over a second unlocked `findOne` in official admission paths.
- Do **not** hand-write dialect `SELECT … FOR UPDATE` or application advisory-lock helpers for this pattern; `locks` is the official surface.
- Isolation for this path is the dispatch transaction’s default (`READ COMMITTED` unless a business transaction opened with another level). Do **not** throw `RequireSerializableRetry` from Condition content as a SERIALIZABLE switch — that path is absorbed as an ordinary condition failure (`CONDITION_THROWN` / string code) and does **not** upgrade isolation.

Real PostgreSQL concurrent debit contract (two connections, balance `B`, two dispatches each requesting `B`, overdraft floor 0): at most one success and final balance ≥ 0. See `tests/runtime/postgresqlConditionAdmission.spec.ts`.

## Business transactions (same-request storage write + dispatch)

`NestedDispatchError` still forbids calling `controller.dispatch` **inside** another dispatch call stack. When one business request must (1) write storage rows and (2) run one or more interactions that must **see those uncommitted rows**, and roll them back together on failure, use the official API:

```typescript
await controller.runInBusinessTransaction(
  {
    name: 'create-and-activate',
    // isolation?: 'READ COMMITTED' | 'SERIALIZABLE'  // default READ COMMITTED
    // onDispatchError?: 'abort' | 'continue'         // default 'abort'
  },
  async () => {
    const draft = await controller.system.storage.create('Draft', { title: '…' })
    // Default abort: Condition rejection throws; callback stops; whole BT rolls back.
    const result = await controller.dispatch(ActivateDraft, {
      user,
      payload: { draftId: draft.id },
    })
    return result
  }
)
```

### Contract table (summary)

| Topic | Rule |
|-------|------|
| Ownership | BT **must** open the outermost storage transaction. Starting BT inside `storage.runInTransaction`, or nesting BT, is rejected (`BusinessTransactionBoundaryError` with `NESTED_STORAGE_TRANSACTION` / `REENTRANT`). |
| Visibility | Storage writes inside the callback are visible to Condition / computation of sequential `dispatch` calls on the same connection. |
| Attempt isolation | Each `dispatch` attempt uses a BT-owned **SAVEPOINT**; failure rolls back that attempt’s writes only (then abort/continue decides the outer fate). |
| Default failure (`abort`) | `dispatch` **throws** (no soft `result.error` return). `runInBusinessTransaction` rejects; outer **ROLLBACK**; deferred side effects are discarded. |
| Opt-in `continue` | `dispatch` returns soft `DispatchResponse` with `error`; caller decides whether to continue. Atomicity is then the caller’s responsibility. |
| Side effects | `postCommit` and `RecordMutationSideEffect` run **only after** the BT-owned outer **COMMIT** succeeds — never after a nested “fake commit”. |
| Nested dispatch | Still forbidden inside a dispatch stack. **Sequential** `dispatch` calls inside one BT callback are the supported multi-interaction composition. |
| Drivers | Requires transactions **and** SAVEPOINT (PostgreSQL / PGLite / SQLite). MySQL (`transactions: false`) is rejected. |
| Bare `runInTransaction` + `dispatch` | Not a complete official path (no per-attempt savepoint; soft errors / side-effect timing differ). Prefer BT. |

### Isolation and `RequireSerializableRetry` inside a business transaction

| Scenario | Behavior |
|----------|----------|
| BT default `READ COMMITTED` | Outer `BEGIN` at RC. If a production path throws `RequireSerializableRetry`, the dispatch **fails immediately** (no isolation upgrade loop). Open the BT with `isolation: 'SERIALIZABLE'` when you need those paths. |
| BT `isolation: 'SERIALIZABLE'` | Outer begins SERIALIZABLE and exposes it via `getTransactionIsolation()` so framework gates (Transform update/delete, full recompute, entity replace, …) proceed without throwing S. |
| Top-level dispatch (no BT) | Unchanged: `runWithTransactionRetry` may promote to SERIALIZABLE and retry. |
| Condition content throwing `RequireSerializableRetry` | Still **not** an isolation switch (see admission locks section). |

### Typed rejection at the call site

Outside a business transaction, failed conditions surface as soft `result.error` with stable `code` / `details` / `conditionName` (duck-typed with historical `ConditionError` fields such as `type: 'condition check failed'`). Inside BT default `abort`, the same fields are on the thrown `InteractionGuardError` (or a wrapper whose `cause` preserves them):

```typescript
const result = await controller.dispatch(DebitAccount, { user, payload })
if (result.error) {
  // soft path (no BT, default)
  console.log(result.error.code) // e.g. 'INSUFFICIENT_BALANCE'
}

try {
  await controller.runInBusinessTransaction({ name: 'debit' }, async () => {
    await controller.dispatch(DebitAccount, { user, payload })
  })
} catch (e) {
  if (e instanceof InteractionGuardError) {
    console.log(e.code, e.details, e.conditionName)
  }
}
```

## Related

- Interactions overview: `05-interactions.md`
- API shapes: `14-api-reference.md`, exports: `18-api-exports-reference.md`
- PostgreSQL concurrency notes: `20-postgresql-concurrency-migration.md`
- Generator guidance: `../generator/permission-implementation.md`
