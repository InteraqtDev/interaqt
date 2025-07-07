# How to Define Entities and Properties

## Creating Basic Entities

Entities are the fundamental data units in the system. Use the `Entity.create()` method to create entities:

```javascript
import { Entity, Property } from 'interaqt';

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'age', type: 'number' })
  ]
});
```

### Entity Naming Conventions

- Use PascalCase (capitalized camelCase)
- Names should be singular (User not Users)
- Names should be descriptive and clearly express the entity's meaning

```javascript
// ✅ Good naming
const User = Entity.create({ name: 'User' });
const BlogPost = Entity.create({ name: 'BlogPost' });
const OrderItem = Entity.create({ name: 'OrderItem' });

// ❌ Avoid these naming patterns
const users = Entity.create({ name: 'users' });
const data = Entity.create({ name: 'data' });
const obj = Entity.create({ name: 'obj' });
```

## Defining Property Types

### Basic Types

The framework supports multiple basic data types:

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean' }),
    Property.create({ name: 'createdAt', type: 'string' }) // Can store ISO date strings
  ]
});
```

### JSON Type

For complex data structures, you can use JSON type:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ 
      name: 'profile', 
      type: 'object',  // JSON object
      collection: false 
    }),
    Property.create({ 
      name: 'tags', 
      type: 'string',
      collection: true  // Array of strings
    })
  ]
});

// Usage example
const userData = {
  name: 'John Doe',
  profile: {
    bio: 'Software developer',
    location: 'San Francisco',
    skills: ['JavaScript', 'TypeScript', 'React']
  },
  tags: ['developer', 'javascript', 'react']
};
```

### Custom Types

You can define custom complex types:

```javascript
// Define address type
const Address = {
  street: 'string',
  city: 'string',
  country: 'string',
  zipCode: 'string'
};

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ 
      name: 'address', 
      type: 'object',
      collection: false
    })
  ]
});
```

## Setting Default Values

### Static Default Values

Set fixed default values for properties:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: 'active'
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: 0
    }),
    Property.create({ 
      name: 'isVerified', 
      type: 'boolean',
      defaultValue: false
    })
  ]
});
```

### Dynamic Default Values (Functions)

Use functions to generate dynamic default values:

```javascript
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ 
      name: 'orderNumber', 
      type: 'string',
      defaultValue: () => `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: 'pending'
    })
  ]
});
```

### Default Values Based on Other Fields

You can set default values based on other fields in the same record:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    Property.create({ 
      name: 'displayName', 
      type: 'string',
      defaultValue: (record) => `${record.firstName} ${record.lastName}`
    }),
    Property.create({ 
      name: 'email', 
      type: 'string'
    }),
    Property.create({ 
      name: 'username', 
      type: 'string',
      defaultValue: (record) => record.email.split('@')[0]
    })
  ]
});
```

## Using Computed Properties

Computed properties are one of the core features of the framework. Their values are automatically updated when other data changes.

### getValue Function

Use the `getValue` function to define simple computed properties:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    Property.create({
      name: 'fullName',
      type: 'string',
      getValue: (record) => `${record.firstName} ${record.lastName}`
    })
  ]
});
```

### Computations Based on Current Record

Computed properties can access all fields of the current record:

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'taxRate', type: 'number', defaultValue: 0.1 }),
    Property.create({
      name: 'totalPrice',
      type: 'number',
      getValue: (record) => record.price * (1 + record.taxRate)
    }),
    Property.create({
      name: 'priceCategory',
      type: 'string',
      getValue: (record) => {
        if (record.price < 100) return 'budget';
        if (record.price < 500) return 'mid-range';
        return 'premium';
      }
    })
  ]
});
```

### Persisting Computed Properties

By default, computed properties are not stored in the database but calculated dynamically at query time. If you need to persist computation results (e.g., for performance optimization), you can use reactive computations:

```javascript
import { Count } from 'interaqt';

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computation: Count.create({
        record: Like  // This will be persisted to the database
      })
    })
  ]
});
```

## Property Configuration Options

### Required Fields

Set fields as required:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'email', 
      type: 'string',
    }),
    Property.create({ 
      name: 'name', 
      type: 'string',
    }),
    Property.create({ 
      name: 'bio', 
      type: 'string',
    })
  ]
});
```

### Constraints and Validation

The framework itself does not provide field-level unique constraints and index configuration. These should be implemented at the database level or through business logic:

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'email', 
      type: 'string'
      // Uniqueness guaranteed through business logic or database constraints
    }),
    Property.create({ 
      name: 'username', 
      type: 'string'
      // Same as above
    })
  ]
});
```

If you need to perform uniqueness checks at the application level, you can implement them through the Attributive system:

```javascript
const UniqueEmailAttributive = Attributive.create({
  name: 'UniqueEmail',
  content: async function(user, { system }) {
    const existingUser = await system.storage.findOne('User', 
      MatchExp.atom({ key: 'email', value: ['=', user.email] })
    );
    return !existingUser || existingUser.id === user.id;
  }
});
```

## Complete Example

Here's a complete example of a user entity definition:

```javascript
import { Entity, Property } from 'interaqt';

const User = Entity.create({
  name: 'User',
  properties: [
    // Basic information
    Property.create({ 
      name: 'email', 
      type: 'string',
    }),
    Property.create({ 
      name: 'firstName', 
      type: 'string',
    }),
    Property.create({ 
      name: 'lastName', 
      type: 'string',
    }),
    
    // Computed properties
    Property.create({
      name: 'fullName',
      type: 'string',
      getValue: (record) => `${record.firstName} ${record.lastName}`
    }),
    
    // Fields with default values
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: 'active'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    
    // JSON fields
    Property.create({ 
      name: 'profile', 
      type: 'object',
      collection: false,
      defaultValue: {}
    }),
    Property.create({ 
      name: 'tags', 
      type: 'string',
      collection: true,
      defaultValue: []
    }),
    
    // Optional fields
    Property.create({ 
      name: 'bio', 
      type: 'string',
    }),
    Property.create({ 
      name: 'avatar', 
      type: 'string',
    })
  ]
});

export { User };
``` 