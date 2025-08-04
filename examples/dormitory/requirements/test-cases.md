# 宿舍管理系统测试用例

## 第一阶段：核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Phase**: Core Business Logic
- **Preconditions**: Admin user exists and is logged in
- **Input Data**: 
  ```typescript
  {
    name: "Dormitory A",
    capacity: 4,
    headId: "user123"
  }
  ```
- **Expected Results**:
  1. New dormitory record created
  2. Dormitory name is "Dormitory A"
  3. Dormitory capacity is 4
  4. Dormitory head is assigned to user123
  5. Dormitory status is "active"
  6. 4 bed records are created automatically
- **Post Validation**: Dormitory appears in dormitory list

### TC002: 分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Phase**: Core Business Logic
- **Preconditions**: 
  - Dormitory exists with available beds
  - User exists without dormitory assignment
- **Input Data**:
  ```typescript
  {
    userId: "student123",
    dormitoryId: "dorm123",
    bedNumber: 1
  }
  ```
- **Expected Results**:
  1. User is assigned to dormitory
  2. Bed #1 is marked as occupied
  3. User's dormitory reference is updated
  4. Dormitory's occupancy count increases
  5. Assignment timestamp is recorded

### TC003: 创建行为评分记录 (via CreateBehaviorRecord Interaction)
- **Interaction**: CreateBehaviorRecord
- **Phase**: Core Business Logic
- **Preconditions**:
  - User exists and is assigned to a dormitory
  - Dorm head user exists
- **Input Data**:
  ```typescript
  {
    userId: "student123",
    points: -5,
    reason: "Late night noise",
    recordedBy: "head123"
  }
  ```
- **Expected Results**:
  1. New behavior record created
  2. User's total points updated (decreased by 5)
  3. Record shows correct timestamp
  4. Reason is properly stored

### TC004: 申请踢出用户 (via RequestEviction Interaction)
- **Interaction**: RequestEviction
- **Phase**: Core Business Logic
- **Preconditions**:
  - User exists with low points (< 60)
  - Dorm head exists
  - User is assigned to a dormitory
- **Input Data**:
  ```typescript
  {
    userId: "student123",
    reason: "Consistent rule violations",
    requestedBy: "head123"
  }
  ```
- **Expected Results**:
  1. New eviction request created
  2. Request status is "pending"
  3. Request links to user and dorm head
  4. Timestamp is recorded

### TC005: 审批踢出申请 (via ApproveEviction Interaction)
- **Interaction**: ApproveEviction
- **Phase**: Core Business Logic
- **Preconditions**:
  - Eviction request exists with "pending" status
  - Admin user exists
- **Input Data**:
  ```typescript
  {
    requestId: "request123",
    approved: true,
    approvedBy: "admin123"
  }
  ```
- **Expected Results**:
  1. Request status updated to "approved"
  2. User is removed from dormitory
  3. Bed is marked as available
  4. User's dormitory reference is cleared
  5. Approval timestamp is recorded

### TC006: 指定宿舍长 (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **Phase**: Core Business Logic
- **Preconditions**:
  - Dormitory exists
  - User exists with admin role
  - Target user exists
- **Input Data**:
  ```typescript
  {
    dormitoryId: "dorm123",
    headId: "user456"
  }
  ```
- **Expected Results**:
  1. Dormitory's head is updated to user456
  2. Previous head (if any) is removed
  3. User's role is updated to "dormHead"
  4. Assignment timestamp is recorded

## 第二阶段：权限测试

### TC101: 非管理员创建宿舍被拒绝 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Phase**: Permissions
- **Preconditions**: Regular student user logged in
- **Input Data**: Same as TC001
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates insufficient permissions
  3. No dormitory is created

### TC102: 非宿舍长评分被拒绝 (via CreateBehaviorRecord Interaction)
- **Interaction**: CreateBehaviorRecord
- **Phase**: Permissions
- **Preconditions**: Regular student trying to record behavior
- **Input Data**: Same as TC003
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates only dorm heads can record behavior
  3. No behavior record is created

### TC103: 非管理员审批踢出被拒绝 (via ApproveEviction Interaction)
- **Interaction**: ApproveEviction
- **Phase**: Permissions
- **Preconditions**: Dorm head trying to approve eviction
- **Input Data**: Same as TC005
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates only admins can approve evictions
  3. Request status remains "pending"

## 第三阶段：业务规则测试

### TC201: 创建宿舍时床位数量超出范围 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **Phase**: Business Rules
- **Preconditions**: Admin user logged in
- **Input Data**:
  ```typescript
  {
    name: "Invalid Dorm",
    capacity: 10, // Invalid: > 6
    headId: "user123"
  }
  ```
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates invalid capacity
  3. No dormitory is created

### TC202: 分配已分配用户到另一宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Phase**: Business Rules
- **Preconditions**: User already assigned to a dormitory
- **Input Data**: Same as TC002 but with different dormitory
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user already assigned
  3. No new assignment is created

### TC203: 分配用户到已满宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **Phase**: Business Rules
- **Preconditions**: Dormitory has no available beds
- **Input Data**: Same as TC002
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates dormitory is full
  3. No assignment is created

### TC204: 高积分用户申请踢出被拒绝 (via RequestEviction Interaction)
- **Interaction**: RequestEviction
- **Phase**: Business Rules
- **Preconditions**: User has high points (>= 60)
- **Input Data**: Same as TC004
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates user points too high for eviction
  3. No eviction request is created

### TC205: 重复审批已处理的申请 (via ApproveEviction Interaction)
- **Interaction**: ApproveEviction
- **Phase**: Business Rules
- **Preconditions**: Request already approved
- **Input Data**: Same as TC005
- **Expected Results**:
  1. Interaction returns error
  2. Error indicates request already processed
  3. No changes to request or user assignment

## 边界条件测试

### TC301: 床位数量边界值测试
- **Interaction**: CreateDormitory
- **Phase**: Business Rules
- **Test Cases**:
  - Capacity = 3 (should fail)
  - Capacity = 4 (should pass)
  - Capacity = 6 (should pass)
  - Capacity = 7 (should fail)

### TC302: 积分阈值边界值测试
- **Interaction**: RequestEviction
- **Phase**: Business Rules
- **Test Cases**:
  - Points = 59 (should pass)
  - Points = 60 (should fail)
  - Points = 61 (should fail)

### TC303: 批量操作测试
- Test creating multiple dormitories
- Test assigning multiple users
- Test multiple behavior records
- Test multiple eviction requests