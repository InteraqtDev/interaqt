# Test Cases - Dormitory Management System

## Phase 1: Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists
- **Input Data**: 
  - user: admin user
  - payload: { name: "Building A Room 101", capacity: 4 }
- **Expected Results**:
  1. New Dormitory entity created
  2. Dormitory has correct name and capacity
  3. 4 Bed entities automatically created with bedNumbers 1-4
  4. All beds have status 'available'
  5. Dormitory's availableBeds computed as 4
  6. Dormitory's occupiedBeds computed as 0

### TC002: Assign Dormitory Head (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **Preconditions**: 
  - Admin user exists
  - Regular user exists with role 'student'
  - Dormitory exists
- **Input Data**:
  - user: admin user
  - payload: { userId: 'user-id', dormitoryId: 'dorm-id' }
- **Expected Results**:
  1. User's role updated to 'dormHead'
  2. UserDormHeadRelation created
  3. User's managedDormitories includes the dormitory
  4. Dormitory's dormHead points to the user
  5. User's isDormHead computed as true

### TC003: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin user exists
  - Student user exists
  - Dormitory with available beds exists
- **Input Data**:
  - user: admin user
  - payload: { userId: 'student-id', bedId: 'bed-id' }
- **Expected Results**:
  1. UserBedRelation created
  2. Bed status changes to 'occupied'
  3. User's bed property points to assigned bed
  4. Bed's occupant points to user
  5. Dormitory's occupiedBeds increments by 1
  6. Dormitory's availableBeds decrements by 1
  7. User's dormitory computed from bed.dormitory relation

### TC004: Record Point Deduction (via RecordPointDeduction Interaction)
- **Interaction**: RecordPointDeduction
- **Preconditions**:
  - Dormitory head exists
  - Student assigned to bed in that dormitory
  - Student has 100 points
- **Input Data**:
  - user: dormitory head
  - payload: { userId: 'student-id', reason: 'Late return', points: 10 }
- **Expected Results**:
  1. PointDeduction entity created
  2. UserPointDeductionRelation created
  3. Deduction has correct reason, points, and timestamp
  4. User's totalDeductions computed as 10
  5. User's currentPoints computed as 90
  6. User's pointDeductions array includes the new deduction

### TC005: Submit Kick-Out Application (via SubmitKickOutApplication Interaction)
- **Interaction**: SubmitKickOutApplication
- **Preconditions**:
  - Dormitory head exists
  - Student in their dormitory has low points (e.g., 20)
- **Input Data**:
  - user: dormitory head
  - payload: { userId: 'student-id', reason: 'Multiple violations, current points: 20' }
- **Expected Results**:
  1. KickOutApplication entity created
  2. Application status is 'pending'
  3. KickOutApplicationUserRelation created (targetUser)
  4. KickOutApplicationApplicantRelation created (applicant)
  5. Application has correct applicationTime
  6. User's kickOutApplications includes this application

### TC006: Approve Kick-Out Application (via ProcessKickOutApplication Interaction)
- **Interaction**: ProcessKickOutApplication
- **Preconditions**:
  - Admin user exists
  - Pending kick-out application exists
  - Target user is assigned to a bed
- **Input Data**:
  - user: admin user
  - payload: { applicationId: 'app-id', decision: 'approved' }
- **Expected Results**:
  1. Application status changes to 'approved'
  2. Application's processedTime is set
  3. Application's processedBy is set to admin id
  4. Target user's status changes to 'kickedOut'
  5. User's bed relation is removed
  6. Bed status changes back to 'available'
  7. Dormitory's occupiedBeds decrements by 1

### TC007: Reject Kick-Out Application (via ProcessKickOutApplication Interaction)
- **Interaction**: ProcessKickOutApplication
- **Preconditions**:
  - Admin user exists
  - Pending kick-out application exists
- **Input Data**:
  - user: admin user
  - payload: { applicationId: 'app-id', decision: 'rejected' }
- **Expected Results**:
  1. Application status changes to 'rejected'
  2. Application's processedTime is set
  3. Application's processedBy is set to admin id
  4. Target user remains 'active'
  5. User keeps their bed assignment

### TC008: Remove User from Bed (via RemoveUserFromBed Interaction)
- **Interaction**: RemoveUserFromBed
- **Preconditions**:
  - Admin user exists
  - Student assigned to a bed
- **Input Data**:
  - user: admin user
  - payload: { userId: 'student-id' }
- **Expected Results**:
  1. UserBedRelation removed
  2. Bed status changes to 'available'
  3. User's bed property becomes null
  4. Dormitory's occupiedBeds decrements by 1

### TC009: Remove Dormitory Head (via RemoveDormHead Interaction)
- **Interaction**: RemoveDormHead
- **Preconditions**:
  - Admin user exists
  - User is assigned as dormitory head
- **Input Data**:
  - user: admin user
  - payload: { userId: 'dormhead-id' }
- **Expected Results**:
  1. User's role changes back to 'student'
  2. UserDormHeadRelation removed
  3. User's managedDormitories becomes empty
  4. Dormitory's dormHead becomes null
  5. User's isDormHead computed as false

## Phase 2: Permission Tests

### TC101: Non-Admin Cannot Create Dormitory
- **Interaction**: CreateDormitory
- **Preconditions**: Student user exists
- **Input Data**:
  - user: student user
  - payload: { name: "Test Dorm", capacity: 4 }
- **Expected Results**:
  1. Interaction returns error
  2. No dormitory created
  3. No beds created

### TC102: Non-Admin Cannot Assign Dormitory Head
- **Interaction**: AssignDormHead
- **Preconditions**: 
  - Student user exists
  - Another user and dormitory exist
- **Input Data**:
  - user: student user
  - payload: { userId: 'other-user', dormitoryId: 'dorm-id' }
- **Expected Results**:
  1. Interaction returns error
  2. Target user's role unchanged
  3. No relation created

### TC103: Dorm Head Can Only Deduct Points from Own Dormitory
- **Interaction**: RecordPointDeduction
- **Preconditions**:
  - Dorm head A manages dormitory A
  - Student B is in dormitory B
- **Input Data**:
  - user: dorm head A
  - payload: { userId: 'student-B-id', reason: 'Test', points: 10 }
- **Expected Results**:
  1. Interaction returns error
  2. No deduction created
  3. Student B's points unchanged

### TC104: Student Cannot Record Point Deduction
- **Interaction**: RecordPointDeduction
- **Preconditions**:
  - Student A and Student B in same dormitory
- **Input Data**:
  - user: student A
  - payload: { userId: 'student-B-id', reason: 'Test', points: 10 }
- **Expected Results**:
  1. Interaction returns error
  2. No deduction created

### TC105: Only Admin Can Process Kick-Out Applications
- **Interaction**: ProcessKickOutApplication
- **Preconditions**:
  - Pending application exists
  - Dormitory head (not admin) exists
- **Input Data**:
  - user: dormitory head
  - payload: { applicationId: 'app-id', decision: 'approved' }
- **Expected Results**:
  1. Interaction returns error
  2. Application remains 'pending'
  3. Target user remains 'active'

## Phase 3: Business Rule Tests

### TC201: Cannot Create Dormitory with Invalid Capacity
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists
- **Input Data**:
  - user: admin user
  - payload: { name: "Test", capacity: 3 }  // Below minimum
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates capacity must be 4-6
  3. No dormitory created

### TC202: Cannot Assign User to Occupied Bed
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin exists
  - Bed already occupied by user A
  - User B exists
- **Input Data**:
  - user: admin
  - payload: { userId: 'user-B-id', bedId: 'occupied-bed-id' }
- **Expected Results**:
  1. Interaction returns error
  2. Bed remains occupied by user A
  3. User B has no bed assignment

### TC203: Cannot Assign User Who Already Has Bed
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin exists
  - User already assigned to bed A
  - Bed B is available
- **Input Data**:
  - user: admin
  - payload: { userId: 'user-id', bedId: 'bed-B-id' }
- **Expected Results**:
  1. Interaction returns error
  2. User remains assigned to bed A
  3. Bed B remains available

### TC204: Dorm Head Cannot Submit Application for Non-Resident
- **Interaction**: SubmitKickOutApplication
- **Preconditions**:
  - Dorm head manages dormitory A
  - User is in dormitory B
- **Input Data**:
  - user: dorm head
  - payload: { userId: 'user-in-B', reason: 'Test' }
- **Expected Results**:
  1. Interaction returns error
  2. No application created

### TC205: Points Cannot Go Below Zero
- **Interaction**: RecordPointDeduction
- **Preconditions**:
  - User has 10 points remaining
  - Dorm head exists
- **Input Data**:
  - user: dorm head
  - payload: { userId: 'user-id', reason: 'Major violation', points: 20 }
- **Expected Results**:
  1. Deduction is created with 20 points
  2. User's totalDeductions becomes 110
  3. User's currentPoints computed as 0 (not -10)

### TC206: Cannot Process Already Processed Application
- **Interaction**: ProcessKickOutApplication
- **Preconditions**:
  - Application already approved/rejected
  - Admin exists
- **Input Data**:
  - user: admin
  - payload: { applicationId: 'processed-app-id', decision: 'approved' }
- **Expected Results**:
  1. Interaction returns error
  2. Application status unchanged
  3. No side effects triggered

### TC207: Cannot Deduct Negative Points
- **Interaction**: RecordPointDeduction
- **Preconditions**: Dorm head and student exist
- **Input Data**:
  - user: dorm head
  - payload: { userId: 'student-id', reason: 'Test', points: -10 }
- **Expected Results**:
  1. Interaction returns error
  2. No deduction created
  3. User's points unchanged

## Test Execution Notes

1. **Phase 1 Tests (TC001-TC009)**: Must all pass before proceeding to Phase 2
2. **Phase 2 Tests (TC101-TC105)**: Implement after adding permission conditions
3. **Phase 3 Tests (TC201-TC207)**: Implement after adding business rule validations
4. All tests should use proper user roles even in Phase 1 to ensure compatibility
5. Use realistic data that will pass future validations 