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
      computation: Count.create({ record: UserPosts })
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
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true })
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
  activities: [],
  interactions: [CreatePost],
  dict: [],
  recordMutationSideEffects: []
})

await controller.setup(true)

// --- Usage ---

const adminUser = await system.storage.create('User', {
  name: 'Alice', email: 'alice@example.com'
})

const result = await controller.callInteraction('CreatePost', {
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
- **Count on `postCount`**: Automatically maintained when UserPosts relations change. No manual update logic needed.
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

// --- Interactions ---

const SubmitOrder = Interaction.create({
  name: 'SubmitOrder',
  action: Action.create({ name: 'submitOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'product', required: true }),
      PayloadItem.create({ name: 'quantity', required: true })
    ]
  })
})

const PayOrder = Interaction.create({
  name: 'PayOrder',
  action: Action.create({ name: 'payOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', base: Order, isRef: true, required: true })
    ]
  })
})

const ShipOrder = Interaction.create({
  name: 'ShipOrder',
  action: Action.create({ name: 'shipOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', base: Order, isRef: true, required: true })
    ]
  })
})

const CancelOrder = Interaction.create({
  name: 'CancelOrder',
  action: Action.create({ name: 'cancelOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', base: Order, isRef: true, required: true })
    ]
  })
})

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
            trigger: PayOrder,
            computeTarget: (event) => ({ id: event.payload.orderId })
          }),
          StateTransfer.create({
            current: paidState, next: shippedState,
            trigger: ShipOrder,
            computeTarget: (event) => ({ id: event.payload.orderId })
          }),
          StateTransfer.create({
            current: pendingState, next: cancelledState,
            trigger: CancelOrder,
            computeTarget: (event) => ({ id: event.payload.orderId })
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

// --- Controller Setup & Usage ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [Order],
  relations: [],
  activities: [],
  interactions: [SubmitOrder, PayOrder, ShipOrder, CancelOrder],
  dict: [],
  recordMutationSideEffects: []
})
await controller.setup(true)

const user = { id: 'user-1' }

// Submit order
const submitResult = await controller.callInteraction('SubmitOrder', {
  user,
  payload: { product: 'Widget', quantity: 3 }
})

const order = await system.storage.findOne('Order',
  MatchExp.atom({ key: 'product', value: ['=', 'Widget'] }),
  undefined, ['id', 'status', 'product', 'quantity']
)
// order.status === 'pending'

// Pay order
await controller.callInteraction('PayOrder', {
  user,
  payload: { orderId: order.id }
})
// order.status → 'paid'

// Ship order
await controller.callInteraction('ShipOrder', {
  user,
  payload: { orderId: order.id }
})
// order.status → 'shipped'
```

## Design Decisions
- **StateMachine on `status` property**: Status transitions are declarative. The framework enforces valid transitions — you cannot jump from `pending` to `shipped` directly.
- **`computeTarget`**: Each StateTransfer uses `computeTarget` to identify WHICH order the transition applies to, using the orderId from the interaction payload.
- **Transform on Entity `computation`**: Creates order records reactively when `SubmitOrder` fires.
- **Cancellation only from `pending`**: Only one `cancelledState` transfer is defined (from `pending`). Attempting to cancel a paid order will have no effect.

---

# Recipe: Student GPA with Weighted Summation

## Scenario
A student grading system where each student has grades for multiple subjects, each with different credit weights. The student's GPA is automatically computed using WeightedSummation.

## Complete Implementation

```typescript
import {
  Entity, Property, Relation, WeightedSummation, Count,
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
        record: StudentGrades,
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
      computation: WeightedSummation.create({
        record: StudentGrades,
        attributeQuery: [['target', { attributeQuery: ['credit'] }]],
        callback: (relation) => ({
          weight: 1,
          value: relation.target.credit
        })
      })
    }),
    Property.create({
      name: 'courseCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({ record: StudentGrades })
    })
  ]
})

const Grade = Entity.create({
  name: 'Grade',
  properties: [
    Property.create({ name: 'subject', type: 'string' }),
    Property.create({ name: 'score', type: 'number' }),
    Property.create({ name: 'credit', type: 'number' })
  ]
})

// --- Relations ---

const StudentGrades = Relation.create({
  source: Student,
  sourceProperty: 'grades',
  target: Grade,
  targetProperty: 'student',
  type: '1:n'
})

// --- Controller Setup & Usage ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [Student, Grade],
  relations: [StudentGrades],
  activities: [],
  interactions: [],
  dict: [],
  recordMutationSideEffects: []
})
await controller.setup(true)

const student = await system.storage.create('Student', { name: 'Alice' })

await system.storage.create('Grade', { subject: 'Math', score: 90, credit: 4, student: student.id })
await system.storage.create('Grade', { subject: 'English', score: 80, credit: 3, student: student.id })

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
- **WeightedSummation for GPA**: The `weight` is the credit value, and the `value` is the score. The framework computes `sum(weight*value) / sum(weight)` automatically.
- **Separate Count for courseCount**: Even though totalCredits could imply count, Count is more efficient and semantically clear for counting.
- **`attributeQuery` in computation**: Specifies which fields of related records to fetch, avoiding loading unnecessary data.

---

# Recipe: Interaction with Payload Validation

## Scenario
A content moderation system where only published posts can be shared. Demonstrates Attributive-based payload validation on interactions.

## Complete Implementation

```typescript
import {
  Entity, Property,
  Interaction, Action, Payload, PayloadItem,
  Attributive, BoolExp,
  Controller, MonoSystem, PGLiteDB, KlassByName, MatchExp
} from 'interaqt'

// --- Entities ---

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: 'draft' })
  ]
})

// --- Attributive (validation rule) ---

const PublishedPost = Attributive.create({
  name: 'PublishedPost',
  content: function(post, eventArgs) {
    return post.status === 'published'
  }
})

// --- Interaction with validation ---

const SharePost = Interaction.create({
  name: 'SharePost',
  action: Action.create({ name: 'sharePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'post',
        base: Post,
        isRef: true,
        required: true,
        attributives: PublishedPost
      })
    ]
  })
})

// --- Controller Setup & Usage ---

const system = new MonoSystem(new PGLiteDB())
system.conceptClass = KlassByName

const controller = new Controller({
  system,
  entities: [Post],
  relations: [],
  activities: [],
  interactions: [SharePost],
  dict: [],
  recordMutationSideEffects: []
})
await controller.setup(true)

const draftPost = await system.storage.create('Post', { title: 'Draft', status: 'draft' })
const publishedPost = await system.storage.create('Post', { title: 'Published', status: 'published' })

// Sharing a draft post fails validation
const failResult = await controller.callInteraction('SharePost', {
  user: { id: 'user-1' },
  payload: { post: { id: draftPost.id } }
})
// failResult.error is defined — draft post cannot be shared

// Sharing a published post succeeds
const successResult = await controller.callInteraction('SharePost', {
  user: { id: 'user-1' },
  payload: { post: { id: publishedPost.id } }
})
// successResult.error is undefined — success
```

## Design Decisions
- **Attributive on PayloadItem**: The `PublishedPost` attributive is attached directly to the PayloadItem, so the framework validates the referenced entity's data before the interaction proceeds.
- **`isRef: true`**: The payload contains only an ID reference. The framework loads the full record and runs the attributive check against it.
- **Error in result, not exception**: Validation failures are returned in `result.error`, consistent with all interaqt error handling.
