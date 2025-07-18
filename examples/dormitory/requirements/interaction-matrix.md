# Dormitory Management System - Interaction Matrix

## Role-Based Interaction Access Matrix

| Interaction | Admin | Dorm Leader | Resident | Notes |
|-------------|-------|-------------|----------|-------|
| **CreateDormitory** | ✓ | ✗ | ✗ | Only admin can create dormitories |
| **AssignDormLeader** | ✓ | ✗ | ✗ | Only admin can assign leaders |
| **AssignUserToBed** | ✓ | ✗ | ✗ | Only admin can assign residents |
| **TransferUser** | ✓ | ✗ | ✗ | Only admin can transfer between beds |
| **ReportViolation** | ✓ | ✓* | ✗ | Leader only for their dorm residents |
| **SubmitKickoutRequest** | ✓ | ✓* | ✗ | Leader only for their dorm residents |
| **ApproveKickoutRequest** | ✓ | ✗ | ✗ | Only admin can approve/reject |
| **GetDormitoryDetails** | ✓ | ✓* | ✓* | Limited to own dorm for leaders/residents |
| **GetUserViolations** | ✓ | ✓* | ✓* | Limited access based on role |
| **GetPendingRequests** | ✓ | ✗ | ✗ | Only admin sees all pending requests |
| **UpdateDormitory** | ✓ | ✗ | ✗ | Only admin can modify dormitory info |
| **DeactivateUser** | ✓ | ✗ | ✗ | Only admin can deactivate accounts |

*\* Indicates role-specific restrictions apply*

## Interaction-to-Entity Mapping

### CreateDormitory
- **Creates**: Dormitory, BedSpace (multiple)
- **Updates**: None
- **Reads**: None required
- **Validation**: Capacity 4-6, unique name

### AssignDormLeader  
- **Creates**: None
- **Updates**: User (role), Dormitory (leaderId)
- **Reads**: User, Dormitory
- **Validation**: User exists, dormitory exists, user not already a leader

### AssignUserToBed
- **Creates**: Assignment
- **Updates**: BedSpace (isOccupied)
- **Reads**: User, BedSpace, existing Assignments
- **Validation**: User exists, bed available, user not already assigned

### ReportViolation
- **Creates**: Violation
- **Updates**: User (score deduction)
- **Reads**: User (current score), Dormitory (for permission check)
- **Validation**: Reporter has permission, target user exists

### SubmitKickoutRequest
- **Creates**: KickoutRequest
- **Updates**: None
- **Reads**: User, Assignment (to verify dorm association)
- **Validation**: Requester is leader of target's dorm

### ApproveKickoutRequest
- **Creates**: None
- **Updates**: KickoutRequest (status), Assignment (isActive), BedSpace (isOccupied)
- **Reads**: KickoutRequest, Assignment
- **Validation**: Request exists and pending

### GetDormitoryDetails
- **Creates**: None
- **Updates**: None  
- **Reads**: Dormitory, BedSpace, Assignment, User
- **Validation**: User has permission to view dormitory

## Permission Control Strategies

### Admin Role
- **Full Access**: Can perform all interactions
- **Global Scope**: Can manage any dormitory, user, or request
- **No Restrictions**: Bypasses most business rule limitations

### Dorm Leader Role
- **Limited Scope**: Only their assigned dormitory
- **Management Functions**: Report violations, submit kickout requests
- **Data Access**: View their dorm details and resident information
- **Restrictions**: Cannot create dorms, assign users, or approve requests

### Resident Role
- **View Only**: Limited read access to their own information
- **Personal Data**: Can view their own violations and assignment
- **Dorm Info**: Can view basic information about their dormitory
- **No Management**: Cannot perform any management operations

## Data Attributive Patterns

### User-Based Restrictions
```javascript
// Example: Leader can only report violations for their dorm residents
userAttributive: (user, event) => {
  if (user.role === 'admin') return true;
  if (user.role === 'leader') {
    // Check if target user is in leader's dormitory
    return checkUserInDormitory(event.payload.targetUserId, user.assignedDormitoryId);
  }
  return false;
}
```

### Payload Data Validation
```javascript
// Example: Validate dormitory capacity
dataAttributive: (payload) => {
  const capacity = payload.dormitoryData.capacity;
  return capacity >= 4 && capacity <= 6;
}
```

### State-Based Permissions
```javascript
// Example: Can only approve pending requests
dataAttributive: (payload, context) => {
  const request = context.getKickoutRequest(payload.requestId);
  return request && request.status === 'pending';
}
```

## Interaction Flow Dependencies

### Sequential Dependencies
1. **CreateDormitory** → **AssignDormLeader** → **AssignUserToBed**
2. **AssignUserToBed** → **ReportViolation** → **SubmitKickoutRequest** → **ApproveKickoutRequest**

### Conditional Dependencies
- **ReportViolation** triggers **SubmitKickoutRequest** when score drops below threshold
- **ApproveKickoutRequest** triggers **Assignment deactivation** when approved

### Data Consistency Requirements
- User can only be assigned to one bed at a time
- Dormitory can only have one active leader
- Bed space can only be occupied by one user
- Kickout requests must reference valid user-dormitory associations

## Error Handling Patterns

### Permission Errors
- Return specific error codes for unauthorized access
- Log security events for audit trails
- Provide meaningful error messages without exposing sensitive data

### Validation Errors  
- Check all business rules before data modification
- Return detailed validation failure reasons
- Maintain data integrity across all operations

### Concurrency Protection
- Handle simultaneous bed assignments
- Prevent duplicate leader appointments
- Ensure atomic operations for multi-step processes

This interaction matrix ensures complete coverage of all user operations with proper permission controls and clear business rule enforcement.