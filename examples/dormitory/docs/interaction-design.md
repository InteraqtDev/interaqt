# 宿舍管理系统交互设计

## 交互设计概述

本文档定义了宿舍管理系统的所有用户交互操作，每个交互代表用户可以执行的具体操作。设计分为两个阶段：
- **Stage 1**: 核心业务逻辑，不包含权限检查和业务规则验证
- **Stage 2**: 添加权限控制和业务规则验证

## 宿舍管理交互

### CreateDormitory - 创建宿舍
**目的**: 管理员创建新宿舍

**Payload字段**:
- `name`: string (必需) - 宿舍名称
- `capacity`: number (必需) - 床位数量

**影响**:
- 创建新的Dormitory实体
- 自动创建对应数量的Bed实体
- 建立DormitoryBedRelation关系
- 所有床位初始状态为available

**Stage 2 - 权限**: 仅admin可创建
**Stage 2 - 业务规则**: 
- capacity必须在4-6之间
- 宿舍名称在系统中唯一
- name不能为空

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
**目的**: 更新宿舍基本信息

**Payload字段**:
- `dormitoryId`: string (必需) - 宿舍ID
- `name`: string (可选) - 新宿舍名称
- `capacity`: number (可选) - 新床位数量

**影响**:
- 更新Dormitory实体属性
- 如果容量变化，调整床位数量

**Stage 2 - 权限**: 仅admin可更新
**Stage 2 - 业务规则**: 
- 容量不能小于当前入住人数
- 新名称不能与其他宿舍重复

### DeleteDormitory - 删除宿舍
**目的**: 删除空闲宿舍

**Payload字段**:
- `dormitoryId`: string (必需) - 宿舍ID

**影响**:
- 删除Dormitory实体
- 删除相关的Bed实体
- 清理相关关系

**Stage 2 - 权限**: 仅admin可删除
**Stage 2 - 业务规则**: 宿舍必须为空 (无住户)

## 用户管理交互

### AssignDormHead - 指定宿舍长
**目的**: 管理员指定用户为宿舍长

**Payload字段**:
- `userId`: string (必需) - 用户ID
- `dormitoryId`: string (必需) - 宿舍ID

**影响**:
- 用户角色更新为dormHead
- 建立DormitoryHeadRelation关系
- 关系状态为active，设置任命时间

**Stage 2 - 权限**: 仅admin可指定
**Stage 2 - 业务规则**:
- 目标用户当前角色必须为student
- 目标宿舍当前没有宿舍长
- 用户未管理其他宿舍

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
**目的**: 撤销用户的宿舍长职务

**Payload字段**:
- `userId`: string (必需) - 宿舍长用户ID

**影响**:
- 用户角色更新为student
- DormitoryHeadRelation关系状态更新为inactive

**Stage 2 - 权限**: 仅admin可撤销

### AssignUserToDormitory - 分配用户到宿舍
**目的**: 管理员分配用户到宿舍的具体床位

**Payload字段**:
- `userId`: string (必需) - 用户ID
- `dormitoryId`: string (必需) - 宿舍ID
- `bedNumber`: number (必需) - 床位号

**影响**:
- 建立UserDormitoryRelation关系
- 建立UserBedRelation关系
- 床位状态更新为occupied
- 宿舍当前入住人数+1

**Stage 2 - 权限**: 仅admin可分配
**Stage 2 - 业务规则**:
- 宿舍有可用床位
- 用户当前未分配到任何宿舍
- 指定床位未被占用

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

### RemoveUserFromDormitory - 从宿舍移除用户
**目的**: 管理员将用户从宿舍移除

**Payload字段**:
- `userId`: string (必需) - 用户ID

**影响**:
- UserDormitoryRelation关系状态更新为inactive
- UserBedRelation关系状态更新为inactive
- 床位状态更新为available
- 宿舍当前入住人数-1

**Stage 2 - 权限**: 仅admin可移除

## 扣分管理交互

### CreateScoreRecord - 创建扣分记录
**目的**: 宿舍长对本宿舍成员进行扣分

**Payload字段**:
- `targetUserId`: string (必需) - 被扣分用户ID
- `ruleId`: string (必需) - 扣分规则ID
- `reason`: string (必需) - 扣分原因
- `score`: number (必需) - 扣分数值

**影响**:
- 创建新的ScoreRecord实体
- 建立UserScoreRecordRelation关系 (目标用户)
- 建立ScoreRecordOperatorRelation关系 (操作者)
- 建立ScoreRecordRuleRelation关系 (规则)
- 用户总扣分自动更新

**Stage 2 - 权限**: 
- admin可对所有用户扣分
- dormHead只能对本宿舍成员扣分

**Stage 2 - 业务规则**:
- 不能给自己扣分
- 扣分数值必须大于0
- 扣分规则必须存在且启用
- 目标用户状态为active

```typescript
export const CreateScoreRecord = Interaction.create({
  name: 'CreateScoreRecord',
  action: Action.create({ name: 'createScoreRecord' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'score', required: true })
    ]
  })
});
```

### RevokeScoreRecord - 撤销扣分记录
**目的**: 撤销错误的扣分记录

**Payload字段**:
- `recordId`: string (必需) - 扣分记录ID
- `reason`: string (必需) - 撤销原因

**影响**:
- ScoreRecord状态更新为revoked
- 设置撤销时间和原因
- 用户总扣分自动重新计算

**Stage 2 - 权限**: 原操作者或admin可撤销
**Stage 2 - 业务规则**: 记录状态必须为active

```typescript
export const RevokeScoreRecord = Interaction.create({
  name: 'RevokeScoreRecord',
  action: Action.create({ name: 'revokeScoreRecord' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'recordId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});
```

## 踢出管理交互

### CreateKickRequest - 创建踢出申请
**目的**: 宿舍长申请踢出违规用户

**Payload字段**:
- `targetUserId`: string (必需) - 被申请踢出的用户ID
- `reason`: string (必需) - 申请理由

**影响**:
- 创建新的KickRequest实体
- 建立KickRequestRequesterRelation关系
- 建立KickRequestTargetRelation关系
- 申请状态为pending

**Stage 2 - 权限**: 
- 仅dormHead可申请
- 目标用户必须在申请人管理的宿舍内

**Stage 2 - 业务规则**:
- 目标用户总扣分必须≥10
- 目标用户状态为active
- 目标用户没有pending状态的踢出申请

```typescript
export const CreateKickRequest = Interaction.create({
  name: 'CreateKickRequest',
  action: Action.create({ name: 'createKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});
```

### ProcessKickRequest - 处理踢出申请
**目的**: 管理员审批踢出申请

**Payload字段**:
- `requestId`: string (必需) - 申请ID
- `action`: string (必需) - 处理动作 (approve/reject)
- `comment`: string (可选) - 审批意见

**影响**:
- 更新KickRequest状态 (approved/rejected)
- 建立KickRequestApproverRelation关系
- 设置处理时间和审批人
- 如果批准：
  - 目标用户状态更新为kicked
  - 解除UserDormitoryRelation关系
  - 解除UserBedRelation关系
  - 床位状态更新为available
  - 宿舍当前入住人数-1

**Stage 2 - 权限**: 仅admin可处理
**Stage 2 - 业务规则**:
- 申请状态必须为pending
- 申请未超过30天有效期

```typescript
export const ProcessKickRequest = Interaction.create({
  name: 'ProcessKickRequest',
  action: Action.create({ name: 'processKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'action', required: true }),
      PayloadItem.create({ name: 'comment' })
    ]
  })
});
```

## 规则管理交互

### CreateScoreRule - 创建扣分规则
**目的**: 管理员创建新的扣分规则

**Payload字段**:
- `name`: string (必需) - 规则名称
- `description`: string (必需) - 规则描述
- `score`: number (必需) - 标准扣分数值
- `category`: string (必需) - 违规类别

**影响**:
- 创建新的ScoreRule实体
- 规则状态为active

**Stage 2 - 权限**: 仅admin可创建
**Stage 2 - 业务规则**:
- 扣分数值必须大于0
- 规则名称在系统中唯一

```typescript
export const CreateScoreRule = Interaction.create({
  name: 'CreateScoreRule',
  action: Action.create({ name: 'createScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'score', required: true }),
      PayloadItem.create({ name: 'category', required: true })
    ]
  })
});
```

### UpdateScoreRule - 更新扣分规则
**目的**: 更新现有扣分规则

**Payload字段**:
- `ruleId`: string (必需) - 规则ID
- `name`: string (可选) - 新规则名称
- `description`: string (可选) - 新规则描述
- `score`: number (可选) - 新扣分数值
- `category`: string (可选) - 新违规类别
- `isActive`: boolean (可选) - 是否启用

**影响**:
- 更新ScoreRule实体属性

**Stage 2 - 权限**: 仅admin可更新
**Stage 2 - 业务规则**: 不影响已有的扣分记录

### DeactivateScoreRule - 停用扣分规则
**目的**: 停用不再使用的扣分规则

**Payload字段**:
- `ruleId`: string (必需) - 规则ID

**影响**:
- ScoreRule的isActive更新为false

**Stage 2 - 权限**: 仅admin可停用

## 查询交互

### GetDormitories - 获取宿舍列表
**目的**: 查询宿舍信息

**Payload字段**:
- `status`: string (可选) - 宿舍状态过滤
- `hasAvailableSpace`: boolean (可选) - 是否有空余床位

**Stage 2 - 权限**: 
- admin查看全部
- dormHead查看自己管理的宿舍
- student查看自己所在的宿舍

```typescript
export const GetDormitories = Interaction.create({
  name: 'GetDormitories',
  action: Action.create({ name: 'getDormitories' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'hasAvailableSpace' })
    ]
  })
});
```

### GetDormitoryDetail - 获取宿舍详情
**目的**: 查询特定宿舍的详细信息

**Payload字段**:
- `dormitoryId`: string (必需) - 宿舍ID

**Stage 2 - 权限**: 
- admin查看全部
- dormHead查看自己管理的宿舍
- student查看自己所在的宿舍

### GetUserScoreRecords - 获取用户扣分记录
**目的**: 查询用户的扣分记录

**Payload字段**:
- `userId`: string (可选) - 用户ID，不提供则查询自己的
- `status`: string (可选) - 记录状态过滤
- `startDate`: number (可选) - 开始时间
- `endDate`: number (可选) - 结束时间

**Stage 2 - 权限**:
- admin查看所有用户记录
- dormHead查看本宿舍成员记录
- student仅查看自己的记录

### GetKickRequests - 获取踢出申请列表
**目的**: 查询踢出申请

**Payload字段**:
- `status`: string (可选) - 申请状态过滤
- `dormitoryId`: string (可选) - 宿舍过滤

**Stage 2 - 权限**:
- admin查看所有申请
- dormHead查看自己发起的申请
- student查看针对自己的申请

### GetScoreRules - 获取扣分规则列表
**目的**: 查询扣分规则

**Payload字段**:
- `category`: string (可选) - 类别过滤
- `isActive`: boolean (可选) - 是否启用过滤

**Stage 2 - 权限**: 所有用户可查看

## 交互依赖关系

### 基础设置流程
1. `CreateScoreRule` → 建立扣分规则
2. `CreateDormitory` → 创建宿舍和床位
3. `AssignDormHead` → 指定宿舍长
4. `AssignUserToDormitory` → 分配用户

### 日常管理流程
1. `CreateScoreRecord` → 记录违规扣分
2. 累积扣分达到阈值
3. `CreateKickRequest` → 申请踢出
4. `ProcessKickRequest` → 管理员审批

### 异常处理流程
1. `RevokeScoreRecord` → 撤销错误扣分
2. `RemoveUserFromDormitory` → 强制移除用户
3. `RemoveDormHead` → 撤销宿舍长职务

## Stage实现策略

### Stage 1: 核心业务逻辑
- 实现所有Interaction的基本功能
- 专注于数据创建、更新、删除操作
- 不包含权限检查和业务规则验证
- 使用有效数据和正确角色进行测试

### Stage 2: 权限和业务规则
- 在Interaction中添加condition检查
- 实现基于角色的权限控制
- 实现业务规则验证
- 添加详细的错误处理

## 验证清单
- [ ] 所有用户操作都有对应的Interaction
- [ ] Action只包含name标识符，无逻辑
- [ ] Payload项目标记了正确的required标志
- [ ] 集合类型使用isCollection: true
- [ ] 基础版本不包含权限或约束
- [ ] TypeScript编译通过