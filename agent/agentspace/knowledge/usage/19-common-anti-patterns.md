# Common Anti-Patterns and Mistakes

This document consolidates common mistakes and anti-patterns to help developers avoid pitfalls when using the interaqt framework.

## 1. Import-Related Mistakes

### ❌ Importing Non-Existent Entities

```javascript
// ❌ WRONG: User is not exported from interaqt
import { User, Entity, Property } from 'interaqt';

// ✅ CORRECT: Define your own User entity
import { Entity, Property } from 'interaqt';

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});
```

### ❌ Using Non-Existent Computation Types

```javascript
// ❌ WRONG: RelationBasedEvery doesn't exist
import { RelationBasedEvery } from 'interaqt';

// ✅ CORRECT: Use Every with relations
import { Every } from 'interaqt';

const allCompleted = Every.create({
  record: UserTaskRelation,
  attributeQuery: ['status'],  // Required when callback reads fields
  callback: (relation) => relation.status === 'completed'
});
```

### ❌ Wrong Entity Name

```javascript
// ❌ WRONG: It's not InteractionEvent
import { InteractionEvent } from 'interaqt';

// ✅ CORRECT: The correct name is InteractionEventEntity
import { InteractionEventEntity } from 'interaqt';
```

## 2. Property Definition Mistakes

### ❌ Using Non-Existent Property Options

```javascript
// ❌ WRONG: identifier property doesn't exist
Property.create({ 
  name: 'externalId', 
  type: 'string',
  identifier: true  // This doesn't exist!
});

// ✅ CORRECT: ID uniqueness is handled by storage layer
Property.create({ 
  name: 'externalId', 
  type: 'string'
});
```

### ❌ Treating raw SQL / plugin type strings as Property.type

```typescript
// ❌ WRONG: unknown type strings are rejected at Property.create.
// Drivers no longer silently paste unknown types into DDL.
Property.create({ name: 'embedding', type: 'vector' })
Property.create({ name: 'title', type: 'varchar(255)' })

// ❌ WRONG: Dictionary is not a native column — extended names are rejected.
Dictionary.create({ name: 'embedding', type: 'vector' })

// ❌ WRONG: PayloadItem has its own whitelist; definePropertyType does not widen it.
PayloadItem.create({ name: 'embedding', type: 'vector' })

// ✅ CORRECT: register then declare on a Property column
import { definePropertyType, Property } from 'interaqt'
definePropertyType({
  name: 'vector',
  validateArgs(args) { /* require dimensions */ },
  storage: {
    postgres: {
      fieldType: (ctx) => `vector(${(ctx.args as { dimensions: number }).dimensions})`,
      // match: { ... }  // operators are NOT free — register each one you need
    }
  }
})
Property.create({ name: 'embedding', type: 'vector', args: { dimensions: 1536 } })
```

Having a physical column does **not** enable Match operators. Unregistered `=`,
`in`, `contains`, etc. fail at Match compile time until declared under
`storage.<dialect>.match`.

### ❌ Declaring Reserved Property Names

```javascript
// ❌ WRONG: 'id' is the framework-managed primary key — Entity.create rejects it.
// The same applies to '_rowId', and to 'source'/'target' on relation properties.
Property.create({ name: 'id', type: 'string' });

// ✅ CORRECT: use an explicit business identifier name
Property.create({ name: 'externalId', type: 'string' });
```

### ❌ Relation Property Name Colliding with a Value Property

```javascript
// ❌ WRONG: sourceProperty 'email' collides with the scalar property 'email' —
// they share one attribute namespace per record; setup fails fast.
const User = Entity.create({
  name: 'User',
  properties: [Property.create({ name: 'email', type: 'string' })]
});
Relation.create({
  source: User, sourceProperty: 'email',  // collides!
  target: Contact, targetProperty: 'owner', type: '1:n'
});

// ✅ CORRECT: pick distinct names for value properties and relation properties
Relation.create({
  source: User, sourceProperty: 'contacts',
  target: Contact, targetProperty: 'owner', type: '1:n'
});
```

### ❌ Using Non-Function defaultValue

```javascript
// ❌ WRONG: defaultValue should always be a function
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: 'active'  // Should be a function!
});

// ✅ CORRECT: Use function form
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: () => 'active'
});
```

## 3. Relation Definition Mistakes

### ❌ Specifying Relation Name

```javascript
// ❌ WRONG: Don't specify name for relations
const UserPostRelation = Relation.create({
  name: 'UserPost',  // Don't do this!
  source: User,
  target: Post,
  type: '1:n'
});

// ✅ CORRECT: Name is auto-generated
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  type: '1:n'
});
```

### ❌ Using Wrong Property Names

```javascript
// ❌ WRONG: It's not relationType
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  relationType: '1:n'  // Wrong property name!
});

// ✅ CORRECT: Use 'type'
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  type: '1:n'
});
```

### ❌ Wrong Relation Type Format

```javascript
// ❌ WRONG: Wrong format
Relation.create({
  type: 'one:many'  // Wrong!
});

// ✅ CORRECT: Use proper format
Relation.create({
  type: '1:n'  // or '1:1', 'n:1', 'n:n'
});
```

## 4. Interaction Definition Mistakes

### ❌ Adding User Property to Interaction

```javascript
// ❌ WRONG: user is not a property of Interaction
const SomeInteraction = Interaction.create({
  name: 'SomeInteraction',
  user: User,  // This doesn't exist!
  action: Action.create({ name: 'someAction' })
});

// ✅ CORRECT: User is passed at execution time
const SomeInteraction = Interaction.create({
  name: 'SomeInteraction',
  action: Action.create({ name: 'someAction' })
});

// User context provided when calling
await controller.callInteraction('SomeInteraction', {
  user: { id: 'user123', name: 'John' },  // Passed here
  payload: { /* ... */ }
});
```

### ❌ Thinking Action Contains Logic

```javascript
// ❌ WRONG: Action is just an identifier
const CreatePost = Action.create({
  name: 'createPost',
  execute: async () => { /* ... */ },  // No execute method!
  handler: () => { /* ... */ }          // No handler either!
});

// ✅ CORRECT: Action is just a name/identifier
const CreatePost = Action.create({
  name: 'createPost'  // That's it!
});
```

## 5. Computation Mistakes

### ❌ Using Transform for Property Computation

```javascript
// ❌ WRONG: Transform is for collection-to-collection transformation
Property.create({
  name: 'displayName',
  computation: Transform.create({
    record: User,  // Wrong usage!
    callback: (user) => `${user.firstName} ${user.lastName}`
  })
});

// ✅ CORRECT: Use getValue for same-entity property computation
Property.create({
  name: 'displayName',
  type: 'string',
  getValue: (record) => `${record.firstName} ${record.lastName}`
});
```

### ❌ Circular References in Transform

```javascript
// ❌ WRONG: Entity referencing itself in Transform
const User = Entity.create({
  name: 'User',
  computation: Transform.create({
    record: User,  // Circular reference!
    callback: (user) => { /* ... */ }
  })
});

// ✅ CORRECT: Transform should reference different entities
const DerivedEntity = Entity.create({
  name: 'DerivedEntity',
  computation: Transform.create({
    record: SourceEntity,  // Different entity
    callback: (source) => { /* ... */ }
  })
});
```

### ❌ Using String References in StateMachine

```javascript
// ❌ WRONG: Using strings for state references
StateMachine.create({
  states: [activeState, inactiveState],
  transfers: [
    StateTransfer.create({
      current: 'active',  // Should be object reference!
      next: 'inactive',   // Should be object reference!
      trigger: {
        recordName: InteractionEventEntity.name,
        type: 'create',
        record: { interactionName: SomeInteraction.name }
      }
    })
  ],
  initialState: 'active'  // Should be object reference!
});

// ✅ CORRECT: Use object references
const activeState = StateNode.create({ name: 'active' });
const inactiveState = StateNode.create({ name: 'inactive' });

StateMachine.create({
  states: [activeState, inactiveState],
  transfers: [
    StateTransfer.create({
      current: activeState,     // Object reference
      next: inactiveState,      // Object reference
      trigger: {
        recordName: InteractionEventEntity.name,
        type: 'create',
        record: { interactionName: SomeInteraction.name }
      }
    })
  ],
  initialState: activeState     // Object reference
});
```

### ❌ Using StateMachine or max+1 for Scoped Serial Numbers

```javascript
// ❌ WRONG: not safe across PostgreSQL connections
Property.create({
  name: 'serialNumber',
  type: 'number',
  computation: StateMachine.create({
    // lastValue + 1 is per-record state logic, not a transactional scoped counter
  })
});

// ❌ WRONG: "SELECT MAX(serialNumber) + 1" races under concurrency
async function allocateSerial(projectId, prefix) {
  const max = await db.query('select max(serialNumber) ...');
  return max + 1;
}
```

```javascript
// ✅ CORRECT: declare the allocation as a property computation
const serial = ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'prefix' }
  ]
});

Property.create({
  name: 'serialNumber',
  type: 'number',
  computation: serial
});
```

Always pair `ScopedSequence` with a `UniqueConstraint` over the scope fields plus the sequence property. For existing data, seed every scope through migration `initializeFrom`; do not partially seed a sequence that will later allocate for all host rows.

## 6. Testing Mistakes

### ❌ Using try-catch for Error Testing

```javascript
// ❌ WRONG: interaqt doesn't throw exceptions
test('should fail validation', async () => {
  try {
    await controller.callInteraction('SomeInteraction', {...});
    fail('Should have thrown error');
  } catch (e) {
    // This code will never execute!
  }
});

// ✅ CORRECT: Check error field in result
test('should fail validation', async () => {
  const result = await controller.callInteraction('SomeInteraction', {...});
  expect(result.error).toBeTruthy();
  expect(result.error.message).toContain('validation failed');
});
```

### ❌ Using storage.create() to Test Validation

```javascript
// ❌ WRONG: storage.create bypasses ALL validation
test('should fail with invalid data', async () => {
  const result = await system.storage.create('Style', {
    label: '',    // Empty label
    slug: ''      // Empty slug
  });
  // This will ALWAYS succeed! storage.create bypasses validation
  expect(result).toBeTruthy();  // Wrong expectation!
});

// ✅ CORRECT: Test validation through Interactions
test('should fail with invalid data', async () => {
  const result = await controller.callInteraction('CreateStyle', {
    user: testUser,
    payload: {
      label: '',    // Empty label
      slug: ''      // Empty slug
    }
  });
  
  expect(result.error).toBeDefined();
  expect(result.error.type).toBe('validation failed');
});

// ✅ CORRECT: Use storage.create ONLY for test setup
beforeEach(async () => {
  // Create test data that should already exist
  testUser = await system.storage.create('User', {
    name: 'Test User',
    role: 'admin'
  });
  
  existingStyle = await system.storage.create('Style', {
    label: 'Existing Style',
    slug: 'existing-style'
  });
});
```

### ❌ Testing Entity/Relation Directly

```javascript
// ❌ WRONG: Don't test entities separately
test('should create User entity', async () => {
  const user = await system.storage.create('User', {
    name: 'John',
    email: 'john@example.com'
  });
  expect(user.name).toBe('John');
  // This is testing storage, not business logic!
});

// ✅ CORRECT: Test through Interactions
test('should create user through interaction', async () => {
  const result = await controller.callInteraction('CreateUser', {
    user: adminUser,
    payload: {
      name: 'John',
      email: 'john@example.com'
    }
  });
  
  expect(result.error).toBeUndefined();
  
  // Verify side effects
  const user = await system.storage.findOne('User',
    MatchExp.atom({ key: 'email', value: ['=', 'john@example.com'] })
  );
  expect(user.name).toBe('John');
});
```

## 7. Payload Entity Reference Issues

### ❌ Entity Resolution Problems

```javascript
// ❌ PROBLEMATIC: Can cause "entity undefined not found"
PayloadItem.create({ 
  name: 'version',
  base: Version,  // Can cause resolution issues with circular deps
  isRef: false
});

// ✅ WORKAROUND: Use generic object type when needed
PayloadItem.create({ 
  name: 'version',
  base: 'object',  // Generic type avoids resolution issues
  isRef: false
});
```

## 8. Authentication Misunderstandings

### ❌ Creating Authentication Interactions

```javascript
// ❌ WRONG: interaqt doesn't handle authentication
const UserLogin = Interaction.create({
  name: 'UserLogin',
  action: Action.create({ name: 'login' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'username' }),
      PayloadItem.create({ name: 'password' })
    ]
  })
});

// ✅ CORRECT: Authentication is external
// User identity should be provided by external system (JWT, Session, etc.)
// When calling interactions, user is already authenticated:
await controller.callInteraction('CreatePost', {
  user: authenticatedUser,  // Pre-authenticated by external system
  payload: { /* ... */ }
});
```

## 9. Record Identity Mistakes

Logical `id` is the **single application identity**: Relation endpoints, `MatchExp`, and `StateMachine.computeTarget` all use `{ id }` / match-by-id. The physical table primary key `_rowId` is an implementation detail and must not be treated as business identity.

### Rules (create optional, update immutable)

| Path | Top-level `id` | Behavior |
|------|----------------|----------|
| `storage.create` / Transform **insert** | Optional | Omit → framework allocates. Provide → stored as logical identity (unique, driver-compatible). Duplicates fail loud. |
| `storage.update` / Transform **update** patch | Ignored | Stripped before write; identity located only by match / `affectedId`. |
| Nested `{ author: { id } }` | Always valid | Relation attachment, not identity rewrite. |
| Declaring `Property.create({ name: 'id', ... })` | Forbidden | Reserved framework column — use another property name (e.g. `externalId`) for a *second* business key if needed. |

Driver type contract for pregenerated ids: **PGLite** expects UUID strings; **SQLite / PostgreSQL / MySQL** use integer logical ids. Supplying a type the driver cannot store fails at write time.

### ❌ Common mistakes

```javascript
// ❌ WRONG: data-based Transform spreads source id when the derived row needs its own identity
// Spreading reuses source.id. If a target row already has that id, create fails (unique index).
// If not, target and source share the same logical id value (observable; document if intentional).
computation: Transform.create({
  record: Product,
  callback: (product) => ({ ...product, discountedPrice: product.price * 0.9 })
})

// ❌ WRONG: treating update payload id as a way to rename / relocate a row
await system.storage.update(
  'Article',
  MatchExp.atom({ key: 'id', value: ['=', oldId] }),
  { id: newId, title: 'Renamed' }  // id is stripped; row stays oldId
)

// ❌ WRONG: InteractionEvent Transform cannot "update by returning id"
// That path only creates. Returning an existing id inserts again → unique constraint failure.
callback: (mutationEvent) => {
  const event = mutationEvent.record
  if (event.interactionName === 'UpdateArticle') {
    return { id: event.payload.id, title: event.payload.title }  // not an update
  }
}

// ❌ WRONG: declare a user property named `id` (reserved)
Property.create({ name: 'id', type: 'string' })
```

### ✅ Correct patterns

#### 1. Framework-allocated id (default)

```javascript
// Omit id — framework allocates; use the returned record for Relation / tests
testUser = await system.storage.create('User', {
  name: 'Test User',
  email: 'test@example.com'
})

testArticle = await system.storage.create('Article', {
  title: 'Test Article',
  author: { id: testUser.id }
})
```

#### 2. Client-pregenerated logical id (single identity)

Use when the client must know the identity before persist (idempotent create, offline keys, linking before round-trip).

```javascript
const articleId = crypto.randomUUID()  // PGLite; use an integer on INT drivers

const Article = Entity.create({
  name: 'Article',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function (mutationEvent) {
      const event = mutationEvent.record
      if (event.interactionName !== 'CreateArticle') return null
      return {
        id: event.payload.id,  // optional; unique + driver-compatible
        title: event.payload.title,
        content: event.payload.content,
        author: event.user
      }
    }
  })
})

await controller.dispatch('CreateArticle', {
  user: currentUser,
  payload: {
    id: articleId,
    title: 'My Article',
    content: 'Content...'
  }
})

// Same id works for Relation, nested attributeQuery, and computeTarget
await system.storage.create('Comment', {
  body: 'Nice',
  article: { id: articleId }
})
```

#### 3. Data-based Transform with independent identity

```javascript
computation: Transform.create({
  record: Product,
  callback: ({ id: _sourceId, ...rest }) => ({
    name: rest.name,
    originalPrice: rest.price,
    discountedPrice: rest.price * 0.9
    // omit id → new framework id; or set id: generateUniqueId()
  })
})
```

#### 4. Optional secondary tracking column (`clientId`)

A separate `clientId` (or similar) property is **optional** when you need a non-primary correlation key *in addition to* logical `id` — not the recommended substitute for application identity. Prefer pregenerated `id` when the value *is* the identity.

```javascript
Property.create({
  name: 'clientId',
  type: 'string',
  description: 'Optional external correlation key; logical id remains the Relation key'
})
```

#### 5. Query by unique business properties

```javascript
const createdUser = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'email', value: ['=', 'unique@example.com'] }),
  undefined,
  ['*']
)
```

### Why these rules exist

1. **Single identity** keeps Relation, `computeTarget`, and storage match expressions aligned on one key.
2. **Create-time optional id** enables idempotent and offline-friendly creates without a parallel identity column.
3. **Immutable id after create** keeps incremental Transform maps (`affectedId`), foreign references, and event targeting stable.
4. **Unique logical id index** makes accidental reuse fail loud instead of silently duplicating rows.
5. **Property name `id` stays reserved** so user declarations cannot shadow the framework column.

## 10. Condition / transaction anti-patterns

### ❌ Hand-writing row locks in Condition content

```typescript
// ❌ Dialect SQL or ad-hoc advisory locks in the guard
content: async function(this: Controller, event) {
  await this.system.storage.query(`SELECT … FOR UPDATE …`)
  // …
}

// ✅ Declarative locks + AdmissionSnapshot
Condition.create({
  name: 'HasBalance',
  locks: [{ recordName: 'Account', id: (e) => e.payload.accountId, attributeQuery: ['id', 'balance'] }],
  content: async function(event, admission) {
    const account = admission.get('Account', event.payload.accountId)
    return !!account && Number(account.balance) >= Number(event.payload.amount)
  }
})
```

### ❌ Nested dispatch or bare outer transaction instead of business transaction

```typescript
// ❌ Nested dispatch inside a dispatch stack → NestedDispatchError
// ❌ storage.runInTransaction(async () => { await controller.dispatch(...) })
//    → BusinessTransactionBoundaryError code: 'DISPATCH_IN_NON_BT_TRANSACTION'
//    (hard runtime error — not a soft warning)

// ✅ Official atomic boundary
await controller.runInBusinessTransaction({ name: 'create-and-activate' }, async () => {
  const row = await controller.system.storage.create('Draft', { … })
  return controller.dispatch(ActivateDraft, { user, payload: { draftId: row.id } })
})

// ✅ Pure storage transaction without dispatch remains legal
await controller.system.storage.runInTransaction({ name: 'bulk-update' }, async () => {
  await controller.system.storage.update('Draft', /* … */)
})
```

### ❌ Mutating payload / event.error for Condition results

```typescript
// ❌
event.payload._resolved = x
event.error = 'nope'
return false

// ✅
return { allowed: false, code: 'NOPE', details: { … } }
// or on allow: return { allowed: true, context: { resolved: x } }  // → event.context.admission
```

### ❌ Throwing RequireSerializableRetry from Condition as an isolation switch

Condition-thrown `RequireSerializableRetry` is absorbed as a condition failure and does **not** upgrade the dispatch isolation. Use declarative `locks` for concurrent admission, or open `runInBusinessTransaction({ isolation: 'SERIALIZABLE' })` when framework SERIALIZABLE gates are required inside a BT.

## Key Takeaways

1. **interaqt provides tools, not pre-built business entities**
2. **All entities must be defined by you**
3. **User authentication is external to the framework**
4. **Action is just an identifier, not an operation**
5. **Transform is for collection transformations, not property computations**
6. **Always use object references in StateMachine, not strings**
7. **Top-level dispatch: check `result.error`; BT default abort: dispatch throws — use try/catch only there**
8. **storage.create() bypasses ALL validation - use only for test setup**
9. **ALL business logic testing must use `controller.dispatch` (or callInteraction)**
10. **Never test Entity/Relation directly - test through Interactions**
11. **Logical `id` is the single application identity — optional on create, immutable on update; type must match the driver**
12. **Prefer returned `storage.create` id or a pregenerated logical id for Relation / computeTarget; `clientId` is only an optional secondary key**
13. **Concurrent admission: `Condition.locks` + snapshot; same-request write+dispatch: `runInBusinessTransaction`**
14. **Bare `runInTransaction` + `dispatch` is a hard error (`DISPATCH_IN_NON_BT_TRANSACTION`); branch business rejects on `InteractionGuardError.code`**
15. **When in doubt, check the [API Exports Reference](./18-api-exports-reference.md) and [Conditions guide](./06-attributive-permissions.md)**

Remember: The framework is about **declaring what data is**, not **how to manipulate it**.

## Sequence, idempotency, and retention anti-patterns

| Anti-pattern | Prefer |
|--------------|--------|
| Loop `nextSequenceValue` N times for multi-row contiguous tickets | `this.atomic.reserveSequenceRange({ count: N, ... })` |
| Dual callback access (`this.system.storage.atomic` vs `this.controller.system.storage.atomic`) as the taught API | `this.atomic` on `ComputationActionContext` |
| Infer idempotent replay by scanning `effects` or catching unique conflicts | Declare `idempotency` and branch on `result.outcome` |
| Hand-written storage prune loops for history caps/TTL | `Entity.retention` + `controller.maintainEntityRetention` |
| Using `cleanupAsyncTasks` to delete user entity history | Keep async-task cleanup separate; use entity retention for user rows |

