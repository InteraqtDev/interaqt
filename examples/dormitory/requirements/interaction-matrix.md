# Dormitory Management System - Interaction Matrix

## Overview
This document maps all user roles to their allowed interactions, ensuring comprehensive coverage of all operations with proper access control and business rule validation.

## Role Definitions
- **Admin**: System administrator with full control
- **DormHead**: Dormitory head managing a specific dormitory
- **Student**: Regular user who can be assigned to dormitories

## Interaction Matrix

| Interaction | Admin | DormHead | Student | Permission Logic | Business Rules |
|------------|-------|----------|---------|------------------|----------------|
| **CreateDormitory** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Capacity must be 4-6 |
| **AssignDormHead** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Target user must exist, dormitory must exist |
| **AssignUserToBed** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Bed must be vacant, user not already assigned, user not kicked out |
| **RemoveUserFromBed** | ✓ | ✗ | ✗ | `user.role === 'admin'` | User must be assigned to a bed |
| **TransferUser** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Target bed must be vacant, user must be assigned |
| **CreateViolationRule** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Points must be positive |
| **RecordViolation** | ✗ | ✓ | ✗ | `user.role === 'dormHead'` | Target must be in managed dorm, not self |
| **RequestKickout** | ✗ | ✓ | ✗ | `user.role === 'dormHead'` | Target must be in managed dorm |
| **ApproveKickoutRequest** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Request must be pending |
| **RejectKickoutRequest** | ✓ | ✗ | ✗ | `user.role === 'admin'` | Request must be pending |
| **ViewDormitoryStatus** | ✓ | ✓* | ✓** | See notes | None |
| **ViewUserViolations** | ✓ | ✓* | ✓*** | See notes | None |
| **ViewOccupancyReport** | ✓ | ✓* | ✗ | Admin or dorm head of specific dorm | None |
| **ViewKickoutRequests** | ✓ | ✓* | ✗ | Admin sees all, dorm head sees own | None |

### Permission Notes:
- \* DormHead can only interact with their assigned dormitory
- \** Students can only view their own dormitory status
- \*** Students can only view their own violations

## Detailed Interaction Specifications

### Administrative Interactions

#### CreateDormitory
- **Access**: Admin only
- **Validation**: 
  - Name must be unique
  - Capacity must be between 4 and 6
- **Effects**: Creates dormitory and associated beds

#### AssignDormHead
- **Access**: Admin only
- **Validation**:
  - User must exist
  - Dormitory must exist
  - Dormitory should not already have a dorm head
- **Effects**: Updates user role, creates management relationship

#### ApproveKickoutRequest / RejectKickoutRequest
- **Access**: Admin only
- **Validation**: Request must be in pending state
- **Effects**: 
  - Approve: Removes user from bed, updates user status
  - Reject: Updates request status only

### Dorm Head Interactions

#### RecordViolation
- **Access**: Dorm head of the target user's dormitory
- **Validation**:
  - Cannot record violation for self
  - Target user must be in managed dormitory
  - Violation rule must exist
- **Effects**: Creates violation record, updates user's total points

#### RequestKickout
- **Access**: Dorm head of the target user's dormitory
- **Validation**:
  - Target user must be in managed dormitory
  - Cannot have pending request for same user
- **Effects**: Creates kickout request in pending state

### Query Interactions

#### ViewDormitoryStatus
- **Access Levels**:
  - Admin: Can view any dormitory
  - DormHead: Can view managed dormitory
  - Student: Can view assigned dormitory
- **Returns**: Occupancy info, resident list, bed status

#### ViewUserViolations
- **Access Levels**:
  - Admin: Can view any user's violations
  - DormHead: Can view violations of users in managed dorm
  - Student: Can view own violations only
- **Returns**: List of violation records with details

## Business Rule Enforcement

### Stage 1 - Core Logic (Implement First)
Focus on making all interactions work with valid inputs:
- Create entities and relationships
- Update states correctly
- Calculate computed properties

### Stage 2 - Access Control & Validation (Implement After Stage 1)
Add permission checks and business rules:
- Role-based access control
- Input validation
- Business constraint enforcement

## Test Coverage Requirements

Each interaction must have tests for:
1. **Happy Path**: Valid inputs with proper permissions
2. **Permission Denial**: Unauthorized access attempts
3. **Business Rule Violations**: Invalid inputs or constraint violations
4. **Edge Cases**: Boundary conditions and state conflicts

## Implementation Priority

### Phase 1 - Core Management
1. CreateDormitory
2. AssignUserToBed
3. AssignDormHead

### Phase 2 - Violation System
1. CreateViolationRule
2. RecordViolation
3. ViewUserViolations

### Phase 3 - Kickout Process
1. RequestKickout
2. ApproveKickoutRequest
3. RejectKickoutRequest

### Phase 4 - Queries & Reports
1. ViewDormitoryStatus
2. ViewOccupancyReport
3. ViewKickoutRequests