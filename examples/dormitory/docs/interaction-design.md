# Interaction Design

## Core Business Logic Interactions (Stage 1)

### CreateDormitory
- **Purpose**: Create a new dormitory building
- **Payload**:
  - name: string (required, unique building identifier)
  - capacity: number (required, must be 4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Creates associated Bed entities (number equals capacity)
  - Sets dormitory status to "active"
  - Initializes occupancyCount to 0
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: 
  - Capacity must be between 4 and 6
  - Name must be unique

### AssignUserToBed
- **Purpose**: Assign a student to a specific bed
- **Payload**:
  - userId: string (required)
  - bedId: string (required)
- **Effects**:
  - Creates UserBedRelation
  - Updates bed status to "occupied"
  - Records assignment timestamp
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**:
  - Bed must be vacant
  - User must not already be assigned to another bed
  - User status must be "active" (not kickedOut)

### RemoveUserFromBed
- **Purpose**: Remove a user from their assigned bed
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Removes UserBedRelation
  - Updates bed status to "vacant"
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: User must currently be assigned to a bed

### TransferUser
- **Purpose**: Move a user from one bed to another
- **Payload**:
  - userId: string (required)
  - newBedId: string (required)
- **Effects**:
  - Removes old UserBedRelation
  - Creates new UserBedRelation
  - Updates both bed statuses
  - Updates both dormitory occupancy counts
- **Stage 2 - Permissions**: Only admin can transfer
- **Stage 2 - Business Rules**:
  - User must be currently assigned
  - New bed must be vacant

### AssignDormHead
- **Purpose**: Designate a user as dormitory head
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
- **Effects**:
  - Updates user role to "dormHead"
  - Creates DormitoryDormHeadRelation
  - Records assignment timestamp
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**:
  - User must exist
  - Dormitory must exist
  - Dormitory should not already have a dorm head (or replace existing)

### CreateViolationRule
- **Purpose**: Define a new violation rule with penalty points
- **Payload**:
  - name: string (required)
  - description: string (required)
  - points: number (required, positive integer)
  - category: string (required, one of: hygiene/noise/safety/discipline)
- **Effects**:
  - Creates new ViolationRule entity
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: Points must be positive

### RecordViolation
- **Purpose**: Record a rule violation for a resident
- **Payload**:
  - targetUserId: string (required)
  - violationRuleId: string (required)
  - description: string (required, specific incident details)
- **Effects**:
  - Creates ViolationRecord entity
  - Links to user and rule
  - Sets status to "active"
  - Records timestamp
  - Updates user's violationScore
- **Stage 2 - Permissions**: Only dormHead can record
- **Stage 2 - Business Rules**:
  - Target user must be in the dorm head's managed dormitory
  - Cannot record violation for self (dormHead)

### RequestKickout
- **Purpose**: Dorm head requests removal of problematic resident
- **Payload**:
  - targetUserId: string (required)
  - reason: string (required, detailed justification)
- **Effects**:
  - Creates KickoutRequest entity
  - Sets status to "pending"
  - Links to initiator, target user, and dormitory
  - Records request timestamp
- **Stage 2 - Permissions**: Only dormHead can request
- **Stage 2 - Business Rules**:
  - Target user must be in the dorm head's managed dormitory
  - Cannot have existing pending request for same user

### ApproveKickoutRequest
- **Purpose**: Admin approves a kickout request
- **Payload**:
  - requestId: string (required)
  - comments: string (optional, admin notes)
- **Effects**:
  - Updates request status to "approved"
  - Updates user status to "kickedOut"
  - Removes UserBedRelation
  - Updates bed status to "vacant"
  - Updates dormitory occupancy count
  - Records admin comments
- **Stage 2 - Permissions**: Only admin can approve
- **Stage 2 - Business Rules**: Request must be in "pending" status

### RejectKickoutRequest
- **Purpose**: Admin rejects a kickout request
- **Payload**:
  - requestId: string (required)
  - comments: string (required, reason for rejection)
- **Effects**:
  - Updates request status to "rejected"
  - Records admin comments
  - User remains in assigned bed
- **Stage 2 - Permissions**: Only admin can reject
- **Stage 2 - Business Rules**: Request must be in "pending" status

## Query Interactions

### ViewDormitoryStatus
- **Purpose**: View dormitory information and occupancy
- **Payload**:
  - dormitoryId: string (required)
- **Returns**:
  - Dormitory details
  - Current occupancy count
  - List of beds with status
  - List of current residents
  - Dorm head information
- **Stage 2 - Permissions**:
  - Admin: Can view any dormitory
  - DormHead: Can view managed dormitory
  - Student: Can view assigned dormitory only

### ViewUserViolations
- **Purpose**: View violation history for a user
- **Payload**:
  - userId: string (required)
- **Returns**:
  - List of all violation records
  - Total violation score
  - Violation breakdown by category
- **Stage 2 - Permissions**:
  - Admin: Can view any user
  - DormHead: Can view users in managed dormitory
  - Student: Can view own violations only

### ViewOccupancyReport
- **Purpose**: View occupancy statistics
- **Payload**:
  - dormitoryId: string (optional, null for all dormitories)
- **Returns**:
  - Total beds and occupied beds
  - Occupancy percentage
  - List of vacant beds
- **Stage 2 - Permissions**:
  - Admin: Can view all or specific dormitory
  - DormHead: Can view managed dormitory only
  - Student: No access

### ViewKickoutRequests
- **Purpose**: View kickout requests
- **Payload**:
  - status: string (optional: pending/approved/rejected/all)
  - dormitoryId: string (optional)
- **Returns**:
  - List of kickout requests matching criteria
  - Request details including initiator, target, reason
- **Stage 2 - Permissions**:
  - Admin: Can view all requests
  - DormHead: Can view own initiated requests
  - Student: No access

## Implementation Notes

### Stage 1 Focus
- Implement all interactions with basic functionality
- Ensure entities are created/updated correctly
- Verify relationships are established
- Calculate computed properties
- No permission checks or complex validations

### Stage 2 Enhancements
- Add role-based permission checks
- Implement business rule validations
- Add input validation
- Ensure error messages are descriptive

### Error Handling
All interactions should return appropriate errors for:
- Missing required fields
- Invalid data types
- Permission denied (Stage 2)
- Business rule violations (Stage 2)
- Entity not found scenarios