# interaqt Recipes

> Complete runnable scenarios. Read this when building a feature from scratch.

---

# Recipe: Blog with Author Stats

## Scenario
A blog system where users author posts. Each user has an auto-maintained `postCount` property. Demonstrates Entity, Relation (1:n), Count computation, Interaction-driven entity creation via Transform, and querying with nested attributeQuery.

## Complete Implementation

```typescript
import {
  Entity, Property, Relation, Count,
  Interaction, Action, Payload, PayloadItem,
  Transform, InteractionEventEntity,
  Controller, MonoSystem, PGLiteDB, KlassByName, MatchExp
} from 'interaqt'

// --- Entities ---

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({
      name: 'postCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({ property: 'posts' })
    })
  ]
})

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user', 'payload'],
    callback: function(event) {
      if (event.interactionName === 'CreatePost') {
        return {
          title: event.payload.title,
          content: event.payload.content,
          createdAt: new Date().toISOString(),
          author: { id: event.user.id }
        }
      }
      return null
    }
  })
})

// --- Relations ---

const UserPosts = Relation.create({
  source: Post,
  sourceProperty: 'author',
  target: User,
  targetProperty: 'posts',
  type: 'n:1'
})

// --- Interactions ---

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

// --- Controller Setup ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [User, Post],
  relations: [UserPosts],
  eventSources: [CreatePost],
  dict: [],
  recordMutationSideEffects: []
})

await controller.setup(true)

// --- Usage ---

const adminUser = await system.storage.create('User', {
  name: 'Alice', email: 'alice@example.com'
})

const result = await controller.dispatch(CreatePost, {
  user: adminUser,
  payload: { title: 'First Post', content: 'Hello World' }
})

const user = await system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'id', value: ['=', adminUser.id] }),
  undefined,
  ['id', 'name', 'postCount', ['posts', { attributeQuery: ['id', 'title'] }]]
)
// user.postCount === 1
// user.posts[0].title === 'First Post'
```

## Design Decisions
- **Count on `postCount`**: Uses `property: 'posts'` to count related Post records via the `posts` navigation property. Automatically maintained when UserPosts relations change — no manual update logic needed.
- **Transform on Post entity**: Posts are created reactively when `CreatePost` interaction fires. The Transform checks `interactionName` and returns entity data.
- **Relation direction**: `source: Post, target: User, type: 'n:1'` — many posts to one user. `sourceProperty: 'author'` lets you navigate from Post to User; `targetProperty: 'posts'` lets you navigate from User to Posts.

---

# Recipe: Order Workflow with State Machine

## Scenario
An order system with status transitions: pending → paid → shipped → delivered, plus cancellation. Demonstrates StateMachine, StateNode, StateTransfer, and multiple Interactions triggering state changes.

## Complete Implementation

```typescript
import {
  Entity, Property,
  Interaction, Action, Payload, PayloadItem,
  Transform, InteractionEventEntity,
  StateMachine, StateNode, StateTransfer,
  Controller, MonoSystem, PGLiteDB, KlassByName, MatchExp
} from 'interaqt'

// --- State Nodes ---

const pendingState = StateNode.create({ name: 'pending' })
const paidState = StateNode.create({ name: 'paid' })
const shippedState = StateNode.create({ name: 'shipped' })
const deliveredState = StateNode.create({ name: 'delivered' })
const cancelledState = StateNode.create({ name: 'cancelled' })

// --- Entity ---

const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ name: 'product', type: 'string' }),
    Property.create({ name: 'quantity', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'pending',
      computation: StateMachine.create({
        states: [pendingState, paidState, shippedState, deliveredState, cancelledState],
        transfers: [
          StateTransfer.create({
            current: pendingState, next: paidState,
            trigger: {
              recordName: InteractionEventEntity.name,
              type: 'create',
              record: { interactionName: 'PayOrder' }
            },
            computeTarget: function(mutationEvent) {
              return { id: mutationEvent.record.payload.orderId }
            }
          }),
          StateTransfer.create({
            current: paidState, next: shippedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              type: 'create',
              record: { interactionName: 'ShipOrder' }
            },
            computeTarget: function(mutationEvent) {
              return { id: mutationEvent.record.payload.orderId }
            }
          }),
          StateTransfer.create({
            current: pendingState, next: cancelledState,
            trigger: {
              recordName: InteractionEventEntity.name,
              type: 'create',
              record: { interactionName: 'CancelOrder' }
            },
            computeTarget: function(mutationEvent) {
              return { id: mutationEvent.record.payload.orderId }
            }
          })
        ],
        initialState: pendingState
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user', 'payload'],
    callback: function(event) {
      if (event.interactionName === 'SubmitOrder') {
        return {
          product: event.payload.product,
          quantity: event.payload.quantity,
          createdAt: new Date().toISOString()
        }
      }
      return null
    }
  })
})

// --- Interactions ---

const SubmitOrder = Interaction.create({
  name: 'SubmitOrder',
  action: Action.create({ name: 'submitOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'product', type: 'string', required: true }),
      PayloadItem.create({ name: 'quantity', type: 'number', required: true })
    ]
  })
})

const PayOrder = Interaction.create({
  name: 'PayOrder',
  action: Action.create({ name: 'payOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', base: Order, isRef: true, required: true })
    ]
  })
})

const ShipOrder = Interaction.create({
  name: 'ShipOrder',
  action: Action.create({ name: 'shipOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', base: Order, isRef: true, required: true })
    ]
  })
})

const CancelOrder = Interaction.create({
  name: 'CancelOrder',
  action: Action.create({ name: 'cancelOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', type: 'string', base: Order, isRef: true, required: true })
    ]
  })
})

// --- Controller Setup & Usage ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [Order],
  relations: [],
  eventSources: [SubmitOrder, PayOrder, ShipOrder, CancelOrder],
  dict: [],
  recordMutationSideEffects: []
})
await controller.setup(true)

const user = { id: 'user-1' }

// Submit order
const submitResult = await controller.dispatch(SubmitOrder, {
  user,
  payload: { product: 'Widget', quantity: 3 }
})

const order = await system.storage.findOne('Order',
  MatchExp.atom({ key: 'product', value: ['=', 'Widget'] }),
  undefined, ['id', 'status', 'product', 'quantity']
)
// order.status === 'pending'

// Pay order
await controller.dispatch(PayOrder, {
  user,
  payload: { orderId: order.id }
})
// order.status → 'paid'

// Ship order
await controller.dispatch(ShipOrder, {
  user,
  payload: { orderId: order.id }
})
// order.status → 'shipped'
```

## Design Decisions
- **StateMachine on `status` property**: Status transitions are declarative. The framework enforces valid transitions — you cannot jump from `pending` to `shipped` directly.
- **`trigger` is a pattern object**: Each StateTransfer `trigger` is a `RecordMutationEventPattern` that matches against InteractionEvent creation events — it is NOT an Interaction instance. The `record.interactionName` field matches the specific interaction by name string.
- **`computeTarget`**: Receives the `RecordMutationEvent` and returns which order the transition applies to. Access the InteractionEvent data via `mutationEvent.record` (e.g. `mutationEvent.record.payload.orderId`).
- **Transform on Entity `computation`**: Creates order records reactively when `SubmitOrder` fires.
- **Cancellation only from `pending`**: Only one `cancelledState` transfer is defined (from `pending`). Attempting to cancel a paid order will have no effect.
- **Declaration order**: Order entity is defined before the Interactions that reference it (via `base: Order`). The StateMachine triggers use interaction name strings (not variable references), avoiding circular dependencies.

---

# Recipe: Student GPA with Weighted Summation

## Scenario
A student grading system where each student has grades for multiple subjects, each with different credit weights. The student's GPA is automatically computed using WeightedSummation. Grades are added via an Interaction to ensure computations trigger correctly.

## Complete Implementation

```typescript
import {
  Entity, Property, Relation,
  WeightedSummation, Summation, Count,
  Interaction, Action, Payload, PayloadItem,
  Transform, InteractionEventEntity,
  Controller, MonoSystem, PGLiteDB, KlassByName, MatchExp
} from 'interaqt'

// --- Entities ---

const Student = Entity.create({
  name: 'Student',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'gpa',
      type: 'number',
      defaultValue: () => 0,
      computation: WeightedSummation.create({
        property: 'grades',
        direction: 'source',
        attributeQuery: [['target', { attributeQuery: ['score', 'credit'] }]],
        callback: (relation) => ({
          weight: relation.target.credit,
          value: relation.target.score
        })
      })
    }),
    Property.create({
      name: 'totalCredits',
      type: 'number',
      defaultValue: () => 0,
      computation: Summation.create({
        property: 'grades',
        direction: 'source',
        attributeQuery: [['target', { attributeQuery: ['credit'] }]]
      })
    }),
    Property.create({
      name: 'courseCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({ property: 'grades' })
    })
  ]
})

const Grade = Entity.create({
  name: 'Grade',
  properties: [
    Property.create({ name: 'subject', type: 'string' }),
    Property.create({ name: 'score', type: 'number' }),
    Property.create({ name: 'credit', type: 'number' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: function(event) {
      if (event.interactionName === 'AddGrade') {
        return {
          subject: event.payload.subject,
          score: event.payload.score,
          credit: event.payload.credit,
          student: { id: event.payload.studentId }
        }
      }
      return null
    }
  })
})

// --- Relations ---

const StudentGrades = Relation.create({
  source: Student,
  sourceProperty: 'grades',
  target: Grade,
  targetProperty: 'student',
  type: '1:n'
})

// --- Interactions ---

const AddGrade = Interaction.create({
  name: 'AddGrade',
  action: Action.create({ name: 'addGrade' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'studentId', type: 'string', required: true }),
      PayloadItem.create({ name: 'subject', type: 'string', required: true }),
      PayloadItem.create({ name: 'score', type: 'number', required: true }),
      PayloadItem.create({ name: 'credit', type: 'number', required: true })
    ]
  })
})

// --- Controller Setup & Usage ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [Student, Grade],
  relations: [StudentGrades],
  eventSources: [AddGrade],
  dict: [],
  recordMutationSideEffects: []
})
await controller.setup(true)

const student = await system.storage.create('Student', { name: 'Alice' })

await controller.dispatch(AddGrade, {
  user: { id: 'system' },
  payload: { studentId: student.id, subject: 'Math', score: 90, credit: 4 }
})
await controller.dispatch(AddGrade, {
  user: { id: 'system' },
  payload: { studentId: student.id, subject: 'English', score: 80, credit: 3 }
})

const result = await system.storage.findOne('Student',
  MatchExp.atom({ key: 'id', value: ['=', student.id] }),
  undefined,
  ['id', 'name', 'gpa', 'totalCredits', 'courseCount']
)
// result.gpa === (90*4 + 80*3) / (4+3) ≈ 85.7
// result.totalCredits === 7
// result.courseCount === 2
```

## Design Decisions
- **WeightedSummation for GPA**: Uses `property: 'grades'` (property-level mode) to aggregate per-student. The `weight` is the credit value, and the `value` is the score. The framework computes `sum(weight*value) / sum(weight)` automatically.
- **Summation for totalCredits**: Uses `Summation` (not `WeightedSummation`) because `totalCredits` is a simple sum. `WeightedSummation` with `weight=1` would compute an average, not a sum.
- **Count for courseCount**: More efficient and semantically clear for counting than Summation or WeightedSummation.
- **Grades added via Interaction + Transform**: Using `controller.dispatch` ensures reactive computations (WeightedSummation, Summation, Count) are triggered. Direct `storage.create` bypasses reactive computations and should only be used for prerequisite data (like creating the Student record).

---

# Recipe: Interaction with Condition Validation

## Scenario
A content moderation system where only published posts can be shared. Demonstrates Condition-based validation on Interactions: the framework checks the condition before allowing the interaction to proceed.

## Complete Implementation

```typescript
import {
  Entity, Property,
  Interaction, Action, Payload, PayloadItem,
  Condition,
  Controller, MonoSystem, PGLiteDB, KlassByName, MatchExp
} from 'interaqt'

// --- Entities ---

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' })
  ]
})

// --- Interaction with condition ---

const SharePost = Interaction.create({
  name: 'SharePost',
  action: Action.create({ name: 'sharePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'post',
        type: 'string',
        base: Post,
        isRef: true,
        required: true
      })
    ]
  }),
  conditions: Condition.create({
    name: 'postMustBePublished',
    content: async function(event) {
      const post = await this.system.storage.findOne('Post',
        MatchExp.atom({ key: 'id', value: ['=', event.payload.post] }),
        undefined,
        ['id', 'status']
      )
      return post?.status === 'published'
    }
  })
})

// --- Controller Setup & Usage ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [Post],
  relations: [],
  eventSources: [SharePost],
  dict: [],
  recordMutationSideEffects: []
})
await controller.setup(true)

const draftPost = await system.storage.create('Post', { title: 'Draft', status: 'draft' })
const publishedPost = await system.storage.create('Post', { title: 'Published', status: 'published' })

// Sharing a draft post fails the condition check
const failResult = await controller.dispatch(SharePost, {
  user: { id: 'user-1' },
  payload: { post: draftPost.id }
})
// failResult.error is defined — condition rejected: post is not published

// Sharing a published post succeeds
const successResult = await controller.dispatch(SharePost, {
  user: { id: 'user-1' },
  payload: { post: publishedPost.id }
})
// successResult.error is undefined — success
```

## Design Decisions
- **Condition on Interaction**: The `Condition.create` is attached to the Interaction's `conditions` field. The `content` function receives the event args and returns `true` to allow or `false` to reject. The `this` context is bound to the Controller, providing access to `this.system.storage` for database queries.
- **`isRef: true`**: The payload contains only an ID reference. With `isRef: true`, the payload value is the entity ID directly (e.g., `payload: { post: draftPost.id }`).
- **Error in result, not exception**: Condition failures return `{ error: { type: 'condition check failed' } }`, consistent with all interaqt error handling. Never use try-catch.
