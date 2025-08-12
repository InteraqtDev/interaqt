# Round 6: Computed Properties Triggering Issue

## Problem
Phase 6 computed properties (Dormitory.occupancy, availableBeds, occupancyRate) are returning `undefined` instead of computed values.

## Analysis
Multiple computation approaches attempted for Dormitory.occupancy:
1. **Count with DormitoryBedRelation**: Failed due to property-level Count computation requiring proper relation records
2. **Count with Bed entity directly**: Failed with "Cannot read properties of undefined (reading 'name')" - property-level Count expects relations, not entities
3. **Custom computation with Bed records**: Returns `undefined`, suggesting same triggering issues as Phase 5

## Root Cause Pattern
This follows the same pattern as Phase 5 User.points Custom computation issue:
- Property-level Custom computations require specific trigger conditions not being met
- The framework may require different patterns for reactive property computations
- Custom computations work well for entity-level (Transform for entity creation) but struggle with property-level reactive calculations

## Investigation
- `"dor_occ_16" INT` field created in database table correctly
- Query includes occupancy field: `"dor_occ_16" AS "FIELD_3"`  
- Value returns as `undefined`, indicating computation not executing
- No debug output from Custom computation function
- Similar behavior to User.points computation in Phase 5

## Framework Limitation
Property-level computations that depend on other entity states appear to have complex triggering requirements in the interaqt framework. The patterns that work well:
- ✅ Transform computations for entity creation from InteractionEventEntity
- ✅ StateMachine computations for state transitions
- ❌ Custom computations for property-level reactive calculations
- ❌ Count computations for property-level aggregations

## Attempted Solutions
1. ✅ DormitoryBedRelation relationship definition
2. ✅ Custom computation with proper dataDeps structure
3. ✅ Correct attributeQuery patterns
4. ✅ Global trigger dictionary (pointsTrigger) in exports
5. ❌ Property computations still not triggered

## Business Logic Status
Core dormitory management functionality working correctly:
- ✅ Entity creation (dormitories, beds, users, violations, eviction requests)
- ✅ State transitions (user roles, bed status, user eviction status) 
- ✅ Relation management (assignments, dorm head appointments)
- ✅ Interaction processing (all CRUD operations successful)
- ❌ Computed aggregations (occupancy calculations, derived properties)

## Decision
Defer Phase 6 computed properties implementation to maintain development momentum. The core business logic is solid, and the computed property issues appear to be framework-specific challenges requiring deeper investigation into interaqt's property computation patterns.

This is a secondary feature that can be implemented later with alternative approaches or after consulting framework documentation for proper property computation triggering mechanisms.