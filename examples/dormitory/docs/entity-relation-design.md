# Entity and Relation Design - Dormitory Management System

## Overview
This document defines all entities and relations for the dormitory management system based on the requirements analysis from Phase 1. The design follows interaqt framework principles where entities contain only primitive properties, and all inter-entity connections are managed through Relations.

## Core Entities

### User Entity
- **Purpose**: Represents all system users including students, dormitory heads, and administrators
- **Properties**:
  - id: string (system-generated)
  - name: string (user's display name)
  - email: string (unique identifier for login)
  - role: string (admin/dormHead/student)
  - points: number (behavior points, default 100)
  - status: string (active/evicted, default 'active')
  - evictedAt: number (timestamp when evicted, optional)

### Dormitory Entity
- **Purpose**: Represents dormitory rooms in the system
- **Properties**:
  - id: string (system-generated)
  - name: string (dormitory identifier, e.g., "Building A Room 101")
  - capacity: number (4-6 beds per room)
  - floor: number (floor number)
  - building: string (building identifier)
  - status: string (active/inactive, default 'active')
  - createdAt: number (timestamp)

### Bed Entity
- **Purpose**: Individual bed within a dormitory room
- **Properties**:
  - id: string (system-generated)
  - number: string (bed identifier within room, e.g., "A", "B", "C")
  - status: string (vacant/occupied/maintenance, default 'vacant')
  - assignedAt: number (timestamp when last assigned, optional)

### ViolationRecord Entity
- **Purpose**: Track user behavior violations and point deductions
- **Properties**:
  - id: string (system-generated)
  - description: string (violation details)
  - points: number (points deducted)
  - category: string (hygiene/noise/curfew/damage/other)
  - createdAt: number (timestamp)
  - recordedBy: string (name of the dormHead who recorded)

### EvictionRequest Entity
- **Purpose**: Formal request to evict a student from dormitory
- **Properties**:
  - id: string (system-generated)
  - reason: string (detailed reason for eviction)
  - status: string (pending/approved/rejected, default 'pending')
  - requestedAt: number (timestamp)
  - decidedAt: number (timestamp when decision made, optional)
  - adminNotes: string (admin's decision notes, optional)

## Entity Relations

### UserDormitoryRelation
- **Type**: n:1 (many users to one dormitory)
- **Source**: User (many)
- **Target**: Dormitory (one)
- **Source Property**: dormitory (User accesses their dormitory via user.dormitory)
- **Target Property**: residents (Dormitory accesses its residents via dormitory.residents)
- **Purpose**: Assigns students to dormitories
- **Relation Properties**:
  - assignedAt: number (timestamp)
  - assignedBy: string (admin who made assignment)

### UserBedRelation
- **Type**: 1:1 (one user to one bed)
- **Source**: User (one)
- **Target**: Bed (one)
- **Source Property**: bed (User accesses their bed via user.bed)
- **Target Property**: occupant (Bed accesses its occupant via bed.occupant)
- **Purpose**: Assigns users to specific beds

### DormitoryBedRelation
- **Type**: 1:n (one dormitory to many beds)
- **Source**: Dormitory (one)
- **Target**: Bed (many)
- **Source Property**: beds (Dormitory accesses its beds via dormitory.beds)
- **Target Property**: dormitory (Bed accesses its dormitory via bed.dormitory)
- **Purpose**: Links beds to their dormitory

### DormitoryDormHeadRelation
- **Type**: 1:1 (one dormitory to one dormHead)
- **Source**: Dormitory (one)
- **Target**: User (one, with role='dormHead')
- **Source Property**: dormHead (Dormitory accesses its head via dormitory.dormHead)
- **Target Property**: managedDormitory (DormHead accesses their dormitory via user.managedDormitory)
- **Purpose**: Assigns dormitory head to manage a dormitory
- **Relation Properties**:
  - appointedAt: number (timestamp)
  - appointedBy: string (admin who appointed)

### UserViolationRelation
- **Type**: 1:n (one user to many violations)
- **Source**: User (one)
- **Target**: ViolationRecord (many)
- **Source Property**: violations (User accesses violations via user.violations)
- **Target Property**: user (Violation accesses user via violation.user)
- **Purpose**: Links violation records to users

### UserEvictionRequestRelation
- **Type**: 1:n (one user to many eviction requests)
- **Source**: User (one)
- **Target**: EvictionRequest (many)
- **Source Property**: evictionRequests (User accesses requests via user.evictionRequests)
- **Target Property**: targetUser (Request accesses target via request.targetUser)
- **Purpose**: Links eviction requests to target users

### DormHeadEvictionRequestRelation
- **Type**: 1:n (one dormHead to many eviction requests)
- **Source**: User (one, dormHead)
- **Target**: EvictionRequest (many)
- **Source Property**: submittedEvictionRequests (DormHead accesses via user.submittedEvictionRequests)
- **Target Property**: requestedBy (Request accesses requester via request.requestedBy)
- **Purpose**: Links eviction requests to the dormHead who submitted them

## Filtered Entities (Future Enhancement)

### ActiveUser
- **Source**: User
- **Filter**: status = 'active'
- **Purpose**: Query only active users in the system

### VacantBed
- **Source**: Bed
- **Filter**: status = 'vacant'
- **Purpose**: Query available beds for assignment

### PendingEvictionRequest
- **Source**: EvictionRequest
- **Filter**: status = 'pending'
- **Purpose**: Query requests awaiting admin review

## Data Flow Diagrams

### User Assignment Flow
```
Admin → AssignUserToDormitory → Creates UserDormitoryRelation
                              → Creates UserBedRelation
                              → Updates Bed.status = 'occupied'
```

### Violation Recording Flow
```
DormHead → RecordViolation → Creates ViolationRecord
                           → Creates UserViolationRelation
                           → Updates User.points (computed)
```

### Eviction Process Flow
```
DormHead → SubmitEvictionRequest → Creates EvictionRequest
                                 → Creates UserEvictionRequestRelation
                                 → Creates DormHeadEvictionRequestRelation

Admin → ReviewEvictionRequest → Updates EvictionRequest.status
                              → If approved:
                                - Updates User.status = 'evicted'
                                - Deletes UserDormitoryRelation
                                - Deletes UserBedRelation
                                - Updates Bed.status = 'vacant'
```

## Important Design Decisions

### 1. No Reference IDs in Entities
Following interaqt best practices:
- ❌ User entity does NOT have `dormitoryId` property
- ❌ Bed entity does NOT have `dormitoryId` property
- ❌ ViolationRecord does NOT have `userId` property
- ✅ All connections are managed through Relations

### 2. Computed Properties Strategy
These properties will be implemented as computations, not stored:
- User.currentPoints (100 - sum of violations)
- User.isEligibleForEviction (points < 60)
- Dormitory.occupancy (count of occupied beds)
- Dormitory.availableBeds (capacity - occupancy)
- Dormitory.occupancyRate (percentage)

### 3. State Management
Entities with state transitions:
- User: active → evicted
- Bed: vacant ↔ occupied ↔ maintenance
- EvictionRequest: pending → approved/rejected

### 4. Bidirectional Access
All relations provide bidirectional access:
- user.dormitory ↔ dormitory.residents
- user.bed ↔ bed.occupant
- dormitory.beds ↔ bed.dormitory
- user.violations ↔ violation.user

### 5. Timestamp Strategy
- Use number type for timestamps (Unix timestamps in seconds)
- Optional timestamps use defaultValue for creation time
- Update timestamps handled by interactions

## Validation Rules

### Entity Validation
- [ ] All entity names are PascalCase and singular
- [ ] All properties have correct types
- [ ] Default values are functions, not static values
- [ ] No reference ID fields in entities

### Relation Validation
- [ ] Relations have no name property (auto-generated)
- [ ] Relation types use correct format ('1:1', '1:n', 'n:1', 'n:n')
- [ ] Source and target properties are clearly defined
- [ ] Bidirectional access is properly configured

### Business Logic Validation
- [ ] Capacity constraints (4-6 beds)
- [ ] Role constraints (admin, dormHead, student)
- [ ] Status constraints (defined enums)
- [ ] Point system (0-100 range)

## Implementation Notes

1. **Entity Creation Order**: 
   - Define all entities first
   - Then define relations
   - This prevents circular dependency issues

2. **Property Types**:
   - Use 'string' for text and identifiers
   - Use 'number' for numeric values and timestamps
   - Use 'boolean' for flags
   - Use 'object' for complex nested data

3. **Relation Properties**:
   - Add metadata to relations when needed
   - Examples: assignedAt, appointedAt timestamps
   - Keep relation properties minimal

4. **Future Enhancements**:
   - Add filtered entities for common queries
   - Consider adding audit trail entities
   - Potential for notification system entities

## Summary

This design provides a complete data model for the dormitory management system with:
- 5 core entities (User, Dormitory, Bed, ViolationRecord, EvictionRequest)
- 7 relations connecting entities appropriately
- Clear separation between stored and computed properties
- Proper bidirectional access patterns
- Foundation for state management and business rules
