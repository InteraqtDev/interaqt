# Interaction Design

## Overview
This document defines all interactions for the dormitory management system based on the detailed requirements and interaction matrix. Each interaction is designed for core business logic first, with permission and business rule requirements documented for Stage 2 implementation.

## Core User Management Interactions

### CreateUser
- **Purpose**: Create a new user account in the system
- **Payload**:
  - name: string (required) - User's display name
  - email: string (required) - Unique email identifier
  - studentId: string (required) - Unique student identifier
  - phone: string (optional) - Contact phone number
  - role: string (optional, default: "user") - User role (admin, dormitoryLeader, user)
- **Effects**:
  - Creates new User entity
  - Sets default points to 100
  - Sets timestamps (createdAt, updatedAt)
  - Initializes isDeleted to false
- **Stage 2 - Permissions**: Only admin can create users (P001)
- **Stage 2 - Business Rules**: 
  - Email and studentId must be unique (BR001, BR002)
  - All required fields must be valid and properly formatted (BR001)

### UpdateUser
- **Purpose**: Update user profile information
- **Payload**:
  - userId: string (required) - Reference to user to update
  - name: string (optional) - Updated display name
  - email: string (optional) - Updated email (requires validation)
  - phone: string (optional) - Updated phone number
- **Effects**:
  - Updates specified User entity properties
  - Updates updatedAt timestamp
- **Stage 2 - Permissions**: Users can update own profile, admins can update any (P002)
- **Stage 2 - Business Rules**: 
  - Email uniqueness validation if changed (BR003)
  - Cannot modify studentId or role via this interaction (BR003)

### DeleteUser
- **Purpose**: Soft delete a user account
- **Payload**:
  - userId: string (required) - Reference to user to delete
- **Effects**:
  - Sets User.isDeleted to true
  - Removes user from bed assignment if any
  - Transfers dormitory leadership if user is a leader
- **Stage 2 - Permissions**: Only admin can delete users (P003)
- **Stage 2 - Business Rules**: 
  - User must be removed from bed before deletion (BR004)
  - Transfer dormitory leadership before deletion (BR005)

## Dormitory Management Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory building
- **Payload**:
  - name: string (required) - Dormitory name
  - location: string (required) - Physical location
  - capacity: number (required) - Maximum bed capacity (4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Initializes currentOccupancy to 0
  - Sets timestamps and deletion flag
- **Stage 2 - Permissions**: Only admin can create dormitories (P004)
- **Stage 2 - Business Rules**: 
  - Dormitory name must be unique (BR006)
  - Capacity must be between 4-6 (BR006)

### UpdateDormitory
- **Purpose**: Update dormitory information
- **Payload**:
  - dormitoryId: string (required) - Reference to dormitory to update
  - name: string (optional) - Updated name
  - location: string (optional) - Updated location
  - capacity: number (optional) - Updated capacity
- **Effects**:
  - Updates specified Dormitory entity properties
  - Updates updatedAt timestamp
- **Stage 2 - Permissions**: Only admin can update dormitories (P005)
- **Stage 2 - Business Rules**: 
  - Name uniqueness if changed (BR007)
  - Capacity cannot be reduced below current occupancy (BR007)

### DeleteDormitory
- **Purpose**: Soft delete a dormitory
- **Payload**:
  - dormitoryId: string (required) - Reference to dormitory to delete
- **Effects**:
  - Sets Dormitory.isDeleted to true
  - Soft deletes all associated beds
- **Stage 2 - Permissions**: Only admin can delete dormitories (P006)
- **Stage 2 - Business Rules**: 
  - Dormitory must be empty (currentOccupancy = 0) before deletion (BR008)

## Bed Management Interactions

### CreateBed
- **Purpose**: Create a new bed within a dormitory
- **Payload**:
  - dormitoryId: string (required) - Reference to parent dormitory
  - number: string (required) - Bed identifier (e.g., "A1", "B2")
- **Effects**:
  - Creates new Bed entity
  - Creates DormitoryBedRelation
  - Sets status to "vacant"
  - Sets timestamps
- **Stage 2 - Permissions**: Only admin can create beds (P007)
- **Stage 2 - Business Rules**: 
  - Bed number must be unique within dormitory (BR009)
  - Cannot exceed dormitory capacity (BR009)

### UpdateBed
- **Purpose**: Update bed information
- **Payload**:
  - bedId: string (required) - Reference to bed to update
  - number: string (optional) - Updated bed number
- **Effects**:
  - Updates specified Bed entity properties
  - Updates updatedAt timestamp
- **Stage 2 - Permissions**: Only admin can update beds (P008)
- **Stage 2 - Business Rules**: 
  - Bed number must remain unique within dormitory (BR010)

### DeleteBed
- **Purpose**: Soft delete a bed
- **Payload**:
  - bedId: string (required) - Reference to bed to delete
- **Effects**:
  - Sets Bed.isDeleted to true
- **Stage 2 - Permissions**: Only admin can delete beds (P009)
- **Stage 2 - Business Rules**: 
  - Bed must be vacant before deletion (BR011)

## User Assignment Interactions

### AssignUserToBed
- **Purpose**: Assign a user to a specific bed
- **Payload**:
  - userId: string (required) - Reference to user to assign
  - bedId: string (required) - Reference to target bed
- **Effects**:
  - Creates UserBedAssignmentRelation
  - Updates Bed.status to "occupied"
  - Updates Dormitory.currentOccupancy
- **Stage 2 - Permissions**: Only admin can assign users to beds (P010)
- **Stage 2 - Business Rules**: 
  - User can only be assigned to one bed at a time (BR012)
  - Bed can only accommodate one user (BR013)

### RemoveUserFromBed
- **Purpose**: Remove a user from their assigned bed
- **Payload**:
  - userId: string (required) - Reference to user to remove
- **Effects**:
  - Deletes UserBedAssignmentRelation
  - Updates Bed.status to "vacant"
  - Updates Dormitory.currentOccupancy
- **Stage 2 - Permissions**: Only admin can remove users from beds (P011)
- **Stage 2 - Business Rules**: 
  - User must be currently assigned to a bed (BR014)

### AssignDormitoryLeader
- **Purpose**: Assign a user as dormitory leader
- **Payload**:
  - userId: string (required) - Reference to user to make leader
  - dormitoryId: string (required) - Reference to dormitory to manage
- **Effects**:
  - Updates User.role to "dormitoryLeader"
  - Creates UserDormitoryLeaderRelation
  - Removes previous leader if exists
- **Stage 2 - Permissions**: Only admin can assign dormitory leaders (P012)
- **Stage 2 - Business Rules**: 
  - Leader must be a resident of the dormitory (BR015)

## Point Deduction System Interactions

### CreateDeductionRule
- **Purpose**: Create a new point deduction rule
- **Payload**:
  - name: string (required) - Rule name
  - description: string (required) - Rule description
  - points: number (required) - Point deduction amount
  - isActive: boolean (optional, default: true) - Whether rule is active
- **Effects**:
  - Creates new DeductionRule entity
  - Sets timestamps and deletion flag
- **Stage 2 - Permissions**: Only admin can create deduction rules (P013)
- **Stage 2 - Business Rules**: 
  - Rule name must be unique (BR016)
  - Points must be positive number (BR016)

### UpdateDeductionRule
- **Purpose**: Update an existing deduction rule
- **Payload**:
  - ruleId: string (required) - Reference to rule to update
  - name: string (optional) - Updated name
  - description: string (optional) - Updated description
  - points: number (optional) - Updated point value
  - isActive: boolean (optional) - Updated active status
- **Effects**:
  - Updates specified DeductionRule entity properties
  - Updates updatedAt timestamp
- **Stage 2 - Permissions**: Only admin can update deduction rules (P014)
- **Stage 2 - Business Rules**: 
  - Point changes only affect future deductions (BR017)

### DeactivateDeductionRule
- **Purpose**: Deactivate a deduction rule
- **Payload**:
  - ruleId: string (required) - Reference to rule to deactivate
- **Effects**:
  - Sets DeductionRule.isActive to false
  - Updates updatedAt timestamp
- **Stage 2 - Permissions**: Only admin can deactivate rules (P015)
- **Stage 2 - Business Rules**: 
  - Cannot apply inactive rules for deductions (BR018)

### ApplyPointDeduction
- **Purpose**: Apply a point deduction to a user
- **Payload**:
  - targetUserId: string (required) - Reference to user receiving deduction
  - ruleId: string (required) - Reference to deduction rule being applied
  - reason: string (required) - Specific reason for this deduction
- **Effects**:
  - Creates new PointDeduction entity
  - Creates UserPointDeductionRelation
  - Creates DeductionRuleApplicationRelation
  - Updates User.points (computed from deductions)
- **Stage 2 - Permissions**: Admin can deduct from any user, leaders only from their dormitory residents (P016)
- **Stage 2 - Business Rules**: 
  - Leaders can only deduct from their dormitory residents (BR019)
  - User points cannot go below zero (BR020)
  - Rule must be active (BR018)

## Removal Request Workflow Interactions

### SubmitRemovalRequest
- **Purpose**: Submit a request to remove a problematic resident
- **Payload**:
  - targetUserId: string (required) - Reference to user to be removed
  - reason: string (required) - Justification for removal
- **Effects**:
  - Creates new RemovalRequest entity
  - Creates UserRemovalRequestTargetRelation
  - Creates UserRemovalRequestRequesterRelation
  - Sets status to "pending"
- **Stage 2 - Permissions**: Only dormitory leaders can submit requests for their residents (P017)
- **Stage 2 - Business Rules**: 
  - Only dormitory leaders can request removal of their residents (BR021)
  - Cannot submit multiple pending requests for same user (BR022)

### ProcessRemovalRequest
- **Purpose**: Approve or reject a removal request
- **Payload**:
  - requestId: string (required) - Reference to request to process
  - decision: string (required) - "approved" or "rejected"
  - adminComment: string (optional) - Admin's notes on decision
- **Effects**:
  - Updates RemovalRequest.status to decision
  - Sets RemovalRequest.processedAt timestamp
  - Sets RemovalRequest.adminComment
  - Creates UserRemovalRequestProcessorRelation
  - If approved, removes user from bed assignment
- **Stage 2 - Permissions**: Only admin can process removal requests (P018)
- **Stage 2 - Business Rules**: 
  - Can only process requests in pending status (BR023)

## Query Interactions

### GetUserProfile
- **Purpose**: Retrieve user profile information
- **Payload**:
  - userId: string (required) - Reference to user to retrieve
- **Effects**:
  - Returns User entity data
- **Stage 2 - Permissions**: Users see own profile, leaders see residents, admins see all (P019)

### GetDormitoryInfo
- **Purpose**: Retrieve dormitory details including residents
- **Payload**:
  - dormitoryId: string (required) - Reference to dormitory to retrieve
- **Effects**:
  - Returns Dormitory entity data with relationships
- **Stage 2 - Permissions**: Users see own dormitory, leaders see managed dormitory, admins see all (P020)

### GetPointHistory
- **Purpose**: Retrieve point deduction history for a user
- **Payload**:
  - userId: string (required) - Reference to user whose history to retrieve
- **Effects**:
  - Returns PointDeduction entities related to user
- **Stage 2 - Permissions**: Users see own history, leaders see residents' history, admins see all (P021)

### GetRemovalRequests
- **Purpose**: Retrieve removal requests based on user role
- **Payload**:
  - status: string (optional) - Filter by request status
- **Effects**:
  - Returns RemovalRequest entities based on permissions
- **Stage 2 - Permissions**: Leaders see own submitted requests, admins see all (P022)

## Administrative Interactions

### GetSystemStats
- **Purpose**: Retrieve system-wide statistics
- **Payload**: (none)
- **Effects**:
  - Returns dictionary values and computed statistics
- **Stage 2 - Permissions**: Only admin can view system statistics

### GetDormitoryList
- **Purpose**: Retrieve list of all dormitories
- **Payload**:
  - includeDeleted: boolean (optional, default: false) - Include soft-deleted dormitories
- **Effects**:
  - Returns Dormitory entities list
- **Stage 2 - Permissions**: Admin sees all, others see relevant dormitories

### GetUserList
- **Purpose**: Retrieve list of users
- **Payload**:
  - role: string (optional) - Filter by user role
  - dormitoryId: string (optional) - Filter by dormitory
- **Effects**:
  - Returns User entities list
- **Stage 2 - Permissions**: Admin sees all, leaders see own dormitory residents

## Implementation Notes

### Interaction Patterns
1. **Create Pattern**: Takes entity properties in payload, creates entity and relations
2. **Update Pattern**: Takes entity reference + updated fields, modifies existing entity
3. **Delete Pattern**: Takes entity reference, performs soft deletion
4. **State Change Pattern**: Takes entity reference, changes specific state properties
5. **Query Pattern**: Takes filter parameters, returns matching entities

### Validation Strategy
- **Stage 1**: Basic payload validation (required fields, data types)
- **Stage 2**: Permission validation (role-based access control)
- **Stage 2**: Business rule validation (constraints and relationships)

### Error Handling
- Permission errors return HTTP 403 with descriptive messages
- Business rule violations return HTTP 400 with specific constraint details
- Validation errors return HTTP 400 with field-specific problems
- Not found errors return HTTP 404 with resource identification

### Audit Requirements
- All state-changing interactions must be logged with timestamps
- Point deductions must maintain complete audit trail
- Removal requests and processing must be fully recorded
- User assignments and role changes must be tracked

This interaction design provides the foundation for implementing the core business logic without permissions or complex business rules, which will be added in Stage 2 of the implementation.