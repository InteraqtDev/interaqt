# Test Cases Based on Interactions

## Test Suite Organization
Test cases are organized in phases according to implementation priority:
1. **Core Business Logic Tests** (implement first)
2. **Permission Tests** (implement after core logic works)
3. **Business Rule Tests** (implement after core logic works)

## Phase 1: Core Business Logic Tests

### TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction:** AI001 - CreateDormitory
- **Preconditions:** User logged in as Administrator
- **Input Data:** name="Building A Dorm 1", totalBeds=5
- **Expected Results:**
  1. Create new dormitory record with specified name
  2. Create 5 bed records linked to dormitory
  3. All beds initially unoccupied (isOccupied = false)
  4. Dormitory creation timestamp set to current time
  5. leaderId initially null (no leader assigned)
- **Post Validation:** Dormitory appears in dormitory list with 5 available beds

### TC002: Create Dormitory with Invalid Data (via CreateDormitory Interaction)
- **Interaction:** AI001 - CreateDormitory
- **Preconditions:** User logged in as Administrator
- **Input Data:** name="", totalBeds=7  // Empty name and beds > 6
- **Expected Results:**
  1. Interaction returns validation error
  2. Error indicates name required and beds must be 4-6
  3. No dormitory record created
  4. No bed records created
- **Note:** Do NOT test this with storage.create - it bypasses validation!

### TC003: Assign User to Dormitory Bed (via AssignUserToDormitory Interaction)
- **Interaction:** AI002 - AssignUserToDormitory
- **Preconditions:** 
  - Administrator logged in
  - User exists and not assigned to any dormitory
  - Dormitory exists with available beds
- **Input Data:** userId="user123", dormitoryId="dorm456", bedNumber=1
- **Expected Results:**
  1. Create UserDormitoryAssignment relation
  2. Create UserBedAssignment relation
  3. Bed isOccupied set to true
  4. User can access dormitory via User.dormitory property
  5. Dormitory residents list includes the user
- **Post Validation:** User appears in dormitory resident list, bed shows as occupied

### TC004: Assign User to Already Occupied Bed (via AssignUserToDormitory Interaction)
- **Interaction:** AI002 - AssignUserToDormitory
- **Preconditions:** 
  - Administrator logged in
  - Bed already occupied by another user
- **Input Data:** userId="user789", dormitoryId="dorm456", bedNumber=1  // Same bed as TC003
- **Expected Results:**
  1. Interaction returns error
  2. Error indicates bed already occupied
  3. No new assignment relations created
  4. Original assignment remains unchanged
- **Exception Scenario:** Business rule prevents double assignment

### TC005: Appoint Dormitory Leader (via AppointDormitoryLeader Interaction)
- **Interaction:** AI003 - AppointDormitoryLeader
- **Preconditions:** 
  - Administrator logged in
  - User assigned to dormitory (from TC003)
- **Input Data:** userId="user123", dormitoryId="dorm456"
- **Expected Results:**
  1. User role changed to 'dormLeader'
  2. Dormitory leaderId set to user's ID
  3. User gains dormitory leader permissions
  4. User can access leadership functions
- **Post Validation:** User shows as dormitory leader in dormitory details

### TC006: Deduct User Points (via DeductUserPoints Interaction)
- **Interaction:** AI005 - DeductUserPoints
- **Preconditions:** Administrator logged in, target user exists
- **Input Data:** userId="user123", points=10, reason="Noise violation"
- **Expected Results:**
  1. Create PointDeduction record with specified reason and points
  2. User's total points automatically calculated (initial 100 - 10 = 90)
  3. PointDeduction timestamp set to current time
  4. User can view deduction in their point history
- **Post Validation:** User's point history shows the new deduction

### TC007: Submit Kickout Application (via SubmitKickoutApplication Interaction)
- **Interaction:** DL001 - SubmitKickoutApplication
- **Preconditions:** 
  - User logged in as dormitory leader
  - Target user in same dormitory with low points (< 60)
- **Input Data:** targetUserId="user456", reason="Repeated violations"
- **Expected Results:**
  1. Create KickoutApplication record with pending status
  2. Application applicant set to current dormitory leader
  3. Application targetUser set to specified user
  4. Application timestamp set to current time
  5. processedAt initially null
- **Post Validation:** Application appears in pending applications list

### TC008: View Dormitory Residents (via ViewDormitoryResidents Interaction)
- **Interaction:** DL002 - ViewDormitoryResidents
- **Preconditions:** User logged in as dormitory leader
- **Input Data:** None (derived from leader's dormitory assignment)
- **Expected Results:**
  1. Return list of all residents in leader's dormitory
  2. Include each resident's current points total
  3. Include each resident's bed assignment
  4. Only show residents from leader's own dormitory
- **Post Validation:** List matches actual dormitory assignments

### TC009: View My Dormitory Info (via ViewMyDormitoryInfo Interaction)
- **Interaction:** R001 - ViewMyDormitoryInfo
- **Preconditions:** User logged in as resident assigned to dormitory
- **Input Data:** None (derived from user's assignment)
- **Expected Results:**
  1. Return user's dormitory details (name, total beds)
  2. Return user's bed assignment information
  3. Return list of roommates (other residents)
  4. Return dormitory leader information
- **Post Validation:** Information matches user's actual assignments

### TC010: View My Point History (via ViewMyPointHistory Interaction)
- **Interaction:** R002 - ViewMyPointHistory
- **Preconditions:** User logged in with point deduction history
- **Input Data:** None (derived from user's records)
- **Expected Results:**
  1. Return chronological list of user's point deductions
  2. Include deduction reasons and timestamps
  3. Show current total points calculation
  4. Only show user's own point records
- **Post Validation:** History matches actual deduction records

## Phase 2: Permission Tests

### TC011: Non-Admin Creates Dormitory (Permission Test)
- **Interaction:** AI001 - CreateDormitory
- **Test Phase:** Permissions (implement after core logic)
- **Preconditions:** User logged in as Resident (not Administrator)
- **Input Data:** name="Unauthorized Dorm", totalBeds=4
- **Expected Results:**
  1. Interaction returns permission denied error
  2. Error indicates admin role required
  3. No dormitory record created
- **Note:** Tests role-based access control

### TC012: Non-Leader Submits Kickout (Permission Test)
- **Interaction:** DL001 - SubmitKickoutApplication
- **Test Phase:** Permissions (implement after core logic)
- **Preconditions:** User logged in as Resident (not dormitory leader)
- **Input Data:** targetUserId="user456", reason="Test"
- **Expected Results:**
  1. Interaction returns permission denied error
  2. Error indicates dormitory leader role required
  3. No application record created
- **Note:** Tests dormitory leader permission requirement

### TC013: Leader Views Other Dormitory Residents (Permission Test)
- **Interaction:** DL002 - ViewDormitoryResidents
- **Test Phase:** Permissions (implement after core logic)
- **Preconditions:** User is dormitory leader of Dormitory A, trying to view Dormitory B residents
- **Input Data:** Attempt to access Dormitory B data
- **Expected Results:**
  1. Only returns residents from leader's own dormitory (A)
  2. Does not return any Dormitory B residents
  3. Access restricted to own dormitory scope
- **Note:** Tests data access scope restrictions

### TC014: Process Application by Non-Admin (Permission Test)
- **Interaction:** AI004 - ProcessKickoutApplication
- **Test Phase:** Permissions (implement after core logic)
- **Preconditions:** User logged in as Dormitory Leader (not Administrator)
- **Input Data:** applicationId="app123", decision="approve"
- **Expected Results:**
  1. Interaction returns permission denied error
  2. Error indicates administrator role required
  3. Application status remains unchanged
- **Note:** Tests admin-only operations

## Phase 3: Business Rule Tests

### TC015: Kickout Application with High Points (Business Rule Test)
- **Interaction:** DL001 - SubmitKickoutApplication
- **Test Phase:** Business Rules (implement after core logic)
- **Preconditions:** 
  - User logged in as dormitory leader
  - Target user has high points (≥ 60)
- **Input Data:** targetUserId="user789", reason="Attempted kickout"
- **Expected Results:**
  1. Interaction returns business rule violation error
  2. Error indicates target user points too high for kickout eligibility
  3. No application record created
- **Note:** Tests point threshold business rule

### TC016: Duplicate Kickout Application (Business Rule Test)
- **Interaction:** DL001 - SubmitKickoutApplication
- **Test Phase:** Business Rules (implement after core logic)
- **Preconditions:** 
  - Pending kickout application already exists for target user
- **Input Data:** targetUserId="user456", reason="Second attempt"
- **Expected Results:**
  1. Interaction returns business rule violation error
  2. Error indicates pending application already exists
  3. No duplicate application created
- **Note:** Tests duplicate application prevention rule

### TC017: Assign User Already in Dormitory (Business Rule Test)
- **Interaction:** AI002 - AssignUserToDormitory
- **Test Phase:** Business Rules (implement after core logic)
- **Preconditions:** User already assigned to a dormitory
- **Input Data:** userId="user123", dormitoryId="dorm789", bedNumber=1  // Different dormitory
- **Expected Results:**
  1. Interaction returns business rule violation error
  2. Error indicates user already assigned to dormitory
  3. No new assignment created
  4. Original assignment preserved
- **Note:** Tests one-dormitory-per-user rule

### TC018: Appoint Non-Resident as Leader (Business Rule Test)
- **Interaction:** AI003 - AppointDormitoryLeader
- **Test Phase:** Business Rules (implement after core logic)
- **Preconditions:** 
  - Administrator logged in
  - Target user not assigned to the dormitory
- **Input Data:** userId="user999", dormitoryId="dorm456"  // User not in this dormitory
- **Expected Results:**
  1. Interaction returns business rule violation error
  2. Error indicates user must be dormitory resident
  3. No leadership assignment made
  4. Dormitory leadership remains unchanged
- **Note:** Tests leader-must-be-resident rule

### TC019: Process Non-Pending Application (Business Rule Test)
- **Interaction:** AI004 - ProcessKickoutApplication
- **Test Phase:** Business Rules (implement after core logic)
- **Preconditions:** 
  - Administrator logged in
  - Application already processed (approved or rejected)
- **Input Data:** applicationId="app456", decision="approve"  // Already processed app
- **Expected Results:**
  1. Interaction returns business rule violation error
  2. Error indicates application not in pending status
  3. Application status remains unchanged
- **Note:** Tests application status workflow rule

### TC020: Create Dormitory with Invalid Bed Count (Business Rule Test)
- **Interaction:** AI001 - CreateDormitory
- **Test Phase:** Business Rules (implement after core logic)
- **Preconditions:** Administrator logged in
- **Input Data:** name="Invalid Dorm", totalBeds=3  // Below minimum of 4
- **Expected Results:**
  1. Interaction returns business rule violation error
  2. Error indicates bed count must be 4-6
  3. No dormitory created
- **Note:** Tests bed count constraint rule

## Test Case Summary

### Coverage Statistics:
- **Core Business Logic Tests:** 10 test cases (TC001-TC010)
- **Permission Tests:** 4 test cases (TC011-TC014)
- **Business Rule Tests:** 6 test cases (TC015-TC020)
- **Total Test Cases:** 20

### Interaction Coverage:
- **Admin Interactions:** AI001-AI005 (5 interactions) - Fully covered
- **Dormitory Leader Interactions:** DL001-DL002 (2 interactions) - Fully covered
- **Resident Interactions:** R001-R002 (2 interactions) - Fully covered

### Test Priority:
1. **Phase 1 (Critical):** Implement core business logic tests first
2. **Phase 2 (High):** Add permission tests after core functionality works
3. **Phase 3 (Medium):** Add business rule validation tests for complete coverage

### Traceability Matrix:
| Test Case | Interaction | Entity/Relation Tested | Business Rule |
|-----------|-------------|----------------------|---------------|
| TC001 | AI001 | Dormitory, Bed | BR001 |
| TC003 | AI002 | UserDormitoryAssignment, UserBedAssignment | BR001 |
| TC005 | AI003 | User.role, Dormitory.leaderId | BR004 |
| TC006 | AI005 | PointDeduction, UserPointDeductionRelation | BR002 |
| TC007 | DL001 | KickoutApplication | BR003 |
| TC015 | DL001 | KickoutApplication | BR003 (point threshold) |
| TC017 | AI002 | UserDormitoryAssignment | BR001 (one dormitory per user) |