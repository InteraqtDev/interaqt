# Round 6 Error: Relation Entity Naming Issue

## Error Summary
Tests failing with: "entity User_currentBed_occupant_Bed_source not found"

## Error Details
When creating a UserBedRelation, the system is looking for an entity with a complex generated name that doesn't exist.

## Root Cause Analysis
The framework seems to be generating entity names based on the relation definition. The pattern appears to be:
- `{SourceEntity}_{sourceProperty}_{targetProperty}_{TargetEntity}_source`

In our case:
- Source: User
- sourceProperty: currentBed
- targetProperty: occupant
- Target: Bed
- Result: `User_currentBed_occupant_Bed_source`

This entity doesn't exist in our system.

## Possible Issues
1. The relation definition might be incorrect
2. The computation inside the relation might be causing issues
3. The framework might expect relations to be created differently

## Solution Attempts
Need to understand how the framework expects relations to work, possibly by:
1. Removing the computation from the relation
2. Creating relations through a different mechanism
3. Following the exact pattern from working examples