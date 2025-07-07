# Error Report - Round 1

## Errors Encountered

### 1. Computation Setup Error
**Error**: `attribute dormitory not found in Dormitory. namePath: Dormitory.dormitory`

**Cause**: The computations.ts file is trying to modify entity properties after they have been created, which creates circular dependency issues.

**Analysis**: 
- The framework expects computations to be defined within the entity/relation definitions, not applied afterward
- The approach of setting `Entity.computation = ...` after creation is incorrect
- Relations are trying to reference attributes that don't exist

### 2. Default Value Function Error
**Error**: `column.defaultValue is not a function`

**Cause**: The computations are incorrectly overriding property definitions and the defaultValue property gets corrupted.

**Analysis**:
- When modifying properties after creation, the original property structure gets damaged
- The framework expects defaultValue to always be a function
- The property modification approach breaks the internal property structure

## Root Cause

The fundamental issue is the approach to applying computations. The interaqt framework requires:

1. **Computations must be defined at creation time**, not applied afterward
2. **Circular dependencies** between entities, relations, and interactions need careful management
3. **Properties cannot be modified** after entity creation

## Proposed Fix

1. **Remove the separate computations.ts file**
2. **Define computations inline within entity/relation definitions**
3. **Handle circular dependencies** by using forward references or restructuring
4. **Create a proper dependency order** for imports

## Next Steps

1. Remove the problematic computations.ts import
2. Define basic entities and relations without computations first
3. Add computations incrementally within the entity definitions
4. Test each computation individually
5. Use side effects for complex multi-entity operations (like bed creation)

## Impact

- All 10 test cases are failing due to setup issues
- System cannot initialize properly
- Need to restructure the computation approach entirely