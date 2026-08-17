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

Property `type` is a **closed built-in set** plus optional **explicit extensions**.
Unknown strings (including database plugin names such as `vector`) are rejected at
`Property.create` — they are never silently pasted into DDL.

### Built-in types

| Logical `type` | Typical column role |
|----------------|---------------------|
| `string` | Text |
| `number` | Numeric |
| `boolean` | Boolean |
| `timestamp` | Dialect timestamp binding (epoch-ms at the application boundary) |
| `object` | Structured JSON (`json` is an accepted alias of `object`) |
| `id` | Relation-endpoint / foreign-key style id column |

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean' }),
    Property.create({ name: 'createdAt', type: 'timestamp' }),
    Property.create({ name: 'createdAtIso', type: 'string' }) // ISO strings if you prefer text
  ]
});
```

### JSON / object type

For structured payloads stored as JSON columns, use `object` (or the `json` alias):

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({
      name: 'profile',
      type: 'object',  // JSON object column
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

Nested application shapes (addresses, settings bags) are still `type: 'object'` —
there is no separate “custom structural type” keyword. Model nested *entities*
with Relation when they need identity and links.

### Extended property types (`definePropertyType`)

Database plugin columns (for example PostgreSQL + pgvector) are **not** built-ins.
Register a logical name with `definePropertyType` **before** any
`Property.create({ type: thatName })`, then declare storage per dialect:

```typescript
import { definePropertyType, Property, Entity } from 'interaqt'

// Side-effect registration — must run before Property.create uses this name.
definePropertyType({
  name: 'vector',
  validateArgs(args) {
    const d = (args as { dimensions?: unknown } | undefined)?.dimensions
    if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
      throw new Error('type "vector" requires args.dimensions as a positive integer')
    }
  },
  storage: {
    postgres: {
      fieldType: (ctx) => `vector(${(ctx.args as { dimensions: number }).dimensions})`,
      // Optional codecs; provide both or neither (opaque pass-through).
      // toDB / fromDB / match — see below
    },
    // sqlite / mysql omitted → setup on those drivers fails with a dialect-binding error
  }
})

const Document = Entity.create({
  name: 'Document',
  properties: [
    Property.create({
      name: 'embedding',
      type: 'vector',
      args: { dimensions: 1536 }
    })
  ]
})
```

Contract summary:

1. **Property columns only.** Extended types drive Entity/Relation property DDL,
   write/read codecs, and optional Match compilers. They do **not** turn
   `Dictionary` into a native column (Dictionary stays a fixed JSON key/value table —
   see `11-global-dictionaries.md`).
2. **Import order.** Call `definePropertyType` (or import an adapter that does)
   before any `Property.create` that uses the extended name.
3. **`args`.** Built-in types must omit `args`. Extended types may declare
   `args` and validate them via `validateArgs`.
4. **Dialect storage.** Each driver dialect you support needs
   `storage.<postgres|sqlite|mysql>` with a non-empty `fieldType` string or
   function. Missing dialect storage fails at setup with an actionable error.
5. **Codecs.** Omit both `toDB` and `fromDB` for opaque pass-through; provide
   both for a symmetric codec. One-sided registration is rejected.
6. **Match is not free.** Having a column does **not** enable `=`, `in`,
   `contains`, or any other operator. Register each operator under
   `storage.<dialect>.match` (see `12-data-querying.md`). Unregistered operators
   fail at Match compile time.
7. **No silent DDL passthrough.** Drivers no longer accept unknown logical types
   as raw SQL type strings. Extensions must go through `definePropertyType` +
   setup field-type resolution.

Three separate type universes (do not mix them):

| Surface | What `type` means | Extension path |
|---------|-------------------|----------------|
| `Property.create` | Logical column type (builtin ∪ registered) | `definePropertyType` |
| `Dictionary.create` | Logical value metadata only (builtin **only**) | None — values live in `_Dictionary_.value` JSON |
| `PayloadItem.create` | Runtime payload validation tags | None — separate whitelist (`string`/`number`/`boolean`/`object`/`Entity`/`Relation`) |

### Structured object shapes (not extended types)

```javascript
// Address is an application-level shape stored as JSON — still type: 'object'
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
      defaultValue: () => 'active'
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'isVerified', 
      type: 'boolean',
      defaultValue: () => false
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
      defaultValue: () => 'pending'
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
    Property.create({ name: 'taxRate', type: 'number', defaultValue: () => 0.1 }),
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

### UniqueConstraint vs Entity.identity

Declare uniqueness on the entity. Do **not** emit application `CREATE TABLE` or dialect SQL as a second persistence backend.

| Declaration | Conflict meaning | Use when |
|-------------|------------------|----------|
| `UniqueConstraint` | Typed `ConstraintViolationError`; the whole dispatch rolls back | A duplicate is a data/programmer error (for example a unique email that must not silently reuse the existing row) |
| `Entity.identity` | **Set-semantic observe**: resolve to the stored row, drop this attempt's payload, emit no create event, dispatch has no error | Handshake tokens, redemption codes, at-least-once ingest — the second writer must see the first rather than fail |

Identity properties are total (`NOT NULL`), unique, and immutable. At most one identity per ordinary entity. Do not declare both identity and UniqueConstraint on the **same** property set. Filtered/merged entities cannot declare identity. MySQL fail-fasts at setup (identity insert uses `ON CONFLICT`, and `Controller.dispatch` is unavailable on MySQL).

```javascript
const HandshakeToken = Entity.create({
  name: 'HandshakeToken',
  identity: { name: 'byKey', properties: ['ns', 'token'] },
  properties: [
    Property.create({ name: 'ns', type: 'string' }),
    Property.create({ name: 'token', type: 'string' }),
    Property.create({ name: 'payload', type: 'string' }),
    Property.create({ name: 'holder', type: 'string' }),
  ],
});
```

`identity.name` is a local label for errors and docs (two entities may both use `'byKey'`). It is not a UniqueConstraint logical name.

Admission `Condition` checks remain valid for permissions, but they are **not** a substitute for identity under concurrent registration: locking a key that has no row obtains no lock. The official occupancy recipe (Transform register + StateMachine consume + `Entity.retention`) is in [15-entity-crud-patterns.md](./15-entity-crud-patterns.md).

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
      defaultValue: () => 'active'
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
      defaultValue: () => ({})
    }),
    Property.create({ 
      name: 'tags', 
      type: 'string',
      collection: true,
      defaultValue: () => []
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