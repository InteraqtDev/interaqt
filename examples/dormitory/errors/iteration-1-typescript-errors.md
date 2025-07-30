# Iteration 1: TypeScript Compilation Errors

## Error Summary
TypeScript compilation failed with 19 errors related to using string literals instead of Interaction instances in StateTransfer trigger properties.

## Root Cause
In StateTransfer.create(), the `trigger` parameter expects an `InteractionInstance`, but I was using string names like 'AssignDormHead' instead of the actual Interaction objects.

Similarly, in Count.create() and Summation.create(), the `record` parameter expects `EntityInstance | RelationInstance`, but I was using string names like 'UserDormitoryRelation'.

## Specific Errors
1. **Lines 122, 128, 160**: Using string 'AssignDormHead', 'RemoveDormHead', 'ApproveKickoutRequest' instead of actual Interaction instances
2. **Lines 185, 217, 265**: Using string 'UserDormitoryRelation', 'UserBedRelation' instead of actual Relation instances
3. **Lines 320, 333, 342**: Similar pattern repeated in other entities
4. **Lines 392, 448, 454, 484, 490**: More instances of string vs Interaction issues
5. **Lines 538, 572, 631, 665, 745**: Additional StateTransfer trigger errors

## Fix Strategy
1. Replace all string trigger names with actual Interaction instances
2. Replace all string record names with actual Entity/Relation instances  
3. Ensure proper forward declaration order since Interactions are defined after Entities/Relations

## Next Steps
- Need to reorganize code structure to handle forward references
- Consider using forward declaration pattern or restructuring the file organization
- Apply fixes systematically to all affected StateTransfer and computation instances