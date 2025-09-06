# Test Cases Based on Requirements Analysis

## Test Suite Organization
Based on the interactions identified in our requirements analysis:
- Total Interactions: 13
- Critical Priority: I001, I003, I004, I005, I006, I007, I008 (Core CRUD and workflow operations)
- High Priority: I009, I010, I011 (Administrative and monitoring functions)
- Medium Priority: I002, I012, I013 (Secondary management and self-service functions)

## Phase 1: Core Business Logic Tests

### TC001: CreateUser - Success Scenario
- **Interaction ID**: I001
- **Fulfills Requirements**: WR001, RR001
- **Role**: Global Administrator
- **Preconditions**: Administrator is authenticated and has valid permissions
- **Input Data**: 
  ```json
  {
    "username": "john_doe",
    "email": "john.doe@university.edu",
    "password": "SecurePass123!",
    "role": "regular_user",
    "fullName": "John Doe"
  }
  ```
- **Expected Results**:
  1. New user account is created with unique ID
  2. User appears in system user list (RR001)
  3. User can authenticate with provided credentials
  4. User role is correctly assigned
- **Post Validation**: ViewUserList (I009) should show the new user

### TC002: CreateUser - Validation Error Scenario
- **Interaction ID**: I001
- **Test Type**: Negative test for validation
- **Role**: Global Administrator
- **Preconditions**: System has existing users for uniqueness validation
- **Input Data**: 
  ```json
  {
    "username": "existing_user",
    "email": "invalid-email",
    "password": "weak",
    "role": "invalid_role",
    "fullName": ""
  }
  ```
- **Expected Results**:
  1. Interaction returns validation errors
  2. No user account is created
  3. Error messages indicate specific validation failures (unique username, valid email format, password strength, valid role)

### TC003: CreateDormitory - Success Scenario
- **Interaction ID**: I003
- **Fulfills Requirements**: WR003, RR002
- **Role**: Global Administrator
- **Preconditions**: Administrator is authenticated
- **Input Data**: 
  ```json
  {
    "name": "Building A - Floor 1",
    "bedCount": 6,
    "building": "Building A",
    "floor": 1
  }
  ```
- **Expected Results**:
  1. New dormitory is created with specified configuration
  2. Dormitory appears in system dormitory list (RR002)
  3. All beds are marked as available initially
  4. Occupancy counters are properly initialized
- **Post Validation**: ViewDormitoryList (I010) should show the new dormitory

### TC004: CreateDormitory - Bed Count Validation Error
- **Interaction ID**: I003
- **Test Type**: Negative test for business rule validation
- **Role**: Global Administrator
- **Preconditions**: Administrator is authenticated
- **Input Data**: 
  ```json
  {
    "name": "Invalid Dormitory",
    "bedCount": 8,
    "building": "Building B",
    "floor": 2
  }
  ```
- **Expected Results**:
  1. Interaction returns error indicating invalid bed count
  2. No dormitory is created
  3. Error message specifies bed count must be between 4-6

### TC005: AssignUserToBed - Success Scenario
- **Interaction ID**: I004
- **Fulfills Requirements**: WR004, RR003
- **Role**: Global Administrator
- **Preconditions**: 
  - User exists and is unassigned
  - Dormitory exists with available beds
- **Input Data**: 
  ```json
  {
    "userId": "user123",
    "dormitoryId": "dorm456",
    "bedNumber": 3
  }
  ```
- **Expected Results**:
  1. User is successfully assigned to specified bed
  2. User's profile shows dormitory assignment (RR008)
  3. Dormitory occupancy count is updated
  4. Bed is no longer available for assignment
- **Post Validation**: ViewUserList (I009) and ViewDormitoryList (I010) reflect the assignment

### TC006: AssignUserToBed - Double Assignment Error
- **Interaction ID**: I004
- **Test Type**: Negative test for constraint violation
- **Role**: Global Administrator
- **Preconditions**: User is already assigned to a bed
- **Input Data**: 
  ```json
  {
    "userId": "already_assigned_user",
    "dormitoryId": "dorm789",
    "bedNumber": 2
  }
  ```
- **Expected Results**:
  1. Interaction returns error indicating user already assigned
  2. No new assignment is created
  3. Original assignment remains unchanged

### TC007: ApplyScoreDeduction - Success Scenario
- **Interaction ID**: I005
- **Fulfills Requirements**: WR005, RR004
- **Role**: Dormitory Leader
- **Preconditions**: 
  - Leader is assigned to a dormitory
  - Target user is assigned to leader's dormitory
- **Input Data**: 
  ```json
  {
    "userId": "resident_user",
    "deductionAmount": 10,
    "reason": "Noise violation during quiet hours",
    "category": "noise"
  }
  ```
- **Expected Results**:
  1. Score deduction event is recorded
  2. User's current score is decreased by specified amount
  3. Score event appears in user's scoring history (RR004)
  4. Audit log entry is created
- **Post Validation**: ViewMyDormitoryUsers (I011) shows updated score

### TC008: ApplyScoreDeduction - Unauthorized Access Error
- **Interaction ID**: I005
- **Test Type**: Negative test for authorization
- **Role**: Dormitory Leader
- **Preconditions**: Leader attempts to deduct score from user in different dormitory
- **Input Data**: 
  ```json
  {
    "userId": "other_dorm_user",
    "deductionAmount": 15,
    "reason": "Unauthorized attempt",
    "category": "behavior"
  }
  ```
- **Expected Results**:
  1. Interaction returns authorization error
  2. No score deduction is applied
  3. No score event is created

### TC009: CreateRemovalRequest - Success Scenario
- **Interaction ID**: I006
- **Fulfills Requirements**: WR006, RR005
- **Role**: Dormitory Leader
- **Preconditions**: 
  - Target user's score is below removal threshold
  - No existing pending removal request for user
- **Input Data**: 
  ```json
  {
    "targetUserId": "problematic_user",
    "reason": "Repeated violations despite warnings, current score below threshold",
    "urgency": "high"
  }
  ```
- **Expected Results**:
  1. Removal request is created with pending status
  2. Request appears in removal requests list (RR005)
  3. Notification is sent to administrators
  4. Audit log entry is created
- **Post Validation**: Administrator can see request in pending status

### TC010: CreateRemovalRequest - Score Threshold Error
- **Interaction ID**: I006
- **Test Type**: Negative test for business rule validation
- **Role**: Dormitory Leader
- **Preconditions**: Target user's score is above removal threshold
- **Input Data**: 
  ```json
  {
    "targetUserId": "good_standing_user",
    "reason": "Personal dislike",
    "urgency": "low"
  }
  ```
- **Expected Results**:
  1. Interaction returns error indicating score above threshold
  2. No removal request is created
  3. Error message explains threshold requirement

### TC011: ProcessRemovalRequest - Approval Scenario
- **Interaction ID**: I007
- **Fulfills Requirements**: WR007, RR005
- **Role**: Global Administrator
- **Preconditions**: Pending removal request exists
- **Input Data**: 
  ```json
  {
    "requestId": "req123",
    "decision": "approved",
    "notes": "Reviewed evidence, removal justified due to multiple violations"
  }
  ```
- **Expected Results**:
  1. Request status is updated to approved
  2. User becomes eligible for removal
  3. Approval timestamp and notes are recorded
  4. Notifications are sent to relevant parties
- **Post Validation**: Request status change is visible in system

### TC012: ProcessRemovalRequest - Rejection Scenario
- **Interaction ID**: I007
- **Test Type**: Alternative flow test
- **Role**: Global Administrator
- **Preconditions**: Pending removal request exists
- **Input Data**: 
  ```json
  {
    "requestId": "req456",
    "decision": "rejected",
    "notes": "Insufficient evidence, recommend counseling instead"
  }
  ```
- **Expected Results**:
  1. Request status is updated to rejected
  2. User remains in dormitory assignment
  3. Rejection reason is recorded
  4. Notifications are sent explaining decision

### TC013: RemoveUserFromDormitory - Success Scenario
- **Interaction ID**: I008
- **Fulfills Requirements**: WR008, RR003
- **Role**: Global Administrator
- **Preconditions**: User has approved removal request or administrative override
- **Input Data**: 
  ```json
  {
    "userId": "removed_user",
    "effective": "2025-09-15T00:00:00Z"
  }
  ```
- **Expected Results**:
  1. User's bed assignment is removed
  2. Bed becomes available for new assignment (RR003)
  3. Dormitory occupancy count is decreased
  4. User profile shows no current assignment
- **Post Validation**: ViewDormitoryList (I010) shows freed bed

## Phase 2: Permission and Access Control Tests

### TC014: ViewUserList - Administrator Access
- **Interaction ID**: I009
- **Fulfills Requirements**: RR001
- **Role**: Global Administrator
- **Preconditions**: Administrator is authenticated
- **Input Data**: 
  ```json
  {
    "filters": {"role": "regular_user"},
    "sortBy": "fullName",
    "sortOrder": "asc"
  }
  ```
- **Expected Results**:
  1. Complete user list is returned with filtering and sorting applied
  2. All user fields are accessible
  3. Assignment and score information is included

### TC015: ViewUserList - Unauthorized Access
- **Interaction ID**: I009
- **Test Type**: Negative test for permission
- **Role**: Regular User
- **Preconditions**: Regular user attempts to access admin function
- **Input Data**: 
  ```json
  {
    "filters": {},
    "sortBy": "fullName",
    "sortOrder": "asc"
  }
  ```
- **Expected Results**:
  1. Interaction returns permission denied error
  2. No user data is returned
  3. Security event is logged

### TC016: ViewMyDormitoryUsers - Leader Access
- **Interaction ID**: I011
- **Fulfills Requirements**: RR007
- **Role**: Dormitory Leader
- **Preconditions**: Leader is assigned to a dormitory with residents
- **Input Data**: 
  ```json
  {}
  ```
- **Expected Results**:
  1. List of users in leader's dormitory is returned
  2. Current scores and assignment details are included
  3. Only users from leader's dormitory are visible

### TC017: ViewMyProfile - User Self-Service
- **Interaction ID**: I012
- **Fulfills Requirements**: RR008
- **Role**: Regular User
- **Preconditions**: User is authenticated
- **Input Data**: 
  ```json
  {}
  ```
- **Expected Results**:
  1. User's own profile information is returned
  2. Current dormitory assignment is shown
  3. Current behavior score is displayed
  4. No other users' information is accessible

## Phase 3: Business Rule Validation Tests

### TC018: AssignDormitoryLeader - Constraint Validation
- **Interaction ID**: I002
- **Fulfills Requirements**: WR002, RR001
- **Role**: Global Administrator
- **Preconditions**: User is currently assigned to a bed
- **Input Data**: 
  ```json
  {
    "userId": "bed_assigned_user",
    "dormitoryId": "target_dorm"
  }
  ```
- **Expected Results**:
  1. Interaction returns error indicating user cannot be leader while assigned to bed
  2. No leadership assignment is created
  3. Error message explains the constraint

### TC019: Multiple Leadership Assignment Prevention
- **Interaction ID**: I002
- **Test Type**: Negative test for business rule
- **Role**: Global Administrator
- **Preconditions**: Dormitory already has an assigned leader
- **Input Data**: 
  ```json
  {
    "userId": "potential_leader",
    "dormitoryId": "dormitory_with_leader"
  }
  ```
- **Expected Results**:
  1. Interaction returns error indicating dormitory already has leader
  2. No new leadership assignment is created
  3. Existing leadership assignment remains unchanged

### TC020: ViewAuditLog - Compliance Verification
- **Interaction ID**: I013
- **Fulfills Requirements**: RR006
- **Role**: Global Administrator
- **Preconditions**: System has recorded various actions
- **Input Data**: 
  ```json
  {
    "dateRange": {"start": "2025-09-01", "end": "2025-09-30"},
    "actionType": "user_assignment",
    "userId": null
  }
  ```
- **Expected Results**:
  1. Filtered audit log entries are returned
  2. All user assignment actions within date range are shown
  3. Each entry includes timestamp, actor, and details
  4. Data is sorted chronologically

## Traceability Matrix

| Test Case | Interaction | Requirements | Data Concepts |
|-----------|-------------|--------------|---------------|
| TC001, TC002 | I001 | WR001, RR001 | User |
| TC003, TC004 | I003 | WR003, RR002 | Dormitory |
| TC005, TC006 | I004 | WR004, RR003 | User, Dormitory, BedAssignment |
| TC007, TC008 | I005 | WR005, RR004 | User, ScoreEvent, UserScoring |
| TC009, TC010 | I006 | WR006, RR005 | User, RemovalRequest, RemovalRequesting |
| TC011, TC012 | I007 | WR007, RR005 | RemovalRequest |
| TC013 | I008 | WR008, RR003 | User, BedAssignment |
| TC014, TC015 | I009 | RR001 | User |
| TC016 | I011 | RR007 | User, Dormitory, DormitoryLeadership |
| TC017 | I012 | RR008 | User |
| TC018, TC019 | I002 | WR002, RR001 | User, Dormitory, DormitoryLeadership |
| TC020 | I013 | RR006 | AuditLog, AuditTracking |

## Test Execution Priority

### Phase 1 (Critical): TC001-TC013
Core business functionality that must work for system to be functional

### Phase 2 (High): TC014-TC017
Permission and access control ensuring security

### Phase 3 (Medium): TC018-TC020
Business rule enforcement and compliance features

## Test Data Requirements

- Minimum 10 test users with different roles
- At least 3 dormitories with varying occupancy
- Historical score events for behavioral testing
- Sample removal requests in different states
- Audit log entries spanning multiple action types