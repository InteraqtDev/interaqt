# Interaction Design

## Phase 1: Core Business Logic Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory with specified capacity
- **Payload**:
  - name: string (required)
  - capacity: number (required, 4-6)
  - floor: number (optional)
  - building: string (optional)
- **Effects**:
  - Creates new Dormitory entity
  - Creates Bed entities (count = capacity)
  - Creates DormitoryBedRelation for each bed
  - Initializes dormitory with status 'active'
- **Stage 2 - Permissions**: Only admin can create (user.role === 'admin')
- **Stage 2 - Business Rules**: Capacity must be between 4 and 6

### UpdateDormitory
- **Purpose**: Modify dormitory details
- **Payload**:
  - dormitoryId: string (required)
  - name: string (optional)
  - floor: number (optional) 
  - building: string (optional)
  - status: string (optional, 'active' | 'inactive')
- **Effects**:
  - Updates specified Dormitory properties
  - If status changes to 'inactive', prevents new assignments
- **Stage 2 - Permissions**: Only admin can update (user.role === 'admin')
- **Stage 2 - Business Rules**: Cannot deactivate dormitory with active residents

### DeactivateDormitory
- **Purpose**: Mark dormitory as inactive
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Sets dormitory status to 'inactive'
  - Prevents new user assignments
- **Stage 2 - Permissions**: Only admin can deactivate (user.role === 'admin')
- **Stage 2 - Business Rules**: None beyond permission check

### AssignDormHead
- **Purpose**: Appoint a user as dorm head for a dormitory
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
- **Effects**:
  - Changes user role to 'dormHead'
  - Creates DormitoryDormHeadRelation
  - Updates dormitory's hasDormHead property
- **Stage 2 - Permissions**: Only admin can assign (user.role === 'admin')
- **Stage 2 - Business Rules**: 
  - User must have status 'active'
  - Dormitory cannot already have a dorm head

### RemoveDormHead
- **Purpose**: Remove dorm head privileges from a user
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Changes user role back to 'student'
  - Deletes DormitoryDormHeadRelation
  - Updates dormitory's hasDormHead property
- **Stage 2 - Permissions**: Only admin can remove (user.role === 'admin')
- **Stage 2 - Business Rules**: User must currently be a dorm head

### AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory and specific bed
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
  - bedNumber: string (required)
- **Effects**:
  - Creates UserDormitoryRelation
  - Creates UserBedRelation
  - Updates bed status to 'occupied'
  - Updates bed assignedAt timestamp
  - Increments dormitory occupancy
  - Decrements availableBeds
- **Stage 2 - Permissions**: Only admin can assign (user.role === 'admin')
- **Stage 2 - Business Rules**:
  - User must not have existing dormitory assignment
  - Dormitory must have available capacity
  - Specified bed must exist and be available
  - Dormitory must be active

### RemoveUserFromDormitory
- **Purpose**: Manually remove user from dormitory
- **Payload**:
  - userId: string (required)
  - reason: string (optional)
- **Effects**:
  - Deletes UserDormitoryRelation
  - Deletes UserBedRelation
  - Updates bed status to 'available'
  - Clears bed assignedAt timestamp
  - Decrements dormitory occupancy
  - Increments availableBeds
- **Stage 2 - Permissions**: Only admin can remove (user.role === 'admin')
- **Stage 2 - Business Rules**: User must be currently assigned to a dormitory

### IssuePointDeduction
- **Purpose**: Issue disciplinary points to a user
- **Payload**:
  - targetUserId: string (required)
  - reason: string (required)
  - points: number (required, 1-10)
  - category: string (required, enum: 'hygiene' | 'noise' | 'curfew' | 'damage' | 'other')
  - description: string (optional)
  - evidence: string (optional)
- **Effects**:
  - Creates PointDeduction entity with status 'active'
  - Creates UserPointDeductionRelation
  - Creates DeductionIssuerRelation
  - Updates user's totalPoints (recomputed)
  - Updates user's isRemovable if totalPoints >= 30
- **Stage 2 - Permissions**: Admin or dorm head of target's dormitory
  - user.role === 'admin' OR 
  - (user.role === 'dormHead' AND targetUser.dormitory === user.managedDormitory)
- **Stage 2 - Business Rules**:
  - Points must be between 1 and 10
  - Target user must be in a dormitory
  - Category must be valid enum value

### InitiateRemovalRequest
- **Purpose**: Request removal of a problematic user from dormitory
- **Payload**:
  - targetUserId: string (required)
  - reason: string (required)
- **Effects**:
  - Creates RemovalRequest entity with status 'pending'
  - Creates RemovalRequestTargetRelation
  - Creates RemovalRequestInitiatorRelation
  - Captures user's current totalPoints in request
- **Stage 2 - Permissions**: Only dorm head of target's dormitory
  - user.role === 'dormHead' AND targetUser.dormitory === user.managedDormitory
- **Stage 2 - Business Rules**:
  - Target user must have totalPoints >= 30
  - No existing pending removal request for same user
  - Target must be in requester's dormitory

### CancelRemovalRequest
- **Purpose**: Cancel a pending removal request
- **Payload**:
  - requestId: string (required)
- **Effects**:
  - Updates RemovalRequest status to 'cancelled'
  - Updates request's updatedAt timestamp
- **Stage 2 - Permissions**: Only original requester can cancel
  - request.requestedBy === user.id AND request.status === 'pending'
- **Stage 2 - Business Rules**: Request must be in 'pending' status

### ProcessRemovalRequest
- **Purpose**: Approve or reject a removal request
- **Payload**:
  - requestId: string (required)
  - decision: string (required, 'approved' | 'rejected')
  - adminComment: string (optional)
- **Effects (if approved)**:
  - Updates RemovalRequest status to 'approved'
  - Sets processedAt timestamp
  - Creates RemovalRequestAdminRelation
  - Updates target user status to 'removed'
  - Deletes UserDormitoryRelation
  - Deletes UserBedRelation
  - Updates bed status to 'available'
  - Decrements dormitory occupancy
- **Effects (if rejected)**:
  - Updates RemovalRequest status to 'rejected'
  - Sets processedAt timestamp
  - Creates RemovalRequestAdminRelation
  - No changes to user assignments
- **Stage 2 - Permissions**: Only admin can process (user.role === 'admin')
- **Stage 2 - Business Rules**:
  - Request must be in 'pending' status
  - Decision must be valid enum value

### ViewSystemStats
- **Purpose**: View overall system statistics
- **Payload**: None
- **Effects**: Read-only operation
- **Stage 2 - Permissions**: Only admin can view (user.role === 'admin')
- **Stage 2 - Business Rules**: None

### ViewDormitoryStats
- **Purpose**: View statistics for a specific dormitory
- **Payload**:
  - dormitoryId: string (required)
- **Effects**: Read-only operation
- **Stage 2 - Permissions**: Admin or dorm head of that dormitory
  - user.role === 'admin' OR
  - (user.role === 'dormHead' AND user.managedDormitory === dormitoryId)
- **Stage 2 - Business Rules**: None

### ViewUserDeductions
- **Purpose**: View deduction history for a user
- **Payload**:
  - targetUserId: string (required)
- **Effects**: Read-only operation
- **Stage 2 - Permissions**: Admin, relevant dorm head, or self
  - user.role === 'admin' OR
  - (user.role === 'dormHead' AND targetUser.dormitory === user.managedDormitory) OR
  - (targetUserId === user.id)
- **Stage 2 - Business Rules**: None

### ViewMyDormitory
- **Purpose**: View user's assigned dormitory details
- **Payload**: None (uses authenticated user)
- **Effects**: Read-only operation
- **Stage 2 - Permissions**: Must be authenticated
- **Stage 2 - Business Rules**: None

### ViewMyDeductions
- **Purpose**: View user's own deduction history
- **Payload**: None (uses authenticated user)
- **Effects**: Read-only operation
- **Stage 2 - Permissions**: Must be authenticated
- **Stage 2 - Business Rules**: None

### ViewMyBed
- **Purpose**: View user's assigned bed information
- **Payload**: None (uses authenticated user)
- **Effects**: Read-only operation
- **Stage 2 - Permissions**: Must be authenticated
- **Stage 2 - Business Rules**: None

### CreateUser
- **Purpose**: Create a new user in the system (for testing/initialization)
- **Payload**:
  - name: string (required)
  - email: string (required, unique)
  - phone: string (optional)
  - role: string (optional, default: 'student')
- **Effects**:
  - Creates User entity with status 'active'
  - Sets timestamps
- **Stage 2 - Permissions**: Only admin in production (none for testing)
- **Stage 2 - Business Rules**: Email must be unique

### UpdateUserProfile
- **Purpose**: Update user profile information
- **Payload**:
  - userId: string (required)
  - name: string (optional)
  - phone: string (optional)
- **Effects**:
  - Updates specified User properties
  - Updates updatedAt timestamp
- **Stage 2 - Permissions**: Admin or self
  - user.role === 'admin' OR userId === user.id
- **Stage 2 - Business Rules**: Cannot update email, role, or status

### SetBedMaintenance
- **Purpose**: Set a bed to maintenance status
- **Payload**:
  - bedId: string (required)
  - status: string (required, 'maintenance' | 'available')
- **Effects**:
  - Updates bed status
  - If changing to 'maintenance', bed must not be occupied
- **Stage 2 - Permissions**: Only admin (user.role === 'admin')
- **Stage 2 - Business Rules**: Cannot set occupied bed to maintenance

### AppealDeduction
- **Purpose**: Appeal a point deduction (future feature placeholder)
- **Payload**:
  - deductionId: string (required)
  - appealReason: string (required)
- **Effects**:
  - Updates PointDeduction status to 'appealed'
- **Stage 2 - Permissions**: Only the affected user
- **Stage 2 - Business Rules**: Deduction must be active and within 7 days

### CancelDeduction
- **Purpose**: Cancel an incorrect deduction
- **Payload**:
  - deductionId: string (required)
  - reason: string (required)
- **Effects**:
  - Updates PointDeduction status to 'cancelled'
  - Recomputes user's totalPoints
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Deduction must be active

## Implementation Notes

### Phase 1 Implementation (Core Logic)
- Implement all interactions WITHOUT conditions
- Focus on payload validation and entity/relation management
- Ensure all computed properties update correctly
- Test basic CRUD operations

### Phase 2 Implementation (Permissions & Rules)
- Add permission checks using Condition.create()
- Implement business rule validations
- Combine multiple conditions using BoolExp when needed
- Test both success and failure scenarios

### System-Triggered Actions
These are handled by computations, not interactions:
- **UpdateBedStatus**: Automatically via relations
- **UpdateDormitoryOccupancy**: Count computation
- **CalculateTotalPoints**: Summation computation

### Query Interactions
All View* interactions are read-only and should:
- Use appropriate filters based on user permissions
- Return relevant subset of data
- Not modify any system state

### Error Handling Considerations
- All interactions should validate payload completeness
- Permission failures return 'condition check failed'
- Business rule violations return 'condition check failed'
- Invalid references should be caught early

### Testing Priority
1. Core CRUD operations (Create, Assign, Remove)
2. State transitions (Point deductions, Removal requests)
3. Permission checks (Role-based access)
4. Business rule validations (Capacity, thresholds)
5. Edge cases and error scenarios
