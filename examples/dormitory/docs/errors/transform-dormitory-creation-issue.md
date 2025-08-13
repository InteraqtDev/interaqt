# Transform Computation Issue - Dormitory Entity Creation

## Problem
The Transform computation for Dormitory entity creation is not working properly. While the computation appears to run (no errors in logs), the created records are not being found by queries.

## Symptoms
- Transform computation executes without errors
- SQL insert statements are generated in the logs
- But `system.storage.find('Dormitory')` returns empty array
- Direct creation via `system.storage.create('Dormitory', ...)` works fine

## Investigation
1. The Transform callback is being called correctly
2. The computation generates the correct data structure
3. The system generates INSERT SQL statements
4. However, queries add a WHERE clause: `("Dormitory"."dor_id_17" IS NOT NULL AND "Dormitory"."dor_id_17" IS NOT NULL)`
5. This suggests the ID field is not being properly populated

## Attempts Made
1. ✅ Verified direct entity creation works
2. ❌ Adding explicit ID in callback - Error: "id should be null or undefined when creating new record"
3. ❌ Various attributeQuery configurations
4. ❌ Adding delays for computation processing
5. ❌ Different query patterns

## Current Status
- **BLOCKED**: Transform computation not working as expected
- **Workaround**: Use direct storage creation instead
- **Next Steps**: 
  - Check if this is a framework bug or usage issue
  - Try alternative computation patterns
  - Consider using interactions with direct storage operations instead

## Files Affected
- `backend/index.ts` - Transform computation on Dormitory entity
- `tests/basic.test.ts` - Test case "Dormitory entity creation via CreateDormitory interaction"

## Last Updated
2025-08-13