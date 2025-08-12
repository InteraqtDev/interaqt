# Test Cases - Dormitory Management System

## Test Organization Strategy

All test cases are based on **Interactions**, not on direct Entity/Relation operations. Tests are organized in three phases:

1. **Stage 1: Core Business Logic Tests** - Basic functionality without permissions or business rules
2. **Stage 2A: Permission Tests** - Role-based access control validation
3. **Stage 2B: Business Rule Tests** - Business constraint validation

---

## Stage 1: Core Business Logic Tests

These tests verify basic functionality with valid inputs and proper user roles.

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists
- **Input Data**: 
  ```typescript
  user: admin (with role='admin')
  payload: {
    name: "Building A Room 101",
    capacity: 4,
    floor: 1,
    building: "A"
  }
  ```
- **Expected Results**:
  1. New Dormitory entity created
  2. Dormitory has correct properties (name, capacity, floor, building)
  3. Dormitory status is 'active'
  4. 4 Bed entities automatically created
  5. All beds have status 'vacant'
  6. Beds are linked to dormitory
- **Post Validation**: Dormitory appears in system with 4 available beds

### TC002: Appoint Dormitory Head (via AppointDormHead Interaction)
- **Interaction**: AppointDormHead
- **Preconditions**: 
  - Admin user exists
  - Student user exists (role='student')
  - Dormitory exists
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: student.id,
    dormitoryId: dormitory.id
  }
  ```
- **Expected Results**:
  1. User role updated to 'dormHead'
  2. DormitoryDormHeadRelation created
  3. dormitory.dormHead references the user
  4. user.managedDormitory references the dormitory
  5. appointedAt timestamp recorded
- **Post Validation**: User can perform dormHead operations

### TC003: Assign User to Dormitory (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin user exists
  - Student user exists (not assigned)
  - Dormitory with vacant beds exists
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: student.id,
    dormitoryId: dormitory.id,
    bedId: bed.id
  }
  ```
- **Expected Results**:
  1. UserDormitoryRelation created
  2. UserBedRelation created
  3. Bed status updated to 'occupied'
  4. user.dormitory references the dormitory
  5. user.bed references the bed
  6. dormitory.residents includes the user
  7. Dormitory occupancy count increases by 1
- **Post Validation**: User appears in dormitory resident list

### TC004: Record Violation (via RecordViolation Interaction)
- **Interaction**: RecordViolation
- **Preconditions**:
  - DormHead user exists
  - Student assigned to dormHead's dormitory
  - Student has 100 points initially
- **Input Data**:
  ```typescript
  user: dormHead
  payload: {
    userId: student.id,
    description: "Late night noise disturbance",
    points: 10,
    category: "noise"
  }
  ```
- **Expected Results**:
  1. ViolationRecord created with all properties
  2. ViolationRecord linked to user
  3. User points reduced to 90 (100 - 10)
  4. recordedBy field contains dormHead name
  5. createdAt timestamp recorded
- **Post Validation**: Violation appears in user's violation list

### TC005: Submit Eviction Request (via SubmitEvictionRequest Interaction)
- **Interaction**: SubmitEvictionRequest
- **Preconditions**:
  - DormHead user exists
  - Student in dormitory with points < 60 (e.g., 50 points)
- **Input Data**:
  ```typescript
  user: dormHead
  payload: {
    userId: student.id,
    reason: "Multiple violations and disruptive behavior"
  }
  ```
- **Expected Results**:
  1. EvictionRequest created
  2. Status is 'pending'
  3. Request linked to target user
  4. Request linked to requesting dormHead
  5. requestedAt timestamp recorded
- **Post Validation**: Request appears in pending eviction requests

### TC006: Approve Eviction Request (via ReviewEvictionRequest Interaction)
- **Interaction**: ReviewEvictionRequest
- **Preconditions**:
  - Admin user exists
  - Pending eviction request exists
  - Student is currently assigned to dormitory and bed
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    requestId: evictionRequest.id,
    decision: "approve",
    adminNotes: "Confirmed violations, eviction approved"
  }
  ```
- **Expected Results**:
  1. EvictionRequest status updated to 'approved'
  2. User status updated to 'evicted'
  3. User removed from dormitory (relation deleted)
  4. User removed from bed (relation deleted)
  5. Bed status updated to 'vacant'
  6. Dormitory occupancy decreases by 1
  7. evictedAt timestamp recorded on user
  8. decidedAt timestamp recorded on request
- **Post Validation**: User no longer in dormitory, bed is available

### TC007: Reject Eviction Request (via ReviewEvictionRequest Interaction)
- **Interaction**: ReviewEvictionRequest
- **Preconditions**:
  - Admin user exists
  - Pending eviction request exists
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    requestId: evictionRequest.id,
    decision: "reject",
    adminNotes: "Give student another chance with warning"
  }
  ```
- **Expected Results**:
  1. EvictionRequest status updated to 'rejected'
  2. User remains in dormitory
  3. User status remains 'active'
  4. decidedAt timestamp recorded
  5. adminNotes recorded
- **Post Validation**: User still assigned to dormitory and bed

### TC008: Create Dormitory with Maximum Capacity (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    name: "Building B Room 201",
    capacity: 6,
    floor: 2,
    building: "B"
  }
  ```
- **Expected Results**:
  1. Dormitory created with capacity 6
  2. 6 Bed entities created
  3. All 6 beds linked to dormitory
- **Post Validation**: Dormitory has 6 available beds

### TC009: Multiple Violations Accumulation (via RecordViolation Interaction)
- **Interaction**: RecordViolation (multiple calls)
- **Preconditions**:
  - DormHead exists
  - Student with 100 points
- **Test Sequence**:
  1. First violation: 10 points (noise)
  2. Second violation: 20 points (curfew)
  3. Third violation: 15 points (hygiene)
- **Expected Results**:
  1. Three ViolationRecord entities created
  2. User points: 100 → 90 → 70 → 55
  3. All violations linked to user
  4. User becomes eligible for eviction (points < 60)
- **Post Validation**: User has 3 violations, 55 points

### TC010: Full Dormitory Assignment (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory (multiple calls)
- **Preconditions**:
  - Admin exists
  - Dormitory with 4 beds exists
  - 4 unassigned students exist
- **Test Sequence**: Assign all 4 students to the 4 beds
- **Expected Results**:
  1. All 4 beds status = 'occupied'
  2. Dormitory occupancy = 4
  3. Available beds = 0
  4. All students linked to dormitory
- **Post Validation**: Dormitory is at full capacity

---

## Stage 2A: Permission Tests

These tests verify role-based access control after core logic is working.

### TC011: Non-Admin Cannot Create Dormitory
- **Interaction**: CreateDormitory
- **Preconditions**: Student user exists
- **Input Data**:
  ```typescript
  user: student (role='student')
  payload: { name: "Unauthorized", capacity: 4, floor: 1, building: "A" }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates permission denied
  3. No dormitory created
- **Post Validation**: Dormitory does not exist

### TC012: Non-Admin Cannot Appoint DormHead
- **Interaction**: AppointDormHead
- **Preconditions**: 
  - Student user exists
  - Another student exists
  - Dormitory exists
- **Input Data**:
  ```typescript
  user: student
  payload: { userId: otherStudent.id, dormitoryId: dormitory.id }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates permission denied
  3. No role change occurs
- **Post Validation**: User role remains 'student'

### TC013: DormHead Cannot Manage Other Dormitories
- **Interaction**: RecordViolation
- **Preconditions**:
  - DormHead manages Dormitory A
  - Student assigned to Dormitory B
- **Input Data**:
  ```typescript
  user: dormHeadA
  payload: { 
    userId: studentInDormB.id,
    description: "Violation",
    points: 10,
    category: "noise"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates not authorized for this dormitory
  3. No violation recorded
- **Post Validation**: Student has no violations

### TC014: Student Cannot Record Violations
- **Interaction**: RecordViolation
- **Preconditions**:
  - Student user exists
  - Another student in same dormitory
- **Input Data**:
  ```typescript
  user: student
  payload: {
    userId: otherStudent.id,
    description: "Violation",
    points: 10,
    category: "noise"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates permission denied
  3. No violation recorded
- **Post Validation**: No violation created

### TC015: Only Admin Can Review Eviction Requests
- **Interaction**: ReviewEvictionRequest
- **Preconditions**:
  - DormHead exists
  - Pending eviction request exists
- **Input Data**:
  ```typescript
  user: dormHead
  payload: {
    requestId: request.id,
    decision: "approve",
    adminNotes: "Trying to approve"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates admin permission required
  3. Request remains pending
- **Post Validation**: Request status unchanged

---

## Stage 2B: Business Rule Tests

These tests verify business constraints and validations.

### TC016: Cannot Create Dormitory with Invalid Capacity
- **Interaction**: CreateDormitory
- **Preconditions**: Admin exists
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    name: "Invalid Room",
    capacity: 3,  // Below minimum
    floor: 1,
    building: "A"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates capacity must be 4-6
  3. No dormitory created
- **Post Validation**: Dormitory does not exist

### TC017: Cannot Assign Already Assigned User
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin exists
  - Student already assigned to a dormitory
  - Another dormitory with vacant beds
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: assignedStudent.id,
    dormitoryId: otherDormitory.id,
    bedId: vacantBed.id
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user already assigned
  3. User remains in original dormitory
- **Post Validation**: User still in first dormitory only

### TC018: Cannot Assign to Occupied Bed
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin exists
  - Unassigned student
  - Bed already occupied
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: newStudent.id,
    dormitoryId: dormitory.id,
    bedId: occupiedBed.id
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed is occupied
  3. Bed remains with original occupant
- **Post Validation**: Original occupant unchanged

### TC019: Cannot Submit Eviction for High-Points User
- **Interaction**: SubmitEvictionRequest
- **Preconditions**:
  - DormHead exists
  - Student with 80 points (above 60 threshold)
- **Input Data**:
  ```typescript
  user: dormHead
  payload: {
    userId: highPointsStudent.id,
    reason: "Trying to evict"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient grounds (points >= 60)
  3. No eviction request created
- **Post Validation**: No pending eviction request

### TC020: Cannot Submit Duplicate Eviction Request
- **Interaction**: SubmitEvictionRequest
- **Preconditions**:
  - DormHead exists
  - Student with low points
  - Pending eviction request already exists for student
- **Input Data**:
  ```typescript
  user: dormHead
  payload: {
    userId: student.id,
    reason: "Another eviction attempt"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates pending request exists
  3. No new request created
- **Post Validation**: Only one pending request exists

### TC021: Cannot Appoint DormHead to Already Managed Dormitory
- **Interaction**: AppointDormHead
- **Preconditions**:
  - Admin exists
  - Dormitory with existing dormHead
  - Another student user
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: newStudent.id,
    dormitoryId: managedDormitory.id
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates dormitory already has dormHead
  3. Original dormHead unchanged
- **Post Validation**: Original dormHead remains

### TC022: Cannot Assign Evicted User
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin exists
  - User with status='evicted'
  - Dormitory with vacant beds
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: evictedUser.id,
    dormitoryId: dormitory.id,
    bedId: vacantBed.id
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user is evicted
  3. User remains unassigned
- **Post Validation**: User not in any dormitory

### TC023: Cannot Assign to Full Dormitory
- **Interaction**: AssignUserToDormitory
- **Preconditions**:
  - Admin exists
  - Dormitory at full capacity (all beds occupied)
  - Unassigned student
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    userId: student.id,
    dormitoryId: fullDormitory.id,
    bedId: "any"  // Even if specified, all are occupied
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates no available beds
  3. Student remains unassigned
- **Post Validation**: Dormitory remains at full capacity

### TC024: Points Cannot Go Below Zero
- **Interaction**: RecordViolation
- **Preconditions**:
  - DormHead exists
  - Student with 10 points
- **Input Data**:
  ```typescript
  user: dormHead
  payload: {
    userId: student.id,
    description: "Major violation",
    points: 50,  // Would result in -40
    category: "damage"
  }
  ```
- **Expected Results**:
  1. Violation recorded
  2. User points set to 0 (not negative)
  3. User eligible for eviction
- **Post Validation**: User has 0 points

### TC025: Cannot Review Non-Pending Request
- **Interaction**: ReviewEvictionRequest
- **Preconditions**:
  - Admin exists
  - Already approved eviction request
- **Input Data**:
  ```typescript
  user: admin
  payload: {
    requestId: approvedRequest.id,
    decision: "reject",
    adminNotes: "Trying to change decision"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates request already decided
  3. Request status remains 'approved'
- **Post Validation**: Request unchanged

---

## Test Execution Strategy

### Stage 1 Testing (Core Business Logic)
1. Run tests TC001-TC010
2. All must pass before proceeding
3. If failures, fix implementation and retest
4. Ensure 100% pass rate

### Stage 2A Testing (Permissions)
1. Only start after Stage 1 complete
2. Run tests TC011-TC015
3. Stage 1 tests should still pass
4. Fix permission implementation if needed

### Stage 2B Testing (Business Rules)
1. Only start after Stage 1 complete
2. Run tests TC016-TC025
3. Stage 1 tests should still pass
4. Fix business rule implementation if needed

### Complete Test Suite
- After all stages implemented:
  - All 25 test cases should pass
  - Stage 1 tests verify core functionality with valid inputs
  - Stage 2 tests verify invalid inputs are rejected
  - System is production-ready

## Notes on Test Implementation

1. **Always use Interactions**: Never test by directly calling storage.create or storage.update
2. **Use proper user roles**: Even in Stage 1, create users with correct roles
3. **Use valid data**: In Stage 1, use data that will pass future business rules
4. **Check complete state**: Verify all affected entities and relations after each interaction
5. **Test atomicity**: Ensure failed operations don't partially modify state
6. **Verify computations**: Check that computed properties update correctly
7. **Test cascading effects**: Ensure related entities update appropriately
8. **Use realistic scenarios**: Test cases should reflect actual usage patterns
