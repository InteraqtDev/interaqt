# 宿舍管理系统测试用例

**🔴 重要说明：所有测试用例基于交互(Interactions)，不是基于实体/关系操作**

## 测试阶段规划

### 阶段1：核心业务逻辑测试 (首先实现)
- 基本CRUD操作
- 实体关系建立
- 计算属性正确性
- 状态转换功能

### 阶段2：权限测试 (核心逻辑工作后)
- 角色访问控制
- 操作权限检查

### 阶段3：业务规则测试 (核心逻辑工作后)
- 业务约束验证
- 复杂业务逻辑

---

## 阶段1：核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **交互**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**: 
  ```json
  {
    "name": "宿舍A栋101",
    "capacity": 4
  }
  ```
- **预期结果**:
  1. 创建新的宿舍记录
  2. 宿舍容量为4
  3. 当前入住人数为0
  4. 可用床位数为4
  5. 自动创建4个床位记录（床位号1-4）
- **后置验证**: 宿舍出现在宿舍列表中，床位状态为未占用

### TC002: 指定宿舍长 (via AssignDormHead Interaction)
- **交互**: AssignDormHead
- **前置条件**: 宿舍存在，目标用户为学生角色
- **输入数据**:
  ```json
  {
    "userId": "student001",
    "dormitoryId": "dorm001"
  }
  ```
- **预期结果**:
  1. 用户角色更新为dormHead
  2. 建立宿舍-宿舍长关系
  3. 任命时间记录为当前时间
  4. 关系状态为active
- **后置验证**: 用户可以访问宿舍管理功能

### TC003: 分配学生到宿舍 (via AssignUserToDormitory Interaction)
- **交互**: AssignUserToDormitory
- **前置条件**: 宿舍有可用床位，用户未被分配到其他宿舍
- **输入数据**:
  ```json
  {
    "userId": "student002",
    "dormitoryId": "dorm001",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. 创建用户-宿舍关系记录
  2. 创建用户-床位关系记录
  3. 宿舍当前入住人数+1
  4. 宿舍可用床位数-1
  5. 床位状态变为已占用
  6. 分配状态为active
- **后置验证**: 用户可以查看宿舍信息，床位显示为已占用

### TC004: 创建扣分规则 (via CreateDeductionRule Interaction)
- **交互**: CreateDeductionRule
- **前置条件**: 管理员已登录
- **输入数据**:
  ```json
  {
    "name": "晚归",
    "description": "22:00后回宿舍",
    "points": 5
  }
  ```
- **预期结果**:
  1. 创建新的扣分规则记录
  2. 规则状态为启用(isActive: true)
  3. 扣分数为5
- **后置验证**: 规则出现在可用扣分规则列表中

### TC005: 记录扣分 (via RecordDeduction Interaction)
- **交互**: RecordDeduction
- **前置条件**: 宿舍长已登录，扣分规则存在，学生在本宿舍
- **输入数据**:
  ```json
  {
    "userId": "student002",
    "ruleId": "rule001",
    "reason": "昨晚22:30回宿舍"
  }
  ```
- **预期结果**:
  1. 创建扣分记录
  2. 扣分记录状态为active
  3. 学生总扣分自动更新(+5分)
  4. 创建时间为当前时间
- **后置验证**: 学生总扣分正确计算，扣分记录可查询

### TC006: 申请踢出学生 (via CreateKickoutRequest Interaction)
- **交互**: CreateKickoutRequest
- **前置条件**: 宿舍长已登录，目标学生总扣分≥30分
- **输入数据**:
  ```json
  {
    "targetUserId": "student002",
    "reason": "多次违规，总扣分达到30分"
  }
  ```
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态为pending
  3. 创建时间为当前时间
  4. 申请人为当前宿舍长
- **后置验证**: 申请出现在待处理申请列表中

### TC007: 批准踢出申请 (via ApproveKickoutRequest Interaction)
- **交互**: ApproveKickoutRequest
- **前置条件**: 管理员已登录，踢出申请存在且状态为pending
- **输入数据**:
  ```json
  {
    "requestId": "request001"
  }
  ```
- **预期结果**:
  1. 申请状态更新为approved
  2. 处理时间记录为当前时间
  3. 目标学生状态变为kicked
  4. 释放学生占用的床位
  5. 用户-宿舍关系状态变为inactive
  6. 用户-床位关系状态变为inactive
  7. 宿舍当前入住人数-1
  8. 宿舍可用床位数+1
- **后置验证**: 学生无法访问原宿舍，床位变为可用状态

### TC008: 拒绝踢出申请 (via RejectKickoutRequest Interaction)
- **交互**: RejectKickoutRequest
- **前置条件**: 管理员已登录，踢出申请存在且状态为pending
- **输入数据**:
  ```json
  {
    "requestId": "request002",
    "reason": "扣分不足以踢出"
  }
  ```
- **预期结果**:
  1. 申请状态更新为rejected
  2. 处理时间记录为当前时间
  3. 目标学生状态保持不变
  4. 床位分配保持不变
- **后置验证**: 学生继续正常使用宿舍

### TC009: 取消扣分记录 (via CancelDeduction Interaction)
- **交互**: CancelDeduction
- **前置条件**: 宿舍长已登录，扣分记录存在且状态为active
- **输入数据**:
  ```json
  {
    "deductionId": "deduction001",
    "reason": "误扣，已核实"
  }
  ```
- **预期结果**:
  1. 扣分记录状态更新为cancelled
  2. 学生总扣分自动重新计算(减去该记录分数)
- **后置验证**: 学生总扣分正确更新

### TC010: 查询宿舍信息 (via GetDormitoryInfo Interaction)
- **交互**: GetDormitoryInfo
- **前置条件**: 用户已登录，宿舍存在
- **输入数据**:
  ```json
  {
    "dormitoryId": "dorm001"
  }
  ```
- **预期结果**:
  1. 返回宿舍基本信息
  2. 返回当前入住人员列表
  3. 返回床位使用情况
  4. 返回宿舍长信息
- **后置验证**: 返回数据准确反映当前状态

---

## 阶段2：权限测试 (核心逻辑测试通过后实现)

### TC101: 非管理员创建宿舍被拒绝 (via CreateDormitory Interaction)
- **交互**: CreateDormitory
- **前置条件**: 非管理员用户(student角色)已登录
- **输入数据**: 
  ```json
  {
    "name": "非法宿舍",
    "capacity": 4
  }
  ```
- **预期结果**:
  1. 交互返回权限错误
  2. 错误类型为"权限不足"
  3. 不创建宿舍记录
- **后置验证**: 宿舍列表中无新增记录

### TC102: 非宿舍长记录扣分被拒绝 (via RecordDeduction Interaction)
- **交互**: RecordDeduction
- **前置条件**: 普通学生已登录
- **输入数据**:
  ```json
  {
    "userId": "student003",
    "ruleId": "rule001",
    "reason": "测试"
  }
  ```
- **预期结果**:
  1. 交互返回权限错误
  2. 不创建扣分记录
  3. 目标学生扣分不变
- **后置验证**: 无新增扣分记录

### TC103: 宿舍长只能管理本宿舍学生 (via RecordDeduction Interaction)
- **交互**: RecordDeduction
- **前置条件**: 宿舍长A已登录，尝试给宿舍B的学生扣分
- **输入数据**:
  ```json
  {
    "userId": "studentFromOtherDorm",
    "ruleId": "rule001",
    "reason": "跨宿舍扣分测试"
  }
  ```
- **预期结果**:
  1. 交互返回权限错误
  2. 不创建扣分记录
- **后置验证**: 目标学生扣分不变

---

## 阶段3：业务规则测试 (核心逻辑测试通过后实现)

### TC201: 宿舍容量限制验证 (via CreateDormitory Interaction)
- **交互**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**: 
  ```json
  {
    "name": "违规宿舍",
    "capacity": 8
  }
  ```
- **预期结果**:
  1. 交互返回验证错误
  2. 错误信息提示"容量必须在4-6之间"
  3. 不创建宿舍记录
- **后置验证**: 宿舍列表中无新增记录

### TC202: 重复分配用户被拒绝 (via AssignUserToDormitory Interaction)
- **交互**: AssignUserToDormitory
- **前置条件**: 用户已被分配到宿舍A，尝试分配到宿舍B
- **输入数据**:
  ```json
  {
    "userId": "student001",
    "dormitoryId": "dorm002",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. 交互返回业务规则错误
  2. 错误信息提示"用户已被分配到其他宿舍"
  3. 不创建新的分配关系
- **后置验证**: 用户仍在原宿舍

### TC203: 床位已占用时分配被拒绝 (via AssignUserToDormitory Interaction)
- **交互**: AssignUserToDormitory
- **前置条件**: 床位1已被其他用户占用
- **输入数据**:
  ```json
  {
    "userId": "student003",
    "dormitoryId": "dorm001",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. 交互返回业务规则错误
  2. 错误信息提示"床位已被占用"
  3. 不创建分配关系
- **后置验证**: 床位仍被原用户占用

### TC204: 扣分不足时踢出申请被拒绝 (via CreateKickoutRequest Interaction)
- **交互**: CreateKickoutRequest
- **前置条件**: 宿舍长已登录，目标学生总扣分<30分
- **输入数据**:
  ```json
  {
    "targetUserId": "student004",
    "reason": "测试踢出"
  }
  ```
- **预期结果**:
  1. 交互返回业务规则错误
  2. 错误信息提示"学生扣分不足30分，无法申请踢出"
  3. 不创建踢出申请
- **后置验证**: 无新增踢出申请记录

### TC205: 重复踢出申请被拒绝 (via CreateKickoutRequest Interaction)
- **交互**: CreateKickoutRequest
- **前置条件**: 学生已有pending状态的踢出申请
- **输入数据**:
  ```json
  {
    "targetUserId": "student002",
    "reason": "重复申请测试"
  }
  ```
- **预期结果**:
  1. 交互返回业务规则错误
  2. 错误信息提示"该学生已有待处理的踢出申请"
  3. 不创建新的踢出申请
- **后置验证**: 仍只有一个pending申请

### TC206: 宿舍满员时分配被拒绝 (via AssignUserToDormitory Interaction)
- **交互**: AssignUserToDormitory
- **前置条件**: 4人宿舍已满员（4人）
- **输入数据**:
  ```json
  {
    "userId": "student005",
    "dormitoryId": "dorm001",
    "bedNumber": 5
  }
  ```
- **预期结果**:
  1. 交互返回业务规则错误
  2. 错误信息提示"宿舍已满员"
  3. 不创建分配关系
- **后置验证**: 宿舍入住人数保持为4

### TC207: 边界条件测试 - 正好30分可以申请踢出 (via CreateKickoutRequest Interaction)
- **交互**: CreateKickoutRequest
- **前置条件**: 学生总扣分正好为30分
- **输入数据**:
  ```json
  {
    "targetUserId": "student006",
    "reason": "达到扣分阈值申请踢出"
  }
  ```
- **预期结果**:
  1. 成功创建踢出申请
  2. 申请状态为pending
- **后置验证**: 申请出现在待处理列表中

---

## 测试数据准备

### 基础用户数据
```json
{
  "admin": {
    "name": "系统管理员",
    "email": "admin@example.com",
    "role": "admin"
  },
  "dormHead1": {
    "name": "宿舍长A",
    "email": "dormhead1@example.com", 
    "role": "student"
  },
  "student1": {
    "name": "学生1",
    "email": "student1@example.com",
    "role": "student"
  },
  "student2": {
    "name": "学生2", 
    "email": "student2@example.com",
    "role": "student"
  }
}
```

### 基础宿舍数据
```json
{
  "dorm1": {
    "name": "宿舍A栋101",
    "capacity": 4
  },
  "dorm2": {
    "name": "宿舍A栋102", 
    "capacity": 6
  }
}
```

### 基础扣分规则数据
```json
{
  "rule1": {
    "name": "晚归",
    "description": "22:00后回宿舍",
    "points": 5
  },
  "rule2": {
    "name": "卫生不合格",
    "description": "个人床铺卫生检查不合格", 
    "points": 10
  },
  "rule3": {
    "name": "夜不归宿",
    "description": "整夜未回宿舍",
    "points": 15
  }
}
```

## 测试执行策略

1. **阶段1优先**: 必须先确保所有核心业务逻辑测试通过
2. **渐进式实现**: 不要同时实现所有功能，确保每个阶段完全稳定
3. **数据一致性检查**: 每个测试都要验证计算属性的正确性
4. **状态转换验证**: 确保实体状态变更的正确性
5. **关系完整性**: 验证实体间关系建立和维护的正确性

## 注意事项

🔴 **关键提醒**:
- 所有测试用例必须基于Interaction，不能直接操作storage
- 阶段1测试使用正确的用户角色和有效数据
- 阶段1测试通过后才能进入阶段2和3
- 每个阶段的测试都必须100%通过才能继续下一阶段