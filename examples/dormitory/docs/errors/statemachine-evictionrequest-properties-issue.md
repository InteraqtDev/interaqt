# StateMachine Computation Issues - EvictionRequest Properties

## Problem
The StateMachine computations for EvictionRequest properties (status, decidedAt, adminNotes) are failing with incremental computation errors, similar to the User.status and User.evictedAt issues.

## Symptoms
- Error: "Failed to retrieve last value for incremental computation"
- Error: "Cannot read properties of undefined (reading 'status')"
- Error: "Cannot read properties of null (reading 'status')"
- The StateMachine computations are not properly transitioning states
- Tests failing: EvictionRequest status remains 'pending' instead of transitioning

## Investigation
1. The same pattern that works for User.role and Bed.status is failing for EvictionRequest
2. This appears to be a systematic issue with StateMachine incremental computations
3. The error occurs in the Controller.retrieveLastValue method
4. The framework seems unable to track previous state for incremental updates

## Current Implementation
```typescript
// EvictionRequest.status StateMachine
EvictionRequest.properties[1].computation = StateMachine.create({
  states: [pendingStatusState, approvedStatusState, rejectedStatusState],
  defaultState: pendingStatusState,
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: pendingStatusState,
      next: approvedStatusState,
      computeTarget: (event) => {
        if (event.payload.decision === 'approved') {
          return { id: event.payload.requestId }
        }
        return null
      }
    }),
    // ... other transfers
  ]
})
```

## Tests Results
- ❌ EvictionRequest.status transitions from pending to approved when approved - FAILED
- ❌ EvictionRequest.status transitions from pending to rejected when rejected - FAILED  
- ❌ EvictionRequest.decidedAt is set when any decision is made - FAILED
- ❌ EvictionRequest.adminNotes is set when provided in review - FAILED
- ✓ EvictionRequest.adminNotes remains empty when not provided - PASSED (no state change needed)

## Pattern Analysis
Working StateMachine computations:
- User.role - ✅ Works
- Bed.status - ✅ Works  
- Bed.assignedAt - ✅ Works

Failing StateMachine computations:
- User.status - ❌ Fails
- User.evictedAt - ❌ Fails
- EvictionRequest.status - ❌ Fails
- EvictionRequest.decidedAt - ❌ Fails
- EvictionRequest.adminNotes - ❌ Fails

## Common Characteristics of Failures
1. All failing computations involve properties that start with a default value
2. All use StateTransfer with conditional logic in computeTarget
3. All are triggered by ReviewEvictionRequest interaction
4. The error suggests the framework cannot retrieve the previous state

## Current Status
- **BLOCKED**: StateMachine incremental computation not working for EvictionRequest properties
- **Framework Issue**: This appears to be a systematic framework limitation
- **Workaround**: These properties need alternative computation patterns
- **Next Steps**: 
  - Continue with other computation types (Transform, Count, etc.)
  - Revisit this issue after completing other implementations
  - Consider using Custom computations or alternative approaches

## Files Affected
- `backend/index.ts` - EvictionRequest StateMachine computations
- `tests/basic.test.ts` - Related test cases

## Related Issues
- docs/errors/statemachine-user-properties-issue.md - Similar issue with User properties

## Last Updated
2025-08-13