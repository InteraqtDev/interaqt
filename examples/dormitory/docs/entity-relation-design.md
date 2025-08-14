# Dormitory Management System - Entity and Relation Design

## Entities

### User
- **Purpose**: System users with different roles and permissions
- **Properties**:
  - id: string (system-generated unique identifier)
  - name: string (user's display name)
  - email: string (unique login identifier)
  - role: string (admin/dormHead/student)
  - status: string (active/evicted)
  - points: number (behavior points, starts at 100)
  - createdAt: number (timestamp of account creation)

### Dormitory
- **Purpose**: Physical dormitory buildings with capacity management
- **Properties**:
  - id: string (system-generated unique identifier)
  - name: string (dormitory name/number)
  - capacity: number (4-6 beds per dormitory)
  - status: string (active/full)
  - createdAt: number (timestamp of creation)

### Bed
- **Purpose**: Individual bed spaces within dormitories
- **Properties**:
  - id: string (system-generated unique identifier)
  - bedNumber: number (1-6 within the dormitory)
  - status: string (available/occupied)
  - createdAt: number (timestamp of creation)

### PointDeduction
- **Purpose**: Track behavior violations and point deductions
- **Properties**:
  - id: string (system-generated unique identifier)
  - reason: string (description of violation)
  - points: number (points deducted)
  - createdAt: number (timestamp of deduction)
  - recordedBy: string (who recorded the violation)

### EvictionRequest
- **Purpose**: Track requests to evict users from dormitories
- **Properties**:
  - id: string (system-generated unique identifier)
  - reason: string (reason for eviction request)
  - status: string (pending/approved/rejected)
  - createdAt: number (timestamp of request)
  - processedAt: number (timestamp of admin decision)
  - processedBy: string (admin who processed request)

## Relations

### UserDormitoryRelation
- **Type**: n:1 (many users to one dormitory)
- **Purpose**: Assigns students to dormitories
- **Source Property**: `dormitory` (on User entity)
- **Target Property**: `users` (on Dormitory entity)
- **Properties**:
  - assignedAt: number (timestamp of assignment)
  - assignedBy: string (who made the assignment)

### UserBedRelation
- **Type**: 1:1 (one user to one bed)
- **Purpose**: Assigns specific bed to user
- **Source Property**: `bed` (on User entity)
- **Target Property**: `user` (on Bed entity)
- **Properties**:
  - assignedAt: number (timestamp of bed assignment)

### DormitoryBedsRelation
- **Type**: 1:n (one dormitory to many beds)
- **Purpose**: Links beds to their dormitory
- **Source Property**: `beds` (on Dormitory entity)
- **Target Property**: `dormitory` (on Bed entity)

### UserPointDeductionRelation
- **Type**: n:n (many users to many point deductions)
- **Purpose**: Links point deductions to users
- **Source Property**: `pointDeductions` (on User entity)
- **Target Property**: `users` (on PointDeduction entity)
- **Properties**: None (inherited from interaction)

### UserEvictionRequestRelation
- **Type**: n:n (many users to many eviction requests)
- **Purpose**: Links eviction requests to users
- **Source Property**: `evictionRequests` (on User entity)
- **Target Property**: `users` (on EvictionRequest entity)
- **Properties**: None (inherited from interaction)

## Filtered Entities

### ActiveUser
- **Purpose**: Users with active status
- **Source Entity**: User
- **Match Expression**: status = 'active'

### EvictedUser
- **Purpose**: Users who have been evicted
- **Source Entity**: User
- **Match Expression**: status = 'evicted'

### AvailableBed
- **Purpose**: Beds that are available for assignment
- **Source Entity**: Bed
- **Match Expression**: status = 'available'

### OccupiedBed
- **Purpose**: Beds that are currently occupied
- **Source Entity**: Bed
- **Match Expression**: status = 'occupied'

### PendingEvictionRequest
- **Purpose**: Eviction requests awaiting admin decision
- **Source Entity**: EvictionRequest
- **Match Expression**: status = 'pending'

## Data Flow and Business Rules

### Entity Creation Flow
1. **Dormitory** creation automatically generates beds
2. **User** creation initializes points to 100
3. **PointDeduction** records track violation history
4. **EvictionRequest** records track eviction workflow

### Relation Validation Rules
- A user can only be assigned to one dormitory at a time
- A user can only occupy one bed at a time
- Beds must belong to a dormitory
- Point deductions must be linked to a user
- Eviction requests must be linked to a user

### State Management
- User status transitions: active → evicted
- Bed status transitions: available ↔ occupied
- Dormitory status transitions: active → full
- EvictionRequest status transitions: pending → approved/rejected

## Common Mistakes to Avoid

❌ **Incorrect: Adding reference ID fields to entities**
```typescript
const User = Entity.create({
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }), // ❌ WRONG
    Property.create({ name: 'bedId', type: 'string' })         // ❌ WRONG
  ]
})
```

✅ **Correct: Using relations instead**
```typescript
// Relations automatically create the property accessors
const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  sourceProperty: 'dormitory',  // Creates user.dormitory
  targetProperty: 'users',      // Creates dormitory.users
  type: 'n:1'
})
```

This design follows the interaqt framework's best practices by:
- Using relations instead of reference ID fields
- Separating entities based on business concepts
- Providing filtered views for common queries
- Supporting the complete business workflow from assignment to eviction