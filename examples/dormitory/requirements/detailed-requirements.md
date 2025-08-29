# Detailed Requirements Analysis - Dormitory Management System

## Original Business Requirements (Chinese)
1. 有一个全局的宿舍管理员，可以指定用户为宿舍长
2. 管理员可以创建宿舍，每个宿舍有4~6个床位
3. 管理员可以分配用户到宿舍，每个用户只能被分配到一个宿舍的一个床位上
4. 需要一些常见的用户行为扣分规则，扣分到一定程度后，宿舍长可以申请踢出某个用户
5. 管理员同意了踢出申请，用户就被踢出了

## Enhanced Business Requirements Analysis

### Core Business Domain
This is a dormitory management system that handles:
- User role management (Global Admin, Dormitory Leader, Regular User)
- Dormitory and bed allocation management
- Point deduction system for user behavior
- Removal request workflow with approval process

### Detailed Requirements Supplement

#### 1. User Management
- **Global Admin**: System-wide administrator with full privileges
- **Dormitory Leader**: User assigned by admin to manage a specific dormitory
- **Regular User**: Standard dormitory residents
- **User Authentication**: Users need login system with role-based access
- **User Profile**: Basic information (name, email, contact info, student ID)

#### 2. Dormitory Management
- **Dormitory Creation**: Admin creates dormitories with specific bed capacity (4-6 beds)
- **Dormitory Properties**: Name, location, capacity, current occupancy
- **Bed Management**: Individual beds within dormitories with status (occupied/vacant)
- **Single Assignment Rule**: Each user can only be assigned to one bed in one dormitory

#### 3. Point Deduction System
- **Deduction Rules**: Predefined rules for common violations (noise, cleanliness, curfew, etc.)
- **Point Tracking**: Each user starts with base points, deductions reduce the total
- **Threshold System**: Removal becomes possible when points drop below threshold
- **Deduction History**: Audit trail of all point deductions with reasons and timestamps

#### 4. Removal Request Workflow
- **Request Initiation**: Dormitory leader can request removal of problematic users
- **Approval Process**: Admin reviews and approves/rejects removal requests
- **Request Status**: Pending, Approved, Rejected
- **Execution**: Upon approval, user is removed from dormitory and bed is freed

## Data Model Analysis

### Entities and Properties

#### User Entity
- **Properties**:
  - id: string (system-generated)
  - name: string
  - email: string
  - studentId: string
  - phone: string
  - points: number (default: 100, decreases with violations)
  - role: enum('admin', 'dormitoryLeader', 'user')
  - createdAt: timestamp
  - updatedAt: timestamp
  - isDeleted: boolean (for soft deletion)

- **Property Modification Analysis**:
  - id: Immutable after creation (system-generated primary key)
  - name: Freely modifiable (users can update their names)
  - email: Modifiable with restrictions (email verification required)
  - studentId: Immutable after creation (permanent identifier)
  - phone: Freely modifiable (contact info updates)
  - points: Modifiable with restrictions (only via point deduction/reward interactions)
  - role: Modifiable with restrictions (only admin can change roles)
  - createdAt: Immutable after creation (audit requirement)
  - updatedAt: System-managed (automatically updated)
  - isDeleted: Modifiable with restrictions (only via delete interactions)

- **Deletion Analysis**:
  - Can be deleted: Yes (account deactivation, graduation)
  - Deletion type: Soft delete (preserve historical data for audit)
  - Implementation: Use isDeleted: boolean property
  - Cascade behavior: 
    - Soft delete user's point deductions (maintain audit trail)
    - Free up assigned bed (if any)
    - Transfer dormitory leadership to admin if user is a leader
    - Soft delete related removal requests

#### Dormitory Entity
- **Properties**:
  - id: string (system-generated)
  - name: string
  - location: string
  - capacity: number (4-6 beds)
  - currentOccupancy: number (computed from assigned beds)
  - createdAt: timestamp
  - updatedAt: timestamp
  - isDeleted: boolean

- **Property Modification Analysis**:
  - id: Immutable after creation (system-generated)
  - name: Freely modifiable (admin can rename dormitories)
  - location: Modifiable with restrictions (only admin, requires vacancy)
  - capacity: Modifiable with restrictions (only admin, cannot be less than current occupancy)
  - currentOccupancy: Computed property (automatically calculated from bed assignments)
  - createdAt: Immutable after creation (audit requirement)
  - updatedAt: System-managed (automatically updated)
  - isDeleted: Modifiable with restrictions (only via delete interactions)

- **Deletion Analysis**:
  - Can be deleted: Yes (dormitory closure, renovation)
  - Deletion type: Soft delete (preserve historical assignment data)
  - Implementation: Use isDeleted: boolean property
  - Cascade behavior:
    - Must be empty (no current residents) before deletion
    - Soft delete all associated beds
    - Maintain historical assignment records

#### Bed Entity
- **Properties**:
  - id: string (system-generated)
  - number: string (bed identifier within dormitory, e.g., "A1", "B2")
  - status: enum('vacant', 'occupied')
  - createdAt: timestamp
  - updatedAt: timestamp
  - isDeleted: boolean

- **Property Modification Analysis**:
  - id: Immutable after creation (system-generated)
  - number: Modifiable with restrictions (only admin, must be unique within dormitory)
  - status: Computed property (automatically determined by assignment existence)
  - createdAt: Immutable after creation (audit requirement)
  - updatedAt: System-managed (automatically updated)
  - isDeleted: Modifiable with restrictions (only via delete interactions)

- **Deletion Analysis**:
  - Can be deleted: Yes (bed removal, dormitory reconfiguration)
  - Deletion type: Soft delete (preserve assignment history)
  - Implementation: Use isDeleted: boolean property
  - Cascade behavior:
    - Must be vacant before deletion
    - Maintain historical assignment records

#### PointDeduction Entity
- **Properties**:
  - id: string (system-generated)
  - reason: string
  - points: number (positive value representing deduction amount)
  - deductedAt: timestamp
  - isDeleted: boolean

- **Property Modification Analysis**:
  - id: Immutable after creation (system-generated)
  - reason: Immutable after creation (audit trail integrity)
  - points: Immutable after creation (audit trail integrity)
  - deductedAt: Immutable after creation (audit requirement)
  - isDeleted: Modifiable with restrictions (only admin for error correction)

- **Deletion Analysis**:
  - Can be deleted: Only in exceptional cases (administrative error correction)
  - Deletion type: Soft delete (maintain complete audit trail)
  - Implementation: Use isDeleted: boolean property
  - Cascade behavior:
    - Recalculate user's total points when soft deleted
    - No cascade to other entities

#### RemovalRequest Entity
- **Properties**:
  - id: string (system-generated)
  - reason: string
  - status: enum('pending', 'approved', 'rejected')
  - requestedAt: timestamp
  - processedAt: timestamp (nullable, set when approved/rejected)
  - adminComment: string (nullable, admin's notes on decision)
  - isDeleted: boolean

- **Property Modification Analysis**:
  - id: Immutable after creation (system-generated)
  - reason: Immutable after creation (request integrity)
  - status: Modifiable with restrictions (only admin can approve/reject)
  - requestedAt: Immutable after creation (audit requirement)
  - processedAt: System-managed (set automatically when status changes)
  - adminComment: Modifiable with restrictions (only admin during processing)
  - isDeleted: Modifiable with restrictions (only via delete interactions)

- **Deletion Analysis**:
  - Can be deleted: Yes (withdrawn requests, administrative cleanup)
  - Deletion type: Soft delete (preserve request history for audit)
  - Implementation: Use isDeleted: boolean property
  - Cascade behavior: No cascade effects (independent record)

#### DeductionRule Entity
- **Properties**:
  - id: string (system-generated)
  - name: string
  - description: string
  - points: number (deduction amount)
  - isActive: boolean
  - createdAt: timestamp
  - updatedAt: timestamp
  - isDeleted: boolean

- **Property Modification Analysis**:
  - id: Immutable after creation (system-generated)
  - name: Freely modifiable (admin can update rule names)
  - description: Freely modifiable (admin can update descriptions)
  - points: Modifiable with restrictions (only admin, affects future deductions only)
  - isActive: Freely modifiable (admin can enable/disable rules)
  - createdAt: Immutable after creation (audit requirement)
  - updatedAt: System-managed (automatically updated)
  - isDeleted: Modifiable with restrictions (only via delete interactions)

- **Deletion Analysis**:
  - Can be deleted: Yes (rule retirement)
  - Deletion type: Soft delete (preserve historical deduction references)
  - Implementation: Use isDeleted: boolean property
  - Cascade behavior: No cascade (existing deductions remain valid)

### Entity Relationships

#### UserDormitoryLeaderRelation
- **Source**: User (dormitoryLeader role)
- **Target**: Dormitory
- **Source Property**: 'managedDormitory' (User.managedDormitory → Dormitory)
- **Target Property**: 'leader' (Dormitory.leader → User)
- **Cardinality**: One-to-One (each dormitory has one leader, each leader manages one dormitory)
- **Deletion**: When leader is deleted, transfer leadership to admin

#### UserBedAssignmentRelation  
- **Source**: User
- **Target**: Bed
- **Source Property**: 'assignedBed' (User.assignedBed → Bed)
- **Target Property**: 'occupant' (Bed.occupant → User)
- **Cardinality**: One-to-One (each user has at most one bed, each bed has at most one occupant)
- **Deletion**: When user is deleted, free the bed

#### DormitoryBedRelation
- **Source**: Dormitory
- **Target**: Bed
- **Source Property**: 'beds' (Dormitory.beds → Bed[])
- **Target Property**: 'dormitory' (Bed.dormitory → Dormitory)
- **Cardinality**: One-to-Many (each dormitory has multiple beds, each bed belongs to one dormitory)
- **Deletion**: When dormitory is deleted, delete all its beds

#### UserPointDeductionRelation
- **Source**: User
- **Target**: PointDeduction
- **Source Property**: 'pointDeductions' (User.pointDeductions → PointDeduction[])
- **Target Property**: 'user' (PointDeduction.user → User)
- **Cardinality**: One-to-Many (each user can have multiple deductions, each deduction belongs to one user)
- **Deletion**: When user is deleted, soft delete their deductions

#### RemovalRequestRelations
- **UserRemovalRequestRelation** (Target User):
  - Source: User (target of removal)
  - Target: RemovalRequest
  - Source Property: 'removalRequests' (User.removalRequests → RemovalRequest[])
  - Target Property: 'targetUser' (RemovalRequest.targetUser → User)

- **LeaderRemovalRequestRelation** (Requesting Leader):
  - Source: User (dormitory leader)
  - Target: RemovalRequest
  - Source Property: 'submittedRequests' (User.submittedRequests → RemovalRequest[])
  - Target Property: 'requestedBy' (RemovalRequest.requestedBy → User)

- **AdminRemovalRequestRelation** (Processing Admin):
  - Source: User (admin)
  - Target: RemovalRequest
  - Source Property: 'processedRequests' (User.processedRequests → RemovalRequest[])
  - Target Property: 'processedBy' (RemovalRequest.processedBy → User)

#### DeductionRuleRelation
- **Source**: PointDeduction
- **Target**: DeductionRule
- **Source Property**: 'rule' (PointDeduction.rule → DeductionRule)
- **Target Property**: 'applications' (DeductionRule.applications → PointDeduction[])
- **Cardinality**: Many-to-One (each deduction follows one rule, each rule can have multiple applications)

## User Operations and Interactions Analysis

### Admin Operations
1. **Manage Users**: Create, update, delete users, assign roles
2. **Manage Dormitories**: Create, update, delete dormitories
3. **Manage Beds**: Create, update, delete beds within dormitories
4. **Assign Users**: Assign users to beds, transfer between dormitories
5. **Manage Deduction Rules**: Create, update, activate/deactivate rules
6. **Process Removal Requests**: Approve or reject requests from dormitory leaders
7. **Apply Point Deductions**: Manually apply point deductions to users
8. **System Reports**: View occupancy, point statistics, request history

### Dormitory Leader Operations
1. **View Dormitory Info**: Access their managed dormitory details and residents
2. **Apply Point Deductions**: Deduct points from dormitory residents for violations
3. **Submit Removal Requests**: Request removal of problematic residents
4. **Monitor Point Status**: Track residents' point levels and violation history
5. **View Request History**: Check status of submitted removal requests

### Regular User Operations
1. **View Profile**: Access their own user profile and point status
2. **View Dormitory Info**: See their dormitory details and roommates
3. **View Point History**: Check their point deduction history and reasons
4. **Update Profile**: Modify their personal information (name, phone, etc.)

## Permission Requirements Analysis

### Role-Based Access Control
- **Admin**: Full system access, all operations permitted
- **Dormitory Leader**: Limited to their assigned dormitory and its residents
- **Regular User**: Read-only access to their own data and dormitory info

### Resource-Level Permissions
- Users can only modify their own profile data
- Dormitory leaders can only affect users in their managed dormitory
- Point deductions require appropriate role and relationship to target user
- Removal requests require dormitory leadership over the target user

## Business Process Workflows

### User Assignment Process
1. Admin creates user account
2. Admin assigns user to available bed in dormitory
3. System updates bed status to occupied
4. System updates dormitory occupancy count
5. If dormitory leader not assigned, admin can designate leader

### Point Deduction Process
1. Violation occurs and is reported/observed
2. Authorized user (admin or dormitory leader) applies deduction
3. System validates deduction rule and authority
4. System deducts points from user's total
5. System records deduction with timestamp and reason
6. If points drop below threshold, removal becomes possible

### Removal Request Process
1. Dormitory leader identifies problematic resident
2. Leader submits removal request with justification
3. System creates request record with pending status
4. Admin reviews request and supporting evidence
5. Admin approves or rejects request with comments
6. If approved, system removes user from bed assignment
7. System updates bed status to vacant
8. System updates dormitory occupancy count

## Business Rules Constraints

### Assignment Rules
- Each user can only be assigned to one bed at a time
- Beds can only accommodate one user at a time
- Users cannot be assigned to beds in dormitories at capacity
- Dormitory leaders must be assigned to the dormitory they manage

### Point Deduction Rules
- Point deductions must reference valid deduction rules
- Users cannot have negative points (minimum 0)
- Only active deduction rules can be applied
- Deduction authority limited to admin and relevant dormitory leader

### Removal Request Rules
- Only dormitory leaders can request removal of their residents
- Users cannot request their own removal
- Multiple pending requests for same user are not allowed
- Approved requests must be executed (user removed from bed)

### Data Integrity Rules
- Dormitory capacity cannot be reduced below current occupancy
- Dormitory leaders must be assigned to the dormitory they manage
- Soft-deleted entities remain in system for audit purposes
- System timestamps are immutable once set