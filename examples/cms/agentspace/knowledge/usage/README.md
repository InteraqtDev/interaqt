# interaqt Framework Learning Guide

⚠️ **Important: Please follow the learning order below. Skipping any step may lead to misunderstanding**

## 📚 Required Reading Order

### 1. 🧠 [Mindset Shift](./00-mindset-shift.md) **← Most Important!**
Before learning anything else, you **must** first understand the mindset shift from imperative to declarative thinking. This is the key to understanding interaqt.

### 2. 🎯 [Core Concepts](./01-core-concepts.md)
Understand the basic concepts and reactive mechanisms of the framework.

### 3. 🏗️ [Define Entities & Properties](./02-define-entities-properties.md)
Learn how to define data structures.

### 4. 🔗 [Entity Relations](./03-entity-relations.md)
Understand relationships between entities.

### 5. ⚡ [Reactive Computations](./04-reactive-computations.md)
Master declarative data computation.

### 6. 🎮 [Interactions](./05-interactions.md)
Learn how to define user interactions (Remember: Action is just an identifier!).

### 7. 🔐 [Attributive Permissions](./06-attributive-permissions.md)
Understand how to control access permissions.

### 8. 📋 [Activities](./07-activities.md)
Design complex business processes.

### 9. 🎪 [Other Advanced Features](./08-filtered-entities.md)
Filtered entities, async computations, etc.

### 10. 📖 [API Reference](./13-api-reference.md)
Detailed API documentation.

## ⚠️ Common Misconceptions

### Misconception 1: Treating Action as Operation Function
```javascript
// ❌ Wrong: Thinking Action contains operational logic
const CreatePost = Action.create({
  name: 'createPost',
  handler: () => { /* operational logic */ }  // Action has no handler!
});

// ✅ Correct: Action is just an identifier
const CreatePost = Action.create({
  name: 'createPost'  // That's it
});
```

### Misconception 2: Trying to Operate Data in Interactions
```javascript
// ❌ Wrong: Trying to write data operation logic somewhere
const CreatePost = Interaction.create({
  name: 'CreatePost',
  onExecute: async (payload) => {  // Interaction has no onExecute!
    // Trying to write creation logic here...
  }
});

// ✅ Correct: Declare data existence through reactive computations
const UserPostRelation = Relation.create({
  computedData: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreatePost') {
        return { /* post data */ };
      }
    }
  })
});
```

### Misconception 3: Asking Wrong Questions
```javascript
// ❌ Wrong question:
// "When user creates a post, how should I update the user's post count?"

// ✅ Correct question:
// "What is the essence of user's post count?"
// Answer: Count of user-post relations

Property.create({
  name: 'postCount',
  computedData: Count.create({
    record: UserPostRelation
  })
});
```

## 🔥 Core Points

1. **Only Interactions generate data**: All other data are computed results of Interactions
2. **Action is identifier**: Contains no operational logic
3. **Declare data essence**: Don't think "how to compute", think "what data is"
4. **Unidirectional data flow**: Interaction → Event → Transform/Count → Data
5. **Never operate data**: Only declare data existence conditions

## 🎯 Learning Goals

After completing these documents, you should be able to:

- ✅ Understand declarative vs imperative differences
- ✅ Correctly use Interaction and Action
- ✅ Declare data relationships with reactive computations
- ✅ Avoid writing operational logic in wrong places
- ✅ Establish correct mental model of data flow

Remember: **Stop thinking "how to do", start thinking "what is"**!

## 📚 Complete Learning Path

### Core Concepts
1. [Mindset Shift](./00-mindset-shift.md) - Understanding declarative thinking
2. [Core Concepts](./01-core-concepts.md) - Framework fundamentals
3. [Define Entities & Properties](./02-define-entities-properties.md) - Data structure definition
4. [Entity Relations](./03-entity-relations.md) - Relationships between entities

### Reactive System
5. [Reactive Computations](./04-reactive-computations.md) - Declarative data computation
6. [Interactions](./05-interactions.md) - User interaction definition
7. [Attributive Permissions](./06-attributive-permissions.md) - Access control
8. [Activities](./07-activities.md) - Complex business processes

### Advanced Features
9. [Filtered Entities](./08-filtered-entities.md) - Entity filtering and views
10. [Async Computations](./09-async-computations.md) - Asynchronous operations
11. [Global Dictionaries](./10-global-dictionaries.md) - Global state management
12. [Data Querying](./11-data-querying.md) - Advanced query patterns

### Reference
13. [Testing](./12-testing.md) - Testing strategies
14. [API Reference](./13-api-reference.md) - Complete API documentation
15. [CRUD Patterns](./14-entity-crud-patterns.md) - Common patterns
16. [Frontend Integration](./15-frontend-page-design-guide.md) - UI integration
17. [Performance Optimization](./16-performance-optimization.md) - Performance tips

## 📞 Need Help?

If you find yourself still thinking about "how to operate data", please re-read [Mindset Shift](./00-mindset-shift.md). This mindset shift is a prerequisite for using interaqt. 