# Round 5 Error: Updates Inside Computation Callbacks

## Error Summary
All tests failing with "Cannot read properties of undefined (reading 'id')" errors when trying to update entities inside relation computation callbacks.

## Error Details
```
TypeError: Cannot read properties of undefined (reading 'id')
    at Controller.callback (/Users/camus/Work/interqat/interaqt-old/examples/dormitory/backend/index.ts:216:53)
```

The error occurs at line 216:
```typescript
await this.system.storage.update('Bed', bed.id, { status: 'occupied' });
```

## Root Cause Analysis
We're trying to update entities inside Transform computation callbacks for relations. This appears to be causing issues because:
1. The computation context might not have full access to storage operations
2. Updates inside computations might create circular dependencies
3. The entity might not be fully initialized when the computation runs

## Solution Approach
For Stage 1, we need to simplify the implementation:
1. Remove all storage.update() calls from inside computation callbacks
2. Use simple Transform computations for entity/relation creation only
3. Handle state updates through separate entity-level Transform computations
4. Keep the implementation minimal for Stage 1 - just make the tests pass

## Lesson Learned
Computations should be pure data transformations. Side effects like updating other entities should be handled differently, possibly through:
- Separate Transform computations on the entities themselves
- Actions (in Stage 2)
- Post-interaction hooks