# Complete API Exports Reference

This document lists all available exports from the 'interaqt' package. Use this as a reference to understand what's available and avoid importing non-existent items.

## Core Exports

```javascript
import {
  // Entity-related
  Entity,
  Property,
  
  // Relation-related
  Relation,
  
  // Interaction-related
  Interaction,
  Action,
  Payload,
  PayloadItem,
  
  // Activity-related
  Activity,
  
  // Computation-related
  Count,
  Every,
  Any,
  Average,
  Sum,
  Summation,
  WeightedSummation,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  RealTime,
  MathResolver,
  
  // Attributive and Conditions
  Attributive,
  Attributives,
  Condition,
  Conditions,
  
  // Expression and Matching
  BoolExp,
  MatchExp,
  Expression,
  Inequality,
  Equation,
  
  // Storage and Query
  Controller,
  MonoSystem,
  
  // Dictionary (Global State)
  Dictionary,
  
  // Special Entities
  InteractionEventEntity,  // NOT InteractionEvent
  
  // Database Drivers
  PGLiteDB,
  SQLiteDB,
  PostgreSQLDB,
  MysqlDB,
  
  // Class Reference
  KlassByName
  
} from 'interaqt';
```

## What is NOT Exported

The following are commonly mistaken as exports but do NOT exist:

```javascript
// ❌ These do NOT exist in interaqt:
import {
  User,                // No pre-built User entity
  RelationBasedEvery,  // Only 'Every' exists
  InteractionEvent,    // Correct name is 'InteractionEventEntity'
  FilteredEntity,      // Created via Entity.create with baseEntity
  SideEffect,          // Not a direct export
  DataAttributive      // Use Attributive for all purposes
} from 'interaqt';
```

## Common Import Patterns

### Basic Entity Definition
```javascript
import { Entity, Property } from 'interaqt';

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' })
  ]
});
```

### Complete CRUD Setup
```javascript
import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  InteractionEventEntity 
} from 'interaqt';
```

### Computation Setup
```javascript
import { 
  Count, 
  Every, 
  Any, 
  Summation,
  WeightedSummation,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer
} from 'interaqt';
```

### Controller Setup
```javascript
import { 
  Controller, 
  MonoSystem, 
  PGLiteDB,
  KlassByName 
} from 'interaqt';

const system = new MonoSystem(new PGLiteDB());
system.conceptClass = KlassByName;
const controller = new Controller({

  system: system,

  entities: entities,

  relations: relations,

  activities: activities,

  interactions: interactions,

  dict: dictionaries,

  recordMutationSideEffects: []

});
```

## Important Notes

1. **No Built-in Entities**: interaqt does not provide any pre-built entities like User, Post, etc. You must define all entities yourself.

2. **Entity References in Imports**: When you see `base: User` in examples, User is not imported from interaqt but defined in your application.

3. **Special Entity Names**: `InteractionEventEntity` is the only pre-defined entity, used for listening to interaction events.

4. **Filtered Entities**: Created using `Entity.create()` with `baseEntity` and `filterCondition`, not a separate import.

5. **Database Drivers**: Choose one based on your needs - PGLiteDB for in-memory testing, PostgreSQLDB for production, etc. 