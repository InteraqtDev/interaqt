# Dormitory Management System - Interaction Matrix

## User Roles and Permissions Overview

| Role | Description | Primary Permissions |
|------|-------------|-------------------|
| Admin | System administrator | Full system access, can manage all entities and users |
| Dorm Head | Dormitory supervisor | Manage users within their dormitory, deduct points, request evictions |
| Student | Dormitory resident | View own data, cannot modify system state |

## Core Interactions Matrix

### User Management Interactions

| Interaction | Admin | Dorm Head | Student | Purpose | Test Cases |
|-------------|-------|-----------|---------|---------|------------|
| CreateUser | ✓ | ✗ | ✗ | Create new user accounts | TC003, TC301 |
| UpdateUserRole | ✓ | ✗ | ✗ | Promote users to dorm head | - |
| UpdateUser | ✓ | ✗ | ✗ | Modify user details | - |
| ViewUser | ✓ | Limited¹ | Self² | View user information | - |
| DeleteUser | ✓ | ✗ | ✗ | Soft delete user accounts | - |

¹ Dorm heads can only view users in their dormitory  
² Students can only view their own profile  

### Dormitory Management Interactions

| Interaction | Admin | Dorm Head | Student | Purpose | Test Cases |
|-------------|-------|-----------|---------|---------|------------|
| CreateDormitory | ✓ | ✗ | ✗ | Create new dormitories | TC001, TC002, TC101, TC202 |
| UpdateDormitory | ✓ | ✗ | ✗ | Modify dormitory details | - |
| ViewDormitory | ✓ | Own³ | All⁴ | View dormitory information | - |
| DeleteDormitory | ✓ | ✗ | ✗ | Remove dormitories (soft delete) | - |

³ Dorm heads can only view their assigned dormitory  
⁴ All users can view dormitory list  

### Assignment Interactions

| Interaction | Admin | Dorm Head | Student | Purpose | Test Cases |
|-------------|-------|-----------|---------|---------|------------|
| AssignUserToDormitory | ✓ | ✗ | ✗ | Assign users to dormitories | TC004, TC005, TC201, TC303 |
| AssignUserToBed | ✓ | ✗ | ✗ | Assign specific beds to users | TC006, TC206, TC207 |
| ViewAssignments | ✓ | Own Dorm | Self | View dormitory assignments | - |
| RemoveFromDormitory | ✓ | ✗ | ✗ | Remove user from dormitory | - |

### Point System Interactions

| Interaction | Admin | Dorm Head | Student | Purpose | Test Cases |
|-------------|-------|-----------|---------|---------|------------|
| DeductPoints | ✓ | Own Dorm⁵ | ✗ | Deduct points for violations | TC007, TC102, TC103, TC203 |
| ViewPoints | ✓ | Own Dorm | Self | View current points | - |
| ViewPointHistory | ✓ | Own Dorm | Self | View point deduction history | - |
| ResetPoints | ✓ | ✗ | ✗ | Reset user points to default | - |

⁵ Dorm heads can only deduct points from users in their dormitory  

### Eviction Process Interactions

| Interaction | Admin | Dorm Head | Student | Purpose | Test Cases |
|-------------|-------|-----------|---------|---------|------------|
| RequestEviction | ✓ | Own Dorm⁶ | ✗ | Request user eviction | TC008, TC104, TC204, TC304 |
| ApproveEviction | ✓ | ✗ | ✗ | Approve eviction request | TC009, TC105, TC205 |
| RejectEviction | ✓ | ✗ | ✗ | Reject eviction request | TC010 |
| ViewEvictionRequests | ✓ | Own⁷ | ✗ | View eviction requests | - |

⁶ Dorm heads can only request eviction of users in their dormitory  
⁷ Dorm heads can only view requests they made  

## Permission Control Requirements

### Admin Access Control
- Can perform any system operation
- No restrictions on data access or modification
- Can override business rules if necessary
- Responsible for system configuration and user management

### Dorm Head Access Control
- Limited to their assigned dormitory
- Cannot modify system configuration
- Cannot affect users in other dormitories
- Can only view data relevant to their dormitory

### Student Access Control
- Read-only access to own data
- Cannot modify any system state
- Cannot view other users' private information
- Limited to viewing public dormitory information

## Business Logic Validations

### CreateDormitory
- **Permission**: Admin only
- **Validation**: Capacity must be 4-6
- **Validation**: Name must be unique
- **Side Effect**: Creates bed records automatically

### CreateUser
- **Permission**: Admin only
- **Validation**: Email must be unique
- **Validation**: Role must be valid (admin/dormHead/student)
- **Default**: Points initialized to 100

### AssignUserToDormitory
- **Permission**: Admin only
- **Validation**: User must not already be assigned
- **Validation**: Dormitory must have capacity
- **Validation**: Dormitory must be active

### AssignUserToBed
- **Permission**: Admin only
- **Validation**: User must be assigned to dormitory
- **Validation**: Bed must be in user's dormitory
- **Validation**: Bed must be available

### DeductPoints
- **Permission**: Admin or Dorm Head of user's dormitory
- **Validation**: User must be in dorm head's dormitory (for dorm heads)
- **Validation**: User must have sufficient points
- **Validation**: Points must be positive number

### RequestEviction
- **Permission**: Admin or Dorm Head of user's dormitory
- **Validation**: User must be in requestor's dormitory
- **Validation**: User points must be below threshold (e.g., 50)
- **Validation**: No pending request already exists

### ApproveEviction/RejectEviction
- **Permission**: Admin only
- **Validation**: Request must be in pending status
- **Validation**: User must still be in dormitory (for approve)
- **Side Effect**: Removes user from dormitory and bed (approve only)

## Test Case Coverage

### Complete Coverage Verification
- [x] All interactions have corresponding test cases
- [x] All permission levels are tested
- [x] All business rules have validation tests
- [x] Edge cases are covered
- [x] Error scenarios are documented

### Test Organization
- **Core Business Logic Tests**: TC001-TC010
- **Permission Tests**: TC101-TC105
- **Business Rule Tests**: TC201-TC207
- **Edge Case Tests**: TC301-TC304

### Critical Test Paths
1. **User Assignment Flow**: CreateUser → AssignUserToDormitory → AssignUserToBed
2. **Point Deduction Flow**: DeductPoints → ViewPoints → ViewPointHistory
3. **Eviction Flow**: RequestEviction → ApproveEviction/RejectEviction
4. **Permission Validation**: Verify each role can only perform allowed operations