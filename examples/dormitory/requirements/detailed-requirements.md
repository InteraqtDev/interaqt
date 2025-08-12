# Detailed Requirements Analysis - Dormitory Management System

## 1. Business Overview
A comprehensive dormitory management system for educational institutions, enabling effective room assignment, discipline tracking, and eviction management processes.

## 2. Data Perspective Analysis

### 2.1 Core Entities

#### User
- **Purpose**: Represents all system users with different roles
- **Properties**:
  - id: string (system-generated)
  - name: string (user's display name)
  - email: string (unique identifier for login)
  - role: string (admin/dormHead/student)
  - points: number (behavior points, default 100)
  - status: string (active/evicted)
  - evictedAt: number (timestamp when evicted, optional)

#### Dormitory
- **Purpose**: Represents dormitory rooms
- **Properties**:
  - id: string (system-generated)
  - name: string (dormitory identifier, e.g., "Building A Room 101")
  - capacity: number (4-6 beds per room)
  - floor: number (floor number)
  - building: string (building identifier)
  - status: string (active/inactive)
  - createdAt: number (timestamp)

#### Bed
- **Purpose**: Individual bed within a dormitory
- **Properties**:
  - id: string (system-generated)
  - number: string (bed identifier within room, e.g., "A", "B", "C")
  - status: string (vacant/occupied/maintenance)
  - assignedAt: number (timestamp when last assigned)

#### ViolationRecord
- **Purpose**: Track user behavior violations and point deductions
- **Properties**:
  - id: string (system-generated)
  - description: string (violation details)
  - points: number (points deducted)
  - category: string (hygiene/noise/curfew/damage/other)
  - createdAt: number (timestamp)
  - recordedBy: string (name of the dormHead who recorded)

#### EvictionRequest
- **Purpose**: Formal request to evict a student from dormitory
- **Properties**:
  - id: string (system-generated)
  - reason: string (detailed reason for eviction)
  - status: string (pending/approved/rejected)
  - requestedAt: number (timestamp)
  - decidedAt: number (timestamp when decision made, optional)
  - adminNotes: string (admin's decision notes, optional)

### 2.2 Entity Relationships

#### UserDormitoryRelation (n:1)
- **Source**: User (many)
- **Target**: Dormitory (one)
- **Source Property**: dormitory
- **Target Property**: residents
- **Purpose**: Assigns users to dormitories
- **Properties**:
  - assignedAt: number (timestamp)
  - assignedBy: string (admin who made assignment)

#### UserBedRelation (1:1)
- **Source**: User (one)
- **Target**: Bed (one)
- **Source Property**: bed
- **Target Property**: occupant
- **Purpose**: Assigns users to specific beds
- **Properties**:
  - assignedAt: number (timestamp)

#### DormitoryBedRelation (1:n)
- **Source**: Dormitory (one)
- **Target**: Bed (many)
- **Source Property**: beds
- **Target Property**: dormitory
- **Purpose**: Links beds to their dormitory

#### DormitoryDormHeadRelation (1:1)
- **Source**: Dormitory (one)
- **Target**: User (one, with role='dormHead')
- **Source Property**: dormHead
- **Target Property**: managedDormitory
- **Purpose**: Assigns dormitory head to manage a dormitory
- **Properties**:
  - appointedAt: number (timestamp)
  - appointedBy: string (admin who appointed)

#### UserViolationRelation (1:n)
- **Source**: User (one)
- **Target**: ViolationRecord (many)
- **Source Property**: violations
- **Target Property**: user
- **Purpose**: Links violation records to users

#### UserEvictionRequestRelation (1:n)
- **Source**: User (one)
- **Target**: EvictionRequest (many)
- **Source Property**: evictionRequests
- **Target Property**: targetUser
- **Purpose**: Links eviction requests to target users

#### DormHeadEvictionRequestRelation (1:n)
- **Source**: User (one, dormHead)
- **Target**: EvictionRequest (many)
- **Source Property**: submittedEvictionRequests
- **Target Property**: requestedBy
- **Purpose**: Links eviction requests to the dormHead who submitted them

## 3. Interaction Perspective Analysis

### 3.1 Administrator Operations

#### CreateDormitory
- **Purpose**: Create a new dormitory room
- **Payload**: name, capacity, floor, building
- **Validations**: 
  - Capacity must be 4-6
  - Name must be unique
- **Effects**: Creates Dormitory and associated Beds

#### AppointDormHead
- **Purpose**: Appoint a user as dormitory head
- **Payload**: userId, dormitoryId
- **Validations**:
  - User must be student role
  - Dormitory cannot already have a dormHead
  - User cannot already be a dormHead
- **Effects**: 
  - Updates user role to 'dormHead'
  - Creates DormitoryDormHeadRelation

#### AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory and bed
- **Payload**: userId, dormitoryId, bedId
- **Validations**:
  - User must not be already assigned
  - Bed must be vacant
  - Bed must belong to specified dormitory
  - User must not be evicted
- **Effects**:
  - Creates UserDormitoryRelation
  - Creates UserBedRelation
  - Updates bed status to 'occupied'

#### ReviewEvictionRequest
- **Purpose**: Approve or reject eviction request
- **Payload**: requestId, decision (approve/reject), adminNotes
- **Validations**:
  - Request must be pending
- **Effects**:
  - Updates request status
  - If approved: Updates user status to 'evicted', removes from dormitory and bed

### 3.2 Dormitory Head Operations

#### RecordViolation
- **Purpose**: Record a violation for a resident
- **Payload**: userId, description, points, category
- **Validations**:
  - User must be in dormHead's dormitory
  - Points must be positive
  - User must not already be evicted
- **Effects**:
  - Creates ViolationRecord
  - Deducts points from user

#### SubmitEvictionRequest
- **Purpose**: Request eviction of a problematic resident
- **Payload**: userId, reason
- **Validations**:
  - User must be in dormHead's dormitory
  - User must have low points (< 60)
  - No pending eviction request for user
- **Effects**: Creates EvictionRequest with pending status

### 3.3 Student Operations

#### ViewMyDormitory
- **Purpose**: View assigned dormitory information
- **Query**: Returns user's dormitory, bed, roommates

#### ViewMyViolations
- **Purpose**: View violation history and current points
- **Query**: Returns user's violations and current points

#### ViewMyEvictionStatus
- **Purpose**: Check if there's any eviction request
- **Query**: Returns pending/approved eviction requests

## 4. Business Rules

### 4.1 Point System
- All users start with 100 points
- Points cannot go below 0
- Point deduction thresholds:
  - Minor violations (noise, minor hygiene): 5-10 points
  - Medium violations (curfew, repeated offenses): 15-25 points
  - Major violations (damage, safety): 30-50 points
- Eviction eligibility: < 60 points

### 4.2 Dormitory Assignment Rules
- One user can only be assigned to one dormitory
- One user can only occupy one bed
- Evicted users cannot be reassigned without admin approval
- Dormitory capacity must be strictly enforced (4-6 beds)

### 4.3 Role Hierarchy
- **Admin**: Full system access, all operations
- **DormHead**: Manage assigned dormitory, record violations, request evictions
- **Student**: View own information only

### 4.4 Eviction Process
1. User accumulates violations (points < 60)
2. DormHead submits eviction request
3. Admin reviews and decides
4. If approved, user is immediately evicted and bed becomes vacant
5. Evicted user's status permanently marked

## 5. Computed Properties

### User Computations
- **currentPoints**: Calculated from initial 100 minus sum of violations
- **isEligibleForEviction**: Computed based on points < 60
- **dormitoryName**: Retrieved through UserDormitoryRelation
- **bedIdentifier**: Retrieved through UserBedRelation

### Dormitory Computations
- **occupancy**: Count of occupied beds
- **availableBeds**: Capacity minus occupancy
- **occupancyRate**: Percentage of beds occupied
- **residentsList**: List of all residents through relations

### Statistical Computations
- **totalViolationsByCategory**: Group violations by category
- **averagePointsPerDormitory**: Average behavior points by dormitory
- **evictionRate**: Percentage of evicted users

## 6. State Management

### User States
- **active**: Normal resident status
- **warned**: Points below 70
- **evictionPending**: Has pending eviction request
- **evicted**: Removed from dormitory

### Bed States
- **vacant**: Available for assignment
- **occupied**: Assigned to a user
- **maintenance**: Temporarily unavailable

### EvictionRequest States
- **pending**: Awaiting admin review
- **approved**: Eviction executed
- **rejected**: Request denied

## 7. Permission Matrix

| Operation | Admin | DormHead | Student |
|-----------|-------|----------|---------|
| CreateDormitory | ✓ | ✗ | ✗ |
| AppointDormHead | ✓ | ✗ | ✗ |
| AssignUserToDormitory | ✓ | ✗ | ✗ |
| ReviewEvictionRequest | ✓ | ✗ | ✗ |
| RecordViolation | ✗ | ✓ (own dorm) | ✗ |
| SubmitEvictionRequest | ✗ | ✓ (own dorm) | ✗ |
| ViewMyDormitory | ✓ | ✓ | ✓ |
| ViewMyViolations | ✓ | ✓ | ✓ (own) |
| ViewMyEvictionStatus | ✓ | ✓ | ✓ (own) |

## 8. Data Validation Requirements

### Required Fields
- All entity names and identifiers
- Violation points and descriptions
- Eviction reasons
- Assignment timestamps

### Format Validations
- Email must be valid format
- Points must be non-negative integers
- Capacity must be 4-6
- Timestamps must be valid Unix timestamps

### Referential Integrity
- Cannot delete dormitory with residents
- Cannot delete user with pending eviction requests
- Cannot assign to non-existent beds
- Cannot violate unique constraints (one bed per user)
