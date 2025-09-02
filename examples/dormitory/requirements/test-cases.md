# Test Cases Based on Requirements Analysis

## Test Suite Organization
Based on the interactions identified in our requirements analysis:
- Total Interactions: 13
- Critical Priority: I001, I003, I004, I005, I007, I008 (Core business logic)
- High Priority: I002, I006, I009, I010, I011 (Management operations)
- Medium Priority: I012, I013 (Reporting and self-service)

## Phase 1: Core Business Logic Tests

### TC001: CreateUser - Success Scenario
- **Interaction ID**: I001
- **Fulfills Requirements**: WR001, RR001
- **Role**: Global Administrator
- **Preconditions**: System is initialized, admin is authenticated
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
  1. New user account created successfully
  2. User appears in system user list (RR001)
  3. User has default score of 100
  4. User status is active
  5. Creation timestamp recorded
- **Post Validation**: User can be retrieved via ViewUserList interaction

### TC002: CreateUser - Validation Error Scenarios
- **Interaction ID**: I001
- **Test Type**: Negative test for validation
- **Role**: Global Administrator
- **Preconditions**: System has existing user with username "existing_user"
- **Input Data**: Various invalid payloads (duplicate username, invalid email, invalid role)
- **Expected Results**:
  1. Interaction returns appropriate error messages
  2. No user account is created
  3. System maintains data integrity

### TC003: CreateDormitory - Success Scenario
- **Interaction ID**: I003
- **Fulfills Requirements**: WR003, RR002
- **Role**: Global Administrator
- **Preconditions**: System is initialized, admin is authenticated
- **Input Data**:
  ```json
  {
    "name": "Building A - Room 101",
    "bedCount": 4,
    "building": "Building A",
    "floor": 1
  }
  ```
- **Expected Results**:
  1. New dormitory created with 4 beds
  2. All beds are initially unoccupied
  3. occupiedBeds = 0, availableBeds = 4
  4. Dormitory appears in dormitory list (RR002)
- **Post Validation**: Dormitory shows in ViewDormitoryList with correct bed counts

### TC004: CreateDormitory - Invalid Bed Count
- **Interaction ID**: I003
- **Test Type**: Negative test for business rule validation
- **Role**: Global Administrator
- **Preconditions**: System is initialized, admin is authenticated
- **Input Data**:
  ```json
  {
    "name": "Invalid Room",
    "bedCount": 3,
    "building": "Building B",
    "floor": 2
  }
  ```
- **Expected Results**:
  1. Error returned: "Bed count must be between 4 and 6 inclusive"
  2. No dormitory created
  3. System data unchanged

### TC005: AssignUserToBed - Success Scenario
- **Interaction ID**: I004
- **Fulfills Requirements**: WR004, RR003
- **Role**: Global Administrator
- **Preconditions**: 
  - Active user exists with no current assignment
  - Dormitory exists with available beds
- **Input Data**:
  ```json
  {
    "userId": "user_123",
    "dormitoryId": "dorm_456",
    "bedNumber": 1
  }
  ```
- **Expected Results**:
  1. BedAssignment relation created
  2. User's assignment status updated
  3. Dormitory occupiedBeds incremented, availableBeds decremented
  4. Assignment timestamp recorded
- **Post Validation**: User shows assigned status in ViewUserList, bed shows occupied in ViewDormitoryList

### TC006: AssignUserToBed - Bed Already Occupied
- **Interaction ID**: I004
- **Test Type**: Negative test for constraint validation
- **Role**: Global Administrator
- **Preconditions**: Bed is already occupied by another user
- **Input Data**: Assignment to occupied bed
- **Expected Results**:
  1. Error returned: "Bed must exist and be unoccupied"
  2. No assignment created
  3. Existing assignment unchanged

### TC007: ApplyScoreDeduction - Success Scenario
- **Interaction ID**: I005
- **Fulfills Requirements**: WR005, RR004
- **Role**: Dormitory Leader
- **Preconditions**: 
  - User is assigned to leader's dormitory
  - Leader is authenticated and assigned to dormitory
- **Input Data**:
  ```json
  {
    "userId": "user_123",
    "deductionAmount": 10,
    "reason": "Late return to dormitory",
    "category": "curfew_violation"
  }
  ```
- **Expected Results**:
  1. ScoreEvent created with deduction details
  2. User's currentScore reduced by deduction amount
  3. Score event appears in user's scoring history (RR004)
  4. Timestamp recorded for audit trail
- **Post Validation**: User score reflects deduction in ViewMyDormitoryUsers

### TC008: ApplyScoreDeduction - User Not in Leader's Dormitory
- **Interaction ID**: I005
- **Test Type**: Negative test for permission validation
- **Role**: Dormitory Leader
- **Preconditions**: User is assigned to different dormitory
- **Input Data**: Attempt to deduct score for user in other dormitory
- **Expected Results**:
  1. Error returned: "User must be assigned to requester's dormitory"
  2. No score event created
  3. User score unchanged

### TC009: CreateRemovalRequest - Success Scenario
- **Interaction ID**: I006
- **Fulfills Requirements**: WR006, RR005
- **Role**: Dormitory Leader
- **Preconditions**: 
  - Target user's score is below removal threshold (e.g., < 50)
  - User is assigned to leader's dormitory
- **Input Data**:
  ```json
  {
    "targetUserId": "user_123",
    "reason": "Repeated policy violations and low behavior score",
    "urgency": "high"
  }
  ```
- **Expected Results**:
  1. RemovalRequest created with pending status
  2. Request appears in pending requests list (RR005)
  3. Creation timestamp recorded
- **Post Validation**: Request shows in system for administrator review

### TC010: CreateRemovalRequest - Score Above Threshold
- **Interaction ID**: I006
- **Test Type**: Negative test for business rule validation
- **Role**: Dormitory Leader
- **Preconditions**: Target user's score is above removal threshold
- **Input Data**: Removal request for user with acceptable score
- **Expected Results**:
  1. Error returned: "Target user's score must be below removal threshold"
  2. No removal request created

### TC011: ProcessRemovalRequest - Approval Scenario
- **Interaction ID**: I007
- **Fulfills Requirements**: WR007, RR005
- **Role**: Global Administrator
- **Preconditions**: Pending removal request exists
- **Input Data**:
  ```json
  {
    "requestId": "request_789",
    "decision": "approved",
    "notes": "Score consistently below threshold, multiple violations confirmed"
  }
  ```
- **Expected Results**:
  1. Request status updated to "approved"
  2. Processing timestamp recorded
  3. Notes stored for audit trail
  4. Request no longer appears in pending list
- **Post Validation**: Request status updated, can proceed with user removal

### TC012: ProcessRemovalRequest - Rejection Scenario
- **Interaction ID**: I007
- **Test Type**: Alternative flow test
- **Role**: Global Administrator
- **Preconditions**: Pending removal request exists
- **Input Data**:
  ```json
  {
    "requestId": "request_789",
    "decision": "rejected",
    "notes": "Insufficient evidence, recommend additional counseling instead"
  }
  ```
- **Expected Results**:
  1. Request status updated to "rejected"
  2. Processing timestamp recorded
  3. Rejection notes stored
  4. User remains in dormitory assignment

### TC013: RemoveUserFromDormitory - Success Scenario
- **Interaction ID**: I008
- **Fulfills Requirements**: WR008, RR003
- **Role**: Global Administrator
- **Preconditions**: 
  - User has current bed assignment
  - Approved removal request exists OR administrative override
- **Input Data**:
  ```json
  {
    "userId": "user_123",
    "effective": "2025-09-03"
  }
  ```
- **Expected Results**:
  1. BedAssignment relation removed
  2. User no longer shows dormitory assignment
  3. Bed becomes available for new assignment
  4. Dormitory bed counts updated
- **Post Validation**: Bed shows available in ViewDormitoryList, user shows unassigned

## Phase 2: Permission and Access Control Tests

### TC014: Role-Based Access Control - Administrator Actions
- **Interaction IDs**: I001, I002, I003, I004, I007, I008, I009, I010, I013
- **Test Type**: Permission validation
- **Role**: Global Administrator
- **Preconditions**: User authenticated with administrator role
- **Expected Results**: All administrative interactions succeed with valid data

### TC015: Role-Based Access Control - Dormitory Leader Restrictions
- **Interaction IDs**: I005, I006, I010, I011, I012
- **Test Type**: Permission validation  
- **Role**: Dormitory Leader
- **Preconditions**: User authenticated with dormitory_leader role
- **Expected Results**: 
  1. Can perform allowed interactions for own dormitory
  2. Cannot access administrative functions (I001, I003, etc.)
  3. Cannot perform actions on other dormitories

### TC016: Role-Based Access Control - Regular User Limitations
- **Interaction IDs**: I012 (only)
- **Test Type**: Permission validation
- **Role**: Regular User
- **Preconditions**: User authenticated with regular_user role
- **Expected Results**:
  1. Can view own profile only
  2. Cannot perform any administrative or leadership actions
  3. All other interactions return permission errors

### TC017: ViewMyDormitoryUsers - Scope Limitation Test
- **Interaction ID**: I011
- **Test Type**: Data access boundary test
- **Role**: Dormitory Leader
- **Preconditions**: Leader assigned to specific dormitory with users
- **Expected Results**:
  1. Returns only users from leader's assigned dormitory
  2. Does not include users from other dormitories
  3. Includes current scores and assignment details

## Phase 3: Business Rule Validation Tests

### TC018: Unique Constraint Validations
- **Interactions**: I001 (username/email), I003 (dormitory name)
- **Test Type**: Data integrity validation
- **Expected Results**: System prevents duplicate usernames, emails, and dormitory names

### TC019: Bed Assignment Constraints
- **Interaction**: I004
- **Test Type**: Business rule validation
- **Scenarios**:
  1. User already assigned to a bed (should fail)
  2. Bed number exceeds dormitory capacity (should fail)
  3. Multiple users assigned to same bed (should fail)

### TC020: Score Threshold Business Rules
- **Interactions**: I005, I006
- **Test Type**: Scoring system validation
- **Scenarios**:
  1. Score deductions apply correctly to running total
  2. Removal threshold enforcement
  3. Score cannot go below zero

### TC021: Dormitory Leadership Assignment Rules
- **Interaction**: I002
- **Test Type**: Assignment constraint validation
- **Scenarios**:
  1. User cannot be leader if already assigned to bed
  2. Dormitory cannot have multiple leaders
  3. Leader role assignment updates user permissions

### TC022: Workflow State Validations
- **Interactions**: I006, I007, I008
- **Test Type**: State transition validation
- **Expected Results**:
  1. Removal requests follow proper pending -> approved/rejected flow
  2. User removal requires approved request or override
  3. Cannot process already processed requests

## Phase 4: Integration and End-to-End Tests

### TC023: Complete User Lifecycle Test
- **Interactions**: I001 -> I004 -> I005 -> I006 -> I007 -> I008
- **Test Type**: End-to-end workflow
- **Scenario**: Full lifecycle from user creation to removal
- **Expected Results**: Each step properly enables the next with consistent data

### TC024: Dormitory Management Workflow
- **Interactions**: I003 -> I002 -> I004 -> I005 -> I011
- **Test Type**: End-to-end management workflow  
- **Scenario**: Create dormitory, assign leader, assign users, manage scoring
- **Expected Results**: Complete dormitory setup and management functions properly

### TC025: Audit Trail Verification
- **Interaction**: I013
- **Test Type**: Compliance and tracking validation
- **Expected Results**:
  1. All significant actions logged with proper details
  2. Timestamps accurate and sequential
  3. User actions traceable through audit log

## Traceability Matrix

| Test Case | Interaction | Requirements | Data Concepts |
|-----------|-------------|--------------|---------------|
| TC001, TC002 | I001 | WR001, RR001 | User |
| TC003, TC004 | I003 | WR003, RR002 | Dormitory |
| TC005, TC006 | I004 | WR004, RR003 | User, Dormitory, BedAssignment |
| TC007, TC008 | I005 | WR005, RR004 | User, ScoreEvent, UserScoring |
| TC009, TC010 | I006 | WR006, RR005 | RemovalRequest, RemovalRequesting |
| TC011, TC012 | I007 | WR007, RR005 | RemovalRequest |
| TC013 | I008 | WR008, RR003 | BedAssignment |
| TC014-TC016 | Various | Permission requirements | Role-based access |
| TC017 | I011 | RR007 | User, Dormitory, BedAssignment |
| TC018-TC022 | Various | Business rule validation | Multiple entities |
| TC023-TC025 | Multiple | Integration requirements | All concepts |

## Test Data Requirements

### Users
- Administrator account: admin@university.edu
- Dormitory leader account: leader1@university.edu  
- Regular user accounts: user1@university.edu, user2@university.edu, user3@university.edu
- User with low score (for removal testing): lowscore@university.edu

### Dormitories
- Building A Room 101 (4 beds)
- Building A Room 102 (6 beds)
- Building B Room 201 (5 beds)

### Score Events
- Various deduction categories and amounts
- Score history for threshold testing

### System Settings
- Removal threshold: 50
- Bed count limits: 4-6
- Score deduction categories: curfew_violation, noise_complaint, cleanliness_issue, property_damage