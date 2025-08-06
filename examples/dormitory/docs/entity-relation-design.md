# 宿舍管理系统实体和关系设计

## 实体设计

### User (用户)
**目的**: 系统中的所有用户，包括管理员、宿舍长和学生
**属性**:
- `id`: string (系统生成的唯一标识)
- `name`: string (用户姓名)
- `email`: string (邮箱地址，唯一)
- `phone`: string (手机号码)
- `role`: string (用户角色: admin/dormHead/student)
- `status`: string (用户状态: active/suspended/expelled)
- `createdAt`: number (创建时间戳)
- `totalPenaltyPoints`: number (累计扣分，通过计算得出)

### Dormitory (宿舍)
**目的**: 宿舍楼宇信息
**属性**:
- `id`: string (宿舍唯一标识)
- `name`: string (宿舍名称，如"A栋101")
- `bedCount`: number (床位总数，4-6)
- `availableBedCount`: number (可用床位数，通过计算得出)
- `createdAt`: number (创建时间戳)

### Bed (床位)
**目的**: 宿舍内的具体床位
**属性**:
- `id`: string (床位唯一标识)
- `bedNumber`: string (床位编号，如"床位1")
- `status`: string (床位状态: available/occupied/maintenance)
- `createdAt`: number (创建时间戳)

### UserBedAssignment (用户床位分配)
**目的**: 用户与床位的分配关系
**属性**:
- `id`: string (分配记录唯一标识)
- `assignedAt`: number (分配时间戳)
- `status`: string (分配状态: active/inactive)

### BehaviorRecord (行为记录)
**目的**: 用户违规行为记录
**属性**:
- `id`: string (记录唯一标识)
- `behaviorType`: string (违规类型: noise_violation/damage/hygiene/other)
- `description`: string (违规描述)
- `penaltyPoints`: number (扣分数值)
- `recordedAt`: number (记录时间戳)

### ExpulsionRequest (踢出申请)
**目的**: 宿舍长申请踢出学生的请求
**属性**:
- `id`: string (申请唯一标识)
- `reason`: string (申请理由)
- `status`: string (申请状态: pending/approved/rejected)
- `requestedAt`: number (申请时间戳)
- `processedAt`: number (处理时间戳，可选)
- `adminNotes`: string (管理员备注，可选)

## 关系设计

### UserDormitoryHeadRelation (用户-宿舍长关系)
**类型**: n:1 (多个用户可以是宿舍长，但每个宿舍只有一个宿舍长)
**目的**: 建立宿舍长与其管理宿舍的关系
**源实体**: User (dormHead角色)
**目标实体**: Dormitory
**源属性**: `managedDormitory` (在User实体上创建此属性)
**目标属性**: `dormHead` (在Dormitory实体上创建此属性)
**关系属性**:
- `assignedAt`: number (指定时间戳)

**业务含义**: 宿舍长通过此关系管理特定宿舍，用户可以通过`user.managedDormitory`访问管理的宿舍，宿舍可以通过`dormitory.dormHead`访问宿舍长。

### DormitoryBedRelation (宿舍-床位关系)
**类型**: 1:n (一个宿舍有多个床位)
**目的**: 建立宿舍与其床位的关系
**源实体**: Dormitory
**目标实体**: Bed
**源属性**: `beds` (在Dormitory实体上创建此属性)
**目标属性**: `dormitory` (在Bed实体上创建此属性)
**关系属性**: 无

**业务含义**: 每个床位属于一个宿舍，宿舍可以通过`dormitory.beds`访问所有床位，床位可以通过`bed.dormitory`访问所属宿舍。

### UserBedAssignmentRelation (用户-床位分配关系)
**类型**: n:1 (多个分配记录对应一个用户，多个分配记录对应一个床位)
**目的**: 建立用户与床位的分配关系
**源实体**: UserBedAssignment
**目标实体**: User
**源属性**: `user` (在UserBedAssignment实体上)
**目标属性**: `bedAssignments` (在User实体上)
**关系属性**: 无

### BedAssignmentBedRelation (床位分配-床位关系)
**类型**: n:1 (多个分配记录对应一个床位)
**目的**: 建立床位分配与床位的关系
**源实体**: UserBedAssignment
**目标实体**: Bed
**源属性**: `bed` (在UserBedAssignment实体上)
**目标属性**: `assignments` (在Bed实体上)
**关系属性**: 无

### UserBehaviorRecordRelation (用户-行为记录关系)
**类型**: 1:n (一个用户有多个行为记录)
**目的**: 建立用户与其行为记录的关系
**源实体**: User
**目标实体**: BehaviorRecord
**源属性**: `behaviorRecords` (在User实体上)
**目标属性**: `user` (在BehaviorRecord实体上)
**关系属性**: 无

### BehaviorRecordRecorderRelation (行为记录-记录人关系)
**类型**: n:1 (多个记录对应一个记录人)
**目的**: 建立行为记录与记录人(宿舍长/管理员)的关系
**源实体**: BehaviorRecord
**目标实体**: User (记录人)
**源属性**: `recorder` (在BehaviorRecord实体上)
**目标属性**: `recordedBehaviors` (在User实体上)
**关系属性**: 无

### ExpulsionRequestRequesterRelation (踢出申请-申请人关系)
**类型**: n:1 (多个申请对应一个申请人)
**目的**: 建立踢出申请与申请人(宿舍长)的关系
**源实体**: ExpulsionRequest
**目标实体**: User (申请人)
**源属性**: `requester` (在ExpulsionRequest实体上)
**目标属性**: `expulsionRequests` (在User实体上)
**关系属性**: 无

### ExpulsionRequestTargetRelation (踢出申请-目标用户关系)
**类型**: n:1 (多个申请对应一个目标用户)
**目的**: 建立踢出申请与目标用户(学生)的关系
**源实体**: ExpulsionRequest
**目标实体**: User (目标用户)
**源属性**: `targetUser` (在ExpulsionRequest实体上)
**目标属性**: `expulsionRequestsAgainst` (在User实体上)
**关系属性**: 无

## 数据流图

```
User (Student) ──1:n──> UserBedAssignment ──n:1──> Bed ──n:1──> Dormitory
    │                                                               │
    │                                                            1:n│
    │                                                               │
    └──1:n──> BehaviorRecord                                 User (DormHead)
    │
    │
    └──1:n──> ExpulsionRequest (as target)
              │
              └──n:1──> User (DormHead as requester)
```

## 关键设计决策

### 🔴 NO ID引用字段
**正确做法**: 所有实体间的关系都通过Relation定义，实体属性中不包含任何ID引用字段。

**错误示例**:
```typescript
// ❌ 错误：实体中包含ID引用
const User = Entity.create({
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }), // 不要这样!
    Property.create({ name: 'bedId', type: 'string' })       // 不要这样!
  ]
})
```

**正确示例**:
```typescript
// ✅ 正确：通过Relation建立关系
const UserBedAssignmentRelation = Relation.create({
  source: UserBedAssignment,
  target: User,
  sourceProperty: 'user',    // 创建 assignment.user
  targetProperty: 'bedAssignments', // 创建 user.bedAssignments
  type: 'n:1'
})
```

### 分配关系设计
选择使用独立的`UserBedAssignment`实体而不是直接的User-Bed关系，原因:
1. 需要记录分配的时间戳和状态
2. 支持历史记录查询 (用户可能被重新分配)
3. 便于实现复杂的分配规则和状态管理

### 计算属性设计
以下属性将通过计算实现:
- `User.totalPenaltyPoints`: 累计所有BehaviorRecord的penaltyPoints
- `Dormitory.availableBedCount`: 统计状态为'available'的床位数量

### 过滤实体潜在需求
可能需要的过滤实体:
- `ActiveUser`: 过滤status='active'的用户
- `AvailableBed`: 过滤status='available'的床位
- `PendingExpulsionRequest`: 过滤status='pending'的踢出申请

## 验证清单
- [ ] 所有实体名称使用PascalCase单数形式
- [ ] 所有属性使用正确的类型
- [ ] 所有defaultValue使用函数形式
- [ ] 关系定义中没有name属性(自动生成)
- [ ] 关系类型使用正确格式('1:1', 'n:1'等)
- [ ] 实体属性中没有ID引用字段
- [ ] 所有实体间关系都通过Relation定义