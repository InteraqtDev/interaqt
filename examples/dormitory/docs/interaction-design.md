# 宿舍管理系统交互设计

## 概述

本文档定义了宿舍管理系统中的所有交互操作，专注于核心业务逻辑的实现。每个交互都对应用户的具体操作需求，确保系统功能的完整性。

## 核心设计原则

### 交互定义规则
- **Action仅作为标识符**: 不包含执行逻辑
- **无用户属性**: 用户在执行时传入，不是交互定义的一部分
- **明确负载定义**: 所有参数都通过Payload清晰定义
- **阶段1专注**: 仅定义核心业务逻辑，暂不包含权限和业务规则

### 负载项目规则
- **实体引用**: 使用`isRef: true`和`base`属性正确引用实体
- **必需字段**: 通过`required: true`标记必需参数
- **集合类型**: 通过`isCollection: true`标记数组参数

## 管理员交互操作

### 1. 创建用户 (CreateUser)

**目的**: 创建新的系统用户
**负载字段**:
- name: 用户姓名 (必需)
- email: 邮箱地址 (必需)
- role: 用户角色 (必需)

```typescript
export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'email', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'role', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 仅管理员可执行
**Stage 2 - 业务规则**: 邮箱唯一性验证

### 2. 创建宿舍 (CreateDormitory)

**目的**: 创建新宿舍，自动生成对应床位
**负载字段**:
- name: 宿舍名称 (必需)
- capacity: 床位数量 (必需)

```typescript
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'capacity', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 仅管理员可执行
**Stage 2 - 业务规则**: capacity必须在4-6之间

### 3. 分配用户到宿舍 (AssignUserToDormitory)

**目的**: 将用户分配到指定宿舍的指定床位
**负载字段**:
- userId: 用户ID (必需)
- dormitoryId: 宿舍ID (必需)
- bedNumber: 床位号 (必需)

```typescript
export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'bedNumber', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 仅管理员可执行
**Stage 2 - 业务规则**: 
- 宿舍必须有可用床位
- 用户未被分配到其他宿舍
- 指定床位未被占用

### 4. 指定宿舍长 (AssignDormitoryHead)

**目的**: 指定某个用户为宿舍长
**负载字段**:
- userId: 用户ID (必需)
- dormitoryId: 宿舍ID (必需)

```typescript
export const AssignDormitoryHead = Interaction.create({
  name: 'AssignDormitoryHead',
  action: Action.create({ name: 'assignDormitoryHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 仅管理员可执行
**Stage 2 - 业务规则**: 
- 用户必须是目标宿舍的成员
- 宿舍不能已有宿舍长

### 5. 处理踢人申请 (ProcessExpelRequest)

**目的**: 管理员审批踢人申请
**负载字段**:
- requestId: 申请ID (必需)
- decision: 决定 (必需) - 'approved' | 'rejected'
- comment: 处理意见

```typescript
export const ProcessExpelRequest = Interaction.create({
  name: 'ProcessExpelRequest',
  action: Action.create({ name: 'processExpelRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'requestId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'decision', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'comment' 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 仅管理员可执行
**Stage 2 - 业务规则**: 申请状态必须为pending

**批准效果**:
- 用户状态更新为'expelled'
- 释放用户占用的床位
- 断开用户-宿舍关系
- 断开用户-床位关系

## 宿舍长交互操作

### 6. 用户扣分 (DeductUserScore)

**目的**: 宿舍长给用户扣分
**负载字段**:
- targetUserId: 目标用户ID (必需)
- reason: 扣分原因 (必需)
- points: 扣分数值 (必需)

```typescript
export const DeductUserScore = Interaction.create({
  name: 'DeductUserScore',
  action: Action.create({ name: 'deductUserScore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUserId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'reason', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'points', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 
- 仅宿舍长可执行
- 目标用户必须在宿舍长管理的宿舍内

**Stage 2 - 业务规则**: 
- points必须为正数
- 目标用户在同一宿舍

**效果**:
- 创建扣分记录
- 用户总分数自动更新

### 7. 提交踢人申请 (SubmitExpelRequest)

**目的**: 宿舍长申请踢出用户
**负载字段**:
- targetUserId: 目标用户ID (必需)
- reason: 申请原因 (必需)

```typescript
export const SubmitExpelRequest = Interaction.create({
  name: 'SubmitExpelRequest',
  action: Action.create({ name: 'submitExpelRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUserId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'reason', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 
- 仅宿舍长可执行
- 目标用户必须在宿舍长管理的宿舍内

**Stage 2 - 业务规则**: 
- 目标用户分数必须低于60分
- 目标用户无pending状态的踢人申请

## 查询交互操作

### 8. 查看宿舍成员 (ViewDormitoryMembers)

**目的**: 查看指定宿舍的所有成员
**负载字段**:
- dormitoryId: 宿舍ID (必需)

```typescript
export const ViewDormitoryMembers = Interaction.create({
  name: 'ViewDormitoryMembers',
  action: Action.create({ name: 'viewDormitoryMembers' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 
- 管理员: 查看所有宿舍
- 宿舍长: 仅查看管理的宿舍

### 9. 查看用户信息 (ViewUserProfile)

**目的**: 查看用户个人信息
**负载字段**:
- userId: 用户ID (必需)

```typescript
export const ViewUserProfile = Interaction.create({
  name: 'ViewUserProfile',
  action: Action.create({ name: 'viewUserProfile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 
- 管理员: 查看所有用户
- 宿舍长: 查看管理宿舍内用户
- 学生: 仅查看自己

### 10. 查看扣分记录 (ViewScoreRecords)

**目的**: 查看用户的扣分历史记录
**负载字段**:
- userId: 用户ID (必需)

```typescript
export const ViewScoreRecords = Interaction.create({
  name: 'ViewScoreRecords',
  action: Action.create({ name: 'viewScoreRecords' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      })
    ]
  })
});
```

**Stage 2 - 权限**: 
- 管理员: 查看所有用户扣分记录
- 宿舍长: 查看管理宿舍内用户扣分记录
- 学生: 仅查看自己的扣分记录

## 实体引用交互模式

### 实体引用示例

对于需要引用现有实体的交互，使用正确的实体引用模式：

```typescript
// ❌ 错误: 仅使用普通ID字段
PayloadItem.create({ 
  name: 'styleId',  // 仅作为字符串ID
  required: true 
})

// ✅ 正确: 使用实体引用
PayloadItem.create({ 
  name: 'style',
  base: Style,     // 指定实体类型
  isRef: true,     // 标记为实体引用
  required: true 
})
```

### 应用于宿舍系统的实体引用

```typescript
// 用户实体引用
PayloadItem.create({ 
  name: 'user',
  base: User,
  isRef: true,
  required: true 
})

// 宿舍实体引用
PayloadItem.create({ 
  name: 'dormitory',
  base: Dormitory,
  isRef: true,
  required: true 
})

// 床位实体引用
PayloadItem.create({ 
  name: 'bed',
  base: Bed,
  isRef: true,
  required: true 
})
```

## 集合参数交互

对于需要处理多个项目的交互，使用集合参数：

```typescript
export const BatchAssignUsers = Interaction.create({
  name: 'BatchAssignUsers',
  action: Action.create({ name: 'batchAssignUsers' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'assignments',
        isCollection: true,  // 标记为数组
        required: true 
      })
    ]
  })
});
```

## 完整交互列表

### 按用户角色分类

#### 管理员专用交互
1. `CreateUser` - 创建用户
2. `CreateDormitory` - 创建宿舍
3. `AssignUserToDormitory` - 分配用户到宿舍
4. `AssignDormitoryHead` - 指定宿舍长
5. `ProcessExpelRequest` - 处理踢人申请

#### 宿舍长专用交互
1. `DeductUserScore` - 用户扣分
2. `SubmitExpelRequest` - 提交踢人申请

#### 通用查询交互
1. `ViewDormitoryMembers` - 查看宿舍成员
2. `ViewUserProfile` - 查看用户信息
3. `ViewScoreRecords` - 查看扣分记录

### 按功能分类

#### 用户管理
- `CreateUser`
- `ViewUserProfile`

#### 宿舍管理
- `CreateDormitory`
- `AssignUserToDormitory`
- `ViewDormitoryMembers`

#### 权限管理
- `AssignDormitoryHead`

#### 评分管理
- `DeductUserScore`
- `ViewScoreRecords`

#### 流程管理
- `SubmitExpelRequest`
- `ProcessExpelRequest`

## 交互数据流程

### 用户入住流程
```
CreateUser → CreateDormitory → AssignUserToDormitory → AssignDormitoryHead
```

### 扣分处理流程
```
DeductUserScore → ViewScoreRecords → SubmitExpelRequest → ProcessExpelRequest
```

### 查询信息流程
```
ViewUserProfile → ViewScoreRecords → ViewDormitoryMembers
```

## Stage 2 扩展计划

### 权限控制实现
每个交互将添加`condition`属性来实现：
- 基于角色的访问控制
- 用户关系验证
- 资源所有权检查

### 业务规则实现
通过`condition`属性实现：
- 数据有效性验证
- 业务逻辑约束
- 状态一致性检查

### 示例权限条件结构
```typescript
// Stage 2 将添加类似条件
condition: {
  type: 'and',
  conditions: [
    {
      type: 'role',
      value: 'admin'
    },
    {
      type: 'businessRule',
      rule: 'capacityLimit'
    }
  ]
}
```

## 实现检查清单

### 基础结构检查
- [ ] 所有交互都有明确的name
- [ ] 所有Action仅包含name属性（无执行逻辑）
- [ ] 所有必需参数标记为required: true
- [ ] 集合参数使用isCollection: true
- [ ] 实体引用使用isRef: true和base属性

### 业务逻辑覆盖
- [ ] 管理员的所有操作都有对应交互
- [ ] 宿舍长的所有操作都有对应交互
- [ ] 学生的所有查询需求都有对应交互
- [ ] 核心业务流程完整覆盖

### 命名和组织
- [ ] 交互名称使用PascalCase
- [ ] Action名称使用camelCase
- [ ] PayloadItem名称清晰明确
- [ ] 按功能模块组织交互

### 后续实现准备
- [ ] 为Stage 2权限实现预留条件结构
- [ ] 为Stage 2业务规则实现预留验证逻辑
- [ ] 确保所有交互都有对应的测试用例设计

这个交互设计为宿舍管理系统提供了完整的用户操作接口，确保所有业务需求都能通过明确定义的交互来实现。Stage 1专注于核心功能实现，为后续的权限控制和业务规则验证奠定了坚实基础。