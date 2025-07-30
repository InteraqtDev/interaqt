# Iteration 1: Controller Setup Error

## Problem Description
When running the Stage 1 tests, encountering a `TypeError: Cannot read properties of undefined (reading 'setup')` error during Controller initialization.

## Error Details
```
TypeError: Cannot read properties of undefined (reading 'setup')
 ❯ Controller.setup ../../src/runtime/Controller.ts:142:27
    140|     async setup(install?: boolean) {
    141|         const states = this.scheduler.createStates()
    142|         await this.system.setup(this.entities, this.relations, states,…
       |                           ^
    143|         await this.scheduler.setup()
```

## Analysis
The error occurs at `this.system.setup()` line, suggesting `this.system` might be undefined. This could be due to:

1. Missing system initialization in Controller constructor
2. Incorrect parameters passed to Controller constructor
3. Issue with the current directory or configuration

## Current Implementation Status
- ✅ Backend entities and relations defined
- ✅ TypeScript compilation passes
- ❌ Controller setup fails during test initialization

## Next Steps
1. Check Controller constructor parameters
2. Verify system initialization
3. Debug the setup process
4. Ensure test environment is correctly configured

## Root Cause Analysis
**First Issue**: Missing system parameter in Controller constructor - RESOLVED

**Second Issue**: `SchedulerError: Failed to setup computation default values`
- The error occurs during scheduler setup phase
- This suggests there's an issue with the Count computations I added after entity definitions
- The Count computations might be referencing relations before they're properly initialized

## Identified Problems
1. **Count computation circular dependency**: I'm adding Count computations to entities after relations are defined, but this might cause initialization order issues
2. **Relation string references**: In Count computations, I might be using string names instead of actual relation objects

## Solution Applied
1. ✅ Fixed Controller constructor by adding system parameter
2. ❌ Need to fix the Count computation initialization order issue