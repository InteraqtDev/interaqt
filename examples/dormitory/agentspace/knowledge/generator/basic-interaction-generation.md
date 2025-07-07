# Basic Interaction Generation Guide

## Overview
This guide covers generating basic interactions without permissions (userAttributive/dataAttributive).

## 🔴 CRITICAL: Common Mistakes to Avoid

### Action Misconception
```typescript
// ❌ WRONG: Action is NOT operational logic
const CreatePost = Action.create({
  name: 'createPost',
  execute: async () => { /* ... */ },  // No execute method!
  handler: () => { /* ... */ }          // No handler either!
});

// ✅ CORRECT: Action is just an identifier
const CreatePost = Action.create({
  name: 'createPost'  // That's it!
});
```

### User Property Mistake
```typescript
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
```

### Entity Reference Mistake
```typescript
// ❌ WRONG: Using plain 'id' without proper reference
const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'id',  // Just an id field - NOT a proper entity reference
        required: true 
      })
    ]
  })
});

// ✅ CORRECT: Using isRef with base for entity reference
const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,     // Specify which entity
        isRef: true,     // This is a reference to existing entity
        required: true 
      })
    ]
  })
});
```

## Key Concepts

### What is an Interaction?
- User-triggered actions that modify system state
- The ONLY way to create, update, or delete data
- Contains: name, action (identifier), payload (parameters)
- NO operational logic - that's handled by Computations

### Basic Structure
```typescript
import { Interaction, Action, Payload, PayloadItem } from 'interaqt';

export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),  // Just an identifier
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'label',
        required: true
      }),
      PayloadItem.create({
        name: 'slug',
        required: true
      })
    ]
  })
  // NO userAttributive or dataAttributive in basic version
});
```

## Payload Definition

### PayloadItem Properties
- `name`: Parameter name (required)
- `required`: Whether parameter is required (default: false)
- `isCollection`: Whether it's an array (default: false)
- `isRef`: Whether it's a reference with id (default: false)
- `base`: Reference to Entity (normally optional. required when isRef is set to true)

## 🔴 CRITICAL: Entity References

When your interaction needs to reference an existing entity (by ID), you MUST use `isRef: true` with `base`:

### ❌ WRONG: Plain ID Field
```typescript
// This is just a plain field named 'id' - framework doesn't know it's an entity reference
PayloadItem.create({ 
  name: 'id',
  required: true 
})

// Also wrong - using custom id field names
PayloadItem.create({ 
  name: 'styleId',
  required: true 
})
```

### ✅ CORRECT: Proper Entity Reference
```typescript
// This tells the framework we're referencing an existing Style entity
PayloadItem.create({ 
  name: 'style',      // Descriptive name
  base: Style,        // Which entity type
  isRef: true,        // This is a reference (expects { id: '...' })
  required: true 
})

// For arrays of references
PayloadItem.create({ 
  name: 'styles',
  base: Style,
  isRef: true,
  isCollection: true  // Array of style references
})
```

### Why This Matters
1. **Type Safety**: Framework knows which entity type you're referencing
2. **Validation**: Can validate the referenced entity exists
3. **Computation Target**: StateMachine and other computations can properly identify target entities
4. **Clarity**: Code is self-documenting about what's being referenced

### Simple Parameters (No Entity Reference)
```typescript
PayloadItem.create({ 
  name: 'title', 
  required: true 
})

PayloadItem.create({ 
  name: 'priority',
  required: false  // Optional
})

PayloadItem.create({ 
  name: 'tags',
  isCollection: true  // Array of simple values
})
```

### Entity References
```typescript
// Reference to existing entity (needs id)
PayloadItem.create({ 
  name: 'style',
  base: Style,
  isRef: true,
  required: true
})

// Reference to existing user
PayloadItem.create({ 
  name: 'author',
  base: User,
  isRef: true,
  required: true
})
```

## Common Interaction Patterns

### Create Pattern
```typescript
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
});
```

### Update Pattern
```typescript
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',      // Reference to style to update
        base: Style,
        isRef: true,
        required: true 
      }),
      // Only include updatable fields
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
});
```

### Delete Pattern
```typescript
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

### State Change Pattern
```typescript
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

### Query Pattern
```typescript
export const GetStyles = Interaction.create({
  name: 'GetStyles',
  action: Action.create({ name: 'getStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

export const GetStyleDetail = Interaction.create({
  name: 'GetStyleDetail',
  action: Action.create({ name: 'getStyleDetail' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

## Complete Example

```typescript
import { Interaction, Action, Payload, PayloadItem } from 'interaqt';
import { Style, Version, User } from '../entities';

// Style Management Interactions
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
});

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
});

export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const UpdateStyleOrder = Interaction.create({
  name: 'UpdateStyleOrder',
  action: Action.create({ name: 'updateStyleOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'updates',
        isCollection: true,  // Array of updates
        required: true 
      })
    ]
  })
});

// Version Management
export const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',
  action: Action.create({ name: 'rollbackVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'version',
        base: Version,
        isRef: true,
        required: true 
      })
    ]
  })
});

// Query Interactions
export const GetStyles = Interaction.create({
  name: 'GetStyles',
  action: Action.create({ name: 'getStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
});

export const GetStyleDetail = Interaction.create({
  name: 'GetStyleDetail',
  action: Action.create({ name: 'getStyleDetail' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const GetVersionHistory = Interaction.create({
  name: 'GetVersionHistory',
  action: Action.create({ name: 'getVersionHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

## Important Notes

### DO NOT Include in Basic Interactions
- userAttributive (permissions)
- dataAttributive (data constraints)
- Complex validation logic
- Side effects or computations
- Operational logic in Actions

### Focus On
- Clear interaction naming
- Complete payload definitions
- Correct data types
- Required field marking
- Proper entity references with isRef and base
- One interaction per user action

## Common Mistakes Summary

### ❌ WRONG Patterns
```typescript
// Wrong: Plain id field without entity reference
PayloadItem.create({ name: 'id', required: true })
PayloadItem.create({ name: 'styleId', required: true })
PayloadItem.create({ name: 'userId', required: true })

// Wrong: Missing base when isRef is true
PayloadItem.create({ name: 'style', isRef: true })
```

### ✅ CORRECT Patterns
```typescript
// Correct: Proper entity references
PayloadItem.create({ 
  name: 'style',
  base: Style,
  isRef: true,
  required: true 
})

PayloadItem.create({ 
  name: 'user',
  base: User,
  isRef: true,
  required: true 
})

// Correct: Simple fields (not entity references)
PayloadItem.create({ name: 'label', required: true })
PayloadItem.create({ name: 'priority' })
```

## Validation Checklist
- [ ] All user actions have corresponding interactions
- [ ] Action only contains name (no logic)
- [ ] Payload items have appropriate required flags
- [ ] Entity references ALWAYS use base and isRef: true
- [ ] No plain 'id' fields for entity references
- [ ] Collections use isCollection: true
- [ ] No permissions or constraints included
- [ ] TypeScript compilation passes 