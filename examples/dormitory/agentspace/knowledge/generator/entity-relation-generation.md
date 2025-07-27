# Entity and Relation Generation Guide

## Overview
This guide explains how to generate entities and relations from use cases in the interaqt framework.

## 🔴 CRITICAL: Common Mistakes to Avoid

### Entity Mistakes
```typescript
// ❌ WRONG: Importing User from interaqt
import { User, Entity } from 'interaqt';

// ✅ CORRECT: Define your own entities
import { Entity, Property } from 'interaqt';
const User = Entity.create({ name: 'User', properties: [...] });
```

### Relation Mistakes
```typescript
// ❌ WRONG: Specifying relation name
const UserPostRelation = Relation.create({
  name: 'UserPost',  // DON'T do this!
  source: User,
  target: Post,
  type: 'n:1'
});

// ✅ CORRECT: Name is auto-generated
const UserPostRelation = Relation.create({
  source: User,
  target: Post,
  type: 'n:1'  // Valid types: '1:1', '1:n', 'n:1', 'n:n'
});
```

## Key Principles

### 1. Entity Generation
- Identify core business objects from requirements
- Each entity should represent a distinct concept
- Properties should be atomic and well-typed

### 2. Relation Generation
- Relations connect entities meaningfully
- Consider cardinality (1:1, 1:n, n:n)
- Relations can have their own properties

## Step-by-Step Process

### Step 1: Entity Definition

#### Basic Entity Structure
```typescript
import { Entity, Property } from 'interaqt';

const User = Entity.create({
  name: 'User',  // PascalCase, singular
  properties: [
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'role', type: 'string' })
  ]
});
```

#### Property Types
- **Basic types**: `'string'`, `'number'`, `'boolean'`
- **Complex types**: `'object'` (for JSON data)
- **Collections**: Set `collection: true` for arrays

```typescript
Property.create({ 
  name: 'tags', 
  type: 'string',
  collection: true  // Array of strings
})
```

#### Default Values (MUST be functions)
```typescript
// ❌ WRONG
Property.create({ 
  name: 'status', 
  type: 'string',
  defaultValue: 'active'  // Must be function!
});

// ✅ CORRECT
Property.create({ 
  name: 'status', 
  type: 'string',
  defaultValue: () => 'active'
});

// Dynamic defaults
Property.create({ 
  name: 'createdAt', 
  type: 'timestamp',
  defaultValue: () => Math.floor(Date.now()/1000)
});
```

### Step 2: Relation Definition

#### Relation Types
- **1:1** - One-to-one (User ↔ Profile)
- **n:1** - Many-to-one (Posts → User)
- **1:n** - One-to-many (User → Posts)
- **n:n** - Many-to-many (Users ↔ Tags)

#### Basic Relation
```typescript
// One user has many styles
const UserStyleRelation = Relation.create({
  source: User,
  target: Style,
  type: 'n:1'  // Many styles to one user
  // NO name property - it's auto-generated!
});
```

#### Relation with Properties
```typescript
// User creates Style with metadata
const UserStyleRelation = Relation.create({
  source: User,
  target: Style,
  type: 'n:1',
  properties: [
    Property.create({ 
      name: 'createdAt', 
      type: 'timestamp',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});
```

### Step 3: Analysis Process

#### From Use Cases to Entities
1. **Extract nouns** as potential entities:
   - "User creates style" → User, Style
   - "Admin publishes version" → User (admin), Version
   - "Style has versions" → Style, Version

2. **Identify properties** from data requirements:
   - Style: label, slug, description, type, status, priority
   - Version: data, isActive, publishedAt
   - User: name, email, role

3. **Determine relations** from interactions:
   - User creates Style → UserStyleRelation (n:1)
   - Style has Versions → StyleVersionRelation (n:n)
   - User publishes Version → UserVersionRelation (n:1)

## Complete Example

```typescript
import { Entity, Property, Relation } from 'interaqt';

// Entities
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' })
  ]
});

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'thumbKey', type: 'string' }),
    Property.create({ name: 'priority', type: 'number', defaultValue: () => 0 }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'updatedAt', type: 'timestamp', defaultValue: () => Math.floor(Date.now()/1000) })
  ]
});

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'data', type: 'object' }),  // Style snapshot
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'publishedAt', type: 'bigint', defaultValue: () => Date.now() })
  ]
});

// Relations
export const UserStyleRelation = Relation.create({
  source: User,
  target: Style,
  type: 'n:1'  // User's lastModifiedBy
});

export const StyleVersionRelation = Relation.create({
  source: Style,
  target: Version,
  type: 'n:n',  // Style has many versions
  properties: [
    Property.create({ 
      name: 'createdAt', 
      type: 'timestamp',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});

export const UserVersionRelation = Relation.create({
  source: User,
  target: Version,
  type: 'n:1'  // Version's publishedBy
});
```

## Common Patterns
- User-Content relations (author, owner)
- Status tracking (draft, published, archived)
- Timestamp properties (createdAt, updatedAt)
- Soft delete patterns (isDeleted, deletedAt)

## Filtered Entities

Filtered entities are derived entities that automatically filter records from a source entity based on specific conditions. They are useful for creating logical subsets of data without duplicating storage.

### Creating Filtered Entities

```typescript
const PublishedStyle = Entity.create({
  name: 'PublishedStyle',
  sourceEntity: Style,  // The entity to filter from
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});
```

### FilterCondition Property Type

The `filterCondition` uses `MatchExp` expressions to define filtering criteria:

#### Basic Conditions
```typescript
// Single condition
filterCondition: MatchExp.atom({
  key: 'status',
  value: ['=', 'active']
})

// Numeric comparison
filterCondition: MatchExp.atom({
  key: 'priority',
  value: ['>', 5]
})

// Pattern matching
filterCondition: MatchExp.atom({
  key: 'email',
  value: ['like', '%@admin.com']
})
```

#### Complex Conditions
```typescript
// AND conditions
filterCondition: MatchExp.atom({
  key: 'status',
  value: ['=', 'published']
}).and({
  key: 'priority',
  value: ['>=', 10]
})

// OR conditions
filterCondition: MatchExp.atom({
  key: 'type',
  value: ['=', 'premium']
}).or({
  key: 'featured',
  value: ['=', true]
})

// Combined AND/OR
filterCondition: MatchExp.atom({
  key: 'status',
  value: ['=', 'active']
}).and({
  key: 'createdAt',
  value: ['>', Math.floor(Date.now()/1000) - 86400]  // Last 24 hours in seconds
}).or({
  key: 'isPinned',
  value: ['=', true]
})
```

#### Available Operators
- `['=', value]` - Equals
- `['!=', value]` - Not equals
- `['>', value]` - Greater than
- `['<', value]` - Less than
- `['>=', value]` - Greater than or equal
- `['<=', value]` - Less than or equal
- `['like', pattern]` - Pattern matching (% for wildcard)
- `['in', array]` - Value in array
- `['between', [min, max]]` - Value in range
- `['not', null]` - Not null check

### Practical Examples

#### Active Users
```typescript
const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  }).and({
    key: 'lastLoginDate',
    value: ['>', Date.now() - 7 * 24 * 60 * 60 * 1000]  // Last 7 days
  })
});
```

#### High Priority Styles
```typescript
const HighPriorityStyle = Entity.create({
  name: 'HighPriorityStyle',
  sourceEntity: Style,
  filterCondition: MatchExp.atom({
    key: 'priority',
    value: ['>=', 8]
  }).and({
    key: 'status',
    value: ['!=', 'archived']
  })
});
```

#### Premium or Featured Content
```typescript
const FeaturedContent = Entity.create({
  name: 'FeaturedContent',
  sourceEntity: Article,
  filterCondition: MatchExp.atom({
    key: 'type',
    value: ['=', 'premium']
  }).or({
    key: 'featured',
    value: ['=', true]
  }).or({
    key: 'editorPick',
    value: ['=', true]
  })
});
```

### Filtering from Relations
You can also create filtered entities from relations:

```typescript
const RecentUserPost = Entity.create({
  name: 'RecentUserPost',
  sourceEntity: UserPostRelation,
  filterCondition: MatchExp.atom({
    key: 'createdAt',
    value: ['>', Math.floor(Date.now()/1000) - 30 * 24 * 60 * 60]  // Last 30 days in seconds
  })
});
```

### Important Notes
- Filtered entities are read-only views - you cannot create records directly in them
- They automatically update when the source entity changes
- Use them for queries and computations, not for direct data manipulation
- They share the same storage as the source entity (no data duplication)
- Properties are inherited from the source entity

## Validation Checklist
- [ ] All entity names are PascalCase and singular
- [ ] All properties have correct types
- [ ] All defaultValues are functions, not static values
- [ ] No relation has a name property (auto-generated)
- [ ] Relation types use correct format ('1:1', 'n:1', etc.)
- [ ] No entities are imported from interaqt package
- [ ] Filtered entities have valid sourceEntity and filterCondition
- [ ] TypeScript compilation passes 