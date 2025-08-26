# Interaction Design

## Admin Interactions

### CreateUser
- **Purpose**: Create a new user in the system
- **Payload**:
  - name: string (required)
  - email: string (required)
  - isAdmin: boolean (optional, default: false)
- **Effects**:
  - Creates new User entity
  - Initializes points to 100
- **Stage 2 - Permissions**: Only admin can create users
- **Stage 2 - Business Rules**: Email must be unique

### CreateDormitory
- **Purpose**: Create a new dormitory
- **Payload**:
  - name: string (required)
  - bedCount: number (required, must be 4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Initializes with empty beds
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: 
  - bedCount must be between 4 and 6
  - Name must be unique

### AssignDormitoryHead
- **Purpose**: Assign a user as dormitory head
- **Payload**:
  - dormitoryId: string (required)
  - userId: string (required)
- **Effects**:
  - Creates/Updates DormitoryHeadRelation
  - Removes previous head if exists
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: 
  - User cannot be head of multiple dormitories
  - User must exist
  - Dormitory must exist

### RemoveDormitoryHead
- **Purpose**: Remove dormitory head assignment
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Deletes DormitoryHeadRelation
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: Dormitory must have a head assigned

### AssignUserToBed
- **Purpose**: Assign a student to a dormitory bed
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
  - bedNumber: number (required, 1-6)
- **Effects**:
  - Creates BedAssignment entity
  - Creates UserBedAssignmentRelation
  - Creates DormitoryBedAssignmentRelation
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: 
  - User must not already be assigned to a bed
  - Bed number must be valid for dormitory capacity (1 to bedCount)
  - Bed must not already be occupied
  - User and dormitory must exist

### RemoveUserFromBed
- **Purpose**: Remove a user from their bed assignment
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Sets BedAssignment.removedAt to current timestamp
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Only admin can remove directly
- **Stage 2 - Business Rules**: User must have an active bed assignment

### ProcessRemovalRequest
- **Purpose**: Approve or reject a removal request
- **Payload**:
  - removalRequestId: string (required)
  - decision: string (required, 'approved' or 'rejected')
  - comment: string (required)
- **Effects**:
  - Updates RemovalRequest status and processedAt
  - Creates AdminComment entity
  - Creates RemovalRequestAdminCommentRelation
  - Creates AdminCommentAuthorRelation
  - If approved: Sets BedAssignment.removedAt
- **Stage 2 - Permissions**: Only admin can process
- **Stage 2 - Business Rules**: 
  - Request must be in 'pending' status
  - Request must exist

### PromoteToAdmin
- **Purpose**: Grant admin privileges to a user
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Sets User.isAdmin to true
- **Stage 2 - Permissions**: Only admin can promote
- **Stage 2 - Business Rules**: User must not already be admin

### DemoteFromAdmin
- **Purpose**: Remove admin privileges from a user
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Sets User.isAdmin to false
- **Stage 2 - Permissions**: Only admin can demote
- **Stage 2 - Business Rules**: 
  - User must currently be admin
  - Cannot demote self
  - Must have at least one admin remaining

### UpdateDormitoryName
- **Purpose**: Change dormitory name
- **Payload**:
  - dormitoryId: string (required)
  - name: string (required)
- **Effects**:
  - Updates Dormitory.name
- **Stage 2 - Permissions**: Only admin can update
- **Stage 2 - Business Rules**: New name must be unique

### UpdateDormitoryCapacity
- **Purpose**: Change dormitory bed count
- **Payload**:
  - dormitoryId: string (required)
  - bedCount: number (required, 4-6)
- **Effects**:
  - Updates Dormitory.bedCount
- **Stage 2 - Permissions**: Only admin can update
- **Stage 2 - Business Rules**: 
  - New bedCount must be 4-6
  - Can only modify when dormitory is empty (occupancy = 0)

### DeleteUser
- **Purpose**: Soft delete a user account
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Soft deletes User entity
  - Cascades to related entities as defined
- **Stage 2 - Permissions**: Only admin can delete
- **Stage 2 - Business Rules**: Cannot delete self

### DeleteDormitory
- **Purpose**: Soft delete a dormitory
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Soft deletes Dormitory entity
- **Stage 2 - Permissions**: Only admin can delete
- **Stage 2 - Business Rules**: Dormitory must be empty (no active assignments)

## Dormitory Head Interactions

### DeductPoints
- **Purpose**: Deduct points from a resident for infractions
- **Payload**:
  - userId: string (required)
  - reason: string (required)
  - points: number (required, positive)
- **Effects**:
  - Creates PointDeduction entity
  - Creates UserPointDeductionRelation
  - Creates CreatorPointDeductionRelation
  - Decrements User.points
- **Stage 2 - Permissions**: Dormitory head for residents in their dormitory, or admin
- **Stage 2 - Business Rules**: 
  - User must be in head's dormitory (if not admin)
  - Points to deduct must be positive
  - User.points cannot go below 0

### RequestUserRemoval
- **Purpose**: Request removal of a resident with low points
- **Payload**:
  - userId: string (required)
  - reason: string (required)
- **Effects**:
  - Creates RemovalRequest entity with status 'pending'
  - Creates RemovalRequestUserRelation
  - Creates RemovalRequestCreatorRelation
  - Creates RemovalRequestDormitoryRelation
- **Stage 2 - Permissions**: Dormitory head for residents in their dormitory
- **Stage 2 - Business Rules**: 
  - User must be in head's dormitory
  - User points must be <= 20
  - No pending removal request for same user in same dormitory

## User Interactions

### UpdateUserProfile
- **Purpose**: Update user's own profile information
- **Payload**:
  - name: string (optional)
- **Effects**:
  - Updates User.name
  - Updates User.updatedAt
- **Stage 2 - Permissions**: Authenticated user can update own profile
- **Stage 2 - Business Rules**: None

### UpdateUserEmail
- **Purpose**: Update user's email address
- **Payload**:
  - email: string (required)
- **Effects**:
  - Updates User.email
  - Updates User.updatedAt
- **Stage 2 - Permissions**: Authenticated user can update own email
- **Stage 2 - Business Rules**: 
  - Email must be unique
  - Email format must be valid

## Query Interactions (Read-Only)

### ViewMyStatus
- **Purpose**: View current user's complete status
- **Payload**: None
- **Returns**: 
  - User profile
  - Current bed assignment
  - Points and deduction history
  - Any pending removal requests
- **Stage 2 - Permissions**: Authenticated users
- **Stage 2 - Business Rules**: None

### ViewDormitoryInfo
- **Purpose**: View dormitory information
- **Payload**:
  - dormitoryId: string (optional, defaults to user's assigned dormitory)
- **Returns**: 
  - Dormitory details
  - Residents list
  - Dormitory head information
  - Bed occupancy status
- **Stage 2 - Permissions**: 
  - Users can view their own dormitory
  - Admins can view any dormitory
  - Dormitory heads can view their dormitory
- **Stage 2 - Business Rules**: None

### GetUserList
- **Purpose**: Get list of users with filters
- **Payload**:
  - isAdmin: boolean (optional)
  - dormitoryId: string (optional)
  - hasAssignment: boolean (optional)
  - limit: number (optional)
  - offset: number (optional)
- **Returns**: Filtered list of users
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: None

### GetDormitoryList
- **Purpose**: Get list of all dormitories
- **Payload**:
  - hasHead: boolean (optional)
  - isFull: boolean (optional)
- **Returns**: List of dormitories with basic info
- **Stage 2 - Permissions**: Authenticated users
- **Stage 2 - Business Rules**: None

### GetRemovalRequests
- **Purpose**: Get list of removal requests
- **Payload**:
  - status: string (optional, 'pending'/'approved'/'rejected')
  - dormitoryId: string (optional)
  - userId: string (optional)
- **Returns**: Filtered list of removal requests
- **Stage 2 - Permissions**: 
  - Admins can view all
  - Dormitory heads can view for their dormitory
  - Users can view their own
- **Stage 2 - Business Rules**: None

### GetPointDeductions
- **Purpose**: Get point deduction history
- **Payload**:
  - userId: string (optional)
  - createdById: string (optional)
  - startDate: number (optional, timestamp)
  - endDate: number (optional, timestamp)
- **Returns**: List of point deductions
- **Stage 2 - Permissions**: 
  - Users can view their own
  - Dormitory heads can view for their residents
  - Admins can view all
- **Stage 2 - Business Rules**: None

## System-Generated Interactions

These interactions would typically be handled by external authentication/user management systems:
- **CreateUser** (when integrated with auth system)
- **Login**
- **Logout**
- **Register**
- **ResetPassword**
- **VerifyEmail**

## Summary of Effects

### Entity Creation Triggers
- **User**: CreateUser
- **Dormitory**: CreateDormitory
- **BedAssignment**: AssignUserToBed
- **PointDeduction**: DeductPoints
- **RemovalRequest**: RequestUserRemoval
- **AdminComment**: ProcessRemovalRequest (when approved/rejected)

### Relation Creation Triggers
- **DormitoryHeadRelation**: AssignDormitoryHead
- **UserBedAssignmentRelation**: AssignUserToBed
- **DormitoryBedAssignmentRelation**: AssignUserToBed
- **UserPointDeductionRelation**: DeductPoints
- **CreatorPointDeductionRelation**: DeductPoints
- **RemovalRequestUserRelation**: RequestUserRemoval
- **RemovalRequestCreatorRelation**: RequestUserRemoval
- **RemovalRequestDormitoryRelation**: RequestUserRemoval
- **RemovalRequestAdminCommentRelation**: ProcessRemovalRequest
- **AdminCommentAuthorRelation**: ProcessRemovalRequest

### Property Updates
- **User.points**: DeductPoints (decrement)
- **User.isAdmin**: PromoteToAdmin, DemoteFromAdmin
- **User.name**: UpdateUserProfile
- **User.email**: UpdateUserEmail
- **Dormitory.name**: UpdateDormitoryName
- **Dormitory.bedCount**: UpdateDormitoryCapacity
- **BedAssignment.removedAt**: ProcessRemovalRequest (if approved), RemoveUserFromBed
- **RemovalRequest.status**: ProcessRemovalRequest
- **RemovalRequest.processedAt**: ProcessRemovalRequest