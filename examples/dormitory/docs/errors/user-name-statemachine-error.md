# User.name StateMachine Computation Error

## Error 1
```
ComputationError: Failed to run computation for dirty record. Caused by: Computation execution failed. Caused by: id value cannot be undefined
```

## First Attempt
Implemented StateMachine with single state and transfers, but the implementation stored the state name ("hasName") instead of the actual property value ("Initial Name").

## Root Cause Analysis 1
The StateMachine computation was incorrectly returning the target object with just the property name, rather than storing the actual value in the state. The state needs to track the actual value of the property.

## Second Attempt  
Added `computeValue` to StateNode to return the actual value, but got a new error.

## Error 2
```
Failed to retrieve last value for incremental computation. Caused by: Cannot read properties of undefined (reading 'name')
```

## Root Cause Analysis 2
The StateMachine is trying to update a property during entity creation (CreateUser), but the entity doesn't exist yet. For properties set during entity creation, the initial value should be handled by the entity's Transform computation, and the StateMachine should only handle subsequent updates.

## Solution
For properties that are set during entity creation:
1. Remove the CreateUser trigger from the StateMachine
2. Let the entity's Transform set the initial value
3. StateMachine only handles updates via UpdateUserProfile
