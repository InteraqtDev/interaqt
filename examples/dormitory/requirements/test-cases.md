# Dormitory Management System - Test Cases

## Test Organization Strategy

Tests are organized in three phases:
1. **Phase 1: Core Business Logic Tests** - Basic CRUD and state management
2. **Phase 2: Permission Tests** - Role-based access control
3. **Phase 3: Business Rule Tests** - Complex validations and constraints

---

## Phase 1: Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists
- **Input Data**: 
  ```
  name: "Building A - Room 301"
  capacity: 4
  floor: 3
  building: "A"
  ```
- **Expected Results**:
  1. New dormitory record created
  2. Dormitory status is 'active'
  3. Occupancy is 0
  4. Available beds equals capacity (4)
  5. 4 bed entities automatically created with status 'available'
  6. Beds are linked to the dormitory
- **Post Validation**: Dormitory appears in system dormitory list

### TC002: Assign User to Dormitory (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Preconditions**: 
  - Admin user exists
  - Target user exists with status 'active' and no dormitory
  - Dormitory exists with available beds
- **Input Data**:
  ```
  userId: "user-123"
  dormitoryId: "dorm-456"
  bedNumber: "A"
  ```
- **Expected Results**:
  1. UserDormitoryRelation created
  2. UserBedRelation created
  3. Bed status changes from 'available' to 'occupied'
  4. Dormitory occupancy increases by 1
  5. Available beds decreases by 1
  6. User can access dormitory via 'dormitory' property
  7. User can access bed via 'bed' property
- **Post Validation**: User appears in dormitory's user list

### TC003: Appoint Dorm Head (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **Preconditions**:
  - Admin user exists
  - Target user exists with status 'active'
  - Dormitory exists without a dorm head
- **Input Data**:
  ```
  userId: "user-789"
  dormitoryId: "dorm-456"
  ```
- **Expected Results**:
  1. User role changes to 'dormHead'
  2. DormitoryDormHeadRelation created
  3. User can access managed dormitory via 'managedDormitory' property
  4. Dormitory can access dorm head via 'dormHead' property
- **Post Validation**: User has dorm head permissions for the dormitory

### TC004: Issue Point Deduction (via IssuePointDeduction Interaction)
- **Interaction**: IssuePointDeduction
- **Preconditions**:
  - Issuer is admin or dorm head
  - Target user exists and is in a dormitory
- **Input Data**:
  ```
  targetUserId: "user-123"
  reason: "Excessive noise after 10 PM"
  points: 5
  category: "noise"
  description: "Multiple complaints from roommates"
  ```
- **Expected Results**:
  1. PointDeduction entity created
  2. UserPointDeductionRelation created
  3. DeductionIssuerRelation created
  4. Deduction status is 'active'
  5. User's total points increases by 5
  6. Timestamp recorded as deductedAt
- **Post Validation**: Deduction appears in user's deduction history

### TC005: Initiate Removal Request (via InitiateRemovalRequest Interaction)
- **Interaction**: InitiateRemovalRequest
- **Preconditions**:
  - Requester is dorm head of target user's dormitory
  - Target user has accumulated points >= 30
- **Input Data**:
  ```
  targetUserId: "user-123"
  reason: "Repeated violations and 35 accumulated points"
  ```
- **Expected Results**:
  1. RemovalRequest entity created
  2. Status is 'pending'
  3. RemovalRequestTargetRelation created
  4. RemovalRequestInitiatorRelation created
  5. totalPoints computed as 35
- **Post Validation**: Request appears in admin's pending requests

### TC006: Process Removal Request - Approval (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**:
  - Admin user exists
  - Removal request exists with status 'pending'
- **Input Data**:
  ```
  requestId: "request-001"
  decision: "approved"
  adminComment: "Multiple violations confirmed"
  ```
- **Expected Results**:
  1. RemovalRequest status changes to 'approved'
  2. processedAt timestamp recorded
  3. RemovalRequestAdminRelation created
  4. Target user status changes to 'removed'
  5. UserDormitoryRelation deleted
  6. UserBedRelation deleted
  7. Bed status changes to 'available'
  8. Dormitory occupancy decreases by 1
- **Post Validation**: User no longer has dormitory access

### TC007: Process Removal Request - Rejection (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**:
  - Admin user exists
  - Removal request exists with status 'pending'
- **Input Data**:
  ```
  requestId: "request-002"
  decision: "rejected"
  adminComment: "First offense, warning issued instead"
  ```
- **Expected Results**:
  1. RemovalRequest status changes to 'rejected'
  2. processedAt timestamp recorded
  3. RemovalRequestAdminRelation created
  4. Target user status remains 'active'
  5. User keeps dormitory and bed assignments
- **Post Validation**: User still has dormitory access

### TC008: Remove User from Dormitory Manually (via RemoveUserFromDormitory Interaction)
- **Interaction**: RemoveUserFromDormitory
- **Preconditions**:
  - Admin user exists
  - Target user is assigned to a dormitory
- **Input Data**:
  ```
  userId: "user-456"
  reason: "Voluntary withdrawal"
  ```
- **Expected Results**:
  1. UserDormitoryRelation deleted
  2. UserBedRelation deleted
  3. Bed status changes to 'available'
  4. Dormitory occupancy decreases
  5. User status may change based on reason
- **Post Validation**: User no longer appears in dormitory user list

### TC009: Update Dormitory Details (via UpdateDormitory Interaction)
- **Interaction**: UpdateDormitory
- **Preconditions**:
  - Admin user exists
  - Dormitory exists
- **Input Data**:
  ```
  dormitoryId: "dorm-456"
  name: "Building B - Room 302"
  status: "inactive"
  ```
- **Expected Results**:
  1. Dormitory name updated
  2. Dormitory status changed to 'inactive'
  3. Existing assignments remain unchanged
  4. Cannot assign new users to inactive dormitory
- **Post Validation**: Dormitory shows updated details

### TC010: Cancel Removal Request (via CancelRemovalRequest Interaction)
- **Interaction**: CancelRemovalRequest
- **Preconditions**:
  - Dorm head who initiated the request
  - Request status is 'pending'
- **Input Data**:
  ```
  requestId: "request-003"
  ```
- **Expected Results**:
  1. RemovalRequest status changes to 'cancelled'
  2. No changes to user status or assignments
- **Post Validation**: Request no longer in pending list

---

## Phase 2: Permission Tests

### TC011: Non-Admin Cannot Create Dormitory
- **Interaction**: CreateDormitory
- **Preconditions**: User logged in as student or dorm head
- **Input Data**: Valid dormitory data
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No dormitory created
- **Post Validation**: Dormitory count unchanged

### TC012: Student Cannot Issue Point Deduction
- **Interaction**: IssuePointDeduction
- **Preconditions**: User logged in as student
- **Input Data**: Valid deduction data
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No deduction created
- **Post Validation**: Target user's points unchanged

### TC013: Dorm Head Can Only Deduct Points in Own Dormitory
- **Interaction**: IssuePointDeduction
- **Preconditions**: 
  - User is dorm head of Dormitory A
  - Target user is in Dormitory B
- **Input Data**: Valid deduction data
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No deduction created
- **Post Validation**: Target user's points unchanged

### TC014: Only Dorm Head Can Initiate Removal for Their Dormitory
- **Interaction**: InitiateRemovalRequest
- **Preconditions**:
  - User is dorm head of Dormitory A
  - Target user is in Dormitory B
- **Input Data**: Valid removal request
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No removal request created
- **Post Validation**: No pending requests for target user

### TC015: Only Admin Can Process Removal Requests
- **Interaction**: ProcessRemovalRequest
- **Preconditions**: 
  - User logged in as dorm head or student
  - Pending removal request exists
- **Input Data**: Approval decision
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. Request status remains 'pending'
- **Post Validation**: Target user status unchanged

### TC016: Student Cannot View Other Users' Deductions
- **Interaction**: ViewUserDeductions
- **Preconditions**:
  - User logged in as student
  - Attempting to view another user's deductions
- **Input Data**: Other user's ID
- **Expected Results**:
  1. Interaction returns error or empty result
  2. No deduction details exposed
- **Post Validation**: Privacy maintained

---

## Phase 3: Business Rule Tests

### TC017: Cannot Create Dormitory with Invalid Capacity
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**: 
  ```
  name: "Test Dorm"
  capacity: 3  // Below minimum
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No dormitory created
- **Post Validation**: Dormitory list unchanged

### TC018: Cannot Create Dormitory with Excessive Capacity
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**:
  ```
  name: "Test Dorm"
  capacity: 7  // Above maximum
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No dormitory created
- **Post Validation**: Dormitory list unchanged

### TC019: Cannot Assign User to Full Dormitory
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin user logged in
  - Dormitory at full capacity (all beds occupied)
- **Input Data**: Valid user and dormitory IDs
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates dormitory is full
  3. No assignment created
- **Post Validation**: Dormitory occupancy unchanged

### TC020: Cannot Assign User Who Already Has Dormitory
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin user logged in
  - Target user already assigned to a dormitory
- **Input Data**: User ID and different dormitory ID
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user already assigned
  3. No new assignment created
- **Post Validation**: User remains in original dormitory

### TC021: Cannot Issue Invalid Point Amount
- **Interaction**: IssuePointDeduction
- **Preconditions**: Admin or dorm head logged in
- **Input Data**:
  ```
  points: 0  // Below minimum
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No deduction created
- **Post Validation**: User's points unchanged

### TC022: Cannot Issue Excessive Points
- **Interaction**: IssuePointDeduction
- **Preconditions**: Admin or dorm head logged in
- **Input Data**:
  ```
  points: 11  // Above maximum
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error type is 'condition check failed'
  3. No deduction created
- **Post Validation**: User's points unchanged

### TC023: Cannot Request Removal for User with Insufficient Points
- **Interaction**: InitiateRemovalRequest
- **Preconditions**:
  - Dorm head logged in
  - Target user has only 25 points (below threshold)
- **Input Data**: Valid removal request
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient points
  3. No removal request created
- **Post Validation**: No pending requests created

### TC024: Cannot Have Multiple Pending Removal Requests
- **Interaction**: InitiateRemovalRequest
- **Preconditions**:
  - Dorm head logged in
  - Pending removal request already exists for target user
- **Input Data**: New removal request for same user
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates existing pending request
  3. No new request created
- **Post Validation**: Only one pending request exists

### TC025: Cannot Assign to Inactive Dormitory
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin logged in
  - Target dormitory status is 'inactive'
- **Input Data**: Valid user and dormitory IDs
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates dormitory is inactive
  3. No assignment created
- **Post Validation**: Dormitory occupancy unchanged

### TC026: Cannot Assign Non-Existent Bed
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin logged in
  - Bed number doesn't exist in dormitory
- **Input Data**:
  ```
  bedNumber: "Z"  // Non-existent bed
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed not found
  3. No assignment created
- **Post Validation**: All beds maintain current status

### TC027: Automatic Point Calculation
- **Interaction**: Multiple IssuePointDeduction calls
- **Preconditions**: User has no deductions
- **Input Data**: Issue 3 deductions: 5, 10, 8 points
- **Expected Results**:
  1. After first: totalPoints = 5
  2. After second: totalPoints = 15
  3. After third: totalPoints = 23
  4. User.isRemovable = false (below 30)
- **Post Validation**: Total points correctly computed

### TC028: Removal Eligibility Threshold
- **Interaction**: IssuePointDeduction
- **Preconditions**: User has 28 points
- **Input Data**: New deduction of 5 points
- **Expected Results**:
  1. totalPoints becomes 33
  2. User.isRemovable changes to true
  3. Dorm head can now initiate removal
- **Post Validation**: Removal request can be created

---

## Test Data Setup

### Standard Test Users
```
Admin User: {
  id: 'admin-001',
  name: 'System Admin',
  email: 'admin@dorm.edu',
  role: 'admin',
  status: 'active'
}

Dorm Head User: {
  id: 'head-001',
  name: 'John Smith',
  email: 'john@dorm.edu',
  role: 'dormHead',
  status: 'active'
}

Student Users: [
  { id: 'student-001', name: 'Alice Brown', email: 'alice@dorm.edu' },
  { id: 'student-002', name: 'Bob Wilson', email: 'bob@dorm.edu' },
  { id: 'student-003', name: 'Carol Davis', email: 'carol@dorm.edu' },
  { id: 'student-004', name: 'David Lee', email: 'david@dorm.edu' }
]
```

### Standard Test Dormitories
```
Dormitory A: {
  id: 'dorm-001',
  name: 'Building A - Room 101',
  capacity: 4,
  status: 'active'
}

Dormitory B: {
  id: 'dorm-002',
  name: 'Building B - Room 201',
  capacity: 6,
  status: 'active'
}
```

---

## Test Execution Order

1. **Setup Phase**: Create base test data
2. **Phase 1**: Run all core business logic tests (TC001-TC010)
3. **Phase 2**: Run all permission tests (TC011-TC016)
4. **Phase 3**: Run all business rule tests (TC017-TC028)
5. **Cleanup Phase**: Reset test data

## Success Criteria

- All tests in Phase 1 must pass before proceeding to Phase 2
- All tests in Phase 2 must pass before proceeding to Phase 3
- 100% test pass rate required for production deployment
- No test should be skipped or marked as TODO

## Error Documentation

Any test failures should be documented in `docs/errors/` with:
- Test case ID
- Actual vs Expected behavior
- Error messages
- Stack traces
- Attempted fixes
- Resolution status
