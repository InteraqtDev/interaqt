# Permission Implementation Guide

## Overview
Permissions in interaqt are implemented through conditions in interactions. These control who can perform actions and under what circumstances.

**Important**: Conditions can return:
- `true` - Permission granted
- `false` - Permission denied (generic error)  
- A string - Permission denied with specific error message (recommended)

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
const CheckMyPost = Condition.create({
  content: async function(this: Controller, event) {
    // BoolExp is for logic, not queries!
    return BoolExp.atom({ author: event.user })  
  }
})

// ✅ CORRECT: Use MatchExp for queries
const CheckMyPost = Condition.create({
  content: async function(this: Controller, event) {
    const post = await this.system.storage.findOne('Post',
      MatchExp.atom({ key: 'author', value: ['=', event.user] })
    )
    return !!post;
  }
})
```

### Use Conditions.create for BoolExp Combinations
Remember to wrap BoolExp combinations with Conditions.create:

```typescript
import { Conditions } from 'interaqt';

conditions: Conditions.create({
  content: BoolExp.atom(isAdmin).and(isActive)
})
```

## Basic Role-Based Permissions

### 1. Define Role Conditions
```typescript
import { Condition, BoolExp, Conditions, Interaction, Action, Payload, PayloadItem, MatchExp } from 'interaqt';

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
export const OperatorOrAdmin = Condition.create({
  name: 'OperatorOrAdmin',
  content: async function(this: Controller, event) {
    const role = event.user?.role;
    return role === 'admin' || role === 'operator';
  }
});
```

### 2. Apply to Interactions
```typescript
// Admin-only action
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true  
      })
    ]
  }),
  conditions: AdminRole  // Direct condition
});

// Multiple roles allowed
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  conditions: OperatorOrAdmin  // Combined condition
});
```

## Advanced Permission Patterns

### 1. Resource Ownership
```typescript
// Check if user owns the resource
export const OwnerOnly = Condition.create({
  name: 'OwnerOnly',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id;
    if (!styleId) return 'Style ID is required';
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['creator']  // Must include creator field
    );
    
    if (style?.creator?.id !== event.user?.id) {
      return 'You can only modify your own styles';
    }
    
    return true;
  }
});

// Combine with role check
import { BoolExp, Conditions } from 'interaqt';

export const DeleteOwnStyle = Interaction.create({
  name: 'DeleteOwnStyle',
  action: Action.create({ name: 'deleteOwnStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(OwnerOnly).or(BoolExp.atom(AdminRole))
  })
});
```

### 2. Context-Based Permissions
```typescript
// Check resource state
export const PublishedOnly = Condition.create({
  name: 'PublishedOnly',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id;
    if (!styleId) return 'Style ID is required';
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,  
      ['status']  // Include status field
    );
    
    if (style?.status !== 'published') {
      return 'Style must be published to perform this action';
    }
    
    return true;
  }
});

// Apply to interaction
export const ShareStyle = Interaction.create({
  name: 'ShareStyle',
  action: Action.create({ name: 'shareStyle' }),
  conditions: Conditions.create({
    content: BoolExp.atom(PublishedOnly).and(BoolExp.atom(OperatorOrAdmin))
  })
});
```

### 3. Dynamic Permissions
```typescript
// Permission based on user's department
export const SameDepartment = Condition.create({
  name: 'SameDepartment',
  content: async function(this: Controller, event) {
    const targetUserId = event.payload?.targetUser?.id;
    if (!targetUserId) return 'Target user ID is required';
    if (!event.user?.department) return 'Your department information is missing';
    
    const targetUser = await this.system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', targetUserId] }),
      undefined,
      ['department']
    );
    
    if (targetUser?.department !== event.user.department) {
      return 'You can only perform this action on users in your department';
    }
    
    return true;
  }
});
```

### 4. Payload Validation in Conditions
```typescript
// Validate payload data within conditions
export const ValidateStyleType = Condition.create({
  name: 'ValidateStyleType',
  content: async function(this: Controller, event) {
    const styleData = event.payload?.styleData;
    if (!styleData) return 'Style data is required';
    
    const validTypes = ['theme', 'component', 'template'];
    if (!validTypes.includes(styleData.type)) {
      return `Invalid style type '${styleData.type}'. Must be one of: ${validTypes.join(', ')}`;
    }
    
    return true;
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
  conditions: Conditions.create({
    content: BoolExp.atom(OperatorOrAdminRole).and(BoolExp.atom(ValidateStyleType))
  })
});
```

## Real-World Example
```typescript
import { Condition, BoolExp, Conditions, Interaction, Action, Payload, PayloadItem, MatchExp } from 'interaqt';

// Basic conditions
export const AuthenticatedUser = Condition.create({
  name: 'AuthenticatedUser',
  content: async function(this: Controller, event) {
    if (!event.user || !event.user.id) {
      return 'Authentication required';
    }
    return true;
  }
});

export const ActiveUser = Condition.create({
  name: 'ActiveUser',
  content: async function(this: Controller, event) {
    if (event.user?.status !== 'active') {
      return 'Your account is not active';
    }
    return true;
  }
});

export const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: Controller, event) {
    if (event.user?.role !== 'admin') {
      return 'Admin privileges required';
    }
    return true;
  }
});

// Resource conditions
export const StyleExists = Condition.create({
  name: 'StyleExists',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id;
    if (!styleId) return 'Style ID is required';
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['id']
    );
    
    if (!style) {
      return 'Style not found';
    }
    
    return true;
  }
});

export const StyleNotOffline = Condition.create({
  name: 'StyleNotOffline',
  content: async function(this: Controller, event) {
    const styleId = event.payload?.style?.id;
    if (!styleId) return 'Style ID is required';
    
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['status']
    );
    
    if (style?.status === 'offline') {
      return 'Cannot perform this action on offline styles';
    }
    
    return true;
  }
});

// Complex interaction with multiple conditions
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AuthenticatedUser)
      .and(BoolExp.atom(ActiveUser))
      .and(BoolExp.atom(AdminRole))
      .and(BoolExp.atom(StyleExists))
      .and(BoolExp.atom(StyleNotOffline))
  })
});

// Alternative: Define combined condition
export const CanPublishStyle = Conditions.create({
  content: BoolExp.atom(AuthenticatedUser)
    .and(BoolExp.atom(ActiveUser))
    .and(BoolExp.atom(AdminRole))
    .and(BoolExp.atom(StyleExists))
    .and(BoolExp.atom(StyleNotOffline))
});

export const PublishStyleAlt = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publish' }),
  conditions: CanPublishStyle  // Reusable condition
});
```

## Best Practices

### 1. Condition Efficiency
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
// ✅ Create generic, reusable conditions
export const RequireRole = (role: string) => Condition.create({
  name: `Require${role}Role`,
  content: async function(this: Controller, event) {
    return event.user?.role === role;
  }
});

// Use in multiple places
const AdminOnly = RequireRole('admin');
const OperatorOnly = RequireRole('operator');
```

### When to Use Conditions.create
```typescript
// Use when combining multiple conditions with BoolExp
conditions: Conditions.create({
  content: BoolExp.atom(condition1)
    .and(BoolExp.atom(condition2))
    .or(BoolExp.atom(condition3))
})

// Single condition can be used directly
conditions: AdminRole
```

## Security Checklist
- [ ] Authentication check (user exists)
- [ ] Authorization check (user has permission)
- [ ] Resource existence validation
- [ ] Resource state validation
- [ ] Payload data validation
- [ ] BoolExp combinations wrapped with Conditions.create
- [ ] Efficient condition ordering (simple checks first)
- [ ] Clear error messages for debugging 