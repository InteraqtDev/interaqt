# 宿舍管理系统实体关系设计

## 实体设计

### 1. User - 用户实体
**业务含义**: 系统中的所有用户，包括管理员、宿舍长和普通学生

**属性**:
- `id`: string - 系统生成的唯一标识
- `name`: string - 用户姓名
- `email`: string - 邮箱地址，用作登录标识
- `role`: string - 用户角色 (admin/dormHead/student)
- `status`: string - 用户状态 (active/kicked/pending_kick)
- `createdAt`: number - 创建时间戳
- `totalScore`: number - 当前总扣分 (通过计算得出)

**🔴 避免的错误**: 不包含`dormitoryId`或`managedDormitoryId`等引用字段，这些通过Relations定义

### 2. Dormitory - 宿舍实体
**业务含义**: 宿舍楼层的房间，每个宿舍有固定数量的床位

**属性**:
- `id`: string - 宿舍唯一标识
- `name`: string - 宿舍名称 (如"A栋101")
- `capacity`: number - 床位数量 (4-6)
- `status`: string - 宿舍状态 (active/inactive)
- `createdAt`: number - 创建时间戳
- `currentOccupancy`: number - 当前入住人数 (通过计算得出)

### 3. Bed - 床位实体
**业务含义**: 宿舍内的具体床位，每个床位可分配给一个用户

**属性**:
- `id`: string - 床位唯一标识
- `bedNumber`: number - 床位号 (在宿舍内的编号)
- `status`: string - 床位状态 (available/occupied)
- `createdAt`: number - 创建时间戳

**🔴 避免的错误**: 不包含`dormitoryId`或`userId`字段，通过Relations建立关联

### 4. ScoreRecord - 扣分记录实体
**业务含义**: 用户违规行为的扣分记录，用于累计计算总扣分

**属性**:
- `id`: string - 记录唯一标识
- `reason`: string - 扣分原因描述
- `score`: number - 扣分数值 (正数)
- `createdAt`: number - 创建时间戳
- `status`: string - 记录状态 (active/revoked)
- `revokedAt`: number - 撤销时间戳 (可选)
- `revokeReason`: string - 撤销原因 (可选)

### 5. KickRequest - 踢出申请实体
**业务含义**: 宿舍长申请踢出违规用户的请求记录

**属性**:
- `id`: string - 申请唯一标识
- `reason`: string - 申请理由
- `requestedAt`: number - 申请时间戳
- `status`: string - 申请状态 (pending/approved/rejected)
- `processedAt`: number - 处理时间戳 (可选)
- `adminComment`: string - 管理员审批意见 (可选)

### 6. ScoreRule - 扣分规则实体
**业务含义**: 预定义的违规行为和对应扣分规则

**属性**:
- `id`: string - 规则唯一标识
- `name`: string - 规则名称 (如"晚归")
- `description`: string - 规则详细描述
- `score`: number - 标准扣分数值
- `category`: string - 违规类别 (time_violation/hygiene/noise/other)
- `isActive`: boolean - 规则是否启用
- `createdAt`: number - 创建时间戳

## 关系设计

### 1. UserDormitoryRelation - 用户宿舍关系
**业务含义**: 用户被分配到宿舍的关系记录

**类型**: n:1 (多个用户对应一个宿舍)
**源属性**: `dormitory` (在User实体上创建，访问用户的宿舍)
**目标属性**: `residents` (在Dormitory实体上创建，访问宿舍的所有住户)

**关系属性**:
- `assignedAt`: number - 分配时间戳
- `status`: string - 分配状态 (active/inactive)

```typescript
const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1',
  sourceProperty: 'dormitory',
  targetProperty: 'residents',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number', 
      defaultValue: () => Math.floor(Date.now()/1000) 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active' 
    })
  ]
});
```

### 2. UserBedRelation - 用户床位关系
**业务含义**: 用户占用具体床位的关系记录

**类型**: 1:1 (一个用户对应一个床位)
**源属性**: `bed` (在User实体上创建，访问用户的床位)
**目标属性**: `occupant` (在Bed实体上创建，访问床位的占用者)

**关系属性**:
- `assignedAt`: number - 分配时间戳
- `status`: string - 分配状态 (active/inactive)

### 3. DormitoryBedRelation - 宿舍床位关系
**业务含义**: 床位属于哪个宿舍的关系记录

**类型**: 1:n (一个宿舍对应多个床位)
**源属性**: `beds` (在Dormitory实体上创建，访问宿舍的所有床位)
**目标属性**: `dormitory` (在Bed实体上创建，访问床位所属宿舍)

**关系属性**: 无额外属性

### 4. DormitoryHeadRelation - 宿舍长关系
**业务含义**: 用户被指定为宿舍长的关系记录

**类型**: 1:1 (一个宿舍对应一个宿舍长)
**源属性**: `head` (在Dormitory实体上创建，访问宿舍长)
**目标属性**: `managedDormitory` (在User实体上创建，访问用户管理的宿舍)

**关系属性**:
- `appointedAt`: number - 任命时间戳
- `status`: string - 任命状态 (active/inactive)

### 5. UserScoreRecordRelation - 用户扣分记录关系
**业务含义**: 扣分记录属于哪个用户

**类型**: n:1 (多个扣分记录对应一个用户)
**源属性**: `scoreRecords` (在User实体上创建，访问用户的所有扣分记录)
**目标属性**: `user` (在ScoreRecord实体上创建，访问扣分记录的目标用户)

**关系属性**: 无额外属性

### 6. ScoreRecordOperatorRelation - 扣分记录操作者关系
**业务含义**: 扣分记录由谁创建/操作

**类型**: n:1 (多个扣分记录对应一个操作者)
**源属性**: `operatedScoreRecords` (在User实体上创建，访问用户操作的扣分记录)
**目标属性**: `operator` (在ScoreRecord实体上创建，访问扣分记录的操作者)

**关系属性**: 无额外属性

### 7. KickRequestRequesterRelation - 踢出申请发起人关系
**业务含义**: 踢出申请由哪个宿舍长发起

**类型**: n:1 (多个申请对应一个发起人)
**源属性**: `requestedKicks` (在User实体上创建，访问用户发起的踢出申请)
**目标属性**: `requester` (在KickRequest实体上创建，访问申请的发起人)

**关系属性**: 无额外属性

### 8. KickRequestTargetRelation - 踢出申请目标用户关系
**业务含义**: 踢出申请针对哪个用户

**类型**: n:1 (多个申请可针对一个用户，但实际业务中应该避免重复申请)
**源属性**: `receivedKicks` (在User实体上创建，访问用户收到的踢出申请)
**目标属性**: `target` (在KickRequest实体上创建，访问申请的目标用户)

**关系属性**: 无额外属性

### 9. KickRequestApproverRelation - 踢出申请审批人关系
**业务含义**: 踢出申请由哪个管理员处理

**类型**: n:1 (多个申请对应一个审批人)
**源属性**: `approvedKicks` (在User实体上创建，访问用户审批的踢出申请)
**目标属性**: `approver` (在KickRequest实体上创建，访问申请的审批人，可选)

**关系属性**: 无额外属性

### 10. ScoreRecordRuleRelation - 扣分记录规则关系
**业务含义**: 扣分记录基于哪个扣分规则创建

**类型**: n:1 (多个扣分记录对应一个规则)
**源属性**: `scoreRecords` (在ScoreRule实体上创建，访问基于该规则的扣分记录)
**目标属性**: `rule` (在ScoreRecord实体上创建，访问扣分记录的规则)

**关系属性**: 无额外属性

## 过滤实体设计

### 1. ActiveUser - 活跃用户
**业务含义**: 状态为active的用户，排除被踢出的用户

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

### 2. ActiveScoreRecord - 有效扣分记录
**业务含义**: 状态为active的扣分记录，用于计算有效扣分

```typescript
const ActiveScoreRecord = Entity.create({
  name: 'ActiveScoreRecord',
  sourceEntity: ScoreRecord,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});
```

### 3. PendingKickRequest - 待处理踢出申请
**业务含义**: 状态为pending的踢出申请，需要管理员审批

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

### 4. AvailableBed - 可用床位
**业务含义**: 状态为available的床位，可以分配给用户

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

## 数据流设计

### 创建宿舍流程
1. 创建Dormitory实体
2. 自动创建对应数量的Bed实体
3. 建立DormitoryBedRelation关系
4. 所有床位初始状态为available

### 用户分配流程
1. 检查宿舍容量和床位可用性
2. 创建UserDormitoryRelation (用户-宿舍关系)
3. 创建UserBedRelation (用户-床位关系)
4. 更新床位状态为occupied
5. 更新宿舍当前入住人数

### 扣分记录流程
1. 创建ScoreRecord实体
2. 建立UserScoreRecordRelation (目标用户关系)
3. 建立ScoreRecordOperatorRelation (操作者关系)
4. 建立ScoreRecordRuleRelation (规则关系)
5. 自动重新计算用户总扣分

### 踢出申请流程
1. 创建KickRequest实体
2. 建立KickRequestRequesterRelation (发起人关系)
3. 建立KickRequestTargetRelation (目标用户关系)
4. 管理员审批后建立KickRequestApproverRelation
5. 批准后解除用户的宿舍和床位关系

## 设计原则验证

### ✅ 正确的设计原则
- 所有实体属性都是原子性的
- 没有在实体中包含引用ID字段
- 所有实体间关系通过Relations明确定义
- Relations定义了双向访问属性
- 默认值都使用函数形式
- 实体名称使用PascalCase单数形式

### ❌ 避免的错误
- User实体中不包含dormitoryId字段
- Bed实体中不包含userId或dormitoryId字段
- ScoreRecord实体中不包含userId或operatorId字段
- 没有为Relations指定name属性 (自动生成)

### 关键关系说明
- `user.dormitory` - 用户访问所分配的宿舍
- `dormitory.residents` - 宿舍访问所有住户
- `user.bed` - 用户访问所占用的床位
- `bed.occupant` - 床位访问占用者
- `dormitory.head` - 宿舍访问宿舍长
- `user.managedDormitory` - 用户访问管理的宿舍
- `user.scoreRecords` - 用户访问所有扣分记录
- `scoreRecord.user` - 扣分记录访问目标用户
- `scoreRecord.operator` - 扣分记录访问操作者

这个设计确保了数据的完整性和一致性，支持所有需要的业务操作，并为后续的计算和查询提供了良好的基础。