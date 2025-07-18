# Dormitory Management System - Test Cases

## 🔴 CRITICAL: All test cases MUST be based on Interactions, NOT on Entity/Relation operations

## TC001: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: User is system administrator
- **Input Data**: 
  - dormitoryData: { name: "Building A - Room 101", capacity: 6 }
- **Expected Results**:
  1. Create new dormitory record
  2. Automatically create 6 bed spaces with bedNumbers 1-6
  3. All bed spaces are initially unoccupied
  4. Dormitory is active by default
- **Post Validation**: Dormitory appears in system with correct bed count

## TC002: Create Dormitory with Invalid Capacity (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Preconditions**: User is system administrator
- **Input Data**: 
  - dormitoryData: { name: "Invalid Dorm", capacity: 3 }  // Below minimum
- **Expected Results**:
  1. Interaction returns error
  2. Error type is "validation failed" 
  3. No dormitory record created
  4. No bed spaces created
- **Note**: Do NOT test with storage.create - it bypasses validation!

## TC003: Assign Dorm Leader (via AssignDormLeader Interaction)
- **Interaction**: AssignDormLeader
- **Preconditions**: 
  - User is system administrator
  - Dormitory exists
  - Target user exists and has no current leader role
- **Input Data**:
  - dormitoryId: "dorm123"
  - leaderId: "user456"
- **Expected Results**:
  1. User role updated to 'leader'
  2. Dormitory leaderId field updated
  3. User can now manage this specific dormitory
- **Exception Scenario**: Assigning leader to non-existent dorm should fail

## TC004: Assign User to Bed Space (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - User is administrator
  - Target user exists and has no current assignment
  - Bed space exists and is unoccupied
- **Input Data**:
  - userId: "user789"
  - bedSpaceId: "bed101"
- **Expected Results**:
  1. Create new Assignment record
  2. Assignment is active
  3. Bed space isOccupied becomes true
  4. User is linked to the dormitory
- **Post Validation**: User appears in dormitory resident list

## TC005: Assign User to Occupied Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Preconditions**:
  - User is administrator
  - Target user exists
  - Bed space is already occupied
- **Input Data**:
  - userId: "user999"
  - bedSpaceId: "bed101"  // Already occupied
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates bed is already occupied
  3. No new assignment created
  4. Existing assignment unchanged

## TC006: Report Violation (via ReportViolation Interaction)
- **Interaction**: ReportViolation
- **Preconditions**:
  - User is dorm leader or administrator
  - Target user is assigned to leader's dormitory (if leader)
  - Violation type is valid
- **Input Data**:
  - targetUserId: "user789"
  - violationType: "NOISE_VIOLATION"
  - description: "Loud music after 10 PM"
- **Expected Results**:
  1. Create new Violation record
  2. User's score automatically reduced by 10 points
  3. Violation timestamp recorded
  4. Reporter ID stored
- **Post Validation**: User's new score reflects deduction

## TC007: Report Violation by Unauthorized User (via ReportViolation Interaction)
- **Interaction**: ReportViolation
- **Preconditions**:
  - User is regular resident (not leader or admin)
- **Input Data**:
  - targetUserId: "user789"
  - violationType: "NOISE_VIOLATION"
  - description: "Loud music"
- **Expected Results**:
  1. Interaction returns permission error
  2. No violation record created
  3. Target user's score unchanged

## TC008: Submit Kickout Request (via SubmitKickoutRequest Interaction)
- **Interaction**: SubmitKickoutRequest
- **Preconditions**:
  - User is dorm leader
  - Target user is assigned to leader's dormitory
  - Target user has low score (eligibility for kickout)
- **Input Data**:
  - targetUserId: "user789"
  - reason: "Multiple violations, score below threshold"
- **Expected Results**:
  1. Create new KickoutRequest record
  2. Request status is 'pending'
  3. Request timestamp recorded
  4. Requester ID stored
- **Post Validation**: Request appears in admin review queue

## TC009: Submit Invalid Kickout Request (via SubmitKickoutRequest Interaction)
- **Interaction**: SubmitKickoutRequest
- **Preconditions**:
  - User is dorm leader
  - Target user is NOT in leader's dormitory
- **Input Data**:
  - targetUserId: "user999"  // Different dorm
  - reason: "Not my responsibility"
- **Expected Results**:
  1. Interaction returns permission error
  2. No kickout request created
  3. Leader can only request for their own dorm residents

## TC010: Approve Kickout Request (via ApproveKickoutRequest Interaction)
- **Interaction**: ApproveKickoutRequest
- **Preconditions**:
  - User is system administrator
  - Kickout request exists with 'pending' status
- **Input Data**:
  - requestId: "request123"
  - decision: "approved"
- **Expected Results**:
  1. Request status updated to 'approved'
  2. Target user's assignment becomes inactive
  3. Bed space becomes available (isOccupied = false)
  4. Review timestamp and reviewer ID recorded
- **Post Validation**: User is no longer in dormitory resident list

## TC011: Reject Kickout Request (via ApproveKickoutRequest Interaction)
- **Interaction**: ApproveKickoutRequest
- **Preconditions**:
  - User is system administrator
  - Kickout request exists with 'pending' status
- **Input Data**:
  - requestId: "request123"
  - decision: "rejected"
- **Expected Results**:
  1. Request status updated to 'rejected'
  2. Target user's assignment remains active
  3. User stays in dormitory
  4. Review details recorded

## TC012: Get Dormitory Details (via GetDormitoryDetails Interaction)
- **Interaction**: GetDormitoryDetails
- **Preconditions**: 
  - User has appropriate permissions
  - Dormitory exists
- **Input Data**:
  - dormitoryId: "dorm123"
- **Expected Results**:
  1. Return dormitory information
  2. Include bed space details
  3. Include current resident list
  4. Include leader information
- **Post Validation**: Data matches actual dormitory state

## TC013: Get User Violations History (via GetUserViolations Interaction)
- **Interaction**: GetUserViolations
- **Preconditions**:
  - User is admin or dorm leader checking their residents
  - Target user exists
- **Input Data**:
  - userId: "user789"
- **Expected Results**:
  1. Return list of user's violations
  2. Include violation details and timestamps
  3. Show score impact of each violation
  4. Ordered by most recent first
- **Permission Check**: Leader can only view violations for their dorm residents

## TC014: Transfer User Between Beds (via TransferUser Interaction)
- **Interaction**: TransferUser
- **Preconditions**:
  - User is administrator
  - Source and target bed spaces exist
  - Target bed is unoccupied
  - User has current assignment
- **Input Data**:
  - userId: "user789"
  - newBedSpaceId: "bed102"
- **Expected Results**:
  1. Current assignment becomes inactive
  2. New assignment created for target bed
  3. Source bed becomes available
  4. Target bed becomes occupied
- **Post Validation**: User appears at new bed location

## TC015: Multiple Violations Score Impact (via ReportViolation Interaction)
- **Interaction**: ReportViolation (multiple calls)
- **Preconditions**: User assigned to dormitory
- **Test Sequence**:
  1. Report NOISE_VIOLATION (-10 points)
  2. Report CLEANLINESS_ISSUE (-15 points)  
  3. Report DAMAGE_TO_PROPERTY (-25 points)
- **Expected Results**:
  1. Each violation creates separate record
  2. Score decreases incrementally: 100 → 90 → 75 → 50
  3. All violations linked to user
  4. Score never goes below 0
- **Post Validation**: Final score is 50, user eligible for kickout

## Edge Cases and Error Scenarios

### EC001: Capacity Validation
- Test dormitory creation with capacity 0, 1, 10 (all should fail)
- Only 4-6 capacity should succeed

### EC002: Concurrent Assignment Protection
- Two admins try to assign different users to same bed simultaneously
- Only one should succeed

### EC003: Score Boundary Testing
- User with score 5 receives -10 violation
- Score should become 0, not negative

### EC004: Dormitory Leader Limits
- User assigned as leader to multiple dormitories
- Should fail - one leader per dormitory, one dormitory per leader

### EC005: Self-Violation Prevention
- Leader tries to report violation against themselves
- Should be prevented by business logic

## Test Data Setup Requirements

### Users
- admin1: System administrator
- leader1: Dorm leader for Building A
- leader2: Dorm leader for Building B  
- resident1, resident2, resident3: Regular residents

### Dormitories
- dorm1: Building A Room 101 (capacity 6, leader: leader1)
- dorm2: Building B Room 201 (capacity 4, leader: leader2)

### Initial State
- All users start with score 100
- Some beds occupied, some available
- No pending kickout requests