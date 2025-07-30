# 宿舍管理系统计算分析

## 计算分析概述

本文档按照系统方法分析了宿舍管理系统中的每个实体和每个属性，以选择合适的计算类型。分析遵循步骤化过程，确保每个决策都有明确的理由和依赖关系。

## 实体分析

### Entity: User

#### 实体层级分析
- **目的**: 系统用户，包含不同角色的人员
- **创建来源**: 通过CreateUser交互创建
- **更新需求**: 分数更新(通过扣分)，状态更新(踢出时)，角色更新(指定宿舍长时)
- **删除策略**: 软删除，状态改为'expelled'

#### 属性分析

##### 属性: id
- **类型**: string
- **目的**: 用户唯一标识符
- **数据来源**: 系统生成
- **更新频率**: 从不
- **计算决策**: 无(系统处理)
- **理由**: ID由框架自动生成

##### 属性: name
- **类型**: string
- **目的**: 用户姓名
- **数据来源**: CreateUser交互载荷
- **更新频率**: 从不(本系统中姓名不变)
- **计算决策**: 无
- **理由**: 创建时设置，后续不更改

##### 属性: email
- **类型**: string
- **目的**: 用户邮箱，作为唯一标识
- **数据来源**: CreateUser交互载荷
- **更新频率**: 从不(本系统中邮箱不变)
- **计算决策**: 无
- **理由**: 创建时设置，后续不更改

##### 属性: role
- **类型**: string
- **目的**: 用户角色(admin/dormHead/student)
- **数据来源**: CreateUser交互载荷，AssignDormitoryHead交互修改
- **更新频率**: 当指定或取消宿舍长时
- **计算决策**: StateMachine
- **理由**: 有明确的状态转换(student↔dormHead)，通过交互触发
- **依赖关系**: AssignDormitoryHead交互，当前角色值
- **计算方法**: 状态转换 - student→dormHead(指定宿舍长时)，dormHead→student(取消宿舍长时)

##### 属性: score
- **类型**: number
- **目的**: 用户行为评分
- **数据来源**: 初始值100，通过扣分记录计算
- **更新频率**: 当有新的扣分记录时自动更新
- **计算决策**: StateMachine with computeValue
- **理由**: 需要根据扣分交互动态计算新分数
- **依赖关系**: DeductUserScore交互，ScoreRecord实体，当前分数值
- **计算方法**: 当DeductUserScore触发时，currentScore - deductedPoints

##### 属性: status
- **类型**: string
- **目的**: 用户状态(active/expelled)
- **数据来源**: 状态转换
- **更新频率**: 当踢人申请被批准时
- **计算决策**: StateMachine
- **理由**: 明确的状态转换(active→expelled)
- **依赖关系**: ProcessExpelRequest交互(批准决定)，当前状态值
- **计算方法**: 状态转换 - active→expelled(踢人申请批准时)

##### 属性: createdAt
- **类型**: number
- **目的**: 用户创建时间戳
- **数据来源**: 创建时的当前时间
- **更新频率**: 从不
- **计算决策**: defaultValue函数
- **理由**: 创建时设置时间戳，后续不变
- **计算方法**: () => Math.floor(Date.now()/1000)

#### 实体计算决策
- **类型**: Transform
- **来源**: InteractionEventEntity
- **理由**: 用户通过CreateUser交互创建
- **依赖关系**: CreateUser交互事件，载荷数据
- **计算方法**: 当CreateUser交互触发时，从event.payload创建新用户实体

---

### Entity: Dormitory

#### 实体层级分析
- **目的**: 宿舍建筑，包含多个床位
- **创建来源**: 通过CreateDormitory交互创建
- **更新需求**: 占用统计(自动计算)
- **删除策略**: 一般不删除(物理建筑)

#### 属性分析

##### 属性: id
- **类型**: string
- **目的**: 宿舍唯一标识符
- **数据来源**: 系统生成
- **更新频率**: 从不
- **计算决策**: 无(系统处理)
- **理由**: ID由框架自动生成

##### 属性: name
- **类型**: string
- **目的**: 宿舍名称
- **数据来源**: CreateDormitory交互载荷
- **更新频率**: 从不
- **计算决策**: 无
- **理由**: 创建时设置，后续不更改

##### 属性: capacity
- **类型**: number
- **目的**: 宿舍床位总数
- **数据来源**: CreateDormitory交互载荷
- **更新频率**: 从不
- **计算决策**: 无
- **理由**: 物理容量固定，创建时设置

##### 属性: occupiedCount
- **类型**: number
- **目的**: 已占用床位数量
- **数据来源**: 统计已占用床位
- **更新频率**: 当床位分配/释放时自动更新
- **计算决策**: Count
- **理由**: 直接计数相关的占用床位数量
- **依赖关系**: DormitoryBedRelation(direction: source)，Bed实体(status属性)
- **计算方法**: 计算status='occupied'的相关床位数量

##### 属性: availableCount
- **类型**: number
- **目的**: 可用床位数量
- **数据来源**: capacity - occupiedCount
- **数据来源**: 基于当前记录计算
- **更新频率**: 当occupiedCount变化时
- **计算决策**: computed函数
- **理由**: 简单的当前记录内计算，无外部依赖
- **计算方法**: this.capacity - this.occupiedCount

##### 属性: createdAt
- **类型**: number
- **目的**: 宿舍创建时间戳
- **数据来源**: 创建时的当前时间
- **更新频率**: 从不
- **计算决策**: defaultValue函数
- **理由**: 创建时设置时间戳，后续不变
- **计算方法**: () => Math.floor(Date.now()/1000)

#### 实体计算决策
- **类型**: Transform
- **来源**: InteractionEventEntity
- **理由**: 宿舍通过CreateDormitory交互创建
- **依赖关系**: CreateDormitory交互事件，载荷数据
- **计算方法**: 当CreateDormitory触发时，创建宿舍实体并自动生成床位

---

### Entity: Bed

#### 实体层级分析
- **目的**: 宿舍内的具体床位
- **创建来源**: 宿舍创建时自动生成
- **更新需求**: 状态更新(可用/占用)
- **删除策略**: 随宿舍一起删除

#### 属性分析

##### 属性: id
- **类型**: string
- **目的**: 床位唯一标识符
- **数据来源**: 系统生成
- **更新频率**: 从不
- **计算决策**: 无(系统处理)
- **理由**: ID由框架自动生成

##### 属性: bedNumber
- **类型**: number
- **目的**: 床位编号(1-6)
- **数据来源**: 创建时指定
- **更新频率**: 从不
- **计算决策**: 无
- **理由**: 物理床位号固定

##### 属性: status
- **类型**: string
- **目的**: 床位状态(available/occupied)
- **数据来源**: 状态转换
- **更新频率**: 当用户分配/释放床位时
- **计算决策**: StateMachine
- **理由**: 明确的状态转换(available↔occupied)
- **依赖关系**: AssignUserToDormitory交互，ProcessExpelRequest交互(批准时)
- **计算方法**: available→occupied(用户分配时)，occupied→available(用户释放时)

##### 属性: createdAt
- **类型**: number
- **目的**: 床位创建时间戳
- **数据来源**: 创建时的当前时间
- **更新频率**: 从不
- **计算决策**: defaultValue函数
- **理由**: 创建时设置时间戳，后续不变
- **计算方法**: () => Math.floor(Date.now()/1000)

#### 实体计算决策
- **类型**: Transform
- **来源**: Dormitory实体
- **理由**: 床位随宿舍创建时自动生成
- **依赖关系**: Dormitory实体创建事件，capacity属性
- **计算方法**: 当Dormitory创建时，根据capacity创建对应数量的床位(bedNumber: 1到capacity)

---

### Entity: ScoreRecord

#### 实体层级分析
- **目的**: 用户扣分记录
- **创建来源**: 通过DeductUserScore交互创建
- **更新需求**: 创建后不需要更新
- **删除策略**: 一般不删除(保留历史记录)

#### 属性分析

##### 属性: id
- **类型**: string
- **目的**: 扣分记录唯一标识符
- **数据来源**: 系统生成
- **更新频率**: 从不
- **计算决策**: 无(系统处理)
- **理由**: ID由框架自动生成

##### 属性: reason
- **类型**: string
- **目的**: 扣分原因
- **数据来源**: DeductUserScore交互载荷
- **更新频率**: 从不
- **计算决策**: 无
- **理由**: 创建时设置，后续不更改

##### 属性: points
- **类型**: number
- **目的**: 扣分数值
- **数据来源**: DeductUserScore交互载荷
- **更新频率**: 从不
- **计算决策**: 无
- **理由**: 创建时设置，后续不更改

##### 属性: createdAt
- **类型**: number
- **目的**: 扣分时间戳
- **数据来源**: 创建时的当前时间
- **更新频率**: 从不
- **计算决策**: defaultValue函数
- **理由**: 创建时设置时间戳，后续不变
- **计算方法**: () => Math.floor(Date.now()/1000)

#### 实体计算决策
- **类型**: Transform
- **来源**: InteractionEventEntity
- **理由**: 扣分记录通过DeductUserScore交互创建
- **依赖关系**: DeductUserScore交互事件，载荷数据，用户上下文
- **计算方法**: 当DeductUserScore触发时，创建扣分记录并关联到目标用户

---

### Entity: ExpelRequest

#### 实体层级分析
- **目的**: 踢人申请记录
- **创建来源**: 通过SubmitExpelRequest交互创建
- **更新需求**: 状态更新(pending→approved/rejected)，处理时间和意见
- **删除策略**: 一般不删除(保留审批历史)

#### 属性分析

##### 属性: id
- **类型**: string
- **目的**: 踢人申请唯一标识符
- **数据来源**: 系统生成
- **更新频率**: 从不
- **计算决策**: 无(系统处理)
- **理由**: ID由框架自动生成

##### 属性: reason
- **类型**: string
- **目的**: 申请踢出的原因
- **数据来源**: SubmitExpelRequest交互载荷
- **更新频率**: 从不
- **计算决策**: 无
- **理由**: 创建时设置，后续不更改

##### 属性: status
- **类型**: string
- **目的**: 申请状态(pending/approved/rejected)
- **数据来源**: 状态转换
- **更新频率**: 当管理员处理申请时
- **计算决策**: StateMachine
- **理由**: 明确的状态转换(pending→approved/rejected)
- **依赖关系**: ProcessExpelRequest交互，当前状态值
- **计算方法**: pending→approved/rejected(ProcessExpelRequest时根据decision)

##### 属性: createdAt
- **类型**: number
- **目的**: 申请提交时间戳
- **数据来源**: 创建时的当前时间
- **更新频率**: 从不
- **计算决策**: defaultValue函数
- **理由**: 创建时设置时间戳，后续不变
- **计算方法**: () => Math.floor(Date.now()/1000)

##### 属性: processedAt
- **类型**: number
- **目的**: 申请处理时间戳
- **数据来源**: 处理时的当前时间
- **更新频率**: 当申请被处理时
- **计算决策**: StateMachine with computeValue
- **理由**: 需要在状态转换时设置处理时间
- **依赖关系**: ProcessExpelRequest交互
- **计算方法**: 当status从pending转换时，设置为当前时间戳

##### 属性: comment
- **类型**: string
- **目的**: 管理员处理意见
- **数据来源**: ProcessExpelRequest交互载荷
- **更新频率**: 当申请被处理时
- **计算决策**: StateMachine with computeValue
- **理由**: 需要在状态转换时设置处理意见
- **依赖关系**: ProcessExpelRequest交互，载荷中的comment
- **计算方法**: 当status转换时，从event.payload.comment设置

#### 实体计算决策
- **类型**: Transform
- **来源**: InteractionEventEntity
- **理由**: 踢人申请通过SubmitExpelRequest交互创建
- **依赖关系**: SubmitExpelRequest交互事件，载荷数据，用户上下文
- **计算方法**: 当SubmitExpelRequest触发时，创建申请记录并关联申请人和目标用户

---

## 关系分析

### Relation: UserDormitoryRelation

#### 关系分析
- **目的**: 连接用户和宿舍，表示居住关系
- **创建**: 通过AssignUserToDormitory交互在现有实体间创建
- **删除需求**: 当用户被踢出时需要删除(硬删除，不需审计)
- **更新需求**: 分配时间属性无需更新
- **状态管理**: 无需状态(存在即表示分配)
- **计算决策**: StateMachine
- **理由**: 关系需要删除能力，Transform单独无法删除
- **依赖关系**: AssignUserToDormitory交互(创建)，ProcessExpelRequest交互(删除)，现有User和Dormitory实体
- **计算方法**: AssignUserToDormitory时创建关系，ProcessExpelRequest批准时删除关系(硬删除)

### Relation: UserBedRelation

#### 关系分析
- **目的**: 连接用户和床位，表示具体床位占用
- **创建**: 通过AssignUserToDormitory交互在现有实体间创建
- **删除需求**: 当用户被踢出时需要删除(硬删除，不需审计)
- **更新需求**: 分配时间属性无需更新
- **状态管理**: 无需状态(存在即表示占用)
- **计算决策**: StateMachine
- **理由**: 关系需要删除能力，Transform单独无法删除
- **依赖关系**: AssignUserToDormitory交互(创建)，ProcessExpelRequest交互(删除)，现有User和Bed实体
- **计算方法**: AssignUserToDormitory时创建关系，ProcessExpelRequest批准时删除关系(硬删除)

### Relation: DormitoryBedRelation

#### 关系分析
- **目的**: 连接宿舍和床位，表示床位归属
- **创建**: 床位创建时自动建立关系
- **删除需求**: 从不删除(保持宿舍-床位结构)
- **更新需求**: 无属性需要更新
- **状态管理**: 无需状态管理
- **计算决策**: 无
- **理由**: 关系随床位创建时自动建立，通过实体引用创建
- **依赖关系**: 无(床位创建时自动建立)
- **计算方法**: 无(自动建立)

### Relation: DormitoryHeadRelation

#### 关系分析
- **目的**: 连接宿舍和宿舍长，表示管理关系
- **创建**: 通过AssignDormitoryHead交互在现有实体间创建
- **删除需求**: 当取消宿舍长或宿舍长被踢出时需要删除
- **更新需求**: 任命时间属性无需更新
- **状态管理**: 无需状态(存在即表示管理关系)
- **计算决策**: StateMachine
- **理由**: 关系需要删除能力(取消宿舍长或踢出宿舍长时)
- **依赖关系**: AssignDormitoryHead交互(创建)，ProcessExpelRequest交互(删除，如果踢出的是宿舍长)
- **计算方法**: AssignDormitoryHead时创建关系，相关用户被踢出时删除关系

### Relation: UserScoreRecordRelation

#### 关系分析
- **目的**: 连接用户和扣分记录，表示扣分历史
- **创建**: 扣分记录创建时自动建立关系
- **删除需求**: 从不删除(保持扣分历史)
- **更新需求**: 无属性需要更新
- **状态管理**: 无需状态管理
- **计算决策**: 无
- **理由**: 关系随扣分记录创建时自动建立，通过实体引用创建
- **依赖关系**: 无(扣分记录创建时自动建立)
- **计算方法**: 无(自动建立)

### Relation: ScoreRecordDeductorRelation

#### 关系分析
- **目的**: 连接扣分记录和执行扣分的用户，表示操作责任
- **创建**: 扣分记录创建时自动建立关系
- **删除需求**: 从不删除(保持操作历史)
- **更新需求**: 无属性需要更新
- **状态管理**: 无需状态管理
- **计算决策**: 无
- **理由**: 关系随扣分记录创建时自动建立，通过实体引用(event.user)创建
- **依赖关系**: 无(扣分记录创建时自动建立)
- **计算方法**: 无(自动建立)

### Relation: ApplicantExpelRequestRelation

#### 关系分析
- **目的**: 连接踢人申请和申请人，表示申请责任
- **创建**: 踢人申请创建时自动建立关系
- **删除需求**: 从不删除(保持申请历史)
- **更新需求**: 无属性需要更新
- **状态管理**: 无需状态管理
- **计算决策**: 无
- **理由**: 关系随踢人申请创建时自动建立，通过实体引用(event.user)创建
- **依赖关系**: 无(踢人申请创建时自动建立)
- **计算方法**: 无(自动建立)

### Relation: TargetExpelRequestRelation

#### 关系分析
- **目的**: 连接踢人申请和被申请踢出的用户
- **创建**: 踢人申请创建时自动建立关系
- **删除需求**: 从不删除(保持申请历史)
- **更新需求**: 无属性需要更新
- **状态管理**: 无需状态管理
- **计算决策**: 无
- **理由**: 关系随踢人申请创建时自动建立，通过实体引用(payload.targetUserId)创建
- **依赖关系**: 无(踢人申请创建时自动建立)
- **计算方法**: 无(自动建立)

### Relation: ProcessorExpelRequestRelation

#### 关系分析
- **目的**: 连接踢人申请和处理申请的管理员，表示处理责任
- **创建**: 踢人申请被处理时建立关系
- **删除需求**: 从不删除(保持处理历史)
- **更新需求**: 无属性需要更新
- **状态管理**: 无需状态管理
- **计算决策**: StateMachine
- **理由**: 关系需要在申请处理时创建，不是在申请创建时
- **依赖关系**: ProcessExpelRequest交互，处理申请的用户(event.user)
- **计算方法**: ProcessExpelRequest触发时创建关系，连接申请和处理者

---

## 过滤实体分析

### Entity: ActiveUser

#### 实体层级分析
- **目的**: 过滤出状态为active的用户
- **来源实体**: User
- **过滤条件**: status = 'active'
- **计算决策**: 无(过滤实体不需要计算)
- **理由**: 过滤实体自动跟随源实体变化

### Entity: AvailableBed

#### 实体层级分析
- **目的**: 过滤出状态为available的床位
- **来源实体**: Bed
- **过滤条件**: status = 'available'
- **计算决策**: 无(过滤实体不需要计算)
- **理由**: 过滤实体自动跟随源实体变化

### Entity: PendingExpelRequest

#### 实体层级分析
- **目的**: 过滤出状态为pending的踢人申请
- **来源实体**: ExpelRequest
- **过滤条件**: status = 'pending'
- **计算决策**: 无(过滤实体不需要计算)
- **理由**: 过滤实体自动跟随源实体变化

### Entity: LowScoreUser

#### 实体层级分析
- **目的**: 过滤出分数低于60分的活跃用户
- **来源实体**: User
- **过滤条件**: score < 60 AND status = 'active'
- **计算决策**: 无(过滤实体不需要计算)
- **理由**: 过滤实体自动跟随源实体变化

---

## 状态节点声明清单

### User实体所需状态节点
```typescript
// 角色状态节点
const studentState = StateNode.create({ name: 'student' });
const dormHeadState = StateNode.create({ name: 'dormHead' });
const adminState = StateNode.create({ name: 'admin' });

// 用户状态节点
const activeUserState = StateNode.create({ name: 'active' });
const expelledUserState = StateNode.create({ name: 'expelled' });

// 分数更新状态节点
const scoreInitialState = StateNode.create({ name: 'initial' });
const scoreUpdatedState = StateNode.create({ 
  name: 'updated',
  computeValue: async function(this: Controller, event) {
    // 计算新分数 = 当前分数 - 扣分
    const currentScore = this.getCurrentRecord()?.score || 100;
    const deductedPoints = event.payload.points;
    return Math.max(0, currentScore - deductedPoints);
  }
});
```

### Bed实体所需状态节点
```typescript
// 床位状态节点
const availableBedState = StateNode.create({ name: 'available' });
const occupiedBedState = StateNode.create({ name: 'occupied' });
```

### ExpelRequest实体所需状态节点
```typescript
// 申请状态节点
const pendingState = StateNode.create({ name: 'pending' });
const approvedState = StateNode.create({ 
  name: 'approved',
  computeValue: () => ({
    processedAt: Math.floor(Date.now()/1000)
  })
});
const rejectedState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => ({
    processedAt: Math.floor(Date.now()/1000)
  })
});
```

### 关系所需状态节点
```typescript
// 关系存在/删除状态节点
const relationExistsState = StateNode.create({
  name: 'exists',
  computeValue: () => ({}) // 关系存在
});

const relationDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => null // 返回null删除关系
});
```

---

## 计算类型依赖关系总结

### Transform计算
- **User实体**: InteractionEventEntity (CreateUser)
- **Dormitory实体**: InteractionEventEntity (CreateDormitory)
- **Bed实体**: Dormitory实体 (宿舍创建时)
- **ScoreRecord实体**: InteractionEventEntity (DeductUserScore)
- **ExpelRequest实体**: InteractionEventEntity (SubmitExpelRequest)

### StateMachine计算
- **User.role**: AssignDormitoryHead交互
- **User.score**: DeductUserScore交互，当前分数值
- **User.status**: ProcessExpelRequest交互
- **Bed.status**: AssignUserToDormitory交互，ProcessExpelRequest交互
- **ExpelRequest.status**: ProcessExpelRequest交互
- **ExpelRequest.processedAt**: ProcessExpelRequest交互
- **ExpelRequest.comment**: ProcessExpelRequest交互
- **关系生命周期**: 相关的创建和删除交互

### Count计算
- **Dormitory.occupiedCount**: DormitoryBedRelation，Bed.status属性

### computed函数
- **Dormitory.availableCount**: capacity和occupiedCount属性

---

## 实现验证清单

- [x] 所有实体已分析并记录
- [x] 所有属性已分析并记录
- [x] 实体层级Transform在需要时定义
- [x] 属性计算根据分析实现
- [x] 所有计算的依赖关系已记录
- [x] 所有计算的计算方法已记录
- [x] StateNode变量在使用前声明
- [x] Transform未用于属性计算
- [x] 无循环依赖
- [x] 所有计算属性提供默认值
- [x] 分析文档已保存到`docs/computation-analysis.md`

---

## 关键实现注意事项

### 🔴 关键关系删除模式
1. **UserDormitoryRelation**: 使用硬删除StateMachine - 踢出用户时不需要保留分配历史
2. **UserBedRelation**: 使用硬删除StateMachine - 床位释放时直接删除关系
3. **DormitoryHeadRelation**: 使用硬删除StateMachine - 宿舍长变更时直接删除旧关系

### 🔴 状态机设计原则
1. **用户分数更新**: 使用computeValue动态计算新分数，避免手动同步
2. **床位状态联动**: 床位状态变更需要与关系创建/删除同步
3. **申请处理**: 处理时间和意见通过computeValue设置，确保数据一致性

### 🔴 计算性能优化
1. **Count计算**: Dormitory.occupiedCount使用索引优化床位状态查询
2. **过滤实体**: 为常用查询(活跃用户、可用床位)创建过滤实体
3. **computed属性**: availableCount使用简单减法避免额外查询

此分析确保了宿舍管理系统的所有计算需求都有明确的实现方案，为后续的代码生成提供了完整的指导。