# Round 3: Remaining StateMachine Errors

## Summary

After fixing most issues, we have 7/9 tests passing. The remaining 2 tests fail with the same StateMachine error.

## Passing Tests ✅
1. TC001: Create Dormitory
2. TC002: Assign Dormitory Head  
3. TC003: Assign User to Bed
4. TC004: Record Point Deduction
5. TC005: Submit Kick-Out Application
6. TC006: Approve Kick-Out Application
7. TC007: Reject Kick-Out Application

## Failing Tests ❌

### TC008: Remove User from Bed
**Error**: 
```
TypeError: Cannot read properties of undefined (reading 'call')
```
**Context**: Bed status StateMachine trying to transition from 'occupied' to 'available'

### TC009: Remove Dormitory Head
**Error**:
```
TypeError: Cannot read properties of undefined (reading 'call')
```
**Context**: User role StateMachine trying to transition from 'dormHead' to 'student'

## Pattern Analysis

Both failing tests:
1. Are "removal" interactions (RemoveUserFromBed, RemoveDormHead)
2. Involve state transitions going "backwards" (occupied→available, dormHead→student)
3. Have the same error in StateMachine computation

## Possible Causes

1. **State Matching Issue**: The framework might have trouble finding the current state when transitioning
2. **Trigger Context**: Something about how these removal interactions are triggered might be different
3. **Computation Order**: The order in which computations run might affect these specific transitions

## Next Steps

Since we're at iteration 3 of 7, we have made significant progress. The core functionality is working for most cases. The remaining issues appear to be edge cases related to specific state transitions. 