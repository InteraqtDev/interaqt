# 宿舍管理系统计算分析

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统用户，包括管理员、宿舍长和普通学生
- **Creation Source**: CreateUser 交互
- **Update Requirements**: 角色变更、积分更新、宿舍分配
- **Deletion Strategy**: 软删除，通过 status 字段标记

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 系统生成唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: ID 由框架自动生成和管理

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: CreateUser payload
- **Update Frequency**: 通过 UpdateUser 交互
- **Computation Decision**: None
- **Reasoning**: 基本字段，通过交互直接更新

#### Property: email
- **Type**: string
- **Purpose**: 邮箱，唯一标识
- **Data Source**: CreateUser payload
- **Update Frequency**: 通过 UpdateUser 交互
- **Computation Decision**: None
- **Reasoning**: 基本字段，通过交互直接更新

#### Property: role
- **Type**: string
- **Purpose**: 用户角色 (admin/dormHead/student)
- **Data Source**: CreateUser payload, AssignDormHead 交互
- **Update Frequency**: 通过 AssignDormHead 或 UpdateUser 交互
- **Computation Decision**: StateMachine
- **Reasoning**: 角色有明确的转换状态，需要跟踪变更
- **Dependencies**: AssignDormHead 交互, UpdateUser 交互
- **Calculation Method**: 
  - 初始状态为 'student'
  - AssignDormHead 触发转换为 'dormHead'
  - UpdateUser 可以更新为任意角色

#### Property: points
- **Type**: number
- **Purpose**: 行为积分，默认100
- **Data Source**: 初始值 + 行为记录累加
- **Update Frequency**: 创建行为记录时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 需要累加所有行为记录的积分
- **Dependencies**: BehaviorRecordUserRelation, BehaviorRecord.points
- **Calculation Method**: 初始值100 + 所有相关 BehaviorRecord.points 的总和

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: updatedAt
- **Type**: number
- **Purpose**: 更新时间戳
- **Data Source**: 任何更新操作
- **Update Frequency**: 任何字段变更时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要在任何更新时自动更新时间戳
- **Dependencies**: 所有用户更新交互
- **Calculation Method**: 任何状态转换时设置为 Date.now()

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 用户通过 CreateUser 交互创建
- **Dependencies**: CreateUser 交互事件, payload 数据
- **Calculation Method**: CreateUser 触发时创建新 User，使用 payload 中的 name, email，role 默认为 'student'，points 默认为 100

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍基本信息，包括容量和管理者
- **Creation Source**: CreateDormitory 交互
- **Update Requirements**: 名称、容量、状态更新
- **Deletion Strategy**: 软删除，通过 status 字段标记

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 系统生成唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: ID 由框架自动生成

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称，唯一
- **Data Source**: CreateDormitory payload
- **Update Frequency**: 通过 UpdateDormitory 交互
- **Computation Decision**: None
- **Reasoning**: 基本字段，通过交互直接更新

#### Property: capacity
- **Type**: number
- **Purpose**: 床位数量 (4-6)
- **Data Source**: CreateDormitory payload
- **Update Frequency**: 通过 UpdateDormitory 交互
- **Computation Decision**: None
- **Reasoning**: 基本字段，通过交互直接更新

#### Property: status
- **Type**: string
- **Purpose**: 状态 (active/inactive)
- **Data Source**: CreateDormitory 时默认 'active'
- **Update Frequency**: 通过 UpdateDormitory 或 DeleteDormitory 交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换
- **Dependencies**: CreateDormitory, UpdateDormitory, DeleteDormitory 交互
- **Calculation Method**: 
  - 初始状态 'active'
  - UpdateDormitory 可以改变状态
  - DeleteDormitory 转换为 'inactive'

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: updatedAt
- **Type**: number
- **Purpose**: 更新时间戳
- **Data Source**: 任何更新操作
- **Update Frequency**: 任何字段变更时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要在任何更新时自动更新时间戳
- **Dependencies**: 所有宿舍更新交互
- **Calculation Method**: 任何状态转换时设置为 Date.now()

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过 CreateDormitory 交互创建
- **Dependencies**: CreateDormitory 交互事件, payload 数据
- **Calculation Method**: CreateDormitory 触发时创建新 Dormitory，使用 payload 中的 name, capacity，自动创建相应数量的 Bed 实体

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内的具体床位
- **Creation Source**: 创建 Dormitory 时自动生成
- **Update Requirements**: 占用状态更新
- **Deletion Strategy**: 随 Dormitory 删除

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 系统生成唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: ID 由框架自动生成

#### Property: bedNumber
- **Type**: number
- **Purpose**: 床位编号 (1开始)
- **Data Source**: 创建 Dormitory 时生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时确定，永不更改

#### Property: isOccupied
- **Type**: boolean
- **Purpose**: 是否被占用
- **Data Source**: 用户分配状态
- **Update Frequency**: 分配或移除用户时
- **Computation Decision**: StateMachine
- **Reasoning**: 布尔状态，需要根据用户分配情况更新
- **Dependencies**: AssignUserToDormitory, RemoveUserFromDormitory 交互
- **Calculation Method**: 
  - 初始 false
  - AssignUserToDormitory 且分配到此床位时设为 true
  - RemoveUserFromDormitory 或用户被踢出时设为 false

#### Property: createdAt
- **Type**: number
- **Purpose**: 创建时间戳
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: updatedAt
- **Type**: number
- **Purpose**: 更新时间戳
- **Data Source**: 占用状态变更
- **Update Frequency**: 占用状态变更时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要在状态变更时更新时间戳
- **Dependencies**: isOccupied 状态变更
- **Calculation Method**: isOccupied 变更时设置为 Date.now()

### Entity Computation Decision
- **Type**: Transform
- **Source**: Dormitory (创建时触发)
- **Reasoning**: 床位在创建宿舍时自动生成
- **Dependencies**: Dormitory 创建, capacity 属性
- **Calculation Method**: Dormitory 创建时，生成 capacity 个 Bed，bedNumber 从 1 到 capacity

## Entity: BehaviorRecord

### Entity-Level Analysis
- **Purpose**: 记录用户的行为评分
- **Creation Source**: CreateBehaviorRecord 交互
- **Update Requirements**: 永不更新
- **Deletion Strategy**: 硬删除（需要审计时可改为软删除）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 系统生成唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: ID 由框架自动生成

#### Property: points
- **Type**: number
- **Purpose**: 分数变化
- **Data Source**: CreateBehaviorRecord payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: reason
- **Type**: string
- **Purpose**: 原因描述
- **Data Source**: CreateBehaviorRecord payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: createdAt
- **Type**: number
- **Purpose**: 记录时间戳
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 行为记录通过 CreateBehaviorRecord 交互创建
- **Dependencies**: CreateBehaviorRecord 交互事件, payload 数据
- **Calculation Method**: CreateBehaviorRecord 触发时创建新记录，使用 payload 中的 points, reason，自动设置 createdAt

## Entity: EvictionRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出用户的记录
- **Creation Source**: RequestEviction 交互
- **Update Requirements**: 状态更新
- **Deletion Strategy**: 保留历史记录

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 系统生成唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: ID 由框架自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 申请原因
- **Data Source**: RequestEviction payload
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: status
- **Type**: string
- **Purpose**: 状态 (pending/approved/rejected)
- **Data Source**: RequestEviction 时默认 'pending'
- **Update Frequency**: ApproveEviction 交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换流程
- **Dependencies**: RequestEviction, ApproveEviction 交互
- **Calculation Method**: 
  - 初始状态 'pending'
  - ApproveEviction 根据 approved 参数转换为 'approved' 或 'rejected'

#### Property: createdAt
- **Type**: number
- **Purpose**: 申请时间戳
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置，永不更改

#### Property: approvedAt
- **Type**: number
- **Purpose**: 审批时间戳
- **Data Source**: ApproveEviction 交互
- **Update Frequency**: 审批时
- **Computation Decision**: StateMachine
- **Reasoning**: 审批时设置的时间戳
- **Dependencies**: ApproveEviction 交互
- **Calculation Method**: 状态转换为 approved/rejected 时设置为 Date.now()

#### Property: approvedBy
- **Type**: string
- **Purpose**: 审批人ID
- **Data Source**: ApproveEviction payload
- **Update Frequency**: 审批时
- **Computation Decision**: StateMachine
- **Reasoning**: 审批时需要记录审批人
- **Dependencies**: ApproveEviction 交互, event.user
- **Calculation Method**: 状态转换时从 event.user.id 获取

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过 RequestEviction 交互创建
- **Dependencies**: RequestEviction 交互事件, payload 数据
- **Calculation Method**: RequestEviction 触发时创建新记录，使用 payload 中的 userId, reason，status 默认为 'pending'

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 建立用户与宿舍的分配关系
- **Creation**: AssignUserToDormitory 交互
- **Deletion Requirements**: 硬删除，当用户被移除或踢出时
- **Update Requirements**: 床位号可能需要更新
- **State Management**: 需要状态管理（active/inactive）
- **Computation Decision**: StateMachine
- **Reasoning**: 需要创建、更新和删除能力
- **Dependencies**: AssignUserToDormitory, RemoveUserFromDormitory, ApproveEviction 交互
- **Calculation Method**: 
  - AssignUserToDormitory 创建关系
  - RemoveUserFromDormitory 删除关系
  - ApproveEviction(approved=true) 删除关系

## Relation: DormitoryHeadRelation

### Relation Analysis
- **Purpose**: 指定宿舍的宿舍长
- **Creation**: AssignDormHead 交互
- **Deletion Requirements**: 硬删除，当更换宿舍长或删除宿舍时
- **Update Requirements**: 不需要更新属性
- **State Management**: 不需要显式状态
- **Computation Decision**: StateMachine
- **Reasoning**: 需要创建和删除能力
- **Dependencies**: AssignDormHead 交互
- **Calculation Method**: 
  - AssignDormHead 创建关系
  - 新的 AssignDormHead 替换旧的关系

## Relation: BedDormitoryRelation

### Relation Analysis
- **Purpose**: 定义床位属于哪个宿舍
- **Creation**: 创建 Dormitory 时自动创建
- **Deletion Requirements**: 随 Dormitory 删除
- **Update Requirements**: 永不更新
- **State Management**: 不需要状态
- **Computation Decision**: None
- **Reasoning**: 作为 Dormitory 的一部分自动创建和删除
- **Dependencies**: Dormitory 创建
- **Calculation Method**: 创建 Dormitory 时自动建立关系

## Relation: BehaviorRecordUserRelation

### Relation Analysis
- **Purpose**: 关联行为记录和用户
- **Creation**: 创建 BehaviorRecord 时自动创建
- **Deletion Requirements**: 随 BehaviorRecord 删除
- **Update Requirements**: 永不更新
- **State Management**: 不需要状态
- **Computation Decision**: None
- **Reasoning**: 作为 BehaviorRecord 的一部分自动创建
- **Dependencies**: BehaviorRecord 创建
- **Calculation Method**: 创建 BehaviorRecord 时通过实体引用自动建立

## Relation: BehaviorRecordRecorderRelation

### Relation Analysis
- **Purpose**: 记录是谁创建了行为记录
- **Creation**: 创建 BehaviorRecord 时自动创建
- **Deletion Requirements**: 随 BehaviorRecord 删除
- **Update Requirements**: 永不更新
- **State Management**: 不需要状态
- **Computation Decision**: None
- **Reasoning**: 作为 BehaviorRecord 的一部分自动创建
- **Dependencies**: BehaviorRecord 创建
- **Calculation Method**: 创建 BehaviorRecord 时通过实体引用自动建立

## Relation: EvictionRequestUserRelation

### Relation Analysis
- **Purpose**: 关联踢出申请和被申请的用户
- **Creation**: 创建 EvictionRequest 时自动创建
- **Deletion Requirements**: 随 EvictionRequest 删除
- **Update Requirements**: 永不更新
- **State Management**: 不需要状态
- **Computation Decision**: None
- **Reasoning**: 作为 EvictionRequest 的一部分自动创建
- **Dependencies**: EvictionRequest 创建
- **Calculation Method**: 创建 EvictionRequest 时通过实体引用自动建立

## Relation: EvictionRequestRequesterRelation

### Relation Analysis
- **Purpose**: 记录是谁提交了踢出申请
- **Creation**: 创建 EvictionRequest 时自动创建
- **Deletion Requirements**: 随 EvictionRequest 删除
- **Update Requirements**: 永不更新
- **State Management**: 不需要状态
- **Computation Decision**: None
- **Reasoning**: 作为 EvictionRequest 的一部分自动创建
- **Dependencies**: EvictionRequest 创建
- **Calculation Method**: 创建 EvictionRequest 时通过实体引用自动建立

## Relation: EvictionRequestApproverRelation

### Relation Analysis
- **Purpose**: 记录是谁批准了踢出申请
- **Creation**: 批准时创建
- **Deletion Requirements**: 随 EvictionRequest 删除
- **Update Requirements**: 永不更新
- **State Management**: 不需要状态
- **Computation Decision**: None
- **Reasoning**: 作为 EvictionRequest 状态更新的一部分自动创建
- **Dependencies**: ApproveEviction 交互
- **Calculation Method**: ApproveEviction 时通过实体引用自动建立

## 计算属性总结

### User 计算属性
- **totalPoints**: 通过 Summation 计算所有行为记录积分
- **behaviorCount**: 通过 Count 计算行为记录数量
- **isActiveInDormitory**: 通过检查 UserDormitoryRelation 状态

### Dormitory 计算属性
- **occupancy**: 通过 Count 计算 active 状态的用户数
- **availableBeds**: capacity - occupancy
- **occupancyRate**: occupancy / capacity

### Bed 计算属性
- **status**: 基于 isOccupied 的派生状态

### 状态节点定义需求
需要为所有 StateMachine 定义状态节点：
- User.role 状态: student, dormHead, admin
- Dormitory.status 状态: active, inactive
- Bed.isOccupied 状态: false, true
- EvictionRequest.status 状态: pending, approved, rejected
- UserDormitoryRelation 状态: active, inactive
- DormitoryHeadRelation 状态: exists, deleted