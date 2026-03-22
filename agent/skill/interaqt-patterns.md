# interaqt Patterns

> Read this file BEFORE writing any interaqt code. Every section is self-contained.

---

## When Defining Entities and Properties

```typescript
import { Entity, Property } from 'interaqt'

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'age', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: 'active' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({
      name: 'fullName',
      type: 'string',
      getValue: (record) => `${record.firstName} ${record.lastName}`
    })
  ]
})
```

Property types: `'string'`, `'number'`, `'boolean'`. Use `collection: true` for arrays. Use `type: 'object'` for JSON.

### WRONG: Manual UUID assignment
```typescript
// DON'T — the Klass pattern generates IDs internally
const user = Entity.create({
  name: 'User',
  uuid: 'my-custom-id-123',
  properties: [...]
})
```

### CORRECT:
```typescript
const user = Entity.create({
  name: 'User',
  properties: [...]
})
```

### WHY
The Klass pattern uses `generateUUID()` internally. Manual IDs risk collisions and break serialization.

### Checklist
- [ ] Entity name is PascalCase and singular (`User` not `users`)
- [ ] No manual UUID assignment
- [ ] Computed properties that depend only on the same record use `getValue`, NOT Transform
- [ ] Properties with reactive computations (Count, etc.) include `defaultValue`

---

## When Defining Relations

```typescript
import { Entity, Property, Relation } from 'interaqt'

const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
const Post = Entity.create({ name: 'Post', properties: [Property.create({ name: 'title', type: 'string' })] })

const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})
```

Relation names are auto-generated from source+target entity names (e.g., `UserPost`).

### WRONG: Specifying relation name
```typescript
// DON'T — name is auto-generated
const UserPosts = Relation.create({
  name: 'UserPost',
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})
```

### CORRECT:
```typescript
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})
```

### WHY
The framework generates relation names automatically from entity names. Specifying a name conflicts with this mechanism.

### WRONG: Omitting relation type
```typescript
// DON'T — type is mandatory
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author'
})
```

### CORRECT:
```typescript
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})
```

### WHY
Without `type`, the framework cannot determine cardinality. ALWAYS explicitly set `'1:1'`, `'1:n'`, `'n:1'`, or `'n:n'`.

### Checklist
- [ ] NEVER specify `name` — it is auto-generated
- [ ] ALWAYS specify `type` explicitly
- [ ] Both `sourceProperty` and `targetProperty` are set with meaningful names
- [ ] Symmetric relations: `source === target` AND `sourceProperty === targetProperty`

---

## When Adding Reactive Computations

**Decision tree — which computation type to use:**

| Need | Use |
|------|-----|
| Count related records | `Count` |
| Weighted sum of related records | `WeightedSummation` |
| Check ALL related records match condition | `Every` |
| Check ANY related record matches condition | `Any` |
| Derive new entities from events or other entities | `Transform` (on Entity `computation`) |
| Update a property value based on state transitions | `StateMachine` (on Property `computation`) |
| Simple computation from same-record fields | `getValue` (on Property) |

```typescript
import { Entity, Property, Relation, Count, WeightedSummation, Transform, InteractionEventEntity } from 'interaqt'

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({ record: LikeRelation })
    })
  ]
})
```

### WRONG: Transform on a Property computation
```typescript
// DON'T — Transform belongs on Entity.computation, not Property.computation
Property.create({
  name: 'formattedPrice',
  computation: Transform.create({
    record: Product,
    callback: (product) => `$${product.price}`
  })
})
```

### CORRECT:
```typescript
Property.create({
  name: 'formattedPrice',
  type: 'string',
  getValue: (record) => `$${record.price}`
})
```

### WHY
Transform creates new records in a computed entity collection. It CANNOT update a single property. Use `getValue` for same-entity property computations.

### WRONG: Transform for counting
```typescript
// DON'T — use Count for counting
Property.create({
  name: 'followerCount',
  computation: Transform.create({
    record: FollowRelation,
    callback: (followers) => followers.length
  })
})
```

### CORRECT:
```typescript
Property.create({
  name: 'followerCount',
  type: 'number',
  defaultValue: () => 0,
  computation: Count.create({ record: FollowRelation })
})
```

### WHY
Count uses incremental algorithms. Transform loads all records into memory, which is inefficient for counting.

### WRONG: Computations passed to Controller
```typescript
// DON'T — Controller does NOT accept a computations parameter
const controller = new Controller({
  system, entities, relations, activities, interactions,
  dict: [myComputation],  // dict is for Dictionaries, not computations
})
```

### CORRECT:
```typescript
// Computations MUST be placed inside Entity/Relation/Property definitions
Property.create({
  name: 'postCount',
  type: 'number',
  defaultValue: () => 0,
  computation: Count.create({ record: UserPostRelation })
})
```

### WHY
All computations are declared within the `computation` field of Entity, Relation, or Property. The `dict` parameter in Controller is for global Dictionary instances only.

### Checklist
- [ ] Transform is on `Entity.computation` or `Relation.computation`, NEVER on `Property.computation`
- [ ] Count, WeightedSummation, Every, Any are on `Property.computation`
- [ ] StateMachine is on `Property.computation`
- [ ] `getValue` is used for same-record-only property derivations
- [ ] Properties with computation ALWAYS have `defaultValue`
- [ ] NEVER pass computations to Controller constructor

---

## When Creating Interactions

```typescript
import { Interaction, Action, Payload, PayloadItem, Entity, Property } from 'interaqt'

const Post = Entity.create({ name: 'Post', properties: [Property.create({ name: 'title', type: 'string' })] })

const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true }),
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
})
```

Action is ONLY an identifier — it contains no operational logic. All data changes happen through reactive computations (Transform, StateMachine, Count, etc.).

### WRONG: Writing operational logic in Action
```typescript
// DON'T — Action has no handler/execute method
const CreatePost = Action.create({
  name: 'createPost',
  execute: async (payload) => {
    await db.create('Post', payload)
  }
})
```

### CORRECT:
```typescript
const CreatePost = Action.create({ name: 'createPost' })
```

### WHY
interaqt is declarative. Interactions declare "what users can do." Data changes are declared via computations (Transform, Count, StateMachine), not imperatively in handlers.

### Checklist
- [ ] Action has ONLY a `name` — no handler, no execute, no callback
- [ ] PayloadItem uses `isRef: true` when referencing an existing entity by ID
- [ ] PayloadItem uses `isCollection: true` for array parameters
- [ ] `base` is set when the payload item corresponds to an Entity

---

## When Setting Up the Controller

```typescript
import { Controller, MonoSystem, PGLiteDB, KlassByName } from 'interaqt'

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [User, Post],
  relations: [UserPosts],
  activities: [],
  interactions: [CreatePost],
  dict: [],
  recordMutationSideEffects: []
})

await controller.setup(true)
```

### WRONG: Calling callInteraction before setup
```typescript
// DON'T — setup MUST come first
const controller = new Controller({ system, entities, relations, activities, interactions, dict: [] })
await controller.callInteraction('CreatePost', { user: { id: '1' }, payload: { title: 'Hi' } })
```

### CORRECT:
```typescript
const controller = new Controller({ system, entities, relations, activities, interactions, dict: [] })
await controller.setup(true)
await controller.callInteraction('CreatePost', { user: { id: '1' }, payload: { title: 'Hi' } })
```

### WHY
`setup(true)` installs database tables and initializes all computations. Without it, storage operations will fail.

### Checklist
- [ ] `system.conceptClass = KlassByName` is set before creating Controller
- [ ] `controller.setup(true)` is called BEFORE any `callInteraction`
- [ ] `dict` contains only Dictionary instances, not computations

---

## When Calling Interactions

```typescript
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user-1', role: 'author' },
  payload: {
    title: 'My Post',
    content: 'Hello world'
  }
})

if (result.error) {
  console.log('Error:', result.error.message)
}
```

### WRONG: Using try-catch for error handling
```typescript
// DON'T — interaqt does NOT throw exceptions
try {
  await controller.callInteraction('CreatePost', { user: { id: '1' }, payload: {} })
} catch (e) {
  // This code will NEVER execute
}
```

### CORRECT:
```typescript
const result = await controller.callInteraction('CreatePost', {
  user: { id: '1' },
  payload: {}
})
if (result.error) {
  console.log('Error:', result.error.message)
}
```

### WHY
The framework catches all errors internally and returns them via `result.error`. Exceptions are never thrown to callers.

### WRONG: Using non-existent API methods
```typescript
// DON'T — these methods do NOT exist
controller.dispatch('CreatePost', payload)
controller.run()
controller.execute()
```

### CORRECT:
```typescript
// The ONLY method to trigger interactions
await controller.callInteraction('CreatePost', {
  user: { id: 'user-1' },
  payload: { title: 'Hi' }
})
```

### Checklist
- [ ] ALWAYS pass a `user` object with at least `id`
- [ ] ALWAYS check `result.error` — NEVER use try-catch
- [ ] Use `controller.callInteraction(name, args)` — no other dispatch method exists

---

## When Querying Data

```typescript
import { MatchExp } from 'interaqt'

const user = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'email', value: ['=', 'alice@example.com'] }),
  undefined,
  ['id', 'name', 'email', 'status']
)

const activeUsers = await system.storage.find(
  'User',
  MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
  { orderBy: { createdAt: 'DESC' }, limit: 10 },
  ['id', 'name', 'email']
)
```

### WRONG: Omitting attributeQuery
```typescript
// DON'T — without attributeQuery, only `id` is returned
const user = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'id', value: ['=', 1] })
)
// user.name → undefined!
```

### CORRECT:
```typescript
const user = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'id', value: ['=', 1] }),
  undefined,
  ['id', 'name', 'email', 'status']
)
```

### WHY
Without `attributeQuery`, the framework returns only the `id` field. This is the most common cause of "undefined" bugs.

Nested attributeQuery for relations:
```typescript
const usersWithPosts = await system.storage.find(
  'User',
  undefined,
  {},
  [
    'id', 'name',
    ['posts', { attributeQuery: ['id', 'title', 'status'] }]
  ]
)
```

Relation properties use `['&', { attributeQuery: ['role', 'joinedAt'] }]` syntax.

### Checklist
- [ ] ALWAYS pass `attributeQuery` as the 4th argument to `find`/`findOne`
- [ ] Use `['*']` for all fields, or list specific field names
- [ ] Use nested arrays for relation data: `['relationName', { attributeQuery: [...] }]`

---

## When Writing Tests

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB, MatchExp } from 'interaqt'

describe('Feature', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    controller = new Controller({
      system, entities, relations, activities, interactions, dict: [], recordMutationSideEffects: []
    })
    await controller.setup(true)
  })

  test('creates a post via interaction', async () => {
    const result = await controller.callInteraction('CreatePost', {
      user: { id: 'user-1' },
      payload: { title: 'Test', content: 'Hello' }
    })
    expect(result.error).toBeUndefined()

    const post = await system.storage.findOne(
      'Post',
      MatchExp.atom({ key: 'title', value: ['=', 'Test'] }),
      undefined,
      ['id', 'title', 'content']
    )
    expect(post).toBeTruthy()
    expect(post.title).toBe('Test')
  })
})
```

### WRONG: Direct storage mutation in tests
```typescript
// DON'T — bypasses all validation and business logic
const post = await system.storage.create('Post', { title: 'Test', content: 'Hello' })
```

### CORRECT:
```typescript
// Use callInteraction to test business logic
const result = await controller.callInteraction('CreatePost', {
  user: { id: 'user-1' },
  payload: { title: 'Test', content: 'Hello' }
})
```

### WHY
`storage.create` bypasses ALL validation, permissions, and reactive computations. It is acceptable ONLY for test data setup (creating prerequisite records), NEVER for testing business logic.

### Checklist
- [ ] Use `PGLiteDB` for test databases
- [ ] Call `controller.setup(true)` in `beforeEach`
- [ ] Test business logic through `callInteraction`, not direct storage
- [ ] Check `result.error` — NEVER use try-catch
- [ ] ALWAYS pass `attributeQuery` when asserting on query results
