# Interaction Matrix - Dormitory Management System

## Overview
This document maps all interactions to their corresponding permissions, business rules, and test cases to ensure complete coverage.

## Interaction Matrix

| Interaction | Description | Allowed Roles | Business Rules | Test Cases |
|-------------|-------------|---------------|----------------|------------|
| **CreateDormitory** | Create new dormitory with beds | Admin only | - Capacity must be 4-6<br>- Auto-create beds 1 to capacity | TC001, TC101, TC201 |
| **AssignDormHead** | Assign user as dormitory head | Admin only | - Target user must exist<br>- User's role changes to 'dormHead' | TC002, TC102 |
| **RemoveDormHead** | Remove dormitory head assignment | Admin only | - User must be current dormHead<br>- Role reverts to 'student' | TC009 |
| **AssignUserToBed** | Assign student to specific bed | Admin only | - Bed must be available<br>- User cannot already have a bed<br>- Creates user-bed and user-dormitory relations | TC003, TC202, TC203 |
| **RemoveUserFromBed** | Remove student from bed | Admin only | - User must have bed assignment<br>- Bed becomes available after removal | TC008 |
| **RecordPointDeduction** | Deduct points for violations | DormHead (own dorm only) | - Can only deduct from residents<br>- Points must be positive<br>- User points cannot go below 0 | TC004, TC103, TC104, TC205, TC207 |
| **SubmitKickOutApplication** | Apply to kick out user | DormHead (own dorm only) | - Target must be resident of managed dorm<br>- Application starts as 'pending' | TC005, TC204 |
| **ProcessKickOutApplication** | Approve/reject kick-out | Admin only | - Application must be 'pending'<br>- If approved: user status→'kickedOut', bed→available<br>- If rejected: no changes | TC006, TC007, TC105, TC206 |

## Permission Control Details

### Role-Based Access Control
1. **Admin Role**:
   - Full system access
   - Can manage dormitories, assignments, and applications
   - Cannot record point deductions (domain of dorm heads)

2. **DormHead Role**:
   - Manage assigned dormitory only
   - Record point deductions for residents
   - Submit kick-out applications for residents
   - Cannot access other dormitories' data

3. **Student Role**:
   - View own information only
   - No write permissions
   - Cannot perform any management actions

### Scope-Based Permissions
1. **Dormitory Scope**:
   - DormHeads can only act on their managed dormitory
   - Students can only view their assigned dormitory

2. **User Scope**:
   - Point deductions only for users in same dormitory
   - Kick-out applications only for users in same dormitory

## Business Rule Validations

### Data Integrity Rules
1. **Unique Assignments**:
   - One user → one bed maximum
   - One bed → one user maximum
   - One user → one dormitory (through bed)

2. **Capacity Constraints**:
   - Dormitory: 4-6 beds only
   - Cannot exceed dormitory capacity
   - Bed numbers: 1 to capacity

3. **State Consistency**:
   - Bed status syncs with occupancy
   - User status reflects kick-out state
   - Application status prevents double-processing

### Business Logic Rules
1. **Point System**:
   - Initial points: 100
   - Minimum points: 0 (no negative)
   - Only positive deductions allowed

2. **Kick-Out Process**:
   - Only for low-point users (typically < 30)
   - Requires dorm head application
   - Requires admin approval
   - Automatically frees bed on approval

3. **Assignment Rules**:
   - Must assign to available bed only
   - Cannot reassign without removal
   - Dorm head must be dormitory resident (future enhancement)

## Test Coverage Analysis

### Core Functionality Coverage
- ✓ All CRUD operations tested
- ✓ All entity relationships tested
- ✓ All computed properties tested
- ✓ All state transitions tested

### Permission Coverage
- ✓ Admin-only operations tested
- ✓ DormHead-only operations tested
- ✓ Cross-dormitory restrictions tested
- ✓ Student restrictions tested

### Business Rule Coverage
- ✓ Capacity limits tested
- ✓ Assignment uniqueness tested
- ✓ Point system constraints tested
- ✓ State transition rules tested
- ✓ Data validation tested

## Implementation Notes

### Stage 1 - Core Business Logic
Focus on making all basic operations work:
- Entity creation and relationships
- Basic CRUD without restrictions
- Computed properties functioning
- State transitions working

### Stage 2 - Permissions & Business Rules
Add restrictions after core logic works:
- Role-based access control
- Scope-based permissions
- Business rule validations
- Error handling for violations

### Critical Success Factors
1. **Proper Role Assignment**: Even in Stage 1, create users with correct roles
2. **Valid Test Data**: Use data that will pass Stage 2 validations
3. **Complete Relations**: Ensure all entity relationships are properly established
4. **Computation Accuracy**: Verify all computed values update correctly 