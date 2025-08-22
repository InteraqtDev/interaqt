# Interaction Design

## Core Business Logic Interactions (Stage 1)

These interactions handle the core functionality without permissions or complex business rules.

### User Management

#### CreateUser
- **Purpose**: Create a new user account (admin action)
- **Payload**:
  - name: string (required)
  - email: string (required)
  - phone: string (optional)
  - role: string (required, enum: 'admin' | 'dormHead' | 'student')
- **Effects**:
  - Creates new User entity
  - Status set to 'active'
- **Stage 2 - Permissions**: Only admin can create users
- **Stage 2 - Business Rules**: Email must be unique

#### RegisterUser
- **Purpose**: Self-registration for students
- **Payload**:
  - name: string (required)
  - email: string (required)
  - phone: string (optional)
- **Effects**:
  - Creates new User entity with role='student'
  - Status set to 'active'
- **Stage 2 - Permissions**: Public access
- **Stage 2 - Business Rules**: Email must be unique

#### UpdateUserProfile
- **Purpose**: Update user profile information
- **Payload**:
  - userId: string (required)
  - name: string (optional)
  - phone: string (optional)
- **Effects**:
  - Updates User entity properties
- **Stage 2 - Permissions**: Admin or self
- **Stage 2 - Business Rules**: Cannot change email

### Dormitory Management

#### CreateDormitory
- **Purpose**: Create a new dormitory with beds
- **Payload**:
  - name: string (required)
  - capacity: number (required, must be 4-6)
  - floor: number (optional)
  - building: string (optional)
- **Effects**:
  - Creates new Dormitory entity
  - Creates Bed entities (number = capacity)
  - Creates DormitoryBedRelation for each bed
  - Initializes status as 'active'
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: Capacity must be between 4 and 6

#### UpdateDormitory
- **Purpose**: Update dormitory information
- **Payload**:
  - dormitoryId: string (required)
  - name: string (optional)
  - floor: number (optional)
  - building: string (optional)
- **Effects**:
  - Updates Dormitory entity properties
- **Stage 2 - Permissions**: Only admin can update
- **Stage 2 - Business Rules**: Cannot change capacity after creation

#### DeactivateDormitory
- **Purpose**: Mark dormitory as inactive
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Sets Dormitory status to 'inactive'
- **Stage 2 - Permissions**: Only admin can deactivate
- **Stage 2 - Business Rules**: Cannot deactivate if users are assigned

### Assignment Management

#### AssignDormHead
- **Purpose**: Appoint a user as dormitory head
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
- **Effects**:
  - Creates DormitoryDormHeadRelation
  - Updates User role to 'dormHead'
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: 
  - User must exist and be active
  - Dormitory can only have one dorm head
  - User cannot be dorm head of multiple dormitories

#### RemoveDormHead
- **Purpose**: Remove dorm head privileges
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Deletes DormitoryDormHeadRelation
  - Updates User role back to 'student'
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: User must currently be a dorm head

#### AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory and bed
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
  - bedId: string (optional, auto-select if not provided)
- **Effects**:
  - Creates UserDormitoryRelation
  - Creates UserBedRelation
  - Updates Bed status to 'occupied'
  - Updates Bed assignedAt timestamp
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**:
  - User must be a student
  - User cannot already be assigned to a dormitory
  - Dormitory must have available capacity
  - Bed must be available
  - Dormitory must be active

#### RemoveUserFromDormitory
- **Purpose**: Manually remove user from dormitory
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Deletes UserDormitoryRelation
  - Deletes UserBedRelation
  - Updates Bed status to 'available'
  - Clears Bed assignedAt
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: User must be assigned to a dormitory

### Point Deduction System

#### IssuePointDeduction
- **Purpose**: Issue disciplinary points to a user
- **Payload**:
  - userId: string (required)
  - reason: string (required)
  - points: number (required, 1-10)
  - category: string (required, enum: 'hygiene' | 'noise' | 'curfew' | 'damage' | 'other')
  - description: string (optional)
  - evidence: string (optional)
- **Effects**:
  - Creates PointDeduction entity
  - Creates UserPointDeductionRelation
  - Creates DeductionIssuerRelation
  - User's totalPoints recomputed
- **Stage 2 - Permissions**: Admin or dorm head of user's dormitory
- **Stage 2 - Business Rules**:
  - Points must be between 1 and 10
  - For dorm heads: can only issue to users in their dormitory
  - Cannot issue to users with status 'removed'

### Removal Request System

#### InitiateRemovalRequest
- **Purpose**: Request removal of problematic user
- **Payload**:
  - userId: string (required, target user)
  - reason: string (required)
- **Effects**:
  - Creates RemovalRequest entity
  - Creates RemovalRequestTargetRelation
  - Creates RemovalRequestInitiatorRelation
  - Captures current totalPoints from target user
- **Stage 2 - Permissions**: Only dorm head of user's dormitory
- **Stage 2 - Business Rules**:
  - Target user must have totalPoints >= 30
  - Cannot have existing pending request for same user
  - Initiator must be dorm head of target's dormitory

#### ProcessRemovalRequest
- **Purpose**: Approve or reject removal request
- **Payload**:
  - requestId: string (required)
  - decision: string (required, enum: 'approved' | 'rejected')
  - adminComment: string (optional)
- **Effects**:
  - Updates RemovalRequest status
  - Sets processedAt timestamp
  - Creates RemovalRequestAdminRelation
  - If approved:
    - Updates User status to 'removed'
    - Deletes UserDormitoryRelation
    - Deletes UserBedRelation
    - Updates Bed status to 'available'
- **Stage 2 - Permissions**: Only admin can process
- **Stage 2 - Business Rules**:
  - Request must be in 'pending' status
  - Cannot process already processed requests

#### CancelRemovalRequest
- **Purpose**: Cancel pending removal request
- **Payload**:
  - requestId: string (required)
- **Effects**:
  - Updates RemovalRequest status to 'cancelled'
- **Stage 2 - Permissions**: Only the initiating dorm head
- **Stage 2 - Business Rules**:
  - Request must be in 'pending' status
  - Only initiator can cancel

### View/Query Interactions

#### ViewSystemStats
- **Purpose**: View overall system statistics
- **Payload**: none
- **Effects**: Read-only query
- **Returns**:
  - Total users by role
  - Total dormitories
  - Total occupied beds
  - Total available beds
  - Active removal requests count
- **Stage 2 - Permissions**: Only admin

#### ViewDormitoryStats
- **Purpose**: View statistics for a specific dormitory
- **Payload**:
  - dormitoryId: string (required)
- **Effects**: Read-only query
- **Returns**:
  - Dormitory details
  - User list
  - Bed occupancy
  - Total deductions for residents
- **Stage 2 - Permissions**: Admin or dorm head of that dormitory

#### ViewUserDeductions
- **Purpose**: View deduction history for a user
- **Payload**:
  - userId: string (required)
- **Effects**: Read-only query
- **Returns**:
  - List of all deductions
  - Total points
  - Deduction by category breakdown
- **Stage 2 - Permissions**: Admin, relevant dorm head, or self

#### ViewMyDormitory
- **Purpose**: View assigned dormitory details
- **Payload**: none (uses current user context)
- **Effects**: Read-only query
- **Returns**:
  - Assigned dormitory details
  - Bed information
  - Roommates list
- **Stage 2 - Permissions**: Authenticated user

#### ViewMyDeductions
- **Purpose**: View personal deduction history
- **Payload**: none (uses current user context)
- **Effects**: Read-only query
- **Returns**:
  - Personal deduction list
  - Total points
  - Category breakdown
- **Stage 2 - Permissions**: Authenticated user

#### ViewMyBed
- **Purpose**: View assigned bed information
- **Payload**: none (uses current user context)
- **Effects**: Read-only query
- **Returns**:
  - Bed details
  - Assignment date
  - Dormitory information
- **Stage 2 - Permissions**: Authenticated user

## Implementation Priority

### Phase 1: Core Entity Management
1. CreateUser
2. RegisterUser
3. CreateDormitory
4. AssignUserToDormitory

### Phase 2: Role Management
1. AssignDormHead
2. RemoveDormHead
3. UpdateUserProfile
4. UpdateDormitory

### Phase 3: Disciplinary System
1. IssuePointDeduction
2. InitiateRemovalRequest
3. ProcessRemovalRequest
4. CancelRemovalRequest

### Phase 4: Maintenance Operations
1. RemoveUserFromDormitory
2. DeactivateDormitory

### Phase 5: Query Operations
1. ViewSystemStats
2. ViewDormitoryStats
3. ViewUserDeductions
4. ViewMyDormitory
5. ViewMyDeductions
6. ViewMyBed

## Notes

- All interactions initially implement core business logic only
- Permissions and business rules are documented but not implemented in Stage 1
- Query interactions are read-only and don't modify state
- User context is passed at runtime, not defined in interaction structure
- Entity references in payloads should use appropriate ID fields
