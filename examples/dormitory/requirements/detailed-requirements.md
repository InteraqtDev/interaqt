# Dormitory Management System - Detailed Requirements

## Overview
This document provides a comprehensive analysis of the dormitory management system requirements, expanding on the initial specifications with detailed implementation considerations.

## Entity Analysis

### 1. User
- **Purpose**: System users who can have different roles and be assigned to dormitories
- **Properties**:
  - Basic information (name, email, phone)
  - Role (admin, dormHead, student)
  - Violation score (starts at 0, increases with violations)
  - Status (active, suspended, kickedOut)

### 2. Dormitory
- **Purpose**: Physical dormitory units that house students
- **Properties**:
  - Name/Number
  - Total capacity (4-6 beds)
  - Current occupancy count
  - Status (active, full, inactive)

### 3. Bed
- **Purpose**: Individual bed units within a dormitory
- **Properties**:
  - Bed number/identifier
  - Status (vacant, occupied)
  - Associated dormitory

### 4. ViolationRule
- **Purpose**: Define rules and their associated penalty points
- **Properties**:
  - Rule name
  - Description
  - Penalty points
  - Category (hygiene, noise, safety, etc.)

### 5. ViolationRecord
- **Purpose**: Track violations committed by users
- **Properties**:
  - Timestamp
  - Description
  - Points deducted
  - Status (active, appealed, revoked)

### 6. KickoutRequest
- **Purpose**: Requests from dorm heads to remove problematic residents
- **Properties**:
  - Reason
  - Request date
  - Status (pending, approved, rejected)
  - Admin comments

## Relationship Analysis

### 1. User-Dormitory Assignment
- Users are assigned to specific beds in dormitories
- One user can only occupy one bed at a time
- Historical assignments should be tracked

### 2. Dormitory-DormHead
- Each dormitory has one designated dorm head
- Dorm heads are special users with management privileges

### 3. User-Violations
- Users accumulate violation records
- Total violation score is computed from all active violations

### 4. KickoutRequest Relationships
- Initiated by dorm head
- Targets a specific user
- Reviewed by admin

## Interaction Analysis

### Administrative Operations
1. **CreateDormitory**: Admin creates new dormitory units
2. **AssignDormHead**: Admin designates a user as dorm head
3. **ApproveKickoutRequest**: Admin reviews and approves/rejects kickout requests
4. **CreateViolationRule**: Admin defines violation rules and penalties

### Dorm Head Operations
1. **RecordViolation**: Dorm head records rule violations for residents
2. **RequestKickout**: Dorm head initiates removal request for problematic residents
3. **ViewDormitoryStatus**: View occupancy and resident information

### User Assignment Operations
1. **AssignUserToBed**: Admin assigns a user to a specific bed
2. **RemoveUserFromBed**: Remove user from their current bed assignment
3. **TransferUser**: Move user from one bed to another

### Query Operations
1. **GetDormitoryOccupancy**: Check available beds in dormitories
2. **GetUserViolationHistory**: View violation records for a user
3. **GetPendingKickoutRequests**: Admin views pending requests

## Business Rules

### Capacity Management
- Dormitories must have between 4 and 6 beds
- Cannot assign users to occupied beds
- Cannot exceed dormitory capacity

### Role-Based Access Control
- Only admins can create dormitories and approve kickout requests
- Only admins can assign dorm heads
- Dorm heads can only manage their assigned dormitory
- Dorm heads cannot record violations for themselves

### Violation and Kickout Rules
- Violation points accumulate over time
- Kickout requests require justification
- Kicked out users cannot be reassigned without admin approval
- Violation threshold for kickout eligibility (e.g., 100 points)

### Assignment Rules
- Users can only be assigned to one bed at a time
- Previous bed must be freed when reassigning
- Cannot assign suspended or kicked out users

## State Management

### User States
- **active**: Normal user status
- **suspended**: Temporarily restricted (high violations)
- **kickedOut**: Removed from dormitory

### Bed States
- **vacant**: Available for assignment
- **occupied**: Currently assigned to a user

### KickoutRequest States
- **pending**: Awaiting admin review
- **approved**: Admin approved the removal
- **rejected**: Admin denied the request

## Computed Properties

### User
- `totalViolationPoints`: Sum of all active violation records
- `isEligibleForKickout`: Whether violation score exceeds threshold
- `currentBed`: Current bed assignment (if any)

### Dormitory
- `occupancyRate`: Current occupancy / total capacity
- `availableBeds`: List of vacant beds
- `isFull`: Whether all beds are occupied

### Bed
- `occupant`: Current user assigned to this bed
- `dormitoryInfo`: Parent dormitory details

## Permission Matrix

| Interaction | Admin | DormHead | Student |
|------------|-------|----------|---------|
| CreateDormitory | ✓ | ✗ | ✗ |
| AssignDormHead | ✓ | ✗ | ✗ |
| AssignUserToBed | ✓ | ✗ | ✗ |
| RecordViolation | ✗ | ✓* | ✗ |
| RequestKickout | ✗ | ✓* | ✗ |
| ApproveKickoutRequest | ✓ | ✗ | ✗ |
| ViewDormitoryStatus | ✓ | ✓* | ✓** |

\* Only for their assigned dormitory
\** Only for their own dormitory

## Data Validation Requirements

### Input Validation
- Email must be valid format
- Dormitory capacity must be 4-6
- Violation points must be positive integers
- Bed numbers must be unique within dormitory

### Business Logic Validation
- Cannot create duplicate dormitories
- Cannot assign non-existent users
- Cannot record violations for non-residents
- Cannot approve already processed kickout requests