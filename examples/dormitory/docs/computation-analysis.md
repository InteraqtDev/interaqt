# 宿舍管理系统计算分析

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的所有用户，包括管理员、宿舍长和学生
- **Creation Source**: CreateUser interaction
- **Update Requirements**: 基本信息更新、角色变更、状态变更
- **Deletion Strategy**: 软删除，状态变为expelled (保留历史记录)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 用户唯一标识
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: CreateUser payload
- **Update Frequency**: 通过UpdateUser interaction更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: email
- **Type**: string
- **Purpose**: 邮箱地址，作为唯一标识
- **Data Source**: CreateUser payload
- **Update Frequency**: 通过UpdateUser interaction更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: phone
- **Type**: string
- **Purpose**: 手机号码
- **Data Source**: CreateUser payload
- **Update Frequency**: 通过UpdateUser interaction更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: role
- **Type**: string
- **Purpose**: 用户角色 (admin/dormHead/student)
- **Data Source**: CreateUser payload 或 AssignDormHead interaction
- **Update Frequency**: 通过AssignDormHead等interactions更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的角色状态和转换规则
- **Dependencies**: AssignDormHead interaction, 当前role值
- **Calculation Method**: 状态转换 - student→dormHead (AssignDormHead), admin状态保持不变

#### Property: status
- **Type**: string
- **Purpose**: 用户状态 (active/suspended/expelled)
- **Data Source**: 状态转换
- **Update Frequency**: 通过ProcessExpulsionRequest等interactions更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态(active, suspended, expelled)和明确的转换
- **Dependencies**: ProcessExpulsionRequest interaction, 当前status值
- **Calculation Method**: 状态转换 - active→expelled (ProcessExpulsionRequest批准)

#### Property: createdAt
- **Type**: number
- **Purpose**: 用户创建时间戳
- **Data Source**: 用户创建时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 一次性设置的时间戳
- **Implementation**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: totalPenaltyPoints
- **Type**: number
- **Purpose**: 用户累计扣分
- **Data Source**: BehaviorRecord实体的penaltyPoints字段之和
- **Update Frequency**: 当创建新的BehaviorRecord时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 简单求和计算
- **Dependencies**: UserBehaviorRecordRelation (direction: source), BehaviorRecord实体 (penaltyPoints属性)
- **Calculation Method**: 对所有相关BehaviorRecord记录的penaltyPoints字段求和

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 用户通过CreateUser interaction创建
- **Dependencies**: CreateUser interaction事件, payload数据
- **Calculation Method**: 当CreateUser interaction触发时，从event.payload创建新User实体

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍楼宇管理
- **Creation Source**: CreateDormitory interaction
- **Update Requirements**: 基本信息更新
- **Deletion Strategy**: 硬删除 (实际不会删除，只是业务上不使用)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 宿舍唯一标识
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称
- **Data Source**: CreateDormitory payload
- **Update Frequency**: 通过UpdateDormitory interaction更新
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新

#### Property: bedCount
- **Type**: number
- **Purpose**: 床位总数
- **Data Source**: CreateDormitory payload
- **Update Frequency**: Never (床位数创建后不变)
- **Computation Decision**: None
- **Reasoning**: 一次性设置的值

#### Property: availableBedCount
- **Type**: number
- **Purpose**: 可用床位数
- **Data Source**: 状态为'available'的Bed实体计数
- **Update Frequency**: 当床位状态变化时自动更新
- **Computation Decision**: Count with callback
- **Reasoning**: 需要条件过滤的计数
- **Dependencies**: DormitoryBedRelation (direction: source), Bed实体 (status属性)
- **Calculation Method**: 计算所有相关Bed记录中status='available'的数量

#### Property: createdAt
- **Type**: number
- **Purpose**: 宿舍创建时间戳
- **Data Source**: 宿舍创建时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 一次性设置的时间戳
- **Implementation**: `defaultValue: () => Math.floor(Date.now()/1000)`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory interaction创建
- **Dependencies**: CreateDormitory interaction事件, payload数据
- **Calculation Method**: 当CreateDormitory interaction触发时，创建新Dormitory实体，同时创建对应数量的Bed实体

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内的具体床位
- **Creation Source**: 随Dormitory创建时自动生成
- **Update Requirements**: 状态更新
- **Deletion Strategy**: 硬删除 (随宿舍删除，实际不会删除)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 床位唯一标识
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: bedNumber
- **Type**: string
- **Purpose**: 床位编号
- **Data Source**: 创建时生成 (如"床位1", "床位2")
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 一次性设置的标识

#### Property: status
- **Type**: string
- **Purpose**: 床位状态 (available/occupied/maintenance)
- **Data Source**: 状态转换
- **Update Frequency**: 通过AssignUserToBed, UpdateBedStatus等interactions更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态和转换规则
- **Dependencies**: AssignUserToBed, UpdateBedStatus interactions, 当前status值
- **Calculation Method**: 状态转换 - available→occupied (AssignUserToBed), occupied→available (用户被踢出时)

#### Property: createdAt
- **Type**: number
- **Purpose**: 床位创建时间戳
- **Data Source**: 床位创建时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 一次性设置的时间戳
- **Implementation**: `defaultValue: () => Math.floor(Date.now()/1000)`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 床位随宿舍创建时自动生成
- **Dependencies**: CreateDormitory interaction事件, bedCount参数
- **Calculation Method**: 当CreateDormitory interaction触发时，根据bedCount创建对应数量的Bed实体

## Entity: UserBedAssignment

### Entity-Level Analysis
- **Purpose**: 用户与床位的分配关系记录
- **Creation Source**: AssignUserToBed interaction
- **Update Requirements**: 状态更新
- **Deletion Strategy**: 软删除，状态变为inactive (保留分配历史)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 分配记录唯一标识
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: assignedAt
- **Type**: number
- **Purpose**: 分配时间戳
- **Data Source**: 分配时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 一次性设置的时间戳
- **Implementation**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: status
- **Type**: string
- **Purpose**: 分配状态 (active/inactive)
- **Data Source**: 状态转换
- **Update Frequency**: 通过ProcessExpulsionRequest等interactions更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态和转换规则
- **Dependencies**: ProcessExpulsionRequest interaction, 当前status值
- **Calculation Method**: 状态转换 - active→inactive (用户被踢出时)

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 分配记录通过AssignUserToBed interaction创建
- **Dependencies**: AssignUserToBed interaction事件, userId和bedId参数
- **Calculation Method**: 当AssignUserToBed interaction触发时，创建新的UserBedAssignment实体，连接指定的用户和床位

## Entity: BehaviorRecord

### Entity-Level Analysis
- **Purpose**: 用户违规行为记录
- **Creation Source**: RecordBehavior interaction
- **Update Requirements**: 无需更新 (记录一旦创建不可修改)
- **Deletion Strategy**: 硬删除 (实际不会删除，保留完整历史)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 行为记录唯一标识
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: behaviorType
- **Type**: string
- **Purpose**: 违规类型
- **Data Source**: RecordBehavior payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 一次性设置的值

#### Property: description
- **Type**: string
- **Purpose**: 违规描述
- **Data Source**: RecordBehavior payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 一次性设置的值

#### Property: penaltyPoints
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: RecordBehavior payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 一次性设置的值

#### Property: recordedAt
- **Type**: number
- **Purpose**: 记录时间戳
- **Data Source**: 记录创建时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 一次性设置的时间戳
- **Implementation**: `defaultValue: () => Math.floor(Date.now()/1000)`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 行为记录通过RecordBehavior interaction创建
- **Dependencies**: RecordBehavior interaction事件, payload数据, user上下文
- **Calculation Method**: 当RecordBehavior interaction触发时，创建新的BehaviorRecord实体

## Entity: ExpulsionRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出学生的请求
- **Creation Source**: CreateExpulsionRequest interaction
- **Update Requirements**: 状态更新、处理时间、管理员备注
- **Deletion Strategy**: 硬删除 (实际不会删除，保留审批历史)

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 申请唯一标识
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: ID由框架自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 申请理由
- **Data Source**: CreateExpulsionRequest payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 一次性设置的值

#### Property: status
- **Type**: string
- **Purpose**: 申请状态 (pending/approved/rejected)
- **Data Source**: 状态转换
- **Update Frequency**: 通过ProcessExpulsionRequest interaction更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有定义的状态和转换规则
- **Dependencies**: ProcessExpulsionRequest interaction, 当前status值, decision参数
- **Calculation Method**: 状态转换 - pending→approved/rejected (ProcessExpulsionRequest)

#### Property: requestedAt
- **Type**: number
- **Purpose**: 申请时间戳
- **Data Source**: 申请创建时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (使用defaultValue)
- **Reasoning**: 一次性设置的时间戳
- **Implementation**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: processedAt
- **Type**: number
- **Purpose**: 处理时间戳 (可选)
- **Data Source**: 处理时的系统时间
- **Update Frequency**: 通过ProcessExpulsionRequest interaction更新
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 仅在状态转换时更新时间戳
- **Dependencies**: ProcessExpulsionRequest interaction
- **Calculation Method**: 当状态从pending转换时，设置为Date.now()

#### Property: adminNotes
- **Type**: string
- **Purpose**: 管理员备注 (可选)
- **Data Source**: ProcessExpulsionRequest payload
- **Update Frequency**: 通过ProcessExpulsionRequest interaction更新
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 仅在处理时设置备注
- **Dependencies**: ProcessExpulsionRequest interaction, adminNotes参数
- **Calculation Method**: 从interaction payload获取adminNotes值

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过CreateExpulsionRequest interaction创建
- **Dependencies**: CreateExpulsionRequest interaction事件, payload数据, user上下文
- **Calculation Method**: 当CreateExpulsionRequest interaction触发时，创建新的ExpulsionRequest实体

## Relation: UserDormitoryHeadRelation

### Relation Analysis
- **Purpose**: 建立宿舍长与其管理宿舍的关系
- **Creation**: 通过AssignDormHead interaction在现有实体间创建
- **Deletion Requirements**: 硬删除当宿舍长角色变更时
- **Update Requirements**: assignedAt时间戳更新
- **State Management**: 无需状态管理
- **Computation Decision**: StateMachine only
- **Reasoning**: 需要创建和删除能力，Transform alone无法删除
- **Dependencies**: AssignDormHead interaction, 现有User和Dormitory实体
- **Calculation Method**: AssignDormHead interaction时创建关系，角色变更时删除关系

## Relation: DormitoryBedRelation

### Relation Analysis
- **Purpose**: 建立宿舍与其床位的关系
- **Creation**: 随Bed创建时自动建立
- **Deletion Requirements**: 硬删除随床位删除 (实际不会删除)
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系
- **Dependencies**: N/A (随Bed实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## Relation: UserBedAssignmentRelation

### Relation Analysis
- **Purpose**: 建立用户与床位分配记录的关系
- **Creation**: 随UserBedAssignment创建时自动建立
- **Deletion Requirements**: 随UserBedAssignment删除
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系
- **Dependencies**: N/A (随UserBedAssignment实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## Relation: BedAssignmentBedRelation

### Relation Analysis
- **Purpose**: 建立床位分配记录与床位的关系
- **Creation**: 随UserBedAssignment创建时自动建立
- **Deletion Requirements**: 随UserBedAssignment删除
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系
- **Dependencies**: N/A (随UserBedAssignment实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## Relation: UserBehaviorRecordRelation

### Relation Analysis
- **Purpose**: 建立用户与其行为记录的关系
- **Creation**: 随BehaviorRecord创建时自动建立
- **Deletion Requirements**: Never deleted (保留完整历史)
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系，无需删除
- **Dependencies**: N/A (随BehaviorRecord实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## Relation: BehaviorRecordRecorderRelation

### Relation Analysis
- **Purpose**: 建立行为记录与记录人的关系
- **Creation**: 随BehaviorRecord创建时自动建立
- **Deletion Requirements**: Never deleted (保留完整历史)
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系，无需删除
- **Dependencies**: N/A (随BehaviorRecord实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## Relation: ExpulsionRequestRequesterRelation

### Relation Analysis
- **Purpose**: 建立踢出申请与申请人的关系
- **Creation**: 随ExpulsionRequest创建时自动建立
- **Deletion Requirements**: Never deleted (保留审批历史)
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系，无需删除
- **Dependencies**: N/A (随ExpulsionRequest实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## Relation: ExpulsionRequestTargetRelation

### Relation Analysis
- **Purpose**: 建立踢出申请与目标用户的关系
- **Creation**: 随ExpulsionRequest创建时自动建立
- **Deletion Requirements**: Never deleted (保留审批历史)
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 随实体创建自动建立关系，无需删除
- **Dependencies**: N/A (随ExpulsionRequest实体创建自动建立)
- **Calculation Method**: N/A (无需计算)

## 计算实现检查清单

- [x] 所有实体已分析并记录
- [x] 所有属性已分析并记录
- [x] 实体级Transform定义需求已确定
- [x] 属性计算根据分析实现
- [x] 所有计算的依赖项已记录
- [x] 所有计算的计算方法已记录
- [x] StateNode变量声明计划已确定
- [x] 无Transform在属性计算中使用
- [x] 无循环依赖识别
- [x] 所有计算属性的默认值已计划
- [x] 分析文档已保存到 `docs/computation-analysis.md`