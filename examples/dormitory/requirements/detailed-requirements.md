# Dormitory Management System - Detailed Requirements

## Business Requirements Analysis

### Core Entities

1. **User**: System participants including administrators, dorm leaders, and residents
2. **Dormitory**: Physical dormitory units with multiple bed spaces
3. **BedSpace**: Individual bed positions within dormitories
4. **Assignment**: Allocation of users to specific bed spaces
5. **Violation**: Rule infractions that result in score deductions
6. **KickoutRequest**: Formal requests to remove users from dormitories

### Detailed Entity Properties

#### User Entity
- `id`: Unique identifier
- `username`: Display name
- `role`: User role (admin, leader, resident)
- `email`: Contact email
- `score`: Current behavioral score (default: 100)
- `isActive`: Account status

#### Dormitory Entity
- `id`: Unique identifier
- `name`: Dormitory name/number
- `capacity`: Maximum number of beds (4-6)
- `leaderId`: Assigned dorm leader
- `isActive`: Operational status

#### BedSpace Entity
- `id`: Unique identifier
- `dormitoryId`: Parent dormitory
- `bedNumber`: Position number within dormitory
- `isOccupied`: Occupancy status

#### Assignment Entity
- `id`: Unique identifier
- `userId`: Assigned user
- `bedSpaceId`: Assigned bed
- `assignedAt`: Assignment timestamp
- `isActive`: Current assignment status

#### Violation Entity
- `id`: Unique identifier
- `userId`: User who violated rules
- `type`: Violation category
- `description`: Violation details
- `scoreDeduction`: Points deducted
- `reportedAt`: When violation occurred
- `reportedById`: Who reported the violation

#### KickoutRequest Entity
- `id`: Unique identifier
- `requesterId`: Dorm leader making request
- `targetUserId`: User to be removed
- `reason`: Justification for removal
- `status`: Request status (pending, approved, rejected)
- `requestedAt`: Request timestamp
- `reviewedAt`: Admin review timestamp
- `reviewedById`: Admin who processed request

### Business Rules

1. **Role Management**
   - Only admin can assign dorm leader roles
   - Each dormitory has exactly one leader
   - Leaders can only manage their assigned dormitory

2. **Dormitory Management**
   - Admin creates dormitories with 4-6 bed capacity
   - Each bed space can hold maximum one user
   - Users can only be assigned to one bed space at a time

3. **Score System**
   - Users start with 100 points
   - Various violations deduct points
   - Score thresholds trigger kickout eligibility

4. **Kickout Process**
   - Leaders can request user removal when score falls below threshold
   - Admin must approve all kickout requests
   - Approved requests result in user removal from dormitory

### Violation Types and Penalties

- **Noise Violation**: -10 points
- **Cleanliness Issue**: -15 points
- **Damage to Property**: -25 points
- **Unauthorized Guests**: -20 points
- **Curfew Violation**: -10 points

### Permission Matrix

| Role | Create Dorm | Assign Users | Report Violations | Request Kickout | Approve Kickout |
|------|-------------|--------------|-------------------|-----------------|-----------------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leader | ✗ | ✗ | ✓ | ✓ (own dorm) | ✗ |
| Resident | ✗ | ✗ | ✗ | ✗ | ✗ |

### Key Business Processes

1. **Dormitory Setup**
   - Admin creates dormitory with specified capacity
   - System automatically creates bed spaces
   - Admin assigns dorm leader

2. **User Assignment**
   - Admin assigns users to available bed spaces
   - System validates capacity and availability
   - Assignment becomes active immediately

3. **Violation Reporting**
   - Leaders/admin report violations against users
   - Score automatically deducted
   - Violation history maintained

4. **Kickout Process**
   - Leader identifies problematic user
   - Leader submits kickout request with justification
   - Admin reviews and approves/rejects request
   - If approved, user is removed from dormitory

### Data Relationships

- User 1:n Assignment (one user can have multiple assignments over time)
- Dormitory 1:n BedSpace (dormitory contains multiple beds)
- BedSpace 1:n Assignment (bed can be assigned to different users over time)
- User 1:n Violation (user can have multiple violations)
- User 1:n KickoutRequest (as both requester and target)
- Dormitory 1:1 User (leader assignment)

### System Constraints

1. **Capacity Limits**: Dormitories cannot exceed 4-6 bed capacity
2. **Unique Assignments**: One user per bed space at any time
3. **Role Restrictions**: Leaders can only manage their assigned dormitory
4. **Score Validation**: Scores cannot go below 0
5. **Request Status**: Kickout requests must be processed by admin