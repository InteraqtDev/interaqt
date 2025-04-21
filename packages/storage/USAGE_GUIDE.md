# @interaqt/storage Usage Guide

## Introduction

The `@interaqt/storage` package is an ORM-like library that provides a high-level, semantic interface for database operations. It abstracts away database-specific details and allows you to work with entities, relations, and queries in a natural way. This guide will walk you through how to use this package effectively.

## Table of Contents

1. [Installation](#installation)
2. [Basic Concepts](#basic-concepts)
3. [Setting Up](#setting-up)
4. [Working with Entities](#working-with-entities)
5. [Working with Relations](#working-with-relations)
6. [Querying Data](#querying-data)
7. [Advanced Querying](#advanced-querying)
8. [Transactions and Events](#transactions-and-events)
9. [Examples](#examples)

## Installation

```bash
npm install @interaqt/storage
```

## Basic Concepts

The `@interaqt/storage` package is built around a few key concepts:

- **Entities**: Represent your data models (like User, Product, etc.)
- **Relations**: Represent relationships between entities (like one-to-many, many-to-many)
- **Properties**: Define the attributes of entities or relations
- **Queries**: Used to fetch or manipulate data using a semantic API

## Setting Up

### Defining Your Data Model

First, you need to define your data model using entities and relations:

```typescript
import { Entity, Property, Relation, RelationType } from "@interaqt/storage";

// Define an entity
const userEntity: Entity = {
  name: 'User',
  properties: [
    { name: 'name', type: 'String' },
    { name: 'age', type: 'Number' },
    { name: 'gender', type: 'String', defaultValue: () => 'male' }
  ]
};

// Define another entity
const profileEntity: Entity = {
  name: 'Profile',
  properties: [
    { name: 'title', type: 'String' }
  ]
};

// Define a relation between entities
const profileRelation: Relation = {
  source: profileEntity,
  sourceProperty: 'owner',
  target: userEntity,
  targetProperty: 'profile',
  type: RelationType.OneToOne,
  properties: [
    { name: 'viewed', type: 'Number' }
  ]
};

// Create collections of entities and relations
const entities = [userEntity, profileEntity];
const relations = [profileRelation];
```

### Initializing the Storage

After defining your data model, you need to set up the storage with a database:

```typescript
import { DBSetup, EntityToTableMap, EntityQueryHandle } from "@interaqt/storage";
import { SQLiteDB } from "your-database-adapter"; // Example database adapter

// Create and open the database connection
const db = new SQLiteDB(':memory:');
await db.open();

// Set up the database schema based on your models
const setup = new DBSetup(entities, relations, db);
await setup.createTables();

// Create the query handle to interact with the database
const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
```

## Working with Entities

### Creating Entities

You can create entities using the `create` method:

```typescript
// Create a simple entity
const user = await entityQueryHandle.create('User', {
  name: 'John Doe',
  age: 30
});

// Create an entity with a related entity
const userWithProfile = await entityQueryHandle.create('User', {
  name: 'Jane Doe',
  age: 25,
  profile: {
    title: 'Jane\'s Profile'
  }
});
```

### Updating Entities

To update entities, use the `update` method:

```typescript
// Update entity values
await entityQueryHandle.update(
  'User', 
  MatchExp.atom({ key: 'name', value: ['=', 'John Doe'] }),
  { age: 31 }
);

// Update entity with a relation
const leader = await entityQueryHandle.findOne('User', MatchExp.atom({ key: 'name', value: ['=', 'Jane Doe'] }));
await entityQueryHandle.update(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'John Doe'] }),
  { leader: leader }
);
```

### Deleting Entities

To delete entities, use the `delete` method:

```typescript
await entityQueryHandle.delete(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'John Doe'] })
);
```

## Working with Relations

### One-to-One Relations

```typescript
// Create a user with a profile (one-to-one relation)
const userWithProfile = await entityQueryHandle.create('User', {
  name: 'Alice',
  age: 28,
  profile: {
    title: 'Alice\'s Profile'
  }
});

// Query the user with their profile
const user = await entityQueryHandle.findOne(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
  {},
  ['name', 'age', ['profile', { attributeQuery: ['title'] }]]
);
console.log(user.profile.title); // 'Alice's Profile'

// Remove the relation by setting it to null
await entityQueryHandle.update(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'Alice'] }),
  { profile: null }
);
```

### One-to-Many Relations

```typescript
// Create a user with team members (one-to-many relation)
const leader = await entityQueryHandle.create('User', {
  name: 'Team Lead',
  age: 35,
  member: [
    { name: 'Member 1', age: 25 },
    { name: 'Member 2', age: 28 }
  ]
});

// Query the leader with their members
const teamLead = await entityQueryHandle.findOne(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'Team Lead'] }),
  {},
  ['name', 'age', ['member', { attributeQuery: ['name', 'age'] }]]
);
console.log(teamLead.member.length); // 2

// Remove all team members by setting the relation to null
await entityQueryHandle.update(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'Team Lead'] }),
  { member: null }
);
```

### Many-to-Many Relations

```typescript
// Create users
const user1 = await entityQueryHandle.create('User', { name: 'User 1', age: 30 });
const user2 = await entityQueryHandle.create('User', { name: 'User 2', age: 32 });

// Create teams
const team = await entityQueryHandle.create('Team', { 
  teamName: 'Dev Team',
  members: [user1, user2]
});

// Query the team with its members
const devTeam = await entityQueryHandle.findOne(
  'Team',
  MatchExp.atom({ key: 'teamName', value: ['=', 'Dev Team'] }),
  {},
  ['teamName', ['members', { attributeQuery: ['name', 'age'] }]]
);
console.log(devTeam.members.length); // 2

// Remove all members by setting the relation to null
await entityQueryHandle.update(
  'Team',
  MatchExp.atom({ key: 'teamName', value: ['=', 'Dev Team'] }),
  { members: null }
);
```

### Removing Multiple Relations at Once

You can remove multiple types of relationships in a single update operation by setting all the relevant relation fields to `null`:

```typescript
// User with multiple types of relations
const complexUser = await entityQueryHandle.create('User', {
  name: 'Complex User',
  age: 30,
  profile: { title: 'User Profile' },        // one-to-one
  leader: { name: 'Team Leader', age: 40 },  // many-to-one
  members: [                                 // one-to-many
    { name: 'Member 1', age: 25 },
    { name: 'Member 2', age: 27 }
  ],
  teams: [                                   // many-to-many
    { teamName: 'Alpha Team' }, 
    { teamName: 'Beta Team' }
  ]
});

// Remove all relationships at once
await entityQueryHandle.update(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'Complex User'] }),
  {
    profile: null,
    leader: null,
    members: null,
    teams: null
  }
);
```

## Querying Data

### Basic Queries

```typescript
// Find a single user by name
const user = await entityQueryHandle.findOne(
  'User',
  MatchExp.atom({ key: 'name', value: ['=', 'John Doe'] }),
  {},
  ['name', 'age', 'gender']
);

// Find multiple users by age
const users = await entityQueryHandle.find(
  'User',
  MatchExp.atom({ key: 'age', value: ['>', 25] }),
  {},
  ['name', 'age']
);
```

### Query Modifiers

You can use modifiers to control how results are returned:

```typescript
// Pagination
const usersPage1 = await entityQueryHandle.find(
  'User',
  undefined,
  { limit: 10, offset: 0 },
  ['name', 'age']
);

// Sorting
const usersSorted = await entityQueryHandle.find(
  'User',
  undefined,
  { orderBy: { age: 'DESC' } },
  ['name', 'age']
);
```

### Attribute Queries

Attribute queries allow you to specify which attributes to include in the result:

```typescript
// Basic attribute selection
const users = await entityQueryHandle.find(
  'User',
  undefined,
  {},
  ['name', 'age'] // Only return name and age
);

// Nested attribute selection
const usersWithProfiles = await entityQueryHandle.find(
  'User',
  undefined,
  {},
  [
    'name', 
    'age', 
    ['profile', { attributeQuery: ['title'] }] // Include profile with its title
  ]
);
```

## Advanced Querying

### Complex Match Expressions

You can create complex match expressions using logical operators:

```typescript
// AND operator
const users = await entityQueryHandle.find(
  'User',
  MatchExp.atom({ key: 'age', value: ['>', 25] })
    .and({ key: 'gender', value: ['=', 'female'] }),
  {},
  ['name', 'age', 'gender']
);

// OR operator (implied by querying on related entities)
const usersWithSpecificProfiles = await entityQueryHandle.find(
  'User',
  MatchExp.atom({ key: 'profile.title', value: ['like', '%Professional%'] }),
  {},
  ['name', 'age', ['profile', { attributeQuery: ['title'] }]]
);
```

### Querying Through Relations

You can query based on related entity attributes:

```typescript
// Find users based on their profile title
const users = await entityQueryHandle.find(
  'User',
  MatchExp.atom({ key: 'profile.title', value: ['=', 'VIP Profile'] }),
  {},
  ['name', 'age', ['profile', { attributeQuery: ['title'] }]]
);

// Find team members based on their team name
const teamMembers = await entityQueryHandle.find(
  'User',
  MatchExp.atom({ key: 'teams.teamName', value: ['=', 'Dev Team'] }),
  {},
  ['name', 'age']
);
```

## Transactions and Events

The storage package allows tracking mutation events during operations:

```typescript
// Array to collect mutation events
const events = [];

// Create a user and track events
const user = await entityQueryHandle.create(
  'User',
  { name: 'Event Test', age: 40 },
  events
);

// Examine the events
console.log(events);
/*
[
  {
    type: "create",
    recordName: "User",
    record: { name: "Event Test", age: 40, id: 1 }
  }
]
*/
```

## Examples

### Complete User Management Example

```typescript
// Define entities and relations
const userEntity = {
  name: 'User',
  properties: [
    { name: 'name', type: 'String' },
    { name: 'email', type: 'String' },
    { name: 'age', type: 'Number' }
  ]
};

const taskEntity = {
  name: 'Task',
  properties: [
    { name: 'title', type: 'String' },
    { name: 'description', type: 'String' },
    { name: 'completed', type: 'Boolean', defaultValue: () => false }
  ]
};

const taskAssignmentRelation = {
  source: userEntity,
  sourceProperty: 'assignedTasks',
  target: taskEntity,
  targetProperty: 'assignee',
  type: RelationType.OneToMany,
  properties: [
    { name: 'assignedAt', type: 'Date' }
  ]
};

// Set up the storage
const db = new SQLiteDB(':memory:');
await db.open();
const setup = new DBSetup([userEntity, taskEntity], [taskAssignmentRelation], db);
await setup.createTables();
const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

// Create a user
const user = await entityQueryHandle.create('User', {
  name: 'Task Manager',
  email: 'manager@example.com',
  age: 35
});

// Create tasks assigned to the user
const task1 = await entityQueryHandle.create('Task', {
  title: 'Complete documentation',
  description: 'Finish writing the storage package documentation',
  assignee: user
});

const task2 = await entityQueryHandle.create('Task', {
  title: 'Code review',
  description: 'Review pull requests',
  assignee: user
});

// Update a task to mark it as completed
await entityQueryHandle.update(
  'Task',
  MatchExp.atom({ key: 'id', value: ['=', task1.id] }),
  { completed: true }
);

// Find all uncompleted tasks for the user
const pendingTasks = await entityQueryHandle.find(
  'Task',
  MatchExp.atom({ key: 'assignee.id', value: ['=', user.id] })
    .and({ key: 'completed', value: ['=', false] }),
  {},
  ['title', 'description', 'completed', ['assignee', { attributeQuery: ['name', 'email'] }]]
);

console.log(pendingTasks);
// Expected: Only task2 should be in the result

// Clean up (delete everything)
await entityQueryHandle.delete('Task', MatchExp.atom({ key: 'id', value: ['>', 0] }));
await entityQueryHandle.delete('User', MatchExp.atom({ key: 'id', value: ['>', 0] }));
```

This guide provides a comprehensive overview of how to use the `@interaqt/storage` package. For more specific use cases or advanced features, please refer to the source code or create specific examples tailored to your needs. 