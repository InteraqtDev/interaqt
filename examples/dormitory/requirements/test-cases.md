# 宿舍管理系统测试用例

## 测试用例概述

**🔴 CRITICAL: 所有测试用例都基于Interactions，NOT基于Entity/Relation操作**

测试用例分为三个阶段：
1. **核心业务逻辑测试** (优先实现)
2. **权限测试** (核心逻辑工作后实现)
3. **业务规则测试** (核心逻辑工作后实现)

## 阶段1：核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已创建并登录
- **输入数据**: 
  ```json
  {
    "name": "宿舍A",
    "capacity": 4
  }
  ```
- **预期结果**:
  1. 创建新的宿舍记录
  2. 宿舍状态为active
  3. 自动创建4个床位
  4. 当前入住人数为0
  5. 床位状态均为available
- **后置验证**: 宿舍出现在宿舍列表中，床位数量正确

### TC002: 创建宿舍 - 无效数据 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已创建并登录
- **输入数据**: 
  ```json
  {
    "name": "",
    "capacity": 10
  }
  ```
- **预期结果**:
  1. Interaction返回错误
  2. 错误类型为"validation failed"
  3. 没有创建宿舍记录
  4. 没有创建床位记录
- **注意**: 不要用storage.create测试 - 它会绕过验证！

### TC003: 指定宿舍长 (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **前置条件**: 
  - 管理员用户已创建
  - 普通学生用户已创建
  - 宿舍已创建
- **输入数据**:
  ```json
  {
    "userId": "student123",
    "dormitoryId": "dorm001"
  }
  ```
- **预期结果**:
  1. 用户角色更新为dormHead
  2. 建立宿舍-宿舍长关系
  3. 关系状态为active
  4. 设置任命时间
- **后置验证**: 用户的managedDormitory属性指向正确宿舍

### TC004: 分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**:
  - 管理员用户已创建
  - 学生用户已创建
  - 宿舍已创建且有可用床位
- **输入数据**:
  ```json
  {
    "userId": "student456",
    "dormitoryId": "dorm001",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. 建立用户-宿舍关系
  2. 建立用户-床位关系
  3. 床位状态更新为occupied
  4. 宿舍当前入住人数+1
  5. 关系状态为active
- **后置验证**: 用户的dormitory和bed属性正确设置

### TC005: 创建扣分记录 (via CreateScoreRecord Interaction)
- **Interaction**: CreateScoreRecord
- **前置条件**:
  - 宿舍长用户已创建并指定
  - 学生用户已分配到该宿舍
  - 扣分规则已定义
- **输入数据**:
  ```json
  {
    "targetUserId": "student456",
    "ruleId": "rule001",
    "reason": "违反宿舍纪律",
    "score": 2
  }
  ```
- **预期结果**:
  1. 创建新的扣分记录
  2. 记录状态为active
  3. 用户总扣分自动更新 (+2)
  4. 设置创建时间
  5. 关联操作者为宿舍长
- **后置验证**: 用户的scoreRecords列表包含新记录

### TC006: 申请踢出用户 (via CreateKickRequest Interaction)
- **Interaction**: CreateKickRequest
- **前置条件**:
  - 宿舍长用户已创建
  - 学生用户总扣分已达到10分
  - 学生在宿舍长管理的宿舍内
- **输入数据**:
  ```json
  {
    "targetUserId": "student456",
    "reason": "扣分达到限制，违规严重"
  }
  ```
- **预期结果**:
  1. 创建新的踢出申请
  2. 申请状态为pending
  3. 设置申请时间
  4. 关联申请人和目标用户
- **后置验证**: 申请出现在待审批列表中

### TC007: 审批踢出申请 (via ProcessKickRequest Interaction)
- **Interaction**: ProcessKickRequest
- **前置条件**:
  - 管理员用户已创建
  - 踢出申请已创建且状态为pending
- **输入数据**:
  ```json
  {
    "requestId": "kick001",
    "action": "approve",
    "comment": "同意踢出申请"
  }
  ```
- **预期结果**:
  1. 申请状态更新为approved
  2. 目标用户状态更新为kicked
  3. 解除用户-宿舍关系
  4. 解除用户-床位关系
  5. 床位状态更新为available
  6. 宿舍当前入住人数-1
  7. 设置处理时间和审批人
- **后置验证**: 用户不再拥有宿舍分配

### TC008: 撤销扣分记录 (via RevokeScoreRecord Interaction)
- **Interaction**: RevokeScoreRecord
- **前置条件**:
  - 扣分记录已存在且状态为active
  - 操作者为原记录创建者或管理员
- **输入数据**:
  ```json
  {
    "recordId": "score001",
    "reason": "误判，撤销扣分"
  }
  ```
- **预期结果**:
  1. 扣分记录状态更新为revoked
  2. 用户总扣分自动重新计算 (减少对应分数)
  3. 记录撤销时间和原因
- **后置验证**: 用户总扣分正确更新

## 阶段2：权限测试 (核心逻辑完成后实现)

### TC101: 权限测试 - 非管理员创建宿舍
- **Interaction**: CreateDormitory
- **测试阶段**: 权限测试 (核心逻辑后实现)
- **前置条件**: 普通学生用户已创建
- **输入数据**: 有效的宿舍数据
- **预期结果**:
  1. Interaction返回权限错误
  2. 错误类型为"permission denied"
  3. 没有创建宿舍记录
- **注意**: 测试权限控制，不是核心功能

### TC102: 权限测试 - 宿舍长给其他宿舍用户扣分
- **Interaction**: CreateScoreRecord  
- **测试阶段**: 权限测试
- **前置条件**: 
  - 宿舍长A管理宿舍1
  - 学生B在宿舍2
- **输入数据**: 宿舍长A尝试给学生B扣分
- **预期结果**:
  1. Interaction返回权限错误
  2. 没有创建扣分记录
  3. 学生B的总扣分不变

### TC103: 权限测试 - 非宿舍长申请踢出用户
- **Interaction**: CreateKickRequest
- **测试阶段**: 权限测试
- **前置条件**: 普通学生用户尝试申请踢出
- **预期结果**: 权限被拒绝，没有创建申请

## 阶段3：业务规则测试 (核心逻辑完成后实现)

### TC201: 业务规则测试 - 宿舍容量限制
- **Interaction**: CreateDormitory
- **测试阶段**: 业务规则测试 (核心逻辑后实现)
- **前置条件**: 管理员用户已创建
- **输入数据**: 
  ```json
  {
    "name": "宿舍B",
    "capacity": 8
  }
  ```
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示容量超出限制 (4-6)
  3. 没有创建宿舍记录
- **注意**: 测试业务规则验证，不是核心功能

### TC202: 业务规则测试 - 重复分配宿舍
- **Interaction**: AssignUserToDormitory
- **测试阶段**: 业务规则测试
- **前置条件**: 用户已分配到宿舍A
- **输入数据**: 尝试将同一用户分配到宿舍B
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示用户已有宿舍分配
  3. 不创建新的分配关系
  4. 原有分配关系保持不变

### TC203: 业务规则测试 - 扣分不足申请踢出
- **Interaction**: CreateKickRequest
- **测试阶段**: 业务规则测试
- **前置条件**: 
  - 宿舍长已创建
  - 目标用户总扣分只有5分 (未达到10分阈值)
- **输入数据**: 尝试申请踢出
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示扣分未达到踢出阈值
  3. 没有创建踢出申请

### TC204: 业务规则测试 - 床位已占用
- **Interaction**: AssignUserToDormitory
- **测试阶段**: 业务规则测试
- **前置条件**: 
  - 宿舍已创建
  - 床位1已被用户A占用
- **输入数据**: 尝试将用户B分配到同一床位
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示床位已占用
  3. 不创建新的分配关系
  4. 床位状态保持occupied

### TC205: 业务规则测试 - 宿舍长给自己扣分
- **Interaction**: CreateScoreRecord
- **测试阶段**: 业务规则测试
- **前置条件**: 宿舍长用户
- **输入数据**: 宿舍长尝试给自己创建扣分记录
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示不能给自己扣分
  3. 没有创建扣分记录

## Stage 1 实现重要提醒

### 🔴 CRITICAL for Stage 1 Test Cases:
- **始终使用正确的用户角色和有效数据**
- 即使权限尚未实施，也要创建具有适当角色的用户 (admin, dormHead, student)
- 使用符合未来业务规则的现实和有效数据
- 这确保Stage 1测试在Stage 2实现后继续通过

### ✅ CORRECT Stage 1 测试示例:
```typescript
// ✅ 正确：即使在Stage 1也使用适当角色
const admin = await system.storage.create('User', {
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin'  // 从一开始就指定正确角色
})

// ✅ 正确：使用将通过未来业务规则的有效数据
const result = await controller.callInteraction('CreateDormitory', {
  user: admin,  // 使用管理员用户，不只是任何用户
  payload: { name: '宿舍A', capacity: 4 }  // 有效容量 (4-6)
})
```

### 🛑 MANDATORY CHECKPOINT: Stage 1 完成
- **在进入Stage 2之前，所有Stage 1测试必须通过**
- 如果测试失败，迭代并修复实现直到100%通过率
- **持续迭代Stage 1直到完全稳定**

### Stage 2 实现重要提醒

### 🔴 CRITICAL for Stage 2 Implementation:
- **不要修改Stage 1测试用例** - 它们应该继续通过
- **编写新的测试用例**专门用于权限和业务规则验证
- Stage 1测试验证核心功能与有效输入一起工作
- Stage 2测试验证无效输入被正确拒绝
- **实现Stage 2后，两个测试文件都应该通过**

## 测试数据准备

### 基础用户数据
```typescript
const admin = {
  name: '系统管理员',
  email: 'admin@dormitory.com',
  role: 'admin'
}

const dormHead = {
  name: '宿舍长张三',
  email: 'zhang.san@student.edu',
  role: 'dormHead'
}

const student1 = {
  name: '学生李四',
  email: 'li.si@student.edu', 
  role: 'student'
}

const student2 = {
  name: '学生王五',
  email: 'wang.wu@student.edu',
  role: 'student'
}
```

### 基础宿舍数据
```typescript
const dormitory1 = {
  name: '宿舍A栋101',
  capacity: 4
}

const dormitory2 = {
  name: '宿舍B栋201', 
  capacity: 6
}
```

### 扣分规则数据
```typescript
const scoreRules = [
  {
    name: '晚归',
    description: '超过规定时间回宿舍',
    score: 2,
    category: 'time_violation'
  },
  {
    name: '宿舍卫生不合格',
    description: '宿舍内务检查不合格',
    score: 3,
    category: 'hygiene'
  },
  {
    name: '噪音扰民',
    description: '在休息时间制造噪音',
    score: 1,
    category: 'noise'
  }
]
```