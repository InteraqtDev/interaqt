# interaqt — Agent Instructions

Cross-tool instructions for AI coding agents working on this repository.

## Project overview

interaqt is a **declarative reactive backend framework**. Its core idea is to build applications by declaring what data *is*, not by operating on data directly.

### Core principle

> **Stop thinking "how to operate on data"; start thinking "what data essentially is."**

### Tech stack

- **Backend**: interaqt (reactive backend framework)
- **Frontend** (in example apps): Axii (reactive frontend framework)
- **Language**: TypeScript (strict mode)
- **Paradigm**: declarative + reactive programming
- **Databases**: SQLite, PostgreSQL, MySQL, PGLite

This repo is the **framework itself**, not an application. Every change has amplified downstream impact — prefer elegance, consistency, minimal surface area, and clear error messages.

## Quick orientation

### 1. Mindset shift (most important)

#### ❌ Imperative thinking

```typescript
// Wrong: thinking about "how to operate on data"
async function likePost(userId, postId) {
  await createLike(userId, postId);
  const count = await countLikes(postId);
  await updatePost(postId, { likeCount: count });
}
```

#### ✅ interaqt declarative thinking

```typescript
// Right: declare "what data is"
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({
      name: 'likeCount',
      // likeCount IS the number of like relationships
      computation: Count.create({ record: LikeRelation })
    })
  ]
});
```

### 2. Concept flow

```
User dispatches Interaction (e.g. LikePost)
    ↓
System creates/updates Relation (Like)
    ↓
Related Computation runs (e.g. Count)
    ↓
Property updates automatically (likeCount +1)
    ↓
Data persists to database
```

## Repository layout

```
interaqt/
├── src/
│   ├── core/       # Entity, Relation, Property, computations (pure definitions)
│   ├── runtime/    # Controller, System, Scheduler, computation handles
│   ├── storage/    # ERStorage, SQL builder, query executors
│   ├── builtins/   # Interaction, Activity, User
│   └── drivers/    # SQLite, PostgreSQL, PGLite, MySQL
├── tests/          # Vitest specs (runtime, storage, core)
├── agent/          # Example-app generation workflow and usage guides
├── agentspace/     # Framework knowledge base and agent prompts
└── .cursor/rules/  # Cursor-specific layered rules
```

Dependency direction: `builtins → runtime → storage → core`. Never import upward.

## Core concepts

### Entity

The basic unit of data, e.g. `User`, `Post`, `Comment`.

```typescript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});
```

### Relation

Connections between entities; relations are special entities.

```typescript
// The system auto-detects symmetric relations when
// source === target and sourceProperty === targetProperty
const Friendship = Relation.create({
  source: User,
  sourceProperty: 'friends',
  target: User,
  targetProperty: 'friends',
  type: 'n:n'
});
```

### Interaction

User-triggered events — the **only source** of data changes in the system.

```typescript
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'content', type: 'string' })
    ]
  })
});
```

### Computation

Values derived automatically from other data:

- **Count** — count records
- **WeightedSummation** — weighted sum
- **Every / Any** — boolean conditions
- **Transform** — custom derivation (creates new records only)
- **StateMachine** — state transitions in response to interactions

### Activity

An ordered composition of related Interactions for complex workflows.

### Other key types

| Concept | Role |
|---------|------|
| **EventSource** | Base for all event-driven triggers |
| **Controller.dispatch()** | Single entry point for triggering any EventSource |
| **Property** | Fields on entities, optionally backed by computations |

Flow: `Interaction → Event → Computation → Data`

## Naming and imports

The project name is always **interaqt** (all lowercase). Never InterAQT, interAQT, etc.

```typescript
import { Entity, Property, Relation, Controller, MonoSystem } from 'interaqt'
```

Path aliases: `@core`, `@runtime`, `@storage`, `@drivers` (see `tsconfig.json`).

Do **not** import from `@interaqt/runtime`, `InterAQT`, or `interAQT`.

### Naming conventions

- **Entity**: PascalCase, singular (`User`, `Post`)
- **Relation**: descriptive (`UserFollowUser`, `UserLikePost`)
- **Interaction**: verb + noun (`CreatePost`, `LikePost`)
- **Property**: camelCase (`userName`, `postCount`)

## Development conventions

### File organization (application projects)

```
project/
├── src/
│   ├── entities.ts
│   ├── relations.ts
│   ├── interactions.ts
│   ├── activities.ts
│   └── index.ts
├── tests/
└── frontend/          # Axii, if applicable
```

### Explicit control

Never add implicit behavior, auto-completion, or magic defaults. All behavior must be explicitly declared.

### Plain professional language

Everything written for humans — documentation, code comments, error messages, commit
messages, PR descriptions, review and analysis reports, and conversational replies —
must use precise, established technical terminology and remain understandable to a
competent engineer who did not take part in the work. This applies in whichever
language the text is written.

- Prefer standard terms of art (invalidation scope, staleness ordering, referential
  integrity, idempotent retry, convergence, ...) over invented shorthand.
- Never let insider slang, ad-hoc code names, or colloquialisms carry the meaning
  ("poison pill", "resurrected", "zombie row"). A vivid phrase may illustrate a
  mechanism that has already been named precisely; it must never replace the precise
  name.
- Define project-specific terms at first use, or link to where they are defined.
- Present findings as symptom → mechanism → fix, in complete sentences. Do not
  compress reasoning into fragments, bare arrow chains, or abbreviations that only
  the author can decode.

### Klass pattern

Core types use: interface → CreateArgs → `Entity.create(args)` → static registry (`instances`, `isKlass`, `displayName`) → `toData()` / `fromData()`.

### Testing

- Test through **Interactions** (`controller.dispatch`), not direct storage mutations
- Every Interaction and every computed property should have tests
- Always specify **attributeQuery** in `storage.find` / `findOne` (use `['*']` for all fields)
- Use **PGLiteDB** for tests when possible
- **Real-PostgreSQL suites are mandatory**: `tests/runtime/postgresql*.spec.ts` require a live PostgreSQL server and silently **skip** without `INTERAQT_POSTGRES_DATABASE` — a plain `npm test` run does NOT cover them. PGLite is not a substitute (different id allocation, connection model, and concurrency semantics; the r24 fatal `getAutoId` id-type split lived only on real PG). Run them before considering driver/storage/migration/concurrency changes verified — see "Build and test commands" for setup
- File naming: `*.spec.ts`
- Do not manually set entity IDs — let the framework generate them
- Always `await controller.setup(true)` before dispatching
- When adding a test **matrix**, consult the dimension registry in `tests/runtime/WritingComputationTests.md` — every dimension (including degenerate values and the mechanism axes) must be explicitly decided
- **Structural fuzzing**: `tests/storage/writePathStructuralFuzz.spec.ts` generates random schemas (all physical topologies emerge from declarations) × random nested write sequences, judged by the event-completeness oracle + structural invariants. When touching the storage write path, run it with an extended seed pool (`FUZZ_SEED_START=100 FUZZ_SEED_COUNT=100 FUZZ_OPS=40 npx vitest run tests/storage/writePathStructuralFuzz.spec.ts`); a failing seed prints its schema and full op log for deterministic reproduction (`FUZZ_SEED_START=<seed> FUZZ_SEED_COUNT=1 FUZZ_VERBOSE=1`). The extended mode (filtered/merged entities in the generation domain) uses `FUZZ_FILTERED_SEED_START/COUNT`; since r32 the merged generation domain includes x:1/combined endpoints by default (EXT-1 closed; only mergeLinks endpoints stay excluded). Historical finding families are tracked in `agentspace/output/quality-foundation-plan-r27.md` §1.4/§1.4b
- **Generative suites (r29, expanded r33)** — expand the relevant pool when touching the corresponding subsystem:
 - `tests/storage/driverDifferentialFuzz.spec.ts` — SQLite vs secondary same-seed per-op reconciliation (`FUZZ_DIFF_SEED_START/COUNT`, `FUZZ_DIFF_OPS`); secondaries: PGLite (always), real PostgreSQL / MySQL (env-gated, `FUZZ_DIFF_PG_*` / `FUZZ_DIFF_MYSQL_*`); run when touching drivers or the storage write path
 - `tests/runtime/computationGenerativeFuzz.spec.ts` — random aggregate declarations vs naive recompute (`FUZZ_COMP_SEED_START/COUNT`, `FUZZ_COMP_OPS`); run when touching computation handles or the scheduler
 - `tests/runtime/eventComputationGenerativeFuzz.spec.ts` — random StateMachine/event-Transform declarations × random write/dispatch streams vs an independent JS model (`FUZZ_EVENT_SEED_START/COUNT`, `FUZZ_EVENT_OPS`); run when touching event-driven computations, TransitionFinder, or the event pipeline
 - `tests/runtime/asyncComputationGenerativeFuzz.spec.ts` — mixed sync/resolved/async/skip interleavings vs a task-lifecycle model (`FUZZ_ASYNC_SEED_START/COUNT`, `FUZZ_ASYNC_OPS`); run when touching async tasks, freshness, or handleAsyncReturn
 - `tests/runtime/activityGenerativeFuzz.spec.ts` — random activity graphs (any/every/race, nested) × random dispatch sequences vs an independent workflow model (`FUZZ_ACT_SEED_START/COUNT`, `FUZZ_ACT_OPS`); run when touching the activity layer
 - `tests/runtime/migrationGenerativeFuzz.spec.ts` — random schema pairs + data → migrate vs fidelity/backfill oracles incl. kill-resume (`FUZZ_MIG_SEED_START/COUNT`, `FUZZ_MIG_OPS`); run when touching migration
 - `tests/runtime/migrationDestructiveFuzz.spec.ts` — destructive mutations (Transform shrink, `_isDeleted_`, empty-fact removal, computation changed/unchanged, blocked shapes) × kill-resume (`FUZZ_MIGD_SEED_START/COUNT`, `FUZZ_MIGD_OPS`); run when touching migration's destructive-scope machinery
 - `tests/runtime/declarationTabooFuzz.spec.ts` — declaration-time guard conformance under random surrounding schemas + legal twins (`FUZZ_TABOO_SEEDS`); extend `TABOO_CELLS` when adding a declaration-time guard
 - Shared generators live in `tests/storage/helpers/fuzzSchema.ts` / `fuzzOps.ts` — the rng call order is the decision-stream contract; changing it invalidates existing seed pools (re-verify the base pool 1–499 after any refactor)
 - CI: PR runs each suite's fixed default pool via `npm test` (`.github/workflows/tests.yml`); nightly runs expanded pools + the real-driver differential matrix (`.github/workflows/nightly-fuzz.yml`). A failing seed is a regression case: reproduce with `FUZZ_*_SEED_START=<seed> FUZZ_*_SEED_COUNT=1 FUZZ_VERBOSE=1`, then pin it in the suite's deterministic regression group when fixed

### Bug fixing: fix the class, not the instance

Eighteen review rounds show the dominant failure mode is a **point fix for a reproduced instance while the bug's family lives on** (same rule, different topology / consumer track / view form). When you find and fix a bug, this is the mandatory checklist:

1. **Enumerate all readers of the declaration surface.** If the bug is in how a declaration (`recordName`, trigger, dataDep, payload shape, ...) is consumed, list every consumer of that surface — data-based track, event-based track, migration signature, public producer APIs (`addSourceMap`, ...) — and verify each one. The fix that motivated the repro covers exactly one reader by construction; the siblings are where the next fatal bug lives.
2. **Prefer convergence-point fixes over per-branch patches.** Route all consumers through one shared pipeline (normalization, guard, choke point) instead of patching the branch the repro walked. One source of truth; duplicated resolution logic *will* drift (e.g. hand-walking the entity graph vs the compiled storage schema).
3. **Promote known rules to checked invariants.** If the fix relies on a universal statement ("update events never fire under view names", "reliance is always 1:x"), assert it — declaration-time guard or setup-time invariant with a clear error. Comments have no enforcement power; a fail-fast protects users who hit the case before any test does.
4. **Scan the neighborhood and backfill the registry.** Fix regressions must cover sibling cells (adjacent topology / operation / track values), and any new dimension the bug reveals must be added to the dimension registry in `tests/runtime/WritingComputationTests.md`.
5. **For fatal bugs that escaped existing tests, record the escape analysis.** Write *why the test system missed it* (retrospective in `agentspace/output/`), and turn the lesson into a mechanism — a new axis, an oracle, an invariant — not prose. See `agentspace/output/r17-test-blindness-retrospective.md` and `r18-test-blindness-retrospective.md` for the method and precedents.
6. **Contract decisions are fixes too.** Declaring a shape legal (or deprecated) changes the contract surface exactly like a bug fix does — enumerate every evaluation/compilation reader of that shape before landing the decision (r27 I-1: a shape declared legal at create time crashed all four evaluators).
7. **Dialect/driver-branch fixes need dialect-matched probes.** A green test that exercises the sibling branch certifies nothing — the probe must run on the driver/path the fix claims to change (r27 I-3: the MySQL surrogate-key "fix" was dead code for a full round while its test passed on PGLite, where hashing is bypassed by design).

## Common patterns

### Count

```typescript
Property.create({
  name: 'followerCount',
  computation: Count.create({
    record: Relation.create({ source: '*', target: User })
  })
})
```

### StateMachine

```typescript
const pendingState = StateNode.create({ name: 'pending' });
const approvedState = StateNode.create({ name: 'approved' });
const rejectedState = StateNode.create({ name: 'rejected' });

Property.create({
  name: 'status',
  computation: StateMachine.create({
    states: [pendingState, approvedState, rejectedState],
    initialState: pendingState,
    transfers: [
      StateTransfer.create({
        current: pendingState,
        next: approvedState,
        // trigger is a RecordMutationEventPattern matched against mutation events
        trigger: {
          recordName: InteractionEventEntity.name,
          type: 'create',
          record: { interactionName: ApproveRequest.name }
        },
        // property-level state machines must locate the target record(s)
        computeTarget: (event) => ({ id: event.record.payload.requestId })
      }),
      StateTransfer.create({
        current: pendingState,
        next: rejectedState,
        trigger: {
          recordName: InteractionEventEntity.name,
          type: 'create',
          record: { interactionName: RejectRequest.name }
        },
        computeTarget: (event) => ({ id: event.record.payload.requestId })
      })
    ]
  })
})
```

### Permission control (Condition)

```typescript
const DeletePost = Interaction.create({
  name: 'DeletePost',
  action: Action.create({ name: 'deletePost' }),
  // conditions receive the full event args: user, payload, query, activityId.
  // Guard callbacks must return an actual boolean (fail-closed otherwise).
  conditions: Condition.create({
    name: 'onlyAuthor',
    content: async function(event) {
      return event.user.id === event.payload.post.author.id
    }
  })
});
```

## Debugging

### Enable reactive computation logging

```typescript
controller.system.logger.level = 'debug';
```

### Inspect mutation events

```typescript
system.storage.listen((events) => {
  console.log('Mutation events:', events);
});
```

### Assert computed properties in tests

```typescript
const user = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'id', value: ['=', userId] }),
  undefined,
  ['*']
);
expect(user.followerCount).toBe(expectedCount);
```

## Build and test commands

```bash
npm install
npm test                    # all tests (PGLite/SQLite; postgresql* suites SKIP without env)
npm run test:runtime        # runtime layer
npm run test:storage        # storage layer
npm run test:core           # core layer
npm run check               # tsc --noEmit
npm run build               # vite library build → dist/
```

### Real-PostgreSQL test suites (required)

`tests/runtime/postgresql*.spec.ts` (concurrency, migration, scoped sequence, data
constraints, lock semantics, id consistency) only run against a real PostgreSQL
server. They are gated on `INTERAQT_POSTGRES_DATABASE` and skip silently when it
is unset, so always run them explicitly when touching drivers, storage write
paths, migration, transactions, or locking:

```bash
# one-time setup (Ubuntu; any PostgreSQL >= 14 works)
sudo apt-get update && sudo apt-get install -y postgresql
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE USER interaqt WITH PASSWORD 'interaqt' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE interaqt OWNER interaqt;"       # default landing DB for the admin connection
sudo -u postgres psql -c "CREATE DATABASE interaqt_test OWNER interaqt;"

# run all real-PG suites (concurrency, migration, scoped sequence, data
# constraints, lock semantics, id consistency, json match)
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
 npm run test:postgres
```

Each spec derives its own exclusive database name from `INTERAQT_POSTGRES_DATABASE`
(suffixes like `_concurrency`) because `setup(true)` drops and recreates the
database with FORCE — never point it at a database you care about.

## Guidelines and pitfalls

### Avoid imperative thinking

- ❌ Do not think in terms of "steps to update data"
- ✅ Think in terms of "what data is defined to be"

### Use Interactions correctly

- Interactions declare what users *can* do
- Do not embed business logic in Interaction handlers
- Use Computations to react to Interactions

### Performance

- Use FilteredEntity for query optimization
- Use async computations judiciously
- Avoid circular computation dependencies

### Database compatibility

- PGLite does not support `GENERATED ALWAYS AS IDENTITY`
- PGLite requires single-quoted string defaults
- Avoid dynamic functions in `defaultValue`
- The MySQL driver declares `transactions: false` — `Controller.dispatch` requires transactions and fails fast with `TransactionCapabilityError` on MySQL; use PostgreSQL/PGLite/SQLite for dispatch-driven applications

### Common pitfalls

1. **Transform** creates new entities/relations; it does not update existing ones — use **StateMachine** for property updates
2. Always define state nodes before using them in StateMachine
3. Nested `controller.dispatch()` inside a transaction throws `NestedDispatchError`

## Knowledge base

| Path | Contents |
|------|----------|
| `agent/agentspace/knowledge/usage/` | Usage guides (mindset, entities, interactions, computations, testing) |
| `agent/agentspace/knowledge/generator/` | Code generation guides |
| `agentspace/knowledge/` | Technical deep-dives (filtered entities, cascade, storage) |
| `src/storage/USAGE_GUIDE.md` | Storage layer usage |
| `src/storage/IMPLEMENTATION_DETAILS.md` | Storage internals |
| `tests/runtime/WritingComputationTests.md` | Computation test guide + **dimension registry** (mandatory for new test matrices and bug-fix regressions) |
| `agentspace/output/r17-test-blindness-retrospective.md`, `.../r18-test-blindness-retrospective.md` | Why fatal bugs escaped the test system — structural blind spots and the systemic-fix method |

Start with:

1. `agent/agentspace/knowledge/usage/00-mindset-shift.md`
2. `agent/agentspace/knowledge/usage/01-core-concepts.md`

Test references: `tests/runtime/`, `tests/storage/`

## Development workflow

1. **Understand requirements** — identify entities, relations, and interactions
2. **Define data model** — create Entities and Relations
3. **Declare computations** — define derived data with Computation
4. **Define interactions** — create Interactions and Activities
5. **Write tests** — cover all behavior through dispatch
6. **Build frontend** — use Axii in example apps when applicable

## FAQ

**Q: How do I update data?**
A: Do not think "update" — declare what data *is*. The framework handles propagation.

**Q: How do I handle complex business logic?**
A: Compose Interactions with Activities; manage state with StateMachine.

**Q: How do I optimize performance?**
A: Use FilteredEntity, design computations carefully, avoid unnecessary derivations.

**Q: How do I debug reactive computations?**
A: Enable logging, listen to mutation events, write thorough dispatch-based tests.

## Agent output

Place research documents, design proposals, and analysis reports in `agentspace/output/` by default. All agent-produced prose follows § "Plain professional language" — reports written in insider shorthand lose their value as the durable record other agents and humans rely on.

## Tool-specific configuration

- **Cursor**: layered rules in `.cursor/rules/` (architecture, testing, storage, build)
- **Claude Code**: see `CLAUDE.md` at repo root
- **Example-app generation**: see `agent/CLAUDE.md`

---

**Remember**: in interaqt you declare what data is; the framework handles all propagation and persistence. Stop thinking "how to operate"; start thinking "what it is."
