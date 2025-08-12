# Round 2: StateMachine Property Computation Error

## Problem
EvictionRequest.status StateMachine fails with:
```
Failed to retrieve last value for incremental computation. Caused by: Cannot read properties of null (reading 'status')
```

## Analysis
From the SQL logs, I can see that:
1. The EvictionRequest is created successfully with status = 'pending'
2. The StateMachine attempts to update status to 'approved' 
3. But the computation fails when trying to retrieve the current state

## Root Cause
The issue appears to be that the StateMachine computation is trying to read the current status value but finding null. This suggests the StateMachine computation might have a conflict with the Transform computation on the same entity.

## Investigation
Looking at the EvictionRequest entity:
- It has a Transform computation that creates the entity from InteractionEventEntity
- It also has a StateMachine computation on the 'status' property
- The Transform doesn't set the status (we removed it to let StateMachine handle it)
- But the StateMachine might need the initial value to be set

## Possible Solutions
1. Set initial status in the Transform computation
2. Use a different approach for StateMachine on computed entities
3. Use separate state machine approach without property-level StateMachine

## Fix Applied
Will try setting the initial status in Transform and removing the StateMachine computation, then use a different approach for state transitions.