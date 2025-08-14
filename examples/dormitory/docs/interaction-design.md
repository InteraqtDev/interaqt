# Dormitory Management System - Interaction Design

## User Management Interactions

### CreateUser
- **Purpose**: Create new user accounts
- **Payload**:
  - name: string (required)
  - email: string (required)
  - role: string (required, admin/dormHead/student)
- **Effects**:
  - Creates new User entity
  - Initializes points to 100
  - Sets status to active
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Email must be unique

### UpdateUserRole
- **Purpose**: Promote users to dorm head role
- **Payload**:
  - userId: string (required)
  - role: string (required)
- **Effects**:
  - Updates user's role
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Cannot change own role

### UpdateUser
- **Purpose**: Modify user details
- **Payload**:
  - userId: string (required)
  - name: string (optional)
  - email: string (optional)
- **Effects**:
  - Updates user properties
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Email must be unique if changed

### DeleteUser
- **Purpose**: Soft delete user accounts
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Marks user as inactive
  - Removes from dormitory and bed assignments
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Cannot delete users with pending requests

## Dormitory Management Interactions

### CreateDormitory
- **Purpose**: Create new dormitories
- **Payload**:
  - name: string (required)
  - capacity: number (required, 4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Creates bed records automatically
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Capacity must be 4-6, name must be unique

### UpdateDormitory
- **Purpose**: Modify dormitory details
- **Payload**:
  - dormitoryId: string (required)
  - name: string (optional)
  - capacity: number (optional)
- **Effects**:
  - Updates dormitory properties
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Cannot reduce capacity below current occupancy

### DeleteDormitory
- **Purpose**: Remove dormitories (soft delete)
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Marks dormitory as inactive
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Cannot delete dormitory with active users

### ViewDormitories
- **Purpose**: View list of dormitories
- **Payload**:
  - status: string (optional, filter by status)
- **Effects**:
  - Returns dormitory list with basic info
- **Stage 2 - Permissions**: All users
- **Stage 2 - Business Rules**: Students see limited info

## Assignment Interactions

### AssignUserToDormitory
- **Purpose**: Assign users to dormitories
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
- **Effects**:
  - Creates UserDormitoryRelation
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: 
  - User must not already be assigned
  - Dormitory must have available capacity
  - Dormitory must be active

### AssignUserToBed
- **Purpose**: Assign specific bed to user
- **Payload**:
  - userId: string (required)
  - bedId: string (required)
- **Effects**:
  - Creates UserBedRelation
  - Updates bed status to occupied
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**:
  - User must be assigned to dormitory
  - Bed must be in user's dormitory
  - Bed must be available

### RemoveFromDormitory
- **Purpose**: Remove user from dormitory
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Removes UserDormitoryRelation
  - Removes UserBedRelation
  - Resets bed status to available
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: User must be assigned

### ViewAssignments
- **Purpose**: View dormitory assignments
- **Payload**:
  - dormitoryId: string (optional)
- **Effects**:
  - Returns assignment information
- **Stage 2 - Permissions**: Limited by role
- **Stage 2 - Business Rules**: Users see only their assignments

## Point System Interactions

### DeductPoints
- **Purpose**: Deduct points for violations
- **Payload**:
  - userId: string (required)
  - points: number (required)
  - reason: string (required)
- **Effects**:
  - Creates PointDeduction record
  - Updates user's points
- **Stage 2 - Permissions**: Admin or Dorm Head of user's dormitory
- **Stage 2 - Business Rules**:
  - User must be in dorm head's dormitory (for dorm heads)
  - User must have sufficient points
  - Points must be positive number

### ViewPoints
- **Purpose**: View current points
- **Payload**:
  - userId: string (optional)
- **Effects**:
  - Returns user's current points
- **Stage 2 - Permissions**: Limited by role
- **Stage 2 - Business Rules**: Users see only their points

### ViewPointHistory
- **Purpose**: View point deduction history
- **Payload**:
  - userId: string (optional)
  - limit: number (optional)
- **Effects**:
  - Returns point deduction records
- **Stage 2 - Permissions**: Limited by role
- **Stage 2 - Business Rules**: Users see only their history

### ResetPoints
- **Purpose**: Reset user points to default
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Resets user points to 100
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Creates point deduction record for reset

## Eviction Process Interactions

### RequestEviction
- **Purpose**: Request user eviction
- **Payload**:
  - userId: string (required)
  - reason: string (required)
- **Effects**:
  - Creates EvictionRequest with pending status
- **Stage 2 - Permissions**: Admin or Dorm Head of user's dormitory
- **Stage 2 - Business Rules**:
  - User must be in requestor's dormitory
  - User points must be below threshold (e.g., 50)
  - No pending request already exists

### ApproveEviction
- **Purpose**: Approve eviction request
- **Payload**:
  - requestId: string (required)
- **Effects**:
  - Updates request status to approved
  - Removes user from dormitory and bed
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**:
  - Request must be in pending status
  - User must still be in dormitory

### RejectEviction
- **Purpose**: Reject eviction request
- **Payload**:
  - requestId: string (required)
- **Effects**:
  - Updates request status to rejected
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Request must be in pending status

### ViewEvictionRequests
- **Purpose**: View eviction requests
- **Payload**:
  - status: string (optional, filter by status)
- **Effects**:
  - Returns eviction request list
- **Stage 2 - Permissions**: Limited by role
- **Stage 2 - Business Rules**: Dorm heads see only their requests

## Query Interactions

### GetUsers
- **Purpose**: Get list of users
- **Payload**:
  - role: string (optional)
  - status: string (optional)
  - dormitoryId: string (optional)
- **Effects**: Returns filtered user list
- **Stage 2 - Permissions**: Limited by role

### GetUserDetail
- **Purpose**: Get detailed user information
- **Payload**:
  - userId: string (required)
- **Effects**: Returns complete user profile
- **Stage 2 - Permissions**: Limited by role

### GetDormitoryDetail
- **Purpose**: Get detailed dormitory information
- **Payload**:
  - dormitoryId: string (required)
- **Effects**: Returns complete dormitory data
- **Stage 2 - Permissions**: Limited by role

## Important Implementation Notes

### Core Business Logic First
- Implement all interactions without conditions first
- Focus on basic CRUD operations and state transitions
- Test core functionality before adding permissions

### Stage 2 Considerations
- Permissions will be added via `condition` parameter
- Business rules will be validated via `condition` parameter
- Complex validations will be implemented after core logic works

### Common Patterns
- All create operations generate timestamps automatically
- Update operations only modify updatable fields
- Delete operations use soft delete pattern
- View operations respect role-based visibility