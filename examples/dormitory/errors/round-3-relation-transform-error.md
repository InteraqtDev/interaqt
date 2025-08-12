# Error Round 3: Relation Transform entity not found

## Problem
When testing the DormitoryDormHeadRelation Transform, got this error:
```
entity Dormitory_dormHead_managedDormitory_User_source not found (computationName: Transform, handleName: RecordsTransformHandle)
```

This error occurs during the AppointDormHead interaction when the relation transform tries to create the dormitory-dormHead relationship.

## Root Cause Analysis
Looking at the error, the issue is with the relation Transform callback. The error suggests that the framework is looking for a table that doesn't exist.

The issue might be in the Transform callback return format. For relation computations, I'm returning:
```javascript
return {
  source: event.payload.dormitoryId, // dormitory ID
  target: event.payload.userId,      // user ID  
  appointedBy: event.user.name
}
```

But this might be the wrong format for Relation Transform computations.

## Hypothesis
The relation Transform might need a different return format, or I might need to use a different computation type for relations.

## Investigation Needed
1. Check the API reference for relation Transform computations
2. See if relations need StateMachine instead of Transform
3. Check if the return format should be different
4. Consider if I should use assignment pattern for relation computations

## Root Cause Identified
The issue was with the relation Transform callback return format. For relation computations, the return should use references to existing entities:

```javascript
return {
  source: { id: event.payload.dormitoryId }, // dormitory reference
  target: { id: event.payload.userId },      // user reference  
  appointedBy: event.user.name
}
```

Not direct ID strings.

## Additional Issue Found  
The UserDormitoryRelation and UserBedRelation computations were incorrectly using StateMachine. **StateMachines are for updating existing relations, not creating new ones**. For creating relations from interactions, Transform should be used.

## Solutions Implemented
1. Fixed DormitoryDormHeadRelation Transform return format - WORKING ✅
2. Need to replace UserDormitoryRelation and UserBedRelation StateMachines with Transforms

## Status
- [x] Error documented
- [x] Root cause identified  
- [x] DormitoryDormHeadRelation Transform fix implemented ✅
- [x] UserDormitoryRelation Transform fix implemented ✅
- [x] UserBedRelation Transform fix implemented ✅
- [x] All tests passing ✅

## Final Solution
Successfully replaced StateMachine with Transform computations for relation creation:

1. **DormitoryDormHeadRelation**: Transform from AppointDormHead interaction
2. **UserDormitoryRelation**: Transform from AssignUserToDormitory interaction  
3. **UserBedRelation**: Transform from AssignUserToDormitory interaction

All use correct format: `{ source: { id: sourceId }, target: { id: targetId } }`

## Key Learning
- **Transform** is for creating new entities/relations from interactions
- **StateMachine** is for updating existing entities/relations based on state transitions
- Use Transform for relation creation, StateMachine for relation state management