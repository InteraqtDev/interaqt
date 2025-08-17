# Test Implementation Plan

## Overview
Total test cases: 27
- Phase 1 (Core Business Logic): 10 test cases (TC001-TC010)
- Phase 2 (Permissions): 5 test cases (TC011-TC015)
- Phase 3 (Business Rules): 10 test cases (TC016-TC025)
- Exception Scenarios: 2 test cases (TC026-TC027)

## Implementation Progress

### Phase 1: Core Business Logic Tests (Priority 1)
- [ ] TC001: Create Dormitory - Basic dormitory creation with automatic bed generation
- [ ] TC002: Assign User to Dormitory - User assignment with bed allocation
- [ ] TC003: Appoint Dorm Head - Promoting user to dormitory head role
- [ ] TC004: Record Point Deduction - Creating point deduction records
- [ ] TC005: Request Eviction - Creating eviction requests for low-point users
- [ ] TC006: Approve Eviction - Admin approving eviction with cascade updates
- [ ] TC007: Reject Eviction - Admin rejecting eviction request
- [ ] TC008: View My Dormitory - User viewing their dormitory information
- [ ] TC009: View My Points - User viewing their point records
- [ ] TC010: Auto Update Status - Dormitory status changes to 'full' when capacity reached

### Phase 2: Permission Tests (Priority 2)
- [ ] TC011: Non-admin Cannot Create Dormitory - Permission denial test
- [ ] TC012: Dorm Head Can Only Deduct Points from Own Dormitory - Cross-dormitory restriction
- [ ] TC013: Regular User Cannot Record Point Deduction - Role-based restriction
- [ ] TC014: Only Admin Can Approve Eviction - Admin-only operation
- [ ] TC015: Admin Can View All Dormitories - Admin visibility privilege

### Phase 3: Business Rule Tests (Priority 3)
- [ ] TC016: Dormitory Capacity Validation - Must be between 4-6
- [ ] TC017: User Cannot Have Multiple Dormitories - Single dormitory assignment
- [ ] TC018: Bed Cannot Be Double-assigned - Bed occupancy validation
- [ ] TC019: Cannot Request Eviction for High-point Users - Minimum point threshold
- [ ] TC020: Point Deduction Must Be Positive - Value validation
- [ ] TC021: Cannot Assign to Full Dormitory - Capacity enforcement
- [ ] TC022: Can Only Appoint Member as Dorm Head - Membership requirement
- [ ] TC023: User Points Cannot Be Negative - Minimum point boundary
- [ ] TC024: Cannot Process Already Handled Request - State validation
- [ ] TC025: Cascade Updates on Eviction - Relationship cleanup

### Exception Scenarios (Priority 4)
- [ ] TC026: Concurrent Bed Assignment - Concurrency handling
- [ ] TC027: Null and Boundary Values - Input validation

## Test Data Requirements

### Initial Setup
- Admin user (role: admin)
- 5 test users (regular users)
- 3 test dormitories with different capacities

### Test Isolation
- Each test should use `beforeEach` for fresh data setup
- Tests should be independent and runnable in any order
- Clean up test data after each test

## Execution Plan

1. **Start with Phase 1**: Implement TC001-TC010 first
   - These tests verify core functionality
   - Must all pass before proceeding

2. **Phase 2 & 3 in parallel**: After Phase 1 passes
   - Permission tests (TC011-TC015)
   - Business rule tests (TC016-TC025)
   - These can be implemented together as they test constraints

3. **Exception scenarios**: Implement last
   - TC026-TC027 test edge cases
   - Optional but recommended for robustness

## Current Status
- **Tests Completed**: 0/27
- **Current Phase**: Phase 1 - Core Business Logic
- **Next Test**: TC001 - Create Dormitory

## Notes
- All tests should use Interactions, not direct storage operations
- Tests should verify both success and failure scenarios
- Each test should be self-contained with proper setup and teardown
- Update this document as tests are completed