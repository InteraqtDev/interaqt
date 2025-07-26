# Dormitory Management System - Test Cases

## Overview
This document contains comprehensive test cases for the dormitory management system, organized by phases as per the progressive implementation approach.

## Stage 1: Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists in system
- **Input Data**: 
  - user: admin (role='admin')
  - payload: { name: "Building A", capacity: 4 }
- **Expected Results**:
  1. New dormitory entity created
  2. Dormitory name is "Building A"
  3. Dormitory capacity is 4
  4. Dormitory status is "active"
  5. Occupancy count is 0
  6. 4 bed entities are created and linked to dormitory
- **Post Validation**: Dormitory appears in system dormitory list

### TC002: Create Dormitory with Maximum Capacity (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists in system
- **Input Data**:
  - user: admin (role='admin')
  - payload: { name: "Building B", capacity: 6 }
- **Expected Results**:
  1. New dormitory entity created
  2. Dormitory capacity is 6
  3. 6 bed entities are created
  4. All beds have status "vacant"

### TC003: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**: 
  - Admin user exists
  - Student user exists (role='student')
  - Dormitory with vacant beds exists
- **Input Data**:
  - user: admin
  - payload: { userId: "student1", bedId: "bed1" }
- **Expected Results**:
  1. UserBedRelation created
  2. Bed status changes to "occupied"
  3. User's currentBed property points to assigned bed
  4. Dormitory occupancy count increases by 1
  5. Assignment timestamp is recorded

### TC004: Assign Dorm Head (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **Preconditions**:
  - Admin user exists
  - Regular user exists
  - Dormitory exists
- **Input Data**:
  - user: admin
  - payload: { userId: "user1", dormitoryId: "dorm1" }
- **Expected Results**:
  1. User role changes to "dormHead"
  2. DormitoryDormHeadRelation created
  3. Dormitory's dormHead property points to user
  4. User's managedDormitory property points to dormitory

### TC005: Record Violation (via RecordViolation Interaction)
- **Interaction**: RecordViolation
- **Preconditions**:
  - Dorm head exists and manages a dormitory
  - Student is assigned to a bed in that dormitory
  - Violation rule exists (e.g., "Noise Violation", 10 points)
- **Input Data**:
  - user: dormHead
  - payload: { 
      targetUserId: "student1",
      violationRuleId: "rule1",
      description: "Loud music after 10 PM"
    }
- **Expected Results**:
  1. ViolationRecord created
  2. Record linked to user and violation rule
  3. User's totalViolationPoints increases by 10
  4. Violation timestamp recorded
  5. Record status is "active"

### TC006: Request Kickout (via RequestKickout Interaction)
- **Interaction**: RequestKickout
- **Preconditions**:
  - Dorm head manages dormitory
  - Student in dormitory has violations
- **Input Data**:
  - user: dormHead
  - payload: {
      targetUserId: "student1",
      reason: "Multiple violations, total 120 points"
    }
- **Expected Results**:
  1. KickoutRequest entity created
  2. Request status is "pending"
  3. Request linked to dorm head, target user, and dormitory
  4. Request timestamp recorded

### TC007: Approve Kickout Request (via ApproveKickoutRequest Interaction)
- **Interaction**: ApproveKickoutRequest
- **Preconditions**:
  - Admin user exists
  - Pending kickout request exists
  - Target user is assigned to a bed
- **Input Data**:
  - user: admin
  - payload: {
      requestId: "request1",
      decision: "approved",
      comments: "Approved due to repeated violations"
    }
- **Expected Results**:
  1. KickoutRequest status changes to "approved"
  2. User status changes to "kickedOut"
  3. UserBedRelation is removed
  4. Bed status changes back to "vacant"
  5. Dormitory occupancy count decreases by 1
  6. Admin comments recorded

### TC008: Transfer User Between Beds (via TransferUser Interaction)
- **Interaction**: TransferUser
- **Preconditions**:
  - Admin user exists
  - User assigned to bed1
  - bed2 is vacant in different dormitory
- **Input Data**:
  - user: admin
  - payload: {
      userId: "student1",
      newBedId: "bed2"
    }
- **Expected Results**:
  1. Old UserBedRelation removed
  2. New UserBedRelation created
  3. Old bed status changes to "vacant"
  4. New bed status changes to "occupied"
  5. Both dormitory occupancy counts updated correctly

### TC009: Multiple Violation Accumulation (via RecordViolation Interaction)
- **Interaction**: RecordViolation (multiple calls)
- **Preconditions**:
  - Student assigned to dormitory
  - Multiple violation rules exist
- **Test Flow**:
  1. Record "Noise Violation" (10 points)
  2. Record "Hygiene Violation" (15 points)
  3. Record "Safety Violation" (30 points)
- **Expected Results**:
  1. Three ViolationRecord entities created
  2. User's totalViolationPoints is 55 (10+15+30)
  3. All records linked to correct user and rules

### TC010: Create Violation Rule (via CreateViolationRule Interaction)
- **Interaction**: CreateViolationRule
- **Preconditions**: Admin user exists
- **Input Data**:
  - user: admin
  - payload: {
      name: "Curfew Violation",
      description: "Returning after 11 PM",
      points: 20,
      category: "discipline"
    }
- **Expected Results**:
  1. ViolationRule entity created
  2. All properties correctly set
  3. Rule available for use in RecordViolation

## Stage 2: Permission and Business Rule Tests

### TC011: Non-Admin Cannot Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Student user exists (role='student')
- **Input Data**:
  - user: student
  - payload: { name: "Building X", capacity: 4 }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates permission denied
  3. No dormitory created
  4. No beds created

### TC012: Create Dormitory with Invalid Capacity (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: Admin user exists
- **Input Data**:
  - user: admin
  - payload: { name: "Building Y", capacity: 8 }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates capacity must be 4-6
  3. No dormitory created

### TC013: Assign User to Occupied Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - Admin exists
  - Bed already occupied by another user
- **Input Data**:
  - user: admin
  - payload: { userId: "student2", bedId: "occupiedBed1" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed is already occupied
  3. No new assignment created
  4. Original occupant remains unchanged

### TC014: Dorm Head Cannot Record Violation for Non-Resident (via RecordViolation Interaction)
- **Interaction**: RecordViolation
- **Preconditions**:
  - Dorm head manages Building A
  - Student assigned to Building B
- **Input Data**:
  - user: dormHeadA
  - payload: { targetUserId: "studentInBuildingB", violationRuleId: "rule1" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user not in managed dormitory
  3. No violation record created

### TC015: Cannot Assign Already Assigned User (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - User already assigned to a bed
  - Another vacant bed exists
- **Input Data**:
  - user: admin
  - payload: { userId: "assignedStudent", bedId: "vacantBed" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user already assigned
  3. User remains in original bed
  4. Target bed remains vacant

### TC016: Cannot Approve Already Processed Request (via ApproveKickoutRequest Interaction)
- **Interaction**: ApproveKickoutRequest
- **Preconditions**:
  - Kickout request already approved
- **Input Data**:
  - user: admin
  - payload: { requestId: "approvedRequest", decision: "approved" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates request already processed
  3. Request status remains unchanged

### TC017: Dorm Head Cannot Record Violation for Self (via RecordViolation Interaction)
- **Interaction**: RecordViolation
- **Preconditions**:
  - Dorm head assigned to a bed in their managed dormitory
- **Input Data**:
  - user: dormHead
  - payload: { targetUserId: "dormHead", violationRuleId: "rule1" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates cannot record violation for self
  3. No violation record created

### TC018: Cannot Assign Kicked Out User (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - User has status "kickedOut"
  - Vacant bed exists
- **Input Data**:
  - user: admin
  - payload: { userId: "kickedOutUser", bedId: "vacantBed" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user is kicked out
  3. No assignment created
  4. Bed remains vacant

### TC019: Student Cannot View Other Dormitory Status (via ViewDormitoryStatus Interaction)
- **Interaction**: ViewDormitoryStatus
- **Preconditions**:
  - Student assigned to Building A
  - Trying to view Building B status
- **Input Data**:
  - user: student
  - payload: { dormitoryId: "buildingB" }
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates permission denied
  3. No dormitory information returned

### TC020: Reject Kickout Request (via ApproveKickoutRequest Interaction)
- **Interaction**: ApproveKickoutRequest
- **Preconditions**:
  - Admin exists
  - Pending kickout request exists
- **Input Data**:
  - user: admin
  - payload: {
      requestId: "request2",
      decision: "rejected",
      comments: "First offense, warning issued instead"
    }
- **Expected Results**:
  1. Request status changes to "rejected"
  2. Target user remains in assigned bed
  3. User status remains "active"
  4. Admin comments recorded

## Edge Cases and Complex Scenarios

### TC021: Full Dormitory Assignment Check
- **Scenario**: Attempt to view available beds when dormitory is full
- **Expected**: Query returns empty list of available beds, isFull computed property is true

### TC022: Concurrent Assignment Prevention
- **Scenario**: Two admins try to assign different users to same bed
- **Expected**: First assignment succeeds, second fails with "bed occupied" error

### TC023: Kickout Request for User with No Violations
- **Scenario**: Dorm head requests kickout for user with 0 violation points
- **Expected**: Request created successfully (business logic allows it, admin decides)

### TC024: State Transition Validation
- **Scenario**: Various state transitions for beds and users
- **Expected**: Only valid transitions allowed (vacant→occupied, active→kickedOut, etc.)

## Test Data Setup

### Users
- admin1: { name: "System Admin", email: "admin@dorm.com", role: "admin" }
- dormHead1: { name: "John Doe", email: "john@dorm.com", role: "dormHead" }
- student1: { name: "Alice Smith", email: "alice@dorm.com", role: "student" }
- student2: { name: "Bob Jones", email: "bob@dorm.com", role: "student" }

### Dormitories
- buildingA: { name: "Building A", capacity: 4 }
- buildingB: { name: "Building B", capacity: 6 }

### Violation Rules
- rule1: { name: "Noise Violation", points: 10, category: "discipline" }
- rule2: { name: "Hygiene Violation", points: 15, category: "hygiene" }
- rule3: { name: "Safety Violation", points: 30, category: "safety" }

## Success Criteria
- All Stage 1 tests pass before implementing Stage 2
- All Stage 2 tests pass while Stage 1 tests continue to pass
- No regression in functionality between stages
- Clear error messages for all failure scenarios