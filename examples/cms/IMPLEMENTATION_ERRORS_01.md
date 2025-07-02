# Implementation Errors #01 - TypeScript Type Issues

## Error Summary
During the first TypeScript type check (npx tsc --noEmit), encountered multiple type errors related to:

1. **Primary key property**: `primary` property does not exist in Property type
2. **StateMachine states**: Incorrect states definition format
3. **AttributivePredicate**: Not exported from interaqt package
4. **PayloadItem type**: `type` property does not exist
5. **Interaction preCondition**: Should be `conditions` not `preCondition`

## Root Cause Analysis

### Issue 1: Property Primary Key
**Error**: `'primary' does not exist in type 'KlassInstanceArgs<PropertyPublic>'`
**Cause**: Incorrectly assumed interaqt uses `primary` property to mark primary keys
**Fix**: Need to check correct API for primary key definition

### Issue 2: StateMachine States
**Error**: `'draft' does not exist in type 'unknown[]'`
**Cause**: Incorrect StateMachine states definition - used object format instead of array
**Fix**: Need to correct StateMachine API usage

### Issue 3: AttributivePredicate Import
**Error**: `Module '"interaqt"' has no exported member 'AttributivePredicate'`
**Cause**: Incorrectly assumed AttributivePredicate exists as export
**Fix**: Need to check correct permission/condition API

### Issue 4: PayloadItem Type
**Error**: `'type' does not exist in PayloadItem`
**Cause**: Assumed PayloadItem has type property like traditional form schemas
**Fix**: Need to check correct PayloadItem API

### Issue 5: Interaction Conditions
**Error**: `'preCondition' does not exist... Did you mean to write 'conditions'?`
**Cause**: Used wrong property name for interaction conditions
**Fix**: Change to `conditions`

## Lesson Learned
The main mistake was not carefully checking the actual interaqt API before implementing. I made assumptions based on common patterns from other frameworks instead of following the documented API precisely.

## Next Steps
1. Fix all type errors by using correct interaqt API
2. Re-run type check to ensure clean compilation
3. Proceed with test implementation only after types are correct