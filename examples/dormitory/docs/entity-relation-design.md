# Entity and Relation Design

## Entities

### User
- **Purpose**: System users with different roles (admin, dormHead, student)
- **Properties**:
  - id: string (system-generated)
  - name: string (user's display name)
  - email: string (unique identifier for login)
  - role: string ('admin' | 'dormHead' | 'student')
  - status: string ('active' | 'kickedOut', default: 'active')

**Note**: Points property removed as it will be computed from PointDeduction relations

### Dormitory
- **Purpose**: Dormitory buildings/rooms
- **Properties**:
  - id: string (system-generated)
  - name: string (dormitory name/number)
  - capacity: number (4-6 beds)
  - floor: number (floor number)
  - building: string (building name)

### Bed
- **Purpose**: Individual bed assignments within a dormitory
- **Properties**:
  - id: string (system-generated)
  - bedNumber: number (1 to capacity)
  - status: string ('available' | 'occupied', default: 'available')

### PointDeduction
- **Purpose**: Records of point deductions for user behaviors
- **Properties**:
  - id: string (system-generated)
  - reason: string (description of the violation)
  - points: number (points deducted, positive number)
  - timestamp: number (when the deduction occurred, default: Date.now())
  - recordedBy: string (dorm head who recorded this)

### KickOutApplication
- **Purpose**: Applications from dormitory heads to kick out users
- **Properties**:
  - id: string (system-generated)
  - reason: string (detailed reason for kick-out request)
  - status: string ('pending' | 'approved' | 'rejected', default: 'pending')
  - applicationTime: number (timestamp, default: Date.now())
  - processedTime: number (timestamp when processed, optional)
  - processedBy: string (admin who processed, optional)

## Relations

### UserDormHeadRelation
- **Type**: n:1 (many dormitories to one head, typically one-to-one in practice)
- **Source**: Dormitory
- **Target**: User (with role='dormHead')
- **Source Property**: dormHead (access dorm head from dormitory)
- **Target Property**: managedDormitories (access managed dormitories from user)
- **Purpose**: Links dormitories to their assigned heads

### UserBedRelation
- **Type**: 1:1 (one user to one bed)
- **Source**: User
- **Target**: Bed
- **Source Property**: bed (access bed from user)
- **Target Property**: occupant (access occupant from bed)
- **Properties**:
  - assignedAt: number (timestamp, default: Date.now())
  - assignedBy: string (admin who made assignment)
- **Purpose**: Tracks bed assignments

### DormitoryBedRelation
- **Type**: 1:n (one dormitory has many beds)
- **Source**: Dormitory
- **Target**: Bed
- **Source Property**: beds (access all beds from dormitory)
- **Target Property**: dormitory (access dormitory from bed)
- **Purpose**: Links beds to their parent dormitory

### UserPointDeductionRelation
- **Type**: 1:n (one user can have many deductions)
- **Source**: User
- **Target**: PointDeduction
- **Source Property**: pointDeductions (access all deductions from user)
- **Target Property**: user (access user from deduction)
- **Purpose**: Tracks all point deductions for a user

### KickOutApplicationUserRelation
- **Type**: n:1 (many applications can target one user)
- **Source**: KickOutApplication
- **Target**: User (the user to be kicked out)
- **Source Property**: targetUser (access target user from application)
- **Target Property**: kickOutApplications (access all applications targeting this user)
- **Purpose**: Links kick-out applications to target users

### KickOutApplicationApplicantRelation
- **Type**: n:1 (many applications from one dormitory head)
- **Source**: KickOutApplication
- **Target**: User (the dormitory head applying)
- **Source Property**: applicant (access applicant from application)
- **Target Property**: submittedApplications (access all submitted applications from user)
- **Purpose**: Links kick-out applications to the dormitory head who submitted them

## Filtered Entities

### ActiveUser
- **Source Entity**: User
- **Filter Condition**: status = 'active'
- **Purpose**: Query only active users (not kicked out)

### AvailableBed
- **Source Entity**: Bed
- **Filter Condition**: status = 'available'
- **Purpose**: Query only available beds for assignment

### PendingKickOutApplication
- **Source Entity**: KickOutApplication
- **Filter Condition**: status = 'pending'
- **Purpose**: Query only pending applications for admin processing

## Data Flow Diagrams

### User Assignment Flow
```
Admin → AssignUserToBed → Creates UserBedRelation
                      ↓
                    Updates Bed.status to 'occupied'
                      ↓
           User can access dormitory via bed.dormitory
```

### Point Deduction Flow
```
DormHead → RecordPointDeduction → Creates PointDeduction entity
                               ↓
                   Creates UserPointDeductionRelation
                               ↓
              User.currentPoints computed from sum of deductions
```

### Kick-Out Application Flow
```
DormHead → SubmitKickOutApplication → Creates KickOutApplication (pending)
                                  ↓
                      Creates two relations:
                      - KickOutApplicationUserRelation (target)
                      - KickOutApplicationApplicantRelation (applicant)
                                  ↓
Admin → ProcessKickOutApplication → Updates status to approved/rejected
                                ↓
                    If approved: User.status → 'kickedOut'
                                UserBedRelation removed
                                Bed.status → 'available'
```

## Computed Properties (To be implemented)

### User Computations:
1. **totalDeductions**: Sum of all points from pointDeductions
2. **currentPoints**: 100 - totalDeductions
3. **dormitory**: Accessed via bed.dormitory relation chain
4. **isDormHead**: managedDormitories.length > 0

### Dormitory Computations:
1. **occupiedBeds**: Count of beds where status = 'occupied'
2. **availableBeds**: capacity - occupiedBeds
3. **occupancyRate**: (occupiedBeds / capacity) * 100
4. **residents**: Users who have beds in this dormitory

### Bed Computations:
1. **isOccupied**: status === 'occupied'

## Design Decisions

1. **No Reference IDs in Entities**: Following framework best practices, we don't store foreign keys as properties. All relationships are managed through Relation definitions.

2. **Points as Computed Property**: Instead of storing points directly, we compute them from the sum of PointDeduction records. This provides better audit trail and prevents inconsistencies.

3. **Bed as Separate Entity**: Rather than embedding bed information in Dormitory, we model beds as separate entities to better track individual assignments and status.

4. **Status Fields**: We use string enums for status fields to provide clarity and enable state transitions (e.g., User.status, Bed.status, KickOutApplication.status).

5. **Filtered Entities**: We define filtered entities for common queries (ActiveUser, AvailableBed, PendingKickOutApplication) to simplify data access patterns.

6. **Timestamp Defaults**: All timestamp fields use function defaults `() => Date.now()` to ensure proper time recording.

7. **Relation Property Naming**: We carefully choose sourceProperty and targetProperty names to make the code intuitive (e.g., user.bed, dormitory.beds, application.targetUser). 