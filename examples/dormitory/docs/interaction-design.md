# 交互设计文档

## 概述
基于实体关系设计和测试用例需求，设计宿舍管理系统的所有交互操作。本文档遵循渐进式实现策略，先设计核心业务逻辑，后续添加权限和业务规则。

---

## 设计原则

### 1. 交互是唯一数据操作入口
- 所有数据的创建、更新、删除必须通过交互进行
- 直接操作storage只在测试数据准备时使用
- 交互确保业务逻辑的一致性和完整性

### 2. 渐进式实现策略
- **Stage 1**: 核心业务逻辑（无权限和业务规则验证）
- **Stage 2**: 添加权限控制和业务规则验证
- 确保Stage 1完全稳定后才进入Stage 2

### 3. 命名规范
- 交互名称使用PascalCase
- Action名称使用camelCase
- 体现具体的业务操作意图

---

## 宿舍管理交互

### CreateDormitory - 创建宿舍
**目的**: 管理员创建新宿舍

**Payload字段**:
- `name`: string (必填) - 宿舍名称
- `capacity`: number (必填) - 床位数量

**影响实体**:
- 创建Dormitory实体
- 自动创建capacity数量的Bed实体
- 建立DormitoryBedRelation关系

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: capacity必须在4-6之间

```typescript
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  })
});
```

### UpdateDormitory - 更新宿舍信息
**目的**: 管理员修改宿舍基本信息

**Payload字段**:
- `dormitoryId`: string (必填) - 宿舍ID
- `name`: string (可选) - 新宿舍名称
- `capacity`: number (可选) - 新床位数量

**影响实体**:
- 更新Dormitory实体
- 如果capacity改变，调整Bed实体数量

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: 新capacity不能小于当前入住人数

```typescript
export const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'updateDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'capacity' })
    ]
  })
});
```

### DeleteDormitory - 删除宿舍
**目的**: 管理员删除空宿舍

**Payload字段**:
- `dormitoryId`: string (必填) - 宿舍ID

**影响实体**:
- 删除Dormitory实体
- 删除相关的Bed实体
- 清理相关关系

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: 宿舍必须为空（无入住学生）

```typescript
export const DeleteDormitory = Interaction.create({
  name: 'DeleteDormitory',
  action: Action.create({ name: 'deleteDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});
```

---

## 用户分配交互

### AssignDormHead - 指定宿舍长
**目的**: 管理员指定某用户为宿舍长

**Payload字段**:
- `userId`: string (必填) - 用户ID
- `dormitoryId`: string (必填) - 宿舍ID

**影响实体**:
- 更新User的role为'dormHead'
- 创建DormitoryHeadRelation关系
- 确保用户也被分配到该宿舍

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: 用户必须已分配到该宿舍

```typescript
export const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assignDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});
```

### RemoveDormHead - 撤销宿舍长
**目的**: 管理员撤销宿舍长职务

**Payload字段**:
- `dormitoryId`: string (必填) - 宿舍ID

**影响实体**:
- 更新用户role为'student'
- 设置DormitoryHeadRelation状态为inactive

**Stage 2 权限**: 仅admin角色

```typescript
export const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'removeDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});
```

### AssignUserToDormitory - 分配用户到宿舍
**目的**: 管理员分配学生到具体床位

**Payload字段**:
- `userId`: string (必填) - 学生ID
- `dormitoryId`: string (必填) - 宿舍ID
- `bedNumber`: number (必填) - 床位号

**影响实体**:
- 创建UserDormitoryRelation关系
- 创建UserBedRelation关系
- 更新相关计算属性

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: 
- 用户未被分配到其他宿舍
- 床位未被占用
- 宿舍未满员

```typescript
export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedNumber', required: true })
    ]
  })
});
```

### RemoveUserFromDormitory - 移除用户出宿舍
**目的**: 管理员将用户从宿舍移除

**Payload字段**:
- `userId`: string (必填) - 用户ID

**影响实体**:
- 设置UserDormitoryRelation状态为inactive
- 设置UserBedRelation状态为inactive
- 更新相关计算属性

**Stage 2 权限**: 仅admin角色

```typescript
export const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'removeUserFromDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});
```

---

## 扣分管理交互

### CreateDeductionRule - 创建扣分规则
**目的**: 管理员创建扣分规则

**Payload字段**:
- `name`: string (必填) - 规则名称
- `description`: string (必填) - 规则描述
- `points`: number (必填) - 扣分数

**影响实体**:
- 创建DeductionRule实体
- 默认isActive为true

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: points必须>0

```typescript
export const CreateDeductionRule = Interaction.create({
  name: 'CreateDeductionRule',
  action: Action.create({ name: 'createDeductionRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'points', required: true })
    ]
  })
});
```

### UpdateDeductionRule - 更新扣分规则
**目的**: 管理员修改扣分规则

**Payload字段**:
- `ruleId`: string (必填) - 规则ID
- `name`: string (可选) - 新规则名称
- `description`: string (可选) - 新规则描述
- `points`: number (可选) - 新扣分数

**Stage 2 权限**: 仅admin角色

```typescript
export const UpdateDeductionRule = Interaction.create({
  name: 'UpdateDeductionRule',
  action: Action.create({ name: 'updateDeductionRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'points' })
    ]
  })
});
```

### DisableDeductionRule - 禁用扣分规则
**目的**: 管理员禁用扣分规则

**Payload字段**:
- `ruleId`: string (必填) - 规则ID

**影响实体**:
- 设置DeductionRule的isActive为false

**Stage 2 权限**: 仅admin角色

```typescript
export const DisableDeductionRule = Interaction.create({
  name: 'DisableDeductionRule',
  action: Action.create({ name: 'disableDeductionRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true })
    ]
  })
});
```

### RecordDeduction - 记录扣分
**目的**: 宿舍长给学生记录扣分

**Payload字段**:
- `userId`: string (必填) - 被扣分学生ID
- `ruleId`: string (必填) - 扣分规则ID
- `reason`: string (必填) - 具体扣分原因

**影响实体**:
- 创建DeductionRecord实体
- 建立相关关系
- 更新用户总扣分

**Stage 2 权限**: dormHead角色且目标学生在同一宿舍
**Stage 2 业务规则**: 扣分规则必须为启用状态

```typescript
export const RecordDeduction = Interaction.create({
  name: 'RecordDeduction',
  action: Action.create({ name: 'recordDeduction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});
```

### CancelDeduction - 取消扣分记录
**目的**: 取消错误的扣分记录

**Payload字段**:
- `deductionId`: string (必填) - 扣分记录ID
- `reason`: string (可选) - 取消原因

**影响实体**:
- 设置DeductionRecord状态为cancelled
- 更新用户总扣分

**Stage 2 权限**: admin或记录者本人

```typescript
export const CancelDeduction = Interaction.create({
  name: 'CancelDeduction',
  action: Action.create({ name: 'cancelDeduction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'deductionId', required: true }),
      PayloadItem.create({ name: 'reason' })
    ]
  })
});
```

---

## 踢出申请交互

### CreateKickoutRequest - 创建踢出申请
**目的**: 宿舍长申请踢出问题学生

**Payload字段**:
- `targetUserId`: string (必填) - 被申请踢出的学生ID
- `reason`: string (必填) - 申请理由

**影响实体**:
- 创建KickoutRequest实体
- 建立相关关系
- 默认status为pending

**Stage 2 权限**: dormHead角色且目标学生在同一宿舍
**Stage 2 业务规则**: 
- 目标学生总扣分≥30
- 无其他pending状态的申请

```typescript
export const CreateKickoutRequest = Interaction.create({
  name: 'CreateKickoutRequest',
  action: Action.create({ name: 'createKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});
```

### ApproveKickoutRequest - 批准踢出申请
**目的**: 管理员批准踢出申请

**Payload字段**:
- `requestId`: string (必填) - 申请ID

**影响实体**:
- 设置KickoutRequest状态为approved
- 设置目标用户状态为kicked
- 释放用户的床位和宿舍分配
- 记录处理时间和处理人

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: 申请状态必须为pending

```typescript
export const ApproveKickoutRequest = Interaction.create({
  name: 'ApproveKickoutRequest',
  action: Action.create({ name: 'approveKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  })
});
```

### RejectKickoutRequest - 拒绝踢出申请
**目的**: 管理员拒绝踢出申请

**Payload字段**:
- `requestId`: string (必填) - 申请ID
- `reason`: string (可选) - 拒绝理由

**影响实体**:
- 设置KickoutRequest状态为rejected
- 记录处理时间和处理人

**Stage 2 权限**: 仅admin角色
**Stage 2 业务规则**: 申请状态必须为pending

```typescript
export const RejectKickoutRequest = Interaction.create({
  name: 'RejectKickoutRequest',
  action: Action.create({ name: 'rejectKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'reason' })
    ]
  })
});
```

---

## 查询交互

### GetDormitoryInfo - 获取宿舍信息
**目的**: 查看宿舍详细信息

**Payload字段**:
- `dormitoryId`: string (必填) - 宿舍ID

**返回数据**:
- 宿舍基本信息
- 床位使用情况
- 入住成员列表
- 宿舍长信息

**Stage 2 权限**: admin或相关宿舍的dormHead/student

```typescript
export const GetDormitoryInfo = Interaction.create({
  name: 'GetDormitoryInfo',
  action: Action.create({ name: 'getDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});
```

### GetDormitoryList - 获取宿舍列表
**目的**: 查看所有宿舍概览

**Payload字段**:
- `status`: string (可选) - 筛选状态
- `limit`: number (可选) - 分页限制
- `offset`: number (可选) - 分页偏移

**Stage 2 权限**: admin或dormHead（只能看自己管理的）

```typescript
export const GetDormitoryList = Interaction.create({
  name: 'GetDormitoryList',
  action: Action.create({ name: 'getDormitoryList' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

### GetUserInfo - 获取用户信息
**目的**: 查看用户详细信息

**Payload字段**:
- `userId`: string (必填) - 用户ID

**返回数据**:
- 用户基本信息
- 宿舍分配情况
- 扣分汇总
- 历史记录

**Stage 2 权限**: admin或用户本人或同宿舍的dormHead

```typescript
export const GetUserInfo = Interaction.create({
  name: 'GetUserInfo',
  action: Action.create({ name: 'getUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});
```

### GetDeductionRules - 获取扣分规则列表
**目的**: 查看所有扣分规则

**Payload字段**:
- `isActive`: boolean (可选) - 筛选启用状态

**Stage 2 权限**: admin或dormHead

```typescript
export const GetDeductionRules = Interaction.create({
  name: 'GetDeductionRules',
  action: Action.create({ name: 'getDeductionRules' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'isActive' })
    ]
  })
});
```

### GetDeductionHistory - 获取扣分记录
**目的**: 查看扣分历史记录

**Payload字段**:
- `userId`: string (必填) - 用户ID
- `status`: string (可选) - 记录状态筛选
- `limit`: number (可选) - 分页限制
- `offset`: number (可选) - 分页偏移

**Stage 2 权限**: admin或用户本人或同宿舍的dormHead

```typescript
export const GetDeductionHistory = Interaction.create({
  name: 'GetDeductionHistory',
  action: Action.create({ name: 'getDeductionHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

### GetKickoutRequests - 获取踢出申请列表
**目的**: 查看踢出申请记录

**Payload字段**:
- `status`: string (可选) - 申请状态筛选
- `applicantId`: string (可选) - 申请人ID筛选
- `targetId`: string (可选) - 被申请人ID筛选

**Stage 2 权限**: admin或申请相关的用户

```typescript
export const GetKickoutRequests = Interaction.create({
  name: 'GetKickoutRequests',
  action: Action.create({ name: 'getKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'applicantId' }),
      PayloadItem.create({ name: 'targetId' })
    ]
  })
});
```

---

## 统计和汇总交互

### GetUserDeductionSummary - 获取用户扣分汇总
**目的**: 获取用户扣分统计信息

**Payload字段**:
- `userId`: string (必填) - 用户ID

**返回数据**:
- 总扣分数
- 各类型扣分分布
- 最近扣分记录
- 踢出风险评估

**Stage 2 权限**: admin或用户本人或同宿舍的dormHead

```typescript
export const GetUserDeductionSummary = Interaction.create({
  name: 'GetUserDeductionSummary',
  action: Action.create({ name: 'getUserDeductionSummary' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});
```

### GetDormitoryStatistics - 获取宿舍统计
**目的**: 获取宿舍运营统计

**Payload字段**:
- `dormitoryId`: string (必填) - 宿舍ID

**返回数据**:
- 入住率统计
- 扣分分布统计
- 成员表现概览
- 违规趋势分析

**Stage 2 权限**: admin或该宿舍的dormHead

```typescript
export const GetDormitoryStatistics = Interaction.create({
  name: 'GetDormitoryStatistics',
  action: Action.create({ name: 'getDormitoryStatistics' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});
```

### GetSystemStatistics - 获取系统统计
**目的**: 获取全系统统计信息

**Payload字段**:
- `timeRange`: string (可选) - 时间范围

**返回数据**:
- 总体入住率
- 扣分趋势
- 踢出申请统计
- 违规热点分析

**Stage 2 权限**: 仅admin角色

```typescript
export const GetSystemStatistics = Interaction.create({
  name: 'GetSystemStatistics',
  action: Action.create({ name: 'getSystemStatistics' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'timeRange' })
    ]
  })
});
```

---

## 交互优先级划分

### 高优先级 (Stage 1 核心功能)
1. CreateDormitory - 创建宿舍
2. AssignUserToDormitory - 分配用户到宿舍
3. AssignDormHead - 指定宿舍长
4. CreateDeductionRule - 创建扣分规则
5. RecordDeduction - 记录扣分
6. CreateKickoutRequest - 创建踢出申请
7. ApproveKickoutRequest - 批准踢出申请

### 中优先级 (Stage 1 支持功能)
1. GetDormitoryInfo - 获取宿舍信息
2. GetDeductionHistory - 获取扣分记录
3. CancelDeduction - 取消扣分记录
4. RejectKickoutRequest - 拒绝踢出申请
5. RemoveUserFromDormitory - 移除用户出宿舍

### 低优先级 (Stage 2 增强功能)
1. UpdateDormitory - 更新宿舍信息
2. DeleteDormitory - 删除宿舍
3. UpdateDeductionRule - 更新扣分规则
4. GetSystemStatistics - 获取系统统计
5. GetDormitoryStatistics - 获取宿舍统计

---

## 实现注意事项

### 1. Stage 1 实现要点
- 交互只包含基本的payload定义
- 不包含conditions（权限和业务规则）
- 专注于核心功能的正确实现
- 确保所有基本CRUD操作正常工作

### 2. Action设计原则
- Action只包含name字段，是纯标识符
- 不包含任何执行逻辑
- 命名使用camelCase，体现具体操作

### 3. Payload设计原则
- 字段命名清晰明确
- 正确标记required字段
- 实体引用使用有意义的字段名（如dormitoryId而不是id）
- 使用isCollection标记数组类型

### 4. 测试对应关系
- 每个交互都有对应的测试用例
- 测试用例基于交互而不是直接的storage操作
- 确保测试覆盖所有核心业务场景

### 5. 后续扩展准备
- 预留权限控制的设计空间
- 业务规则验证的实现准备
- 支持复杂查询和统计需求

这个交互设计为后续的计算分析和代码实现提供了完整的功能基础，确保系统能够满足所有业务需求。