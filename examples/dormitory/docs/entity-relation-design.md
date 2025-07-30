# 宿舍管理系统实体和关系设计

## 概述

本文档定义了宿舍管理系统中的所有实体和关系，基于详细需求分析，确保数据模型的完整性和一致性。

## 核心实体定义

### 1. 用户实体 (User)

**目的**: 系统中的用户，包含不同角色
**业务含义**: 代表系统的使用者，包括管理员、宿舍长和学生

```typescript
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string'  // 'admin' | 'dormHead' | 'student'
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 100  // 初始分数100分
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'  // 'active' | 'expelled'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});
```

**属性说明**:
- `name`: 用户姓名
- `email`: 邮箱，作为唯一标识
- `role`: 用户角色，控制权限
- `score`: 行为评分，影响踢人申请
- `status`: 用户状态，expelled用户无法正常使用系统
- `createdAt`: 创建时间戳

### 2. 宿舍实体 (Dormitory)

**目的**: 宿舍建筑物，包含多个床位
**业务含义**: 学生居住的宿舍单元，由管理员创建和管理

```typescript
export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ 
      name: 'capacity', 
      type: 'number'  // 4-6个床位
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
    // 注意: occupiedCount和availableCount将通过计算属性实现
  ]
});
```

**属性说明**:
- `name`: 宿舍名称，如"1号楼101"
- `capacity`: 床位总数，必须在4-6之间
- `createdAt`: 宿舍创建时间
- 占用统计(`occupiedCount`, `availableCount`)将通过计算属性动态生成

### 3. 床位实体 (Bed)

**目的**: 宿舍中的具体床位
**业务含义**: 用户分配的具体睡眠位置，确保精确的床位管理

```typescript
export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'bedNumber', 
      type: 'number'  // 床位号1-6
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'available'  // 'available' | 'occupied'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});
```

**属性说明**:
- `bedNumber`: 床位编号，在宿舍内唯一
- `status`: 床位状态，影响分配逻辑
- `createdAt`: 床位创建时间（宿舍创建时自动生成）

### 4. 扣分记录实体 (ScoreRecord)

**目的**: 记录用户的扣分行为和原因
**业务含义**: 用户违规行为的记录，用于分数统计和历史追踪

```typescript
export const ScoreRecord = Entity.create({
  name: 'ScoreRecord',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});
```

**属性说明**:
- `reason`: 扣分原因，如"晚归"、"卫生不达标"
- `points`: 扣分数值，必须为正数
- `createdAt`: 扣分时间

### 5. 踢人申请实体 (ExpelRequest)

**目的**: 宿舍长申请踢出用户的记录
**业务含义**: 踢人流程的核心记录，包含申请、审批状态

```typescript
export const ExpelRequest = Entity.create({
  name: 'ExpelRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'  // 'pending' | 'approved' | 'rejected'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number'  // 处理时间，可选
    }),
    Property.create({ name: 'comment', type: 'string' })  // 管理员处理意见
  ]
});
```

**属性说明**:
- `reason`: 申请踢出的原因
- `status`: 申请状态，控制处理流程
- `createdAt`: 申请提交时间
- `processedAt`: 管理员处理时间
- `comment`: 管理员处理意见

## 关系定义

### 1. 用户-宿舍关系 (UserDormitoryRelation)

**类型**: n:1 (多个用户对应一个宿舍)
**目的**: 记录用户被分配到哪个宿舍
**业务含义**: 建立用户和宿舍的居住关系

```typescript
export const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'  // 'active' | 'inactive'
    })
  ]
});
```

**访问属性**:
- 用户端: `user.dormitory` - 访问用户所在宿舍
- 宿舍端: `dormitory.residents` - 访问宿舍内所有用户

### 2. 用户-床位关系 (UserBedRelation)

**类型**: 1:1 (一个用户对应一个床位)
**目的**: 记录用户占用的具体床位
**业务含义**: 精确的床位分配关系

```typescript
export const UserBedRelation = Relation.create({
  source: User,
  target: Bed,
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});
```

**访问属性**:
- 用户端: `user.bed` - 访问用户的床位
- 床位端: `bed.occupant` - 访问床位的占用者

### 3. 宿舍-床位关系 (DormitoryBedRelation)

**类型**: 1:n (一个宿舍对应多个床位)
**目的**: 床位属于哪个宿舍
**业务含义**: 床位的归属关系

```typescript
export const DormitoryBedRelation = Relation.create({
  source: Bed,
  target: Dormitory,
  type: 'n:1'
});
```

**访问属性**:
- 床位端: `bed.dormitory` - 访问床位所属宿舍
- 宿舍端: `dormitory.beds` - 访问宿舍内所有床位

### 4. 宿舍-宿舍长关系 (DormitoryHeadRelation)

**类型**: 1:1 (一个宿舍对应一个宿舍长)
**目的**: 指定宿舍的管理员
**业务含义**: 宿舍的管理权分配

```typescript
export const DormitoryHeadRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
});
```

**访问属性**:
- 用户端: `user.managedDormitory` - 访问用户管理的宿舍
- 宿舍端: `dormitory.head` - 访问宿舍的宿舍长

### 5. 用户-扣分记录关系 (UserScoreRecordRelation)

**类型**: 1:n (一个用户对应多个扣分记录)
**目的**: 记录用户的所有扣分历史
**业务含义**: 用户行为记录的关联

```typescript
export const UserScoreRecordRelation = Relation.create({
  source: ScoreRecord,
  target: User,
  type: 'n:1'
});
```

**访问属性**:
- 扣分记录端: `scoreRecord.user` - 访问被扣分的用户
- 用户端: `user.scoreRecords` - 访问用户的所有扣分记录

### 6. 扣分记录-扣分执行人关系 (ScoreRecordDeductorRelation)

**类型**: n:1 (多个扣分记录对应一个执行人)
**目的**: 记录谁执行了扣分操作
**业务含义**: 扣分操作的责任追踪

```typescript
export const ScoreRecordDeductorRelation = Relation.create({
  source: ScoreRecord,
  target: User,
  type: 'n:1'
});
```

**访问属性**:
- 扣分记录端: `scoreRecord.deductor` - 访问执行扣分的用户
- 用户端: `user.deductedScoreRecords` - 访问用户执行的扣分记录

### 7. 踢人申请相关关系

#### 申请人-踢人申请关系 (ApplicantExpelRequestRelation)
```typescript
export const ApplicantExpelRequestRelation = Relation.create({
  source: ExpelRequest,
  target: User,
  type: 'n:1'
});
```

**访问属性**:
- 申请端: `expelRequest.applicant` - 申请人
- 用户端: `user.submittedExpelRequests` - 用户提交的申请

#### 被申请人-踢人申请关系 (TargetExpelRequestRelation)
```typescript
export const TargetExpelRequestRelation = Relation.create({
  source: ExpelRequest,
  target: User,
  type: 'n:1'
});
```

**访问属性**:
- 申请端: `expelRequest.targetUser` - 被申请踢出的用户
- 用户端: `user.receivedExpelRequests` - 用户收到的踢人申请

#### 处理人-踢人申请关系 (ProcessorExpelRequestRelation)
```typescript
export const ProcessorExpelRequestRelation = Relation.create({
  source: ExpelRequest,
  target: User,
  type: 'n:1'
});
```

**访问属性**:
- 申请端: `expelRequest.processor` - 处理申请的管理员
- 用户端: `user.processedExpelRequests` - 用户处理的申请

## 过滤实体

### 1. 活跃用户 (ActiveUser)

**目的**: 过滤出状态为active的用户
**业务含义**: 可正常使用系统的用户，排除被踢出的用户

```typescript
export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});
```

### 2. 可用床位 (AvailableBed)

**目的**: 过滤出状态为available的床位
**业务含义**: 可分配给用户的空闲床位

```typescript
export const AvailableBed = Entity.create({
  name: 'AvailableBed',
  sourceEntity: Bed,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'available']
  })
});
```

### 3. 待处理踢人申请 (PendingExpelRequest)

**目的**: 过滤出状态为pending的踢人申请
**业务含义**: 需要管理员处理的申请

```typescript
export const PendingExpelRequest = Entity.create({
  name: 'PendingExpelRequest',
  sourceEntity: ExpelRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});
```

### 4. 低分用户 (LowScoreUser)

**目的**: 过滤出分数低于60分的用户
**业务含义**: 可能被踢出的用户，用于宿舍长决策

```typescript
export const LowScoreUser = Entity.create({
  name: 'LowScoreUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'score',
    value: ['<', 60]
  }).and({
    key: 'status',
    value: ['=', 'active']
  })
});
```

## 数据流程图

```
创建用户 → 创建宿舍(含床位) → 分配用户到床位 → 指定宿舍长
                                    ↓
扣分记录 ← 宿舍长扣分 ← 违规行为发生 ← 日常管理
   ↓
分数计算 → 低于阈值 → 宿舍长申请踢人 → 管理员审批 → 释放床位
```

## 关键约束

### 1. 实体属性约束
- **用户邮箱唯一性**: 每个用户必须有唯一邮箱
- **宿舍容量限制**: 每个宿舍容量必须在4-6之间
- **床位编号唯一性**: 同一宿舍内床位编号不能重复
- **扣分数值正数**: 扣分必须为正数

### 2. 关系约束
- **用户唯一宿舍**: 一个用户只能分配到一个宿舍
- **床位唯一占用**: 一个床位只能被一个用户占用
- **宿舍唯一宿舍长**: 一个宿舍只能有一个宿舍长
- **宿舍长必须是住户**: 宿舍长必须居住在管理的宿舍内

### 3. 业务规则约束
- **踢人申请条件**: 只有分数<60的用户才能被申请踢出
- **宿舍长权限范围**: 宿舍长只能管理自己宿舍内的用户
- **床位分配条件**: 只能分配到available状态的床位
- **申请状态管理**: 已处理的踢人申请不能重复处理

## 实现注意事项

### ❌ 常见错误
```typescript
// 错误: 在实体中包含关系ID字段
const User = Entity.create({
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }),  // ❌ 不要这样做
    Property.create({ name: 'bedId', type: 'string' })         // ❌ 不要这样做
  ]
});

// 错误: 为关系指定name属性
const UserDormitoryRelation = Relation.create({
  name: 'UserDormitory',  // ❌ 名称会自动生成
  source: User,
  target: Dormitory,
  type: 'n:1'
});

// 错误: 静态默认值
Property.create({ 
  name: 'status', 
  type: 'string',
  defaultValue: 'active'  // ❌ 必须是函数
});
```

### ✅ 正确实现
```typescript
// 正确: 通过关系连接实体
const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1'  // 自动创建user.dormitory和dormitory.residents访问器
});

// 正确: 函数形式的默认值
Property.create({ 
  name: 'status', 
  type: 'string',
  defaultValue: () => 'active'
});

// 正确: 通过关系访问相关数据
// user.dormitory 访问用户宿舍
// dormitory.residents 访问宿舍用户列表
// bed.occupant 访问床位占用者
```

## 验证清单

- [ ] 所有实体名称为单数PascalCase格式
- [ ] 所有属性类型正确指定
- [ ] 所有defaultValue都是函数形式
- [ ] 所有关系没有name属性
- [ ] 关系类型格式正确('1:1', '1:n', 'n:1', 'n:n')
- [ ] 没有从interaqt导入实体
- [ ] 过滤实体有有效的sourceEntity和filterCondition
- [ ] 实体属性中没有关系ID字段
- [ ] 所有关系的业务含义清晰
- [ ] TypeScript编译通过

此设计文档确保了数据模型的完整性，为后续的交互和计算实现提供了坚实的基础。