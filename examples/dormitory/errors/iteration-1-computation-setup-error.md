# Iteration 1: Computation Setup Error

## Error Description
When running Stage 1 tests, all tests fail with the error:
```
SchedulerError: Failed to setup computation default values
```

This occurs during the `controller.setup(true)` phase, before any actual test logic runs.

## Error Analysis

The error occurs in the scheduler setup phase when trying to initialize computation default values. This suggests there might be issues with:

1. **Computation Configuration**: Some computations might have incorrect parameters or references
2. **Forward References**: Despite our efforts to fix forward references, there might still be circular dependencies
3. **StateMachine Transfers**: Empty transfer arrays in StateMachines might be causing issues
4. **Custom Computation Issues**: The Custom computation implementation might have problems

## Observed Issues in Code

### 1. Empty StateMachine Transfers
Many StateMachine definitions have empty transfers arrays:
```typescript
computation: StateMachine.create({
  states: [activeUserState, kickedUserState, suspendedUserState],
  defaultState: activeUserState,
  transfers: [
    // Note: State transfers will be added in Stage 2 with actual interactions
  ]
})
```

### 2. Property Computation Assignment After Creation
We're trying to assign computations after entity creation:
```typescript
User.properties.find(p => p.name === 'totalScore').computation = Custom.create({...})
```

This approach might not work correctly with the framework's internal setup process.

### 3. Complex Custom Computations
The Custom computations might be too complex for Stage 1, especially the totalScore computation that references relations.

## Potential Root Causes

1. **StateMachine Validation**: The framework might require StateMachines to have at least one transfer
2. **Property Modification**: Modifying entity properties after creation might break internal references
3. **Computation Dependencies**: Complex computations with relation dependencies might fail during setup
4. **Missing InteractionEventEntity Reference**: Some Transform computations reference InteractionEventEntity but the interactions might not be properly registered

## Proposed Fix Strategy

### Phase 1: Simplify Computations
1. Remove all complex computations (Custom, StateMachine with empty transfers)
2. Keep only basic properties with defaultValue functions
3. Test basic entity creation and interaction flow

### Phase 2: Add Simple Computations
1. Add back simple computations like Count
2. Add StateMachines with proper transfers after interactions are working

### Phase 3: Add Complex Computations
1. Add Custom computations after basic framework is stable
2. Ensure all dependencies are properly resolved

## Next Steps

1. Create a simplified version of the backend with minimal computations
2. Test basic interaction flow
3. Gradually add back computations one by one to identify the specific issue
4. Document each failing computation for detailed analysis

## Code Changes Needed

### Immediate Fix (Minimal Computations)
- Remove all StateMachine computations with empty transfers
- Remove Custom computations that reference relations
- Keep only basic defaultValue properties
- Test if basic entity creation works

### Progressive Enhancement
- Add back computations incrementally
- Test each addition separately
- Document which computations work and which fail