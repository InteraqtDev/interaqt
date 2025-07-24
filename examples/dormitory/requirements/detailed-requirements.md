# Detailed Requirements Analysis - Dormitory Management System

## Overview
This document provides a comprehensive analysis of the dormitory management system requirements from both data and interaction perspectives.

## Data Perspective Analysis

### Entities

#### 1. User
- **Purpose**: Represents all system users including admins, dormitory heads, and regular students
- **Properties**:
  - id: string (system-generated)
  - name: string (user's display name)
  - email: string (unique identifier for login)
  - role: string ('admin' | 'dormHead' | 'student')
  - points: number (behavior points, default: 100)
  - status: string ('active' | 'kickedOut', default: 'active')

#### 2. Dormitory
- **Purpose**: Represents dormitory buildings/rooms
- **Properties**:
  - id: string (system-generated)
  - name: string (dormitory name/number)
  - capacity: number (4-6 beds)
  - floor: number (optional, for better organization)
  - building: string (optional, building name)

#### 3. Bed
- **Purpose**: Represents individual bed assignments within a dormitory
- **Properties**:
  - id: string (system-generated)
  - bedNumber: number (1 to capacity)
  - status: string ('available' | 'occupied')

#### 4. PointDeduction
- **Purpose**: Records of point deductions for user behaviors
- **Properties**:
  - id: string (system-generated)
  - reason: string (description of the violation)
  - points: number (points deducted, positive number)
  - timestamp: number (when the deduction occurred)
  - recordedBy: string (who recorded this deduction)

#### 5. KickOutApplication
- **Purpose**: Applications from dormitory heads to kick out users
- **Properties**:
  - id: string (system-generated)
  - reason: string (detailed reason for kick-out request)
  - status: string ('pending' | 'approved' | 'rejected')
  - applicationTime: number (timestamp)
  - processedTime: number (timestamp, optional)
  - processedBy: string (admin who processed, optional)

### Relations

#### 1. UserDormHeadRelation
- **Type**: n:1 (many dormitories can have one head, but typically one head manages one dormitory)
- **Source**: Dormitory
- **Target**: User (with role='dormHead')
- **Source Property**: dormHead
- **Target Property**: managedDormitories

#### 2. UserBedRelation
- **Type**: 1:1 (one user to one bed)
- **Source**: User
- **Target**: Bed
- **Source Property**: bed
- **Target Property**: occupant
- **Properties**:
  - assignedAt: number (timestamp)
  - assignedBy: string (admin who made the assignment)

#### 3. DormitoryBedRelation
- **Type**: 1:n (one dormitory has many beds)
- **Source**: Dormitory
- **Target**: Bed
- **Source Property**: beds
- **Target Property**: dormitory

#### 4. UserPointDeductionRelation
- **Type**: 1:n (one user can have many deductions)
- **Source**: User
- **Target**: PointDeduction
- **Source Property**: pointDeductions
- **Target Property**: user

#### 5. KickOutApplicationUserRelation
- **Type**: n:1 (many applications can target one user)
- **Source**: KickOutApplication
- **Target**: User (the user to be kicked out)
- **Source Property**: targetUser
- **Target Property**: kickOutApplications

#### 6. KickOutApplicationApplicantRelation
- **Type**: n:1 (many applications from one dormitory head)
- **Source**: KickOutApplication
- **Target**: User (the dormitory head applying)
- **Source Property**: applicant
- **Target Property**: submittedApplications

### Computed Properties

#### User Entity Computations:
1. **totalDeductions**: Sum of all point deductions
2. **currentPoints**: 100 - totalDeductions
3. **dormitory**: Derived from bed.dormitory relation
4. **isDormHead**: Computed based on managedDormitories.length > 0

#### Dormitory Entity Computations:
1. **occupiedBeds**: Count of beds with status='occupied'
2. **availableBeds**: capacity - occupiedBeds
3. **occupancyRate**: (occupiedBeds / capacity) * 100
4. **residents**: Users who have beds in this dormitory

## Interaction Perspective Analysis

### User Operations by Role

#### Admin Operations:
1. **CreateDormitory**: Create new dormitories with specified capacity
2. **AssignDormHead**: Assign a user as dormitory head
3. **RemoveDormHead**: Remove dormitory head assignment
4. **AssignUserToBed**: Assign a student to a specific bed
5. **RemoveUserFromBed**: Remove a student from their bed
6. **ProcessKickOutApplication**: Approve or reject kick-out applications
7. **ViewAllDormitories**: View all dormitories and their status
8. **ViewAllUsers**: View all users and their assignments

#### Dormitory Head Operations:
1. **RecordPointDeduction**: Record behavior violations and deduct points
2. **SubmitKickOutApplication**: Apply to kick out a user when points are low
3. **ViewDormitoryResidents**: View all residents in managed dormitory
4. **ViewUserPoints**: View point status of residents

#### Student Operations:
1. **ViewMyDormitory**: View assigned dormitory and bed
2. **ViewMyPoints**: View current points and deduction history
3. **ViewMyRoommates**: View other residents in the same dormitory

### Business Rules

1. **Dormitory Capacity**: Must be between 4-6 beds
2. **Bed Assignment**: 
   - User can only be assigned to one bed
   - Bed can only have one occupant
   - Cannot assign to occupied bed
3. **Point System**:
   - Users start with 100 points
   - Points cannot go below 0
   - Only dormitory heads can deduct points from their residents
4. **Kick-Out Process**:
   - Only dormitory head can submit application
   - Can only submit for residents in their dormitory
   - Typically when user points < 30 (configurable threshold)
   - Only admin can approve/reject
   - Once approved, user status changes to 'kickedOut' and bed becomes available
5. **Role Hierarchy**:
   - Admin has all permissions
   - Dormitory head can only manage their assigned dormitory
   - Students can only view their own information

### State Transitions

#### User Status:
- active → kickedOut (when kick-out application approved)

#### Bed Status:
- available → occupied (when user assigned)
- occupied → available (when user removed or kicked out)

#### KickOutApplication Status:
- pending → approved (by admin)
- pending → rejected (by admin)

## Security and Permission Requirements

### Authentication:
- System assumes users are already authenticated (external auth system)
- Users are identified by their email

### Authorization Matrix:
| Operation | Admin | Dorm Head | Student |
|-----------|-------|-----------|---------|
| Create Dormitory | ✓ | ✗ | ✗ |
| Assign Dorm Head | ✓ | ✗ | ✗ |
| Assign User to Bed | ✓ | ✗ | ✗ |
| Record Point Deduction | ✗ | ✓ (own dorm) | ✗ |
| Submit Kick-Out Application | ✗ | ✓ (own dorm) | ✗ |
| Process Kick-Out Application | ✓ | ✗ | ✗ |
| View All Dormitories | ✓ | ✗ | ✗ |
| View Dormitory Residents | ✓ | ✓ (own dorm) | ✓ (own dorm) |
| View User Points | ✓ | ✓ (own dorm residents) | ✓ (self) |

## Data Validation Requirements

1. **Email**: Must be valid email format
2. **Name**: Non-empty string
3. **Capacity**: Integer between 4 and 6
4. **Points Deduction**: Positive number
5. **Bed Number**: Between 1 and dormitory capacity
6. **Reasons**: Non-empty strings for deductions and applications 