# 宿舍管理系统交互设计

## 设计原则

基于 `requirements/detailed-requirements.md` 和 `docs/entity-relation-design.md` 的分析，遵循以下原则：

- **Action仅作为标识符**，不包含执行逻辑
- **用户在执行时传递**，不是交互的属性
- **实体引用使用 isRef 和 base**，而不是简单的id字段
- **Stage 1专注核心业务逻辑**，不包含权限和业务规则
- **Stage 2将添加conditions**，用于权限检查和业务规则验证

---

## 核心业务逻辑交互（Stage 1）

### 1. CreateDormitory（创建宿舍）
**目的**: 创建新的宿舍及其床位
**权限**: Stage 2 - 仅管理员
**业务规则**: Stage 2 - 容量必须4-6

```typescript
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }), // 宿舍名称
      PayloadItem.create({ 
        name: 'capacity', 
        required: true 
      }) // 床位容量
    ]
  })
});
```

**Effects（通过Computation实现）**:
- 创建新的Dormitory实体
- 根据capacity自动创建对应数量的Bed实体
- 建立DormitoryBedRelation关系
- 初始化床位编号（A1, A2, A3, A4...）

### 2. CreateUser（创建用户）
**目的**: 创建系统用户
**权限**: Stage 2 - 仅管理员

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
      }) // admin/dormHead/student
    ]
  })
});
```

**Effects**:
- 创建新的User实体
- 设置初始扣分为0
- 设置状态为active

### 3. AssignUserToDormitory（分配用户到宿舍）
**目的**: 将用户分配到指定宿舍的指定床位
**权限**: Stage 2 - 仅管理员
**业务规则**: Stage 2 - 用户未分配、宿舍有空余、床位可用

```typescript
export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'bed',
        base: Bed,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

**Effects**:
- 创建UserDormitoryRelation关系
- 创建UserBedRelation关系
- 更新床位状态为occupied
- 更新宿舍当前入住人数

### 4. AppointDormHead（任命宿舍长）
**目的**: 任命宿舍内用户为宿舍长
**权限**: Stage 2 - 仅管理员
**业务规则**: Stage 2 - 用户在该宿舍、宿舍无现任宿舍长

```typescript
export const AppointDormHead = Interaction.create({
  name: 'AppointDormHead',
  action: Action.create({ name: 'appointDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

**Effects**:
- 创建DormitoryHeadRelation关系
- 用户获得宿舍长职责（不改变role）
- 记录任命时间戳

### 5. RecordViolation（记录违规）
**目的**: 记录用户违规行为和扣分
**权限**: Stage 2 - 管理员全局、宿舍长限同宿舍
**业务规则**: Stage 2 - 目标用户在管辖范围内

```typescript
export const RecordViolation = Interaction.create({
  name: 'RecordViolation',
  action: Action.create({ name: 'recordViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'violator',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'violationType', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'description', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'scoreDeducted', 
        required: true 
      })
    ]
  })
});
```

**Effects**:
- 创建ViolationRecord实体
- 创建UserViolationRecordRelation（违规用户）
- 创建RecorderViolationRecordRelation（记录人）
- 自动更新用户总扣分

### 6. CreateKickoutRequest（创建踢出申请）
**目的**: 宿舍长申请踢出扣分过多的用户
**权限**: Stage 2 - 管理员全局、宿舍长限同宿舍
**业务规则**: Stage 2 - 目标用户扣分≥10、无pending申请

```typescript
export const CreateKickoutRequest = Interaction.create({
  name: 'CreateKickoutRequest',
  action: Action.create({ name: 'createKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUser',
        base: User,
        isRef: true,
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

**Effects**:
- 创建KickoutRequest实体（状态为pending）
- 创建RequestorKickoutRequestRelation（申请人）
- 创建TargetUserKickoutRequestRelation（目标用户）
- 记录申请时间戳

### 7. ProcessKickoutRequest（处理踢出申请）
**目的**: 管理员审核处理踢出申请
**权限**: Stage 2 - 仅管理员
**业务规则**: Stage 2 - 申请状态为pending

```typescript
export const ProcessKickoutRequest = Interaction.create({
  name: 'ProcessKickoutRequest',
  action: Action.create({ name: 'processKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'request',
        base: KickoutRequest,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'decision', 
        required: true 
      }) // 'approved' 或 'rejected'
    ]
  })
});
```

**Effects（同意时）**:
- 更新申请状态为approved
- 创建ProcessorKickoutRequestRelation（处理人）
- 更新UserDormitoryRelation状态为inactive
- 更新UserBedRelation状态为inactive
- 更新床位状态为available
- 记录处理时间戳

**Effects（拒绝时）**:
- 更新申请状态为rejected
- 创建ProcessorKickoutRequestRelation（处理人）
- 记录处理时间戳
- 用户分配关系保持不变

---

## 查询交互

### 8. GetDormitoryInfo（获取宿舍信息）
**目的**: 查询宿舍详细信息
**权限**: Stage 2 - 分级查看权限

```typescript
export const GetDormitoryInfo = Interaction.create({
  name: 'GetDormitoryInfo',
  action: Action.create({ name: 'getDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

### 9. GetUserInfo（获取用户信息）
**目的**: 查询用户详细信息
**权限**: Stage 2 - 分级查看权限

```typescript
export const GetUserInfo = Interaction.create({
  name: 'GetUserInfo',
  action: Action.create({ name: 'getUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

### 10. GetViolationRecords（获取违规记录）
**目的**: 查询违规记录列表
**权限**: Stage 2 - 分级查看权限

```typescript
export const GetViolationRecords = Interaction.create({
  name: 'GetViolationRecords',
  action: Action.create({ name: 'getViolationRecords' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true
      }), // 可选，指定用户
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true
      }), // 可选，指定宿舍
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

### 11. GetKickoutRequests（获取踢出申请列表）
**目的**: 查询踢出申请列表
**权限**: Stage 2 - 仅管理员可查看全部

```typescript
export const GetKickoutRequests = Interaction.create({
  name: 'GetKickoutRequests',
  action: Action.create({ name: 'getKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }), // pending/approved/rejected
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true
      }), // 可选，按宿舍筛选
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

---

## 管理交互

### 12. UpdateDormitoryInfo（更新宿舍信息）
**目的**: 更新宿舍基本信息
**权限**: Stage 2 - 仅管理员

```typescript
export const UpdateDormitoryInfo = Interaction.create({
  name: 'UpdateDormitoryInfo',
  action: Action.create({ name: 'updateDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'name' }), // 可选更新
      PayloadItem.create({ name: 'status' }) // active/inactive
    ]
  })
});
```

### 13. UpdateUserInfo（更新用户信息）
**目的**: 更新用户基本信息
**权限**: Stage 2 - 管理员可更新全部，用户可更新自己部分信息

```typescript
export const UpdateUserInfo = Interaction.create({
  name: 'UpdateUserInfo',
  action: Action.create({ name: 'updateUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'name' }), // 可选更新
      PayloadItem.create({ name: 'email' }), // 可选更新
      PayloadItem.create({ name: 'status' }) // active/inactive，仅管理员
    ]
  })
});
```

### 14. RemoveDormHead（撤销宿舍长）
**目的**: 撤销用户的宿舍长职务
**权限**: Stage 2 - 仅管理员

```typescript
export const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'removeDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

---

## 交互业务流程

### 用户入住完整流程
1. **CreateUser** → 创建用户账户
2. **CreateDormitory** → 创建宿舍和床位（如果不存在）
3. **AssignUserToDormitory** → 分配用户到宿舍床位
4. **AppointDormHead** → 任命其中一人为宿舍长

### 违规处理完整流程
1. **RecordViolation** → 记录用户违规行为
2. **GetViolationRecords** → 查看累计违规情况
3. **CreateKickoutRequest** → 扣分达标后申请踢出
4. **GetKickoutRequests** → 管理员查看待处理申请
5. **ProcessKickoutRequest** → 管理员审核处理申请

### 权限管理流程
1. **CreateUser** (role: student) → 创建普通学生
2. **AssignUserToDormitory** → 分配到宿舍
3. **AppointDormHead** → 任命为宿舍长获得管理权限
4. **RemoveDormHead** → 撤销宿舍长职务

---

## Stage 2 权限和业务规则（后续实现）

### 权限控制策略
- **管理员（admin）**: 所有操作的全局权限
- **宿舍长（dormHead）**: 仅对所管理宿舍内用户的管理权限
- **学生（student）**: 基础权限，主要是查看自己的信息

### 业务规则验证
- **容量限制**: 宿舍容量4-6床位
- **分配约束**: 用户只能分配一个宿舍一个床位
- **扣分阈值**: 扣分≥10才能申请踢出
- **状态检查**: 申请必须是pending状态才能处理
- **重复申请**: 同一用户不能有多个pending申请

### 错误处理模式
- **权限错误**: 角色不匹配时返回权限不足
- **业务规则错误**: 违反约束时返回具体错误信息
- **数据验证错误**: 输入格式错误时返回验证失败详情

---

## 验证清单

- [x] 所有用户操作都有对应的交互
- [x] Action仅包含name（无逻辑）
- [x] Payload项目有适当的required标记
- [x] 集合使用isCollection: true
- [x] 实体引用使用isRef和base
- [x] 不包含权限或约束（Stage 1）
- [x] 交互名称清晰明确
- [x] 一个用户操作对应一个交互
- [x] 完整的payload定义
- [x] 正确的数据类型

这个交互设计为宿舍管理系统提供了完整的用户操作接口，支持所有核心业务流程和后续的权限控制。