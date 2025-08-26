# Dormitory Management System - Test Cases

## Test Case Organization
Test cases are organized in three phases:
1. **Phase 1: Core Business Logic Tests** - Basic functionality without permissions
2. **Phase 2: Permission Tests** - Access control and authorization
3. **Phase 3: Business Rule Tests** - Complex business logic and validations

---

## Phase 1: Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user logged in
- **Input Data**: 
  - name="Building A Room 101"
  - capacity=4
  - floor=1
  - building="Building A"
- **Expected Results**:
  1. New dormitory record created
  2. Dormitory has correct name, capacity, floor, building
  3. 4 bed records automatically created (A1, A2, A3, A4)
  4. All beds marked as unoccupied
  5. createdAt timestamp is current time
- **Post Validation**: Beds appear in dormitory's bed list

### TC002: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**: 
  - Admin logged in
  - Dormitory with beds exists
  - User "student1" exists
  - Bed "A1" is unoccupied
- **Input Data**:
  - userId="student1"
  - bedId="A1"
- **Expected Results**:
  1. User-bed relation created
  2. Bed marked as occupied (isOccupied=true)
  3. User's bed property references the assigned bed
  4. Bed's occupant property references the user
- **Post Validation**: User appears in dormitory's resident list

### TC003: Deduct Points from User (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**:
  - Admin logged in
  - User "student1" exists with 100 points
- **Input Data**:
  - userId="student1"
  - points=10
  - reason="Noise violation"
  - description="Loud music after 10 PM"
- **Expected Results**:
  1. PointDeduction record created
  2. User's points reduced to 90
  3. Deduction record contains correct reason, points, description
  4. createdAt timestamp recorded
  5. createdBy field shows admin's name
- **Post Validation**: Deduction appears in user's point history

### TC004: Submit Removal Request (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Preconditions**:
  - Dormitory leader logged in
  - Target user "student1" in same dormitory
  - Target user has 25 points (< 30)
- **Input Data**:
  - userId="student1"
  - reason="Multiple violations and uncooperative behavior"
- **Expected Results**:
  1. RemovalRequest record created
  2. Status set to 'pending'
  3. requestedBy links to dormitory leader
  4. targetUser links to student1
  5. createdAt timestamp recorded
- **Post Validation**: Request appears in admin's pending requests list

### TC005: Process Removal Request - Approval (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**:
  - Admin logged in
  - Pending removal request exists
  - Target user assigned to bed
- **Input Data**:
  - requestId="request1"
  - decision="approved"
  - adminComment="Confirmed multiple violations"
- **Expected Results**:
  1. Request status updated to 'approved'
  2. processedAt timestamp recorded
  3. adminComment saved
  4. User removed from bed (relation deleted)
  5. Bed marked as unoccupied
  6. If user was dormitory leader, role reset to 'resident'
- **Post Validation**: Bed available for new assignment

### TC006: Assign Dormitory Leader (via AssignDormitoryLeader Interaction)
- **Interaction**: AssignDormitoryLeader
- **Preconditions**:
  - Admin logged in
  - User "student2" exists as resident
  - Dormitory "dorm1" exists without leader
- **Input Data**:
  - userId="student2"
  - dormitoryId="dorm1"
- **Expected Results**:
  1. User role updated to 'dormitoryLeader'
  2. UserDormitoryLeaderRelation created
  3. User's managedDormitory references the dormitory
  4. Dormitory's dormitoryLeader references the user
- **Post Validation**: User can access dormitory leader functions

---

## Phase 2: Permission Tests

### TC007: Non-Admin Cannot Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Regular resident logged in
- **Input Data**: 
  - name="Unauthorized Dorm"
  - capacity=4
- **Expected Results**:
  1. Interaction returns error
  2. Error type is "permission denied"
  3. No dormitory created
  4. No beds created
- **Note**: Tests permission control at Interaction level

### TC008: Dormitory Leader Cannot Deduct Points Outside Their Dormitory (via DeductResidentPoints Interaction)
- **Interaction**: DeductResidentPoints
- **Preconditions**:
  - Dormitory leader of "dorm1" logged in
  - Target user in "dorm2"
- **Input Data**:
  - userId="otherDormStudent"
  - points=5
  - reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user not in leader's dormitory
  3. No point deduction created
  4. User's points unchanged
- **Note**: Tests scope-based permissions

### TC009: Resident Cannot Submit Removal Request (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Preconditions**: Regular resident logged in
- **Input Data**:
  - userId="anotherStudent"
  - reason="Test"
- **Expected Results**:
  1. Interaction returns error
  2. Error type is "permission denied"
  3. No removal request created
- **Note**: Tests role-based permissions

### TC010: Only Admin Can Process Removal Requests (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**: Dormitory leader logged in
- **Input Data**:
  - requestId="request1"
  - decision="approved"
- **Expected Results**:
  1. Interaction returns error
  2. Error type is "permission denied"
  3. Request status unchanged
- **Note**: Tests admin-only permissions

---

## Phase 3: Business Rule Tests

### TC011: Cannot Submit Removal Request for User with Sufficient Points (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Preconditions**:
  - Dormitory leader logged in
  - Target user has 50 points (>= 30)
- **Input Data**:
  - userId="goodStudent"
  - reason="Test removal"
- **Expected Results**:
  1. Interaction returns error
  2. Error message indicates point threshold not met
  3. No removal request created
- **Note**: Tests business rule validation

### TC012: Cannot Assign User to Occupied Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin logged in
  - Bed already occupied by another user
- **Input Data**:
  - userId="newStudent"
  - bedId="occupiedBed"
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed is occupied
  3. No new relation created
  4. Bed remains with original occupant
- **Note**: Tests occupancy validation

### TC013: Cannot Create Dormitory with Invalid Capacity (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin logged in
- **Input Data**:
  - name="Invalid Dorm"
  - capacity=10  // Outside 4-6 range
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates invalid capacity
  3. No dormitory created
  4. No beds created
- **Note**: Tests capacity validation

### TC014: User Points Cannot Go Below Zero (via DeductPoints Interaction)
- **Interaction**: DeductPoints
- **Preconditions**:
  - Admin logged in
  - User has 10 points
- **Input Data**:
  - userId="lowPointUser"
  - points=20  // Would result in -10
  - reason="Major violation"
- **Expected Results**:
  1. PointDeduction record created
  2. User's points set to 0 (not negative)
  3. System enforces minimum bound
- **Note**: Tests point system boundaries

### TC015: Process Removal Request - Rejection (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Preconditions**:
  - Admin logged in
  - Pending removal request exists
- **Input Data**:
  - requestId="request2"
  - decision="rejected"
  - adminComment="Insufficient evidence"
- **Expected Results**:
  1. Request status updated to 'rejected'
  2. processedAt timestamp recorded
  3. adminComment saved
  4. User remains in their bed
  5. Bed remains occupied
- **Note**: Tests rejection flow

### TC016: Dormitory Leader Can Only Deduct Points from Own Dormitory Residents (via DeductResidentPoints Interaction)
- **Interaction**: DeductResidentPoints
- **Preconditions**:
  - Dormitory leader of "dorm1" logged in
  - Target user "resident1" in same dormitory
- **Input Data**:
  - userId="resident1"
  - points=5
  - reason="Late return"
  - description="Returned after 11 PM curfew"
- **Expected Results**:
  1. PointDeduction record created
  2. User's points reduced by 5
  3. createdBy shows dormitory leader's name
- **Note**: Tests scoped permissions work correctly

### TC017: Cannot Assign Same User to Multiple Beds (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin logged in
  - User already assigned to bed "A1"
- **Input Data**:
  - userId="existingResident"
  - bedId="B1"  // Different bed
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user already assigned
  3. User remains in original bed
  4. New bed remains unoccupied
- **Note**: Tests single assignment rule

### TC018: Soft Delete User Preserves Audit Trail (via User deletion)
- **Interaction**: Soft delete user
- **Preconditions**:
  - User has point deductions and removal requests
- **Expected Results**:
  1. User marked as deleted (isDeleted=true)
  2. Point deductions remain in system
  3. Removal requests remain in system
  4. User removed from bed if assigned
- **Note**: Tests audit trail preservation

---

## Integration Test Scenarios

### ITC001: Complete User Lifecycle
1. Create dormitory with 4 beds
2. Create new user (100 points)
3. Assign user to bed
4. Deduct points multiple times (total 75 points deducted)
5. Submit removal request (user now at 25 points)
6. Approve removal request
7. Verify user removed from bed and bed available

### ITC002: Dormitory Leader Management Flow
1. Create dormitory
2. Create and assign multiple users to beds
3. Assign one user as dormitory leader
4. Leader deducts points from residents
5. Leader submits removal request for problematic resident
6. Admin approves request
7. Verify leader can continue managing remaining residents

### ITC003: Full Dormitory Scenario
1. Create dormitory with 6 beds
2. Assign 6 users to all beds
3. Attempt to assign 7th user (should fail)
4. Remove one user via removal request
5. Successfully assign 7th user to freed bed
6. Verify dormitory at full capacity again