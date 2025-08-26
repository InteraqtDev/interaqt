# Dormitory Management System - Detailed Requirements Analysis

## Background
A comprehensive dormitory management system is needed to manage student housing, bed assignments, behavioral scoring, and removal processes.

## Business Requirements Analysis

### Core Business Processes
1. **Dormitory Setup**: Administrators create dormitories with specific bed capacities
2. **User Assignment**: Administrators assign users to specific beds in dormitories
3. **Behavioral Management**: Track user behavior through a point deduction system
4. **Removal Process**: Dormitory leaders can request removal of problematic users with admin approval

### Supplemented Requirements
1. **User Registration**: System needs user accounts with authentication
2. **Initial Points**: Each user starts with 100 behavior points
3. **Point Deduction Rules**:
   - Late return: -5 points
   - Noise violation: -10 points
   - Cleanliness violation: -8 points
   - Guest violation: -15 points
   - Damage to property: -20 points
4. **Removal Threshold**: Users with less than 30 points can be nominated for removal
5. **Audit Trail**: All point deductions and removal requests must be logged

## Data Perspective Analysis

### Entities

#### 1. User
**Properties:**
- id: string (immutable after creation)
- username: string (modifiable with restrictions - unique constraint)
- password: string (modifiable with restrictions - requires old password)
- email: string (modifiable with restrictions - requires verification)
- name: string (freely modifiable)
- points: number (modifiable with restrictions - only via point deduction interactions, default: 100)
- role: 'admin' | 'dormitoryLeader' | 'resident' (modifiable with restrictions - only by admin)
- createdAt: Date (immutable after creation)
- isDeleted: boolean (modifiable with restrictions - soft delete via delete interaction)

**Deletion Analysis:**
- Can be deleted: Yes (account deactivation)
- Deletion type: Soft delete (preserve historical data for audit)
- Implementation: Add isDeleted: boolean property
- Cascade: Soft delete related removal requests, keep point deductions for audit

#### 2. Dormitory
**Properties:**
- id: string (immutable after creation)
- name: string (modifiable with restrictions - only by admin)
- capacity: number (modifiable with restrictions - only by admin, range: 4-6)
- floor: number (modifiable with restrictions - only by admin)
- building: string (modifiable with restrictions - only by admin)
- createdAt: Date (immutable after creation)
- isDeleted: boolean (modifiable with restrictions - soft delete via delete interaction)

**Deletion Analysis:**
- Can be deleted: Yes (when dormitory is no longer in use)
- Deletion type: Soft delete (preserve historical records)
- Implementation: Add isDeleted: boolean property
- Cascade: Prevent deletion if beds are occupied, soft delete empty beds

#### 3. Bed
**Properties:**
- id: string (immutable after creation)
- bedNumber: string (immutable after creation - e.g., "A1", "B2")
- isOccupied: boolean (modifiable with restrictions - only via assignment interactions)
- createdAt: Date (immutable after creation)

**Deletion Analysis:**
- Can be deleted: No (beds are permanent fixtures of dormitories)
- Deletion type: N/A

#### 4. PointDeduction
**Properties:**
- id: string (immutable after creation)
- reason: string (immutable after creation)
- points: number (immutable after creation)
- description: string (immutable after creation)
- createdAt: Date (immutable after creation)
- createdBy: string (immutable after creation - admin or dormitory leader name)

**Deletion Analysis:**
- Can be deleted: No (audit trail requirement)
- Deletion type: N/A (permanent record for accountability)

#### 5. RemovalRequest
**Properties:**
- id: string (immutable after creation)
- reason: string (immutable after creation)
- status: 'pending' | 'approved' | 'rejected' (modifiable with restrictions - only by admin)
- createdAt: Date (immutable after creation)
- processedAt: Date | null (modifiable with restrictions - set when status changes)
- adminComment: string | null (modifiable with restrictions - only by admin)

**Deletion Analysis:**
- Can be deleted: No (audit trail requirement)
- Deletion type: N/A (permanent record for accountability)

### Relations

#### 1. UserDormitoryLeaderRelation
- source: User (sourceProperty: 'managedDormitory')
- target: Dormitory (targetProperty: 'dormitoryLeader')
- type: 1:1 (one user can lead one dormitory, one dormitory has one leader)

#### 2. DormitoryBedsRelation
- source: Dormitory (sourceProperty: 'beds')
- target: Bed (targetProperty: 'dormitory')
- type: 1:n (one dormitory has multiple beds)

#### 3. UserBedRelation
- source: User (sourceProperty: 'bed')
- target: Bed (targetProperty: 'occupant')
- type: 1:1 (one user occupies one bed, one bed has one occupant)

#### 4. UserPointDeductionsRelation
- source: User (sourceProperty: 'pointDeductions')
- target: PointDeduction (targetProperty: 'user')
- type: 1:n (one user can have multiple point deductions)

#### 5. UserRemovalRequestsRelation
- source: User (sourceProperty: 'removalRequests')
- target: RemovalRequest (targetProperty: 'targetUser')
- type: 1:n (one user can have multiple removal requests)

#### 6. DormitoryLeaderRemovalRequestsRelation
- source: User (sourceProperty: 'submittedRemovalRequests')
- target: RemovalRequest (targetProperty: 'requestedBy')
- type: 1:n (one dormitory leader can submit multiple removal requests)

## Interaction Perspective Analysis

### Admin Interactions
1. **CreateDormitory**: Create new dormitory with beds
   - Input: name, capacity, floor, building
   - Permissions: admin only
   - Creates dormitory and associated beds

2. **AssignDormitoryLeader**: Assign a user as dormitory leader
   - Input: userId, dormitoryId
   - Permissions: admin only
   - Updates user role and creates relation

3. **AssignUserToBed**: Assign user to specific bed
   - Input: userId, bedId
   - Permissions: admin only
   - Creates user-bed relation, marks bed as occupied

4. **ProcessRemovalRequest**: Approve or reject removal request
   - Input: requestId, decision, adminComment
   - Permissions: admin only
   - Updates request status, removes user if approved

5. **DeductPoints**: Admin can deduct points from any user
   - Input: userId, points, reason, description
   - Permissions: admin only
   - Creates point deduction record, updates user points

### Dormitory Leader Interactions
1. **SubmitRemovalRequest**: Request to remove a resident
   - Input: userId, reason
   - Permissions: dormitory leader only, target must be in their dormitory
   - Business rule: Target user must have < 30 points
   - Creates removal request

2. **DeductResidentPoints**: Deduct points from residents in their dormitory
   - Input: userId, points, reason, description
   - Permissions: dormitory leader only, target must be in their dormitory
   - Creates point deduction record, updates user points

### Resident Interactions
1. **ViewMyDormitory**: View assigned dormitory and roommates
   - Permissions: authenticated user
   - Returns dormitory info and bed assignments

2. **ViewMyPoints**: View current points and deduction history
   - Permissions: authenticated user
   - Returns points balance and deduction records

### System Interactions
1. **Login**: User authentication
   - Input: username, password
   - Returns: user token and profile

2. **UpdateProfile**: Update user profile information
   - Input: name, email
   - Permissions: authenticated user
   - Updates user profile

## Business Rules

### Point System Rules
1. Initial points: 100 for all new users
2. Minimum points: Cannot go below 0
3. Removal threshold: < 30 points
4. Point deductions are permanent and cannot be reversed

### Assignment Rules
1. One user per bed only
2. Users can only be assigned to one bed at a time
3. Dormitory leaders must be residents of the dormitory they manage
4. Bed capacity must be between 4-6 per dormitory

### Removal Process Rules
1. Only dormitory leaders can initiate removal requests
2. Target user must have < 30 points
3. Only admin can approve/reject requests
4. Approved removals result in:
   - User removed from bed
   - Bed marked as available
   - User role reset to 'resident' if was dormitory leader

## Permission Matrix

| Interaction | Admin | Dormitory Leader | Resident |
|------------|-------|------------------|----------|
| CreateDormitory | ✓ | ✗ | ✗ |
| AssignDormitoryLeader | ✓ | ✗ | ✗ |
| AssignUserToBed | ✓ | ✗ | ✗ |
| ProcessRemovalRequest | ✓ | ✗ | ✗ |
| DeductPoints (any user) | ✓ | ✗ | ✗ |
| SubmitRemovalRequest | ✗ | ✓ (own dormitory) | ✗ |
| DeductResidentPoints | ✗ | ✓ (own dormitory) | ✗ |
| ViewMyDormitory | ✓ | ✓ | ✓ |
| ViewMyPoints | ✓ | ✓ | ✓ |
| UpdateProfile | ✓ | ✓ | ✓ |