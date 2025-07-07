# Permission Implementation Guide

## Overview
Permissions in interaqt are implemented through userAttributive and dataAttributive in interactions. These control who can perform actions and on what data.

## 🔴 CRITICAL: Common Mistakes

### Don't Check Permissions in Computations
```typescript
// ❌ WRONG: Permission check in Transform
Transform.create({
  source: CreateArticle,
  computation: async (event) => {
    if (event.user.role !== 'admin') { // Don't do this!
      throw new Error('Not allowed');
    }
    return { ... };
  }
})

// ✅ CORRECT: Use Attributives in Interaction
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  userAttributives: AdminRole  // Check here!
});
```

### Use MatchExp in Attributives, Not BoolExp
```typescript
// ❌ WRONG: Using BoolExp for queries
const post = await this.system.storage.findOne('Post',
  BoolExp.atom({ key: 'id', value: ['=', postId] })  // Wrong!
);

// ✅ CORRECT: Use MatchExp for queries
const post = await this.system.storage.findOne('Post',
  MatchExp.atom({ key: 'id', value: ['=', postId] })  // Correct!
);
```

### Use boolExpToAttributives for BoolExp Combinations
```typescript
// ❌ WRONG: Using BoolExp directly in userAttributives
userAttributives: BoolExp.atom(AdminRole).and(ActiveUser)

// ✅ CORRECT: Convert BoolExp to Attributives
import { boolExpToAttributives } from 'interaqt';

userAttributives: boolExpToAttributives(
  BoolExp.atom(AdminRole).and(ActiveUser)
)
```

## Key Concepts

### Attributive Structure
```typescript
const MyAttributive = Attributive.create({
  name: 'MyAttributive',
  content: function(targetUser, eventArgs) {
    // targetUser: Current user (in userAttributives)
    // eventArgs: Contains user, payload, query info
    // this: Controller instance (access system, globals)
    
    // Return true for permission granted, false for denied
    return true;
  }
});
```

### userAttributive vs dataAttributive
- **userAttributive**: Checks user permissions BEFORE interaction execution
- **dataAttributive**: Validates data constraints during interaction

## Basic Permission Patterns

### 1. Role-Based Access
```typescript
// Simple role check
export const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'admin';
  }
});

// Multiple roles
export const OperatorOrAdminRole = Attributive.create({
  name: 'OperatorOrAdminRole',
  content: function(targetUser, eventArgs) {
    const role = eventArgs.user?.role;
    return role === 'admin' || role === 'operator';
  }
});

// Apply to interaction
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
  }),
  userAttributives: AdminRole  // Only admin can delete
});
```

### 2. Data-Based Permissions
```typescript
// Check data state
export const StyleNotOffline = Attributive.create({
  name: 'StyleNotOffline',
  content: async function(targetUser, eventArgs) {
    const styleId = eventArgs.payload.style?.id || eventArgs.payload.style;
    const { MatchExp } = this.globals;
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    return style && style.status !== 'offline';
  }
});

// Style must be draft to publish
export const StyleIsDraft = Attributive.create({
  name: 'StyleIsDraft',
  content: async function(targetUser, eventArgs) {
    const styleId = eventArgs.payload.style?.id || eventArgs.payload.style;
    const { MatchExp } = this.globals;
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    return style && style.status === 'draft';
  }
});
```

### 3. Combining Permissions with BoolExp
```typescript
import { BoolExp, boolExpToAttributives } from 'interaqt';

// Combine multiple conditions
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
      PayloadItem.create({ name: 'description' })
    ]
  }),
  // Must be admin/operator AND style not offline
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
      .and(BoolExp.atom(StyleNotOffline))
  )
});

// OR logic
export const ViewStyle = Interaction.create({
  name: 'ViewStyle',
  action: Action.create({ name: 'viewStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true 
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminRole)
      .or(BoolExp.atom(OperatorRole))
      .or(BoolExp.atom(ViewerRole))
  )
});
```

### 4. Payload Attributives
```typescript
// Validate payload data
export const ValidStyleType = Attributive.create({
  name: 'ValidStyleType',
  content: function(styleData, eventArgs) {
    // styleData is the payload item value
    const validTypes = ['theme', 'component', 'template'];
    return validTypes.includes(styleData.type);
  }
});

// Apply to payload item
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleData',
        base: Style,
        attributives: ValidStyleType  // Validate payload
      })
    ]
  }),
  userAttributives: OperatorOrAdminRole
});
```

## Complete Example

```typescript
import { Attributive, BoolExp, boolExpToAttributives, Interaction, Action, Payload, PayloadItem } from 'interaqt';

// Define role attributives
export const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'admin';
  }
});

export const OperatorRole = Attributive.create({
  name: 'OperatorRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'operator';
  }
});

export const ViewerRole = Attributive.create({
  name: 'ViewerRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'viewer';
  }
});

// Combined permission
export const OperatorOrAdminRole = Attributive.create({
  name: 'OperatorOrAdminRole',
  content: function(targetUser, eventArgs) {
    const role = eventArgs.user?.role;
    return role === 'admin' || role === 'operator';
  }
});

// Data state attributives
export const StyleNotOffline = Attributive.create({
  name: 'StyleNotOffline',
  content: async function(targetUser, eventArgs) {
    const styleId = eventArgs.payload.style?.id || eventArgs.payload.style;
    const { MatchExp } = this.globals;
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    return style && style.status !== 'offline';
  }
});

export const StyleIsDraft = Attributive.create({
  name: 'StyleIsDraft',
  content: async function(targetUser, eventArgs) {
    const styleId = eventArgs.payload.style?.id || eventArgs.payload.style;
    const { MatchExp } = this.globals;
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    return style && style.status === 'draft';
  }
});

// Apply to interactions
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type', required: true })
    ]
  }),
  userAttributives: OperatorOrAdminRole
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
      PayloadItem.create({ name: 'description' })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
      .and(BoolExp.atom(StyleNotOffline))
  )
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
  }),
  userAttributives: AdminRole  // Admin only
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
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
      .and(BoolExp.atom(StyleIsDraft))
  )
});

// Query interactions (all roles can read)
export const GetStyles = Interaction.create({
  name: 'GetStyles',
  action: Action.create({ name: 'getStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
  // No userAttributives = all users can access
});
```

## MatchExp Usage in Attributives

### Query Operators
```typescript
// Equality
MatchExp.atom({ key: 'status', value: ['=', 'active'] })

// Inequality
MatchExp.atom({ key: 'status', value: ['!=', 'deleted'] })

// Comparison
MatchExp.atom({ key: 'age', value: ['>', 18] })
MatchExp.atom({ key: 'price', value: ['<', 100] })
MatchExp.atom({ key: 'score', value: ['>=', 60] })

// IN operator
MatchExp.atom({ key: 'role', value: ['in', ['admin', 'moderator']] })

// AND conditions
MatchExp.atom({ key: 'status', value: ['=', 'active'] })
  .and({ key: 'role', value: ['=', 'admin'] })

// OR conditions
MatchExp.atom({ key: 'role', value: ['=', 'admin'] })
  .or({ key: 'role', value: ['=', 'moderator'] })
```

## Best Practices

### 1. Performance Optimization
```typescript
// ✅ Check simple conditions first
const EfficientCheck = Attributive.create({
  name: 'EfficientCheck',
  content: async function(targetUser, eventArgs) {
    // Simple check first
    if (eventArgs.user.role === 'admin') {
      return true;
    }
    
    // Then database query
    const { MatchExp } = this.globals;
    const result = await this.system.storage.findOne(...);
    return !!result;
  }
});
```

### 2. Clear Error Context
```typescript
// ✅ Provide meaningful error context
const WithContext = Attributive.create({
  name: 'WithContext',
  content: function(targetUser, eventArgs) {
    if (!eventArgs.user) {
      eventArgs.error = 'User not authenticated';
      return false;
    }
    
    if (eventArgs.user.role !== 'admin') {
      eventArgs.error = 'Admin role required';
      return false;
    }
    
    return true;
  }
});
```

### 3. Reusable Attributives
```typescript
// ✅ Generic role checker
export const RequireRole = (role: string) => Attributive.create({
  name: `Require${role}Role`,
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === role;
  }
});

// Use in interactions
userAttributives: RequireRole('admin')
```

## Important Notes on BoolExp Usage

### When to Use boolExpToAttributives
```typescript
// ✅ CORRECT: When combining multiple Attributives with BoolExp
userAttributives: boolExpToAttributives(
  BoolExp.atom(AdminRole)
    .and(BoolExp.atom(ActiveUser))
    .or(BoolExp.atom(OwnerRole))
)

// ✅ CORRECT: For simple single Attributive
userAttributives: AdminRole

// ❌ WRONG: BoolExp without conversion
userAttributives: BoolExp.atom(AdminRole)
```

### BoolExp vs MatchExp
- **BoolExp**: Used ONLY for combining Attributives
- **MatchExp**: Used for database queries inside Attributive content functions

```typescript
const MyAttributive = Attributive.create({
  name: 'MyAttributive',
  content: async function(targetUser, eventArgs) {
    // ✅ Use MatchExp for queries
    const result = await this.system.storage.findOne('Entity',
      MatchExp.atom({ key: 'id', value: ['=', id] })
    );
    
    // ❌ DON'T use BoolExp for queries
    // const result = await this.system.storage.findOne('Entity',
    //   BoolExp.atom({ key: 'id', value: ['=', id] })
    // );
    
    return !!result;
  }
});
```

## Validation Checklist
- [ ] All interactions have appropriate userAttributives
- [ ] Data validation uses dataAttributives where needed
- [ ] MatchExp (not BoolExp) used for database queries
- [ ] BoolExp combinations wrapped with boolExpToAttributives
- [ ] No permission logic in computations
- [ ] Clear error messages for permission failures
- [ ] Performance optimized (simple checks first)
- [ ] Entity references in payload use isRef: true with base 