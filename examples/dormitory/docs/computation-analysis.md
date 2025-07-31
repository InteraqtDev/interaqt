# 宿舍管理系统计算分析

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的所有人员，包括管理员、宿舍长、学生
- **Creation Source**: 外部系统处理（用户注册、认证等不在此系统范围）
- **Update Requirements**: 角色更新（student→dormHead）、总分数更新、状态更新（active→kicked）
- **Deletion Strategy**: 软删除（状态变为kicked），保持历史记录

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 用户唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None（系统处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: 用户注册时提供或管理员录入
- **Update Frequency**: 很少更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，直接存储和更新

#### Property: email
- **Type**: string
- **Purpose**: 用户邮箱，唯一标识符
- **Data Source**: 用户注册时提供
- **Update Frequency**: 很少更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，直接存储

#### Property: role
- **Type**: string
- **Purpose**: 用户角色（admin/dormHead/student）
- **Data Source**: 初始为student，通过AssignDormHead交互更新
- **Update Frequency**: 当用户被指定为宿舍长时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（student↔dormHead），需要状态管理
- **Dependencies**: AssignDormHead、RemoveDormHead交互，当前role值
- **Calculation Method**: student→dormHead（AssignDormHead交互），dormHead→student（RemoveDormHead交互或移除管理宿舍）

#### Property: totalScore
- **Type**: number
- **Purpose**: 用户当前总分数
- **Data Source**: 初始值100，根据扣分记录计算
- **Update Frequency**: 每次扣分操作后自动更新
- **Computation Decision**: Custom
- **Reasoning**: 需要复杂计算：100 - Sum(所有扣分记录的score)，无法用简单Summation实现
- **Dependencies**: UserScoreRecordRelation，ScoreRecord实体（score属性）
- **Calculation Method**: 基础分100分减去所有相关扣分记录的分数总和

#### Property: status
- **Type**: string
- **Purpose**: 用户状态（active/kicked/suspended）
- **Data Source**: 状态转换
- **Update Frequency**: 当踢出申请被批准时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→kicked），且状态变化有明确触发条件
- **Dependencies**: ApproveKickRequest交互，当前status值
- **Calculation Method**: active→kicked（ApproveKickRequest交互批准时）

#### Property: createdAt
- **Type**: number
- **Purpose**: 用户创建时间戳
- **Data Source**: 用户创建时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 创建时一次性设置，不需要后续计算
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: updatedAt
- **Type**: number
- **Purpose**: 用户最后更新时间戳
- **Data Source**: 任何用户信息更新时的系统时间
- **Update Frequency**: 用户信息发生任何变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在多种交互触发时更新为当前时间
- **Dependencies**: 所有可能修改用户信息的交互（AssignDormHead、DeductUserScore、ApproveKickRequest等）
- **Calculation Method**: 在任何状态转换时设置为当前时间戳

### Entity Computation Decision
- **Type**: None
- **Source**: N/A
- **Reasoning**: 用户实体由外部系统（认证系统）管理，不在此系统内创建
- **Dependencies**: N/A
- **Calculation Method**: N/A

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍建筑单位，包含多个床位
- **Creation Source**: CreateDormitory交互
- **Update Requirements**: 名称、容量、状态更新，当前入住人数自动更新
- **Deletion Strategy**: 软删除（状态变为inactive），保持历史记录

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 宿舍唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None（系统处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称（如"A栋101"）
- **Data Source**: CreateDormitory交互payload
- **Update Frequency**: 通过UpdateDormitory交互偶尔更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，直接存储和更新

#### Property: capacity
- **Type**: number
- **Purpose**: 床位数量（4-6床）
- **Data Source**: CreateDormitory交互payload
- **Update Frequency**: 通过UpdateDormitory交互偶尔更新
- **Computation Decision**: None
- **Reasoning**: 简单数值字段，直接存储和更新

#### Property: currentOccupancy
- **Type**: number
- **Purpose**: 当前入住人数
- **Data Source**: 统计活跃的用户-宿舍关系
- **Update Frequency**: 用户分配/移除时自动更新
- **Computation Decision**: Count
- **Reasoning**: 直接计数活跃的UserDormitoryRelation记录
- **Dependencies**: UserDormitoryRelation（方向：target），status='active'的关系
- **Calculation Method**: 计数所有指向此宿舍且status='active'的UserDormitoryRelation记录

#### Property: status
- **Type**: string
- **Purpose**: 宿舍状态（active/inactive/maintenance）
- **Data Source**: 状态转换
- **Update Frequency**: 通过UpdateDormitory交互或系统维护时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态值，可能有状态转换逻辑
- **Dependencies**: UpdateDormitory交互，当前status值
- **Calculation Method**: 根据UpdateDormitory交互的payload更新状态

#### Property: createdAt
- **Type**: number
- **Purpose**: 宿舍创建时间戳
- **Data Source**: 宿舍创建时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 创建时一次性设置
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: updatedAt
- **Type**: number
- **Purpose**: 宿舍最后更新时间戳
- **Data Source**: 任何宿舍信息更新时的系统时间
- **Update Frequency**: 宿舍信息发生变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在更新操作时自动更新时间戳
- **Dependencies**: UpdateDormitory交互及其他可能修改宿舍的操作
- **Calculation Method**: 在任何更新操作时设置为当前时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory交互创建
- **Dependencies**: CreateDormitory交互事件，payload数据
- **Calculation Method**: 当CreateDormitory交互触发时，从payload创建新的Dormitory实体

## Entity: ScoreRule

### Entity-Level Analysis
- **Purpose**: 定义各种违规行为的扣分标准
- **Creation Source**: CreateScoreRule交互
- **Update Requirements**: 名称、描述、扣分数值更新，激活状态切换
- **Deletion Strategy**: 软删除（isActive设为false），保持历史记录

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 扣分规则唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None（系统处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: name
- **Type**: string
- **Purpose**: 规则名称（如"晚归"）
- **Data Source**: CreateScoreRule交互payload
- **Update Frequency**: 通过UpdateScoreRule交互偶尔更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，直接存储和更新

#### Property: description
- **Type**: string
- **Purpose**: 规则详细描述
- **Data Source**: CreateScoreRule交互payload
- **Update Frequency**: 通过UpdateScoreRule交互偶尔更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，直接存储和更新

#### Property: scoreDeduction
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: CreateScoreRule交互payload
- **Update Frequency**: 通过UpdateScoreRule交互偶尔更新
- **Computation Decision**: None
- **Reasoning**: 简单数值字段，直接存储和更新

#### Property: isActive
- **Type**: boolean
- **Purpose**: 规则是否生效
- **Data Source**: 状态切换
- **Update Frequency**: 通过DeactivateScoreRule交互或重新激活
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的激活/停用状态转换
- **Dependencies**: DeactivateScoreRule交互，当前isActive值
- **Calculation Method**: true→false（DeactivateScoreRule交互），可能需要重新激活机制

#### Property: createdAt
- **Type**: number
- **Purpose**: 规则创建时间戳
- **Data Source**: 规则创建时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 创建时一次性设置
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: updatedAt
- **Type**: number
- **Purpose**: 规则最后更新时间戳
- **Data Source**: 任何规则信息更新时的系统时间
- **Update Frequency**: 规则信息发生变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在更新操作时自动更新时间戳
- **Dependencies**: UpdateScoreRule、DeactivateScoreRule交互
- **Calculation Method**: 在任何更新操作时设置为当前时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分规则通过CreateScoreRule交互创建
- **Dependencies**: CreateScoreRule交互事件，payload数据
- **Calculation Method**: 当CreateScoreRule交互触发时，从payload创建新的ScoreRule实体

## Entity: ScoreRecord

### Entity-Level Analysis
- **Purpose**: 记录用户的具体扣分情况，不可删除
- **Creation Source**: DeductUserScore交互
- **Update Requirements**: 无（记录一旦创建不可修改）
- **Deletion Strategy**: 永不删除（审计需要）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 扣分记录唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None（系统处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: reason
- **Type**: string
- **Purpose**: 具体扣分原因（操作员填写）
- **Data Source**: DeductUserScore交互payload
- **Update Frequency**: 从不更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，创建时设置

#### Property: score
- **Type**: number
- **Purpose**: 扣分数值（来源于规则）
- **Data Source**: 对应ScoreRule的scoreDeduction值
- **Update Frequency**: 从不更新
- **Computation Decision**: None
- **Reasoning**: 在创建时从相关ScoreRule复制数值，之后不变

#### Property: createdAt
- **Type**: number
- **Purpose**: 扣分时间戳
- **Data Source**: 扣分操作时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 创建时一次性设置
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: operatorNotes
- **Type**: string
- **Purpose**: 操作员备注（可选）
- **Data Source**: DeductUserScore交互payload
- **Update Frequency**: 从不更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，创建时设置

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分记录通过DeductUserScore交互创建
- **Dependencies**: DeductUserScore交互事件，相关ScoreRule实体，payload数据
- **Calculation Method**: 当DeductUserScore交互触发时，从payload和相关ScoreRule创建新的ScoreRecord实体

## Entity: KickRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出某用户的记录
- **Creation Source**: RequestKickUser交互
- **Update Requirements**: 状态更新（pending→approved/rejected），处理时间和备注更新
- **Deletion Strategy**: 永不删除（审计需要）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 踢出申请唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不更新
- **Computation Decision**: None（系统处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: reason
- **Type**: string
- **Purpose**: 申请理由
- **Data Source**: RequestKickUser交互payload
- **Update Frequency**: 从不更新
- **Computation Decision**: None
- **Reasoning**: 简单字符串字段，创建时设置

#### Property: status
- **Type**: string
- **Purpose**: 申请状态（pending/approved/rejected）
- **Data Source**: 状态转换
- **Update Frequency**: 管理员处理申请时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（pending→approved/rejected）
- **Dependencies**: ApproveKickRequest、RejectKickRequest交互，当前status值
- **Calculation Method**: pending→approved（ApproveKickRequest），pending→rejected（RejectKickRequest）

#### Property: createdAt
- **Type**: number
- **Purpose**: 申请时间戳
- **Data Source**: 申请创建时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 创建时一次性设置
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: processedAt
- **Type**: number
- **Purpose**: 处理时间戳（批准/拒绝时设置）
- **Data Source**: 申请处理时的系统时间
- **Update Frequency**: 申请状态变更时一次性设置
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在状态转换时设置处理时间
- **Dependencies**: ApproveKickRequest、RejectKickRequest交互
- **Calculation Method**: 当状态从pending转换为approved/rejected时设置为当前时间戳

#### Property: adminNotes
- **Type**: string
- **Purpose**: 管理员处理备注（可选）
- **Data Source**: ApproveKickRequest/RejectKickRequest交互payload
- **Update Frequency**: 申请处理时一次性设置
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在状态转换时从交互payload获取备注
- **Dependencies**: ApproveKickRequest、RejectKickRequest交互payload
- **Calculation Method**: 当状态转换时从交互event.payload获取adminNotes

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过RequestKickUser交互创建
- **Dependencies**: RequestKickUser交互事件，payload数据
- **Calculation Method**: 当RequestKickUser交互触发时，从payload创建新的KickRequest实体

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 记录用户的宿舍分配和床位信息
- **Creation**: 通过AssignUserToDormitory交互在现有用户和宿舍间创建
- **Deletion Requirements**: 软删除（状态变为inactive），当用户被踢出或转移时
- **Update Requirements**: 状态属性需要更新（active→inactive）
- **State Management**: status字段管理关系状态（active/inactive）
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建关系（Transform）和管理状态变更（StateMachine），保持审计记录
- **Dependencies**: AssignUserToDormitory交互创建关系，ApproveKickRequest、RemoveUserFromDormitory交互更新状态
- **Calculation Method**: 创建时连接指定用户和宿舍，状态变更时更新为inactive而非删除记录

### Relation Properties

#### Property: assignedAt
- **Type**: number
- **Purpose**: 分配时间戳
- **Data Source**: 关系创建时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 分配时一次性设置
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: bedNumber
- **Type**: number
- **Purpose**: 床位号（1-capacity）
- **Data Source**: AssignUserToDormitory交互payload
- **Update Frequency**: 从不更新（如需更改需重新分配）
- **Computation Decision**: None
- **Reasoning**: 简单数值字段，创建时设置

#### Property: status
- **Type**: string
- **Purpose**: 分配状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 用户被踢出或移除时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→inactive）
- **Dependencies**: ApproveKickRequest、RemoveUserFromDormitory交互
- **Calculation Method**: active→inactive（用户被踢出或移除时）

## Relation: DormHeadDormitoryRelation

### Relation Analysis
- **Purpose**: 记录宿舍长的管理权限
- **Creation**: 通过AssignDormHead交互在现有用户和宿舍间创建
- **Deletion Requirements**: 软删除（状态变为inactive），当宿舍长被移除时
- **Update Requirements**: 状态属性需要更新（active→inactive）
- **State Management**: status字段管理关系状态（active/inactive）
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建关系（Transform）和管理状态变更（StateMachine），保持管理历史
- **Dependencies**: AssignDormHead交互创建关系，RemoveDormHead交互更新状态
- **Calculation Method**: 创建时连接指定用户和宿舍，移除时更新状态为inactive

### Relation Properties

#### Property: appointedAt
- **Type**: number
- **Purpose**: 任命时间戳
- **Data Source**: 关系创建时的系统时间
- **Update Frequency**: 从不更新
- **Computation Decision**: None（defaultValue）
- **Reasoning**: 任命时一次性设置
- **Implementation**: defaultValue: () => Math.floor(Date.now()/1000)

#### Property: status
- **Type**: string
- **Purpose**: 任命状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 宿舍长被移除时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→inactive）
- **Dependencies**: RemoveDormHead交互
- **Calculation Method**: active→inactive（宿舍长被移除时）

## Relation: UserScoreRecordRelation

### Relation Analysis
- **Purpose**: 连接用户与其扣分记录
- **Creation**: ScoreRecord创建时自动创建（通过实体引用）
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态管理需求
- **Computation Decision**: None
- **Reasoning**: 通过ScoreRecord实体创建时的用户引用自动创建
- **Dependencies**: N/A（通过实体引用自动创建）
- **Calculation Method**: N/A（无需单独计算）

## Relation: ScoreRuleRecordRelation

### Relation Analysis
- **Purpose**: 连接扣分规则与使用该规则的记录
- **Creation**: ScoreRecord创建时自动创建（通过实体引用）
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态管理需求
- **Computation Decision**: None
- **Reasoning**: 通过ScoreRecord实体创建时的规则引用自动创建
- **Dependencies**: N/A（通过实体引用自动创建）
- **Calculation Method**: N/A（无需单独计算）

## Relation: RequestorKickRequestRelation

### Relation Analysis
- **Purpose**: 连接宿舍长与其发起的踢出申请
- **Creation**: KickRequest创建时自动创建（通过实体引用）
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态管理需求
- **Computation Decision**: None
- **Reasoning**: 通过KickRequest实体创建时的申请人引用自动创建
- **Dependencies**: N/A（通过实体引用自动创建）
- **Calculation Method**: N/A（无需单独计算）

## Relation: TargetUserKickRequestRelation

### Relation Analysis
- **Purpose**: 连接被申请踢出的用户与踢出申请
- **Creation**: KickRequest创建时自动创建（通过实体引用）
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态管理需求
- **Computation Decision**: None
- **Reasoning**: 通过KickRequest实体创建时的目标用户引用自动创建
- **Dependencies**: N/A（通过实体引用自动创建）
- **Calculation Method**: N/A（无需单独计算）

## Relation: DormitoryKickRequestRelation

### Relation Analysis
- **Purpose**: 连接宿舍与相关的踢出申请
- **Creation**: KickRequest创建时自动创建（通过实体引用）
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态管理需求
- **Computation Decision**: None
- **Reasoning**: 通过KickRequest实体创建时的宿舍引用自动创建
- **Dependencies**: N/A（通过实体引用自动创建）
- **Calculation Method**: N/A（无需单独计算）

## Relation: OperatorScoreRecordRelation

### Relation Analysis
- **Purpose**: 记录扣分操作的执行者（管理员或宿舍长）
- **Creation**: ScoreRecord创建时自动创建（通过实体引用）
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无属性更新需求
- **State Management**: 无状态管理需求
- **Computation Decision**: None
- **Reasoning**: 通过ScoreRecord实体创建时的操作员引用自动创建
- **Dependencies**: N/A（通过实体引用自动创建）
- **Calculation Method**: N/A（无需单独计算）

## Dictionary: SystemStats

### Dictionary Analysis
- **Purpose**: 系统级统计信息
- **Type**: object
- **Collection**: false
- **Update Frequency**: 实时更新（当相关数据变化时）
- **Computation Decision**: Custom
- **Reasoning**: 需要复杂聚合计算（总用户数、总宿舍数、平均入住率、低分用户数等）
- **Dependencies**: User实体（status属性），Dormitory实体（currentOccupancy、capacity属性），所有相关关系
- **Calculation Method**: 聚合所有实体数据 - 统计各状态用户数、宿舍使用率、分数分布等指标

## 验证清单

- [x] 所有实体都已分析并记录
- [x] 所有属性都已分析并记录
- [x] 需要时定义了实体级Transform
- [x] 根据分析实现了属性计算
- [x] 所有计算的依赖项都已记录
- [x] 所有计算的计算方法都已记录
- [x] StateNode变量将在使用前声明
- [x] 确认Transform不用于属性计算
- [x] 检查了循环依赖
- [x] 为所有计算属性提供了默认值
- [x] 分析文档已保存到 `docs/computation-analysis.md`

## 关键决策总结

1. **用户总分数使用Custom计算**: 需要复杂的减法计算（100 - 扣分总和），无法用简单Summation实现
2. **关系采用软删除模式**: UserDormitoryRelation和DormHeadDormitoryRelation使用Transform创建 + status StateMachine管理，保持审计记录
3. **时间戳属性**: 创建时间使用defaultValue，更新时间使用StateMachine with computeValue
4. **状态管理**: 所有涉及状态转换的属性（user.role, user.status, dormitory.status等）都使用StateMachine
5. **计数属性**: dormitory.currentOccupancy使用Count计算，过滤active状态的关系
6. **审计需求**: ScoreRecord和KickRequest永不删除，所有相关关系保持历史记录