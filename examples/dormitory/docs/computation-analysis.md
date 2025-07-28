# 宿舍管理系统计算分析

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的所有用户，包括管理员、宿舍长和普通学生
- **Creation Source**: 外部系统创建 (不通过interaction)
- **Update Requirements**: 角色更新、状态更新
- **Deletion Strategy**: 软删除，状态设为kicked

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: 外部系统
- **Update Frequency**: 从不 (或通过外部系统)
- **Computation Decision**: None
- **Reasoning**: 静态字段，直接设置

#### Property: email
- **Type**: string
- **Purpose**: 邮箱地址，登录标识
- **Data Source**: 外部系统
- **Update Frequency**: 从不 (或通过外部系统)
- **Computation Decision**: None
- **Reasoning**: 静态字段，直接设置

#### Property: role
- **Type**: string
- **Purpose**: 用户角色 (admin/dormHead/student)
- **Data Source**: 状态转换
- **Update Frequency**: 通过AssignDormHead、RemoveDormHead interactions
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态转换 (student ↔ dormHead)
- **Dependencies**: AssignDormHead、RemoveDormHead interactions，当前role值
- **Calculation Method**: student→dormHead (AssignDormHead)，dormHead→student (RemoveDormHead)

#### Property: status
- **Type**: string
- **Purpose**: 用户状态 (active/kicked/pending_kick)
- **Data Source**: 状态转换
- **Update Frequency**: 通过ProcessKickRequest interaction
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态 (active, kicked, pending_kick)
- **Dependencies**: ProcessKickRequest interaction，当前status值
- **Calculation Method**: active→kicked (ProcessKickRequest with approve)

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 创建时设置，从不更新

#### Property: totalScore
- **Type**: number
- **Purpose**: 当前总扣分
- **Data Source**: 活跃扣分记录的总和
- **Update Frequency**: 当扣分记录创建/撤销时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 需要对相关扣分记录求和，但只计算active状态的记录
- **Dependencies**: UserScoreRecordRelation (direction: source)，ScoreRecord entity (score property, status property)
- **Calculation Method**: 对所有status='active'的相关ScoreRecord的score字段求和

### Entity Computation Decision
- **Type**: None
- **Reasoning**: 用户由外部系统创建，不通过interaction

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍楼层的房间，每个宿舍有固定数量的床位
- **Creation Source**: CreateDormitory interaction
- **Update Requirements**: 名称、容量、状态更新
- **Deletion Strategy**: 硬删除 (仅当空闲时)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称
- **Data Source**: CreateDormitory interaction payload
- **Update Frequency**: 通过UpdateDormitory interaction
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: capacity
- **Type**: number
- **Purpose**: 床位数量
- **Data Source**: CreateDormitory interaction payload
- **Update Frequency**: 通过UpdateDormitory interaction
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: status
- **Type**: string
- **Purpose**: 宿舍状态 (active/inactive)
- **Data Source**: 状态转换
- **Update Frequency**: 通过管理操作
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态转换
- **Dependencies**: DeleteDormitory或其他管理操作
- **Calculation Method**: active→inactive (删除或停用时)

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 创建时设置，从不更新

#### Property: currentOccupancy
- **Type**: number
- **Purpose**: 当前入住人数
- **Data Source**: 活跃的用户-宿舍关系计数
- **Update Frequency**: 当用户分配/移除时自动更新
- **Computation Decision**: Count
- **Reasoning**: 直接计数相关的活跃用户分配
- **Dependencies**: UserDormitoryRelation (direction: target)，关系status='active'
- **Calculation Method**: 计数所有status='active'的UserDormitoryRelation记录，其中target是此宿舍

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory interaction创建
- **Dependencies**: CreateDormitory interaction event，payload数据
- **Calculation Method**: 当CreateDormitory触发时，从event.payload创建新Dormitory实体

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内的具体床位，每个床位可分配给一个用户
- **Creation Source**: 创建宿舍时自动创建
- **Update Requirements**: 状态更新
- **Deletion Strategy**: 随宿舍删除

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: bedNumber
- **Type**: number
- **Purpose**: 床位号
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 静态字段，创建时确定

#### Property: status
- **Type**: string
- **Purpose**: 床位状态 (available/occupied)
- **Data Source**: 状态转换
- **Update Frequency**: 当用户分配/移除时
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态转换 (available ↔ occupied)
- **Dependencies**: AssignUserToDormitory、RemoveUserFromDormitory interactions
- **Calculation Method**: available→occupied (AssignUserToDormitory)，occupied→available (RemoveUserFromDormitory)

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 创建时设置，从不更新

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 床位在CreateDormitory时自动创建
- **Dependencies**: CreateDormitory interaction event，宿舍capacity
- **Calculation Method**: 当CreateDormitory触发时，根据capacity创建对应数量的床位

## Entity: ScoreRecord

### Entity-Level Analysis
- **Purpose**: 用户违规行为的扣分记录，用于累计计算总扣分
- **Creation Source**: CreateScoreRecord interaction
- **Update Requirements**: 状态更新 (撤销)
- **Deletion Strategy**: 软删除，状态设为revoked

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 扣分原因描述
- **Data Source**: CreateScoreRecord interaction payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 静态字段，直接设置

#### Property: score
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: CreateScoreRecord interaction payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 静态字段，直接设置

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 创建时设置，从不更新

#### Property: status
- **Type**: string
- **Purpose**: 记录状态 (active/revoked)
- **Data Source**: 状态转换
- **Update Frequency**: 通过RevokeScoreRecord interaction
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态转换 (active → revoked)
- **Dependencies**: RevokeScoreRecord interaction，当前status值
- **Calculation Method**: active→revoked (RevokeScoreRecord)

#### Property: revokedAt
- **Type**: number
- **Purpose**: 撤销时间戳
- **Data Source**: 撤销时设置
- **Update Frequency**: 通过RevokeScoreRecord interaction
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在撤销时更新为当前时间
- **Dependencies**: RevokeScoreRecord interaction
- **Calculation Method**: 当状态转换到revoked时，设置为Date.now()

#### Property: revokeReason
- **Type**: string
- **Purpose**: 撤销原因
- **Data Source**: RevokeScoreRecord interaction payload
- **Update Frequency**: 通过RevokeScoreRecord interaction
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在撤销时从payload设置
- **Dependencies**: RevokeScoreRecord interaction，payload.reason
- **Calculation Method**: 当状态转换到revoked时，设置为event.payload.reason

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分记录通过CreateScoreRecord interaction创建
- **Dependencies**: CreateScoreRecord interaction event，payload数据，用户和规则引用
- **Calculation Method**: 当CreateScoreRecord触发时，从event.payload创建新ScoreRecord实体

## Entity: KickRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出违规用户的请求记录
- **Creation Source**: CreateKickRequest interaction
- **Update Requirements**: 状态更新、审批信息
- **Deletion Strategy**: 软删除，保留审核历史

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 申请理由
- **Data Source**: CreateKickRequest interaction payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 静态字段，直接设置

#### Property: requestedAt
- **Type**: number
- **Purpose**: 申请时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 创建时设置，从不更新

#### Property: status
- **Type**: string
- **Purpose**: 申请状态 (pending/approved/rejected)
- **Data Source**: 状态转换
- **Update Frequency**: 通过ProcessKickRequest interaction
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态转换 (pending → approved/rejected)
- **Dependencies**: ProcessKickRequest interaction，当前status值
- **Calculation Method**: pending→approved/rejected (ProcessKickRequest根据action)

#### Property: processedAt
- **Type**: number
- **Purpose**: 处理时间戳
- **Data Source**: 处理时设置
- **Update Frequency**: 通过ProcessKickRequest interaction
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在处理时更新为当前时间
- **Dependencies**: ProcessKickRequest interaction
- **Calculation Method**: 当状态转换到approved/rejected时，设置为Date.now()

#### Property: adminComment
- **Type**: string
- **Purpose**: 管理员审批意见
- **Data Source**: ProcessKickRequest interaction payload
- **Update Frequency**: 通过ProcessKickRequest interaction
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在处理时从payload设置
- **Dependencies**: ProcessKickRequest interaction，payload.comment
- **Calculation Method**: 当状态转换到approved/rejected时，设置为event.payload.comment

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过CreateKickRequest interaction创建
- **Dependencies**: CreateKickRequest interaction event，payload数据，用户引用
- **Calculation Method**: 当CreateKickRequest触发时，从event.payload创建新KickRequest实体

## Entity: ScoreRule

### Entity-Level Analysis
- **Purpose**: 预定义的违规行为和对应扣分规则
- **Creation Source**: CreateScoreRule interaction
- **Update Requirements**: 名称、描述、分数、启用状态更新
- **Deletion Strategy**: 软删除，设为inactive

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 规则名称
- **Data Source**: CreateScoreRule interaction payload
- **Update Frequency**: 通过UpdateScoreRule interaction
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: description
- **Type**: string
- **Purpose**: 规则详细描述
- **Data Source**: CreateScoreRule interaction payload
- **Update Frequency**: 通过UpdateScoreRule interaction
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: score
- **Type**: number
- **Purpose**: 标准扣分数值
- **Data Source**: CreateScoreRule interaction payload
- **Update Frequency**: 通过UpdateScoreRule interaction
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: category
- **Type**: string
- **Purpose**: 违规类别
- **Data Source**: CreateScoreRule interaction payload
- **Update Frequency**: 通过UpdateScoreRule interaction
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: isActive
- **Type**: boolean
- **Purpose**: 规则是否启用
- **Data Source**: 状态转换
- **Update Frequency**: 通过DeactivateScoreRule interaction
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态转换 (active ↔ inactive)
- **Dependencies**: DeactivateScoreRule，UpdateScoreRule interactions
- **Calculation Method**: true→false (DeactivateScoreRule)

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 创建时设置，从不更新

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分规则通过CreateScoreRule interaction创建
- **Dependencies**: CreateScoreRule interaction event，payload数据
- **Calculation Method**: 当CreateScoreRule触发时，从event.payload创建新ScoreRule实体

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 用户被分配到宿舍的关系记录
- **Creation**: 通过AssignUserToDormitory interaction在现有实体间创建
- **Deletion Requirements**: 可以删除，当用户被移除或踢出时
- **Update Requirements**: 状态属性可更新
- **State Management**: 有status字段 (active/inactive)
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建和软删除能力，保留审计历史
- **Dependencies**: AssignUserToDormitory (创建)，RemoveUserFromDormitory，ProcessKickRequest (删除) interactions，现有User和Dormitory实体
- **Calculation Method**: AssignUserToDormitory时创建关系，RemoveUserFromDormitory或踢出时status变为inactive

## Relation: UserBedRelation

### Relation Analysis
- **Purpose**: 用户占用具体床位的关系记录
- **Creation**: 通过AssignUserToDormitory interaction在现有实体间创建
- **Deletion Requirements**: 可以删除，当用户被移除或踢出时
- **Update Requirements**: 状态属性可更新
- **State Management**: 有status字段 (active/inactive)
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建和软删除能力，保留床位使用历史
- **Dependencies**: AssignUserToDormitory (创建)，RemoveUserFromDormitory，ProcessKickRequest (删除) interactions，现有User和Bed实体
- **Calculation Method**: AssignUserToDormitory时创建关系，RemoveUserFromDormitory或踢出时status变为inactive

## Relation: DormitoryBedRelation

### Relation Analysis
- **Purpose**: 床位属于哪个宿舍的关系记录
- **Creation**: 创建床位时自动创建
- **Deletion Requirements**: 随床位删除
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态需求
- **Computation Decision**: None
- **Reasoning**: 与床位实体一起创建，通过实体引用自动建立
- **Dependencies**: N/A (随实体创建自动建立)
- **Calculation Method**: N/A (无计算需求)

## Relation: DormitoryHeadRelation

### Relation Analysis
- **Purpose**: 用户被指定为宿舍长的关系记录
- **Creation**: 通过AssignDormHead interaction在现有实体间创建
- **Deletion Requirements**: 可以删除，当宿舍长被撤销时
- **Update Requirements**: 状态属性可更新
- **State Management**: 有status字段 (active/inactive)
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建和软删除能力，保留任命历史
- **Dependencies**: AssignDormHead (创建)，RemoveDormHead (删除) interactions，现有User和Dormitory实体
- **Calculation Method**: AssignDormHead时创建关系，RemoveDormHead时status变为inactive

## Relation: UserScoreRecordRelation

### Relation Analysis
- **Purpose**: 扣分记录属于哪个用户
- **Creation**: 创建扣分记录时自动创建
- **Deletion Requirements**: 从不删除 (维护扣分历史)
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态需求
- **Computation Decision**: None
- **Reasoning**: 与扣分记录实体一起创建，通过实体引用自动建立
- **Dependencies**: N/A (随实体创建自动建立)
- **Calculation Method**: N/A (无计算需求)

## Relation: ScoreRecordOperatorRelation

### Relation Analysis
- **Purpose**: 扣分记录由谁创建/操作
- **Creation**: 创建扣分记录时自动创建
- **Deletion Requirements**: 从不删除 (维护操作历史)
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态需求
- **Computation Decision**: None
- **Reasoning**: 与扣分记录实体一起创建，通过实体引用自动建立
- **Dependencies**: N/A (随实体创建自动建立)
- **Calculation Method**: N/A (无计算需求)

## Relation: KickRequestRequesterRelation

### Relation Analysis
- **Purpose**: 踢出申请由哪个宿舍长发起
- **Creation**: 创建踢出申请时自动创建
- **Deletion Requirements**: 从不删除 (维护申请历史)
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态需求
- **Computation Decision**: None
- **Reasoning**: 与踢出申请实体一起创建，通过实体引用自动建立
- **Dependencies**: N/A (随实体创建自动建立)
- **Calculation Method**: N/A (无计算需求)

## Relation: KickRequestTargetRelation

### Relation Analysis
- **Purpose**: 踢出申请针对哪个用户
- **Creation**: 创建踢出申请时自动创建
- **Deletion Requirements**: 从不删除 (维护申请历史)
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态需求
- **Computation Decision**: None
- **Reasoning**: 与踢出申请实体一起创建，通过实体引用自动建立
- **Dependencies**: N/A (随实体创建自动建立)
- **Calculation Method**: N/A (无计算需求)

## Relation: KickRequestApproverRelation

### Relation Analysis
- **Purpose**: 踢出申请由哪个管理员处理
- **Creation**: 通过ProcessKickRequest interaction在现有实体间创建
- **Deletion Requirements**: 从不删除 (维护审批历史)
- **Update Requirements**: 无属性更新需求  
- **State Management**: 无状态需求
- **Computation Decision**: Transform
- **Reasoning**: 在现有实体间创建关系，不需要删除功能
- **Dependencies**: ProcessKickRequest interaction，现有User和KickRequest实体
- **Calculation Method**: ProcessKickRequest时创建关系，关联审批人

## Relation: ScoreRecordRuleRelation

### Relation Analysis
- **Purpose**: 扣分记录基于哪个扣分规则创建
- **Creation**: 创建扣分记录时自动创建
- **Deletion Requirements**: 从不删除 (维护规则应用历史)
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态需求
- **Computation Decision**: None
- **Reasoning**: 与扣分记录实体一起创建，通过实体引用自动建立
- **Dependencies**: N/A (随实体创建自动建立)
- **Calculation Method**: N/A (无计算需求)

## 过滤实体分析

### ActiveUser Entity
- **Purpose**: 状态为active的用户，排除被踢出的用户
- **Source**: User entity
- **Filter**: status = 'active'
- **Computation Decision**: 过滤实体，无额外计算
- **Usage**: 用于查询和统计活跃用户

### ActiveScoreRecord Entity
- **Purpose**: 状态为active的扣分记录，用于计算有效扣分
- **Source**: ScoreRecord entity
- **Filter**: status = 'active'
- **Computation Decision**: 过滤实体，无额外计算
- **Usage**: 用于User.totalScore的Summation计算

### PendingKickRequest Entity
- **Purpose**: 状态为pending的踢出申请，需要管理员审批
- **Source**: KickRequest entity
- **Filter**: status = 'pending'
- **Computation Decision**: 过滤实体，无额外计算
- **Usage**: 用于管理员审批界面查询

### AvailableBed Entity
- **Purpose**: 状态为available的床位，可以分配给用户
- **Source**: Bed entity
- **Filter**: status = 'available'
- **Computation Decision**: 过滤实体，无额外计算
- **Usage**: 用于床位分配查询

## 总结

### Entity创建模式
- **通过Interaction创建**: Dormitory, Bed, ScoreRecord, KickRequest, ScoreRule
- **外部系统创建**: User

### 状态管理模式
- **简单状态转换**: User.status, User.role, Bed.status, ScoreRule.isActive
- **复杂状态转换**: ScoreRecord.status, KickRequest.status
- **时间戳更新**: ScoreRecord.revokedAt, KickRequest.processedAt

### 聚合计算模式
- **计数**: Dormitory.currentOccupancy
- **求和**: User.totalScore (基于过滤实体)

### 关系生命周期模式
- **随实体创建**: 大部分关系
- **软删除模式**: UserDormitoryRelation, UserBedRelation, DormitoryHeadRelation
- **硬删除模式**: 无 (本系统中保留历史记录)
- **仅创建模式**: KickRequestApproverRelation

### 重要依赖关系
1. User.totalScore 依赖 ActiveScoreRecord 过滤实体
2. Dormitory.currentOccupancy 依赖 UserDormitoryRelation 的status属性
3. 床位状态变化影响宿舍入住统计
4. 踢出申请处理会级联更新多个关系状态