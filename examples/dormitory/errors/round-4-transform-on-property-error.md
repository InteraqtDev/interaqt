# Round 4: Transform on Property Error

## Problem
User.evictedAt Transform computation fails with:
```
cannot find Computation handle for Transform with context type property
```

## Analysis
This error occurs when trying to use Transform computation directly on a property. Based on previous experience:
- Transform computations work on entities (for entity creation)
- Transform computations work on relations (for relation creation) 
- Transform computations do NOT work on individual properties within entities

## Root Cause
The interaqt framework doesn't support Transform computations at the property level. Transform is designed for:
1. Entity-level: Creating entire entities from InteractionEventEntity
2. Relation-level: Creating relations from InteractionEventEntity  

## Investigation
Looking at successful patterns:
- ✅ Entity Transform: `Dormitory.computation = Transform.create(...)`
- ✅ Relation Transform: `UserDormitoryRelation.computation = Transform.create(...)`
- ❌ Property Transform: `User.properties[6].computation = Transform.create(...)` 

## Solutions
1. **Remove Property Transform**: Use defaultValue or basic field without computation
2. **Use StateMachine**: But this requires state-based values, not direct timestamps
3. **Entity-level computation**: Handle evictedAt at entity creation time (more complex)

## Fix Applied
Will remove the Transform computation from User.evictedAt property and use a simpler approach for timestamp handling.