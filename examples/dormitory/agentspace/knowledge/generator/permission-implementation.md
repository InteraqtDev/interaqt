# Permission Implementation Guide

## Overview
Permissions in interaqt are implemented through conditions in interactions. These control who can perform actions and under what circumstances.

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

// ✅ CORRECT: Use Conditions in Interaction
const CreateArticle = Interaction.create({
  name: 'CreateArticle',
  conditions: AdminRole  // Check here!
});
```

### Use MatchExp in Conditions, Not BoolExp
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

### Use boolExpToConditions for BoolExp Combinations
```typescript
// ❌ WRONG: Using BoolExp directly in conditions
conditions: BoolExp.atom(AdminRole).and(ActiveUser)

// ✅ CORRECT: Convert BoolExp to Conditions
import { boolExpToConditions } from 'interaqt';

conditions: boolExpToConditions(
  BoolExp.atom(AdminRole).and(ActiveUser)
)
```

## Key Concepts

### Condition Structure
```typescript
const MyCondition = Condition.create({
  name: 'MyCondition',
  content: async function(this: Controller, event) {
    // event: Contains user, payload, query info
    // this: Controller instance (access system, storage)
    
    // Return true for permission granted, false for denied
    return true;
  }
});
```

### Condition Usage
- **conditions**: Checks permissions and requirements BEFORE interaction execution
- Conditions can check user permissions, data state, system state, etc.

## Basic Permission Patterns

### 1. Role-Based Access
```typescript
// Simple role check
export const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'admin';
  }
});

// Multiple roles
export const OperatorOrAdminRole = Condition.create({
  name: 'OperatorOrAdminRole',
  content: async function(this: Controller, event) {
    const role = event.user?.role;
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
  conditions: AdminRole  // Only admin can delete
});
```

### 2. Data-Based Permissions
```typescript
// Check data state
export const StyleNotOffline = Condition.create({
  name: 'StyleNotOffline',
  content: async function(this: Controller, event) {
    const styleId = event.payload.style?.id || event.payload.style;
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    return style && style.status !== 'offline';
  }
});

// Style must be draft to publish
export const StyleIsDraft = Condition.create({
  name: 'StyleIsDraft',
  content: async function(this: Controller, event) {
    const styleId = event.payload.style?.id || event.payload.style;
    
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
import { BoolExp, boolExpToConditions } from 'interaqt';

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
  conditions: boolExpToConditions(
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
  conditions: boolExpToConditions(
    BoolExp.atom(AdminRole)
      .or(BoolExp.atom(OperatorRole))
      .or(BoolExp.atom(ViewerRole))
  )
});
```

### 4. Payload Validation in Conditions
```typescript
// Validate payload data within conditions
export const ValidateStyleType = Condition.create({
  name: 'ValidateStyleType',
  content: async function(this: Controller, event) {
    const styleData = event.payload?.styleData;
    if (!styleData) return false;
    
    const validTypes = ['theme', 'component', 'template'];
    return validTypes.includes(styleData.type);
  }
});

// Combine with user permission check
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleData',
        base: Style
      })
    ]
  }),
  conditions: boolExpToConditions(
    BoolExp.atom(OperatorOrAdminRole)
      .and(BoolExp.atom(ValidateStyleType))  // Validate payload in conditions
  )
});
```

## Complete Example

```typescript
import { Condition, BoolExp, boolExpToConditions, Interaction, Action, Payload, PayloadItem, MatchExp } from 'interaqt';

// Define role conditions
export const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'admin';
  }
});

export const OperatorRole = Condition.create({
  name: 'OperatorRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'operator';
  }
});

export const ViewerRole = Condition.create({
  name: 'ViewerRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'viewer';
  }
});

// Combined permission
export const OperatorOrAdminRole = Condition.create({
  name: 'OperatorOrAdminRole',
  content: async function(this: Controller, event) {
    const role = event.user?.role;
    return role === 'admin' || role === 'operator';
  }
});

// Data state conditions
export const StyleNotOffline = Condition.create({
  name: 'StyleNotOffline',
  content: async function(this: Controller, event) {
    const styleId = event.payload.style?.id || event.payload.style;
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    return style && style.status !== 'offline';
  }
});

export const StyleIsDraft = Condition.create({
  name: 'StyleIsDraft',
  content: async function(this: Controller, event) {
    const styleId = event.payload.style?.id || event.payload.style;
    
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
  conditions: OperatorOrAdminRole
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
  conditions: boolExpToConditions(
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
  conditions: AdminRole  // Admin only
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
  conditions: boolExpToConditions(
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
  // No conditions = all users can access
});
```

## MatchExp Usage in Conditions

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
const EfficientCheck = Condition.create({
  name: 'EfficientCheck',
  content: async function(this: Controller, event) {
    // Simple check first
    if (event.user.role === 'admin') {
      return true;
    }
    
    // Then database query
    const result = await this.system.storage.findOne(...);
    return !!result;
  }
});
```

### 2. Clear Error Context
```typescript
// ✅ Provide meaningful error context
const WithContext = Condition.create({
  name: 'WithContext',
  content: async function(this: Controller, event) {
    if (!event.user) {
      event.error = 'User not authenticated';
      return false;
    }
    
    if (event.user.role !== 'admin') {
      event.error = 'Admin role required';
      return false;
    }
    
    return true;
  }
});
```

### 3. Reusable Conditions
```typescript
// ✅ Generic role checker
export const RequireRole = (role: string) => Condition.create({
  name: `Require${role}Role`,
  content: async function(this: Controller, event) {
    return event.user?.role === role;
  }
});

// Use in interactions
conditions: RequireRole('admin')
```

## Important Notes on BoolExp Usage

### When to Use boolExpToConditions
```typescript
// ✅ CORRECT: When combining multiple Conditions with BoolExp
conditions: boolExpToConditions(
  BoolExp.atom(AdminRole)
    .and(BoolExp.atom(ActiveUser))
    .or(BoolExp.atom(OwnerRole))
)

// ✅ CORRECT: For simple single Condition
conditions: AdminRole

// ❌ WRONG: BoolExp without conversion
conditions: BoolExp.atom(AdminRole)
```

### BoolExp vs MatchExp
- **BoolExp**: Used ONLY for combining Conditions
- **MatchExp**: Used for database queries inside Condition content functions

```typescript
const MyCondition = Condition.create({
  name: 'MyCondition',
  content: async function(event) {
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
- [ ] All interactions have appropriate conditions
- [ ] Data validation uses conditions where needed
- [ ] MatchExp (not BoolExp) used for database queries
- [ ] BoolExp combinations wrapped with boolExpToConditions
- [ ] No permission logic in computations
- [ ] Clear error messages for permission failures
- [ ] Performance optimized (simple checks first)
- [ ] Entity references in payload use isRef: true with base 