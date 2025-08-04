# 宿舍管理系统实体关系设计

## 实体设计

### 1. User (用户)
**用途**: 系统中的用户账户，包括管理员、宿舍长和普通学生
**属性**:
- id: string (系统生成唯一标识)
- name: string (用户姓名)
- email: string (邮箱，唯一标识)
- role: string (用户角色: admin/dormHead/student)
- points: number (行为积分，默认100)
- createdAt: number (创建时间戳)
- updatedAt: number (更新时间戳)

**注意**: User实体不包含dormitoryId或bedId等外键字段，这些通过关系定义

### 2. Dormitory (宿舍)
**用途**: 宿舍基本信息，包括容量和管理者
**属性**:
- id: string (系统生成唯一标识)
- name: string (宿舍名称，唯一)
- capacity: number (床位数量，4-6)
- status: string (状态: active/inactive)
- createdAt: number (创建时间戳)
- updatedAt: number (更新时间戳)

**注意**: Dormitory实体不包含headId字段，通过关系定义宿舍长

### 3. Bed (床位)
**用途**: 宿舍内的具体床位信息
**属性**:
- id: string (系统生成唯一标识)
- bedNumber: number (床位编号，从1开始)
- isOccupied: boolean (是否被占用)
- createdAt: number (创建时间戳)
- updatedAt: number (更新时间戳)

### 4. BehaviorRecord (行为记录)
**用途**: 记录用户的行为评分
**属性**:
- id: string (系统生成唯一标识)
- points: number (扣分/加分，通常为负数)
- reason: string (原因描述)
- createdAt: number (记录时间戳)

### 5. EvictionRequest (踢出申请)
**用途**: 宿舍长申请踢出用户的记录
**属性**:
- id: string (系统生成唯一标识)
- reason: string (申请原因)
- status: string (状态: pending/approved/rejected)
- createdAt: number (申请时间戳)
- approvedAt: number (审批时间戳，可选)
- approvedBy: string (审批人ID，可选)

## 关系设计

### 1. UserDormitoryRelation (用户-宿舍关系)
**类型**: n:1 (多对一)
**源**: User
**目标**: Dormitory
**源属性**: dormitory (User.dormitory)
**目标属性**: users (Dormitory.users)
**关系属性**:
- assignedAt: number (分配时间)
- bedNumber: number (分配的床位号)

**用途**: 建立用户与宿舍的分配关系，一个用户只能属于一个宿舍，一个宿舍可以有多个用户

### 2. DormitoryHeadRelation (宿舍长关系)
**类型**: 1:1 (一对一)
**源**: Dormitory
**目标**: User
**源属性**: head (Dormitory.head)
**目标属性**: managedDormitory (User.managedDormitory)
**关系属性**:
- assignedAt: number (任命时间)

**用途**: 指定宿舍的宿舍长，一个宿舍只有一个宿舍长，一个用户只能管理一个宿舍

### 3. BedDormitoryRelation (床位-宿舍关系)
**类型**: n:1 (多对一)
**源**: Bed
**目标**: Dormitory
**源属性**: dormitory (Bed.dormitory)
**目标属性**: beds (Dormitory.beds)

**用途**: 定义床位属于哪个宿舍，创建宿舍时自动生成相应数量的床位

### 4. BehaviorRecordUserRelation (行为记录-用户关系)
**类型**: n:1 (多对一)
**源**: BehaviorRecord
**目标**: User
**源属性**: user (BehaviorRecord.user)
**目标属性**: behaviorRecords (User.behaviorRecords)

**用途**: 关联行为记录和用户，用于查询用户的所有行为记录

### 5. BehaviorRecordRecorderRelation (行为记录-记录者关系)
**类型**: n:1 (多对一)
**源**: BehaviorRecord
**目标**: User
**源属性**: recordedBy (BehaviorRecord.recordedBy)
**目标属性**: recordedBehaviors (User.recordedBehaviors)

**用途**: 记录是谁创建了这条行为记录（管理员或宿舍长）

### 6. EvictionRequestUserRelation (踢出申请-用户关系)
**类型**: n:1 (多对一)
**源**: EvictionRequest
**目标**: User
**源属性**: user (EvictionRequest.user)
**目标属性**: evictionRequests (User.evictionRequests)

**用途**: 关联踢出申请和被申请的用户

### 7. EvictionRequestRequesterRelation (踢出申请-申请人关系)
**类型**: n:1 (多对一)
**源**: EvictionRequest
**目标**: User
**源属性**: requestedBy (EvictionRequest.requestedBy)
**目标属性**: requestedEvictions (User.requestedEvictions)

**用途**: 记录是谁提交了这个踢出申请（宿舍长）

### 8. EvictionRequestApproverRelation (踢出申请-审批人关系)
**类型**: n:1 (多对一)
**源**: EvictionRequest
**目标**: User
**源属性**: approvedBy (EvictionRequest.approvedBy)
**目标属性**: approvedEvictions (User.approvedEvictions)

**用途**: 记录是谁批准了这个踢出申请（管理员）

## 数据流图

```
User (1) ──┐
           │
           ├── UserDormitoryRelation ── (n) Dormitory
           │                              │
           │                              ├── DormitoryHeadRelation ── (1) User (宿舍长)
           │                              │
           │                              └── BedDormitoryRelation ── (n) Bed
           │
           └── BehaviorRecordUserRelation ── (n) BehaviorRecord
                                          │
                                          └── BehaviorRecordRecorderRelation ── (1) User (记录者)

EvictionRequest ── EvictionRequestUserRelation ── User (被申请者)
       │
       ├── EvictionRequestRequesterRelation ── User (申请人)
       │
       └── EvictionRequestApproverRelation ── User (审批人)
```

## 实体关系约束

### 1. 唯一性约束
- User.email 必须唯一
- Dormitory.name 必须唯一
- Bed.bedNumber 在同一Dormitory内必须唯一

### 2. 基数约束
- 每个User最多只能有一个Dormitory (通过UserDormitoryRelation)
- 每个Dormitory最多只能有一个head (通过DormitoryHeadRelation)
- 每个User最多只能管理一个Dormitory (通过DormitoryHeadRelation)
- 每个Bed必须属于一个Dormitory (通过BedDormitoryRelation)

### 3. 业务约束
- Dormitory.capacity 必须在4-6之间
- User.points 不能为负数
- Bed.isOccupied 必须与实际分配状态一致

## 计算属性需求

### 1. User 计算属性
- totalPoints: 所有行为记录的积分总和
- behaviorCount: 行为记录总数
- isActiveInDormitory: 是否在宿舍中有有效分配

### 2. Dormitory 计算属性
- occupancy: 当前占用人数
- availableBeds: 可用床位数
- occupancyRate: 占用率 (occupancy/cacity)

### 3. Bed 计算属性
- status: 床位状态 (available/occupied)
- occupiedBy: 占用的用户 (通过关系查询)

## 索引设计建议

### 1. User 实体索引
- email (唯一索引)
- role (普通索引)

### 2. Dormitory 实体索引
- name (唯一索引)
- status (普通索引)

### 3. BehaviorRecord 索引
- userId (普通索引)
- createdAt (普通索引)

### 4. EvictionRequest 索引
- userId (普通索引)
- status (普通索引)
- createdAt (普通索引)

## 常见错误避免

### ❌ 错误的设计
```typescript
// 错误：在User实体中添加外键
const User = Entity.create({
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }), // ❌ 不要这样做
    Property.create({ name: 'bedId', type: 'string' }),       // ❌ 不要这样做
    Property.create({ name: 'headOfDormId', type: 'string' }) // ❌ 不要这样做
  ]
})
```

### ✅ 正确的设计
```typescript
// 正确：使用关系定义
const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  sourceProperty: 'dormitory',  // 创建 user.dormitory
  targetProperty: 'users',      // 创建 dormitory.users
  type: 'n:1'
})

const DormitoryHeadRelation = Relation.create({
  source: Dormitory,
  target: User,
  sourceProperty: 'head',      // 创建 dormitory.head
  targetProperty: 'managedDormitory', // 创建 user.managedDormitory
  type: '1:1'
})
```

这种设计确保了数据的完整性和一致性，所有关系都通过框架的关系机制来维护。