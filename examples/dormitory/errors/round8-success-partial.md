# Round 8: Partial Success - 2/10 Tests Passing

## Current Status
- TC002: ✅ Create Dormitory with Maximum Capacity  
- TC010: ✅ Create Violation Rule

## Remaining Issues

### TC001: Create Dormitory
- Beds are created successfully (4 beds)
- But occupancyCount shows 4 instead of 0
- The Count computation is counting all beds instead of occupied beds only

### TC003: Assign User to Bed
- UserBedRelation is created successfully
- But bed status is not updated to 'occupied'
- The action effect is not running or not updating the bed

### TC004: Assign Dorm Head
- User role is not being updated to 'dormHead'
- The action effect might not be running

### TC005: Record Violation
- Getting "Cannot read properties of undefined (reading 'points')"
- The ViolationRule lookup is failing

### TC006: Request Kickout
- Getting "Cannot read properties of undefined (reading 'id')"
- The UserBedRelation lookup is failing

### TC007-009: Various issues
- Dependent on earlier test fixes

## Key Finding
The action effects don't seem to be executing. This might be because:
1. The action needs to be properly linked to the interaction
2. The effect function might not be called in the framework
3. We might need a different approach to update entity states