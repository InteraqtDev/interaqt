# 宿舍管理系统计算分析

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的所有用户，包括管理员、宿舍长和学生
- **Creation Source**: 通过CreateUser交互创建（外部系统处理）或数据初始化
- **Update Requirements**: 角色变更、积分更新、状态变更
- **Deletion Strategy**: 软删除，状态标记为'kicked'

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: 创建时设置或更新交互
- **Update Frequency**: 很少更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: email
- **Type**: string
- **Purpose**: 唯一邮箱标识
- **Data Source**: 创建时设置
- **Update Frequency**: 很少更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: role
- **Type**: string
- **Purpose**: 用户角色 ('admin' | 'dormHead' | 'student')
- **Data Source**: 角色分配交互
- **Update Frequency**: 在AssignDormHead、RemoveDormHead交互时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的角色状态转换：student ↔ dormHead
- **Dependencies**: AssignDormHead、RemoveDormHead交互，当前角色值
- **Calculation Method**: student→dormHead (AssignDormHead), dormHead→student (RemoveDormHead), admin保持不变

#### Property: score
- **Type**: number
- **Purpose**: 行为积分，用于违规管理
- **Data Source**: 违规记录导致的扣分
- **Update Frequency**: 每次记录违规时更新
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要根据违规记录动态计算和更新积分值
- **Dependencies**: RecordViolation、RevokeViolation交互，ViolationRecord实体
- **Calculation Method**: 初始100分，每次违规按规则扣分，撤销违规时恢复分数

#### Property: status
- **Type**: string
- **Purpose**: 用户状态 ('active' | 'kicked')
- **Data Source**: 踢出申请处理结果
- **Update Frequency**: 当踢出申请被批准时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态：active ↔ kicked
- **Dependencies**: ProcessKickoutRequest交互，申请决定为'approved'
- **Calculation Method**: active→kicked (批准踢出), kicked→active (恢复用户)

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不更新
- **Computation Decision**: defaultValue function
- **Reasoning**: 只需要在创建时设置一次
- **Dependencies**: 无
- **Calculation Method**: `() => Math.floor(Date.now()/1000)`

#### Property: updatedAt
- **Type**: number
- **Purpose**: 最后更新时间戳
- **Data Source**: 任何用户更新操作
- **Update Frequency**: 用户信息发生变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在多种更新操作时自动更新时间戳
- **Dependencies**: 所有用户修改交互（角色变更、积分变更、状态变更等）
- **Calculation Method**: 任何状态转换时设置为当前时间戳

#### Property: totalViolations (计算属性)
- **Type**: number
- **Purpose**: 用户总违规次数
- **Data Source**: 统计用户的违规记录
- **Update Frequency**: 违规记录变化时自动更新
- **Computation Decision**: Count
- **Reasoning**: 直接统计相关违规记录数量
- **Dependencies**: UserViolationRelation (direction: source)
- **Calculation Method**: 统计状态为'active'的违规记录数量

#### Property: canBeKickedOut (计算属性)
- **Type**: boolean (computed)
- **Purpose**: 是否可以被踢出
- **Data Source**: 基于当前积分和状态计算
- **Update Frequency**: 积分或状态变化时
- **Computation Decision**: computed function
- **Reasoning**: 基于当前记录的简单计算，无外部依赖
- **Dependencies**: 当前用户的score和status属性
- **Calculation Method**: `score < 60 && status === 'active'`

### Entity Computation Decision
- **Type**: None (不通过交互创建)
- **Source**: N/A
- **Reasoning**: 用户通过外部认证系统或数据初始化创建，不通过内部交互
- **Dependencies**: N/A
- **Calculation Method**: N/A

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍楼栋或房间实体
- **Creation Source**: CreateDormitory交互
- **Update Requirements**: 名称、容量更新
- **Deletion Strategy**: 硬删除（仅当为空宿舍时）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称
- **Data Source**: CreateDormitory payload或UpdateDormitory
- **Update Frequency**: 很少更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: capacity
- **Type**: number
- **Purpose**: 床位数量
- **Data Source**: CreateDormitory payload或UpdateDormitory
- **Update Frequency**: 很少更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: currentOccupancy (计算属性)
- **Type**: number
- **Purpose**: 当前入住人数
- **Data Source**: 统计活跃的用户-宿舍关系
- **Update Frequency**: 用户分配或移除时自动更新
- **Computation Decision**: Count
- **Reasoning**: 直接统计相关活跃住户数量
- **Dependencies**: UserDormitoryRelation (direction: target, status='active')
- **Calculation Method**: 统计与该宿舍关联且状态为'active'的UserDormitoryRelation数量

#### Property: availableBeds (计算属性)
- **Type**: number (computed)
- **Purpose**: 可用床位数
- **Data Source**: 容量减去当前入住人数
- **Update Frequency**: 容量或入住人数变化时
- **Computation Decision**: computed function
- **Reasoning**: 基于当前记录的简单计算
- **Dependencies**: 当前宿舍的capacity和currentOccupancy属性
- **Calculation Method**: `capacity - currentOccupancy`

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不更新
- **Computation Decision**: defaultValue function
- **Reasoning**: 只需要在创建时设置一次
- **Dependencies**: 无
- **Calculation Method**: `() => Math.floor(Date.now()/1000)`

#### Property: updatedAt
- **Type**: number
- **Purpose**: 最后更新时间戳
- **Data Source**: 任何宿舍更新操作
- **Update Frequency**: 宿舍信息发生变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在多种更新操作时自动更新时间戳
- **Dependencies**: UpdateDormitory等宿舍修改交互
- **Calculation Method**: 任何状态转换时设置为当前时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory交互创建
- **Dependencies**: CreateDormitory交互事件，payload数据
- **Calculation Method**: 当CreateDormitory触发时，从event.payload创建新宿舍

## Entity: ScoreRule

### Entity-Level Analysis
- **Purpose**: 定义各种违规行为对应的扣分规则
- **Creation Source**: CreateScoreRule交互
- **Update Requirements**: 规则信息更新，激活状态变更
- **Deletion Strategy**: 硬删除（仅当无关联违规记录时）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 规则名称
- **Data Source**: CreateScoreRule payload
- **Update Frequency**: UpdateScoreRule交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: description
- **Type**: string
- **Purpose**: 规则详细描述
- **Data Source**: CreateScoreRule payload
- **Update Frequency**: UpdateScoreRule交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: scoreDeduction
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: CreateScoreRule payload
- **Update Frequency**: UpdateScoreRule交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: isActive
- **Type**: boolean
- **Purpose**: 规则是否启用
- **Data Source**: 创建时默认true，UpdateScoreRule可修改
- **Update Frequency**: UpdateScoreRule交互
- **Computation Decision**: defaultValue function
- **Reasoning**: 简单布尔值，有默认值
- **Dependencies**: 无
- **Calculation Method**: `() => true`

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不更新
- **Computation Decision**: defaultValue function
- **Reasoning**: 只需要在创建时设置一次
- **Dependencies**: 无
- **Calculation Method**: `() => Math.floor(Date.now()/1000)`

#### Property: updatedAt
- **Type**: number
- **Purpose**: 最后更新时间戳
- **Data Source**: 任何规则更新操作
- **Update Frequency**: 规则信息发生变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在更新操作时自动更新时间戳
- **Dependencies**: UpdateScoreRule交互
- **Calculation Method**: 状态转换时设置为当前时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分规则通过CreateScoreRule交互创建
- **Dependencies**: CreateScoreRule交互事件，payload数据
- **Calculation Method**: 当CreateScoreRule触发时，从event.payload创建新规则

## Entity: ViolationRecord

### Entity-Level Analysis
- **Purpose**: 记录用户的具体违规行为实例
- **Creation Source**: RecordViolation交互
- **Update Requirements**: 状态更新（撤销）
- **Deletion Strategy**: 软删除，状态标记为'revoked'

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: description
- **Type**: string
- **Purpose**: 违规具体描述
- **Data Source**: RecordViolation payload
- **Update Frequency**: 从不更新
- **Computation Decision**: None
- **Reasoning**: 违规描述不可修改

#### Property: recordedAt
- **Type**: number
- **Purpose**: 记录时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不更新
- **Computation Decision**: defaultValue function
- **Reasoning**: 只需要在创建时设置一次
- **Dependencies**: 无
- **Calculation Method**: `() => Math.floor(Date.now()/1000)`

#### Property: scoreDeducted
- **Type**: number
- **Purpose**: 本次扣除的分数
- **Data Source**: 从关联的扣分规则获取
- **Update Frequency**: 从不更新
- **Computation Decision**: Transform computation with callback
- **Reasoning**: 需要从ViolationRuleRelation获取规则的扣分值
- **Dependencies**: ViolationRuleRelation, ScoreRule.scoreDeduction
- **Calculation Method**: 获取关联规则的scoreDeduction值

#### Property: status
- **Type**: string
- **Purpose**: 记录状态 ('active' | 'revoked')
- **Data Source**: 状态转换
- **Update Frequency**: RevokeViolation交互时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态：active ↔ revoked
- **Dependencies**: RevokeViolation交互
- **Calculation Method**: active→revoked (撤销违规记录)

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 违规记录通过RecordViolation交互创建
- **Dependencies**: RecordViolation交互事件，payload数据，用户和规则引用
- **Calculation Method**: 当RecordViolation触发时，创建新违规记录并关联用户和规则

## Entity: KickoutRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出违规用户的正式申请
- **Creation Source**: RequestKickout交互
- **Update Requirements**: 状态更新、处理信息更新
- **Deletion Strategy**: 不删除（保留审批历史）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 申请理由
- **Data Source**: RequestKickout payload
- **Update Frequency**: 从不更新
- **Computation Decision**: None
- **Reasoning**: 申请理由不可修改

#### Property: requestedAt
- **Type**: number
- **Purpose**: 申请提交时间
- **Data Source**: 创建时设置
- **Update Frequency**: 从不更新
- **Computation Decision**: defaultValue function
- **Reasoning**: 只需要在创建时设置一次
- **Dependencies**: 无
- **Calculation Method**: `() => Math.floor(Date.now()/1000)`

#### Property: status
- **Type**: string
- **Purpose**: 申请状态 ('pending' | 'approved' | 'rejected')
- **Data Source**: 状态转换
- **Update Frequency**: ProcessKickoutRequest交互时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换流程
- **Dependencies**: ProcessKickoutRequest交互，处理决定
- **Calculation Method**: pending→approved/rejected (根据决定)

#### Property: processedAt
- **Type**: number
- **Purpose**: 处理时间
- **Data Source**: 处理申请时设置
- **Update Frequency**: ProcessKickoutRequest交互时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 只在申请被处理时设置时间
- **Dependencies**: ProcessKickoutRequest交互
- **Calculation Method**: 状态从pending转换时设置当前时间戳

#### Property: adminComment
- **Type**: string
- **Purpose**: 管理员处理意见
- **Data Source**: ProcessKickoutRequest payload
- **Update Frequency**: ProcessKickoutRequest交互时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 在申请处理时从payload获取评论
- **Dependencies**: ProcessKickoutRequest交互，payload.adminComment
- **Calculation Method**: 状态转换时从event.payload.adminComment获取

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过RequestKickout交互创建
- **Dependencies**: RequestKickout交互事件，payload数据，申请人和目标用户引用
- **Calculation Method**: 当RequestKickout触发时，创建新申请并关联相关用户

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 学生被分配到特定宿舍的特定床位
- **Creation**: AssignUserToDormitory交互创建
- **Deletion Requirements**: 可以被删除（用户被移除或踢出时）
- **Update Requirements**: 状态可能需要更新（active/inactive）
- **State Management**: 需要status字段标识关系状态
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建能力（Transform）和状态管理能力（StateMachine）
- **Dependencies**: AssignUserToDormitory交互创建，RemoveUserFromDormitory/ProcessKickoutRequest交互更新状态
- **Calculation Method**: 创建时建立关系，被踢出或移除时状态变为inactive

## Relation: DormitoryHeadRelation

### Relation Analysis
- **Purpose**: 指定宿舍的负责管理人员
- **Creation**: AssignDormHead交互创建
- **Deletion Requirements**: 可以被删除（撤销宿舍长时）
- **Update Requirements**: 状态更新（active/inactive）
- **State Management**: 需要isActive字段
- **Computation Decision**: Transform + isActive StateMachine
- **Reasoning**: 需要创建能力和状态管理能力
- **Dependencies**: AssignDormHead交互创建，RemoveDormHead交互更新状态
- **Calculation Method**: 创建时建立关系，撤销时状态变为inactive

## Relation: UserViolationRelation

### Relation Analysis
- **Purpose**: 用户的违规行为历史记录
- **Creation**: RecordViolation交互创建违规记录时自动建立
- **Deletion Requirements**: 从不删除（保留违规历史）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 通过ViolationRecord实体的用户引用自动创建
- **Dependencies**: N/A（通过实体引用自动建立）
- **Calculation Method**: N/A（无需计算）

## Relation: ViolationRuleRelation  

### Relation Analysis
- **Purpose**: 违规记录基于的扣分规则
- **Creation**: RecordViolation交互创建违规记录时自动建立
- **Deletion Requirements**: 从不删除（保留规则关联历史）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 通过ViolationRecord实体的规则引用自动创建
- **Dependencies**: N/A（通过实体引用自动建立）
- **Calculation Method**: N/A（无需计算）

## Relation: KickoutRequesterRelation

### Relation Analysis
- **Purpose**: 记录谁发起了踢出申请
- **Creation**: RequestKickout交互创建申请时自动建立
- **Deletion Requirements**: 从不删除（保留申请历史）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 通过KickoutRequest实体的申请人引用自动创建
- **Dependencies**: N/A（通过实体引用自动建立）
- **Calculation Method**: N/A（无需计算）

## Relation: KickoutTargetRelation

### Relation Analysis
- **Purpose**: 记录申请踢出的目标用户
- **Creation**: RequestKickout交互创建申请时自动建立
- **Deletion Requirements**: 从不删除（保留申请历史）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 通过KickoutRequest实体的目标用户引用自动创建
- **Dependencies**: N/A（通过实体引用自动建立）
- **Calculation Method**: N/A（无需计算）

## Relation: KickoutProcessorRelation

### Relation Analysis
- **Purpose**: 记录管理员处理申请的关系
- **Creation**: ProcessKickoutRequest交互处理申请时建立
- **Deletion Requirements**: 从不删除（保留处理历史）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无需状态管理
- **Computation Decision**: Transform
- **Reasoning**: 需要在申请被处理时创建处理人关系
- **Dependencies**: ProcessKickoutRequest交互，申请实体，处理人用户
- **Calculation Method**: 当申请状态从pending转换时，创建处理人关系

## 过滤实体设计

### ActiveUser (过滤实体)
- **Purpose**: 只显示活跃用户（未被踢出）
- **Source Entity**: User
- **Filter Condition**: `status = 'active'`
- **Business Value**: 在分配宿舍等操作中只显示可用用户

### ActiveDormitoryAssignments (过滤实体)
- **Purpose**: 只显示活跃的宿舍分配关系
- **Source Entity**: UserDormitoryRelation
- **Filter Condition**: `status = 'active'`
- **Business Value**: 统计当前实际入住情况

## 全局字典设计

### SystemStats (字典)
- **Purpose**: 系统整体统计信息
- **Type**: object
- **Collection**: false
- **Computation Decision**: Custom
- **Reasoning**: 需要复合统计计算（总用户数、宿舍数、待处理申请数等）
- **Dependencies**: User、Dormitory、KickoutRequest实体
- **Calculation Method**: 聚合统计各实体数量和状态分布

## 实现优先级

### 第一阶段（核心业务逻辑）
1. 实体创建的Transform计算
2. 基本的Count和computed属性
3. 简单的StateMachine状态转换

### 第二阶段（复杂计算）
1. 复合的StateMachine with computeValue
2. 关系状态管理
3. 全局字典统计

### 第三阶段（优化增强）
1. 过滤实体
2. 复杂的Custom计算
3. 性能优化

## 依赖关系图

```
InteractionEventEntity (触发源)
    ↓
Entity Transform (创建实体)
    ↓
Property StateMachine (状态管理)
    ↓
Count/Summation (聚合计算)
    ↓
Custom/Dictionary (复合统计)
```

## 关键注意事项

1. **StateNode声明**: 所有StateMachine使用的StateNode必须在使用前声明
2. **Transform位置**: Transform只能用于Entity/Relation computation，不能用于Property
3. **计算依赖**: 确保所有计算的依赖实体和关系都已正确定义
4. **默认值**: 所有计算属性都需要提供defaultValue
5. **状态管理**: 复杂的状态转换需要仔细设计StateTransfer的条件和目标