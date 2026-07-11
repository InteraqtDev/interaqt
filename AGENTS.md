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

### Klass pattern

Core types use: interface → CreateArgs → `Entity.create(args)` → static registry (`instances`, `isKlass`, `displayName`) → `toData()` / `fromData()`.

### Testing

- Test through **Interactions** (`controller.dispatch`), not direct storage mutations
- Every Interaction and every computed property should have tests
- Always specify **attributeQuery** in `storage.find` / `findOne` (use `['*']` for all fields)
- Use **PGLiteDB** for tests when possible
- File naming: `*.spec.ts`
- Do not manually set entity IDs — let the framework generate them
- Always `await controller.setup(true)` before dispatching
- When adding a test **matrix**, consult the dimension registry in `tests/runtime/WritingComputationTests.md` — every dimension (including degenerate values and the mechanism axes) must be explicitly decided

### Bug fixing: fix the class, not the instance

Eighteen review rounds show the dominant failure mode is a **point fix for a reproduced instance while the bug's family lives on** (same rule, different topology / consumer track / view form). When you find and fix a bug, this is the mandatory checklist:

1. **Enumerate all readers of the declaration surface.** If the bug is in how a declaration (`recordName`, trigger, dataDep, payload shape, ...) is consumed, list every consumer of that surface — data-based track, event-based track, migration signature, public producer APIs (`addSourceMap`, ...) — and verify each one. The fix that motivated the repro covers exactly one reader by construction; the siblings are where the next fatal bug lives.
2. **Prefer convergence-point fixes over per-branch patches.** Route all consumers through one shared pipeline (normalization, guard, choke point) instead of patching the branch the repro walked. One source of truth; duplicated resolution logic *will* drift (e.g. hand-walking the entity graph vs the compiled storage schema).
3. **Promote known rules to checked invariants.** If the fix relies on a universal statement ("update events never fire under view names", "reliance is always 1:x"), assert it — declaration-time guard or setup-time invariant with a clear error. Comments have no enforcement power; a fail-fast protects users who hit the case before any test does.
4. **Scan the neighborhood and backfill the registry.** Fix regressions must cover sibling cells (adjacent topology / operation / track values), and any new dimension the bug reveals must be added to the dimension registry in `tests/runtime/WritingComputationTests.md`.
5. **For fatal bugs that escaped existing tests, record the escape analysis.** Write *why the test system missed it* (retrospective in `agentspace/output/`), and turn the lesson into a mechanism — a new axis, an oracle, an invariant — not prose. See `agentspace/output/r17-test-blindness-retrospective.md` and `r18-test-blindness-retrospective.md` for the method and precedents.

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
npm test                    # all tests
npm run test:runtime        # runtime layer
npm run test:storage        # storage layer
npm run test:core           # core layer
npm run check               # tsc --noEmit
npm run build               # vite library build → dist/
```

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

Place research documents, design proposals, and analysis reports in `agentspace/output/` by default.

## Tool-specific configuration

- **Cursor**: layered rules in `.cursor/rules/` (architecture, testing, storage, build)
- **Claude Code**: see `CLAUDE.md` at repo root
- **Example-app generation**: see `agent/CLAUDE.md`

---

**Remember**: in interaqt you declare what data is; the framework handles all propagation and persistence. Stop thinking "how to operate"; start thinking "what it is."
