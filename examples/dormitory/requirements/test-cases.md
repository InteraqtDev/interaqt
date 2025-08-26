# Dormitory Management System - Test Cases

## Test Case Organization
Test cases are organized in phases to ensure proper system validation:
1. **Phase 1: Core Business Logic** - Basic functionality without permissions
2. **Phase 2: Permission Tests** - Role-based access control validation
3. **Phase 3: Business Rule Tests** - Complex business logic and constraints

---

## Phase 1: Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**: 
  - name: "Building A - Room 101"
  - bedCount: 4
- **Expected Results**:
  1. New dormitory entity created
  2. Dormitory.name = "Building A - Room 101"
  3. Dormitory.bedCount = 4
  4. Dormitory.createdAt = current timestamp
  5. Dormitory.occupancy computed as 0
  6. Dormitory.availableBeds computed as 4
- **Post Validation**: Dormitory appears in system dormitory list

### TC002: Create Dormitory with Invalid Bed Count (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**:
  - name: "Building B - Room 201"
  - bedCount: 8 (exceeds maximum)
- **Expected Results**:
  1. Interaction returns validation error
  2. Error message: "Bed count must be between 4 and 6"
  3. No dormitory entity created
- **Negative Test**: Validates bed capacity constraints

### TC003: Assign Dormitory Head (via AssignDormitoryHead Interaction)
- **Interaction**: AssignDormitoryHead
- **Preconditions**: 
  - Admin user logged in
  - Dormitory exists (id: "dorm-001")
  - Regular user exists (id: "user-001")
- **Input Data**:
  - dormitoryId: "dorm-001"
  - userId: "user-001"
- **Expected Results**:
  1. DormitoryHeadRelation created
  2. Dormitory.dormHead points to user-001
  3. User.headOfDormitory points to dorm-001
  4. User.isAdmin remains false
- **Post Validation**: User appears as dormitory head in dormitory info

### TC004: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin user logged in
  - Dormitory exists with 4 beds (id: "dorm-001")
  - User exists without bed assignment (id: "user-002")
- **Input Data**:
  - userId: "user-002"
  - dormitoryId: "dorm-001"
  - bedNumber: 2
- **Expected Results**:
  1. BedAssignment entity created
  2. BedAssignment.bedNumber = 2
  3. BedAssignment.assignedAt = current timestamp
  4. BedAssignment.removedAt = null
  5. User.bedAssignment points to new assignment
  6. Dormitory.occupancy increments to 1
  7. Dormitory.availableBeds decrements to 3
- **Post Validation**: User appears in dormitory resident list

### TC005: Attempt Duplicate Bed Assignment (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - User already assigned to bed 2 in dorm-001
- **Input Data**:
  - userId: "user-002" (same user)
  - dormitoryId: "dorm-002"
  - bedNumber: 1
- **Expected Results**:
  1. Interaction returns error
  2. Error message: "User already assigned to a bed"
  3. No new BedAssignment created
  4. User remains in original bed
- **Negative Test**: Validates single assignment rule

### TC006: Deduct Points (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**:
  - Dormitory head logged in (id: "user-001")
  - Target user in same dormitory (id: "user-002", points: 100)
- **Input Data**:
  - userId: "user-002"
  - reason: "Late return after curfew"
  - points: 10
- **Expected Results**:
  1. PointDeduction entity created
  2. PointDeduction.reason = "Late return after curfew"
  3. PointDeduction.points = 10
  4. PointDeduction.createdBy points to user-001
  5. User.points decrements from 100 to 90
  6. User.totalDeductions computed as 10
- **Post Validation**: Deduction appears in user's history

### TC007: Request User Removal (via RequestUserRemoval Interaction)
- **Interaction**: RequestUserRemoval
- **Preconditions**:
  - Dormitory head logged in (id: "user-001")
  - Target user has low points (id: "user-003", points: 15)
  - User-003 is in head's dormitory
- **Input Data**:
  - userId: "user-003"
  - reason: "Multiple violations and uncooperative behavior"
- **Expected Results**:
  1. RemovalRequest entity created
  2. RemovalRequest.status = "pending"
  3. RemovalRequest.reason = provided reason
  4. RemovalRequest.targetUser points to user-003
  5. RemovalRequest.requestedBy points to user-001
  6. RemovalRequest.dormitory points to the dormitory
  7. RemovalRequest.isPending computed as true
- **Post Validation**: Request appears in admin's pending list

### TC008: Process Removal Request - Approve (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**:
  - Admin logged in
  - Pending removal request exists (id: "request-001")
- **Input Data**:
  - removalRequestId: "request-001"
  - decision: "approved"
  - comment: "Verified violations, removal approved"
- **Expected Results**:
  1. RemovalRequest.status updates to "approved"
  2. RemovalRequest.processedAt = current timestamp
  3. AdminComment entity created with decision and comment
  4. BedAssignment.removedAt set to current timestamp
  5. User.bedAssignment becomes null
  6. Dormitory.occupancy decrements
  7. Dormitory.availableBeds increments
- **Post Validation**: User no longer appears in dormitory residents

### TC009: Process Removal Request - Reject (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**:
  - Admin logged in
  - Pending removal request exists (id: "request-002")
- **Input Data**:
  - removalRequestId: "request-002"
  - decision: "rejected"
  - comment: "First offense, warning issued instead"
- **Expected Results**:
  1. RemovalRequest.status updates to "rejected"
  2. RemovalRequest.processedAt = current timestamp
  3. AdminComment entity created with decision and comment
  4. BedAssignment remains unchanged (removedAt still null)
  5. User remains in dormitory
- **Post Validation**: User still appears in dormitory residents

---

## Phase 2: Permission Tests

### TC010: Non-Admin Attempts Create Dormitory
- **Interaction**: CreateDormitory
- **Preconditions**: Regular user logged in (not admin)
- **Input Data**: Valid dormitory data
- **Expected Results**:
  1. Interaction returns permission error
  2. Error message: "Admin permission required"
  3. No dormitory created
- **Permission Test**: Validates admin-only access

### TC011: Regular User Attempts Point Deduction
- **Interaction**: DeductPoints
- **Preconditions**: Regular user logged in (not dormitory head)
- **Input Data**: Valid deduction data
- **Expected Results**:
  1. Interaction returns permission error
  2. Error message: "Must be admin or dormitory head"
  3. No point deduction created
- **Permission Test**: Validates authority hierarchy

### TC012: Dormitory Head Deducts Points Outside Their Dormitory
- **Interaction**: DeductPoints
- **Preconditions**:
  - Dormitory head of dorm-001 logged in
  - Target user in dorm-002
- **Input Data**: userId from different dormitory
- **Expected Results**:
  1. Interaction returns permission error
  2. Error message: "Can only deduct points from residents in your dormitory"
  3. No deduction created
- **Permission Test**: Validates scope limitation

### TC013: User Views Own Status
- **Interaction**: ViewMyStatus
- **Preconditions**: Any authenticated user
- **Expected Results**:
  1. Returns user's profile data
  2. Shows current bed assignment (if any)
  3. Shows current points
  4. Lists point deduction history
- **Permission Test**: Validates self-access permission

---

## Phase 3: Business Rule Tests

### TC014: Request Removal with High Points
- **Interaction**: RequestUserRemoval
- **Preconditions**:
  - Dormitory head logged in
  - Target user has high points (points: 75)
- **Input Data**: Valid removal request
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error message: "User must have 20 or fewer points for removal request"
  3. No removal request created
- **Business Rule Test**: Validates point threshold

### TC015: Assign User to Occupied Bed
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin logged in
  - Bed 3 in dorm-001 already occupied
- **Input Data**: 
  - Different userId
  - Same dormitoryId and bedNumber
- **Expected Results**:
  1. Interaction returns error
  2. Error message: "Bed is already occupied"
  3. No new assignment created
- **Business Rule Test**: Validates bed occupancy

### TC016: Create Duplicate Removal Request
- **Interaction**: RequestUserRemoval
- **Preconditions**:
  - Pending removal request already exists for user
- **Input Data**: Same userId
- **Expected Results**:
  1. Interaction returns error
  2. Error message: "Removal request already pending for this user"
  3. No duplicate request created
- **Business Rule Test**: Validates request uniqueness

### TC017: Assign Multiple Dormitory Head Roles
- **Interaction**: AssignDormitoryHead
- **Preconditions**:
  - User already head of dorm-001
- **Input Data**: 
  - Same userId
  - Different dormitoryId (dorm-002)
- **Expected Results**:
  1. Interaction returns error
  2. Error message: "User is already head of another dormitory"
  3. No new assignment created
- **Business Rule Test**: Validates head uniqueness

### TC018: Deduct Points Below Zero
- **Interaction**: DeductPoints
- **Preconditions**:
  - User has 5 points remaining
- **Input Data**: 
  - points: 10 (would result in -5)
- **Expected Results**:
  1. Deduction created successfully
  2. User.points set to 0 (not negative)
  3. User.isRemovable computed as true
- **Business Rule Test**: Validates minimum points constraint

### TC019: Exceed Dormitory Bed Capacity
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Dormitory has 4 beds, all occupied
- **Input Data**: 
  - bedNumber: 5 (exceeds capacity)
- **Expected Results**:
  1. Interaction returns error
  2. Error message: "Bed number exceeds dormitory capacity"
  3. No assignment created
- **Business Rule Test**: Validates bed capacity

### TC020: View Dormitory Info
- **Interaction**: ViewDormitoryInfo
- **Preconditions**: User assigned to dormitory
- **Expected Results**:
  1. Returns dormitory details
  2. Shows all current residents
  3. Shows dormitory head information
  4. Shows occupancy status
- **Permission Test**: Validates dormitory member access

---

## Test Execution Notes

1. **Test Data Setup**: Create test fixtures for users, dormitories, and initial states
2. **Test Isolation**: Each test should run in isolation with clean state
3. **Assertion Coverage**: Verify both successful operations and error conditions
4. **Computed Property Validation**: Always check that computed properties update correctly
5. **Cascade Effect Testing**: Verify all related entities update appropriately
6. **State Machine Testing**: Ensure proper state transitions and terminal states
7. **Audit Trail Verification**: Confirm immutable properties remain unchanged

## Critical Test Patterns

1. **Never test with direct storage operations** - Always use Interactions
2. **Test both positive and negative cases** for each Interaction
3. **Verify computed properties** after state changes
4. **Check cascade effects** on related entities
5. **Validate permission boundaries** for each role
6. **Test business rule enforcement** at Interaction level
7. **Ensure audit trail integrity** for all operations