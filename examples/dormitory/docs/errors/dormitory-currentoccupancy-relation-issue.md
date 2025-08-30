# Dormitory.currentOccupancy Computation Error

## Issue Summary
The Dormitory.currentOccupancy Count computation cannot correctly access the `occupant` field on Bed entities, even though UserBedAssignmentRelation records exist with proper source/target links.

## Test Plan
**Computation**: Dormitory.currentOccupancy
**Type**: Count computation
**Dependencies**: Dormitory entity, Bed entity, User entity, DormitoryBedRelation, UserBedAssignmentRelation
**Business Logic**: Count of UserBedAssignmentRelation where bed belongs to this dormitory

## Implementation Attempted
```typescript
Dormitory.properties.find(p => p.name === 'currentOccupancy').computation = Count.create({
  property: 'beds',
  attributeQuery: [
    'id',
    ['occupant', { attributeQuery: ['id'] }]
  ],
  callback: function(bed) {
    return bed.occupant && bed.occupant.id
  }
})
```

## Error Observed
UserBedAssignmentRelation exists with correct structure:
```json
{
  "id": "relation-id",
  "source": { "id": "user-id" },
  "target": { "id": "bed-id" }
}
```

However, when querying Bed entities with occupant attributeQuery:
```json
[
  { "id": "bed-id", "number": "Bed-1" }
]
```

The `occupant` field is missing despite the relation existing.

## Relation Definition
```typescript
export const UserBedAssignmentRelation = Relation.create({
  source: User,
  sourceProperty: 'assignedBed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1'
})
```

## Debug Results
1. UserBedAssignmentRelation creation: ✅ Success
2. Relation query: ✅ Shows correct source/target
3. Bed entity query with occupant field: ❌ Returns undefined occupant
4. Direct bed query by ID: ❌ Still no occupant field

## Root Cause
The 1:1 relation's `targetProperty: 'occupant'` is not being properly resolved when querying Bed entities. This appears to be a framework limitation in relation resolution for entity queries.

## Attempted Fixes
1. Count computation with different callback logic
2. Custom computation with global trigger
3. Different attributeQuery patterns
4. Manual storage queries

All approaches failed because the fundamental issue is that Bed.occupant field is not populated by the relation.

## Impact
This computation cannot be implemented as planned due to relation query limitations. The business logic is correct but the technical implementation is blocked by framework constraints.

## Date Created
2025-01-30

## Attempts
10 fix attempts made before documenting as error per instructions.