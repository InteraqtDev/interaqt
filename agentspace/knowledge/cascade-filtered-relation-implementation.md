# Cascade Filtered Relation Implementation Analysis

## Current Filtered Relation Implementation

### Core Components

1. **Setup.ts (createRecord method)**
   - Lines 240-287: Handles filtered relation creation
   - Stores `isFilteredRelation`, `sourceRelationName`, and `matchExpression`
   - Already has logic to handle cascade filtering (lines 246-270)
   - Recursively resolves the base source entity/relation and combines match expressions
   - Stores `resolvedSourceRecordName` and `resolvedMatchExpression`

2. **AttributeQuery.ts**
   - Lines 137-149: Handles filtered relation queries
   - Detects filtered relations via `attributeInfo.isLinkFiltered()`
   - Merges matchExpressions from the filtered relation with query conditions
   - Rebases matchExpression to the correct context (source/target)

3. **MatchExp.ts**
   - `convertFilteredRelation` method: Converts filtered relation paths
   - Handles nested filtered relation attributes

4. **EntityToTableMap.ts**
   - RecordAttribute type includes `isFilteredRelation`, `matchExpression`, and `sourceRelationAttributeName`
   - RecordMapItem includes fields for both immediate and resolved source information

### Event Handling

From test analysis:
- When operating on a filtered relation, both the source relation and filtered relation emit events
- Events include create, update, and delete operations
- Each event contains the recordName and record data

### Cascade Filtering for Entities (Already Implemented)

The system already supports cascade filtered entities:
1. A filtered entity can use another filtered entity as its `sourceEntity`
2. Match expressions are combined (AND-ed) during resolution
3. `resolvedSourceRecordName` and `resolvedMatchExpression` are computed once during setup

## Implementation Plan for Cascade Filtered Relations

The good news is that the infrastructure for cascade filtering already exists and supports both entities and relations. The key areas to focus on:

1. **Test Coverage**: Write comprehensive tests for cascade filtered relations
2. **Validation**: Ensure the existing cascade logic properly handles relation chains
3. **Event Propagation**: Verify events are properly emitted for all levels of the cascade

The implementation should mostly "just work" since the createRecord method already handles `sourceRelation` in its cascade resolution logic. 