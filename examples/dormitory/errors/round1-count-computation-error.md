# Round 1: Count Computation Direction Error

## Problem Summary
Tests are failing with "count computation relation direction error" during Controller initialization.

## Error Details
```
Error: count computation relation direction error
 ❯ assert ../../src/runtime/util.ts:4:15
 ❯ new PropertyCountHandle ../../src/runtime/computations/Count.ts:130:9
 ❯ new Scheduler ../../src/runtime/Scheduler.ts:85:33
 ❯ new Controller ../../src/runtime/Controller.ts:128:26
```

## Root Cause Analysis
The issue is in the `User.totalScore` property computation. Looking at the current code:

```typescript
Property.create({ 
  name: 'totalScore', 
  type: 'number',
  defaultValue: () => 0,
  computation: Count.create({
    record: 'UserScoreRecord' as any,
    direction: 'source',
    attributeQuery: [['target', { attributeQuery: ['score', 'status'] }]],
    callback: (relation: any) => {
      return relation.target?.status === 'active' ? relation.target.score : 0;
    }
  })
})
```

### Issues Identified:
1. **Wrong Computation Type**: Using `Count.create()` for summing scores, but Count is for counting records, not summing values
2. **Direction Mismatch**: Using `direction: 'source'` but the relation is `UserScoreRecord` where User should be the source
3. **Incorrect Logic**: The callback tries to return a score value, but Count computations should return boolean for filtering

## Correct Approach
Based on the API reference and analysis, we should use `Summation.create()` to sum the score values, not Count:

```typescript
Property.create({ 
  name: 'totalScore', 
  type: 'number',
  defaultValue: () => 0,
  computation: Summation.create({
    record: UserScoreRecordRelation,
    direction: 'source',
    attributeQuery: [['target', { attributeQuery: ['score'] }]]
  })
})
```

But we also need to filter only active score records. We can use the filtered entity `ActiveScoreRecord` or implement a Custom computation.

## Fix Strategy
1. Change from Count to Summation for totalScore
2. Fix the relation direction and reference
3. Implement proper filtering for active score records only
4. Update other Count computations that might have similar issues

## Additional Issues Found
Looking at the code, there's another Count computation in `Dormitory.currentOccupancy` that might have similar issues:

```typescript
computation: Count.create({
  record: 'UserDormitory' as any,
  direction: 'target',
  attributeQuery: ['status'],
  callback: (relation: any) => relation.status === 'active'
})
```

This one looks more correct as it's actually counting relations, but we need to verify the direction and relation reference.

## Next Steps
1. Fix the totalScore computation to use Summation
2. Fix relation references to use actual relation objects instead of strings
3. Verify all Count computations have correct direction
4. Re-run tests to identify any remaining issues