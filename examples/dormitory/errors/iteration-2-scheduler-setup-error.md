# Iteration 2: Scheduler Setup Error - Computation Default Values

## Problem Description
After fixing the Controller initialization, now encountering `SchedulerError: Failed to setup computation default values` during scheduler setup.

## Error Details
```
SchedulerError: Failed to setup computation default values
 ❯ Scheduler.setup ../../src/runtime/Scheduler.ts:822:31
    820|                 await this.setupDefaultValues()
    821|             } catch (e) {
    822|                 const error = new SchedulerError('Failed to setup comp…
```

## SQL Analysis
Looking at the generated SQL queries, I notice:
- Field names like "dor__16" and "dor__17" which suggest unnamed properties
- Queries are trying to find records for "deleting Dormitory" which suggests cascade deletion issues
- The properties might have naming conflicts or invalid configurations

## Current Implementation Status  
- ✅ Controller initialization fixed
- ✅ TypeScript compilation passes
- ✅ Removed complex Count computations 
- ❌ Scheduler setup still fails during default values setup

## Analysis
The issue seems to be with:
1. **Property definitions**: Some properties might have invalid names or configurations
2. **Entity computations**: The Transform computations might have issues
3. **Relation references**: Relations might be incorrectly referencing entities

## Suspected Issues
1. Properties in Dormitory entity might have naming issues
2. The availableBeds and other properties might still have computation dependencies
3. Transform computations in entities might be causing circular dependencies

## Next Steps
1. Create a minimal test case with just basic entities
2. Remove all Transform computations temporarily
3. Test with simplest possible entity definitions
4. Gradually add complexity back

## Root Cause Analysis
**Primary Issue**: Missing `install: true` parameter in Controller.setup() call

**Analysis**:
1. Created minimal test case with basic User and Dormitory entities
2. Without `install` parameter: SchedulerError during default values setup
3. With `install: true` parameter: Controller setup succeeds and tests pass
4. The install parameter is required to properly create database tables and setup the schema

**Secondary Issues (in main backend)**:
1. Complex Transform computations may still cause initialization order issues
2. Default values and property computations need careful ordering
3. Relations create additional fields that may conflict if not properly handled

## Solution Applied
1. ✅ **Fixed primary issue**: Add `install: true` parameter to all Controller.setup() calls
2. ⏳ **Next step**: Apply this fix to main backend tests and verify Stage 1 works
3. ⏳ **Follow-up**: May need to simplify Transform computations if issues persist