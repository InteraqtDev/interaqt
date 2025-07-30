# Iteration 3: Entity Property Mapping Issues

## Problem Description
After fixing the controller setup scheduler error (missing `install: true` parameter), discovered that entities are created but their properties return `undefined` when queried. The framework creates tables and stores data correctly, but property retrieval fails.

## Error Details
```
AssertionError: expected undefined to be 'Dormitory A-101'
✓ Entity tables are created correctly
✓ Data is inserted with correct SQL
✓ Data exists in database
❌ Properties return undefined when accessing entity.propertyName
```

## SQL Analysis
The SQL shows data is stored correctly:
```sql
CREATE TABLE "Dormitory" (
    "_rowId" SERIAL PRIMARY KEY,
    "dor_nam_7" TEXT,  -- name property
    "dor_cap_8" INT,   -- capacity property
    "dor_id_10" UUID   -- id property
)

INSERT INTO "Dormitory"
("dor_nam_7","dor_cap_8","dor_id_10")
VALUES
('Test Dormitory', 4, '01985ab1-283c-740e-b3aa-f9cc14193512')
```

## Root Cause Analysis
**Primary Issues Identified**:

1. **Transform Computation Problems**: 
   - My Transform callbacks may not be returning data in the correct format
   - CRUD example uses specific patterns that I'm not following

2. **Entity Definition Issues**:
   - May be missing required properties or computations
   - Default values might not be working as expected

3. **Property Access Issues**:
   - Framework stores data but property mapping on retrieval fails
   - Relation properties may be interfering with basic property access

## Comparison with Working CRUD Example
**CRUD Example Working Patterns**:
- Uses computed properties with explicit `computed` functions
- Has `defaultValue` functions that work correctly
- Transform callbacks return data in specific format
- Relations are defined after entities
- Count computations added after relations

**My Implementation Issues**:
- Missing `computed` property functions
- Transform callbacks may not match expected format
- Relation properties might be conflicting with entity properties

## Next Steps
1. **Create exact minimal replica of CRUD example** with dormitory domain
2. **Follow CRUD patterns exactly** - entity definition order, property types, Transform format
3. **Test each component individually** - entities first, then relations, then interactions
4. **Gradually add complexity** only after basic functionality works

## Solution Strategy
1. Start with absolute minimum: User and Dormitory entities with basic properties
2. Use CRUD example as template - copy patterns exactly
3. Test property access before adding any computations or relations
4. Add Transform computations only after basic entities work
5. Add relations last, following CRUD example patterns

## Status
- ✅ Controller setup fixed (install parameter)
- ✅ Tables created correctly
- ✅ Data stored correctly  
- ❌ Property retrieval failing
- ⏳ Need to fix property mapping first before proceeding