# Entity and Relation Design

## Entities

### User
- **Purpose**: System users with different roles (admin, dormHead, student)
- **Properties**:
  - id: string (system-generated)
  - name: string (user's display name)
  - email: string (unique identifier for login)
  - phone: string (contact information)
  - role: string (admin/dormHead/student)
  - violationScore: number (total accumulated violation points, computed)
  - status: string (active/suspended/kickedOut)

### Dormitory
- **Purpose**: Physical dormitory buildings that house students
- **Properties**:
  - id: string (system-generated)
  - name: string (building name/number)
  - capacity: number (total bed capacity, 4-6)
  - occupancyCount: number (current number of occupied beds, computed)
  - status: string (active/full/inactive)

### Bed
- **Purpose**: Individual bed units within dormitories
- **Properties**:
  - id: string (system-generated)
  - number: string (bed identifier within dormitory)
  - status: string (vacant/occupied)

### ViolationRule
- **Purpose**: Predefined rules with associated penalty points
- **Properties**:
  - id: string (system-generated)
  - name: string (rule name)
  - description: string (detailed description)
  - points: number (penalty points)
  - category: string (hygiene/noise/safety/discipline)

### ViolationRecord
- **Purpose**: Actual violations recorded against users
- **Properties**:
  - id: string (system-generated)
  - description: string (specific incident description)
  - points: number (points deducted)
  - recordedAt: number (timestamp)
  - status: string (active/appealed/revoked)

### KickoutRequest
- **Purpose**: Formal requests from dorm heads to remove residents
- **Properties**:
  - id: string (system-generated)
  - reason: string (justification for removal)
  - requestDate: number (timestamp)
  - status: string (pending/approved/rejected)
  - adminComments: string (admin's decision notes)

## Relations

### BedDormitoryRelation
- **Type**: n:1 (many beds to one dormitory)
- **Purpose**: Links beds to their parent dormitory
- **Source**: Bed
- **Target**: Dormitory
- **Source Property**: `dormitory` (on Bed entity - bed.dormitory)
- **Target Property**: `beds` (on Dormitory entity - dormitory.beds)
- **Properties**: None

### UserBedRelation
- **Type**: 1:1 (one user to one bed at a time)
- **Purpose**: Assigns users to specific beds
- **Source**: User
- **Target**: Bed
- **Source Property**: `currentBed` (on User entity - user.currentBed)
- **Target Property**: `occupant` (on Bed entity - bed.occupant)
- **Properties**: 
  - assignedAt: number (timestamp of assignment)

### DormitoryDormHeadRelation
- **Type**: 1:1 (one dorm head per dormitory)
- **Purpose**: Designates management responsibility
- **Source**: Dormitory
- **Target**: User (with dormHead role)
- **Source Property**: `dormHead` (on Dormitory entity - dormitory.dormHead)
- **Target Property**: `managedDormitory` (on User entity - user.managedDormitory)
- **Properties**:
  - assignedAt: number (timestamp)

### UserViolationRelation
- **Type**: 1:n (one user can have many violations)
- **Purpose**: Links violation records to users
- **Source**: User
- **Target**: ViolationRecord
- **Source Property**: `violations` (on User entity - user.violations)
- **Target Property**: `user` (on ViolationRecord entity - violationRecord.user)
- **Properties**: None

### ViolationRuleRecordRelation
- **Type**: 1:n (one rule can be used in many records)
- **Purpose**: Links violation records to their rules
- **Source**: ViolationRule
- **Target**: ViolationRecord
- **Source Property**: `records` (on ViolationRule entity - rule.records)
- **Target Property**: `rule` (on ViolationRecord entity - record.rule)
- **Properties**: None

### RecorderViolationRelation
- **Type**: 1:n (one dorm head can record many violations)
- **Purpose**: Tracks who recorded each violation
- **Source**: User (dormHead)
- **Target**: ViolationRecord
- **Source Property**: `recordedViolations` (on User entity)
- **Target Property**: `recordedBy` (on ViolationRecord entity)
- **Properties**: None

### KickoutRequestUserRelation
- **Type**: n:1 (many requests can target one user)
- **Purpose**: Links kickout requests to target users
- **Source**: KickoutRequest
- **Target**: User
- **Source Property**: `targetUser` (on KickoutRequest entity)
- **Target Property**: `kickoutRequests` (on User entity)
- **Properties**: None

### KickoutRequestInitiatorRelation
- **Type**: n:1 (one dorm head can initiate many requests)
- **Purpose**: Tracks who initiated each request
- **Source**: KickoutRequest
- **Target**: User (dormHead)
- **Source Property**: `initiator` (on KickoutRequest entity)
- **Target Property**: `initiatedRequests` (on User entity)
- **Properties**: None

### KickoutRequestDormitoryRelation
- **Type**: n:1 (many requests can be for one dormitory)
- **Purpose**: Links requests to the relevant dormitory
- **Source**: KickoutRequest
- **Target**: Dormitory
- **Source Property**: `dormitory` (on KickoutRequest entity)
- **Target Property**: `kickoutRequests` (on Dormitory entity)
- **Properties**: None

## Data Flow Diagram

```
User (Student) ←→ Bed ←→ Dormitory
       ↓                      ↑
       ↓                      ↓
ViolationRecord          DormHead (User)
       ↓                      ↓
       ↓                      ↓
   KickoutRequest ←───────────┘
```

## Key Design Decisions

1. **No ID References in Entities**: All relationships are managed through Relation definitions, not through ID properties in entities.

2. **Computed Properties**: 
   - User.violationScore is computed from all active ViolationRecords
   - Dormitory.occupancyCount is computed from occupied beds

3. **State Management**:
   - User states: active → suspended → kickedOut
   - Bed states: vacant ↔ occupied
   - KickoutRequest states: pending → approved/rejected

4. **Cardinality Choices**:
   - User to Bed is 1:1 (at any given time)
   - Dormitory to DormHead is 1:1
   - All violation-related relations are 1:n