# Phase 3 Permission Errors - RESOLVED

## P008: RecordPointDeduction Permission

### Original Error
The dormHead was unable to deduct points from users in their dormitory. The condition check was failing even though the relations were correctly set up.

### Root Cause
The issue was trying to query relations directly as if they were separate tables. In InterAQT, relations are embedded within their source entities:
- `UserDormitoryRelation` is stored as a property within the `User` entity
- `DormitoryDormHeadRelation` is stored as a property within the `Dormitory` entity

### Solution
Instead of querying relations directly, query the parent entities and access the relation properties:

```typescript
// WRONG - trying to query relation directly
const managedDormRelation = await this.system.storage.findOne(
  'DormitoryDormHeadRelation',
  MatchExp.atom({ key: 'target', value: ['=', event.user.id] }),
  undefined,
  ['id', 'source']
)

// CORRECT - query the parent entity
const allDorms = await this.system.storage.find(
  'Dormitory',
  undefined,
  undefined,
  ['id', 'name', ['dormHead', { attributeQuery: ['id'] }]]
)
const managedDormitory = allDorms.find(d => d.dormHead?.id === event.user.id)
```

## P009: ViewDormitoryMembers Permission  

### Original Error
Users were unable to view their own dormitory members. The condition check was failing with the same pattern as P008.

### Solution
Applied the same fix - query the parent entities instead of relations:

```typescript
// Query User entity with dormitory relation
const currentUser = await this.system.storage.findOne(
  'User',
  MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
  undefined,
  ['id', ['dormitory', { attributeQuery: ['id'] }]]
)

// Query Dormitory entity with dormHead relation
const requestedDorm = await this.system.storage.findOne(
  'Dormitory',
  MatchExp.atom({ key: 'id', value: ['=', requestedDormitoryId] }),
  undefined,
  ['id', ['dormHead', { attributeQuery: ['id'] }]]
)
```

## Key Learnings

1. **Relations are not separate tables** - They are embedded in their source entities
2. **Always query parent entities** - Access relations through the entity properties
3. **Use nested attributeQuery** - When querying related entities, use the nested attributeQuery syntax
4. **Framework storage structure** - Relations are denormalized into the source entity table for performance

## Status
✅ RESOLVED - Both P008 and P009 are now passing all test scenarios.