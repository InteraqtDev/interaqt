# Detailed Requirements Analysis

## Business Requirements Summary

Based on the original Chinese requirements, this is a dormitory management system with the following needs:

1. A global dormitory administrator can assign users as dormitory leaders
2. Administrator can create dormitories, each with 4-6 beds
3. Administrator can assign users to dormitories (one user per bed, one dormitory per user)
4. Common user behavior scoring/deduction rules
5. When points deducted to certain level, dormitory leader can apply to kick out a user
6. Administrator approves kick-out applications, then user is removed

## Data Analysis - Entities and Properties

### Entity 1: User
**Properties:**
- id: string (immutable after creation - system generated)
- email: string (modifiable with restrictions - email verification required)
- name: string (freely modifiable)
- password: string (modifiable with restrictions - authentication required)
- role: 'admin' | 'dormLeader' | 'resident' (modifiable with restrictions - only by admin)
- points: number (modifiable with restrictions - only via point deduction/reward interactions)
- createdAt: Date (immutable after creation - audit requirement)
- isDeleted: boolean (modifiable with restrictions - only via delete interactions)

**Deletion Analysis:**
- Can be deleted: Yes (account deactivation/user leaving)
- Deletion type: Soft delete (preserve historical data for audit and point deduction records)
- Implementation: Add isDeleted: boolean property
- Cascade: Soft delete user's point deductions records, kick-out applications; Remove bed assignments

### Entity 2: Dormitory
**Properties:**
- id: string (immutable after creation - system generated)
- name: string (freely modifiable)
- totalBeds: number (modifiable with restrictions - only when no users assigned, range 4-6)
- leaderId: string (modifiable with restrictions - only by admin, must be assigned user)
- createdAt: Date (immutable after creation - audit requirement)
- isDeleted: boolean (modifiable with restrictions - only via delete interactions)

**Deletion Analysis:**
- Can be deleted: Yes (dormitory closure/renovation)
- Deletion type: Soft delete (preserve historical assignment data)
- Implementation: Add isDeleted: boolean property
- Cascade: Remove all bed assignments, reassign users if needed

### Entity 3: Bed
**Properties:**
- id: string (immutable after creation - system generated)
- bedNumber: number (immutable after creation - physical bed identifier)
- isOccupied: boolean (modifiable with restrictions - only via assignment interactions)
- createdAt: Date (immutable after creation - audit requirement)
- isDeleted: boolean (modifiable with restrictions - only via delete interactions)

**Deletion Analysis:**
- Can be deleted: Yes (bed removal/dormitory reconfiguration)
- Deletion type: Soft delete (preserve historical assignment data)
- Implementation: Add isDeleted: boolean property
- Cascade: Remove bed assignment if exists

### Entity 4: PointDeduction
**Properties:**
- id: string (immutable after creation - system generated)
- reason: string (immutable after creation - audit requirement)
- points: number (immutable after creation - audit requirement)
- deductedAt: Date (immutable after creation - audit requirement)
- isDeleted: boolean (modifiable with restrictions - only for correction purposes)

**Deletion Analysis:**
- Can be deleted: Limited (only for correction of mistakes)
- Deletion type: Soft delete (maintain audit trail)
- Implementation: Add isDeleted: boolean property
- Cascade: Recalculate user's total points

### Entity 5: KickoutApplication
**Properties:**
- id: string (immutable after creation - system generated)
- reason: string (immutable after creation - formal application record)
- status: 'pending' | 'approved' | 'rejected' (modifiable with restrictions - only by admin or auto-progression)
- appliedAt: Date (immutable after creation - audit requirement)
- processedAt: Date | null (modifiable with restrictions - set when admin processes)
- adminNotes: string | null (modifiable with restrictions - only by admin)
- isDeleted: boolean (modifiable with restrictions - only for administrative cleanup)

**Deletion Analysis:**
- Can be deleted: Limited (only administrative cleanup)
- Deletion type: Soft delete (maintain application history)
- Implementation: Add isDeleted: boolean property
- Cascade: None (preserve as historical record)

## Data Analysis - Relations

### Relation 1: UserDormitoryAssignment
- **Type:** Many-to-One (User -> Dormitory)
- **Source:** User
- **Target:** Dormitory
- **Source Property:** 'dormitory' (User.dormitory to access assigned dormitory)
- **Target Property:** 'residents' (Dormitory.residents to access all assigned users)
- **Cardinality:** One user can be assigned to at most one dormitory

### Relation 2: UserBedAssignment
- **Type:** One-to-One (User -> Bed)
- **Source:** User
- **Target:** Bed
- **Source Property:** 'bed' (User.bed to access assigned bed)
- **Target Property:** 'occupant' (Bed.occupant to access assigned user)
- **Cardinality:** One user per bed, one bed per user

### Relation 3: DormitoryBedRelation
- **Type:** One-to-Many (Dormitory -> Bed)
- **Source:** Dormitory
- **Target:** Bed
- **Source Property:** 'beds' (Dormitory.beds to access all beds)
- **Target Property:** 'dormitory' (Bed.dormitory to access parent dormitory)
- **Cardinality:** One dormitory has multiple beds

### Relation 4: UserPointDeductionRelation
- **Type:** One-to-Many (User -> PointDeduction)
- **Source:** User
- **Target:** PointDeduction
- **Source Property:** 'pointDeductions' (User.pointDeductions to access all deductions)
- **Target Property:** 'user' (PointDeduction.user to access the user who got deducted)
- **Cardinality:** One user can have multiple point deductions

### Relation 5: UserKickoutApplicationRelation (Applicant)
- **Type:** One-to-Many (User -> KickoutApplication) 
- **Source:** User (dormitory leader who applies)
- **Target:** KickoutApplication
- **Source Property:** 'kickoutApplicationsSubmitted' (User.kickoutApplicationsSubmitted)
- **Target Property:** 'applicant' (KickoutApplication.applicant)
- **Cardinality:** One dormitory leader can submit multiple applications

### Relation 6: UserKickoutApplicationRelation (Target)
- **Type:** One-to-Many (User -> KickoutApplication)
- **Source:** User (user being kicked out)
- **Target:** KickoutApplication
- **Source Property:** 'kickoutApplicationsReceived' (User.kickoutApplicationsReceived)
- **Target Property:** 'targetUser' (KickoutApplication.targetUser)
- **Cardinality:** One user can be target of multiple applications

## Interaction Analysis - User Operations

### Administrator Operations

#### AI001: CreateDormitory
- **Actor:** Administrator
- **Purpose:** Create new dormitory with specified number of beds
- **Input:** dormitory name, total beds (4-6)
- **Business Rules:** Total beds must be between 4-6
- **Output:** New dormitory and associated bed records created

#### AI002: AssignUserToDormitory
- **Actor:** Administrator
- **Purpose:** Assign user to a specific bed in dormitory
- **Input:** user ID, dormitory ID, bed number
- **Business Rules:** 
  - User not already assigned to any dormitory
  - Bed must be available
  - Dormitory must exist and not be deleted
- **Output:** User assigned to bed, dormitory assignment created

#### AI003: AppointDormitoryLeader
- **Actor:** Administrator
- **Purpose:** Designate a user as dormitory leader
- **Input:** user ID, dormitory ID
- **Business Rules:**
  - User must be assigned to the dormitory
  - Only one leader per dormitory
- **Output:** User role updated to dormLeader, dormitory leader assigned

#### AI004: ProcessKickoutApplication
- **Actor:** Administrator
- **Purpose:** Approve or reject kickout application
- **Input:** application ID, decision (approve/reject), admin notes
- **Business Rules:**
  - Application must be in pending status
  - Only admin can process applications
- **Output:** Application status updated, if approved - user removed from dormitory

#### AI005: DeductUserPoints
- **Actor:** Administrator (or system via rules)
- **Purpose:** Deduct points from user for violations
- **Input:** user ID, points to deduct, reason
- **Business Rules:**
  - Points must be positive number
  - Reason must be provided
- **Output:** PointDeduction record created, user's total points updated

### Dormitory Leader Operations

#### DL001: SubmitKickoutApplication
- **Actor:** Dormitory Leader
- **Purpose:** Apply to kick out a user from dormitory
- **Input:** target user ID, reason
- **Business Rules:**
  - Applicant must be dormitory leader
  - Target user must be in same dormitory
  - Target user's points below threshold (e.g., < 60)
  - No pending application for same user
- **Output:** KickoutApplication record created with pending status

#### DL002: ViewDormitoryResidents
- **Actor:** Dormitory Leader
- **Purpose:** View all residents in their dormitory
- **Input:** None (derived from leader's dormitory)
- **Business Rules:** Can only view own dormitory residents
- **Output:** List of residents with their points and bed assignments

### Resident Operations

#### R001: ViewMyDormitoryInfo
- **Actor:** Resident
- **Purpose:** View own dormitory assignment and details
- **Input:** None (derived from user's assignment)
- **Business Rules:** Can only view own dormitory information
- **Output:** Dormitory details, bed assignment, roommates list

#### R002: ViewMyPointHistory
- **Actor:** Resident
- **Purpose:** View own point deduction history
- **Input:** None (derived from user's records)
- **Business Rules:** Can only view own point records
- **Output:** List of point deductions with reasons and dates

## Permission Analysis

### Role-Based Permissions
- **Admin:** All operations (AI001-AI005)
- **DormLeader:** Leader-specific operations (DL001-DL002) + basic resident operations (R001-R002)
- **Resident:** Basic operations only (R001-R002)

### Data Access Permissions
- **Users:** Can read own data, admin can read all
- **Dormitories:** Leaders can read their dormitory, admin can read all
- **Point Deductions:** Users can read own, leaders can read their dormitory residents', admin can read all
- **Kickout Applications:** Applicants can read submitted, targets can read received, admin can read all

## Business Process Analysis

### Process 1: User Onboarding
1. Admin creates user account
2. Admin assigns user to dormitory bed
3. User can access dormitory information
4. If needed, admin appoints dormitory leader

### Process 2: Point Deduction Flow
1. User violates rules (detected or reported)
2. Admin deducts points with reason
3. User's total points automatically calculated
4. If points fall below threshold, dormitory leader can apply for kickout

### Process 3: Kickout Process
1. Dormitory leader submits kickout application
2. Application enters pending status
3. Admin reviews and decides (approve/reject)
4. If approved: User removed from dormitory, bed becomes available
5. If rejected: Application marked as rejected, user remains

### Process 4: Dormitory Management
1. Admin creates dormitory with specified beds
2. Admin assigns users to available beds
3. Admin appoints dormitory leader from residents
4. Leader manages dormitory residents and applies for kickouts when needed

## Critical Business Rules

### BR001: Bed Assignment Constraints
- One user per bed maximum
- One bed per user maximum
- User can only be assigned to one dormitory

### BR002: Point Deduction Rules
- Points can only be deducted, not directly added
- Point deductions are permanent audit records
- Total points calculated from all deductions

### BR003: Kickout Eligibility
- Only dormitory leaders can submit kickout applications
- Target user must be in same dormitory as applicant
- Target user's points must be below defined threshold
- No duplicate pending applications for same user

### BR004: Role Hierarchy
- Admin has all permissions
- Dormitory leader has subset permissions for their dormitory
- Residents have basic read permissions for own data

### BR005: Data Integrity
- Soft delete for audit trail preservation
- Immutable audit fields (creation dates, deduction records)
- Referential integrity maintained through relations