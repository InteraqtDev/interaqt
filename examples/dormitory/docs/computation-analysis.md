# Computation Analysis

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统用户，包括管理员、宿舍长和普通学生
- **Creation Source**: 预先存在，不通过Interaction创建（用户管理由外部系统处理）
- **Update Requirements**: role更新（成为宿舍长）、status更新（被踢出）、violationScore累加、时间戳更新
- **Deletion Strategy**: 不删除，通过status标记为evicted

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 框架自动处理ID生成

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: 初始创建时设置
- **Update Frequency**: 从不（本系统不提供用户信息更新）
- **Computation Decision**: None
- **Reasoning**: 静态字段，不需要计算

#### Property: email
- **Type**: string
- **Purpose**: 用户邮箱，唯一标识
- **Data Source**: 初始创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 静态字段，不需要计算

#### Property: role
- **Type**: string
- **Purpose**: 用户角色（admin/dormHead/student）
- **Data Source**: 初始值和AssignDormHead交互
- **Update Frequency**: 当被指定为宿舍长时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要响应AssignDormHead交互更新角色
- **Dependencies**: AssignDormHead交互，当前用户ID
- **Calculation Method**: 当AssignDormHead交互的userId匹配时，更新为'dormHead'

#### Property: status
- **Type**: string
- **Purpose**: 用户状态（active/inactive/evicted）
- **Data Source**: 初始值和ApproveEviction交互
- **Update Frequency**: 当踢出申请被批准时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→evicted）
- **Dependencies**: ApproveEviction交互，相关的EvictionRequest
- **Calculation Method**: 当ApproveEviction批准针对该用户的申请时，状态转为evicted

#### Property: violationScore
- **Type**: number
- **Purpose**: 累计违规分数
- **Data Source**: RecordViolation交互累加
- **Update Frequency**: 每次记录违规时
- **Computation Decision**: Summation
- **Reasoning**: 需要累加所有违规记录的分数
- **Dependencies**: UserViolationRelation，ViolationRecord的score属性
- **Calculation Method**: 累加所有相关ViolationRecord的score值

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: defaultValue
- **Reasoning**: 一次性设置，不再更改
- **Calculation Method**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: updatedAt
- **Type**: number
- **Purpose**: 更新时间戳
- **Data Source**: 任何更新操作
- **Update Frequency**: role或status变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在特定交互时更新时间戳
- **Dependencies**: AssignDormHead、ApproveEviction交互
- **Calculation Method**: 在状态转换时使用computeValue更新为当前时间戳

### Entity Computation Decision
- **Type**: None
- **Reasoning**: 用户不通过本系统的Interaction创建，由外部系统管理

---

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍房间
- **Creation Source**: CreateDormitory交互
- **Update Requirements**: status更新
- **Deletion Strategy**: 不删除，通过status标记为inactive

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 框架自动处理ID生成

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称（唯一）
- **Data Source**: CreateDormitory交互的payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不再更改

#### Property: capacity
- **Type**: number
- **Purpose**: 床位容量（4-6）
- **Data Source**: CreateDormitory交互的payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不再更改

#### Property: status
- **Type**: string
- **Purpose**: 宿舍状态（active/inactive）
- **Data Source**: 初始值active
- **Update Frequency**: 可能未来支持停用宿舍
- **Computation Decision**: defaultValue
- **Reasoning**: 当前需求中没有停用宿舍的交互
- **Calculation Method**: `defaultValue: () => 'active'`

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: defaultValue
- **Reasoning**: 一次性设置
- **Calculation Method**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: updatedAt
- **Type**: number
- **Purpose**: 更新时间戳
- **Data Source**: 任何更新操作
- **Update Frequency**: 当前没有更新操作
- **Computation Decision**: defaultValue
- **Reasoning**: 当前需求中没有更新宿舍的交互
- **Calculation Method**: `defaultValue: () => Math.floor(Date.now()/1000)`

### Additional Computed Properties

#### Property: occupiedBeds
- **Type**: number
- **Purpose**: 已占用床位数
- **Data Source**: 统计occupied状态的床位
- **Update Frequency**: 床位状态变化时自动更新
- **Computation Decision**: Count
- **Reasoning**: 需要统计特定状态的相关实体
- **Dependencies**: DormitoryBedsRelation，Bed的status属性
- **Calculation Method**: 统计相关床位中status='occupied'的数量

#### Property: availableBeds
- **Type**: number
- **Purpose**: 可用床位数
- **Data Source**: capacity - occupiedBeds
- **Update Frequency**: 自动计算
- **Computation Decision**: computed
- **Reasoning**: 基于当前记录的简单计算
- **Calculation Method**: `computed: function() { return this.capacity - this.occupiedBeds; }`

#### Property: occupancyRate
- **Type**: number
- **Purpose**: 入住率百分比
- **Data Source**: occupiedBeds / capacity
- **Update Frequency**: 自动计算
- **Computation Decision**: computed
- **Reasoning**: 基于当前记录的简单计算
- **Calculation Method**: `computed: function() { return (this.occupiedBeds / this.capacity) * 100; }`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory交互创建
- **Dependencies**: CreateDormitory交互事件，payload数据
- **Calculation Method**: 当CreateDormitory交互触发时，创建新的Dormitory实体

---

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内的床位
- **Creation Source**: 随Dormitory创建而自动创建
- **Update Requirements**: status更新（available/occupied）
- **Deletion Strategy**: 不删除，跟随宿舍生命周期

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 框架自动处理ID生成

#### Property: number
- **Type**: number
- **Purpose**: 床位编号（1-capacity）
- **Data Source**: 创建时根据序号设置
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不再更改

#### Property: status
- **Type**: string
- **Purpose**: 床位状态（available/occupied）
- **Data Source**: 初始值available，用户分配/踢出时更新
- **Update Frequency**: AssignUserToDormitory和ApproveEviction时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换
- **Dependencies**: AssignUserToDormitory、ApproveEviction交互
- **Calculation Method**: 分配用户时转为occupied，用户被踢出时转回available

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: defaultValue
- **Reasoning**: 一次性设置
- **Calculation Method**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: updatedAt
- **Type**: number
- **Purpose**: 更新时间戳
- **Data Source**: status变化时
- **Update Frequency**: 状态变化时
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在状态变化时更新
- **Dependencies**: 与status的StateMachine共享
- **Calculation Method**: 在status状态转换时更新为当前时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: Dormitory
- **Reasoning**: 床位在宿舍创建时自动生成
- **Dependencies**: Dormitory实体的创建，capacity属性
- **Calculation Method**: 当Dormitory创建时，根据capacity创建对应数量的Bed实体

---

## Entity: ViolationRecord

### Entity-Level Analysis
- **Purpose**: 用户的违规记录
- **Creation Source**: RecordViolation交互
- **Update Requirements**: 无（一旦创建不可修改）
- **Deletion Strategy**: 不删除（审计需要）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 框架自动处理ID生成

#### Property: reason
- **Type**: string
- **Purpose**: 违规原因描述
- **Data Source**: RecordViolation交互的payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不可修改

#### Property: score
- **Type**: number
- **Purpose**: 扣分值（1-10）
- **Data Source**: RecordViolation交互的payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不可修改

#### Property: createdAt
- **Type**: number
- **Purpose**: 记录时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: defaultValue
- **Reasoning**: 一次性设置
- **Calculation Method**: `defaultValue: () => Math.floor(Date.now()/1000)`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 违规记录通过RecordViolation交互创建
- **Dependencies**: RecordViolation交互事件，payload数据
- **Calculation Method**: 当RecordViolation交互触发时，创建新的ViolationRecord实体

---

## Entity: EvictionRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长对违规用户的踢出申请
- **Creation Source**: RequestEviction交互
- **Update Requirements**: status更新、处理信息更新
- **Deletion Strategy**: 不删除（审计需要）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 唯一标识符
- **Data Source**: 系统自动生成
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 框架自动处理ID生成

#### Property: reason
- **Type**: string
- **Purpose**: 申请理由
- **Data Source**: RequestEviction交互的payload
- **Update Frequency**: 从不
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不可修改

#### Property: status
- **Type**: string
- **Purpose**: 申请状态（pending/approved/rejected）
- **Data Source**: 初始值pending，审批时更新
- **Update Frequency**: ApproveEviction或RejectEviction时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换
- **Dependencies**: ApproveEviction、RejectEviction交互
- **Calculation Method**: pending→approved（ApproveEviction）或pending→rejected（RejectEviction）

#### Property: createdAt
- **Type**: number
- **Purpose**: 申请时间戳
- **Data Source**: 创建时设置
- **Update Frequency**: 从不
- **Computation Decision**: defaultValue
- **Reasoning**: 一次性设置
- **Calculation Method**: `defaultValue: () => Math.floor(Date.now()/1000)`

#### Property: processedAt
- **Type**: number
- **Purpose**: 处理时间戳
- **Data Source**: 审批时设置
- **Update Frequency**: 审批时一次
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 在状态转换时记录时间
- **Dependencies**: ApproveEviction、RejectEviction交互
- **Calculation Method**: 当状态从pending转换时，记录当前时间戳

#### Property: adminComment
- **Type**: string
- **Purpose**: 管理员处理意见
- **Data Source**: 审批交互的payload
- **Update Frequency**: 审批时一次
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要从交互payload获取值
- **Dependencies**: ApproveEviction、RejectEviction交互的comment字段
- **Calculation Method**: 从event.payload.comment获取值

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过RequestEviction交互创建
- **Dependencies**: RequestEviction交互事件，payload数据
- **Calculation Method**: 当RequestEviction交互触发时，创建新的EvictionRequest实体

---

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 用户被分配到的宿舍
- **Creation**: 通过AssignUserToDormitory交互创建
- **Deletion Requirements**: 当用户被踢出时需要删除（ApproveEviction）
- **Update Requirements**: 无属性更新需求
- **State Management**: 不需要状态管理（存在即有效）
- **Computation Decision**: StateMachine（需要删除能力）
- **Reasoning**: Transform只能创建不能删除，需要响应ApproveEviction删除关系
- **Dependencies**: AssignUserToDormitory和ApproveEviction交互
- **Calculation Method**: AssignUserToDormitory创建关系，ApproveEviction时硬删除

---

## Relation: UserBedRelation

### Relation Analysis
- **Purpose**: 用户占用的具体床位
- **Creation**: 通过AssignUserToDormitory交互创建
- **Deletion Requirements**: 当用户被踢出时需要删除（ApproveEviction）
- **Update Requirements**: 无属性更新需求
- **State Management**: 不需要状态管理
- **Computation Decision**: StateMachine（需要删除能力）
- **Reasoning**: Transform只能创建不能删除，需要响应ApproveEviction删除关系
- **Dependencies**: AssignUserToDormitory和ApproveEviction交互
- **Calculation Method**: AssignUserToDormitory创建关系，ApproveEviction时硬删除

---

## Relation: DormitoryBedsRelation

### Relation Analysis
- **Purpose**: 宿舍包含的所有床位
- **Creation**: 随Bed创建自动建立（在Bed的Transform中引用dormitory）
- **Deletion Requirements**: 从不删除（跟随实体生命周期）
- **Update Requirements**: 无
- **State Management**: 无
- **Computation Decision**: None
- **Reasoning**: 在Bed创建时通过实体引用自动建立
- **Dependencies**: N/A
- **Calculation Method**: N/A

---

## Relation: DormitoryDormHeadRelation

### Relation Analysis
- **Purpose**: 负责管理该宿舍的宿舍长
- **Creation**: 通过AssignDormHead交互创建
- **Deletion Requirements**: 可能需要撤销宿舍长（当前需求未明确）
- **Update Requirements**: 无属性更新需求
- **State Management**: 不需要状态管理
- **Computation Decision**: Transform（当前不需要删除）
- **Reasoning**: 当前需求中没有撤销宿舍长的交互，只需创建
- **Dependencies**: AssignDormHead交互
- **Calculation Method**: AssignDormHead时创建关系

---

## Relation: UserViolationRelation

### Relation Analysis
- **Purpose**: 用户的所有违规记录
- **Creation**: 随ViolationRecord创建自动建立
- **Deletion Requirements**: 从不删除（审计需要）
- **Update Requirements**: 无
- **State Management**: 无
- **Computation Decision**: None
- **Reasoning**: 在ViolationRecord创建时通过实体引用自动建立
- **Dependencies**: N/A
- **Calculation Method**: N/A

---

## Relation: ViolationRecorderRelation

### Relation Analysis
- **Purpose**: 记录违规的宿舍长
- **Creation**: 随ViolationRecord创建自动建立
- **Deletion Requirements**: 从不删除（审计需要）
- **Update Requirements**: 无
- **State Management**: 无
- **Computation Decision**: None
- **Reasoning**: 在ViolationRecord创建时通过实体引用自动建立
- **Dependencies**: N/A
- **Calculation Method**: N/A

---

## Relation: EvictionRequestUserRelation

### Relation Analysis
- **Purpose**: 被申请踢出的用户
- **Creation**: 随EvictionRequest创建自动建立
- **Deletion Requirements**: 从不删除（审计需要）
- **Update Requirements**: 无
- **State Management**: 无
- **Computation Decision**: None
- **Reasoning**: 在EvictionRequest创建时通过实体引用自动建立
- **Dependencies**: N/A
- **Calculation Method**: N/A

---

## Relation: EvictionRequestDormHeadRelation

### Relation Analysis
- **Purpose**: 发起申请的宿舍长
- **Creation**: 随EvictionRequest创建自动建立
- **Deletion Requirements**: 从不删除（审计需要）
- **Update Requirements**: 无
- **State Management**: 无
- **Computation Decision**: None
- **Reasoning**: 在EvictionRequest创建时通过实体引用自动建立
- **Dependencies**: N/A
- **Calculation Method**: N/A

---

## Relation: EvictionRequestAdminRelation

### Relation Analysis
- **Purpose**: 处理申请的管理员
- **Creation**: 通过ApproveEviction或RejectEviction交互创建
- **Deletion Requirements**: 从不删除（审计需要）
- **Update Requirements**: 无
- **State Management**: 无
- **Computation Decision**: Transform
- **Reasoning**: 需要在审批时创建关系，不需要删除
- **Dependencies**: ApproveEviction、RejectEviction交互
- **Calculation Method**: 审批交互触发时创建关系

---

## Additional Computed Properties Summary

### User额外计算属性
- **violationCount**: 违规次数，使用Count计算UserViolationRelation
- **canBeEvicted**: 是否可被踢出（violationScore >= 30），使用computed函数
- **isAssigned**: 是否已分配宿舍，使用computed基于dormitory关系判断

## Implementation Checklist

- [x] 所有实体已分析并记录
- [x] 所有属性已分析并记录
- [x] 实体级Transform已确定（Dormitory、Bed、ViolationRecord、EvictionRequest）
- [x] 属性计算已根据分析确定
- [x] 所有计算的依赖已记录
- [x] 所有计算方法已描述
- [x] 关系生命周期已完整分析
- [x] 删除策略已明确（硬删除用于UserDormitoryRelation和UserBedRelation）
- [x] StateNode将在实现时先声明
- [x] 没有在Property计算中使用Transform
- [x] 分析文档已保存到`docs/computation-analysis.md`
