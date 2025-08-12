# Interaction Design - Dormitory Management System

## Overview
This document defines all interactions for the dormitory management system, organized by user role and purpose. Following the progressive implementation approach, interactions are designed for Stage 1 (core business logic) first, with Stage 2 enhancements (permissions and business rules) documented but not initially implemented.

## Administrative Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory room with beds
- **Actor**: Admin
- **Action Name**: 'createDormitory'
- **Payload Fields**:
  - name: string (required) - Dormitory identifier
  - capacity: number (required) - Number of beds (4-6)
  - floor: number (required) - Floor number
  - building: string (required) - Building identifier
- **Effects**:
  - Creates new Dormitory entity with status='active'
  - Automatically creates Bed entities based on capacity
  - Creates DormitoryBedRelation for each bed
  - Beds initialized with status='vacant'
- **Stage 2 - Permission Requirements**: 
  - User must have role='admin'
- **Stage 2 - Business Rules**:
  - Capacity must be between 4 and 6
  - Name must be unique in the system

### AppointDormHead
- **Purpose**: Appoint a student as dormitory head
- **Actor**: Admin
- **Action Name**: 'appointDormHead'
- **Payload Fields**:
  - userId: string (required) - ID of user to appoint
  - dormitoryId: string (required) - ID of dormitory to manage
- **Effects**:
  - Updates user.role from 'student' to 'dormHead'
  - Creates DormitoryDormHeadRelation
  - Sets appointedAt timestamp
  - Records appointedBy (admin name)
- **Stage 2 - Permission Requirements**:
  - User must have role='admin'
- **Stage 2 - Business Rules**:
  - Target user must currently have role='student'
  - Dormitory must not have an existing dormHead
  - User cannot already be managing another dormitory

### AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory and specific bed
- **Actor**: Admin
- **Action Name**: 'assignUserToDormitory'
- **Payload Fields**:
  - userId: string (required) - ID of user to assign
  - dormitoryId: string (required) - ID of target dormitory
  - bedId: string (required) - ID of specific bed
- **Effects**:
  - Creates UserDormitoryRelation
  - Creates UserBedRelation
  - Updates bed.status from 'vacant' to 'occupied'
  - Sets assignedAt timestamp
  - Records assignedBy (admin name)
  - Updates dormitory occupancy count (computed)
- **Stage 2 - Permission Requirements**:
  - User must have role='admin'
- **Stage 2 - Business Rules**:
  - User must not already be assigned to any dormitory
  - Bed must have status='vacant'
  - Bed must belong to the specified dormitory
  - User must not have status='evicted'

### ReviewEvictionRequest
- **Purpose**: Approve or reject an eviction request
- **Actor**: Admin
- **Action Name**: 'reviewEvictionRequest'
- **Payload Fields**:
  - requestId: string (required) - ID of eviction request
  - decision: string (required) - 'approve' or 'reject'
  - adminNotes: string (optional) - Decision explanation
- **Effects on Approval**:
  - Updates evictionRequest.status to 'approved'
  - Updates user.status to 'evicted'
  - Sets user.evictedAt timestamp
  - Deletes UserDormitoryRelation
  - Deletes UserBedRelation
  - Updates bed.status to 'vacant'
  - Updates dormitory occupancy (computed)
  - Sets decidedAt timestamp
- **Effects on Rejection**:
  - Updates evictionRequest.status to 'rejected'
  - User remains in dormitory
  - Sets decidedAt timestamp
  - Records adminNotes
- **Stage 2 - Permission Requirements**:
  - User must have role='admin'
- **Stage 2 - Business Rules**:
  - Request must have status='pending'

## Dormitory Management Interactions

### RecordViolation
- **Purpose**: Record a violation for a resident student
- **Actor**: DormHead
- **Action Name**: 'recordViolation'
- **Payload Fields**:
  - userId: string (required) - ID of violating user
  - description: string (required) - Violation details
  - points: number (required) - Points to deduct
  - category: string (required) - hygiene/noise/curfew/damage/other
- **Effects**:
  - Creates ViolationRecord entity
  - Creates UserViolationRelation
  - Updates user.points (computed as 100 - sum of violations)
  - Sets createdAt timestamp
  - Records recordedBy (dormHead name)
- **Stage 2 - Permission Requirements**:
  - User must have role='dormHead'
  - Target user must be in dormHead's managed dormitory
- **Stage 2 - Business Rules**:
  - Points must be positive number
  - Target user must not have status='evicted'
  - Points cannot reduce user below 0

### SubmitEvictionRequest
- **Purpose**: Request eviction of a problematic resident
- **Actor**: DormHead
- **Action Name**: 'submitEvictionRequest'
- **Payload Fields**:
  - userId: string (required) - ID of user to evict
  - reason: string (required) - Detailed eviction reason
- **Effects**:
  - Creates EvictionRequest entity with status='pending'
  - Creates UserEvictionRequestRelation
  - Creates DormHeadEvictionRequestRelation
  - Sets requestedAt timestamp
- **Stage 2 - Permission Requirements**:
  - User must have role='dormHead'
  - Target user must be in dormHead's managed dormitory
- **Stage 2 - Business Rules**:
  - Target user must have points < 60
  - No pending eviction request for the same user

## Query Interactions

### ViewMyDormitory
- **Purpose**: View assigned dormitory information
- **Actor**: Student/DormHead/Admin
- **Action Name**: 'viewMyDormitory'
- **Payload Fields**:
  - userId: string (optional) - For admin to view any user's dormitory
- **Query Returns**:
  - User's assigned dormitory details
  - Bed assignment information
  - List of roommates (other users in same dormitory)
  - Dormitory head information
- **Stage 2 - Permission Requirements**:
  - Students can only view their own dormitory
  - DormHeads can view their own dormitory
  - Admins can view any user's dormitory

### ViewMyViolations
- **Purpose**: View violation history and current points
- **Actor**: Student/DormHead/Admin
- **Action Name**: 'viewMyViolations'
- **Payload Fields**:
  - userId: string (optional) - For admin to view any user's violations
- **Query Returns**:
  - List of all violation records
  - Current points (100 - sum of violations)
  - Violation categories breakdown
  - Eligibility for eviction status
- **Stage 2 - Permission Requirements**:
  - Students can only view their own violations
  - DormHeads can view their own violations
  - Admins can view any user's violations

### ViewMyEvictionStatus
- **Purpose**: Check eviction request status
- **Actor**: Student/DormHead/Admin
- **Action Name**: 'viewMyEvictionStatus'
- **Payload Fields**:
  - userId: string (optional) - For admin to view any user's status
- **Query Returns**:
  - Pending eviction requests
  - Approved/rejected eviction history
  - Current user status (active/evicted)
  - Eviction reasons and admin notes
- **Stage 2 - Permission Requirements**:
  - Students can only view their own status
  - DormHeads can view their own status
  - Admins can view any user's status

## Interaction Flow Diagrams

### Complete Assignment Flow
```
1. Admin → CreateDormitory
   - Creates dormitory with beds
   
2. Admin → AppointDormHead
   - Assigns dormHead to manage dormitory
   
3. Admin → AssignUserToDormitory
   - Assigns students to beds
```

### Violation and Eviction Flow
```
1. DormHead → RecordViolation (multiple times)
   - User points decrease
   
2. When points < 60:
   DormHead → SubmitEvictionRequest
   - Creates pending request
   
3. Admin → ReviewEvictionRequest
   - Approves or rejects
   - If approved, user evicted and bed freed
```

## Implementation Priority

### Stage 1 - Core Business Logic (Implement First)
All interactions without conditions:
1. CreateDormitory - Basic dormitory creation
2. AppointDormHead - Role assignment
3. AssignUserToDormitory - Bed assignment
4. RecordViolation - Violation tracking
5. SubmitEvictionRequest - Request creation
6. ReviewEvictionRequest - Decision handling
7. ViewMyDormitory - Query dormitory info
8. ViewMyViolations - Query violations
9. ViewMyEvictionStatus - Query eviction status

### Stage 2A - Add Permissions (After Stage 1 Works)
Add condition for role-based access:
- Admin-only interactions
- DormHead restrictions to their dormitory
- Student view restrictions

### Stage 2B - Add Business Rules (After Stage 1 Works)
Add condition for business validations:
- Capacity limits (4-6)
- Assignment uniqueness
- Point thresholds (< 60 for eviction)
- Status checks (pending, evicted)

## Payload Validation Rules

### Required Fields
- All entity IDs when referencing existing entities
- All descriptive fields (names, reasons, descriptions)
- Decision fields (approve/reject)
- Numeric values (points, capacity)

### Optional Fields
- Admin notes
- Query filters
- Timestamps (auto-generated)

### Field Types
- IDs: string
- Names/Descriptions: string
- Points/Capacity: number
- Timestamps: number (Unix seconds)
- Status/Role: string (from defined enums)

## Error Handling Strategy

### Stage 1 Errors (Basic Validation)
- Missing required fields
- Invalid field types
- Entity not found

### Stage 2A Errors (Permission Denied)
- Insufficient role permissions
- Cross-dormitory access attempt
- Unauthorized view access

### Stage 2B Errors (Business Rule Violations)
- Capacity exceeded
- Already assigned
- Insufficient eviction grounds
- Invalid state transitions

## Testing Considerations

### Stage 1 Tests
- Create all entities successfully
- Perform all assignments
- Record violations
- Submit and review requests
- Query all information

### Stage 2 Tests
- Permission denials
- Business rule violations
- Edge cases and boundaries
- Complex scenarios

## Summary

This design provides 9 core interactions covering:
- 4 administrative operations
- 2 dormitory management operations
- 3 query operations

Each interaction is:
- Clearly defined with purpose and effects
- Properly structured with required/optional fields
- Documented for both Stage 1 and Stage 2 implementation
- Linked to test cases from requirements

The progressive approach ensures:
1. Core functionality works first
2. Permissions added systematically
3. Business rules enforced consistently
4. Complete test coverage at each stage
