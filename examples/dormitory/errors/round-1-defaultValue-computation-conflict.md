# Error Round 1: defaultValue and computation conflict

## Problem
When testing the User.role StateMachine, got this error:
```
User.role property shuold not has a defaultValue, because it will be overridden by computation
```

## Root Cause
Properties that have a `computation` should not also have a `defaultValue`. The computation provides the value, so having both creates a conflict.

## Affected Properties
1. `User.role` - Has both `defaultValue: () => 'student'` and `StateMachine` computation
2. `User.status` - Has both `defaultValue: () => 'active'` and `StateMachine` computation  
3. `User.evictedAt` - Has `StateMachine` computation but no defaultValue (this one is OK)

## Solution
Remove the `defaultValue` from properties that have computations. The StateMachine's `defaultState` will provide the initial value.

## Files to Fix
- `backend/index.ts`: Remove defaultValue from User.role and User.status properties

## Status
- [ ] Fix implemented
- [ ] Tests passing