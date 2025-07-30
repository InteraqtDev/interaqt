# Iteration 2: API Usage Errors

## Error Summary
TypeScript compilation failed with 2 errors related to incorrect Summation API usage.

## Root Cause
Used `callback` parameter in `Summation.create()` which doesn't exist. According to the API reference, Summation only supports filtering through the `attributeQuery` path, not through callback functions.

## Specific Errors
1. **Line 1028**: UserDeductionRecordRelation summation with callback - Summation doesn't support callback parameter
2. **Line 1089**: DeductionRuleRecordRelation summation with callback - Same issue

## Fix Strategy
For conditional summation (only active records), I need to use a different approach:
1. Use WeightedSummation with weight=0 for inactive records
2. Or use Custom computation for complex filtering logic
3. Or handle filtering at the query level

## Correct Approach
Based on API reference, Summation.create() only accepts:
- `record`: Entity/Relation to sum from
- `attributeQuery`: Path to the field to sum
- `direction`: For relations ('source'/'target')

For conditional summing, should use WeightedSummation with weight calculation or Custom computation.

## Next Steps
Replace Summation with WeightedSummation that returns weight=0 for cancelled records and weight=points for active records.