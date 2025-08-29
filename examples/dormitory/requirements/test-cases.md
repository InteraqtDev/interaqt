# Test Cases - Dormitory Management System

## Test Organization
Test cases are organized in implementation phases:
1. **Core Business Logic Tests** (implement first)
2. **Permission Tests** (implement after core logic works)  
3. **Business Rule Tests** (implement after core logic works)

## Core Business Logic Tests

### TC001: Create User Account (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in
- **Input Data**: name="John Doe", email="john@university.edu", studentId="2024001", phone="123-456-7890", role="user"
- **Expected Results**:
  1. Create new user record in system
  2. User starts with default 100 points
  3. User role is set to "user"
  4. Creation timestamp is set to current time
  5. User is not assigned to any bed initially
- **Post Validation**: User appears in system user list

### TC002: Create User with Invalid Data (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in
- **Input Data**: name="", email="invalid-email", studentId=""
- **Expected Results**:
  1. Interaction returns validation error
  2. Error type is "validation failed"
  3. No user record created
  4. System maintains data integrity
- **Note**: Tests interaction-level validation, not direct storage operations

### TC003: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in
- **Input Data**: name="Block A", location="North Campus", capacity=6
- **Expected Results**:
  1. Create new dormitory record
  2. Dormitory capacity set to 6
  3. Current occupancy starts at 0
  4. No beds created automatically (separate interaction)
  5. No leader assigned initially
- **Post Validation**: Dormitory appears in dormitory list

### TC004: Create Beds for Dormitory (via CreateBed Interaction)
- **Interaction**: CreateBed
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in, dormitory exists
- **Input Data**: dormitoryId="dorm123", bedNumber="A1"
- **Expected Results**:
  1. Create new bed record
  2. Bed is linked to correct dormitory
  3. Bed status is "vacant"
  4. Bed number is unique within dormitory
- **Post Validation**: Bed appears in dormitory's bed list

### TC005: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in, user exists, bed exists and is vacant
- **Input Data**: userId="user123", bedId="bed456"
- **Expected Results**:
  1. Create assignment relationship between user and bed
  2. Bed status changes to "occupied"
  3. User's assignedBed property points to bed
  4. Dormitory's currentOccupancy increases by 1
  5. User can only have one bed assignment
- **Post Validation**: User appears in dormitory resident list

### TC006: Assign Dormitory Leader (via AssignDormitoryLeader Interaction)
- **Interaction**: AssignDormitoryLeader
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in, user exists and is assigned to dormitory
- **Input Data**: userId="user123", dormitoryId="dorm456"
- **Expected Results**:
  1. User's role changes to "dormitoryLeader"
  2. User becomes leader of specified dormitory
  3. Previous leader (if any) reverts to "user" role
  4. Leader must be resident of the dormitory they manage
- **Post Validation**: User appears as dormitory leader in dormitory details

### TC007: Create Deduction Rule (via CreateDeductionRule Interaction)
- **Interaction**: CreateDeductionRule
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in
- **Input Data**: name="Noise Violation", description="Making noise after 10 PM", points=10, isActive=true
- **Expected Results**:
  1. Create new deduction rule record
  2. Rule is active by default
  3. Point value is positive number
  4. Rule can be referenced for future deductions
- **Post Validation**: Rule appears in deduction rules list

### TC008: Apply Point Deduction (via ApplyPointDeduction Interaction)
- **Interaction**: ApplyPointDeduction
- **Test Phase**: Core Business Logic
- **Preconditions**: Authorized user (admin/dormitory leader) is logged in, target user exists, deduction rule exists
- **Input Data**: targetUserId="user123", ruleId="rule456", reason="Loud music at 11 PM"
- **Expected Results**:
  1. Create point deduction record
  2. Target user's points decrease by rule's point value
  3. Deduction timestamp recorded
  4. Deduction linked to specific rule
  5. User's total points automatically recalculated
- **Post Validation**: Deduction appears in user's point history

### TC009: Submit Removal Request (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Test Phase**: Core Business Logic
- **Preconditions**: Dormitory leader is logged in, target user is in leader's dormitory
- **Input Data**: targetUserId="user123", reason="Repeated violations despite warnings"
- **Expected Results**:
  1. Create removal request record
  2. Request status is "pending"
  3. Request timestamp recorded
  4. Request linked to requesting leader
  5. Request linked to target user
- **Post Validation**: Request appears in pending requests list

### TC010: Process Removal Request - Approve (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in, removal request exists in pending status
- **Input Data**: requestId="request123", decision="approved", adminComment="User has consistently violated rules"
- **Expected Results**:
  1. Request status changes to "approved"
  2. ProcessedAt timestamp set to current time
  3. Admin comment recorded
  4. Target user removed from bed assignment
  5. Bed status changes to "vacant"
  6. Dormitory occupancy decreases by 1
- **Post Validation**: User no longer appears in dormitory resident list

### TC011: Process Removal Request - Reject (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin is logged in, removal request exists in pending status
- **Input Data**: requestId="request123", decision="rejected", adminComment="Insufficient evidence for removal"
- **Expected Results**:
  1. Request status changes to "rejected"
  2. ProcessedAt timestamp set to current time
  3. Admin comment recorded
  4. Target user remains in current bed assignment
  5. No changes to bed or dormitory occupancy
- **Post Validation**: User still appears in dormitory resident list

## Permission Tests

### TC012: Non-Admin Cannot Create Users (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Test Phase**: Permissions
- **Preconditions**: Dormitory leader is logged in (not admin)
- **Input Data**: name="John Doe", email="john@university.edu", studentId="2024001"
- **Expected Results**:
  1. Interaction returns permission error
  2. Error message indicates insufficient privileges
  3. No user record created
- **Note**: Tests permission validation in interaction layer

### TC013: Non-Admin Cannot Create Dormitories (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Test Phase**: Permissions
- **Preconditions**: Regular user is logged in
- **Input Data**: name="Block B", location="South Campus", capacity=4
- **Expected Results**:
  1. Interaction returns permission error
  2. Error message indicates insufficient privileges
  3. No dormitory record created

### TC014: Dormitory Leader Cannot Deduct Points from Other Dormitories (via ApplyPointDeduction Interaction)
- **Interaction**: ApplyPointDeduction
- **Test Phase**: Permissions
- **Preconditions**: Dormitory leader is logged in, target user is in different dormitory
- **Input Data**: targetUserId="userFromOtherDorm", ruleId="rule123", reason="Violation"
- **Expected Results**:
  1. Interaction returns permission error
  2. Error indicates leader can only affect their dormitory residents
  3. No deduction record created
  4. Target user's points unchanged

### TC015: Regular User Cannot Apply Point Deductions (via ApplyPointDeduction Interaction)
- **Interaction**: ApplyPointDeduction
- **Test Phase**: Permissions
- **Preconditions**: Regular user is logged in
- **Input Data**: targetUserId="user123", ruleId="rule456", reason="Violation"
- **Expected Results**:
  1. Interaction returns permission error
  2. Error indicates insufficient privileges for point deduction
  3. No deduction record created
  4. Target user's points unchanged

### TC016: Non-Leader Cannot Submit Removal Requests (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Test Phase**: Permissions
- **Preconditions**: Regular user is logged in
- **Input Data**: targetUserId="user123", reason="Problematic behavior"
- **Expected Results**:
  1. Interaction returns permission error
  2. Error indicates only dormitory leaders can submit requests
  3. No removal request created

### TC017: Non-Admin Cannot Process Removal Requests (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Test Phase**: Permissions
- **Preconditions**: Dormitory leader is logged in, removal request exists
- **Input Data**: requestId="request123", decision="approved", adminComment="Approved"
- **Expected Results**:
  1. Interaction returns permission error
  2. Error indicates only admins can process requests
  3. Request status remains unchanged

### TC018: User Can Only View Own Profile (via GetUserProfile Interaction)
- **Interaction**: GetUserProfile
- **Test Phase**: Permissions
- **Preconditions**: Regular user is logged in
- **Input Data**: targetUserId="otherUser123"
- **Expected Results**:
  1. Interaction returns permission error (if requesting other's profile)
  2. Error indicates users can only access their own profile
  3. User can successfully access their own profile data

## Business Rule Tests

### TC019: Cannot Assign User to Occupied Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Test Phase**: Business Rules
- **Preconditions**: Admin is logged in, bed exists but is already occupied
- **Input Data**: userId="user123", bedId="occupiedBed456"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error message indicates bed is already occupied
  3. No new assignment created
  4. Existing assignment unchanged

### TC020: Cannot Assign User to Multiple Beds (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Test Phase**: Business Rules
- **Preconditions**: Admin is logged in, user is already assigned to a bed
- **Input Data**: userId="alreadyAssignedUser", bedId="bed789"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates user already has bed assignment
  3. No new assignment created
  4. Existing assignment unchanged

### TC021: Cannot Exceed Dormitory Capacity (via CreateBed Interaction)
- **Interaction**: CreateBed
- **Test Phase**: Business Rules
- **Preconditions**: Admin is logged in, dormitory exists at full capacity
- **Input Data**: dormitoryId="fullDormitory", bedNumber="ExtraBed"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates dormitory capacity would be exceeded
  3. No bed record created
  4. Dormitory capacity unchanged

### TC022: Cannot Assign Leader to Non-Resident (via AssignDormitoryLeader Interaction)
- **Interaction**: AssignDormitoryLeader
- **Test Phase**: Business Rules
- **Preconditions**: Admin is logged in, user exists but is not assigned to target dormitory
- **Input Data**: userId="nonResident", dormitoryId="dorm456"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates leader must be resident of dormitory
  3. No leadership assignment created
  4. Dormitory leadership unchanged

### TC023: Cannot Deduct Points Below Zero (via ApplyPointDeduction Interaction)
- **Interaction**: ApplyPointDeduction
- **Test Phase**: Business Rules
- **Preconditions**: Authorized user is logged in, target user has only 5 points remaining
- **Input Data**: targetUserId="lowPointUser", ruleId="fifteenPointRule", reason="Major violation"
- **Expected Results**:
  1. Interaction returns business rule error OR
  2. Points are clamped to minimum of 0
  3. User points do not go below 0
  4. Deduction record may or may not be created (depends on implementation choice)

### TC024: Cannot Submit Duplicate Removal Requests (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Test Phase**: Business Rules
- **Preconditions**: Dormitory leader is logged in, pending removal request already exists for target user
- **Input Data**: targetUserId="user123", reason="Additional violations"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates pending request already exists for this user
  3. No new request created
  4. Existing request unchanged

### TC025: Cannot Process Already Processed Requests (via ProcessRemovalRequest Interaction)
- **Interaction**: ProcessRemovalRequest
- **Test Phase**: Business Rules
- **Preconditions**: Admin is logged in, removal request already processed (approved/rejected)
- **Input Data**: requestId="processedRequest", decision="approved", adminComment="Changing decision"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates request has already been processed
  3. Request status unchanged
  4. No additional processing recorded

### TC026: Cannot Apply Inactive Deduction Rules (via ApplyPointDeduction Interaction)
- **Interaction**: ApplyPointDeduction
- **Test Phase**: Business Rules
- **Preconditions**: Authorized user is logged in, deduction rule exists but is inactive
- **Input Data**: targetUserId="user123", ruleId="inactiveRule", reason="Violation"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates rule is not active
  3. No deduction record created
  4. User points unchanged

### TC027: Cannot Delete Dormitory with Current Residents (via DeleteDormitory Interaction)
- **Interaction**: DeleteDormitory
- **Test Phase**: Business Rules
- **Preconditions**: Admin is logged in, dormitory has current residents
- **Input Data**: dormitoryId="occupiedDormitory"
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates dormitory must be empty before deletion
  3. Dormitory remains active
  4. No residents displaced

### TC028: Point Threshold for Removal Eligibility (via SubmitRemovalRequest Interaction)
- **Interaction**: SubmitRemovalRequest
- **Test Phase**: Business Rules
- **Preconditions**: Dormitory leader is logged in, target user has points above removal threshold
- **Input Data**: targetUserId="highPointUser", reason="General problematic behavior"
- **Expected Results**:
  1. Interaction may return business rule error OR warning
  2. Error/warning indicates user points are above removal threshold
  3. Request may be created with special status OR rejected
  4. System enforces point-based removal eligibility

## Test Data Setup Requirements

### Initial Test Data
- **Admin User**: Global administrator account
- **Dormitory Leaders**: 2-3 dormitory leader accounts
- **Regular Users**: 10+ regular user accounts with varying point levels
- **Dormitories**: 3-4 dormitories with different capacities
- **Beds**: Sufficient beds to test assignment scenarios
- **Deduction Rules**: 5+ active rules with different point values
- **Processed Requests**: Historical removal requests in various states

### Test Environment Isolation
- Each test should use isolated data or clean up after execution
- Tests should not depend on execution order
- Database state should be consistent between test runs
- Mock data should represent realistic dormitory scenarios

## Integration Test Scenarios

### TC029: Complete User Lifecycle
- **Flow**: CreateUser → AssignUserToBed → AssignDormitoryLeader → ApplyPointDeduction → SubmitRemovalRequest → ProcessRemovalRequest
- **Validates**: End-to-end workflow from user creation to removal
- **Verifies**: All entity relationships and state changes work correctly

### TC030: Dormitory Management Lifecycle  
- **Flow**: CreateDormitory → CreateBed (multiple) → AssignUserToBed (multiple) → AssignDormitoryLeader → DeleteDormitory (should fail) → Remove all users → DeleteDormitory (should succeed)
- **Validates**: Complete dormitory management workflow
- **Verifies**: Business rules prevent invalid operations

### TC031: Point System Integrity
- **Flow**: Create users with default points → Apply multiple deductions → Verify point calculations → Submit removal for low-point user → Process removal → Verify point history preserved
- **Validates**: Point calculation accuracy and audit trail
- **Verifies**: Mathematical consistency and data integrity

## Performance Test Cases

### TC032: Bulk User Assignment
- **Test**: Assign 100+ users to beds simultaneously
- **Validates**: System performance under load
- **Verifies**: No race conditions or data corruption

### TC033: Large Point Deduction History
- **Test**: Generate 1000+ point deductions for various users
- **Validates**: Query performance for point history
- **Verifies**: System remains responsive with large datasets

## Error Recovery Test Cases

### TC034: Partial Transaction Failure
- **Test**: Simulate failure during user bed assignment
- **Validates**: System maintains consistency on partial failures
- **Verifies**: Either complete success or complete rollback

### TC035: Concurrent Modification
- **Test**: Multiple users attempting to assign same bed simultaneously
- **Validates**: Proper handling of concurrent access
- **Verifies**: Only one assignment succeeds, others fail gracefully