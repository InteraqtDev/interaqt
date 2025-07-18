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
        name: 'styleId',      // Reference to style to update
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
        name: 'styleId',
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
        name: 'styleId',
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
        name: 'styleId',
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
        name: 'styleId',
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
        name: 'styleId',
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
        name: 'versionId',
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
        name: 'styleId',
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


## Validation Checklist
- [ ] All user actions have corresponding interactions
- [ ] Action only contains name (no logic)
- [ ] Payload items have appropriate required flags
- [ ] Collections use isCollection: true
- [ ] No permissions or constraints included
- [ ] TypeScript compilation passes 