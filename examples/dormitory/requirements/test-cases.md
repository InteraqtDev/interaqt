# Dormitory Management System - Test Cases

## Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**: name="Dorm A", capacity=4
- **Expected Results**:
  1. New dormitory record created with provided name and capacity
  2. Dormitory status is "active"
  3. Creation timestamp is current time
  4. 4 bed records automatically created for the dormitory
  5. All beds have status "available"
- **Post Validation**: Dormitory appears in dormitory list with correct capacity

### TC002: Create Dormitory with Invalid Capacity (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**: name="Dorm B", capacity=10 (invalid - exceeds limit)
- **Expected Results**:
  1. Interaction returns error
  2. Error message indicates capacity must be between 4-6
  3. No dormitory record created
  4. No bed records created

### TC003: Create User (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Preconditions**: Admin user logged in
- **Input Data**: name="John Doe", email="john@example.com", role="student"
- **Expected Results**:
  1. New user record created with provided details
  2. User status is "active"
  3. User points initialized to 100
  4. Creation timestamp is current time
  5. User has no dormitory or bed assignment initially

### TC004: Assign User to Dormitory (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Preconditions**: 
  - Admin user logged in
  - Dormitory exists with available capacity
  - User exists without dormitory assignment
- **Input Data**: userId="user123", dormitoryId="dorm456"
- **Expected Results**:
  1. UserDormitoryRelation created linking user to dormitory
  2. User's dormitory property now references the assigned dormitory
  3. Dormitory's users list includes the assigned user
  4. Assignment timestamp is recorded
  5. Dormitory occupancy count increases by 1

### TC005: Assign User to Full Dormitory (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin user logged in
  - Dormitory exists at full capacity
  - User exists without dormitory assignment
- **Input Data**: userId="user123", dormitoryId="dorm456" (full dormitory)
- **Expected Results**:
  1. Interaction returns error
  2. Error message indicates dormitory is full
  3. No assignment relation created
  4. User remains unassigned

### TC006: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin user logged in
  - User already assigned to dormitory
  - Bed exists and is available in user's dormitory
- **Input Data**: userId="user123", bedId="bed789"
- **Expected Results**:
  1. UserBedRelation created linking user to bed
  2. User's bed property now references the assigned bed
  3. Bed's user property now references the assigned user
  4. Bed status changes to "occupied"
  5. Assignment timestamp is recorded

### TC007: Deduct Points from User (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**:
  - Dorm head user logged in
  - Target user is in dorm head's dormitory
  - User has sufficient points (> deduction amount)
- **Input Data**: userId="user123", points=10, reason="Late curfew"
- **Expected Results**:
  1. PointDeduction record created with all details
  2. User's points decrease by specified amount
  3. Deduction timestamp is current time
  4. RecordedBy field contains dorm head's ID
  5. User's point history is updated

### TC008: Request Eviction (via RequestEviction Interaction)
- **Interaction**: RequestEviction
- **Preconditions**:
  - Dorm head user logged in
  - Target user is in dorm head's dormitory
  - User points are below eviction threshold (e.g., 50)
- **Input Data**: userId="user123", reason="Multiple rule violations"
- **Expected Results**:
  1. EvictionRequest record created with pending status
  2. Request contains user ID, reason, and requesting dorm head
  3. Creation timestamp is current time
  4. Request appears in admin's pending requests list

### TC009: Approve Eviction Request (via ApproveEviction Interaction)
- **Interaction**: ApproveEviction
- **Preconditions**:
  - Admin user logged in
  - Eviction request exists with pending status
  - Requested user is still in dormitory
- **Input Data**: requestId="evict456"
- **Expected Results**:
  1. EvictionRequest status changes to "approved"
  2. Processed timestamp is current time
  3. ProcessedBy field contains admin's ID
  4. User is removed from dormitory (UserDormitoryRelation deleted)
  5. User is removed from bed (UserBedRelation deleted)
  6. User status changes to "evicted"
  7. Bed status changes to "available"

### TC010: Reject Eviction Request (via RejectEviction Interaction)
- **Interaction**: RejectEviction
- **Preconditions**:
  - Admin user logged in
  - Eviction request exists with pending status
- **Input Data**: requestId="evict456"
- **Expected Results**:
  1. EvictionRequest status changes to "rejected"
  2. Processed timestamp is current time
  3. ProcessedBy field contains admin's ID
  4. User remains in dormitory with no changes
  5. Bed assignment remains unchanged

## Permission Tests

### TC101: Non-Admin Creating Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Non-admin user (student/dorm head) logged in
- **Input Data**: name="Unauthorized Dorm", capacity=4
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient permissions
  3. No dormitory created

### TC102: Student Deducting Points (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**: Student user logged in
- **Input Data**: userId="otherUser", points=5, reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient permissions
  3. No points deducted
  4. No deduction record created

### TC103: Dorm Head Deducting Points from Other Dormitory (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**: Dorm head logged in, targeting user from different dormitory
- **Input Data**: userId="otherDormUser", points=5, reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates cannot deduct points from users outside dormitory
  3. No points deducted

### TC104: Student Requesting Eviction (via RequestEviction Interaction)
- **Interaction**: RequestEviction
- **Preconditions**: Student user logged in
- **Input Data**: userId="targetUser", reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient permissions
  3. No eviction request created

### TC105: Non-Admin Approving Eviction (via ApproveEviction Interaction)
- **Interaction**: ApproveEviction
- **Preconditions**: Non-admin user (student/dorm head) logged in
- **Input Data**: requestId="pendingRequest"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient permissions
  3. Request status remains unchanged

## Business Rule Tests

### TC201: Assign User Already in Dormitory (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Preconditions**: User already assigned to a dormitory
- **Input Data**: userId="assignedUser", dormitoryId="newDorm"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user already assigned to dormitory
  3. No new assignment created
  4. User remains in original dormitory

### TC202: Create Duplicate Dormitory Name (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Dormitory with same name already exists
- **Input Data**: name="Existing Name", capacity=4
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates dormitory name must be unique
  3. No new dormitory created

### TC203: Deduct More Points Than Available (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**: User has 10 points
- **Input Data**: userId="lowPointUser", points=15, reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient points
  3. No deduction performed
  4. User points remain unchanged

### TC204: Request Eviction with High Points (via RequestEviction Interaction)
- **Interaction**: RequestEviction
- **Preconditions**: Target user has 80 points (above threshold)
- **Input Data**: userId="highPointUser", reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user points too high for eviction
  3. No eviction request created

### TC205: Approve Already Processed Request (via ApproveEviction Interaction)
- **Interaction**: ApproveEviction
- **Preconditions**: Eviction request already approved
- **Input Data**: requestId="processedRequest"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates request already processed
  3. Request status remains unchanged

### TC206: Assign Bed from Different Dormitory (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**: Bed is in different dormitory than user's assigned dormitory
- **Input Data**: userId="user123", bedId="otherDormBed"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed must be in user's dormitory
  3. No bed assignment created

### TC207: Assign Already Occupied Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**: Bed already occupied by another user
- **Input Data**: userId="user123", bedId="occupiedBed"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed already occupied
  3. No bed assignment created
  4. Current occupant remains assigned

## Edge Case Tests

### TC301: Create User with Duplicate Email (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Preconditions**: User with same email already exists
- **Input Data**: name="John Doe", email="existing@example.com", role="student"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates email must be unique
  3. No user created

### TC302: View Evicted User Profile
- **Interaction**: ViewUser (implicit through data retrieval)
- **Preconditions**: User has been evicted
- **Expected Results**:
  1. User profile shows evicted status
  2. No dormitory or bed assignment displayed
  3. Point history still accessible

### TC303: Assign User to Deleted Dormitory
- **Interaction**: AssignUserToDormitory
- **Preconditions**: Dormitory has been marked as inactive
- **Input Data**: userId="user123", dormitoryId="inactiveDorm"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates dormitory not available
  3. No assignment created

### TC304: Multiple Simultaneous Eviction Requests
- **Interaction**: RequestEviction
- **Preconditions**: User already has pending eviction request
- **Input Data**: userId="user123", reason="Another reason"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates pending request already exists
  3. No duplicate request created