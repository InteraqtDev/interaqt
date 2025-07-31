# 宿舍管理系统交互设计

## 1. 交互设计原则

### 1.1 基本原则
- 每个用户操作对应一个独立的交互
- 交互只定义名称、操作标识和载荷，不包含业务逻辑
- Stage 1 实现：仅核心业务逻辑，无权限和业务规则约束
- Stage 2 实现：添加权限控制和业务规则验证

### 1.2 载荷设计原则
- 所有必需字段标记 `required: true`
- 实体引用使用 `isRef: true` 和 `base` 属性
- 数组类型使用 `isCollection: true`
- 避免在基础版本中包含复杂验证逻辑

## 2. 宿舍管理交互

### 2.1 CreateDormitory (创建宿舍)
**用途**: 管理员创建新宿舍
**载荷**:
- `name`: string (必需) - 宿舍名称
- `capacity`: number (必需) - 床位数量 (4-6)

**设计说明**:
- 宿舍状态默认为 active
- 当前入住人数默认为 0
- 创建时间自动设置

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

### 2.2 UpdateDormitory (更新宿舍信息)
**用途**: 管理员修改宿舍基本信息
**载荷**:
- `dormitoryId`: string (必需) - 宿舍ID
- `name`: string (可选) - 新宿舍名称
- `capacity`: number (可选) - 新床位数量
- `status`: string (可选) - 宿舍状态

```typescript
export const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'updateDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'capacity' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
});
```

### 2.3 GetDormitoryInfo (获取宿舍信息)
**用途**: 查看宿舍详细信息
**载荷**:
- `dormitoryId`: string (必需) - 宿舍ID

**Stage 2 权限**: 管理员查看所有，宿舍长查看管理的，学生查看自己的

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

### 2.4 GetAllDormitories (获取所有宿舍)
**用途**: 管理员查看所有宿舍列表
**载荷**:
- `status`: string (可选) - 过滤状态
- `limit`: number (可选) - 分页限制
- `offset`: number (可选) - 分页偏移

**Stage 2 权限**: 只有管理员可以访问

```typescript
export const GetAllDormitories = Interaction.create({
  name: 'GetAllDormitories',
  action: Action.create({ name: 'getAllDormitories' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

## 3. 用户分配管理交互

### 3.1 AssignUserToDormitory (分配用户到宿舍)
**用途**: 管理员将用户分配到宿舍的特定床位
**载荷**:
- `userId`: string (必需) - 用户ID
- `dormitoryId`: string (必需) - 宿舍ID
- `bedNumber`: number (必需) - 床位号

**影响**:
- 创建 UserDormitoryRelation
- 自动更新宿舍入住人数

**Stage 2 业务规则**:
- 宿舍不能满员
- 用户不能已有宿舍分配
- 床位不能已被占用

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

### 3.2 RemoveUserFromDormitory (移除用户宿舍分配)
**用途**: 管理员移除用户的宿舍分配
**载荷**:
- `userId`: string (必需) - 用户ID

**影响**:
- 更新 UserDormitoryRelation 状态为 inactive
- 自动更新宿舍入住人数
- 释放床位

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

### 3.3 TransferUserDormitory (转移用户宿舍)
**用途**: 管理员将用户从一个宿舍转移到另一个宿舍
**载荷**:
- `userId`: string (必需) - 用户ID
- `newDormitoryId`: string (必需) - 新宿舍ID
- `newBedNumber`: number (必需) - 新床位号

**影响**:
- 更新原 UserDormitoryRelation 状态为 inactive
- 创建新 UserDormitoryRelation
- 更新两个宿舍的入住人数

```typescript
export const TransferUserDormitory = Interaction.create({
  name: 'TransferUserDormitory',
  action: Action.create({ name: 'transferUserDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'newDormitoryId', required: true }),
      PayloadItem.create({ name: 'newBedNumber', required: true })
    ]
  })
});
```

## 4. 宿舍长管理交互

### 4.1 AssignDormHead (指定宿舍长)
**用途**: 管理员指定用户为宿舍长
**载荷**:
- `userId`: string (必需) - 用户ID
- `dormitoryId`: string (必需) - 宿舍ID

**影响**:
- 创建 DormHeadDormitoryRelation
- 用户角色自动更新为 dormHead

**Stage 2 业务规则**:
- 用户必须已分配到该宿舍
- 一个宿舍只能有一个宿舍长

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

### 4.2 RemoveDormHead (移除宿舍长)
**用途**: 管理员移除宿舍长职务
**载荷**:
- `dormitoryId`: string (必需) - 宿舍ID

**影响**:
- 更新 DormHeadDormitoryRelation 状态为 inactive
- 用户角色恢复为 student

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

## 5. 扣分规则管理交互

### 5.1 CreateScoreRule (创建扣分规则)
**用途**: 管理员创建新的扣分规则
**载荷**:
- `name`: string (必需) - 规则名称
- `description`: string (必需) - 规则描述
- `scoreDeduction`: number (必需) - 扣分数值

**影响**:
- 创建 ScoreRule 实体
- 规则状态默认为 active

```typescript
export const CreateScoreRule = Interaction.create({
  name: 'CreateScoreRule',
  action: Action.create({ name: 'createScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'scoreDeduction', required: true })
    ]
  })
});
```

### 5.2 UpdateScoreRule (更新扣分规则)
**用途**: 管理员修改扣分规则信息
**载荷**:
- `ruleId`: string (必需) - 规则ID
- `name`: string (可选) - 新规则名称
- `description`: string (可选) - 新规则描述
- `scoreDeduction`: number (可选) - 新扣分数值

```typescript
export const UpdateScoreRule = Interaction.create({
  name: 'UpdateScoreRule',
  action: Action.create({ name: 'updateScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'scoreDeduction' })
    ]
  })
});
```

### 5.3 DeactivateScoreRule (禁用扣分规则)
**用途**: 管理员禁用扣分规则
**载荷**:
- `ruleId`: string (必需) - 规则ID

**影响**:
- 更新 ScoreRule.isActive 为 false
- 该规则不能再用于扣分

```typescript
export const DeactivateScoreRule = Interaction.create({
  name: 'DeactivateScoreRule',
  action: Action.create({ name: 'deactivateScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true })
    ]
  })
});
```

### 5.4 GetScoreRules (获取扣分规则)
**用途**: 查看扣分规则列表
**载荷**:
- `isActive`: boolean (可选) - 过滤激活状态

**Stage 2 权限**: 管理员和宿舍长可以查看

```typescript
export const GetScoreRules = Interaction.create({
  name: 'GetScoreRules',
  action: Action.create({ name: 'getScoreRules' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'isActive' })
    ]
  })
});
```

## 6. 扣分操作交互

### 6.1 DeductUserScore (对用户扣分)
**用途**: 宿舍长或管理员对用户执行扣分
**载荷**:
- `userId`: string (必需) - 被扣分用户ID
- `ruleId`: string (必需) - 使用的扣分规则ID
- `reason`: string (必需) - 具体扣分原因
- `operatorNotes`: string (可选) - 操作员备注

**影响**:
- 创建 ScoreRecord 实体
- 创建相关关系记录
- 用户总分自动更新

**Stage 2 权限**: 管理员可以对所有用户扣分，宿舍长只能对管理宿舍内用户扣分

```typescript
export const DeductUserScore = Interaction.create({
  name: 'DeductUserScore',
  action: Action.create({ name: 'deductUserScore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'operatorNotes' })
    ]
  })
});
```

### 6.2 GetUserScoreRecords (获取用户扣分记录)
**用途**: 查看用户的扣分历史记录
**载荷**:
- `userId`: string (必需) - 用户ID
- `limit`: number (可选) - 分页限制
- `offset`: number (可选) - 分页偏移

**Stage 2 权限**: 管理员查看所有，宿舍长查看管理宿舍内用户，用户查看自己的

```typescript
export const GetUserScoreRecords = Interaction.create({
  name: 'GetUserScoreRecords',
  action: Action.create({ name: 'getUserScoreRecords' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

## 7. 踢出申请管理交互

### 7.1 RequestKickUser (申请踢出用户)
**用途**: 宿舍长申请踢出分数过低的用户
**载荷**:
- `userId`: string (必需) - 被申请踢出的用户ID
- `reason`: string (必需) - 申请理由

**影响**:
- 创建 KickRequest 实体
- 创建相关关系记录
- 申请状态默认为 pending

**Stage 2 权限**: 只有宿舍长可以申请踢出管理宿舍内的用户
**Stage 2 业务规则**: 用户分数必须低于20分，不能申请踢出自己

```typescript
export const RequestKickUser = Interaction.create({
  name: 'RequestKickUser',
  action: Action.create({ name: 'requestKickUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});
```

### 7.2 ApproveKickRequest (批准踢出申请)
**用途**: 管理员批准踢出申请
**载荷**:
- `requestId`: string (必需) - 申请ID
- `adminNotes`: string (可选) - 管理员备注

**影响**:
- 更新 KickRequest.status 为 approved
- 更新 KickRequest.processedAt
- 用户状态变为 kicked
- 宿舍关系状态变为 inactive
- 释放床位

**Stage 2 权限**: 只有管理员可以批准申请

```typescript
export const ApproveKickRequest = Interaction.create({
  name: 'ApproveKickRequest',
  action: Action.create({ name: 'approveKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'adminNotes' })
    ]
  })
});
```

### 7.3 RejectKickRequest (拒绝踢出申请)
**用途**: 管理员拒绝踢出申请
**载荷**:
- `requestId`: string (必需) - 申请ID
- `adminNotes`: string (可选) - 管理员备注

**影响**:
- 更新 KickRequest.status 为 rejected
- 更新 KickRequest.processedAt

**Stage 2 权限**: 只有管理员可以拒绝申请

```typescript
export const RejectKickRequest = Interaction.create({
  name: 'RejectKickRequest',
  action: Action.create({ name: 'rejectKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'adminNotes' })
    ]
  })
});
```

### 7.4 GetKickRequests (获取踢出申请)
**用途**: 查看踢出申请列表
**载荷**:
- `status`: string (可选) - 过滤申请状态
- `dormitoryId`: string (可选) - 过滤宿舍
- `limit`: number (可选) - 分页限制
- `offset`: number (可选) - 分页偏移

**Stage 2 权限**: 管理员查看所有，宿舍长查看自己发起的

```typescript
export const GetKickRequests = Interaction.create({
  name: 'GetKickRequests',
  action: Action.create({ name: 'getKickRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'dormitoryId' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

## 8. 用户查询交互

### 8.1 GetUserInfo (获取用户信息)
**用途**: 查看用户详细信息
**载荷**:
- `userId`: string (必需) - 用户ID

**Stage 2 权限**: 管理员查看所有，宿舍长查看管理宿舍内用户，用户查看自己的

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

### 8.2 GetDormitoryUsers (获取宿舍用户)
**用途**: 查看宿舍内所有用户
**载荷**:
- `dormitoryId`: string (必需) - 宿舍ID

**Stage 2 权限**: 管理员查看所有，宿舍长查看管理的宿舍，学生查看自己的宿舍

```typescript
export const GetDormitoryUsers = Interaction.create({
  name: 'GetDormitoryUsers',
  action: Action.create({ name: 'getDormitoryUsers' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});
```

## 9. 交互分组和依赖

### 9.1 核心业务逻辑组 (Stage 1 实现)
1. **宿舍管理**: CreateDormitory, GetDormitoryInfo, GetAllDormitories
2. **用户分配**: AssignUserToDormitory, RemoveUserFromDormitory
3. **宿舍长管理**: AssignDormHead, RemoveDormHead
4. **扣分规则**: CreateScoreRule, GetScoreRules
5. **扣分操作**: DeductUserScore, GetUserScoreRecords
6. **踢出申请**: RequestKickUser, ApproveKickRequest, RejectKickRequest, GetKickRequests
7. **用户查询**: GetUserInfo, GetDormitoryUsers

### 9.2 权限控制组 (Stage 2 实现)
- 所有交互的权限验证
- 基于角色的访问控制
- 上下文相关权限检查

### 9.3 业务规则组 (Stage 2 实现)
- 宿舍容量验证
- 床位冲突检查
- 用户状态验证
- 分数阈值检查

## 10. 验证清单
- [x] 所有用户操作都有对应的交互
- [x] Action 只包含名称标识，无业务逻辑
- [x] 载荷项目正确标记必需字段
- [x] 集合类型使用 isCollection: true
- [x] 实体引用使用 isRef: true 和 base 属性
- [x] 基础版本不包含权限和约束
- [x] 交互命名清晰且一致
- [x] 载荷设计完整且合理