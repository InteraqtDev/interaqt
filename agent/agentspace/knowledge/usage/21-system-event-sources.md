# System Event Sources (Anonymous / No-Subject Entries)

The only entry point for data changes is an EventSource dispatched through `Controller.dispatch`. `Interaction` is the built-in, user-facing EventSource; custom EventSources (this guide) cover system and anonymous entries. Data is still never written imperatively — every change flows from a dispatched event through computations.

`Interaction` is not always the right shape. Its contract assumes an acting subject: `InteractionEventArgs` requires a `user`, and the built-in admit runs condition checks and payload validation on top. Many real entries have **no authenticated subject at all**:

- **User registration** — the signup request arrives before any user exists.
- **Verification-code issuance** — an SMS/email code is requested by a phone number or address, not by a session.
- **Partner provisioning** — an external partner portal calls back to open a partner account; the caller is another system.
- **Scheduled jobs and inbound webhooks** — a timer or a third-party service triggers work; there is no local user to attribute it to.

For these entries, do not fall back to hand-written storage primitives. Build the entry from core `EventSource.create`: you declare the event entity, you declare the admission check, and the dispatch pipeline (transaction, event record, computations, persistence) is exactly the same as for Interactions.

## The Recipe

Four pieces:

1. **A custom event entity** — a plain `Entity` you define. Each accepted dispatch persists one row on it. Unlike `_Interaction_` (the built-in event entity of Interactions), the shape of this entity is entirely yours.
2. **An `EventSource`** created with core `EventSource.create` — `admit` (your validation) and `mapEventData` (args → event record) are yours; `resolve` optionally returns data to the caller.
3. **Registration** on the `Controller` through `eventSources` (EventSources and Interactions register the same way).
4. **`controller.dispatch(source, args)`** — the same single entry point Interactions use.

```typescript
import {
  Controller, Entity, EventSource, KlassByName, MatchExp, MonoSystem, Property, Transform,
} from 'interaqt'
import { PGLiteDB } from 'interaqt/drivers'
```

### Step 1 — Declare the event entity

The event entity is a caller-defined plain Entity. Its properties are whatever you want to record about the request:

```typescript
const ProvisionRequested = Entity.create({
  name: '_ProvisionRequested_',
  properties: [
    Property.create({ name: 'code', type: 'string' }),
    Property.create({ name: 'displayName', type: 'string' }),
    Property.create({ name: 'requestedBy', type: 'string' }),
  ],
})
```

Every accepted dispatch persists one row here. This gives you an append-only request log for free — computations listen to it, and you can query it later.

### Step 2 — Declare the EventSource

```typescript
const provisionPartner = EventSource.create<{
  code: string
  displayName: string
  requestedBy: string
}>({
  name: 'provisionPartner',
  entity: ProvisionRequested,
  admit: async function(args) {
    // All validation lives here. Throw to reject: the dispatch transaction
    // rolls back and nothing is persisted.
    if (typeof args.code !== 'string' || args.code.length === 0) {
      throw new Error('provisionPartner requires a non-empty code')
    }
  },
  mapEventData: (args) => ({
    code: args.code,
    displayName: args.displayName,
    requestedBy: args.requestedBy,
  }),
})
```

- **`admit`** is the entire validation surface of a custom EventSource. There is no built-in condition or payload machinery — if a check is needed, write it here. A thrown error rejects the dispatch and rolls the transaction back; an `EventSource` created without `admit` gets a no-op admit (accept everything).
- **`mapEventData`** maps dispatch args to the event record persisted on `entity`.
- **`resolve`** (optional) runs inside the dispatch transaction and returns data to the caller as `result.data` — useful for read-shaped sources or for returning the row the dispatch produced.
- The full CreateArgs field list is `name`, `entity`, `admit?`, `open?`, `mapEventData?`, `resolve?`, `afterDispatch?`, `postCommit?`, `idempotency?`, `idempotencyInteractionKey?` — the authoritative definition is the `EventSourceCreateArgs` interface in `src/core/EventSource.ts`. `idempotencyInteractionKey` is set by `Interaction.create` and Activity wrappers; anonymous EventSources leave it unset. The legacy `guard` key is **not** accepted: `EventSource.create({ guard })` fails at declaration time with an error telling you to move the callback to `admit`.

### Step 3 — Derive the target entity with Transform

Computations react to your event entity exactly as they react to `_Interaction_`. Declare the derived entity with a Transform listening to the event entity's create events:

```typescript
const Partner = Entity.create({
  name: 'RecipePartner',
  identity: { name: 'byCode', properties: ['code'] },
  properties: [
    Property.create({ name: 'code', type: 'string' }),
    Property.create({ name: 'displayName', type: 'string' }),
    Property.create({ name: 'requestedBy', type: 'string' }),
  ],
  computation: Transform.create({
    eventDeps: {
      Provision: { recordName: '_ProvisionRequested_', type: 'create' },
    },
    callback: function(mutationEvent: any) {
      if (mutationEvent.recordName !== '_ProvisionRequested_') return null
      return {
        code: mutationEvent.record.code,
        displayName: mutationEvent.record.displayName,
        requestedBy: mutationEvent.record.requestedBy,
      }
    },
  }),
})
```

`Entity.identity` on the target makes provisioning **idempotent by natural key**: `Partner` is keyed by `code`, so a second provisioning request for the same code converges onto the stored row instead of creating a duplicate — no error, no create event, first write retained (set-semantic logical create; see `02-define-entities-properties.md`). This is the natural pairing for at-least-once entry points such as partner portals and webhooks.

### Step 4 — Register and dispatch

```typescript
const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName
const controller = new Controller({
  system,
  entities: [Partner],
  relations: [],
  eventSources: [provisionPartner],   // Interactions register here too
})
await controller.setup(true)

const result = await controller.dispatch(provisionPartner, {
  code: 'acme',
  displayName: 'Acme Inc',
  requestedBy: 'alpha-channel',
})
```

## Insert vs observe: Telling an Insert from an Observe

When the derived entity declares `Entity.identity`, a dispatch either **inserted** the row or **observed** an existing one, and both succeed without error. Distinguish them with the two-step method of `15-entity-crud-patterns.md`:

```typescript
// Step 1: did this dispatch produce a create event for the identity entity?
const inserted = result.effects?.some(
  (e: any) => e.recordName === Partner.name && e.type === 'create',
) ?? false

// Step 2: after commit, query by the natural key to see whose write the row carries.
const row = await system.storage.findOne(
  Partner.name,
  MatchExp.atom({ key: 'code', value: ['=', 'acme'] }),
  undefined,
  ['*'],
)
// inserted === false && row exists           → observed a prior request
// row.requestedBy !== myRequestedBy          → the stored row is not my write
```

No extra response channel is needed — `DispatchResponse.effects` plus the post-commit key query is the official discrimination. The full outcome table (registered / already taken / consumed / …) is in `15-entity-crud-patterns.md`.

## Division of Labor: Interaction vs Custom EventSource

| | `Interaction` (built-in) | Custom `EventSource` (this recipe) |
|---|---|---|
| Event entity | `_Interaction_` (built-in shape: `interactionName`, `payload`, `user`, `query`, …) | Any entity you declare |
| Args contract | `InteractionEventArgs`: `user` **required at the type level**, optional `query` / `payload` / `activityId` | Entirely your type parameter — a `user` key appears only if you declare one |
| Validation | Built-in admit runs declared `conditions` + `payload` schema validation | Your `admit` callback, nothing else |
| Typical entries | Authenticated user actions (create post, like, approve) | No-subject entries (signup, code issuance, partner provisioning, jobs, webhooks) |
| Registration | `eventSources` on the Controller | `eventSources` on the Controller |
| Dispatch | `controller.dispatch(Interaction, { user, payload })` | `controller.dispatch(source, args)` |
| Pipeline | Same unique pipeline: `admit → open? → map → create → resolve → afterDispatch` | Same |

Use `Interaction` whenever a user-facing action with a subject exists — its `conditions`/`payload` machinery and the `_Interaction_` event record are exactly right for that. Use a custom EventSource when the entry's args shape, validation, or event record do not fit that contract. Both are EventSources; both go through the same dispatch pipeline and the same computations.

## No Framework-Level User Gate

There is no framework-level user gate: `Controller.dispatch` does **not** validate users. The dispatch entry point performs exactly four checks, none of which concerns `user`:

1. the `eventSource` argument is present;
2. the dispatch is not nested inside another dispatch call stack (`NestedDispatchError`);
3. no non-business-transaction storage transaction is active (`DISPATCH_IN_NON_BT_TRANSACTION`);
4. the owning business transaction, if any, is not already aborted.

Two consequences you must know:

- **`user` on an Interaction is a TypeScript contract, not a runtime gate.** An `Interaction` without `conditions` dispatches successfully even when the args contain no `user` at all — the framework neither rejects the call nor fills in a subject. Guarding an entry against anonymous calls is **your** job and is done with a Condition:

  ```typescript
  conditions: Condition.create({
    name: 'requireSignedIn',
    content: async function(event) {
      if (event.user?.id) return true
      return { allowed: false, code: 'AUTH_REQUIRED' }
    },
  }),
  ```

  A Condition reading `event.user` rejects an anonymous dispatch with a typed `InteractionGuardError` (`code`, `conditionName`) and rolls the transaction back. That Condition — and nothing else — is what keeps anonymous calls out of a user-facing Interaction.

- **Authentication itself is out of scope.** interaqt assumes identity was established by external means (JWT, session, partner signature, …). Your entry layer decides who the caller is and puts the resolved identity into args; Conditions and `admit` enforce whatever the entry requires.

For Interactions this is stated in `05-interactions.md` ("About User Identity") and `06-attributive-permissions.md`; the runtime behavior is pinned by `tests/runtime/systemEventSourceRecipe.spec.ts`.

## Test Anchoring

Every code form in this guide is pinned by a runnable test:

| Code form | Pinned by |
|---|---|
| Custom event entity + `EventSource.create` + `mapEventData` + Transform derivation | `tests/runtime/eventSource.spec.ts` — "should dispatch a custom event source and trigger computation" |
| Custom `admit` rejects a request | `tests/runtime/eventSource.spec.ts` — "should support guard validation on custom event source" |
| `admit` rejection rolls the transaction back | `tests/runtime/eventSource.spec.ts` — "should roll back transaction on guard failure" |
| `resolve` returns data (`result.data`) | `tests/runtime/eventSource.spec.ts` — "should support resolve function for data retrieval event sources" |
| Anonymous EventSource → Transform → `Entity.identity` set-semantic convergence + insert-vs-observe discrimination (the complete example above) | `tests/runtime/systemEventSourceRecipe.spec.ts` — test (a) |
| Interaction without conditions dispatches with no `user` in args | `tests/runtime/systemEventSourceRecipe.spec.ts` — test (b) |
| Condition reading `event.user` is the only gate against anonymous calls | `tests/runtime/systemEventSourceRecipe.spec.ts` — test (c) |
| Legacy `guard`-only CreateArgs rejected at declaration time | `tests/runtime/dispatchIdempotency.spec.ts` — "EventSource.create rejects legacy guard-only CreateArgs" |

## Related

- `02-define-entities-properties.md` — `Entity.identity` (set-semantic create vs `UniqueConstraint`), residual limitations
- `05-interactions.md` — Interactions, user identity note
- `06-attributive-permissions.md` — Conditions, typed rejection, admission locks
- `15-entity-crud-patterns.md` — occupancy recipe and the full insert-vs-observe outcome table
- `13-testing.md` — testing through dispatch
- `14-api-reference.md` — `dispatch`, `DispatchResponse`, idempotent dispatch
- `src/core/EventSource.ts` — the `EventSourceCreateArgs` interface (authoritative field list)
