# User.name StateMachine Computation Error

## Error Message
```
Failed to retrieve last value for incremental computation. Caused by: Cannot read properties of undefined (reading 'name')
```

## Attempted Implementation (Attempt 1)
Added StateMachine computation to User.name property using property find pattern.

## Problem Analysis
The error occurs when trying to retrieve the last value for the incremental computation. The StateMachine implementation might be incorrect for a property that's set initially by the Transform computation of the User entity.

## Root Cause
The User.name property needs to be set initially by the User entity's Transform computation (CreateUser/RegisterUser), and then updated by UpdateUserProfile. The current approach of using a StateMachine directly on the property conflicts with the entity's Transform computation.

## Solution Strategy
For properties that are set initially during entity creation via Transform and then updated by interactions, we should:
1. Let the Transform handle initial creation
2. Use StateMachine only for updates after creation