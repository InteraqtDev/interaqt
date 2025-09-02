# Interaction Design

## Core Business Logic Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory with specified bed count
- **Payload**:
  - name: string (required) - Unique name for the dormitory
  - location: string (required) - Physical location of dormitory
  - bedCount: number (required) - Number of beds (4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Creates individual Bed entities for each bed
  - Creates BedDormitory relations linking beds to dormitory
  - Initializes dormitory with zero occupancy
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: 
  - Bed count must be between 4-6 (SystemConfig constraints)
  - Dormitory name must be unique

### AssignUserToBed
- **Purpose**: Assign a student to a specific bed
- **Payload**:
  - userId: string (required) - ID of user to assign
  - bedId: string (required) - ID of bed to assign
- **Effects**:
  - Creates UserBedAssignment relation
  - Updates Bed.isOccupied to true
  - Updates Dormitory.currentOccupancy (computed property will recalculate)
- **Stage 2 - Permissions**: Admin or dormHead of target dormitory
- **Stage 2 - Business Rules**: 
  - User must not already be assigned to a bed
  - Bed must be available (not occupied)
  - User must be active

### RemoveUserFromDormitory
- **Purpose**: Remove a student from their current bed assignment
- **Payload**:
  - userId: string (required) - ID of user to remove
  - reason: string (required) - Reason for removal
- **Effects**:
  - Deletes UserBedAssignment relation
  - Updates Bed.isOccupied to false
  - Updates Dormitory.currentOccupancy (computed property will recalculate)
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: 
  - Removal must be due to approved eviction or user request

### RecordBehaviorViolation
- **Purpose**: Record a behavior violation against a student
- **Payload**:
  - userId: string (required) - ID of user who violated rules
  - violationType: string (required) - Type of violation from predefined rules
  - description: string (required) - Detailed description of the violation
  - evidenceUrl: string (optional) - URL to supporting evidence
- **Effects**:
  - Creates BehaviorViolation entity
  - Creates UserViolationRelation linking user to violation
  - Creates ViolationReporterRelation linking reporter to violation
  - Updates User.behaviorScore (computed property will recalculate)
- **Stage 2 - Permissions**: Dormitory leader (for users in their dormitory) or admin
- **Stage 2 - Business Rules**: 
  - Violation type must exist in ViolationRules dictionary
  - User must be in leader's assigned dormitory (for dormitory leaders)

### ModifyBehaviorScore
- **Purpose**: Directly modify a user's behavior score (admin correction)
- **Payload**:
  - userId: string (required) - ID of user whose score to modify
  - newScore: number (required) - New behavior score value
  - reason: string (required) - Reason for score modification
- **Effects**:
  - Updates User.behaviorScore directly (overrides computed value)
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: 
  - Modification reason must be provided and logged

### AssignDormitoryLeader
- **Purpose**: Assign a student as leader of their dormitory
- **Payload**:
  - userId: string (required) - ID of user to assign as leader
  - dormitoryId: string (required) - ID of dormitory to lead
- **Effects**:
  - Creates DormitoryLeadership relation
  - Updates User.role to 'dormitory_leader'
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: 
  - User must be resident of the target dormitory
  - Dormitory can have only one active leader at a time

### RemoveDormitoryLeader
- **Purpose**: Remove dormitory leader role from a user
- **Payload**:
  - userId: string (required) - ID of current leader to remove
  - reason: string (required) - Reason for removal
- **Effects**:
  - Deletes DormitoryLeadership relation
  - Updates User.role back to 'student'
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: 
  - Must assign new leader before removing current one (if needed)

### SubmitEvictionRequest
- **Purpose**: Submit a request to evict a student from dormitory
- **Payload**:
  - targetUserId: string (required) - ID of user to be evicted
  - reason: string (required) - Detailed justification for eviction
  - supportingEvidence: string (optional) - URLs or references to supporting evidence
- **Effects**:
  - Creates EvictionRequest entity
  - Creates EvictionTargetRelation linking user to request
  - Creates EvictionRequesterRelation linking requester to request
- **Stage 2 - Permissions**: Dormitory leader (for users in their dormitory) or admin
- **Stage 2 - Business Rules**: 
  - Target user's behavior score must be below eviction threshold
  - Target user must be in leader's assigned dormitory (for dormitory leaders)

### ProcessEvictionRequest
- **Purpose**: Administrator decision on eviction request
- **Payload**:
  - requestId: string (required) - ID of eviction request to process
  - decision: string (required) - "approved" or "rejected"
  - adminNotes: string (required) - Administrator's notes on the decision
- **Effects**:
  - Updates EvictionRequest.status to approved/rejected
  - Updates EvictionRequest.decisionDate and adminNotes
  - Creates EvictionDeciderRelation linking admin to request
  - If approved, triggers automatic removal process
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: 
  - Request must be in pending status

## Read Interactions

### ViewDormitoryFacilities
- **Purpose**: View all dormitory facilities and their occupancy
- **Payload**:
  - filters: object (optional) - Optional filters for dormitory search
    - status: string (optional)
    - location: string (optional)
- **Effects**:
  - Returns DormitoryOccupancyView data
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Only show active dormitories

### ViewUserBehaviorScores
- **Purpose**: View behavior scores for users in a dormitory
- **Payload**:
  - dormitoryId: string (required) - ID of dormitory to view users for
- **Effects**:
  - Returns UserBehaviorSummaryView filtered by dormitory
- **Stage 2 - Permissions**: Dormitory leader (for their dormitory) or admin
- **Stage 2 - Business Rules**: Leader can only view users in their assigned dormitory

### ViewManagementHierarchy
- **Purpose**: View current role assignments and management structure
- **Payload**: None
- **Effects**:
  - Returns management hierarchy with role assignments
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Show current active assignments only

### ViewEvictionRequests
- **Purpose**: View eviction requests and their status
- **Payload**:
  - status: string (optional) - Filter by request status
- **Effects**:
  - Returns PendingEvictionsView data
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Include complete request history and evidence

## Support/Validation Interactions

### ValidateDormitoryCreation
- **Purpose**: Validate parameters before creating dormitory
- **Payload**:
  - name: string (required) - Proposed dormitory name
- **Effects**:
  - Checks for duplicate names and system limits
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Verify system capacity limits

### CheckUserAssignmentEligibility
- **Purpose**: Check if user can be assigned to a bed
- **Payload**:
  - userId: string (required) - User to check
- **Effects**:
  - Validates user status and existing assignments
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: User must be active and unassigned

### VerifyBedAvailability
- **Purpose**: Verify that a bed is available for assignment
- **Payload**:
  - bedId: string (required) - Bed to verify
- **Effects**:
  - Checks bed occupancy and dormitory status
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: Bed must be unoccupied and in active dormitory

### GetCurrentBehaviorScore
- **Purpose**: Get current behavior score for a user
- **Payload**:
  - userId: string (required) - User to get score for
- **Effects**:
  - Returns current computed behavior score
- **Stage 2 - Permissions**: Dormitory leader (for users in their dormitory) or admin
- **Stage 2 - Business Rules**: Leader can only access scores for their dormitory users

### ValidateEvictionEligibility
- **Purpose**: Validate if user is eligible for eviction
- **Payload**:
  - userId: string (required) - User to validate
- **Effects**:
  - Checks behavior score against threshold and violation history
- **Stage 2 - Permissions**: Dormitory leader (for users in their dormitory) or admin
- **Stage 2 - Business Rules**: 
  - Score must be below eviction threshold
  - Must have recent violation history

## Implementation Notes

### Core Business Logic Priority
1. **Basic CRUD operations**: Create/assign/remove entities and relationships
2. **State transitions**: Status changes, role assignments
3. **Relationship management**: User-bed assignments, leadership relations

### Stage 2 Extensions (Not Yet Implemented)
1. **Permission checks**: Role-based access control for all interactions
2. **Business rule validations**: Complex constraints and threshold checks
3. **Data validations**: Cross-entity consistency checks and constraints

### Key Design Principles
- Each interaction represents a single user action
- Payload contains only required parameters for the action
- Effects describe data changes but don't include implementation logic
- Permissions and business rules documented for future Stage 2 implementation