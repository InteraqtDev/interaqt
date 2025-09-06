# Core Concepts and Reactive Mechanism Overview

## ⚠️ Read First: Mindset Shift

**Before learning interaqt, please read [00-mindset-shift.md](./00-mindset-shift.md) first, as this is crucial for understanding the framework.**

If you continue to use traditional imperative thinking ("how to operate data") with interaqt, you will not be able to realize its true value. interaqt requires a fundamental mindset shift: from "operating data" to "declaring the essence of data".

## Core Philosophy of the Framework

interaqt is a **declarative reactive** backend framework with the core philosophy:

> **Stop thinking about "how to operate data", start thinking about "what data essentially is"**

### Core Principle: Only Interactions Generate Data, Everything Else is a "Shadow" of Data

In interaqt:
- **Only user interactions can generate new data**
- **All other data are computation results of interaction data**
- **Never try to "operate" data, only "declare" what data is**

### Basic Paradigm: data = computation(events)

#### ❌ Traditional Imperative Thinking (Wrong)
```javascript
// Wrong: trying to operate data
async function likePost(userId, postId) {
  // 1. Create like record
  await createLike(userId, postId);
  // 2. Manually update like count
  const likeCount = await countLikes(postId);
  await updatePost(postId, { likeCount });
  // 3. Notify related users
  await notifyPostAuthor(postId);
}
```

This thinking asks: "When a user likes a post, what operations do I need to execute?"

#### ✅ interaqt Declarative Thinking (Correct)
```javascript
// Correct: declare what data is
const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title' }),
    Property.create({
      name: 'likeCount',
      // Like count "is" the number of like relationships
      computation: Count.create({
        record: LikeRelation
      })
    })
  ]
});

// Like interaction only declares that users can like, containing no operational logic
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),  // Just an identifier!
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// Like relationship existence "is" a response to like interactions
const LikeRelation = Relation.create({
  source: User,
  target: Post,
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'LikePost') {
        return {
          source: event.user.id,
          target: event.payload.postId
        };
      }
    }
  })
});
```

This thinking asks: "What is like count essentially? When should like relationships exist?"

When a user likes a post, the system automatically:
1. Creates like relationship (because Transform declares it should exist)
2. Updates like count (because Count declares it's the number of like relationships)
3. Triggers any other computations that depend on like count

**You don't need to write any "update" logic!**

## Core Concepts

### Entity
Basic units of data, such as User, Post, Comment, etc.

### Property
Fields of entities, can be simple values or automatically computed values based on other data.

### Relation
Connections between entities, such as like relationships between users and posts.

### Interaction
Events triggered by users, the **only source** of data changes in the system. Interactions only declare "what users can do", containing no operational logic.

### Action
⚠️ **Important Clarification**: Action is not an "operation", but an **identifier** for interaction types, like event names. It contains no execution logic.

### Computation
Automatically computed values based on other data, the core of reactivity. Includes Count, Transform, Every, Any, StateMachine, etc.

### Activity
Ordered combinations of multiple related Interactions, implementing complex business processes.

## How Reactive Computation Works

1. **Event Source**: All data changes originate from user Interactions
2. **Change Tracking**: System automatically generates change events
3. **Dependency Graph**: Computations declare dependencies on which data
4. **Automatic Propagation**: When dependent data changes, related computations automatically re-execute
5. **Incremental Computation**: Uses incremental algorithms to avoid full recalculation, ensuring performance

## Typical Use Cases

- **Content Systems**: Articles, comments, like statistics
- **Social Networks**: Friend relationships, feed updates
- **Approval Workflows**: Multi-step, multi-role collaboration
- **E-commerce Systems**: Order status, inventory calculation 