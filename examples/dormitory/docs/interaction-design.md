# Interaction Design

## Overview
This document defines all interactions for the dormitory management system, organized by user role and purpose. For Stage 1, we focus on core business logic without permissions or business rules.

## Admin Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory with specified capacity
- **Action**: createDormitory
- **Payload**:
  - name: string (required) - dormitory name/number
  - capacity: number (required) - number of beds (4-6)
  - floor: number - floor number
  - building: string - building name
- **Effects**:
  - Creates new Dormitory entity
  - Automatically creates Bed entities (1 to capacity)
  - All beds initialized with status='available'
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: Capacity must be between 4-6

### AssignDormHead
- **Purpose**: Assign a user as dormitory head
- **Action**: assignDormHead
- **Payload**:
  - userId: string (required) - user to assign as head
  - dormitoryId: string (required) - dormitory to manage
- **Effects**:
  - Updates user's role to 'dormHead'
  - Creates UserDormHeadRelation
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: None initially

### RemoveDormHead
- **Purpose**: Remove dormitory head assignment
- **Action**: removeDormHead
- **Payload**:
  - userId: string (required) - user to remove as head
- **Effects**:
  - Updates user's role back to 'student'
  - Removes UserDormHeadRelation
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: User must currently be a dormHead

### AssignUserToBed
- **Purpose**: Assign a student to a specific bed
- **Action**: assignUserToBed
- **Payload**:
  - userId: string (required) - user to assign
  - bedId: string (required) - bed to assign to
- **Effects**:
  - Creates UserBedRelation
  - Updates bed status to 'occupied'
  - Relation includes assignedAt timestamp and assignedBy
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: 
  - Bed must be available
  - User cannot already have a bed

### RemoveUserFromBed
- **Purpose**: Remove a student from their bed
- **Action**: removeUserFromBed
- **Payload**:
  - userId: string (required) - user to remove
- **Effects**:
  - Removes UserBedRelation
  - Updates bed status to 'available'
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: User must have a bed assignment

### ProcessKickOutApplication
- **Purpose**: Approve or reject a kick-out application
- **Action**: processKickOutApplication
- **Payload**:
  - applicationId: string (required) - application to process
  - decision: string (required) - 'approved' or 'rejected'
- **Effects**:
  - Updates application status to decision
  - Sets processedTime and processedBy
  - If approved:
    - Updates user status to 'kickedOut'
    - Removes UserBedRelation
    - Updates bed status to 'available'
- **Stage 2 - Permissions**: Only admin can process
- **Stage 2 - Business Rules**: Application must be 'pending'

## Dormitory Head Interactions

### RecordPointDeduction
- **Purpose**: Record behavior violations and deduct points
- **Action**: recordPointDeduction
- **Payload**:
  - userId: string (required) - user to deduct points from
  - reason: string (required) - description of violation
  - points: number (required) - points to deduct
- **Effects**:
  - Creates PointDeduction entity
  - Creates UserPointDeductionRelation
  - Records timestamp and recordedBy
- **Stage 2 - Permissions**: Only dormHead can record, only for residents in their dormitory
- **Stage 2 - Business Rules**: Points must be positive

### SubmitKickOutApplication
- **Purpose**: Apply to kick out a user with low points
- **Action**: submitKickOutApplication
- **Payload**:
  - userId: string (required) - user to kick out
  - reason: string (required) - detailed reason
- **Effects**:
  - Creates KickOutApplication entity with status='pending'
  - Creates KickOutApplicationUserRelation (target)
  - Creates KickOutApplicationApplicantRelation (applicant)
  - Records applicationTime
- **Stage 2 - Permissions**: Only dormHead can submit, only for residents in their dormitory
- **Stage 2 - Business Rules**: User must be in applicant's dormitory

## Query Interactions (All Roles)

### GetDormitoryInfo
- **Purpose**: Get information about a specific dormitory
- **Action**: getDormitoryInfo
- **Payload**:
  - dormitoryId: string (required)
- **Effects**: Read-only query
- **Stage 2 - Permissions**: 
  - Admin: can view any dormitory
  - DormHead: can view managed dormitory
  - Student: can view assigned dormitory

### GetUserInfo
- **Purpose**: Get information about a specific user
- **Action**: getUserInfo
- **Payload**:
  - userId: string (required)
- **Effects**: Read-only query
- **Stage 2 - Permissions**:
  - Admin: can view any user
  - DormHead: can view residents in their dormitory
  - Student: can view self only

### GetAvailableBeds
- **Purpose**: List available beds in a dormitory
- **Action**: getAvailableBeds
- **Payload**:
  - dormitoryId: string (optional) - filter by dormitory
- **Effects**: Read-only query
- **Stage 2 - Permissions**: Admin only

### GetPendingApplications
- **Purpose**: List pending kick-out applications
- **Action**: getPendingApplications
- **Payload**: None
- **Effects**: Read-only query
- **Stage 2 - Permissions**: Admin only

### GetPointDeductionHistory
- **Purpose**: Get point deduction history for a user
- **Action**: getPointDeductionHistory
- **Payload**:
  - userId: string (required)
- **Effects**: Read-only query
- **Stage 2 - Permissions**:
  - Admin: can view any user
  - DormHead: can view residents in their dormitory
  - Student: can view self only

## Data Flow Summary

### Core Business Flows

1. **Dormitory Setup Flow**:
   - CreateDormitory → Dormitory + Beds created
   - AssignDormHead → User role updated + relation created

2. **User Assignment Flow**:
   - AssignUserToBed → UserBedRelation created + bed occupied
   - User can now access dormitory via bed.dormitory

3. **Point Management Flow**:
   - RecordPointDeduction → PointDeduction created
   - User's totalDeductions and currentPoints auto-computed

4. **Kick-Out Process Flow**:
   - SubmitKickOutApplication → Application created (pending)
   - ProcessKickOutApplication → Application processed
   - If approved → User kicked out + bed freed

## Implementation Notes

1. **Stage 1 Focus**: Implement all interactions without conditions - focus on making the basic operations work correctly.

2. **ID References**: For Stage 1, use simple string IDs in payloads. The computations will handle entity lookups.

3. **Timestamps**: Use Date.now() for all timestamp fields in the implementation.

4. **Status Fields**: Ensure proper status values are used ('active'/'kickedOut' for users, 'available'/'occupied' for beds, 'pending'/'approved'/'rejected' for applications).

5. **Query Interactions**: While defined here for completeness, focus implementation on the modification interactions first.

6. **No Validation**: Stage 1 should not include any validation beyond basic required field checks. All business rule validations come in Stage 2. 