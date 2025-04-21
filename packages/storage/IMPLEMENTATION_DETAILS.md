# @interaqt/storage Implementation Details

This document explains the internal architecture of the `@interaqt/storage` package, providing insights into how it works under the hood. Understanding these details can be valuable if you need to extend the package, debug issues, or simply gain a deeper understanding of its functionality.

## Table of Contents

1. [Overall Architecture](#overall-architecture)
2. [Key Components](#key-components)
3. [Data Flow](#data-flow)
4. [Query Building Process](#query-building-process)
5. [Table Structure and Mapping](#table-structure-and-mapping)
6. [Relation Handling](#relation-handling)
7. [Query Execution](#query-execution)
8. [Internal Data Representation](#internal-data-representation)

## Overall Architecture

The `@interaqt/storage` package is built as an ORM (Object-Relational Mapping) layer that abstracts database operations and provides a semantic interface for working with entities and their relationships. At a high level, it consists of:

1. **Schema Definition** - Entities, relations, and their properties define the data model
2. **Schema Mapping** - Maps the logical schema to the physical database schema
3. **Query Building** - Transforms semantic queries into database-specific queries
4. **Query Execution** - Executes queries against the database
5. **Result Mapping** - Maps database results back to semantic entities

## Key Components

### EntityToTableMap

The `EntityToTableMap` class is central to the package, responsible for mapping entities and relations to database tables. It manages information about:

- Which entity/relation maps to which table
- Which property maps to which column
- How relationships between entities are represented in the database

```typescript
// Example of the mapping data structure
{
  records: {
    'User': {
      table: 'User',
      attributes: {
        'name': { type: 'string', field: 'User_name' },
        'age': { type: 'number', field: 'User_age' },
        'profile': { 
          type: 'id', 
          isRecord: true, 
          recordName: 'Profile',
          linkName: 'Profile_owner_profile_User'
        }
      }
    }
  },
  links: {
    'Profile_owner_profile_User': {
      sourceRecord: 'Profile',
      sourceProperty: 'owner',
      targetRecord: 'User',
      targetProperty: 'profile',
      relType: ['1', '1']
    }
  }
}
```

### DBSetup

The `DBSetup` class is responsible for initializing the database schema based on the entity and relation definitions. It:

1. Analyzes the entities and relations
2. Determines how to map them to database tables
3. Handles table merging strategies (for optimizing certain relation types)
4. Generates and executes the SQL to create the tables

```typescript
// How DBSetup handles table creation
const setup = new DBSetup(entities, relations, database);
await setup.createTables(); // Generates and executes CREATE TABLE statements
```

### EntityQueryHandle

The `EntityQueryHandle` class provides the main API for client code to interact with the storage layer. It exposes methods for:

- Creating, updating, and deleting entities
- Querying entities with complex conditions
- Managing relationships between entities

```typescript
const handle = new EntityQueryHandle(entityToTableMap, database);
await handle.create('User', { name: 'John', age: 30 });
const users = await handle.find('User', MatchExp.atom({ key: 'age', value: ['>', 25] }));
```

### MatchExp

The `MatchExp` class represents query conditions and provides a fluent API for building complex expressions:

```typescript
const query = MatchExp.atom({ key: 'age', value: ['>', 25] })
  .and({ key: 'name', value: ['like', 'J%'] });
```

Under the hood, it uses a boolean expression tree to represent complex conditions.

### AttributeQuery

The `AttributeQuery` class specifies which attributes should be returned in query results, including attributes from related entities:

```typescript
['name', 'age', ['profile', { attributeQuery: ['title'] }]]
```

This translates to selecting the `name` and `age` attributes of the main entity, along with the `title` attribute of the related `profile` entity.

### RecordQueryAgent

The `RecordQueryAgent` is the core execution engine that translates high-level semantic operations into SQL queries. It:

1. Takes queries built by the `EntityQueryHandle`
2. Resolves all the necessary information from the entity-to-table map
3. Generates appropriate SQL
4. Executes the SQL against the database
5. Maps the results back to entity objects

## Data Flow

The typical data flow through the system is as follows:

1. Client code calls a method on `EntityQueryHandle` (e.g., `find()`)
2. `EntityQueryHandle` creates appropriate query objects (`MatchExp`, `AttributeQuery`)
3. These are passed to `RecordQueryAgent` for execution
4. `RecordQueryAgent` uses `EntityToTableMap` to resolve table/column information
5. `RecordQueryAgent` generates and executes SQL against the database
6. Results are mapped back to entity objects and returned to the client

## Query Building Process

When building a query, the system follows these steps:

1. **Parse Match Expression**: Convert semantic conditions into a query tree
2. **Resolve Tables and Joins**: Determine which tables need to be joined based on the query
3. **Build SELECT Clause**: Based on the requested attributes
4. **Build WHERE Clause**: Based on the match expression
5. **Add Modifiers**: Apply limit, offset, ordering, etc.
6. **Generate SQL**: Combine all parts into a complete SQL statement

## Table Structure and Mapping

The system uses several strategies for mapping entities and relations to database tables:

### Entity Tables

Each entity typically maps to its own table, with columns for each of its properties.

### Relation Tables

Relations can be represented in different ways:

1. **Many-to-Many**: Uses a separate junction table with foreign keys to both related entities
2. **One-to-Many**: Foreign key in the "many" side pointing to the "one" side
3. **One-to-One**: Can be merged into a single table or use foreign keys

### Table Merging

For optimization, the system can merge tables in certain scenarios:

1. **One-to-One Relations**: Both entities can be stored in the same table
2. **Reliance Relations**: When one entity strongly depends on another
3. **User-Defined Merges**: Through the `mergeLinks` configuration

```typescript
// Table merging example
const setup = new DBSetup(entities, relations, database, [
  'User.profile' // Merge the Profile entity into the User table
]);
```

## Relation Handling

Relations are core to the package's functionality. Here's how different relation types are handled:

### One-to-One

For one-to-one relations, the system either:
- Merges both entities into the same table, or
- Uses a foreign key in one of the tables pointing to the other

Example with a foreign key:
```sql
CREATE TABLE "User" (
  "_rowId" INTEGER PRIMARY KEY AUTOINCREMENT,
  "User_name" TEXT,
  "User_profile" INTEGER REFERENCES "Profile"("_rowId")
)
```

### One-to-Many

For one-to-many relations, the system:
- Adds a foreign key column in the "many" side pointing to the "one" side

```sql
CREATE TABLE "Task" (
  "_rowId" INTEGER PRIMARY KEY AUTOINCREMENT,
  "Task_title" TEXT,
  "Task_assignee" INTEGER REFERENCES "User"("_rowId")
)
```

### Many-to-Many

For many-to-many relations, the system:
- Creates a junction table with foreign keys to both related entities
- May add additional columns for properties of the relation

```sql
CREATE TABLE "User_teams_members_Team" (
  "_rowId" INTEGER PRIMARY KEY AUTOINCREMENT,
  "source" INTEGER REFERENCES "User"("_rowId"),
  "target" INTEGER REFERENCES "Team"("_rowId"),
  "role" TEXT
)
```

### Removing Relations

The system supports removing relations by setting the relation field to `null` during an update operation. When a relation field is set to `null`:

1. For x:1 relations (one-to-one, many-to-one):
   - The system identifies the relation based on the entity and attribute name
   - It finds the link table (if separate) or the column in the entity's table
   - It removes the relationship by unlinking or setting the foreign key to null

2. For x:n relations (one-to-many, many-to-many):
   - The system finds all related records linked to the entity
   - It removes all these relationships in a single operation
   - For many-to-many relations, it deletes the junction table entries

The implementation is in the `updateSameRowData` and `handleUpdateReliance` methods of the `RecordQueryAgent` class:
- `updateSameRowData` handles x:1 relations and same-table relations
- `handleUpdateReliance` handles x:n relations and different-table relations

Both methods detect when a relation field is explicitly set to `null` and remove the corresponding relationships before proceeding with other updates.

## Query Execution

The query execution process involves:

1. **Query Generation**: Building SQL statements based on the query objects
2. **Parameter Binding**: Safely binding parameters to prevent SQL injection
3. **Result Processing**: Reading result sets and reconstructing entity objects
4. **Relation Resolution**: For related entities, potentially executing additional queries

Example SQL generated for a find query:
```sql
SELECT 
  "User_t0"."User_name" AS "User.name",
  "User_t0"."User_age" AS "User.age",
  "Profile_t1"."Profile_title" AS "User.profile.title"
FROM 
  "User" AS "User_t0"
LEFT JOIN 
  "Profile" AS "Profile_t1" ON "User_t0"."User_profile" = "Profile_t1"."_rowId"
WHERE 
  "User_t0"."User_age" > ?
ORDER BY 
  "User_t0"."User_name" ASC
LIMIT 10 OFFSET 0
```

## Internal Data Representation

Throughout the system, various data structures are used:

### Entity and Relation Definitions

```typescript
// Entity definition
const userEntity: Entity = {
  name: 'User',
  properties: [
    { name: 'name', type: 'String' },
    { name: 'age', type: 'Number' }
  ]
};

// Relation definition
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
```

### Match Expression Data

Match expressions are represented as a boolean expression tree:

```typescript
// Internal representation of a match expression
{
  type: 'expression',
  operator: 'and',
  left: {
    type: 'atom',
    data: {
      key: 'age',
      value: ['>', 25]
    }
  },
  right: {
    type: 'atom',
    data: {
      key: 'name',
      value: ['like', 'J%']
    }
  }
}
```

### Attribute Query Data

Attribute queries specify which fields to select:

```typescript
// Internal representation of an attribute query
[
  'name',
  'age',
  [
    'profile',
    {
      attributeQuery: ['title']
    }
  ]
]
```

### Mutation Events

When operations like create, update, or delete are performed, mutation events are generated:

```typescript
// Example mutation event
{
  type: 'create',
  recordName: 'User',
  record: {
    name: 'John',
    age: 30,
    id: 1
  }
}
```

These events can be captured and used for audit logging, triggering side effects, etc.

## Conclusion

The `@interaqt/storage` package provides a powerful abstraction over database operations, allowing you to work with entities and relations in a more natural way. By understanding these implementation details, you can make more effective use of the package and potentially extend or customize its functionality to better suit your needs.

For specific implementation questions or issues, refer to the source code in the `erstorage` directory, which contains the detailed logic for each component described here. 