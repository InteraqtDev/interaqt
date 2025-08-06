# 宿舍管理系统测试用例

## 🔴 重要说明
所有测试用例都基于Interactions，NOT基于Entity/Relation操作。测试分为三个阶段：
1. **Core Business Logic Tests** (Stage 1 - 优先实现)
2. **Permission Tests** (Stage 2 - 核心逻辑完成后实现)
3. **Business Rule Tests** (Stage 2 - 核心逻辑完成后实现)

---

## Phase 1: Core Business Logic Tests

### TC001: Create User (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Test Phase**: Core Business Logic
- **Preconditions**: System admin logged in
- **Input Data**: 
  ```json
  {
    "name": "张三",
    "email": "zhangsan@example.com",
    "phone": "13800138000",
    "role": "student"
  }
  ```
- **Expected Results**:
  1. Create new User entity
  2. User status is 'active'
  3. User has specified role
  4. Creation timestamp recorded
- **Post Validation**: User appears in system user list

### TC002: Create Dormitory (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Test Phase**: Core Business Logic  
- **Preconditions**: System admin logged in
- **Input Data**:
  ```json
  {
    "name": "A栋101",
    "bedCount": 4
  }
  ```
- **Expected Results**:
  1. Create new Dormitory entity
  2. Generate 4 Bed entities linked to dormitory
  3. All beds initially have status 'available'
  4. Dormitory available bed count = 4
- **Post Validation**: Dormitory with 4 available beds exists

### TC003: Assign Dorm Head (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **Test Phase**: Core Business Logic
- **Preconditions**: User and Dormitory exist
- **Input Data**:
  ```json
  {
    "userId": "user123",
    "dormitoryId": "dorm456"
  }
  ```
- **Expected Results**:
  1. User role updated to 'dormHead'
  2. UserDormitoryHeadRelation created
  3. User can access dormitory management functions
- **Post Validation**: User appears as dorm head for specified dormitory

### TC004: Assign User to Bed (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Test Phase**: Core Business Logic
- **Preconditions**: User exists, Bed is available
- **Input Data**:
  ```json
  {
    "userId": "student123",
    "bedId": "bed789"
  }
  ```
- **Expected Results**:
  1. Create UserBedAssignment entity
  2. Bed status changed to 'occupied'
  3. Dormitory available bed count decremented
  4. Assignment status is 'active'
- **Post Validation**: User is assigned to specified bed

### TC005: Record User Behavior (via RecordBehavior Interaction)
- **Interaction**: RecordBehavior
- **Test Phase**: Core Business Logic
- **Preconditions**: User exists, Dorm head logged in
- **Input Data**:
  ```json
  {
    "userId": "student123",
    "behaviorType": "noise_violation",
    "description": "深夜大声喧哗",
    "penaltyPoints": 20
  }
  ```
- **Expected Results**:
  1. Create BehaviorRecord entity
  2. User's total penalty points automatically updated
  3. Record timestamp and recorder info
- **Post Validation**: Behavior record appears in user's history

### TC006: Create Expulsion Request (via CreateExpulsionRequest Interaction)
- **Interaction**: CreateExpulsionRequest
- **Test Phase**: Core Business Logic
- **Preconditions**: Dorm head user, target student in same dormitory
- **Input Data**:
  ```json
  {
    "requesterId": "dormhead123",
    "targetUserId": "student456",
    "reason": "累计违规扣分过多"
  }
  ```
- **Expected Results**:
  1. Create ExpulsionRequest entity
  2. Request status is 'pending'
  3. Record request timestamp
- **Post Validation**: Expulsion request appears in admin review queue

### TC007: Process Expulsion Request - Approve (via ProcessExpulsionRequest Interaction)
- **Interaction**: ProcessExpulsionRequest
- **Test Phase**: Core Business Logic
- **Preconditions**: Admin user, pending expulsion request exists
- **Input Data**:
  ```json
  {
    "requestId": "request789",
    "decision": "approved",
    "adminNotes": "违规严重，同意踢出"
  }
  ```
- **Expected Results**:
  1. ExpulsionRequest status updated to 'approved'
  2. Target user status changed to 'expelled'
  3. User's bed assignment status changed to 'inactive'
  4. Bed status changed back to 'available'
  5. Dormitory available bed count incremented
- **Post Validation**: User no longer has active bed assignment

---

## Phase 2: Permission Tests

### TC101: Create User - Permission Denied (via CreateUser Interaction)
- **Interaction**: CreateUser
- **Test Phase**: Permissions
- **Preconditions**: Regular student user logged in (not admin)
- **Input Data**: Valid user creation data
- **Expected Results**:
  1. Interaction returns permission error
  2. No new user created
- **Note**: Test permission enforcement, not core functionality

### TC102: Assign Dorm Head - Cross Boundary (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **Test Phase**: Permissions
- **Preconditions**: Dorm head trying to assign another dorm head
- **Input Data**: Valid assignment data
- **Expected Results**:
  1. Interaction returns permission error
  2. Only admin can assign dorm heads
- **Note**: Test role-based access control

### TC103: Record Behavior - Cross Dormitory (via RecordBehavior Interaction)
- **Interaction**: RecordBehavior
- **Test Phase**: Permissions
- **Preconditions**: Dorm head trying to record behavior for student in different dormitory
- **Input Data**: Valid behavior record data
- **Expected Results**:
  1. Interaction returns permission error
  2. Dorm head can only manage own dormitory students
- **Note**: Test boundary access control

---

## Phase 3: Business Rule Tests

### TC201: Assign User to Bed - Bed Already Occupied (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Test Phase**: Business Rules
- **Preconditions**: Bed is already occupied by another user
- **Input Data**: Valid assignment data for occupied bed
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates bed is not available
  3. No new assignment created
- **Note**: Test business logic validation

### TC202: Create Dormitory - Invalid Bed Count (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Test Phase**: Business Rules
- **Preconditions**: Admin logged in
- **Input Data**:
  ```json
  {
    "name": "Invalid Dorm",
    "bedCount": 8
  }
  ```
- **Expected Results**:
  1. Interaction returns validation error
  2. Error indicates bed count must be 4-6
  3. No dormitory created
- **Note**: Test business rule constraint (4-6 beds only)

### TC203: Assign User to Bed - User Already Assigned (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **Test Phase**: Business Rules
- **Preconditions**: User already has active bed assignment
- **Input Data**: Assignment to different bed
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates user already has bed assignment
  3. No new assignment created
- **Note**: Test one-bed-per-user constraint

### TC204: Create Expulsion Request - Insufficient Points (via CreateExpulsionRequest Interaction)
- **Interaction**: CreateExpulsionRequest
- **Test Phase**: Business Rules
- **Preconditions**: Target user has penalty points < 100
- **Input Data**: Valid expulsion request data
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates insufficient penalty points for expulsion
  3. No expulsion request created
- **Note**: Test penalty point threshold business rule

### TC205: Process Expulsion Request - Already Processed (via ProcessExpulsionRequest Interaction)
- **Interaction**: ProcessExpulsionRequest
- **Test Phase**: Business Rules
- **Preconditions**: Expulsion request already approved/rejected
- **Input Data**: Attempt to process again
- **Expected Results**:
  1. Interaction returns business rule error
  2. Error indicates request already processed
  3. No state change
- **Note**: Test idempotency business rule

---

## Test Implementation Strategy

### Stage 1 Implementation Notes
- All Stage 1 tests use **proper user roles** (admin, dormHead, student)
- All Stage 1 tests use **valid data** that will pass future business rules
- Focus on core functionality: CRUD operations, relationships, computations
- Ensure all basic operations work before adding constraints

### Stage 2 Implementation Notes  
- Stage 1 tests should **continue to pass** after Stage 2 implementation
- Stage 2 adds **new test cases** specifically for permissions and business rules
- Test both positive cases (valid operations) and negative cases (rule violations)
- Verify appropriate error messages and no side effects on failures