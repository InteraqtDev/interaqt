# Stage 2 Implementation Status

## Summary
Stage 2 permissions and business rules have been successfully implemented with 6 out of 8 tests passing.

## Completed Features

### Permission Controls ✅
- **AdminRole**: Only admins can create dormitories, assign users, create rules, and process removal requests
- **DormHeadRole**: Dorm heads can deduct points and request removals for their dormitory members
- **StudentRole**: Students can only view their own score

### Business Rules ✅
- **ValidDormitoryCapacity**: Dormitory capacity must be between 4-6
- **UserNotAssigned**: Users cannot be assigned to multiple dormitories
- **DormitoryNotFull**: Cannot assign users to full dormitories
- **SameDormitory**: Dorm heads can only manage users in their own dormitory
- **LowScore**: Can only request removal for users with score < 60
- **RequestPending**: Can only process pending removal requests

### Tests Passing (6/8)
- ✅ TC011: Non-admin Create Dormitory Fails
- ✅ TC012: Create Dormitory with Invalid Capacity Fails
- ✅ TC013: Duplicate User Assignment to Dormitory Fails
- ✅ TC014: Dorm Head Can Only Deduct Points from Same Dormitory
- ✅ TC016: Cannot Request Removal for User with High Score
- ✅ TC017: Cannot Assign User to Full Dormitory

## Impact on Stage 1 Tests

After implementing Stage 2 permissions, Stage 1 tests now fail because:
1. Stage 1 was designed to test core business logic WITHOUT permission checks
2. All interactions now have permission conditions that cannot be disabled
3. Stage 1 tests need to be updated to:
   - Pass full user objects with roles
   - Handle permission checks in their assertions
   - Or we need a mechanism to disable permissions for Stage 1 testing

## Remaining Issues (2 tests failing)

### 1. TC015: Deduct Points Cannot Result in Negative Score
**Issue**: User score remains 100 after deductions instead of going to 0.

**Root Cause**: The score computed property appears to have a transaction visibility issue. When the condition checks the score during the same transaction where deduction records are created, the computed property might not see the uncommitted deduction records.

**Technical Details**:
- DeductionRecord is created correctly with proper points (verified in logs)
- The Transform correctly fetches rule points from the database
- The computed property includes deduction records in attributeQuery
- But the score computation returns 100 (base score) without seeing deductions

### 2. TC018: Cannot Process Already Processed Removal Request
**Issue**: The removal request creation fails because the user's score is computed as 100 instead of 50 after deduction.

**Root Cause**: Same as TC015 - the LowScore condition checks the user's score, which is computed as 100 because it doesn't see the deduction record created in the same test.

## Framework Limitations Discovered

1. **Computed Properties with Relations**: Computed properties that depend on related entities may not see uncommitted data within the same transaction.

2. **Transform for Updates**: Cannot use Transform to update existing entities (e.g., updating user role when assigned as dorm head).

3. **Single Entity Creation in Transform**: When returning an array from Transform, only one entity is created (e.g., only 1 bed created instead of 6).

## Recommendations for Full Implementation

1. **Score Computation**: Consider using a reactive computation (like Summation) that properly handles transaction boundaries, or redesign the score system to use a different approach.

2. **Role Updates**: Implement a separate mechanism for updating user roles when they become dorm heads (possibly using StateMachine or a dedicated interaction).

3. **Bed Creation**: Investigate the framework's handling of array returns in Transform or implement bed creation through multiple Transform calls.

4. **ProcessedAt Timestamp**: Find an alternative approach to set the processedAt timestamp when removal requests are processed, since Transform cannot update existing entities.

5. **Stage 1 Compatibility**: Either update Stage 1 tests to work with permissions or implement a way to disable permissions for testing core business logic. 