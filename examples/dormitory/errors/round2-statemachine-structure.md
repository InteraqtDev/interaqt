# Round 2: StateMachine Structure Errors

## Error Summary

1. **TC001 (Create Dormitory)**: ✅ PASSING! Fixed by removing non-existent attributes from queries
2. **TC002, TC009**: "Cannot read properties of undefined (reading 'call')" in StateMachine computation
3. **TC003-TC008**: "column 'Bed.bedNumber' does not exist" - database query issue

## Error Details

### Error 1: StateMachine Transfer Modification Error

**Location**: User role StateMachine transfers

**Error Message**:
```
TypeError: Cannot read properties of undefined (reading 'call')
```

**Root Cause**: 
Modifying the transfers array after StateMachine creation is causing internal state issues. The StateMachine expects transfers to be defined during creation, not modified afterward.

**Current Problematic Code**:
```typescript
// This approach is causing issues:
const roleStateMachine = User.properties.find(p => p.name === 'role')!.computation as StateMachine
roleStateMachine.transfers.push(
  StateTransfer.create({...})
)
```

### Error 2: Database Column Reference

**Error Message**:
```
error: column "Bed.bedNumber" does not exist
```

**Root Cause**:
Tests are using dot notation in queries which doesn't work with the database column naming convention.

## Fix Strategy

### Fix 1: Define State Transfers During Creation

Instead of modifying transfers after creation, we need to define all state transfers when creating the StateMachine. This requires reorganizing the code to ensure all interactions are defined before the entities that reference them.

### Fix 2: Use Proper Column Names in Queries

The framework uses underscore notation for column names (e.g., `Bed_bedNumber`), not dot notation. 