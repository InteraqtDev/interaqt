# Interaction Design

## Overview
This document outlines all interactions in the dormitory management system, including their purposes, payloads, effects, and future permission/business rule requirements.

## Core Business Logic Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory with beds
- **Payload**:
  - name: string (required) - Unique dormitory name like "A栋101"
  - capacity: number (required) - Number of beds (4-6)
  - floor: number (optional) - Floor number
  - building: string (optional) - Building name
- **Effects**:
  - Creates new Dormitory entity
  - Automatically creates {capacity} number of Bed entities
  - Creates DormitoryBedRelation for each bed
  - Initializes dormitory status as 'available'
  - Each bed initialized with status 'vacant'
  - Bed numbers auto-generated as "1号床", "2号床", etc.
- **Stage 2 - Permissions**: Only admin can create (user.role === 'admin')
- **Stage 2 - Business Rules**: 
  - Capacity must be between 4-6
  - Name must be unique

### AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory bed
- **Payload**:
  - userId: string (required) - ID of user to assign
  - dormitoryId: string (required) - ID of target dormitory
  - bedId: string (required) - ID of specific bed
- **Effects**:
  - Creates UserDormitoryRelation
  - Creates UserBedRelation
  - Updates Bed.status to 'occupied'
  - Updates Dormitory.occupancy (computed)
  - Updates Dormitory.status to 'full' if at capacity
  - Records assignedAt timestamp
- **Stage 2 - Permissions**: Only admin can assign (user.role === 'admin')
- **Stage 2 - Business Rules**:
  - User must not already have a dormitory assignment
  - Bed must be vacant
  - Dormitory must not be full
  - Bed must belong to the specified dormitory

### AppointDormHead
- **Purpose**: Appoint a user as dormitory head
- **Payload**:
  - userId: string (required) - User to appoint
  - dormitoryId: string (required) - Dormitory they will manage
- **Effects**:
  - Updates User.role to 'dormHead'
  - Creates DormitoryDormHeadRelation
  - Records appointedAt timestamp
- **Stage 2 - Permissions**: Only admin can appoint (user.role === 'admin')
- **Stage 2 - Business Rules**:
  - User must be a member of the target dormitory
  - Dormitory should not already have a head (or need to remove existing first)

### RecordPointDeduction
- **Purpose**: Record a point deduction for violations
- **Payload**:
  - targetUserId: string (required) - User being penalized
  - reason: string (required) - Explanation of violation
  - points: number (required) - Points to deduct (positive number)
  - category: string (required) - Category ('hygiene' | 'noise' | 'lateness' | 'damage' | 'other')
  - occurredAt: datetime (optional) - When violation occurred (defaults to now)
- **Effects**:
  - Creates PointDeduction entity
  - Creates UserPointDeductionRelation
  - Creates PointDeductionRecorderRelation (linking to current user)
  - Updates User.points (decreases by deduction amount)
  - Updates User.totalDeductions (computed)
  - Updates User.deductionCount (computed)
  - Records recordedAt timestamp
- **Stage 2 - Permissions**: 
  - Admin can deduct from any user
  - DormHead can only deduct from users in their dormitory
- **Stage 2 - Business Rules**:
  - Points must be positive number
  - Target user must exist
  - If dormHead, target must be in same dormitory
  - User points cannot go below 0 (minimum is 0)

### RequestEviction
- **Purpose**: Request to evict a problematic resident
- **Payload**:
  - targetUserId: string (required) - User to evict
  - reason: string (required) - Detailed justification
- **Effects**:
  - Creates EvictionRequest entity with status 'pending'
  - Creates EvictionRequestTargetUserRelation
  - Creates EvictionRequestRequesterRelation (linking to current user)
  - Captures current user points as totalPoints
  - Records requestedAt timestamp
- **Stage 2 - Permissions**: Only dormHead can request (user.role === 'dormHead')
- **Stage 2 - Business Rules**:
  - Target user must be in requester's dormitory
  - Target user points must be below 30
  - No existing pending request for same user

### ApproveEviction
- **Purpose**: Admin approves an eviction request
- **Payload**:
  - requestId: string (required) - Request to approve
  - adminComment: string (optional) - Admin notes on decision
- **Effects**:
  - Updates EvictionRequest.status to 'approved'
  - Updates EvictionRequest.processedAt to current timestamp
  - Sets EvictionRequest.adminComment
  - Creates EvictionRequestApproverRelation
  - Updates target User.status to 'inactive'
  - Deletes UserDormitoryRelation
  - Deletes UserBedRelation
  - Updates Bed.status to 'vacant'
  - Updates Dormitory.occupancy (computed)
  - Updates Dormitory.status to 'available' if was 'full'
- **Stage 2 - Permissions**: Only admin can approve (user.role === 'admin')
- **Stage 2 - Business Rules**:
  - Request must be in 'pending' status
  - Request cannot be already processed

### RejectEviction
- **Purpose**: Admin rejects an eviction request
- **Payload**:
  - requestId: string (required) - Request to reject
  - adminComment: string (optional) - Reason for rejection
- **Effects**:
  - Updates EvictionRequest.status to 'rejected'
  - Updates EvictionRequest.processedAt to current timestamp
  - Sets EvictionRequest.adminComment
  - Creates EvictionRequestApproverRelation
  - User remains in dormitory (no changes to relations)
- **Stage 2 - Permissions**: Only admin can reject (user.role === 'admin')
- **Stage 2 - Business Rules**:
  - Request must be in 'pending' status
  - Request cannot be already processed

## Query Interactions

### ViewMyDormitory
- **Purpose**: View current user's dormitory information
- **Payload**: None (uses current user context)
- **Effects**: None (read-only query)
- **Returns**:
  - Dormitory details (name, building, floor)
  - Assigned bed information
  - List of roommates
  - Dormitory head information
- **Stage 2 - Permissions**: Any logged-in user
- **Stage 2 - Business Rules**: User must have dormitory assignment

### ViewMyPoints
- **Purpose**: View current user's points and deduction history
- **Payload**: None (uses current user context)
- **Effects**: None (read-only query)
- **Returns**:
  - Current points balance
  - Total deductions
  - Deduction count
  - List of all deduction records with:
    - Reason, points, category
    - When occurred and recorded
    - Who recorded it
- **Stage 2 - Permissions**: Any logged-in user
- **Stage 2 - Business Rules**: None

### ViewDormitoryMembers
- **Purpose**: View members of a dormitory
- **Payload**:
  - dormitoryId: string (optional) - If not provided, uses user's dormitory
- **Effects**: None (read-only query)
- **Returns**:
  - List of all residents with:
    - Name, email, phone
    - Current points
    - Bed assignment
    - Role (if dormHead)
- **Stage 2 - Permissions**:
  - Users can only view their own dormitory
  - DormHeads can view their managed dormitory
  - Admins can view any dormitory
- **Stage 2 - Business Rules**: Dormitory must exist

### ViewAllDormitories
- **Purpose**: View all dormitories in the system
- **Payload**: None
- **Effects**: None (read-only query)
- **Returns**:
  - List of all dormitories with:
    - Name, building, floor
    - Capacity and current occupancy
    - Available beds count
    - Status (available/full/maintenance)
    - Dormitory head information
- **Stage 2 - Permissions**: Only admin can view all (user.role === 'admin')
- **Stage 2 - Business Rules**: None

## Implementation Phases

### Phase 1: Core Business Logic (Current Phase)
Focus on implementing all interactions without conditions:
- All CRUD operations work without permission checks
- Basic payload validation only
- Test core functionality

### Phase 2: Permissions Implementation
Add permission conditions to interactions:
- Role-based access control
- Scope limitations (e.g., dormHead only affects own dormitory)
- User context validation

### Phase 3: Business Rules Implementation
Add business rule validations:
- Capacity constraints
- Point thresholds
- State validations
- Duplicate prevention
- Data integrity rules

## Summary Statistics

### Total Interactions: 11
- **Management Operations**: 7
  - CreateDormitory
  - AssignUserToDormitory
  - AppointDormHead
  - RecordPointDeduction
  - RequestEviction
  - ApproveEviction
  - RejectEviction

- **Query Operations**: 4
  - ViewMyDormitory
  - ViewMyPoints
  - ViewDormitoryMembers
  - ViewAllDormitories

### By Role Access
- **Admin Only**: 5 interactions
- **DormHead**: 2 interactions (plus queries)
- **Regular User**: 3 query interactions

### Entity Impact
- **User**: Modified by 3 interactions
- **Dormitory**: Modified by 1 interaction
- **Bed**: Modified by 2 interactions
- **PointDeduction**: Created by 1 interaction
- **EvictionRequest**: Created/modified by 3 interactions
