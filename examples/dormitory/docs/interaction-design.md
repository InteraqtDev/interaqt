# Interaction Design

This document outlines all interactions identified from the dormitory management system use cases, documenting core business logic first with Stage 2 extensions noted for later implementation.

## Core Business Logic Interactions (Stage 1)

### CreateUser
- **Purpose**: Create a new user account in the system
- **Payload**:
  - username: string (required) - Unique username for identification
  - email: string (required) - Unique email address
  - password: string (required) - User password for authentication
  - fullName: string (required) - User's full display name
  - role: string (required) - System role: "administrator", "dormitory_leader", "regular_user"
- **Effects**:
  - Creates new User entity
  - Sets isActive to true
  - Sets createdAt to current timestamp
  - Initializes currentScore to 100
- **Stage 2 - Permissions**: Only admin can create users
- **Stage 2 - Business Rules**: 
  - Username must be unique
  - Email must be unique and valid format
  - Password must meet security requirements
  - Role must be from valid list

### CreateDormitory
- **Purpose**: Create a new dormitory with specified bed capacity
- **Payload**:
  - name: string (required) - Unique dormitory name
  - bedCount: number (required) - Number of beds (4-6)
  - building: string (required) - Building identifier
  - floor: number (required) - Floor number
- **Effects**:
  - Creates new Dormitory entity
  - Initializes occupiedBeds to 0
  - Sets availableBeds to bedCount value
- **Stage 2 - Permissions**: Only admin can create dormitories
- **Stage 2 - Business Rules**: 
  - Dormitory name must be unique
  - Bed count must be between 4 and 6 inclusive
  - Building and floor must be specified

### AssignDormitoryLeader
- **Purpose**: Assign a user as leader of a specific dormitory
- **Payload**:
  - userId: string (required) - ID of user to assign as leader
  - dormitoryId: string (required) - ID of dormitory to manage
- **Effects**:
  - Creates DormitoryLeadershipRelation
  - Updates user role to "dormitory_leader"
  - Sets assignedAt to current timestamp
- **Stage 2 - Permissions**: Only admin can assign leaders
- **Stage 2 - Business Rules**: 
  - User must exist and be active
  - User cannot be currently assigned to a bed in any dormitory
  - Dormitory cannot already have an assigned leader

### AssignUserToBed
- **Purpose**: Assign a user to a specific bed in a dormitory
- **Payload**:
  - userId: string (required) - ID of user to assign
  - dormitoryId: string (required) - ID of target dormitory
  - bedNumber: number (required) - Specific bed number
- **Effects**:
  - Creates BedAssignmentRelation
  - Updates dormitory occupiedBeds count
  - Updates dormitory availableBeds count
  - Sets assignedAt to current timestamp
- **Stage 2 - Permissions**: Only admin can assign users to beds
- **Stage 2 - Business Rules**: 
  - User must exist and be active
  - User must not already be assigned to any bed
  - Dormitory must exist
  - Bed must exist and be unoccupied
  - Bed number must be valid for the dormitory

### ApplyScoreDeduction
- **Purpose**: Apply behavior score deduction to a user
- **Payload**:
  - userId: string (required) - ID of user receiving deduction
  - deductionAmount: number (required) - Amount to deduct (positive number)
  - reason: string (required) - Reason for deduction
  - category: string (required) - Category of violation
- **Effects**:
  - Creates ScoreEvent entity
  - Creates UserScoringRelation linking user to score event
  - Updates user currentScore (recalculated from all score events)
  - Sets timestamp to current time
- **Stage 2 - Permissions**: Only dormitory leader can deduct scores from their residents
- **Stage 2 - Business Rules**: 
  - User must be assigned to requester's dormitory
  - Deduction amount must be positive
  - Reason must be provided and non-empty
  - Category must be from predefined list

### CreateRemovalRequest
- **Purpose**: Create a request to remove a problematic user from dormitory
- **Payload**:
  - targetUserId: string (required) - ID of user to be removed
  - reason: string (required) - Reason for removal request
  - urgency: string (required) - Urgency level ("low", "medium", "high")
- **Effects**:
  - Creates RemovalRequest entity
  - Creates RemovalRequestingRelation for requester (role: "requester")
  - Creates RemovalRequestingRelation for target user (role: "target")
  - Sets status to "pending"
  - Sets createdAt to current timestamp
- **Stage 2 - Permissions**: Only dormitory leader can create removal requests
- **Stage 2 - Business Rules**: 
  - Target user must be assigned to requester's dormitory
  - Target user's score must be below removal threshold
  - Reason must be provided
  - No pending removal request for same user

### ProcessRemovalRequest
- **Purpose**: Approve or reject a removal request
- **Payload**:
  - requestId: string (required) - ID of removal request to process
  - decision: string (required) - "approved" or "rejected"
  - notes: string (optional) - Administrator notes on decision
- **Effects**:
  - Updates RemovalRequest status to decision value
  - Sets processedAt to current timestamp
  - Sets notes field if provided
- **Stage 2 - Permissions**: Only admin can process removal requests
- **Stage 2 - Business Rules**: 
  - Request must exist and be in pending status
  - Decision must be 'approved' or 'rejected'
  - Notes are required for rejection

### RemoveUserFromDormitory
- **Purpose**: Remove a user from their dormitory assignment
- **Payload**:
  - userId: string (required) - ID of user to remove
  - effective: string (optional) - Effective date for removal
- **Effects**:
  - Deletes BedAssignmentRelation
  - Updates dormitory occupiedBeds count
  - Updates dormitory availableBeds count
- **Stage 2 - Permissions**: Only admin can remove users from dormitories
- **Stage 2 - Business Rules**: 
  - User must have current bed assignment
  - Must have approved removal request or administrative override
  - Effective date cannot be in the past

## Query Interactions (Stage 1)

### ViewUserList
- **Purpose**: Retrieve list of all users with their assignments and scores
- **Payload**:
  - filters: object (optional) - Filter criteria
  - sortBy: string (optional) - Field to sort by
  - sortOrder: string (optional) - "asc" or "desc"
- **Effects**:
  - Returns filtered and sorted list of users
  - Includes current dormitory assignment
  - Includes current behavior score
- **Stage 2 - Permissions**: Only admin can view all users
- **Stage 2 - Business Rules**: None

### ViewDormitoryList
- **Purpose**: Retrieve list of dormitories with occupancy status
- **Payload**:
  - filters: object (optional) - Filter criteria for dormitories
- **Effects**:
  - Returns list of dormitories with current occupancy
  - Includes bed count, occupied beds, available beds
  - Includes assigned leader information
- **Stage 2 - Permissions**: Admin can view all, dormitory leaders can only view their assigned dormitory
- **Stage 2 - Business Rules**: 
  - Dormitory leaders can only view their assigned dormitory

### ViewMyDormitoryUsers
- **Purpose**: View users assigned to leader's dormitory
- **Payload**: None
- **Effects**:
  - Returns list of users assigned to leader's dormitory
  - Includes current behavior scores
  - Includes bed assignments
- **Stage 2 - Permissions**: Only dormitory leader can view their dormitory users
- **Stage 2 - Business Rules**: 
  - Must be assigned as leader to a dormitory

### ViewMyProfile
- **Purpose**: View own profile and assignment information
- **Payload**: None
- **Effects**:
  - Returns user's own profile information
  - Includes current dormitory assignment if any
  - Includes current behavior score
- **Stage 2 - Permissions**: Any authenticated user can view their own profile
- **Stage 2 - Business Rules**: 
  - Must be authenticated

### ViewAuditLog
- **Purpose**: View system audit trail and action logs
- **Payload**:
  - dateRange: object (optional) - Start and end dates for filtering
  - actionType: string (optional) - Filter by action type
  - userId: string (optional) - Filter by user who performed action
- **Effects**:
  - Returns filtered list of audit log entries
  - Includes timestamp, actor, action type, affected entities
- **Stage 2 - Permissions**: Only admin can view audit logs
- **Stage 2 - Business Rules**: None

## System-Generated Interactions (Stage 1)

### LogAuditEvent
- **Purpose**: Automatically create audit log entries for significant system actions
- **Payload**:
  - actionType: string (required) - Type of action performed
  - actorId: string (required) - ID of user who performed action
  - details: string (optional) - Detailed information about action
- **Effects**:
  - Creates AuditLog entity
  - Creates AuditTrackingRelation linking actor to audit log
  - Sets timestamp to current time
- **Stage 2 - Permissions**: System-generated only
- **Stage 2 - Business Rules**: 
  - Triggered automatically by all state-changing interactions

## Update Operations (Stage 1)

### UpdateUserProfile
- **Purpose**: Update user's profile information
- **Payload**:
  - userId: string (required) - ID of user to update
  - fullName: string (optional) - New full name
- **Effects**:
  - Updates User entity fullName property
- **Stage 2 - Permissions**: Admin can update any user, users can update their own profile
- **Stage 2 - Business Rules**: None

### UpdateSystemSettings
- **Purpose**: Update global system configuration
- **Payload**:
  - settings: object (required) - Configuration object with new settings
- **Effects**:
  - Updates SystemSettings dictionary
- **Stage 2 - Permissions**: Only admin can update system settings
- **Stage 2 - Business Rules**: 
  - Settings must contain valid configuration keys

### UpdateScoreThresholds
- **Purpose**: Update score thresholds for system actions
- **Payload**:
  - thresholds: object (required) - Threshold configuration object
- **Effects**:
  - Updates ScoreThresholds dictionary
- **Stage 2 - Permissions**: Only admin can update thresholds
- **Stage 2 - Business Rules**: 
  - Thresholds must be valid numeric values

## Interaction Summary

### By Category:
- **User Management**: CreateUser, UpdateUserProfile
- **Dormitory Management**: CreateDormitory, AssignDormitoryLeader
- **Assignment Management**: AssignUserToBed, RemoveUserFromDormitory
- **Scoring System**: ApplyScoreDeduction
- **Removal Workflow**: CreateRemovalRequest, ProcessRemovalRequest
- **Query Operations**: ViewUserList, ViewDormitoryList, ViewMyDormitoryUsers, ViewMyProfile, ViewAuditLog
- **System Operations**: LogAuditEvent, UpdateSystemSettings, UpdateScoreThresholds

### By Actor:
- **Global Administrator**: 9 interactions (CreateUser, CreateDormitory, AssignDormitoryLeader, AssignUserToBed, ProcessRemovalRequest, RemoveUserFromDormitory, ViewUserList, ViewDormitoryList, ViewAuditLog, UpdateUserProfile, UpdateSystemSettings, UpdateScoreThresholds)
- **Dormitory Leader**: 4 interactions (ApplyScoreDeduction, CreateRemovalRequest, ViewDormitoryList, ViewMyDormitoryUsers, ViewMyProfile)
- **Regular User**: 1 interaction (ViewMyProfile)
- **System**: 1 interaction (LogAuditEvent)

### State Transitions:
- **User**: Creation → Active → (optional) Role Change → (optional) Dormitory Assignment
- **Dormitory**: Creation → Available → (optional) Leader Assignment → Bed Assignments
- **Scoring**: Score Events Creation → Score Recalculation → (optional) Removal Threshold
- **Removal**: Request Creation → Pending → Approved/Rejected → (optional) User Removal

All interactions follow the basic structure without permissions or business rule validation, which will be implemented in Stage 2 as documented above.