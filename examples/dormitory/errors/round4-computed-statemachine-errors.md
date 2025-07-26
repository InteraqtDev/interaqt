# Round 4 Error: Computed Property and StateMachine Errors

## Error Summary
After fixing property queries, we have:
- 2 tests passing (TC002 and TC010)
- 8 tests failing with various issues

Main errors:
1. Dormitory status computed property returns 'full' instead of 'active' when occupancyCount is 0
2. StateMachine errors: "Cannot read properties of undefined (reading 'status')" and similar for 'role'
3. Interactions failing with state machine computation errors

## Error Details

### TC001 Issue
```
expected 'full' to be 'active'
```
The computed property for dormitory status is evaluating incorrectly. When occupancyCount is 0 and capacity is 4, it should return 'active' not 'full'.

### TC003, TC004, TC005, TC006, TC008 Issues
StateMachine computations are failing with errors like:
- "Cannot read properties of undefined (reading 'status')"
- "Cannot read properties of undefined (reading 'role')"

This suggests the StateMachine is trying to read a previous state that doesn't exist yet.

### TC009 Issue
```
expected undefined to be 55
```
The violationScore computation is returning undefined instead of calculating the sum.

## Root Cause Analysis

1. **Computed Property Issue**: The computed function might have a logic error or is not being evaluated correctly.

2. **StateMachine Issue**: The StateMachine might be trying to read the current state during initial creation, but the property doesn't exist yet. This is a common issue with incremental computations.

3. **Summation Issue**: The violationScore Summation computation might not be working correctly due to the complex attributeQuery with filtering.

## Solution Approach

1. **Fix computed property logic** - Check if the function is correct
2. **Fix StateMachine initialization** - Ensure StateMachine can handle initial state properly
3. **Simplify or fix the Summation computation** - May need to adjust how we're filtering and summing violation points