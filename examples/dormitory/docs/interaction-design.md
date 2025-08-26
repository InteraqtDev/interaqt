# Interaction Design

## Admin Interactions

### CreateDormitory
- **Purpose**: Create a new dormitory with beds
- **Payload**:
  - name: string (required)
  - capacity: number (required, 4-6)
  - floor: number (required)
  - building: string (required)
- **Effects**:
  - Creates new Dormitory entity
  - Automatically creates Bed entities based on capacity
  - Creates DormitoryBedsRelation for each bed
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: 
  - Capacity must be between 4-6
  - Name must be unique within building

### UpdateDormitory
- **Purpose**: Update dormitory information
- **Payload**:
  - dormitoryId: string (required)
  - name: string
  - floor: number
  - building: string
- **Effects**:
  - Updates Dormitory entity properties
- **Stage 2 - Permissions**: Only admin can update
- **Stage 2 - Business Rules**: 
  - Cannot update capacity after creation
  - Name must remain unique within building

### DeleteDormitory
- **Purpose**: Soft delete a dormitory
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Sets Dormitory.isDeleted to true
- **Stage 2 - Permissions**: Only admin can delete
- **Stage 2 - Business Rules**: 
  - Cannot delete if any beds are occupied
  - Must remove all residents first

### AssignDormitoryLeader
- **Purpose**: Assign a user as dormitory leader
- **Payload**:
  - userId: string (required)
  - dormitoryId: string (required)
- **Effects**:
  - Creates UserDormitoryLeaderRelation
  - Updates User.role to 'dormitoryLeader'
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: 
  - User must be a resident of the dormitory
  - Dormitory can only have one leader
  - Previous leader's role reverts to 'resident'

### RemoveDormitoryLeader
- **Purpose**: Remove dormitory leader assignment
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Deletes UserDormitoryLeaderRelation
  - Updates User.role to 'resident'
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: 
  - User must currently be a dormitory leader

### AssignUserToBed
- **Purpose**: Assign user to specific bed
- **Payload**:
  - userId: string (required)
  - bedId: string (required)
- **Effects**:
  - Creates UserBedRelation
  - Updates Bed.isOccupied to true
  - Updates Dormitory.occupiedBeds count
- **Stage 2 - Permissions**: Only admin can assign
- **Stage 2 - Business Rules**: 
  - User cannot already be assigned to another bed
  - Bed must not be occupied
  - User.role must be 'resident' or 'dormitoryLeader'

### RemoveUserFromBed
- **Purpose**: Remove user from their assigned bed
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Deletes UserBedRelation
  - Updates Bed.isOccupied to false
  - Updates Dormitory.occupiedBeds count
- **Stage 2 - Permissions**: Only admin can remove
- **Stage 2 - Business Rules**: 
  - User must be assigned to a bed

### ProcessRemovalRequest
- **Purpose**: Approve or reject removal request
- **Payload**:
  - requestId: string (required)
  - decision: 'approved' | 'rejected' (required)
  - adminComment: string
- **Effects**:
  - Updates RemovalRequest.status
  - Sets RemovalRequest.processedAt
  - Sets RemovalRequest.adminComment
  - If approved:
    - Deletes UserBedRelation
    - Updates Bed.isOccupied to false
    - If user was dormitory leader, deletes UserDormitoryLeaderRelation
    - Updates User.role to 'resident'
- **Stage 2 - Permissions**: Only admin can process
- **Stage 2 - Business Rules**: 
  - Request must be in 'pending' status
  - Cannot process already processed requests

### DeductPoints
- **Purpose**: Admin can deduct points from any user
- **Payload**:
  - userId: string (required)
  - points: number (required)
  - reason: string (required)
  - description: string (required)
- **Effects**:
  - Creates PointDeduction entity
  - Creates UserPointDeductionsRelation
  - Updates User.points (decreases by deduction amount)
- **Stage 2 - Permissions**: Only admin can deduct
- **Stage 2 - Business Rules**: 
  - Points to deduct must be positive
  - User.points cannot go below 0

### CreateUser
- **Purpose**: Create a new user account
- **Payload**:
  - username: string (required)
  - password: string (required)
  - email: string (required)
  - name: string (required)
  - role: 'admin' | 'dormitoryLeader' | 'resident' (default: 'resident')
- **Effects**:
  - Creates User entity with points = 100
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: 
  - Username must be unique
  - Email must be unique and valid format
  - Password must meet security requirements

### DeleteUser
- **Purpose**: Soft delete a user account
- **Payload**:
  - userId: string (required)
- **Effects**:
  - Sets User.isDeleted to true
  - If user has bed assignment, removes from bed
  - If user is dormitory leader, removes leader role
- **Stage 2 - Permissions**: Only admin can delete
- **Stage 2 - Business Rules**: 
  - Cannot delete the last admin user

## Dormitory Leader Interactions

### SubmitRemovalRequest
- **Purpose**: Request to remove a resident from dormitory
- **Payload**:
  - userId: string (required)
  - reason: string (required)
- **Effects**:
  - Creates RemovalRequest entity with status = 'pending'
  - Creates UserRemovalRequestsRelation
  - Creates DormitoryLeaderRemovalRequestsRelation
- **Stage 2 - Permissions**: Only dormitory leader can submit
- **Stage 2 - Business Rules**: 
  - Target user must be in leader's dormitory
  - Target user must have < 30 points
  - Cannot submit if pending request already exists for user
  - Cannot submit for self

### DeductResidentPoints
- **Purpose**: Deduct points from residents in their dormitory
- **Payload**:
  - userId: string (required)
  - points: number (required)
  - reason: string (required)
  - description: string (required)
- **Effects**:
  - Creates PointDeduction entity
  - Creates UserPointDeductionsRelation
  - Updates User.points (decreases by deduction amount)
- **Stage 2 - Permissions**: Only dormitory leader can deduct
- **Stage 2 - Business Rules**: 
  - Target user must be in leader's dormitory
  - Points to deduct must be positive
  - User.points cannot go below 0
  - Cannot deduct from self

## Resident Interactions

### ViewMyDormitory
- **Purpose**: View assigned dormitory and roommates
- **Payload**: None
- **Effects**:
  - Returns dormitory information
  - Returns list of roommates (other users in same dormitory)
- **Stage 2 - Permissions**: Authenticated user
- **Stage 2 - Business Rules**: 
  - User must have a bed assignment

### ViewMyPoints
- **Purpose**: View current points and deduction history
- **Payload**: None
- **Effects**:
  - Returns User.points
  - Returns list of PointDeduction records
- **Stage 2 - Permissions**: Authenticated user
- **Stage 2 - Business Rules**: None

### UpdateProfile
- **Purpose**: Update user profile information
- **Payload**:
  - name: string
  - email: string
- **Effects**:
  - Updates User.name
  - Updates User.email
- **Stage 2 - Permissions**: Authenticated user
- **Stage 2 - Business Rules**: 
  - Email must be unique and valid format
  - Cannot update username or role

## Authentication Interactions

### Login
- **Purpose**: User authentication
- **Payload**:
  - username: string (required)
  - password: string (required)
- **Effects**:
  - Returns authentication token
  - Returns user profile
- **Stage 2 - Permissions**: Public
- **Stage 2 - Business Rules**: 
  - User.isDeleted must be false
  - Password must match

### Registration
- **Purpose**: New user registration
- **Payload**:
  - username: string (required)
  - password: string (required)
  - email: string (required)
  - name: string (required)
- **Effects**:
  - Creates User entity with role = 'resident', points = 100
- **Stage 2 - Permissions**: Public
- **Stage 2 - Business Rules**: 
  - Username must be unique
  - Email must be unique and valid format
  - Password must meet security requirements

### ChangePassword
- **Purpose**: Change user password
- **Payload**:
  - oldPassword: string (required)
  - newPassword: string (required)
- **Effects**:
  - Updates User.password
- **Stage 2 - Permissions**: Authenticated user
- **Stage 2 - Business Rules**: 
  - Old password must match current password
  - New password must meet security requirements

## Query Interactions

### GetDormitories
- **Purpose**: List all dormitories
- **Payload**:
  - includeDeleted: boolean (default: false)
- **Effects**:
  - Returns list of Dormitory entities
- **Stage 2 - Permissions**: Authenticated user
- **Stage 2 - Business Rules**: None

### GetDormitoryDetail
- **Purpose**: Get detailed dormitory information
- **Payload**:
  - dormitoryId: string (required)
- **Effects**:
  - Returns Dormitory entity with beds and occupants
- **Stage 2 - Permissions**: Authenticated user
- **Stage 2 - Business Rules**: None

### GetUsers
- **Purpose**: List users
- **Payload**:
  - role: 'admin' | 'dormitoryLeader' | 'resident'
  - dormitoryId: string
  - includeDeleted: boolean (default: false)
- **Effects**:
  - Returns filtered list of User entities
- **Stage 2 - Permissions**: Admin only
- **Stage 2 - Business Rules**: None

### GetRemovalRequests
- **Purpose**: List removal requests
- **Payload**:
  - status: 'pending' | 'approved' | 'rejected'
  - dormitoryId: string
- **Effects**:
  - Returns filtered list of RemovalRequest entities
- **Stage 2 - Permissions**: Admin or dormitory leader
- **Stage 2 - Business Rules**: 
  - Dormitory leaders can only see requests for their dormitory

### GetPointDeductions
- **Purpose**: List point deductions
- **Payload**:
  - userId: string
  - startDate: number
  - endDate: number
- **Effects**:
  - Returns filtered list of PointDeduction entities
- **Stage 2 - Permissions**: Admin, dormitory leader, or the user themselves
- **Stage 2 - Business Rules**: 
  - Dormitory leaders can only see deductions for users in their dormitory
  - Regular users can only see their own deductions