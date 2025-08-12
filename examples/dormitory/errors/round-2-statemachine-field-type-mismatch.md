# Error Round 2: StateMachine field type mismatch

## Problem
After fixing the defaultValue issue, got this error:
```
invalid input syntax for type integer: "active"
```

SQL logs show it's trying to update field `use_evi_6` (which should be `evictedAt` timestamp) with string `"active"`.

## Root Cause Analysis
Looking at the StateMachine configurations, I suspect the issue is in the way I'm defining the StateNodes or StateMachines for the `evictedAt` property.

The `evictedAt` property:
1. Should be type `number` (timestamp)
2. Has a StateMachine with `activeState` and `evictedState` 
3. Should get a timestamp when transitioning to `evictedState`

But it seems like it's getting the state name ("active") instead of the computed value.

## Hypothesis
The issue might be:
1. The `evictedState` StateNode's `computeValue` should return timestamp, but it might be returning the state name instead
2. Or there's confusion between different StateMachines for the same states
3. Or the field mapping is wrong

## Investigation Needed
1. Check the StateNode definitions for `activeState` and `evictedState`
2. Check if the `evictedAt` StateMachine is correctly configured
3. Verify the computeValue functions return the right type

## Root Cause Identified
The issue was that I was reusing the same `activeState` and `evictedState` StateNodes for both:
1. `User.status` property (should return state names: "active", "evicted")
2. `User.evictedAt` property (should return timestamp when evicted, null when not evicted)

Since the `activeState` had no `computeValue`, it was defaulting to the state name "active", which caused a type mismatch when trying to store it in the `evictedAt` field (which expects a number/timestamp).

## Solution Implemented
Created separate StateNodes for the `evictedAt` property:
- `notEvictedState` with `computeValue: () => null`
- `wasEvictedState` with `computeValue: () => Math.floor(Date.now()/1000)`

This ensures each StateMachine gets the correct value types.

## Status
- [x] Error documented
- [x] Root cause identified  
- [x] Fix implemented
- [x] Tests passing