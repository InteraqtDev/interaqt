# EvictionRequest.status StateMachine Error

## Issue
The EvictionRequest.status StateMachine computation is failing with the error:
```
[ComputationError] Failed to run computation for dirty record. Caused by: Failed to retrieve last value for incremental computation. Caused by: Cannot read properties of undefined (reading 'status') (computationName: StateMachine, handleName: PropertyStateMachineHandle)
```

## Error Details
- The error occurs when trying to execute the ApproveEviction interaction
- The StateMachine is trying to read the 'status' property of an undefined object
- This suggests the computation state is not properly initialized

## Code
```typescript
const EvictionRequestStatusStateMachine = StateMachine.create({
    states: [pendingState, approvedState, rejectedState],
    defaultState: pendingState,
    transfers: [
        StateTransfer.create({
            current: pendingState,
            next: approvedState,
            trigger: ApproveEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        }),
        StateTransfer.create({
            current: pendingState,
            next: rejectedState,
            trigger: RejectEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        })
    ]
})
```

## Attempts to Fix
1. Added defaultValue to status property → Error: properties with computations should not have defaultValue
2. Removed status from entity computation → Still fails
3. Compared with working User.status StateMachine → No obvious differences

## Status
BLOCKED - Framework issue with StateMachine computation
The computation is properly defined but the framework is failing to execute it correctly.