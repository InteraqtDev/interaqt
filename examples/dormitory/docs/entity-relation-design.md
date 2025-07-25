# 宿舍管理系统实体关系设计

## 设计原则

基于 `requirements/detailed-requirements.md` 的需求分析，遵循以下关键原则：

- **🔴 关键**: 实体属性中不包含引用ID字段
- **所有关系通过Relation定义实现**
- **属性仅包含原始值、计算值或嵌入数据结构**
- **实体间连接必须使用Relations**

---

## 实体定义

### 1. User（用户）
**业务目的**: 系统中的所有用户，包含管理员、宿舍长、普通学生

```typescript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }), // admin/dormHead/student
    Property.create({ 
      name: 'score', 
      type: 'number', 
      defaultValue: () => 0 
    }), // 当前扣分值
    Property.create({ 
      name: 'createdAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active' 
    }) // active/inactive
  ]
});
```

**说明**:
- `score` 为违规累计扣分，通过计算属性从违规记录累加
- `role` 决定用户权限：admin（管理员）、dormHead（宿舍长）、student（学生）
- 不包含 `dormitoryId` 等引用字段，通过Relation访问

### 2. Dormitory（宿舍）
**业务目的**: 宿舍信息管理

```typescript
const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }), // 宿舍名称
    Property.create({ name: 'capacity', type: 'number' }), // 床位容量（4-6）
    Property.create({ 
      name: 'createdAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active' 
    }) // active/inactive
  ]
});
```

**说明**:
- `capacity` 限制为4-6个床位，通过业务规则验证
- 当前入住人数通过计算属性从关系中统计
- 不包含 `dormHeadId` 等引用字段

### 3. Bed（床位）
**业务目的**: 宿舍内具体床位管理

```typescript
const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'bedNumber', type: 'string' }), // 床位号如"A1"
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'available' 
    }), // available/occupied/maintenance
    Property.create({ 
      name: 'createdAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    })
  ]
});
```

**说明**:
- 床位状态管理生命周期：available → occupied → available
- 通过关系连接到宿舍和用户

### 4. ViolationRecord（违规记录）
**业务目的**: 记录用户违规行为和扣分情况

```typescript
const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ name: 'violationType', type: 'string' }), // 违规类型
    Property.create({ name: 'description', type: 'string' }), // 违规描述
    Property.create({ name: 'scoreDeducted', type: 'number' }), // 扣除分数
    Property.create({ 
      name: 'recordedAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    })
  ]
});
```

**说明**:
- 记录具体违规信息和扣分数量
- 记录人和违规人通过关系连接
- 用于计算用户总扣分

### 5. KickoutRequest（踢出申请）
**业务目的**: 宿舍长申请踢出用户的流程管理

```typescript
const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }), // 申请理由
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'pending' 
    }), // pending/approved/rejected
    Property.create({ 
      name: 'requestedAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ name: 'processedAt', type: 'bigint' }), // 可选
    Property.create({ name: 'decision', type: 'string' }) // approved/rejected
  ]
});
```

**说明**:
- 申请状态流转：pending → approved/rejected
- 申请人、目标用户、处理人通过关系连接

---

## 关系定义

### 1. UserDormitoryRelation（用户-宿舍关系）
**类型**: n:1（多个用户对应一个宿舍）
**业务目的**: 记录用户被分配到哪个宿舍

```typescript
const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1',
  sourceProperty: 'dormitory', // user.dormitory
  targetProperty: 'users', // dormitory.users
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active' 
    }) // active/inactive
  ]
});
```

### 2. UserBedRelation（用户-床位关系）
**类型**: 1:1（一个用户对应一个床位）
**业务目的**: 记录用户具体占用的床位

```typescript
const UserBedRelation = Relation.create({
  source: User,
  target: Bed,
  type: '1:1',
  sourceProperty: 'bed', // user.bed
  targetProperty: 'user', // bed.user
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active' 
    }) // active/inactive
  ]
});
```

### 3. DormitoryBedRelation（宿舍-床位关系）
**类型**: 1:n（一个宿舍包含多个床位）
**业务目的**: 记录宿舍包含的所有床位

```typescript
const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  target: Bed,
  type: '1:n',
  sourceProperty: 'beds', // dormitory.beds
  targetProperty: 'dormitory', // bed.dormitory
  properties: [
    Property.create({ 
      name: 'createdAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    })
  ]
});
```

### 4. DormitoryHeadRelation（宿舍长关系）
**类型**: 1:1（一个宿舍有一个宿舍长）
**业务目的**: 记录宿舍长职责分配

```typescript
const DormitoryHeadRelation = Relation.create({
  source: Dormitory,
  target: User,
  type: '1:1',
  sourceProperty: 'dormHead', // dormitory.dormHead
  targetProperty: 'managedDormitory', // user.managedDormitory
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'bigint', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active' 
    }) // active/inactive
  ]
});
```

### 5. UserViolationRecordRelation（用户-违规记录关系）
**类型**: 1:n（一个用户可有多个违规记录）
**业务目的**: 关联违规用户和其违规记录

```typescript
const UserViolationRecordRelation = Relation.create({
  source: User,
  target: ViolationRecord,
  type: '1:n',
  sourceProperty: 'violationRecords', // user.violationRecords
  targetProperty: 'violator', // violationRecord.violator
  properties: []
});
```

### 6. RecorderViolationRecordRelation（记录人-违规记录关系）
**类型**: 1:n（一个记录人可记录多个违规）
**业务目的**: 关联记录人和违规记录

```typescript
const RecorderViolationRecordRelation = Relation.create({
  source: User,
  target: ViolationRecord,
  type: '1:n',
  sourceProperty: 'recordedViolations', // user.recordedViolations
  targetProperty: 'recorder', // violationRecord.recorder
  properties: []
});
```

### 7. KickoutRequest 相关关系

#### RequestorKickoutRequestRelation（申请人-踢出申请）
```typescript
const RequestorKickoutRequestRelation = Relation.create({
  source: User,
  target: KickoutRequest,
  type: '1:n',
  sourceProperty: 'kickoutRequests', // user.kickoutRequests
  targetProperty: 'requestor', // kickoutRequest.requestor
  properties: []
});
```

#### TargetUserKickoutRequestRelation（目标用户-踢出申请）
```typescript
const TargetUserKickoutRequestRelation = Relation.create({
  source: User,
  target: KickoutRequest,
  type: '1:n',
  sourceProperty: 'kickoutRequestsAgainst', // user.kickoutRequestsAgainst
  targetProperty: 'targetUser', // kickoutRequest.targetUser
  properties: []
});
```

#### ProcessorKickoutRequestRelation（处理人-踢出申请）
```typescript
const ProcessorKickoutRequestRelation = Relation.create({
  source: User,
  target: KickoutRequest,
  type: '1:n',
  sourceProperty: 'processedKickoutRequests', // user.processedKickoutRequests
  targetProperty: 'processor', // kickoutRequest.processor
  properties: []
});
```

---

## 计算属性设计

### User实体计算属性
1. **totalScore**: 从用户的所有违规记录累加扣分
2. **isEligibleForKickout**: 判断扣分是否≥10，可被申请踢出

### Dormitory实体计算属性
1. **currentOccupancy**: 当前入住人数（active状态的用户关系数量）
2. **availableBeds**: 可用床位数量（available状态的床位）
3. **occupancyRate**: 入住率（currentOccupancy / capacity）

### Bed实体计算属性
1. **isAvailable**: 床位是否可分配（status === 'available'）

---

## 过滤实体设计

### ActiveUser（活跃用户）
```typescript
const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});
```

### AvailableBed（可用床位）
```typescript
const AvailableBed = Entity.create({
  name: 'AvailableBed',
  sourceEntity: Bed,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'available']
  })
});
```

### PendingKickoutRequest（待处理踢出申请）
```typescript
const PendingKickoutRequest = Entity.create({
  name: 'PendingKickoutRequest',
  sourceEntity: KickoutRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});
```

---

## 数据流图

### 用户分配流程
```
CreateDormitory → Dormitory + Beds
CreateUser → User
AssignUserToDormitory → UserDormitoryRelation + UserBedRelation
AppointDormHead → DormitoryHeadRelation
```

### 违规处理流程
```
RecordViolation → ViolationRecord + UserViolationRecordRelation + RecorderViolationRecordRelation
CreateKickoutRequest → KickoutRequest + RequestorKickoutRequestRelation + TargetUserKickoutRequestRelation
ProcessKickoutRequest → Update KickoutRequest + ProcessorKickoutRequestRelation
```

---

## 关系访问示例

```typescript
// 用户访问其宿舍
const userDormitory = user.dormitory; // UserDormitoryRelation

// 宿舍访问所有用户
const dormitoryUsers = dormitory.users; // UserDormitoryRelation

// 用户访问其床位
const userBed = user.bed; // UserBedRelation

// 宿舍访问宿舍长
const dormHead = dormitory.dormHead; // DormitoryHeadRelation

// 用户访问违规记录
const violations = user.violationRecords; // UserViolationRecordRelation

// 用户访问针对其的踢出申请
const kickoutRequests = user.kickoutRequestsAgainst; // TargetUserKickoutRequestRelation
```

---

## 验证清单

- [x] 所有实体名称采用PascalCase和单数形式
- [x] 所有属性具有正确类型
- [x] 所有defaultValue都是函数，不是静态值
- [x] 没有关系具有name属性（自动生成）
- [x] 关系类型使用正确格式（'1:1'、'n:1'等）
- [x] 没有从interaqt包导入实体
- [x] 过滤实体具有有效的sourceEntity和filterCondition
- [x] 实体属性中不包含引用ID字段
- [x] 所有实体间连接使用Relations定义

这个设计为宿舍管理系统提供了完整的数据模型基础，支持所有业务需求和权限控制。