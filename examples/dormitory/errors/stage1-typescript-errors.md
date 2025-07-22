# Stage 1: TypeScript Compilation Errors

## Error Details

During initial TypeScript compilation of `backend/index.ts`, encountered the following errors:

```
backend/index.ts(41,13): error TS2322: Type 'string' is not assignable to type 'InteractionInstance'.
backend/index.ts(99,9): error TS2322: Type 'string' is not assignable to type 'RelationInstance | EntityInstance'.
backend/index.ts(194,13): error TS2322: Type 'string' is not assignable to type 'InteractionInstance'.
backend/index.ts(199,13): error TS2322: Type 'string' is not assignable to type 'InteractionInstance'.
```

## Root Cause Analysis

1. **Line 41 & 194, 199**: Using string literals for trigger in StateTransfer.create() instead of actual InteractionInstance references
2. **Line 99**: Using string literal for record in Count.create() instead of RelationInstance or EntityInstance

## Issues Found

### Issue 1: StateMachine Triggers
- Used `trigger: 'PromoteToDormHead'` instead of `trigger: PromoteToDormHeadInteraction`
- Used `trigger: 'ProcessKickoutRequest'` instead of `trigger: ProcessKickoutRequestInteraction`

### Issue 2: Count Record Reference
- Used `record: 'UserDormitory'` instead of `record: UserDormitoryRelation`

### Issue 3: Custom Computation DataDeps
- Used string reference `'UserViolation'` in dataDeps instead of proper relation reference

## Solution Plan

1. Fix all trigger references to use actual InteractionInstance objects
2. Fix Count computation to use proper RelationInstance reference
3. Fix Custom computation dataDeps to use proper entity/relation references
4. Ensure all references are to properly declared variables

## Status
- **Stage**: Stage 1 - Core Business Logic Implementation
- **Priority**: High (blocking further development)
- **Next Steps**: Fix TypeScript errors and re-run compilation check