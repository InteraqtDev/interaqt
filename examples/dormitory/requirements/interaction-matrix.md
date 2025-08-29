# Interaction Matrix - Dormitory Management System

## Overview
This document maps all user roles to their permitted interactions, ensuring complete coverage of system operations with proper permission controls and business rule validations.

## User Roles Summary
- **Admin**: Global administrator with full system privileges
- **Dormitory Leader**: User managing a specific dormitory and its residents  
- **Regular User**: Standard dormitory resident with limited access

## Interaction Coverage Matrix

| Interaction | Admin | Dormitory Leader | Regular User | Permission Control | Business Rules | Test Cases |
|-------------|-------|------------------|--------------|-------------------|----------------|------------|
| CreateUser | ✅ | ❌ | ❌ | P001 | BR001, BR002 | TC001, TC002, TC012 |
| UpdateUser | ✅ | ❌ (own profile) | ✅ (own profile) | P002 | BR003 | TC018 |
| DeleteUser | ✅ | ❌ | ❌ | P003 | BR004, BR005 | - |
| CreateDormitory | ✅ | ❌ | ❌ | P004 | BR006 | TC003, TC013 |
| UpdateDormitory | ✅ | ❌ | ❌ | P005 | BR007 | - |
| DeleteDormitory | ✅ | ❌ | ❌ | P006 | BR008 | TC027 |
| CreateBed | ✅ | ❌ | ❌ | P007 | BR009 | TC004, TC021 |
| UpdateBed | ✅ | ❌ | ❌ | P008 | BR010 | - |
| DeleteBed | ✅ | ❌ | ❌ | P009 | BR011 | - |
| AssignUserToBed | ✅ | ❌ | ❌ | P010 | BR012, BR013 | TC005, TC019, TC020 |
| RemoveUserFromBed | ✅ | ❌ | ❌ | P011 | BR014 | - |
| AssignDormitoryLeader | ✅ | ❌ | ❌ | P012 | BR015 | TC006, TC022 |
| CreateDeductionRule | ✅ | ❌ | ❌ | P013 | BR016 | TC007 |
| UpdateDeductionRule | ✅ | ❌ | ❌ | P014 | BR017 | - |
| DeactivateDeductionRule | ✅ | ❌ | ❌ | P015 | BR018 | - |
| ApplyPointDeduction | ✅ | ✅ (own dormitory) | ❌ | P016 | BR019, BR020 | TC008, TC014, TC015, TC023, TC026 |
| SubmitRemovalRequest | ❌ | ✅ (own dormitory) | ❌ | P017 | BR021, BR022 | TC009, TC016, TC024, TC028 |
| ProcessRemovalRequest | ✅ | ❌ | ❌ | P018 | BR023 | TC010, TC011, TC017, TC025 |
| GetUserProfile | ✅ (any user) | ✅ (own + residents) | ✅ (own only) | P019 | - | TC018 |
| GetDormitoryInfo | ✅ (any) | ✅ (own + managed) | ✅ (own only) | P020 | - | - |
| GetPointHistory | ✅ (any user) | ✅ (own + residents) | ✅ (own only) | P021 | - | - |
| GetRemovalRequests | ✅ (all) | ✅ (own submitted) | ❌ | P022 | - | - |

## Permission Control Details

### P001: CreateUser
- **Requirement**: Only admins can create user accounts
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to create users"

### P002: UpdateUser  
- **Requirement**: Users can update own profile, admins can update any
- **Implementation**: User ID match OR admin role check
- **Error**: "Can only modify your own profile"

### P003: DeleteUser
- **Requirement**: Only admins can delete user accounts
- **Implementation**: Role-based check for 'admin' role  
- **Error**: "Insufficient privileges to delete users"

### P004: CreateDormitory
- **Requirement**: Only admins can create dormitories
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to create dormitories"

### P005: UpdateDormitory
- **Requirement**: Only admins can update dormitory information
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to modify dormitories"

### P006: DeleteDormitory  
- **Requirement**: Only admins can delete dormitories
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to delete dormitories"

### P007-P009: Bed Management (Create/Update/Delete)
- **Requirement**: Only admins can manage bed configurations
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to manage beds"

### P010-P011: User Bed Assignment
- **Requirement**: Only admins can assign/remove users from beds
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to manage bed assignments"

### P012: AssignDormitoryLeader
- **Requirement**: Only admins can assign dormitory leaders
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to assign dormitory leaders"

### P013-P015: Deduction Rule Management
- **Requirement**: Only admins can manage deduction rules
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to manage deduction rules"

### P016: ApplyPointDeduction
- **Requirement**: Admins can deduct from any user, leaders only from their dormitory residents
- **Implementation**: Admin role OR (leader role AND user in managed dormitory)
- **Error**: "Can only apply deductions to residents of your managed dormitory"

### P017: SubmitRemovalRequest
- **Requirement**: Only dormitory leaders can submit removal requests for their residents
- **Implementation**: Dormitory leader role AND target user in managed dormitory
- **Error**: "Only dormitory leaders can submit removal requests for their residents"

### P018: ProcessRemovalRequest
- **Requirement**: Only admins can approve/reject removal requests
- **Implementation**: Role-based check for 'admin' role
- **Error**: "Insufficient privileges to process removal requests"

### P019: GetUserProfile
- **Requirement**: Users see own profile, leaders see residents, admins see all
- **Implementation**: User ID match OR dormitory relationship OR admin role
- **Error**: "Insufficient privileges to view this user's profile"

### P020: GetDormitoryInfo
- **Requirement**: Users see own dormitory, leaders see managed dormitory, admins see all
- **Implementation**: User assigned to dormitory OR leader of dormitory OR admin role
- **Error**: "Insufficient privileges to view dormitory information"

### P021: GetPointHistory
- **Requirement**: Users see own history, leaders see residents' history, admins see all
- **Implementation**: User ID match OR dormitory relationship OR admin role
- **Error**: "Insufficient privileges to view point history"

### P022: GetRemovalRequests
- **Requirement**: Leaders see own submitted requests, admins see all
- **Implementation**: Requester ID match OR admin role
- **Error**: "Insufficient privileges to view removal requests"

## Business Rule Details

### BR001: User Creation Validation
- **Rule**: User data must be valid and complete
- **Validation**: Name, email, studentId required and properly formatted
- **Error**: "Invalid user data: [specific field errors]"

### BR002: Unique User Constraints
- **Rule**: Email and studentId must be unique across system
- **Validation**: Check existing users before creation
- **Error**: "User with this email/student ID already exists"

### BR003: Profile Update Constraints
- **Rule**: Certain fields (studentId, role) have update restrictions
- **Validation**: Field-specific update rules
- **Error**: "Field [fieldName] cannot be modified"

### BR004: User Deletion Prerequisites  
- **Rule**: User must be removed from bed before deletion
- **Validation**: Check bed assignment before soft delete
- **Error**: "User must be removed from bed assignment before deletion"

### BR005: Leader Deletion Handling
- **Rule**: Dormitory leadership must be transferred before leader deletion
- **Validation**: Check leader status and handle transfer
- **Error**: "Dormitory leadership must be transferred before deletion"

### BR006: Dormitory Creation Validation
- **Rule**: Dormitory name must be unique, capacity must be 4-6
- **Validation**: Name uniqueness and capacity range check
- **Error**: "Invalid dormitory data: [specific errors]"

### BR007: Dormitory Update Constraints
- **Rule**: Capacity cannot be reduced below current occupancy
- **Validation**: Compare new capacity with current occupancy
- **Error**: "Cannot reduce capacity below current occupancy"

### BR008: Dormitory Deletion Prerequisites
- **Rule**: Dormitory must be empty before deletion
- **Validation**: Check current occupancy = 0
- **Error**: "Dormitory must be empty before deletion"

### BR009: Bed Creation Validation
- **Rule**: Bed number must be unique within dormitory, cannot exceed capacity
- **Validation**: Check bed count against dormitory capacity
- **Error**: "Cannot create bed: would exceed dormitory capacity"

### BR010: Bed Update Constraints
- **Rule**: Bed number must remain unique within dormitory
- **Validation**: Check bed number uniqueness
- **Error**: "Bed number must be unique within dormitory"

### BR011: Bed Deletion Prerequisites
- **Rule**: Bed must be vacant before deletion
- **Validation**: Check bed occupancy status
- **Error**: "Bed must be vacant before deletion"

### BR012: Single Bed Assignment
- **Rule**: User can only be assigned to one bed at a time
- **Validation**: Check existing user bed assignments
- **Error**: "User already assigned to a bed"

### BR013: Bed Occupancy Validation
- **Rule**: Bed can only accommodate one user at a time
- **Validation**: Check bed current occupancy
- **Error**: "Bed is already occupied"

### BR014: Bed Removal Validation
- **Rule**: Can only remove user from their currently assigned bed
- **Validation**: Check user's current bed assignment
- **Error**: "User is not assigned to specified bed"

### BR015: Leader Assignment Prerequisites
- **Rule**: Leader must be a resident of the dormitory they manage
- **Validation**: Check user's bed assignment in target dormitory
- **Error**: "Leader must be a resident of the dormitory"

### BR016: Deduction Rule Validation
- **Rule**: Rule name must be unique, points must be positive
- **Validation**: Name uniqueness and point value validation
- **Error**: "Invalid deduction rule data"

### BR017: Rule Update Constraints
- **Rule**: Point changes only affect future deductions
- **Validation**: No retroactive point adjustments
- **Error**: "Rule changes only apply to future deductions"

### BR018: Rule Deactivation Validation
- **Rule**: Cannot apply inactive rules for deductions
- **Validation**: Check rule active status
- **Error**: "Cannot apply inactive deduction rule"

### BR019: Deduction Authority Validation
- **Rule**: Leaders can only deduct from their dormitory residents
- **Validation**: Check dormitory relationship
- **Error**: "Can only apply deductions to residents of managed dormitory"

### BR020: Point Minimum Constraint
- **Rule**: User points cannot go below zero
- **Validation**: Check if deduction would result in negative points
- **Error**: "Deduction would result in negative points" OR clamp to 0

### BR021: Removal Request Authority
- **Rule**: Only dormitory leaders can request removal of their residents
- **Validation**: Check leader status and dormitory relationship
- **Error**: "Can only request removal of your dormitory residents"

### BR022: Duplicate Request Prevention
- **Rule**: Cannot submit multiple pending requests for same user
- **Validation**: Check existing pending requests for target user
- **Error**: "Pending removal request already exists for this user"

### BR023: Request Processing Validation
- **Rule**: Can only process requests in pending status
- **Validation**: Check request current status
- **Error**: "Request has already been processed"

## Test Case Coverage Mapping

### Core Business Logic Coverage
- **User Management**: TC001-TC002 (CreateUser), TC018 (GetUserProfile)
- **Dormitory Management**: TC003 (CreateDormitory), TC004 (CreateBed), TC005 (AssignUserToBed), TC006 (AssignDormitoryLeader)
- **Point System**: TC007 (CreateDeductionRule), TC008 (ApplyPointDeduction)
- **Removal Workflow**: TC009 (SubmitRemovalRequest), TC010-TC011 (ProcessRemovalRequest)

### Permission Test Coverage
- **Admin-Only Operations**: TC012 (CreateUser), TC013 (CreateDormitory)
- **Dormitory Leader Restrictions**: TC014 (cross-dormitory deductions), TC016-TC017 (removal request permissions)
- **User Access Control**: TC015 (point deduction), TC018 (profile access)

### Business Rule Coverage
- **Assignment Rules**: TC019-TC020 (bed occupancy), TC021 (capacity limits), TC022 (leader residency)
- **Point System Rules**: TC023 (negative points), TC026 (inactive rules)
- **Request Workflow Rules**: TC024 (duplicate requests), TC025 (processed requests), TC028 (point thresholds)
- **Deletion Rules**: TC027 (occupied dormitory deletion)

## Implementation Priority

### Phase 1: Core Entity Operations
1. CreateUser, UpdateUser, GetUserProfile
2. CreateDormitory, CreateBed, GetDormitoryInfo
3. AssignUserToBed, AssignDormitoryLeader

### Phase 2: Point System
1. CreateDeductionRule, UpdateDeductionRule
2. ApplyPointDeduction, GetPointHistory

### Phase 3: Removal Workflow
1. SubmitRemovalRequest, GetRemovalRequests
2. ProcessRemovalRequest

### Phase 4: Advanced Operations
1. User/Dormitory/Bed deletion operations
2. Bulk assignment operations
3. Administrative reporting functions

## Validation Strategy

### Permission Validation Order
1. **Authentication Check**: Verify user is logged in
2. **Role-Based Check**: Verify user has required role
3. **Resource-Level Check**: Verify user has access to specific resources
4. **Business Rule Check**: Verify operation doesn't violate business constraints

### Error Handling Standards
- **Permission Errors**: HTTP 403 with descriptive message
- **Business Rule Errors**: HTTP 400 with specific rule violation
- **Validation Errors**: HTTP 400 with field-specific error details
- **Not Found Errors**: HTTP 404 with resource identification

### Audit Trail Requirements
- All point deductions must be logged with timestamp and reason
- All removal requests and processing must be recorded
- All administrative actions must be auditable
- User assignments and role changes must be tracked

This interaction matrix ensures that every system operation has:
1. Clear permission controls appropriate to the user role
2. Proper business rule validation to maintain data integrity  
3. Comprehensive test coverage across all scenarios
4. Structured implementation approach for development phases