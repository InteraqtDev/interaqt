# Round 3 Error: Entity Properties Undefined

## Error Summary
Multiple errors occurring:
1. Entity properties are undefined (e.g., `expected undefined to be 'Building A'`)
2. StateMachine computation errors when trying to read properties like 'status' and 'role'
3. Some tests can't find entities by property values

## Error Details
From TC001:
- Dormitory is created but `dormitory.name` is undefined
- Expected 'Building A' but got undefined

From TC003:
- StateMachine computation fails with "Cannot read properties of undefined (reading 'status')"
- This happens when trying to run state transitions

## Root Cause Analysis
Looking at the test queries, entities might need to have their properties fetched explicitly. When calling `find()`, we might need to specify which properties to retrieve.

Also, when accessing properties on retrieved entities, they might not be automatically loaded.

## Solution Approach
1. When fetching entities, we need to specify attribute queries to get the properties
2. When using `get()` method, we also need to specify properties to fetch
3. Fix the test to properly retrieve entity properties

The issue seems to be that the ORM doesn't automatically fetch all properties - we need to explicitly request them.