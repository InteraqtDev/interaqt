# 宿舍管理系统测试用例

## 测试策略

本文档按照渐进式实施策略组织测试用例：
1. **Stage 1 - Core Business Logic Tests**：核心业务逻辑测试
2. **Stage 2 - Permission Tests**：权限控制测试  
3. **Stage 2 - Business Rule Tests**：业务规则验证测试

🔴 **重要提示**：所有测试用例必须通过 Interactions 进行，不得直接操作 storage！

---

## Stage 1: Core Business Logic Tests（核心业务逻辑测试）

### TC001: 创建宿舍
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**: 
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: { 
      name: 'A栋301', 
      capacity: 4 
    }
  }
  ```
- **预期结果**:
  1. 成功创建宿舍记录
  2. 宿舍名称为 'A栋301'
  3. 宿舍容量为 4
  4. 宿舍状态为 'active'
  5. 自动创建 4 个床位（编号 1-4）
  6. 所有床位状态为 'available'
- **后置验证**: 通过查询确认宿舍和床位都已创建

### TC002: 分配用户到宿舍
- **Interaction**: AssignUserToDormitory
- **前置条件**: 
  - 管理员已登录
  - 存在宿舍 'A栋301'（4个床位）
  - 存在学生用户 'student1'
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      userId: 'student1',
      dormitoryId: 'dorm-1'
    }
  }
  ```
- **预期结果**:
  1. 成功建立用户与宿舍的关系
  2. 用户被分配到第一个可用床位（床位1）
  3. 床位1状态变为 'occupied'
  4. 宿舍的 occupiedBeds 计数为 1
  5. 宿舍的 availableBeds 计数为 3
- **后置验证**: 用户查询显示已分配宿舍和床位

### TC003: 指定宿舍长
- **Interaction**: AssignDormHead
- **前置条件**:
  - 管理员已登录
  - 存在宿舍 'A栋301'
  - 存在已分配到该宿舍的用户 'student1'
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      userId: 'student1',
      dormitoryId: 'dorm-1'
    }
  }
  ```
- **预期结果**:
  1. 用户角色更新为 'dormHead'
  2. 建立宿舍与宿舍长的关系
  3. 记录任命时间戳
  4. 宿舍的 dormHead 属性指向该用户
- **后置验证**: 宿舍查询显示有宿舍长

### TC004: 记录违规
- **Interaction**: RecordViolation
- **前置条件**:
  - 宿舍长已登录（student1）
  - 存在同宿舍的其他学生（student2）
- **输入数据**:
  ```javascript
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      userId: 'student2',
      reason: '晚归',
      score: 5
    }
  }
  ```
- **预期结果**:
  1. 创建违规记录
  2. 违规原因为 '晚归'
  3. 扣分值为 5
  4. 用户累计违规分数增加 5
  5. 用户违规次数增加 1
  6. 记录创建时间戳
- **后置验证**: 用户的 violationScore 为 5

### TC005: 多次违规累计
- **Interaction**: RecordViolation（多次调用）
- **前置条件**:
  - 宿舍长已登录
  - student2 已有 5 分违规记录
- **输入数据**:
  ```javascript
  // 第二次违规
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      userId: 'student2',
      reason: '违规使用电器',
      score: 10
    }
  }
  // 第三次违规
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      userId: 'student2',
      reason: '打架斗殴',
      score: 10
    }
  }
  // 第四次违规
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      userId: 'student2',
      reason: '破坏公物',
      score: 8
    }
  }
  ```
- **预期结果**:
  1. 创建 3 条新的违规记录
  2. 用户累计违规分数为 33 (5+10+10+8)
  3. 用户违规次数为 4
  4. 用户 canBeEvicted 属性为 true（分数≥30）
- **后置验证**: 违规记录查询显示 4 条记录

### TC006: 申请踢出用户
- **Interaction**: RequestEviction
- **前置条件**:
  - 宿舍长已登录
  - student2 累计违规分数为 33（≥30）
- **输入数据**:
  ```javascript
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      userId: 'student2',
      reason: '多次严重违规，累计扣分超过30分'
    }
  }
  ```
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态为 'pending'
  3. 记录申请理由
  4. 记录申请时间戳
  5. 关联申请人（宿舍长）和目标用户
- **后置验证**: 申请查询显示状态为 pending

### TC007: 批准踢出申请
- **Interaction**: ApproveEviction
- **前置条件**:
  - 管理员已登录
  - 存在 pending 状态的踢出申请
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      requestId: 'eviction-1',
      comment: '情况属实，批准踢出'
    }
  }
  ```
- **预期结果**:
  1. 申请状态更新为 'approved'
  2. 记录管理员处理意见
  3. 记录处理时间戳
  4. 用户状态更新为 'evicted'
  5. 释放用户占用的床位（状态变为 'available'）
  6. 解除用户与宿舍的关系
  7. 解除用户与床位的关系
  8. 宿舍 occupiedBeds 减 1
- **后置验证**: 
  - 用户状态为 evicted
  - 用户无宿舍关联
  - 原床位状态为 available

### TC008: 拒绝踢出申请
- **Interaction**: RejectEviction
- **前置条件**:
  - 管理员已登录
  - 存在另一个 pending 状态的踢出申请（针对 student3）
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      requestId: 'eviction-2',
      comment: '初犯，给予警告即可'
    }
  }
  ```
- **预期结果**:
  1. 申请状态更新为 'rejected'
  2. 记录管理员处理意见
  3. 记录处理时间戳
  4. 用户状态保持不变（仍为 'active'）
  5. 用户仍保留宿舍和床位关系
- **后置验证**: 
  - 申请状态为 rejected
  - 用户仍在宿舍中

### TC009: 满员宿舍测试
- **Interaction**: AssignUserToDormitory（多次调用）
- **前置条件**:
  - 创建容量为 4 的宿舍
  - 有 4 个待分配的学生
- **输入数据**: 分别分配 4 个学生
- **预期结果**:
  1. 4 个学生都成功分配
  2. 4 个床位都变为 'occupied'
  3. occupiedBeds = 4
  4. availableBeds = 0
  5. occupancyRate = 100%
- **后置验证**: 宿舍已满员

### TC010: 宿舍容量边界测试
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **测试数据**:
  - 容量 4：最小值
  - 容量 5：中间值
  - 容量 6：最大值
- **预期结果**: 
  1. 三个宿舍都创建成功
  2. 分别创建 4、5、6 个床位
  3. 床位编号正确（1-4、1-5、1-6）
- **后置验证**: 床位数量与容量一致

---

## Stage 2: Permission Tests（权限控制测试）

### TC011: 非管理员创建宿舍（权限拒绝）
- **Interaction**: CreateDormitory
- **前置条件**: 宿舍长用户登录
- **输入数据**:
  ```javascript
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: { name: 'B栋201', capacity: 4 }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为权限不足
  3. 没有创建宿舍记录
- **后置验证**: 宿舍查询不存在 'B栋201'

### TC012: 普通用户记录违规（权限拒绝）
- **Interaction**: RecordViolation
- **前置条件**: 普通学生用户登录
- **输入数据**:
  ```javascript
  {
    user: { id: 'student3', role: 'student' },
    payload: {
      userId: 'student4',
      reason: '测试违规',
      score: 5
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为权限不足
  3. 没有创建违规记录
- **后置验证**: 目标用户违规分数不变

### TC013: 宿舍长记录其他宿舍成员违规（权限拒绝）
- **Interaction**: RecordViolation
- **前置条件**: 
  - A栋宿舍长登录
  - 目标用户在B栋
- **输入数据**:
  ```javascript
  {
    user: { id: 'dormHeadA', role: 'dormHead' },
    payload: {
      userId: 'studentInDormB',
      reason: '跨宿舍记录',
      score: 5
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示只能管理本宿舍
  3. 没有创建违规记录
- **后置验证**: 目标用户无新增违规

### TC014: 非管理员审批踢出申请（权限拒绝）
- **Interaction**: ApproveEviction
- **前置条件**: 
  - 宿舍长用户登录
  - 存在 pending 申请
- **输入数据**:
  ```javascript
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      requestId: 'eviction-3',
      comment: '批准'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为权限不足
  3. 申请状态保持 pending
- **后置验证**: 申请状态未改变

### TC015: 非管理员分配用户到宿舍（权限拒绝）
- **Interaction**: AssignUserToDormitory
- **前置条件**: 宿舍长用户登录
- **输入数据**:
  ```javascript
  {
    user: { id: 'student1', role: 'dormHead' },
    payload: {
      userId: 'newStudent',
      dormitoryId: 'dorm-1'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为权限不足
  3. 用户未被分配
- **后置验证**: 用户无宿舍关联

---

## Stage 2: Business Rule Tests（业务规则测试）

### TC016: 创建容量超限的宿舍（业务规则）
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: { 
      name: 'C栋101', 
      capacity: 10  // 超过最大值6
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示容量必须在4-6之间
  3. 没有创建宿舍
- **后置验证**: 宿舍不存在

### TC017: 创建容量过小的宿舍（业务规则）
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: { 
      name: 'C栋102', 
      capacity: 2  // 小于最小值4
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示容量必须在4-6之间
  3. 没有创建宿舍
- **后置验证**: 宿舍不存在

### TC018: 重复分配用户到宿舍（业务规则）
- **Interaction**: AssignUserToDormitory
- **前置条件**: 
  - 用户已分配到宿舍A
  - 尝试分配到宿舍B
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      userId: 'student1',
      dormitoryId: 'dorm-2'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示用户已有宿舍
  3. 用户保持原宿舍不变
- **后置验证**: 用户仍在原宿舍

### TC019: 分配用户到满员宿舍（业务规则）
- **Interaction**: AssignUserToDormitory
- **前置条件**: 
  - 宿舍已满员（4/4）
  - 有新用户待分配
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      userId: 'newStudent',
      dormitoryId: 'full-dorm'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示宿舍已满
  3. 用户未被分配
- **后置验证**: 宿舍仍为满员状态

### TC020: 申请踢出违规分数不足的用户（业务规则）
- **Interaction**: RequestEviction
- **前置条件**: 
  - 用户违规分数为 20（< 30）
  - 宿舍长尝试申请踢出
- **输入数据**:
  ```javascript
  {
    user: { id: 'dormHead1', role: 'dormHead' },
    payload: {
      userId: 'lowScoreStudent',
      reason: '尝试踢出'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示违规分数不足30分
  3. 没有创建踢出申请
- **后置验证**: 无新的踢出申请记录

### TC021: 宿舍长记录自己的违规（业务规则）
- **Interaction**: RecordViolation
- **前置条件**: 宿舍长尝试记录自己
- **输入数据**:
  ```javascript
  {
    user: { id: 'dormHead1', role: 'dormHead' },
    payload: {
      userId: 'dormHead1',  // 自己
      reason: '自我违规',
      score: 5
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示不能记录自己
  3. 没有创建违规记录
- **后置验证**: 宿舍长违规分数不变

### TC022: 宿舍长申请踢出自己（业务规则）
- **Interaction**: RequestEviction
- **前置条件**: 宿舍长违规分数≥30
- **输入数据**:
  ```javascript
  {
    user: { id: 'dormHead1', role: 'dormHead' },
    payload: {
      userId: 'dormHead1',  // 自己
      reason: '自我踢出'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示不能申请踢出自己
  3. 没有创建踢出申请
- **后置验证**: 无新的踢出申请

### TC023: 指定非本宿舍成员为宿舍长（业务规则）
- **Interaction**: AssignDormHead
- **前置条件**: 
  - 用户A在宿舍1
  - 尝试指定为宿舍2的宿舍长
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      userId: 'userInDorm1',
      dormitoryId: 'dorm-2'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示必须是本宿舍成员
  3. 不建立宿舍长关系
- **后置验证**: 宿舍2无宿舍长

### TC024: 分配被踢出的用户到宿舍（业务规则）
- **Interaction**: AssignUserToDormitory
- **前置条件**: 用户状态为 evicted
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      userId: 'evictedUser',
      dormitoryId: 'dorm-3'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示用户已被踢出
  3. 用户未被分配
- **后置验证**: 用户无宿舍关联

### TC025: 违规扣分超限（业务规则）
- **Interaction**: RecordViolation
- **前置条件**: 宿舍长记录违规
- **输入数据**:
  ```javascript
  {
    user: { id: 'dormHead1', role: 'dormHead' },
    payload: {
      userId: 'student5',
      reason: '严重违规',
      score: 15  // 超过最大值10
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示扣分必须在1-10之间
  3. 没有创建违规记录
- **后置验证**: 用户违规分数不变

### TC026: 创建重名宿舍（业务规则）
- **Interaction**: CreateDormitory
- **前置条件**: 
  - 已存在宿舍 'A栋301'
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: { 
      name: 'A栋301',  // 重复名称
      capacity: 5
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示宿舍名称已存在
  3. 没有创建新宿舍
- **后置验证**: 只有一个名为 'A栋301' 的宿舍

### TC027: 处理已处理的踢出申请（业务规则）
- **Interaction**: ApproveEviction
- **前置条件**: 申请已被批准（状态为 approved）
- **输入数据**:
  ```javascript
  {
    user: { id: 'admin-1', role: 'admin' },
    payload: {
      requestId: 'processed-eviction',
      comment: '重复批准'
    }
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息提示申请已处理
  3. 申请状态保持不变
- **后置验证**: 申请仍为 approved 状态

---

## 复杂场景测试

### TC028: 完整业务流程测试
- **测试流程**:
  1. 管理员创建宿舍（容量4）
  2. 管理员分配4个学生
  3. 管理员指定第1个学生为宿舍长
  4. 宿舍长记录第2个学生多次违规（累计35分）
  5. 宿舍长申请踢出第2个学生
  6. 管理员批准踢出
  7. 管理员分配新学生到空出的床位
- **预期结果**: 每步都成功执行，最终宿舍仍为满员

### TC029: 并发分配测试
- **测试场景**: 模拟两个管理员同时分配不同用户到同一床位
- **预期结果**: 只有一个分配成功，另一个失败

### TC030: 批量操作测试
- **测试场景**: 
  1. 批量创建10个宿舍
  2. 批量分配40个用户
  3. 批量记录违规
- **预期结果**: 所有操作正确执行，数据一致

---

## 测试数据准备

### 基础测试数据
```javascript
// 用户数据
const testUsers = {
  admin1: { id: 'admin-1', name: '系统管理员', email: 'admin@test.com', role: 'admin' },
  dormHead1: { id: 'dorm-head-1', name: '宿舍长1', email: 'head1@test.com', role: 'dormHead' },
  student1: { id: 'student-1', name: '学生1', email: 'student1@test.com', role: 'student' },
  student2: { id: 'student-2', name: '学生2', email: 'student2@test.com', role: 'student' },
  // ... 更多测试用户
};

// 宿舍数据
const testDorms = {
  dormA301: { id: 'dorm-1', name: 'A栋301', capacity: 4 },
  dormA302: { id: 'dorm-2', name: 'A栋302', capacity: 6 },
  dormB201: { id: 'dorm-3', name: 'B栋201', capacity: 5 },
};

// 违规类型
const violationTypes = [
  { reason: '晚归', score: 3 },
  { reason: '违规使用电器', score: 5 },
  { reason: '打架斗殴', score: 10 },
  { reason: '破坏公物', score: 8 },
  { reason: '噪音扰民', score: 4 },
];
```

---

## 测试执行顺序

1. **Stage 1 Tests (TC001-TC010)**：先执行所有核心业务逻辑测试，确保基本功能正常
2. **Stage 2 Permission Tests (TC011-TC015)**：在Stage 1全部通过后执行权限测试
3. **Stage 2 Business Rule Tests (TC016-TC027)**：在Stage 1全部通过后执行业务规则测试
4. **Complex Scenario Tests (TC028-TC030)**：最后执行复杂场景测试

---

## 注意事项

1. **不要直接操作 storage**：所有测试必须通过 Interactions 进行
2. **Stage 1 使用正确的数据**：即使权限未实施，也要使用正确的角色和有效数据
3. **保持测试独立性**：每个测试用例应该独立运行，不依赖其他测试的结果
4. **清理测试数据**：每个测试结束后清理创建的数据，避免影响其他测试
5. **验证完整性**：不仅验证主要结果，还要验证相关的计算属性和关系状态
