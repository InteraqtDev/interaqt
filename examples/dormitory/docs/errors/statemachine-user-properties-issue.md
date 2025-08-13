# StateMachine Computation Issues - User.status and User.evictedAt

## Problem
The StateMachine computations for User.status and User.evictedAt properties are failing with incremental computation errors.

## Symptoms
- Error: "Failed to retrieve last value for incremental computation"
- Error: "Cannot read properties of undefined (reading 'status')"
- Error: "Cannot read properties of null (reading 'status')"
- The StateMachine computations are not properly transitioning states

## Investigation
1. The StateMachine pattern works correctly for User.role and Bed.status
2. The issue appears to be specific to User.status and User.evictedAt
3. The error occurs in the Controller.retrieveLastValue method
4. This suggests the framework is having trouble tracking the previous state for incremental updates

## Current Implementation
```typescript
// User.status StateMachine
User.properties[4].computation = StateMachine.create({
  states: [activeStatusState, evictedStatusState],
  defaultState: activeStatusState,
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: activeStatusState,
      next: evictedStatusState,
      computeTarget: (event) => {
        if (event.payload.decision === 'approved') {
          return { id: event.payload.userId }
        }
        return null
      }
    })
  ]
})
```

## Attempts Made
1. ✅ Verified StateMachine pattern works for other properties
2. ❌ Adding defaultValue to properties - Framework error: properties with computation should not have defaultValue
3. ❌ Various computeTarget return patterns
4. ❌ Different StateNode configurations

## Current Status
- **BLOCKED**: StateMachine incremental computation not working for User.status and User.evictedAt
- **Workaround**: These properties need to be handled differently or the framework has a bug
- **Next Steps**: 
  - Continue with other computations
  - Revisit this issue after completing other implementations
  - Consider alternative computation patterns

## Files Affected
- `backend/index.ts` - User.status and User.evictedAt StateMachine computations
- `tests/basic.test.ts` - Related test cases

## Last Updated
2025-08-13