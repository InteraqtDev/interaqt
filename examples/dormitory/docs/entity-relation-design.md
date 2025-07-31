# 宿舍管理系统实体关系设计

## 1. 实体设计 (Entities)

### 1.1 User (用户)
**用途**: 系统中的所有人员，包括管理员、宿舍长、学生
**属性**:
- `id`: string (系统自动生成)
- `name`: string (用户姓名)
- `email`: string (邮箱，唯一标识)
- `role`: string (角色: admin/dormHead/student, 默认: student)
- `totalScore`: number (当前总分数，默认: 100)
- `status`: string (用户状态: active/kicked/suspended，默认: active)
- `createdAt`: number (创建时间戳，默认: 当前时间)
- `updatedAt`: number (更新时间戳，默认: 当前时间)

**设计说明**:
- 用户角色通过 `role` 字段区分，而非独立实体
- `totalScore` 将通过计算属性从扣分记录自动计算
- `status` 控制用户的系统访问权限

### 1.2 Dormitory (宿舍)
**用途**: 宿舍建筑单位，包含多个床位
**属性**:
- `id`: string (系统自动生成)
- `name`: string (宿舍名称，如"A栋101"，必须唯一)
- `capacity`: number (床位数量，限制4-6)
- `currentOccupancy`: number (当前入住人数，默认: 0)
- `status`: string (宿舍状态: active/inactive/maintenance，默认: active)
- `createdAt`: number (创建时间戳，默认: 当前时间)
- `updatedAt`: number (更新时间戳，默认: 当前时间)

**设计说明**:
- `currentOccupancy` 将通过计算属性从用户关系自动计算
- `capacity` 限制在4-6之间，通过业务规则验证

### 1.3 ScoreRule (扣分规则)
**用途**: 定义各种违规行为的扣分标准
**属性**:
- `id`: string (系统自动生成)
- `name`: string (规则名称，如"晚归")
- `description`: string (规则详细描述)
- `scoreDeduction`: number (扣分数值，必须 > 0)
- `isActive`: boolean (规则是否生效，默认: true)
- `createdAt`: number (创建时间戳，默认: 当前时间)
- `updatedAt`: number (更新时间戳，默认: 当前时间)

**设计说明**:
- 只有 `isActive: true` 的规则才能用于扣分
- `scoreDeduction` 为正数，实际扣分时用减法操作

### 1.4 ScoreRecord (扣分记录)
**用途**: 记录用户的具体扣分情况，不可删除
**属性**:
- `id`: string (系统自动生成)
- `reason`: string (扣分原因，操作员填写)
- `score`: number (扣分数值，来源于规则)
- `createdAt`: number (扣分时间戳，默认: 当前时间)
- `operatorNotes`: string (操作员备注，可选)

**设计说明**:
- 扣分记录只能创建，不能修改或删除，确保审计完整性
- `score` 与 `ScoreRule.scoreDeduction` 相同，记录时复制值

### 1.5 KickRequest (踢出申请)
**用途**: 宿舍长申请踢出某用户的记录
**属性**:
- `id`: string (系统自动生成)
- `reason`: string (申请理由)
- `status`: string (申请状态: pending/approved/rejected，默认: pending)
- `createdAt`: number (申请时间戳，默认: 当前时间)
- `processedAt`: number (处理时间戳，批准/拒绝时设置)
- `adminNotes`: string (管理员处理备注，可选)

**设计说明**:
- 状态为 `pending` 时等待管理员处理
- `processedAt` 只在状态变更为 `approved/rejected` 时设置

## 2. 关系设计 (Relations)

### 2.1 UserDormitoryRelation (用户-宿舍关系)
**类型**: n:1 (多个用户对应一个宿舍)
**用途**: 记录用户的宿舍分配和床位信息

**关系配置**:
- **Source**: User
- **Target**: Dormitory
- **Source Property**: `dormitory` (用户可通过 user.dormitory 访问宿舍)
- **Target Property**: `residents` (宿舍可通过 dormitory.residents 访问所有住户)
- **Type**: n:1

**关系属性**:
- `assignedAt`: number (分配时间戳，默认: 当前时间)
- `bedNumber`: number (床位号，1-capacity)
- `status`: string (分配状态: active/inactive，默认: active)

**设计说明**:
- 每个用户最多有一个 active 状态的宿舍关系
- `bedNumber` 在同一宿舍内必须唯一
- 用户被踢出时，关系状态变为 inactive

### 2.2 DormHeadDormitoryRelation (宿舍长-宿舍关系)
**类型**: 1:1 (一个宿舍长对应一个宿舍)
**用途**: 记录宿舍长的管理权限

**关系配置**:
- **Source**: User (宿舍长)
- **Target**: Dormitory
- **Source Property**: `managedDormitory` (宿舍长可通过 user.managedDormitory 访问管理的宿舍)
- **Target Property**: `dormHead` (宿舍可通过 dormitory.dormHead 访问宿舍长)
- **Type**: 1:1

**关系属性**:
- `appointedAt`: number (任命时间戳，默认: 当前时间)
- `status`: string (任命状态: active/inactive，默认: active)

**设计说明**:
- 宿舍长必须同时也是该宿舍的住户 (通过 UserDormitoryRelation)
- 每个宿舍最多有一个 active 状态的宿舍长

### 2.3 UserScoreRecordRelation (用户-扣分记录关系)
**类型**: 1:n (一个用户对应多个扣分记录)
**用途**: 连接用户与其扣分记录

**关系配置**:
- **Source**: User
- **Target**: ScoreRecord
- **Source Property**: `scoreRecords` (用户可通过 user.scoreRecords 访问扣分记录)
- **Target Property**: `user` (扣分记录可通过 scoreRecord.user 访问用户)
- **Type**: 1:n

**无额外关系属性** (时间信息已在 ScoreRecord 中)

### 2.4 ScoreRuleRecordRelation (扣分规则-扣分记录关系)
**类型**: 1:n (一个规则对应多个扣分记录)
**用途**: 连接扣分规则与使用该规则的记录

**关系配置**:
- **Source**: ScoreRule
- **Target**: ScoreRecord
- **Source Property**: `records` (规则可通过 scoreRule.records 访问使用记录)
- **Target Property**: `rule` (扣分记录可通过 scoreRecord.rule 访问规则)
- **Type**: 1:n

**无额外关系属性**

### 2.5 KickRequestRelations (踢出申请相关关系)

#### 2.5.1 RequestorKickRequestRelation (申请人-踢出申请关系)
**类型**: 1:n (一个宿舍长可以发起多个申请)
- **Source**: User (宿舍长)
- **Target**: KickRequest
- **Source Property**: `kickRequestsInitiated` 
- **Target Property**: `requestor`
- **Type**: 1:n

#### 2.5.2 TargetUserKickRequestRelation (被申请人-踢出申请关系)
**类型**: 1:n (一个用户可能被多次申请踢出)
- **Source**: User (被申请踢出的用户)
- **Target**: KickRequest
- **Source Property**: `kickRequestsReceived`
- **Target Property**: `targetUser`
- **Type**: 1:n

#### 2.5.3 DormitoryKickRequestRelation (宿舍-踢出申请关系)
**类型**: 1:n (一个宿舍可能有多个踢出申请)
- **Source**: Dormitory
- **Target**: KickRequest
- **Source Property**: `kickRequests`
- **Target Property**: `dormitory`
- **Type**: 1:n

### 2.6 OperatorScoreRecordRelation (操作员-扣分记录关系)
**类型**: 1:n (一个操作员可以创建多个扣分记录)
**用途**: 记录谁执行了扣分操作

**关系配置**:
- **Source**: User (操作员：管理员或宿舍长)
- **Target**: ScoreRecord
- **Source Property**: `scoreRecordsOperated`
- **Target Property**: `operator`
- **Type**: 1:n

**无额外关系属性** (时间信息已在 ScoreRecord 中)

## 3. 过滤实体设计 (Filtered Entities)

### 3.1 ActiveUser (活跃用户)
**用途**: 过滤出状态为 active 的用户
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

### 3.2 ActiveDormitory (活跃宿舍)
**用途**: 过滤出状态为 active 的宿舍
```typescript
const ActiveDormitory = Entity.create({
  name: 'ActiveDormitory',
  sourceEntity: Dormitory,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});
```

### 3.3 ActiveScoreRule (活跃扣分规则)
**用途**: 过滤出生效的扣分规则
```typescript
const ActiveScoreRule = Entity.create({
  name: 'ActiveScoreRule',
  sourceEntity: ScoreRule,
  filterCondition: MatchExp.atom({
    key: 'isActive',
    value: ['=', true]
  })
});
```

### 3.4 PendingKickRequest (待处理踢出申请)
**用途**: 过滤出待处理的踢出申请
```typescript
const PendingKickRequest = Entity.create({
  name: 'PendingKickRequest',
  sourceEntity: KickRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});
```

### 3.5 LowScoreUser (低分用户)
**用途**: 过滤出分数低于20分的用户 (可踢出阈值)
```typescript
const LowScoreUser = Entity.create({
  name: 'LowScoreUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'totalScore',
    value: ['<', 20]
  }).and({
    key: 'status',
    value: ['=', 'active']
  })
});
```

## 4. 数据流设计

### 4.1 宿舍分配流程数据变化
1. **CreateDormitory**: 创建 Dormitory 实体
2. **AssignUserToDormitory**: 
   - 创建 UserDormitoryRelation
   - 自动更新 Dormitory.currentOccupancy (通过计算属性)
3. **AssignDormHead**: 
   - 创建 DormHeadDormitoryRelation
   - 自动更新 User.role 为 'dormHead' (通过计算属性)

### 4.2 扣分流程数据变化
1. **CreateScoreRule**: 创建 ScoreRule 实体
2. **DeductUserScore**:
   - 创建 ScoreRecord 实体
   - 创建 UserScoreRecordRelation
   - 创建 ScoreRuleRecordRelation
   - 创建 OperatorScoreRecordRelation
   - 自动更新 User.totalScore (通过计算属性)

### 4.3 踢出申请流程数据变化
1. **RequestKickUser**:
   - 创建 KickRequest 实体
   - 创建相关关系 (RequestorKickRequestRelation, TargetUserKickRequestRelation, DormitoryKickRequestRelation)
2. **ApproveKickRequest**:
   - 更新 KickRequest.status 为 'approved'
   - 更新 User.status 为 'kicked'
   - 更新 UserDormitoryRelation.status 为 'inactive'
   - 自动更新 Dormitory.currentOccupancy (通过计算属性)

## 5. 业务约束在实体层面的体现

### 5.1 唯一性约束
- `User.email` 必须唯一
- `Dormitory.name` 必须唯一
- 同一宿舍内的 `UserDormitoryRelation.bedNumber` 必须唯一

### 5.2 数值约束  
- `Dormitory.capacity`: 4-6
- `ScoreRule.scoreDeduction`: > 0
- `User.totalScore`: >= 0
- `UserDormitoryRelation.bedNumber`: 1 <= bedNumber <= capacity

### 5.3 状态约束
- 每个用户最多有一个 active 状态的 UserDormitoryRelation
- 每个宿舍最多有一个 active 状态的 DormHeadDormitoryRelation
- 宿舍长必须是该宿舍的住户

### 5.4 业务逻辑约束
- 分数低于20分的用户才能被申请踢出
- 只有 active 状态的扣分规则可以使用
- 被踢出用户不能再被分配到新宿舍

## 6. 实体关系图
```
User ─────┐
          │ UserDormitoryRelation (n:1)
          ├─────── Dormitory
          │ DormHeadDormitoryRelation (1:1)
          │
          │ UserScoreRecordRelation (1:n)
          ├─────── ScoreRecord ───── ScoreRule
          │                    ScoreRuleRecordRelation (n:1)
          │ OperatorScoreRecordRelation (1:n)
          │
          │ RequestorKickRequestRelation (1:n)
          ├─────── KickRequest
          │ TargetUserKickRequestRelation (1:n)
          │
Dormitory ├─────── KickRequest
          DormitoryKickRequestRelation (1:n)
```

## 7. 验证清单
- [x] 所有实体名称都是PascalCase且单数形式
- [x] 所有属性都有正确的类型定义
- [x] 所有默认值都使用函数形式
- [x] 关系定义中没有name属性 (自动生成)
- [x] 关系类型使用正确格式 ('1:1', 'n:1', etc.)
- [x] 没有从interaqt包导入实体
- [x] 过滤实体有有效的sourceEntity和filterCondition
- [x] 实体中没有引用ID字段 (通过关系处理)
- [x] 所有关系都有明确的业务含义和用途