# Dormitory Management System - Detailed Requirements Analysis

## Business Context
The system requires a comprehensive dormitory management solution that handles:
- User management with role-based permissions
- Dormitory creation and capacity management
- User assignment to dormitories with bed allocation
- Behavior tracking and point deduction system
- User eviction process with approval workflow

## Data Perspective Analysis

### Entities

#### User
- **Purpose**: System users with different roles and permissions
- **Properties**:
  - id: string (system-generated unique identifier)
  - name: string (user's display name)
  - email: string (unique login identifier)
  - role: string (admin/dormHead/student)
  - status: string (active/evicted)
  - points: number (behavior points, starts at 100)
  - createdAt: number (timestamp of account creation)

#### Dormitory
- **Purpose**: Physical dormitory buildings with capacity management
- **Properties**:
  - id: string (system-generated unique identifier)
  - name: string (dormitory name/number)
  - capacity: number (4-6 beds per dormitory)
  - status: string (active/full)
  - createdAt: number (timestamp of creation)

#### Bed
- **Purpose**: Individual bed spaces within dormitories
- **Properties**:
  - id: string (system-generated unique identifier)
  - bedNumber: number (1-6 within the dormitory)
  - status: string (available/occupied)
  - dormitoryId: string (reference to parent dormitory)

#### PointDeduction
- **Purpose**: Track behavior violations and point deductions
- **Properties**:
  - id: string (system-generated unique identifier)
  - userId: string (user who committed violation)
  - reason: string (description of violation)
  - points: number (points deducted)
  - createdAt: number (timestamp of deduction)
  - recordedBy: string (who recorded the violation)

#### EvictionRequest
- **Purpose**: Track requests to evict users from dormitories
- **Properties**:
  - id: string (system-generated unique identifier)
  - userId: string (user to be evicted)
  - requestedBy: string (dorm head who made request)
  - reason: string (reason for eviction request)
  - status: string (pending/approved/rejected)
  - createdAt: number (timestamp of request)
  - processedAt: number (timestamp of admin decision)
  - processedBy: string (admin who processed request)

### Relations

#### UserDormitoryRelation
- **Type**: n:1 (many users to one dormitory)
- **Purpose**: Assigns students to dormitories
- **Source Property**: `dormitory` (on User entity)
- **Target Property**: `users` (on Dormitory entity)
- **Properties**:
  - assignedAt: number (timestamp of assignment)
  - assignedBy: string (who made the assignment)

#### UserBedRelation
- **Type**: 1:1 (one user to one bed)
- **Purpose**: Assigns specific bed to user
- **Source Property**: `bed` (on User entity)
- **Target Property**: `user` (on Bed entity)
- **Properties**:
  - assignedAt: number (timestamp of bed assignment)

#### DormitoryBedsRelation
- **Type**: 1:n (one dormitory to many beds)
- **Purpose**: Links beds to their dormitory
- **Source Property**: `beds` (on Dormitory entity)
- **Target Property**: `dormitory` (on Bed entity)

## Interaction Perspective Analysis

### User Management Operations
1. **Create User** - Admin creates new user accounts
2. **Update User Role** - Admin can assign/promote users to dorm head
3. **View Users** - Admin can view all users, dorm heads can view users in their dormitory

### Dormitory Management Operations
1. **Create Dormitory** - Admin creates new dormitories with specified capacity
2. **View Dormitories** - All users can view dormitory list and details
3. **Update Dormitory** - Admin can modify dormitory details

### Assignment Operations
1. **Assign User to Dormitory** - Admin assigns students to available dormitories
2. **Assign User to Bed** - Admin assigns specific bed within dormitory
3. **View Assignments** - Users can view their assignment, admin can view all

### Point System Operations
1. **Deduct Points** - Dorm heads can deduct points for rule violations
2. **View Points** - Users can view their points, admins can view all points
3. **View Point History** - Users can see their deduction history

### Eviction Process Operations
1. **Request Eviction** - Dorm heads can request eviction when points are low
2. **Approve Eviction** - Admin can approve eviction requests
3. **Reject Eviction** - Admin can reject eviction requests
4. **View Eviction Requests** - Admin can view all pending requests

## Permission Requirements

### Admin Permissions
- Full access to all operations
- Can create/update/delete dormitories
- Can assign users to dormitories and beds
- Can manage user roles
- Can approve/reject eviction requests
- Can view all system data

### Dorm Head Permissions
- Can view users in their dormitory
- Can deduct points from users in their dormitory
- Can request eviction of users with low points
- Can view dormitory details and assignments
- Cannot modify dormitory settings
- Cannot assign users to other dormitories

### Student Permissions
- Can view their own profile and assignments
- Can view their points and point history
- Can view available dormitories
- Cannot modify any system data
- Cannot view other users' private data

## Business Rules and Constraints

### Assignment Rules
- Each user can only be assigned to one dormitory
- Each user can only occupy one bed
- Dormitory capacity cannot be exceeded (4-6 users)
- Beds must exist within a dormitory
- Users cannot be assigned to full dormitories

### Point System Rules
- Users start with 100 points
- Point deductions are recorded with reason and timestamp
- Only dorm heads can deduct points from users in their dormitory
- Points cannot go below 0
- Point history cannot be modified

### Eviction Rules
- Only dorm heads can request eviction
- Eviction can only be requested when user points are below threshold (e.g., 50)
- Only admins can approve/reject eviction requests
- Approved evictions remove user from dormitory and bed assignment
- Rejected requests are recorded but no action taken

### Data Integrity Rules
- All timestamps are automatically generated
- User emails must be unique
- Dormitory names must be unique
- Bed numbers must be unique within a dormitory
- Soft delete for users (status change instead of deletion)