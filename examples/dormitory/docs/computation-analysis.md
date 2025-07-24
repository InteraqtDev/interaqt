# Computation Analysis

## Entity: User

### Entity-Level Analysis
- **Purpose**: Represents users in the dormitory system (admin, dormHead, student)
- **Creation Source**: Created via interactions - primarily through user registration processes, not via specific interactions in current system
- **Update Requirements**: Score field needs updates when discipline records are added/cancelled; Role field needs updates when users are assigned as dormHead; Status field needs updates when users are expelled
- **Deletion Strategy**: Soft delete with status field (active/expelled)

### Property Analysis

#### Property: name
- **Type**: string
- **Purpose**: User's display name
- **Data Source**: User input during creation
- **Update Frequency**: Rarely updated, if at all
- **Computation Decision**: No computation needed
- **Reasoning**: Static data provided at creation time

#### Property: email
- **Type**: string
- **Purpose**: User's email address
- **Data Source**: User input during creation
- **Update Frequency**: Rarely updated, if at all
- **Computation Decision**: No computation needed
- **Reasoning**: Static data provided at creation time

#### Property: role
- **Type**: string
- **Purpose**: User's role in the system (admin, dormHead, student)
- **Data Source**: Initially 'student', updated when assigned as dormHead
- **Update Frequency**: Updates when AssignDormHead interaction occurs
- **Computation Decision**: StateMachine
- **Reasoning**: Role transitions (student → dormHead) need to be tracked and updated based on interactions

#### Property: score
- **Type**: number
- **Purpose**: User's discipline score (starts at 100, decreases with violations)
- **Data Source**: Calculated based on discipline records
- **Update Frequency**: Updates when discipline records are added/cancelled
- **Computation Decision**: Summation (with negative values)
- **Reasoning**: Need to sum/subtract points from all active discipline records related to user

#### Property: status
- **Type**: string
- **Purpose**: User's status in the system (active, expelled)
- **Data Source**: Initially 'active', updated when expel request is approved
- **Update Frequency**: Updates when ReviewExpelRequest interaction approves expulsion
- **Computation Decision**: StateMachine
- **Reasoning**: Status transitions (active → expelled) need to be tracked based on interactions

#### Property: createdAt
- **Type**: string
- **Purpose**: Timestamp when user was created
- **Data Source**: System timestamp at creation
- **Update Frequency**: Never
- **Computation Decision**: defaultValue only
- **Reasoning**: Static timestamp, no reactive updates needed

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity (if user creation interactions exist) or None (if users are created programmatically)
- **Reasoning**: Currently no specific user creation interactions defined, so no entity-level computation needed

---

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: Represents physical dormitories with beds
- **Creation Source**: Created via CreateDormitory interaction
- **Update Requirements**: No field updates needed based on current requirements
- **Deletion Strategy**: Hard delete (check business rules first)

### Property Analysis

#### Property: name
- **Type**: string
- **Purpose**: Dormitory name/identifier
- **Data Source**: User input via CreateDormitory interaction
- **Update Frequency**: Never
- **Computation Decision**: No computation needed
- **Reasoning**: Static data from interaction payload

#### Property: capacity
- **Type**: number
- **Purpose**: Maximum number of beds/students (4-6)
- **Data Source**: User input via CreateDormitory interaction
- **Update Frequency**: Never
- **Computation Decision**: No computation needed
- **Reasoning**: Static data from interaction payload

#### Property: currentOccupancy
- **Type**: number
- **Purpose**: Current number of students assigned to this dormitory
- **Data Source**: Count of UserDormitoryRelation records for this dormitory
- **Update Frequency**: Updates when students are assigned/removed
- **Computation Decision**: Count
- **Reasoning**: Need to count related UserDormitoryRelation records targeting this dormitory

#### Property: status
- **Type**: string
- **Purpose**: Dormitory status (active, inactive)
- **Data Source**: Initially 'active'
- **Update Frequency**: May be updated by admin interactions
- **Computation Decision**: No computation needed (for now)
- **Reasoning**: Simple status field, could add StateMachine later if needed

#### Property: createdAt
- **Type**: string
- **Purpose**: Timestamp when dormitory was created
- **Data Source**: System timestamp at creation
- **Update Frequency**: Never
- **Computation Decision**: defaultValue only
- **Reasoning**: Static timestamp, no reactive updates needed

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: Dormitory instances are created via CreateDormitory interaction, also need to create beds automatically

---

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: Represents individual beds within dormitories
- **Creation Source**: Created automatically when dormitory is created (based on capacity)
- **Update Requirements**: Status field needs updates when beds are assigned/released
- **Deletion Strategy**: Cascade delete when dormitory is deleted

### Property Analysis

#### Property: number
- **Type**: number
- **Purpose**: Bed number within dormitory (1-6)
- **Data Source**: Generated automatically when dormitory is created
- **Update Frequency**: Never
- **Computation Decision**: No computation needed
- **Reasoning**: Static data set during creation

#### Property: status
- **Type**: string
- **Purpose**: Bed availability status (available, occupied)
- **Data Source**: Initially 'available', updated when bed is assigned/released
- **Update Frequency**: Updates when AssignUserToBed interaction occurs or user is removed
- **Computation Decision**: StateMachine
- **Reasoning**: Status transitions (available ↔ occupied) need to be tracked based on UserBedRelation

#### Property: createdAt
- **Type**: string
- **Purpose**: Timestamp when bed was created
- **Data Source**: System timestamp at creation
- **Update Frequency**: Never
- **Computation Decision**: defaultValue only
- **Reasoning**: Static timestamp, no reactive updates needed

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity (from CreateDormitory)
- **Reasoning**: Beds are created automatically when dormitory is created, need to create multiple beds based on capacity

---

## Entity: DisciplineRecord

### Entity-Level Analysis
- **Purpose**: Represents discipline violations and point deductions
- **Creation Source**: Created via RecordDiscipline interaction
- **Update Requirements**: Status field may be updated when records are cancelled
- **Deletion Strategy**: Soft delete with status field (active/cancelled)

### Property Analysis

#### Property: reason
- **Type**: string
- **Purpose**: Reason for discipline violation
- **Data Source**: User input via RecordDiscipline interaction
- **Update Frequency**: Never
- **Computation Decision**: No computation needed
- **Reasoning**: Static data from interaction payload

#### Property: points
- **Type**: number
- **Purpose**: Points deducted for this violation
- **Data Source**: User input via RecordDiscipline interaction
- **Update Frequency**: Never
- **Computation Decision**: No computation needed
- **Reasoning**: Static data from interaction payload

#### Property: status
- **Type**: string
- **Purpose**: Record status (active, cancelled)
- **Data Source**: Initially 'active', may be changed to 'cancelled'
- **Update Frequency**: May be updated by cancellation interactions
- **Computation Decision**: StateMachine (if cancellation interactions exist)
- **Reasoning**: Status may transition from active to cancelled

#### Property: createdAt
- **Type**: string
- **Purpose**: Timestamp when record was created
- **Data Source**: System timestamp at creation
- **Update Frequency**: Never
- **Computation Decision**: defaultValue only
- **Reasoning**: Static timestamp, no reactive updates needed

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: DisciplineRecord instances are created via RecordDiscipline interaction

---

## Entity: ExpelRequest

### Entity-Level Analysis
- **Purpose**: Represents requests to expel students from dormitories
- **Creation Source**: Created via CreateExpelRequest interaction
- **Update Requirements**: Status field needs updates when reviewed; reviewedAt needs timestamp when reviewed
- **Deletion Strategy**: Soft delete or keep for audit trail

### Property Analysis

#### Property: reason
- **Type**: string
- **Purpose**: Reason for expulsion request
- **Data Source**: User input via CreateExpelRequest interaction
- **Update Frequency**: Never
- **Computation Decision**: No computation needed
- **Reasoning**: Static data from interaction payload

#### Property: status
- **Type**: string
- **Purpose**: Request status (pending, approved, rejected)
- **Data Source**: Initially 'pending', updated when reviewed
- **Update Frequency**: Updates when ReviewExpelRequest interaction occurs
- **Computation Decision**: StateMachine
- **Reasoning**: Status transitions (pending → approved/rejected) need to be tracked

#### Property: createdAt
- **Type**: string
- **Purpose**: Timestamp when request was created
- **Data Source**: System timestamp at creation
- **Update Frequency**: Never
- **Computation Decision**: defaultValue only
- **Reasoning**: Static timestamp, no reactive updates needed

#### Property: reviewedAt
- **Type**: string
- **Purpose**: Timestamp when request was reviewed
- **Data Source**: System timestamp when ReviewExpelRequest interaction occurs
- **Update Frequency**: Set once when reviewed
- **Computation Decision**: StateMachine (with computeValue)
- **Reasoning**: Timestamp should be set when status transitions from pending to approved/rejected

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: ExpelRequest instances are created via CreateExpelRequest interaction

---

## Relations Computation Analysis

### UserDormitoryRelation
- **Purpose**: Links users to their assigned dormitory
- **Creation Source**: Via AssignUserToBed interaction (since bed assignment implies dormitory assignment)
- **Computation Decision**: Transform from InteractionEventEntity
- **Reasoning**: Created when users are assigned to beds, which automatically assigns them to dormitory

### UserBedRelation
- **Purpose**: Links users to their assigned bed
- **Creation Source**: Via AssignUserToBed interaction
- **Computation Decision**: Transform from InteractionEventEntity
- **Reasoning**: Created directly from AssignUserToBed interaction

### DormitoryBedRelation
- **Purpose**: Links dormitories to their beds
- **Creation Source**: Created automatically when dormitory is created
- **Computation Decision**: Transform from InteractionEventEntity (CreateDormitory)
- **Reasoning**: Created when dormitory is created, establishing bed ownership

### DormitoryHeadRelation
- **Purpose**: Links dormitories to their appointed heads
- **Creation Source**: Via AssignDormHead interaction
- **Computation Decision**: Transform from InteractionEventEntity
- **Reasoning**: Created from AssignDormHead interaction

### UserDisciplineRelation
- **Purpose**: Links users to their discipline records
- **Creation Source**: Via RecordDiscipline interaction
- **Computation Decision**: Transform from InteractionEventEntity
- **Reasoning**: Created from RecordDiscipline interaction

### DisciplineRecorderRelation
- **Purpose**: Links discipline records to the person who recorded them
- **Creation Source**: Via RecordDiscipline interaction
- **Computation Decision**: Transform from InteractionEventEntity
- **Reasoning**: Links recorder (from event.user) to discipline record

### ExpelRequestApplicantRelation, ExpelRequestTargetRelation, ExpelRequestReviewerRelation
- **Purpose**: Links expel requests to applicant, target, and reviewer users
- **Creation Source**: Via CreateExpelRequest (applicant/target) and ReviewExpelRequest (reviewer) interactions
- **Computation Decision**: Transform from InteractionEventEntity
- **Reasoning**: Created from respective interactions

---

## Implementation Priority

### High Priority (Core Functionality)
1. Entity Transform computations for CRUD operations
2. User.score Summation (critical for business logic)
3. Dormitory.currentOccupancy Count
4. Status StateMachines for key entities

### Medium Priority (Enhanced Functionality)
5. Bed.status StateMachine
6. ExpelRequest.reviewedAt StateMachine
7. User.role StateMachine

### Low Priority (Nice to Have)
8. Additional status tracking
9. Audit trail enhancements