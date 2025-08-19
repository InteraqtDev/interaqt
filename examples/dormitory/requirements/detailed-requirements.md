# Dormitory Management System - Detailed Requirements Analysis

## 1. System Overview

A comprehensive dormitory management system for educational institutions or corporate housing, focusing on room assignment, behavioral management, and disciplinary processes.

## 2. Core Entities and Properties

### 2.1 User Entity
**Properties:**
- `id`: string (auto-generated)
- `name`: string (required, user's full name)
- `email`: string (required, unique, for authentication)
- `phone`: string (optional, contact number)
- `role`: string (enum: 'admin' | 'dormHead' | 'student', default: 'student')
- `status`: string (enum: 'active' | 'suspended' | 'removed', default: 'active')
- `createdAt`: timestamp (auto-generated)
- `updatedAt`: timestamp (auto-updated)

### 2.2 Dormitory Entity
**Properties:**
- `id`: string (auto-generated)
- `name`: string (required, e.g., "Building A - Room 301")
- `capacity`: number (required, must be 4-6)
- `floor`: number (optional, floor number)
- `building`: string (optional, building name/code)
- `status`: string (enum: 'active' | 'inactive', default: 'active')
- `occupancy`: number (computed, current number of assigned users)
- `availableBeds`: number (computed, capacity - occupancy)
- `createdAt`: timestamp (auto-generated)
- `updatedAt`: timestamp (auto-updated)

### 2.3 Bed Entity
**Properties:**
- `id`: string (auto-generated)
- `bedNumber`: string (required, e.g., "A", "B", "1", "2")
- `status`: string (enum: 'available' | 'occupied' | 'maintenance', default: 'available')
- `assignedAt`: timestamp (nullable, when current user was assigned)
- `createdAt`: timestamp (auto-generated)
- `updatedAt`: timestamp (auto-updated)

### 2.4 PointDeduction Entity
**Properties:**
- `id`: string (auto-generated)
- `reason`: string (required, description of violation)
- `points`: number (required, positive integer, deduction amount)
- `category`: string (enum: 'hygiene' | 'noise' | 'curfew' | 'damage' | 'other')
- `status`: string (enum: 'active' | 'appealed' | 'cancelled', default: 'active')
- `description`: string (optional, detailed explanation)
- `evidence`: string (optional, URL or reference to evidence)
- `deductedAt`: timestamp (auto-generated, when deduction was made)
- `createdAt`: timestamp (auto-generated)

### 2.5 RemovalRequest Entity
**Properties:**
- `id`: string (auto-generated)
- `reason`: string (required, explanation for removal request)
- `totalPoints`: number (computed, total points deducted for target user)
- `status`: string (enum: 'pending' | 'approved' | 'rejected' | 'cancelled', default: 'pending')
- `adminComment`: string (optional, admin's decision comment)
- `processedAt`: timestamp (nullable, when admin made decision)
- `createdAt`: timestamp (auto-generated)
- `updatedAt`: timestamp (auto-updated)

## 3. Entity Relationships

### 3.1 User-Dormitory Relations
- **UserDormitoryRelation** (n:1)
  - Source: User (property: 'dormitory')
  - Target: Dormitory (property: 'users')
  - A user can belong to at most one dormitory

### 3.2 User-Bed Relations
- **UserBedRelation** (1:1)
  - Source: User (property: 'bed')
  - Target: Bed (property: 'occupant')
  - One user occupies exactly one bed when assigned

### 3.3 Dormitory-Bed Relations
- **DormitoryBedRelation** (1:n)
  - Source: Dormitory (property: 'beds')
  - Target: Bed (property: 'dormitory')
  - A dormitory contains multiple beds (4-6)

### 3.4 DormHead Relations
- **DormitoryDormHeadRelation** (n:1)
  - Source: Dormitory (property: 'dormHead')
  - Target: User (property: 'managedDormitory')
  - Each dormitory can have one dorm head

### 3.5 Point Deduction Relations
- **UserPointDeductionRelation** (1:n)
  - Source: User (property: 'pointDeductions')
  - Target: PointDeduction (property: 'user')
  - A user can have multiple point deductions

- **DeductionIssuerRelation** (n:1)
  - Source: PointDeduction (property: 'issuedBy')
  - Target: User (property: 'issuedDeductions')
  - Each deduction is issued by one user (admin or dorm head)

### 3.6 Removal Request Relations
- **RemovalRequestTargetRelation** (n:1)
  - Source: RemovalRequest (property: 'targetUser')
  - Target: User (property: 'removalRequests')
  - Each request targets one user

- **RemovalRequestInitiatorRelation** (n:1)
  - Source: RemovalRequest (property: 'requestedBy')
  - Target: User (property: 'initiatedRemovalRequests')
  - Each request is initiated by one dorm head

- **RemovalRequestAdminRelation** (n:1)
  - Source: RemovalRequest (property: 'processedBy')
  - Target: User (property: 'processedRemovalRequests')
  - Each request is processed by one admin (when approved/rejected)

## 4. Business Rules

### 4.1 Dormitory Management Rules
- **BR001**: Dormitory capacity must be between 4 and 6 beds
- **BR002**: Cannot assign users to a dormitory that is at full capacity
- **BR003**: A user can only be assigned to one dormitory at a time
- **BR004**: A user can only occupy one bed at a time
- **BR005**: Only active dormitories can receive new assignments

### 4.2 Role and Permission Rules
- **BR006**: Only admins can create/modify dormitories
- **BR007**: Only admins can appoint/remove dorm heads
- **BR008**: Dorm heads can only manage users in their assigned dormitory
- **BR009**: Students cannot issue point deductions or removal requests

### 4.3 Point Deduction Rules
- **BR010**: Minimum deduction is 1 point, maximum is 10 points per incident
- **BR011**: Only admins and relevant dorm heads can issue deductions
- **BR012**: Deductions cannot be modified after 7 days
- **BR013**: Total accumulated points threshold for removal eligibility: 30 points

### 4.4 Removal Process Rules
- **BR014**: Removal requests can only be initiated when user has ≥30 accumulated points
- **BR015**: Only the dorm head of the user's dormitory can initiate removal
- **BR016**: Only admins can approve/reject removal requests
- **BR017**: Once removed, user's status changes to 'removed' and bed becomes available
- **BR018**: Removed users lose dormitory and bed assignments

## 5. User Interactions

### 5.1 Admin Interactions
- **CreateDormitory**: Create new dormitory with specified capacity
- **UpdateDormitory**: Modify dormitory details
- **DeactivateDormitory**: Mark dormitory as inactive
- **AssignDormHead**: Appoint a user as dorm head
- **RemoveDormHead**: Remove dorm head privileges
- **AssignUserToDormitory**: Assign a student to a dormitory and bed
- **RemoveUserFromDormitory**: Manually remove user from dormitory
- **IssuePointDeduction**: Issue disciplinary points
- **ProcessRemovalRequest**: Approve or reject removal requests
- **ViewSystemStats**: View overall system statistics

### 5.2 Dorm Head Interactions
- **IssuePointDeduction**: Issue points to users in their dormitory
- **InitiateRemovalRequest**: Request removal of problematic user
- **CancelRemovalRequest**: Cancel pending removal request
- **ViewDormitoryStats**: View statistics for their dormitory
- **ViewUserDeductions**: View deduction history for users

### 5.3 Student Interactions
- **ViewMyDormitory**: View assigned dormitory details
- **ViewMyDeductions**: View personal deduction history
- **ViewMyBed**: View assigned bed information

### 5.4 System-triggered Actions
- **UpdateBedStatus**: Automatically update bed status on assignment/removal
- **UpdateDormitoryOccupancy**: Automatically update occupancy count
- **CalculateTotalPoints**: Automatically sum active deductions

## 6. Computed Properties and Reactive Updates

### 6.1 Dormitory Computations
- `occupancy`: Count of users assigned to dormitory
- `availableBeds`: capacity - occupancy
- `hasDormHead`: Boolean indicating if dorm head is assigned

### 6.2 User Computations
- `totalPoints`: Sum of all active point deductions
- `isRemovable`: totalPoints >= 30
- `isDormHead`: Boolean based on role and assignment

### 6.3 Bed Computations
- `isAvailable`: status === 'available' && no occupant

## 7. State Transitions

### 7.1 User Status Transitions
- active → suspended (via admin action)
- active → removed (via approved removal request)
- suspended → active (via admin action)

### 7.2 Bed Status Transitions
- available → occupied (via user assignment)
- occupied → available (via user removal)
- available/occupied → maintenance (via admin action)
- maintenance → available (via admin action)

### 7.3 Removal Request Status Transitions
- pending → approved (via admin approval)
- pending → rejected (via admin rejection)
- pending → cancelled (via dorm head cancellation)

### 7.4 Point Deduction Status Transitions
- active → appealed (via appeal process - future feature)
- active → cancelled (via admin action)
- appealed → active (appeal rejected)
- appealed → cancelled (appeal approved)

## 8. Data Validation Requirements

### 8.1 Field Validations
- Email must be valid format
- Phone must be valid format (if provided)
- Names cannot be empty strings
- Capacity must be integer 4-6
- Points must be positive integers 1-10
- Timestamps must be valid dates

### 8.2 Business Logic Validations
- Cannot exceed dormitory capacity
- Cannot assign to inactive dormitory
- Cannot issue deductions to users not in your dormitory (for dorm heads)
- Cannot request removal for users with <30 points
- Cannot have multiple pending removal requests for same user

## 9. Permission Matrix

| Interaction | Admin | Dorm Head | Student |
|------------|-------|-----------|---------|
| Create Dormitory | ✓ | ✗ | ✗ |
| Assign Users | ✓ | ✗ | ✗ |
| Appoint Dorm Head | ✓ | ✗ | ✗ |
| Issue Deductions | ✓ | ✓* | ✗ |
| Request Removal | ✗ | ✓* | ✗ |
| Approve Removal | ✓ | ✗ | ✗ |
| View All Data | ✓ | ✗ | ✗ |
| View Dorm Data | ✓ | ✓* | ✓* |
| View Own Data | ✓ | ✓ | ✓ |

*Limited to their assigned dormitory

## 10. Additional Considerations

### 10.1 Audit Trail
- All critical actions (assignments, deductions, removals) should be logged
- Timestamps and actor information must be preserved

### 10.2 Future Enhancements
- Appeal system for point deductions
- Transfer requests between dormitories
- Bed preference system
- Roommate compatibility matching
- Maintenance scheduling system
- Points expiration/forgiveness system

### 10.3 Performance Considerations
- Dormitory occupancy should be computed efficiently
- User total points should be cached/computed
- Bulk assignment operations for new semester

### 10.4 Data Integrity
- Orphaned beds should not exist (must belong to dormitory)
- Users cannot be in limbo state (must have clear status)
- Historical data preservation for removed users
