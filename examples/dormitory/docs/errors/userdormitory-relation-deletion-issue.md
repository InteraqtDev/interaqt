# UserDormitoryRelation Deletion Issue

## Error Description
UserDormitoryRelation is not being deleted when RemoveUserFromDormitory interaction is called. The relation remains even after the interaction completes.

## Test Output
```
AssertionError: expected { Object (id) } to be null
+ Received: 
{
  "id": "0198c186-1eda-71f8-bc5b-3829a50c8627",
}
```

## Attempted Fixes
1. Implemented StateMachine computation for UserDormitoryRelation with:
   - Create state when AssignUserToDormitory is triggered
   - Delete state when RemoveUserFromDormitory is triggered
   - Delete state when ProcessRemovalRequest is approved

## Issue Analysis
The StateMachine computation is likely not correctly matching the user to delete the relation. Need to debug the computeTarget function in the RemoveUserFromDormitory trigger.

## Related Issue
ProcessRemovalRequest test fails because RemovalRequestTargetRelation doesn't exist - it needs a computation to be created automatically with RemovalRequest.
