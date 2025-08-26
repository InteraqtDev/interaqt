# Dormitory Management System - Detailed Requirements Analysis

## System Overview
A comprehensive dormitory management system that facilitates administrative control over dormitory assignments, resident management, and behavioral monitoring through a point-based discipline system.

## Business Domain Analysis

### Core Business Concepts
1. **Dormitory Management**: Centralized control of dormitory creation, bed allocation, and resident assignments
2. **User Role System**: Hierarchical structure with Admin and Dormitory Head roles
3. **Point-Based Discipline System**: Behavior monitoring through point deductions and removal procedures
4. **Bed Assignment Management**: Allocation and tracking of dormitory beds (4-6 per dormitory)

## Entity Analysis

### 1. User Entity
**Purpose**: Represents all system users including administrators, dormitory heads, and regular residents

**Properties**:
- id: string (Immutable after creation - system generated unique identifier)
- name: string (Freely modifiable - user's display name)
- email: string (Modifiable with restrictions - requires verification for changes)
- isAdmin: boolean (Modifiable with restrictions - only by system admin)
- points: number (Modifiable with restrictions - only via point deduction interactions, default: 100)
- createdAt: Date (Immutable after creation - timestamp of account creation)
- updatedAt: Date (System managed - automatically updated on any change)

**Deletion Analysis**:
- Can be deleted: Yes (account termination)
- Deletion type: Soft delete (preserve historical data for audit trail)
- Cascade behavior: 
  - Soft delete all point deductions associated with user
  - Remove from dormitory bed assignment
  - Remove dormitory head status if applicable
  - Preserve removal requests for historical reference

### 2. Dormitory Entity
**Purpose**: Represents individual dormitory units with configurable bed capacity

**Properties**:
- id: string (Immutable after creation - system generated)
- name: string (Freely modifiable - dormitory identifier/name)
- bedCount: number (Modifiable with restrictions - between 4-6, only when dormitory is empty)
- createdAt: Date (Immutable after creation)
- updatedAt: Date (System managed)

**Deletion Analysis**:
- Can be deleted: Yes (only when empty)
- Deletion type: Soft delete (maintain historical records)
- Cascade behavior:
  - Can only delete if no current bed assignments exist
  - Preserve historical assignment records

### 3. BedAssignment Entity
**Purpose**: Tracks the assignment of users to specific dormitory beds

**Properties**:
- id: string (Immutable after creation)
- bedNumber: number (Immutable after creation - assigned bed position 1-6)
- assignedAt: Date (Immutable after creation - assignment timestamp)
- removedAt: Date | null (Set once when user is removed from bed)

**Deletion Analysis**:
- Can be deleted: No (permanent audit record)
- Deletion type: N/A (use removedAt for logical removal)

### 4. PointDeduction Entity
**Purpose**: Records behavioral infractions and associated point penalties

**Properties**:
- id: string (Immutable after creation)
- reason: string (Immutable after creation - description of infraction)
- points: number (Immutable after creation - points deducted)
- createdAt: Date (Immutable after creation)

**Deletion Analysis**:
- Can be deleted: No (audit trail requirement)
- Deletion type: N/A (permanent record for accountability)

### 5. RemovalRequest Entity
**Purpose**: Tracks dormitory head requests to remove residents

**Properties**:
- id: string (Immutable after creation)
- reason: string (Immutable after creation - justification for removal)
- status: 'pending' | 'approved' | 'rejected' (Modifiable with restrictions - only via admin interaction)
- createdAt: Date (Immutable after creation)
- processedAt: Date | null (Set once when admin processes request)

**Deletion Analysis**:
- Can be deleted: No (audit trail requirement)
- Deletion type: N/A (permanent record)

### 6. AdminComment Entity
**Purpose**: Admin's feedback when processing removal requests

**Properties**:
- id: string (Immutable after creation)
- comment: string (Immutable after creation - admin's decision rationale)
- decision: 'approved' | 'rejected' (Immutable after creation)
- createdAt: Date (Immutable after creation)

**Deletion Analysis**:
- Can be deleted: No (audit trail requirement)
- Deletion type: N/A (permanent record)

## Relation Analysis

### 1. DormitoryHeadRelation
- **Source**: Dormitory (1)
- **Target**: User (0..1)
- **Source Property**: 'dormHead' (Dormitory accesses its head via this property)
- **Target Property**: 'headOfDormitory' (User accesses dormitory they head via this property)
- **Deletion**: Can be removed when changing dormitory head

### 2. UserBedAssignmentRelation
- **Source**: User (1)
- **Target**: BedAssignment (0..1 active)
- **Source Property**: 'bedAssignment' (User accesses their current bed)
- **Target Property**: 'user' (BedAssignment accesses assigned user)
- **Note**: Only one active assignment per user (where removedAt is null)

### 3. DormitoryBedAssignmentRelation
- **Source**: Dormitory (1)
- **Target**: BedAssignment (0..*)
- **Source Property**: 'bedAssignments' (Dormitory accesses all its bed assignments)
- **Target Property**: 'dormitory' (BedAssignment accesses its dormitory)

### 4. UserPointDeductionRelation
- **Source**: User (1)
- **Target**: PointDeduction (0..*)
- **Source Property**: 'pointDeductions' (User accesses their deduction history)
- **Target Property**: 'user' (PointDeduction accesses the affected user)

### 5. CreatorPointDeductionRelation
- **Source**: User (1) - The admin or dormitory head who created the deduction
- **Target**: PointDeduction (0..*)
- **Source Property**: 'createdDeductions' (User accesses deductions they created)
- **Target Property**: 'createdBy' (PointDeduction accesses who created it)

### 6. RemovalRequestUserRelation
- **Source**: User (1) - The resident being requested for removal
- **Target**: RemovalRequest (0..*)
- **Source Property**: 'removalRequests' (User accesses removal requests about them)
- **Target Property**: 'targetUser' (RemovalRequest accesses target user)

### 7. RemovalRequestCreatorRelation
- **Source**: User (1) - The dormitory head creating the request
- **Target**: RemovalRequest (0..*)
- **Source Property**: 'createdRemovalRequests' (User accesses requests they created)
- **Target Property**: 'requestedBy' (RemovalRequest accesses creator)

### 8. RemovalRequestDormitoryRelation
- **Source**: Dormitory (1)
- **Target**: RemovalRequest (0..*)
- **Source Property**: 'removalRequests' (Dormitory accesses all removal requests)
- **Target Property**: 'dormitory' (RemovalRequest accesses related dormitory)

### 9. RemovalRequestAdminCommentRelation
- **Source**: RemovalRequest (1)
- **Target**: AdminComment (0..1)
- **Source Property**: 'adminComment' (RemovalRequest accesses admin's comment)
- **Target Property**: 'removalRequest' (AdminComment accesses the request)

### 10. AdminCommentAuthorRelation
- **Source**: User (1) - The admin who wrote the comment
- **Target**: AdminComment (0..*)
- **Source Property**: 'adminComments' (User accesses comments they wrote)
- **Target Property**: 'author' (AdminComment accesses who wrote it)

## Interaction Analysis

### Admin Interactions

1. **CreateDormitory**
   - Permission: Admin only
   - Input: name, bedCount (4-6)
   - Creates: Dormitory entity
   - Validation: bedCount must be between 4 and 6

2. **AssignDormitoryHead**
   - Permission: Admin only
   - Input: dormitoryId, userId
   - Creates/Updates: DormitoryHeadRelation
   - Validation: User must exist, dormitory must exist
   - Business Rule: User cannot be head of multiple dormitories

3. **AssignUserToBed**
   - Permission: Admin only
   - Input: userId, dormitoryId, bedNumber
   - Creates: BedAssignment entity and relations
   - Validation: 
     - User not already assigned to a bed
     - Bed number valid for dormitory capacity
     - Bed not already occupied

4. **ProcessRemovalRequest**
   - Permission: Admin only
   - Input: removalRequestId, decision (approve/reject), comment
   - Updates: RemovalRequest status
   - Creates: AdminComment
   - Side Effect: If approved, sets BedAssignment.removedAt

### Dormitory Head Interactions

5. **DeductPoints**
   - Permission: Dormitory head for residents in their dormitory
   - Input: userId, reason, points
   - Creates: PointDeduction entity
   - Updates: User.points (decrements)
   - Validation: User must be in head's dormitory

6. **RequestUserRemoval**
   - Permission: Dormitory head for residents in their dormitory
   - Input: userId, reason
   - Creates: RemovalRequest entity
   - Validation: 
     - User must be in head's dormitory
     - User points must be below threshold (e.g., <= 20)
     - No pending removal request for same user

### User Interactions

7. **ViewMyStatus**
   - Permission: Authenticated users
   - Returns: User profile, bed assignment, points, deduction history

8. **ViewDormitoryInfo**
   - Permission: Authenticated users assigned to a dormitory
   - Returns: Dormitory details, residents list, dormitory head info

## Business Rules

1. **Bed Capacity Rule**: Each dormitory must have 4-6 beds
2. **Single Assignment Rule**: A user can only be assigned to one bed at a time
3. **Dormitory Head Uniqueness**: A user can only be head of one dormitory
4. **Point Threshold for Removal**: Removal requests can only be made when user points <= 20
5. **Removal Request Processing**: Only admins can approve/reject removal requests
6. **Point Deduction Authority**: Only admins and relevant dormitory heads can deduct points
7. **Initial Points**: New users start with 100 points
8. **Minimum Points**: User points cannot go below 0

## Computed Properties

1. **Dormitory.occupancy**: Count of active bed assignments
2. **Dormitory.availableBeds**: bedCount - occupancy
3. **User.totalDeductions**: Sum of all point deductions
4. **User.isRemovable**: points <= 20
5. **RemovalRequest.isPending**: status === 'pending'

## State Machines

### RemovalRequest State Machine
- States: pending → approved/rejected
- Transitions: Only via ProcessRemovalRequest interaction
- Terminal States: approved, rejected

### BedAssignment Lifecycle
- Active: removedAt === null
- Removed: removedAt !== null
- Transition: Via approved removal request or admin action

## Security Considerations

1. **Role-Based Access Control**: Strict enforcement of admin vs dormitory head permissions
2. **Scope Limitation**: Dormitory heads can only affect users in their dormitory
3. **Audit Trail**: All point deductions and removal requests are permanent records
4. **Data Integrity**: Immutable properties ensure historical accuracy