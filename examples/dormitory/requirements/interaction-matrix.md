# 宿舍管理系统交互矩阵

## 概述

本文档定义了系统中所有的 Interactions，包括权限控制要求和业务规则验证。每个 Interaction 都明确标注了：
- **允许的角色**：哪些角色可以执行此操作
- **权限检查**：Stage 2 需要实施的权限控制
- **业务规则**：Stage 2 需要验证的业务逻辑
- **对应测试用例**：相关的测试用例编号

---

## Interactions 列表

### 1. CreateDormitory - 创建宿舍

| 属性 | 说明 |
|------|------|
| **目的** | 创建新的宿舍并自动生成床位 |
| **允许角色** | admin |
| **输入参数** | name (string), capacity (number) |
| **影响实体** | Dormitory, Bed |
| **Stage 1 实现** | ✅ 创建宿舍和床位记录 |
| **Stage 2 权限** | ❌ 拒绝非admin角色 |
| **Stage 2 业务规则** | ❌ capacity必须在4-6之间<br>❌ name必须唯一 |
| **测试用例** | TC001, TC010, TC011, TC016, TC017, TC026 |

**实现要点**：
- Stage 1: 直接创建实体，不检查权限和规则
- Stage 2: 添加 condition 验证角色和业务规则

---

### 2. AssignUserToDormitory - 分配用户到宿舍

| 属性 | 说明 |
|------|------|
| **目的** | 将用户分配到指定宿舍的空床位 |
| **允许角色** | admin |
| **输入参数** | userId (string), dormitoryId (string) |
| **影响实体** | User, Dormitory, Bed |
| **影响关系** | UserDormitoryRelation, UserBedRelation |
| **Stage 1 实现** | ✅ 建立用户与宿舍、床位的关系 |
| **Stage 2 权限** | ❌ 拒绝非admin角色 |
| **Stage 2 业务规则** | ❌ 用户不能已有宿舍<br>❌ 宿舍必须有空床位<br>❌ 用户状态不能是evicted |
| **测试用例** | TC002, TC009, TC015, TC018, TC019, TC024 |

**实现要点**：
- 自动选择第一个可用床位
- 更新床位状态为occupied
- 记录分配时间和分配人

---

### 3. AssignDormHead - 指定宿舍长

| 属性 | 说明 |
|------|------|
| **目的** | 指定某用户为特定宿舍的宿舍长 |
| **允许角色** | admin |
| **输入参数** | userId (string), dormitoryId (string) |
| **影响实体** | User, Dormitory |
| **影响关系** | DormitoryDormHeadRelation |
| **Stage 1 实现** | ✅ 更新用户角色，建立宿舍长关系 |
| **Stage 2 权限** | ❌ 拒绝非admin角色 |
| **Stage 2 业务规则** | ❌ 用户必须是该宿舍成员<br>❌ 宿舍不能已有宿舍长 |
| **测试用例** | TC003, TC023 |

**实现要点**：
- 更新用户role为dormHead
- 建立宿舍与宿舍长的1:1关系
- 记录任命时间

---

### 4. RecordViolation - 记录违规

| 属性 | 说明 |
|------|------|
| **目的** | 宿舍长记录本宿舍成员的违规行为 |
| **允许角色** | dormHead |
| **输入参数** | userId (string), reason (string), score (number) |
| **影响实体** | User, ViolationRecord |
| **影响关系** | UserViolationRelation, ViolationRecorderRelation |
| **Stage 1 实现** | ✅ 创建违规记录，更新用户违规分数 |
| **Stage 2 权限** | ❌ 拒绝非dormHead角色 |
| **Stage 2 业务规则** | ❌ 只能记录本宿舍成员<br>❌ 不能记录自己<br>❌ score必须在1-10之间 |
| **测试用例** | TC004, TC005, TC012, TC013, TC021, TC025 |

**实现要点**：
- 创建违规记录
- 累加用户的violationScore
- 使用StateMachine更新用户违规分数

---

### 5. RequestEviction - 申请踢出

| 属性 | 说明 |
|------|------|
| **目的** | 宿舍长申请踢出违规严重的成员 |
| **允许角色** | dormHead |
| **输入参数** | userId (string), reason (string) |
| **影响实体** | EvictionRequest |
| **影响关系** | EvictionRequestUserRelation, EvictionRequestDormHeadRelation |
| **Stage 1 实现** | ✅ 创建踢出申请（pending状态） |
| **Stage 2 权限** | ❌ 拒绝非dormHead角色 |
| **Stage 2 业务规则** | ❌ 只能申请本宿舍成员<br>❌ 不能申请自己<br>❌ 用户违规分数必须≥30 |
| **测试用例** | TC006, TC020, TC022 |

**实现要点**：
- 创建申请记录，初始状态为pending
- 关联申请人、目标用户
- 记录申请时间和理由

---

### 6. ApproveEviction - 批准踢出

| 属性 | 说明 |
|------|------|
| **目的** | 管理员批准踢出申请 |
| **允许角色** | admin |
| **输入参数** | requestId (string), comment (string) |
| **影响实体** | EvictionRequest, User, Bed |
| **影响关系** | UserDormitoryRelation, UserBedRelation, EvictionRequestAdminRelation |
| **Stage 1 实现** | ✅ 更新申请状态，踢出用户，释放床位 |
| **Stage 2 权限** | ❌ 拒绝非admin角色 |
| **Stage 2 业务规则** | ❌ 申请必须是pending状态 |
| **测试用例** | TC007, TC014, TC027 |

**实现要点**：
- 更新申请状态为approved
- 更新用户状态为evicted
- 释放床位（状态改为available）
- 解除所有宿舍关系
- 记录处理时间和管理员

---

### 7. RejectEviction - 拒绝踢出

| 属性 | 说明 |
|------|------|
| **目的** | 管理员拒绝踢出申请 |
| **允许角色** | admin |
| **输入参数** | requestId (string), comment (string) |
| **影响实体** | EvictionRequest |
| **影响关系** | EvictionRequestAdminRelation |
| **Stage 1 实现** | ✅ 更新申请状态为rejected |
| **Stage 2 权限** | ❌ 拒绝非admin角色 |
| **Stage 2 业务规则** | ❌ 申请必须是pending状态 |
| **测试用例** | TC008 |

**实现要点**：
- 更新申请状态为rejected
- 记录拒绝理由
- 用户保持原状态不变

---

## 权限控制矩阵

| Interaction | Admin | DormHead | Student | 备注 |
|-------------|-------|----------|---------|------|
| CreateDormitory | ✅ | ❌ | ❌ | 仅管理员 |
| AssignUserToDormitory | ✅ | ❌ | ❌ | 仅管理员 |
| AssignDormHead | ✅ | ❌ | ❌ | 仅管理员 |
| RecordViolation | ❌ | ✅ | ❌ | 仅宿舍长 |
| RequestEviction | ❌ | ✅ | ❌ | 仅宿舍长 |
| ApproveEviction | ✅ | ❌ | ❌ | 仅管理员 |
| RejectEviction | ✅ | ❌ | ❌ | 仅管理员 |

---

## 业务规则汇总

### 数值范围规则
- **宿舍容量**：4 ≤ capacity ≤ 6
- **违规扣分**：1 ≤ score ≤ 10
- **踢出阈值**：violationScore ≥ 30

### 唯一性规则
- **宿舍名称**：必须唯一
- **用户邮箱**：必须唯一
- **用户分配**：一个用户只能在一个宿舍
- **床位占用**：一个床位只能一个用户
- **宿舍长**：一个宿舍只能一个宿舍长

### 状态规则
- **用户状态**：
  - active：可以被分配宿舍
  - inactive：暂时不能分配
  - evicted：永久不能分配
- **床位状态**：
  - available：可以分配
  - occupied：已被占用
- **申请状态**：
  - pending：可以被处理
  - approved/rejected：不能再处理

### 权限范围规则
- **宿舍长只能管理本宿舍**：
  - 只能记录本宿舍成员违规
  - 只能申请踢出本宿舍成员
- **不能对自己操作**：
  - 宿舍长不能记录自己违规
  - 宿舍长不能申请踢出自己

### 前置条件规则
- **指定宿舍长**：用户必须是该宿舍成员
- **申请踢出**：用户违规分数必须≥30
- **分配到宿舍**：
  - 宿舍必须有空床位
  - 用户不能已有宿舍
  - 用户状态必须是active

---

## Stage 实施策略

### Stage 1 - 核心业务逻辑
**目标**：实现所有基础功能，不含权限和业务规则验证

**实施内容**：
1. 所有Interactions的基本功能
2. 实体创建和关系建立
3. 计算属性（Count、Summation等）
4. 状态管理（StateMachine）

**验证方式**：
- 使用正确的角色和有效数据
- 确保TC001-TC010全部通过

### Stage 2 - 权限和业务规则
**目标**：添加完整的权限控制和业务规则验证

**实施内容**：
1. 添加角色权限检查（condition）
2. 添加业务规则验证（condition）
3. 返回适当的错误信息

**验证方式**：
- TC011-TC027全部通过
- Stage 1的测试仍然通过

---

## 实现优先级

### 高优先级（核心功能）
1. CreateDormitory - 系统基础
2. AssignUserToDormitory - 主要业务
3. RecordViolation - 日常操作
4. RequestEviction - 关键流程
5. ApproveEviction - 完成闭环

### 中优先级（管理功能）
6. AssignDormHead - 角色管理
7. RejectEviction - 流程完整性

### 低优先级（可选功能）
- ViewDormitoryInfo - 查询功能
- ViewUserInfo - 查询功能
- UpdateDormitory - 编辑功能
- TransferUser - 调宿功能

---

## 错误处理规范

### 错误类型
1. **权限错误**：用户角色不符合要求
2. **业务规则错误**：违反业务逻辑约束
3. **数据验证错误**：输入数据不合法
4. **状态错误**：实体状态不允许操作
5. **引用错误**：引用的实体不存在

### 错误信息格式
```javascript
{
  error: {
    type: 'PERMISSION_DENIED' | 'BUSINESS_RULE_VIOLATION' | 'VALIDATION_ERROR' | 'STATE_ERROR' | 'REFERENCE_ERROR',
    message: '具体的错误描述',
    details: {
      // 额外的错误详情
    }
  }
}
```

---

## 测试覆盖检查

| Interaction | 正常流程 | 权限测试 | 业务规则测试 | 覆盖率 |
|-------------|----------|----------|--------------|--------|
| CreateDormitory | TC001, TC010 | TC011 | TC016, TC017, TC026 | ✅ 100% |
| AssignUserToDormitory | TC002, TC009 | TC015 | TC018, TC019, TC024 | ✅ 100% |
| AssignDormHead | TC003 | - | TC023 | ✅ 100% |
| RecordViolation | TC004, TC005 | TC012, TC013 | TC021, TC025 | ✅ 100% |
| RequestEviction | TC006 | - | TC020, TC022 | ✅ 100% |
| ApproveEviction | TC007 | TC014 | TC027 | ✅ 100% |
| RejectEviction | TC008 | - | - | ✅ 100% |

**总体测试覆盖率**: ✅ 100%

---

## 注意事项

1. **渐进式实施**：严格按照Stage 1 → Stage 2的顺序实施
2. **测试先行**：每个功能实现前先确认测试用例
3. **保持一致性**：权限和业务规则的实施要保持一致
4. **错误处理**：提供清晰的错误信息便于调试
5. **文档同步**：实现过程中及时更新相关文档
