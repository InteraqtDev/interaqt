# Dormitory Management System - Interaction Matrix

## Overview
This matrix maps all user interactions with their corresponding permissions, business rules, and test coverage to ensure complete system implementation.

## Role Definitions

| Role | Description | Permissions |
|------|-------------|------------|
| **Admin** | System administrator with full control | All system operations |
| **Dormitory Head** | User assigned to manage a specific dormitory | Limited management operations within their dormitory |
| **Regular User** | Standard system user | View own data, no management capabilities |

---

## Interaction Permission Matrix

| Interaction | Admin | Dormitory Head | Regular User | Business Rules |
|------------|-------|----------------|--------------|----------------|
| **CreateDormitory** | ✅ | ❌ | ❌ | - Bed count must be 4-6<br>- Dormitory name must be unique |
| **AssignDormitoryHead** | ✅ | ❌ | ❌ | - User can only head one dormitory<br>- Target user must exist |
| **AssignUserToBed** | ✅ | ❌ | ❌ | - User can only have one bed assignment<br>- Bed must be available<br>- Bed number within dormitory capacity |
| **DeductPoints** | ✅ | ✅* | ❌ | - *Dormitory heads only for their residents<br>- Points cannot go below 0<br>- Must provide reason |
| **RequestUserRemoval** | ❌ | ✅* | ❌ | - *Only for residents in their dormitory<br>- User must have ≤20 points<br>- No duplicate pending requests |
| **ProcessRemovalRequest** | ✅ | ❌ | ❌ | - Request must be pending<br>- Must provide comment<br>- Updates bed assignment if approved |
| **ViewMyStatus** | ✅ | ✅ | ✅ | - Users can only view their own status |
| **ViewDormitoryInfo** | ✅ | ✅* | ✅* | - *Must be assigned to the dormitory |

---

## Detailed Interaction Specifications

### Administrative Interactions

#### 1. CreateDormitory
- **Purpose**: Create a new dormitory in the system
- **Actors**: Admin only
- **Preconditions**: 
  - User has admin privileges
  - Dormitory name is unique
- **Input Parameters**:
  - `name`: string (required, unique)
  - `bedCount`: number (required, 4-6)
- **Validations**:
  - Name not empty
  - Name not already in use
  - Bed count between 4 and 6 inclusive
- **Side Effects**:
  - Creates Dormitory entity
  - Sets initial occupancy to 0
- **Test Cases**: TC001, TC002, TC010

#### 2. AssignDormitoryHead
- **Purpose**: Assign a user as dormitory head
- **Actors**: Admin only
- **Preconditions**:
  - User has admin privileges
  - Target dormitory exists
  - Target user exists
- **Input Parameters**:
  - `dormitoryId`: string (required)
  - `userId`: string (required)
- **Validations**:
  - User not already head of another dormitory
  - Dormitory exists
  - User exists
- **Side Effects**:
  - Creates/Updates DormitoryHeadRelation
  - Previous head (if any) loses role
- **Test Cases**: TC003, TC017

#### 3. AssignUserToBed
- **Purpose**: Assign a user to a dormitory bed
- **Actors**: Admin only
- **Preconditions**:
  - User has admin privileges
  - Target user not already assigned
  - Bed is available
- **Input Parameters**:
  - `userId`: string (required)
  - `dormitoryId`: string (required)
  - `bedNumber`: number (required)
- **Validations**:
  - User exists
  - Dormitory exists
  - Bed number within capacity (1 to bedCount)
  - Bed not occupied
  - User not already assigned elsewhere
- **Side Effects**:
  - Creates BedAssignment entity
  - Updates dormitory occupancy
  - Links user to bed
- **Test Cases**: TC004, TC005, TC015, TC019

#### 4. ProcessRemovalRequest
- **Purpose**: Approve or reject a removal request
- **Actors**: Admin only
- **Preconditions**:
  - User has admin privileges
  - Request is in pending status
- **Input Parameters**:
  - `removalRequestId`: string (required)
  - `decision`: 'approved' | 'rejected' (required)
  - `comment`: string (required)
- **Validations**:
  - Request exists
  - Request is pending
  - Comment not empty
- **Side Effects**:
  - Updates RemovalRequest status
  - Creates AdminComment
  - If approved: Sets BedAssignment.removedAt
  - If approved: Updates dormitory occupancy
- **Test Cases**: TC008, TC009

### Dormitory Head Interactions

#### 5. DeductPoints
- **Purpose**: Deduct points from a resident for violations
- **Actors**: Admin, Dormitory Head (for their residents)
- **Preconditions**:
  - User is admin OR dormitory head of target's dormitory
  - Target user exists and is in dormitory
- **Input Parameters**:
  - `userId`: string (required)
  - `reason`: string (required)
  - `points`: number (required, positive)
- **Validations**:
  - Target user in actor's dormitory (if dormitory head)
  - Reason not empty
  - Points > 0
- **Side Effects**:
  - Creates PointDeduction entity
  - Updates user points (min 0)
  - Links deduction to creator
- **Test Cases**: TC006, TC011, TC012, TC018

#### 6. RequestUserRemoval
- **Purpose**: Request removal of a problematic resident
- **Actors**: Dormitory Head only
- **Preconditions**:
  - User is dormitory head
  - Target has ≤20 points
  - No pending request for target
- **Input Parameters**:
  - `userId`: string (required)
  - `reason`: string (required)
- **Validations**:
  - Actor is dormitory head
  - Target in actor's dormitory
  - Target points ≤ 20
  - No existing pending request for target
  - Reason not empty
- **Side Effects**:
  - Creates RemovalRequest entity
  - Links to dormitory and users
- **Test Cases**: TC007, TC014, TC016

### User Interactions

#### 7. ViewMyStatus
- **Purpose**: View own profile and status
- **Actors**: All authenticated users
- **Preconditions**:
  - User is authenticated
- **Input Parameters**: None (uses current user context)
- **Returns**:
  - User profile (name, email, points)
  - Current bed assignment (if any)
  - Point deduction history
  - Dormitory head status (if applicable)
- **Test Cases**: TC013

#### 8. ViewDormitoryInfo
- **Purpose**: View dormitory details and residents
- **Actors**: All users assigned to dormitory
- **Preconditions**:
  - User is authenticated
  - User has bed assignment in dormitory
- **Input Parameters**: None (uses user's dormitory)
- **Returns**:
  - Dormitory details (name, capacity)
  - Current residents list
  - Dormitory head information
  - Occupancy statistics
- **Test Cases**: TC020

---

## Interaction Flow Diagrams

### User Removal Flow
```
1. Dormitory Head: DeductPoints (multiple times)
   ↓
2. User points drop to ≤20
   ↓
3. Dormitory Head: RequestUserRemoval
   ↓
4. Admin: ProcessRemovalRequest
   ↓
5. If approved: User removed from bed
   If rejected: User remains
```

### Dormitory Setup Flow
```
1. Admin: CreateDormitory
   ↓
2. Admin: AssignDormitoryHead
   ↓
3. Admin: AssignUserToBed (multiple users)
   ↓
4. System ready for operations
```

---

## Coverage Analysis

### Entity Coverage
| Entity | Create | Read | Update | Delete | Interactions |
|--------|--------|------|--------|--------|--------------|
| User | External | ✅ | ✅ | Soft | DeductPoints, ViewMyStatus |
| Dormitory | ✅ | ✅ | ❌ | Soft | CreateDormitory, ViewDormitoryInfo |
| BedAssignment | ✅ | ✅ | ✅ | No | AssignUserToBed, ProcessRemovalRequest |
| PointDeduction | ✅ | ✅ | ❌ | No | DeductPoints |
| RemovalRequest | ✅ | ✅ | ✅ | No | RequestUserRemoval, ProcessRemovalRequest |
| AdminComment | ✅ | ✅ | ❌ | No | ProcessRemovalRequest |

### Relation Coverage
| Relation | Managed By | Test Coverage |
|----------|------------|---------------|
| DormitoryHeadRelation | AssignDormitoryHead | TC003, TC017 |
| UserBedAssignmentRelation | AssignUserToBed | TC004, TC005 |
| DormitoryBedAssignmentRelation | AssignUserToBed | TC004, TC015 |
| UserPointDeductionRelation | DeductPoints | TC006 |
| CreatorPointDeductionRelation | DeductPoints | TC006 |
| RemovalRequestUserRelation | RequestUserRemoval | TC007 |
| RemovalRequestCreatorRelation | RequestUserRemoval | TC007 |
| RemovalRequestDormitoryRelation | RequestUserRemoval | TC007 |
| RemovalRequestAdminCommentRelation | ProcessRemovalRequest | TC008, TC009 |
| AdminCommentAuthorRelation | ProcessRemovalRequest | TC008, TC009 |

---

## Security Matrix

| Interaction | Authentication | Authorization | Scope Limitation |
|------------|---------------|---------------|------------------|
| CreateDormitory | Required | Admin only | System-wide |
| AssignDormitoryHead | Required | Admin only | System-wide |
| AssignUserToBed | Required | Admin only | System-wide |
| DeductPoints | Required | Admin or Dorm Head | Dormitory-scoped |
| RequestUserRemoval | Required | Dorm Head only | Dormitory-scoped |
| ProcessRemovalRequest | Required | Admin only | System-wide |
| ViewMyStatus | Required | Self only | User-scoped |
| ViewDormitoryInfo | Required | Dormitory members | Dormitory-scoped |

---

## Business Rule Enforcement

### Critical Business Rules by Interaction

| Rule | Enforced In | Validation Type |
|------|------------|-----------------|
| Bed count 4-6 | CreateDormitory | Input validation |
| Single bed assignment | AssignUserToBed | State validation |
| Single dormitory head role | AssignDormitoryHead | State validation |
| Points ≥ 0 | DeductPoints | Computation logic |
| Removal threshold ≤20 points | RequestUserRemoval | State validation |
| No duplicate pending requests | RequestUserRemoval | State validation |
| Bed capacity limits | AssignUserToBed | Input + State validation |
| Dormitory scope for heads | DeductPoints, RequestUserRemoval | Authorization check |

---

## Implementation Priority

### Phase 1: Core Setup (Admin Functions)
1. CreateDormitory
2. AssignDormitoryHead
3. AssignUserToBed

### Phase 2: Management Functions
4. DeductPoints
5. RequestUserRemoval
6. ProcessRemovalRequest

### Phase 3: View Functions
7. ViewMyStatus
8. ViewDormitoryInfo

---

## Validation Checklist

✅ Every user role has necessary interactions
✅ Every interaction has defined permissions
✅ Every interaction has test cases
✅ All entities are covered by interactions
✅ All relations are properly managed
✅ Business rules are enforced at interaction level
✅ No direct storage access outside interactions
✅ Computed properties update automatically
✅ Audit trail maintained for all changes
✅ Security boundaries properly defined