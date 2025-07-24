# Round 4: Multiple Test Failures

## Summary

After adding computeTarget, we introduced new issues. Currently 2/9 tests passing.

## Passing Tests ✅
1. TC001: Create Dormitory
2. TC002: Assign Dormitory Head
3. TC009: Remove Dormitory Head (NOW FIXED!)

## Failing Tests ❌

### TC003: Assign User to Bed
**Error**: Transform computation error for UserBedRelation
**Cause**: The Transform for creating UserBedRelation is failing

### TC004: Record Point Deduction  
**Error**: `recordedBy` is undefined
**Cause**: PointDeduction doesn't have a `recordedBy` property - it should use the interaction user

### TC005: Submit Kick-Out Application
**Error**: attribute `applicationTime` not found
**Cause**: Test is looking for `applicationTime` but entity has `createdAt`

### TC006/TC007: Process Kick-Out Application
**Error**: Cannot read properties of undefined (reading 'id')
**Cause**: Application is not being created in TC005

### TC008: Remove User from Bed
**Error**: Cannot read properties of undefined (reading 'status')
**Cause**: StateMachine trying to find bed by occupant relation

## Fix Strategy

1. Add Transform for UserBedRelation creation
2. Fix PointDeduction to include who recorded it
3. Fix test to use `createdAt` instead of `applicationTime`
4. Debug why KickOutApplication is not being created 