<p align="center">
  <h1 align="center">interaqt</h1>
  <p align="center">
    <strong>A declarative reactive backend framework where you define <em>what data is</em>, not how to change it.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/interaqt"><img src="https://img.shields.io/npm/v/interaqt.svg" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/interaqt"><img src="https://img.shields.io/npm/dm/interaqt.svg" alt="npm downloads"></a>
    <a href="https://github.com/InteraqtDev/interaqt/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/interaqt.svg" alt="license"></a>
    <a href="https://github.com/InteraqtDev/interaqt"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript"></a>
    <a href="#"><img src="https://img.shields.io/badge/coverage-92.41%25-brightgreen.svg" alt="coverage"></a>
  </p>
</p>

---

## The Problem

Traditional backend development forces you to think in terms of **operations** — "when X happens, update Y, then Z, then W." This imperative approach scatters related logic across handlers, creates consistency bugs, and makes systems increasingly brittle as complexity grows.

```typescript
// The imperative way: fragile chains of manual updates
async function likePost(userId, postId) {
  await createLike(userId, postId);
  const count = await countLikes(postId);
  await updatePost(postId, { likeCount: count });   // easy to forget
  await notifyAuthor(postId);                        // easy to break
}
```

## The Solution

interaqt flips the model. Instead of describing *procedures*, you **declare what your data is** — and the framework keeps everything consistent, automatically.

```typescript
// The interaqt way: declare what data IS
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({
      name: 'likeCount',
      // "like count IS the number of like relationships"
      computation: Count.create({ record: LikeRelation })
    })
  ]
})
```

No update handlers. No sync bugs. When a like relationship is created, `likeCount` updates itself — because it's *defined* as the count of likes.

---

## Core Ideas

**1. Only Interactions create data** — User interactions are the single source of truth. Everything else is derived.

**2. Data is a function of events** — Properties, counts, states, and aggregates are declared as computations over events and relations, not manually maintained.

**3. Unidirectional flow** — `Interaction → Event → Computation → Data`. No reverse wiring. No tangled update cycles.

---

## Dispatch Transactions

`Controller.dispatch()` is the synchronous fact transaction boundary in interaqt. The framework runs guard checks, `mapEventData`, event record creation, `resolve`, synchronous computations, and `afterDispatch` inside one retryable storage transaction attempt.

If any transaction step fails, the event record and all synchronous derived writes from that attempt are rolled back. `postCommit` and record mutation side effects run only after a successful commit; their failures are reported in `sideEffects` and do not roll back committed facts.

Use these hooks with the transaction boundary in mind:

| Hook | Transaction boundary |
|---|---|
| `guard` / `mapEventData` / `resolve` | Run inside the retryable transaction attempt and may be replayed. |
| `afterDispatch` | Runs before commit inside the transaction. Use it only for response context or local reversible storage work. Do not perform irreversible external IO here. |
| `postCommit` | Runs after commit. Use it for external IO, notifications, outbox enqueueing, or non-critical response context. |
| `RecordMutationSideEffect` | Runs after commit for committed mutation events. Failure is reported in `sideEffects`. |

Nested `controller.dispatch()` calls are rejected inside a dispatch transaction with `NestedDispatchError`. Dispatching again from `postCommit` or a record mutation side effect is allowed because it starts a new transaction boundary.

Database drivers declare their transaction support through `getTransactionCapability()`:

| Driver | Transaction support |
|---|---|
| PostgreSQL | Strong transaction target: transaction-bound pool client, `READ COMMITTED` and `SERIALIZABLE`, PostgreSQL retryable SQLSTATE handling. |
| PGLite | Fallback support for local tests and framework retry-path metadata. `SERIALIZABLE` is not a production PostgreSQL isolation guarantee. |
| SQLite | Local fallback atomicity and framework retry-path metadata. It does not provide PostgreSQL-level concurrent dispatch isolation. |
| MySQL | Marked unsupported for strong dispatch transactions until it has a transaction-bound connection implementation. |

Useful exported helpers include `TransactionCapabilityError`, `TransactionRetryExhaustedError`, `NestedDispatchError`, `isTransactionCapabilityError()`, `isTransactionRetryExhaustedError()`, `isRetryableTransactionError()`, and `hasErrorCode()`.

---

## Quick Example: Social Post System

```typescript
import {
  Entity, Property, Relation, Interaction, Action,
  Payload, PayloadItem, Controller, MonoSystem,
  Count, Transform, InteractionEventEntity
} from 'interaqt'
import { PGLiteDB } from 'interaqt/drivers'

// --- Define your data model ---

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'postCount',
      computation: Count.create({ record: AuthorRelation })
    })
  ]
})

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({
      name: 'likeCount',
      computation: Count.create({ record: LikeRelation })
    })
  ]
})

// --- Define relationships ---

const AuthorRelation = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: 'n:1'
})

const LikeRelation = Relation.create({
  source: User,
  sourceProperty: 'likedPosts',
  target: Post,
  targetProperty: 'likedBy',
  type: 'n:n'
})

// --- Define interactions ---

const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string', required: true }),
      PayloadItem.create({ name: 'content', type: 'string', required: true })
    ]
  })
})

const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
})

// --- Boot the system ---

const system = new MonoSystem(new PGLiteDB())
const controller = new Controller({
  system,
  entities: [User, Post],
  relations: [AuthorRelation, LikeRelation],
  eventSources: [CreatePost, LikePost]
})

await controller.setup(true)

// --- Use it ---

await controller.dispatch(CreatePost, {
  user: { id: 'user-1' },
  payload: { title: 'Hello World', content: 'My first post' }
})

await controller.dispatch(LikePost, {
  user: { id: 'user-2' },
  payload: { postId: 'post-1' }
})

// post.likeCount is now 1 — automatically.
// user.postCount is now 1 — automatically.
```

---

## Reactive Computations

The real power of interaqt lives in its computation primitives. Attach them to any Property, Entity, or Relation — they react to data changes automatically.

| Computation | What it declares |
|---|---|
| **Count** | "This value IS the number of related records" |
| **Summation** | "This value IS the sum over a field in related records" |
| **WeightedSummation** | "This value IS a weighted sum (e.g., inventory = stock − sold)" |
| **Average** | "This value IS the average of a field across relations" |
| **Every** | "This boolean IS true when ALL related records satisfy a condition" |
| **Any** | "This boolean IS true when ANY related record satisfies a condition" |
| **Transform** | "This entity/relation IS created when a matching event occurs" |
| **StateMachine** | "This value IS the current state, transitioning on specific events" |

### Example: E-commerce Inventory

```typescript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'initialStock', type: 'number' }),
    Property.create({
      name: 'currentStock',
      // "current stock IS initial stock minus total quantities ordered"
      computation: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (item) => ({ weight: -1, value: item.quantity })
      })
    }),
    Property.create({
      name: 'totalSales',
      computation: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (item) => ({ weight: 1, value: item.quantity })
      })
    })
  ]
})
```

---

## Architecture

```
src/
├── core/        Data model: Entity, Relation, Property, Computation definitions
├── runtime/     Execution: Controller, System, Scheduler, computation handles
├── storage/     Persistence: ERStorage, SQL builder, query executors
├── builtins/    Built-in EventSource types: Interaction, Activity, User
└── drivers/     Database adapters
```

**Dependency direction:** `builtins → runtime → storage → core`. Clean layers, no circular imports.

---

## Database Support

interaqt works with the database you already use:

| Driver | Package | Use Case |
|---|---|---|
| **PostgreSQL** | `pg` | Production |
| **SQLite** | `better-sqlite3` | Embedded / edge |
| **MySQL** | `mysql2` | Production |
| **PGLite** | `@electric-sql/pglite` | Testing (in-memory) |

```typescript
import { MonoSystem } from 'interaqt'

// Pick your driver
import { PostgreSQLDB } from 'interaqt/drivers'
const system = new MonoSystem(new PostgreSQLDB({ /* connection config */ }))
```

---

## Schema Constraints and Transaction Boundaries

interaqt supports schema-level uniqueness for framework-managed records. Declare uniqueness at the Entity or Relation level with `UniqueConstraint`; the storage setup installs database unique indexes and reports duplicate writes as structured framework errors.

```typescript
import { Entity, Property, UniqueConstraint } from 'interaqt'

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'email', type: 'string' })
  ],
  constraints: [
    UniqueConstraint.create({
      name: 'User_email_unique',
      properties: ['email'],
      violationCode: 'USER_EMAIL_DUPLICATE'
    })
  ]
})
```

`controller.dispatch()` runs event persistence and synchronous computation writes in one transaction. Unique conflicts roll back the whole dispatch attempt and can be handled with `ConstraintViolationError` or `findConstraintViolationError(error)`.

For diagnostics and migration planning, inspect the read-only schema metadata:

```typescript
system.storage.schema.constraints
system.storage.schema.records
system.storage.schema.tables
```

---

## Installation

```bash
npm install interaqt
```

Then install the database driver you need:

```bash
# PostgreSQL
npm install pg

# SQLite
npm install better-sqlite3

# MySQL
npm install mysql2

# In-memory (for testing)
npm install @electric-sql/pglite
```

---

## Key Concepts at a Glance

| Concept | Role |
|---|---|
| **Entity** | A data type (User, Post, Order, ...) |
| **Property** | A field on an entity — can be a static value or a reactive computation |
| **Relation** | A typed connection between entities (1:1, 1:n, n:n) |
| **Interaction** | An event triggered by a user — the *only* way new data enters the system |
| **Action** | An identifier for an interaction type (not a handler — no logic!) |
| **Computation** | A reactive declaration: Count, Transform, StateMachine, etc. |
| **Activity** | An ordered sequence of related Interactions for complex workflows |
| **Controller** | The single dispatch entry point: `controller.dispatch(interaction, args)` |

---

## Advanced Features

- **StateMachine** — Model entity lifecycles with explicit state transitions triggered by events
- **Filtered Entities** — Virtual views over entities, like reactive database views
- **Activities** — Compose multi-step business workflows from ordered Interactions
- **Condition Guards** — Declarative access control with full event context
- **Dictionary** — Global reactive key-value state
- **Schema Constraints** — Persistent unique constraints with structured duplicate errors
- **Hard Deletion** — Built-in support for both soft and hard delete patterns
- **Post-Commit Side Effects** — Use `postCommit` or record mutation side effects for external integrations after commit

---

## Development

```bash
git clone https://github.com/InteraqtDev/interaqt.git
cd interaqt

npm install
npm test                 # Run all tests
npm run test:runtime     # Runtime tests only
npm run test:storage     # Storage tests only
npm run test:core        # Core tests only
npm run build            # Build to dist/
```

---

## Philosophy

> **Stop thinking "how to do." Start thinking "what it is."**

In interaqt, you never write update logic. You declare:
- *what* each piece of data is (a count, a sum, a state, a transformation)
- *when* entities and relations come into existence (through Interactions)

The framework handles propagation, consistency, and persistence. Your business logic becomes a clear, auditable set of declarations rather than a tangled web of imperative handlers.

---

## License

[MIT](./LICENSE)
