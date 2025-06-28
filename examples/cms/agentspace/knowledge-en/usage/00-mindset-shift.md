# Mindset Shift: From Imperative to Declarative

## ⚠️ Important: Please understand this core concept before learning interaqt

The interaqt framework requires a fundamental **mindset shift**. If you continue to use traditional imperative thinking with this framework, you will not be able to realize its true value.

## Core Principle: Only Interactions Create Data, Everything Else is a "Shadow" of Data

### Traditional Thinking vs interaqt Thinking

#### ❌ Traditional Imperative Thinking (Wrong)
```javascript
// Wrong mindset: What do I need to "do"
function createPost(title, content, authorId) {
  // 1. Create post
  const post = db.posts.create({ title, content, authorId });
  // 2. Update user's post count
  db.users.update(authorId, { postCount: postCount + 1 });
  // 3. If it's a hot tag, update popularity
  if (isHotTag(post.tags)) {
    db.tags.update(post.tags, { hotness: hotness + 1 });
  }
  // 4. Notify followers
  notifyFollowers(authorId, post);
}
```

This thinking asks: "When a user creates a post, what series of operations do I need to execute?"

#### ✅ interaqt Declarative Thinking (Correct)
```javascript
// Correct mindset: What do I need to "declare" data to be

// 1. User post count "is" the Count of posts created by the user
const User = Entity.create({
  properties: [
    Property.create({
      name: 'postCount',
      computedData: Count.create({
        record: UserPostRelation
      })
    })
  ]
});

// 2. Tag popularity "is" the Count of posts containing that tag
const Tag = Entity.create({
  properties: [
    Property.create({
      name: 'hotness',
      computedData: Count.create({
        record: PostTagRelation
      })
    })
  ]
});

// 3. Follower notifications "are" a Transform of follow relationships
const Notification = Entity.create({
  computedData: Transform.create({
    record: InteractionEvent,  // Listen to all interaction events
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        // Return notification data that should be created
        return generateNotifications(event);
      }
    }
  })
});

// 4. Interactions only "declare" what users can do, containing no operational logic
const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'createPost' }), // Just an identifier!
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', required: true }),
      PayloadItem.create({ name: 'content', required: true })
    ]
  })
});
```

This thinking asks: "Post count is the count of posts, tag popularity is the count of posts containing that tag"

## Key Concept Clarification

### Action is Not an "Operation", It's an "Identifier"

**❌ Wrong Understanding:**
```javascript
// LLMs often think this way: Action contains operational logic
const Action = Action.create({
  name: 'createPost',
  execute: async (payload) => {  // ❌ There's no execute method at all!
    // Write operational logic here...
  }
});
```

**✅ Correct Understanding:**
```javascript
// Action is just an identifier, like giving this interaction a name
const Action = Action.create({
  name: 'createPost'  // That's all! No logic whatsoever!
});
```

Action is like naming an event type, such as "UserClicked" or "OrderSubmitted". It contains no execution logic.

### Data "Existence" vs "Operations"

#### ❌ Imperative Thinking: I need to operate on data
```javascript
// Wrong: trying to "update" data somewhere
function likePost(userId, postId) {
  // 1. Create like record
  createLike(userId, postId);
  // 2. Update post like count  ❌ Don't do this!
  const likeCount = countLikes(postId);
  updatePost(postId, { likeCount });
}
```

#### ✅ Declarative Thinking: Data "is" a computation result
```javascript
// Correct: declare that like count is the count of like relationships
const Post = Entity.create({
  properties: [
    Property.create({
      name: 'likeCount',
      computedData: Count.create({
        record: LikeRelation  // Like count "is" the number of like relationships
      })
    })
  ]
});

// Like interaction only declares what action users can perform
const LikePost = Interaction.create({
  name: 'LikePost',
  action: Action.create({ name: 'likePost' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// The existence of like relationship itself responds to like interactions
const LikeRelation = Relation.create({
  source: User,
  target: Post,
  computedData: Transform.create({
    record: InteractionEvent,
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

## Unidirectional Data Flow

### Data flow in interaqt is strictly unidirectional:

```
Interaction (User Interaction)
    ↓
InteractionEvent (Interaction Event)
    ↓
Transform/Count/Every/Any (Reactive Computation)
    ↓
Entity/Relation Data
    ↓
More Reactive Computations
    ↓
Final Business Data
```

**Never try to operate in reverse!**

## Real Example: E-commerce Order System

### ❌ Traditional Imperative Thinking
```javascript
function placeOrder(userId, items) {
  // 1. Create order
  const order = createOrder(userId, items);
  // 2. Reduce inventory
  items.forEach(item => {
    reduceStock(item.productId, item.quantity);
  });
  // 3. Update user order count
  incrementUserOrderCount(userId);
  // 4. Update product sales
  items.forEach(item => {
    incrementProductSales(item.productId, item.quantity);
  });
}
```

### ✅ interaqt Declarative Thinking
```javascript
// 1. Product inventory "is" initial stock minus quantities in all orders
const Product = Entity.create({
  properties: [
    Property.create({ name: 'initialStock', type: 'number' }),
    Property.create({
      name: 'currentStock',
      computedData: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (orderItem) => ({
          weight: -1,  // Reduce inventory
          value: orderItem.quantity
        })
      })
    }),
    Property.create({
      name: 'totalSales',
      computedData: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (orderItem) => ({
          weight: 1,
          value: orderItem.quantity
        })
      })
    })
  ]
});

// 2. User order count "is" the Count of user's orders
const User = Entity.create({
  properties: [
    Property.create({
      name: 'orderCount',
      computedData: Count.create({
        record: UserOrderRelation
      })
    })
  ]
});

// 3. Place order interaction only declares that users can place orders
const PlaceOrder = Interaction.create({
  name: 'PlaceOrder',
  action: Action.create({ name: 'placeOrder' }),  // Just an identifier!
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'items', isCollection: true }),
      PayloadItem.create({ name: 'address' })
    ]
  })
});

// 4. Order existence responds to place order interactions
const UserOrderRelation = Relation.create({
  source: User,
  target: Order,
  computedData: Transform.create({
    record: InteractionEvent,
    callback: (event) => {
      if (event.interactionName === 'PlaceOrder') {
        return {
          source: event.user.id,
          target: {
            items: event.payload.items,
            address: event.payload.address,
            status: 'pending'
          }
        };
      }
    }
  })
});
```

## Key Mental Models

### 1. Interactions are "Seeds" of Data
- Only Interactions can generate new data
- All other data are "derivatives" of Interaction data

### 2. Actions are "Event Type Labels"
- Actions are like event names, containing no logic
- They just tell the system "what type of event occurred"

### 3. Data "Exists" Rather Than "Being Operated On"
- Don't think "how to modify data"
- Think "what this data essentially is"

### 4. Everything is a "Function"
- User post count = Count(user's post relationships)
- Product inventory = Initial stock - Count(product quantities in orders)
- Notifications = Transform(interaction events)

## Exercise: Transform Your Thinking

When you want to implement a feature, ask yourself:

### ❌ Don't Ask:
- "When user does X, what data do I need to update?"
- "Where should I write the update logic?"
- "How do I ensure data consistency?"

### ✅ Should Ask:
- "What computation result is this data essentially?"
- "What other data does this data depend on?"
- "What kind of interaction event should this user operation generate?"

Once you establish this mindset, the power of the interaqt framework will emerge:
- Data is always consistent
- Business logic is clear and maintainable
- Automatically handles complex dependencies
- Naturally supports real-time updates

Remember: **Stop thinking about "how to do", start thinking about "what it is"**. 