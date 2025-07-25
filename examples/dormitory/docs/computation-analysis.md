# 宿舍管理系统计算分析

## 分析基础

基于 `docs/entity-relation-design.md` 和 `docs/interaction-design.md` 的设计，对每个实体和属性进行系统性分析。

---

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的所有用户，包含管理员、宿舍长、普通学生
- **Creation Source**: CreateUser交互
- **Update Requirements**: 基本信息更新（name、email）、状态变更、扣分更新
- **Deletion Strategy**: 软删除（status变为inactive，保留记录用于审计）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 用户唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: 永不更新
- **Computation Decision**: None（框架处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: CreateUser交互payload
- **Update Frequency**: 通过UpdateUserInfo交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新即可

#### Property: email
- **Type**: string
- **Purpose**: 用户邮箱
- **Data Source**: CreateUser交互payload
- **Update Frequency**: 通过UpdateUserInfo交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新即可

#### Property: role
- **Type**: string
- **Purpose**: 用户角色（admin/dormHead/student）
- **Data Source**: CreateUser交互payload
- **Update Frequency**: 管理员可修改角色
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新即可

#### Property: score
- **Type**: number
- **Purpose**: 累计违规扣分
- **Data Source**: 所有违规记录的扣分总和
- **Update Frequency**: 每次记录违规时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 需要对用户的所有违规记录进行scoreDeducted字段求和

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 用户创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 设置为创建时的时间戳，不需要后续更新

#### Property: status
- **Type**: string
- **Purpose**: 用户状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 管理员操作或踢出申请通过时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active ↔ inactive）

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 用户通过CreateUser交互创建

---

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍信息管理
- **Creation Source**: CreateDormitory交互
- **Update Requirements**: 宿舍名称、状态更新
- **Deletion Strategy**: 软删除（status变为inactive，保留历史记录）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 宿舍唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: 永不更新
- **Computation Decision**: None（框架处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称
- **Data Source**: CreateDormitory交互payload
- **Update Frequency**: 通过UpdateDormitoryInfo交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接更新即可

#### Property: capacity
- **Type**: number
- **Purpose**: 床位容量（4-6个）
- **Data Source**: CreateDormitory交互payload
- **Update Frequency**: 很少更新（需要业务规则验证）
- **Computation Decision**: None
- **Reasoning**: 简单字段，但需要Stage 2业务规则验证范围

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 宿舍创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 设置为创建时的时间戳

#### Property: status
- **Type**: string
- **Purpose**: 宿舍状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 管理员操作时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active ↔ inactive）

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory交互创建

---

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内具体床位管理
- **Creation Source**: CreateDormitory交互时自动创建床位
- **Update Requirements**: 床位状态变更（available/occupied/maintenance）
- **Deletion Strategy**: 与宿舍同生命周期，不单独删除

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 床位唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: 永不更新
- **Computation Decision**: None（框架处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: bedNumber
- **Type**: string
- **Purpose**: 床位编号（如"A1"、"A2"）
- **Data Source**: 创建宿舍时按顺序生成
- **Update Frequency**: 永不更新
- **Computation Decision**: None
- **Reasoning**: 创建时设置，不需要后续更新

#### Property: status
- **Type**: string
- **Purpose**: 床位状态（available/occupied/maintenance）
- **Data Source**: 状态转换
- **Update Frequency**: 用户分配/移除、维护操作时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（available ↔ occupied ↔ maintenance）

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 床位创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 设置为创建时的时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 床位在CreateDormitory交互时自动批量创建

---

## Entity: ViolationRecord

### Entity-Level Analysis
- **Purpose**: 记录用户违规行为和扣分情况
- **Creation Source**: RecordViolation交互
- **Update Requirements**: 只读记录，不允许修改
- **Deletion Strategy**: 永久保留（审计需要）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 违规记录唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: 永不更新
- **Computation Decision**: None（框架处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: violationType
- **Type**: string
- **Purpose**: 违规类型
- **Data Source**: RecordViolation交互payload
- **Update Frequency**: 永不更新
- **Computation Decision**: None
- **Reasoning**: 记录一旦创建不允许修改

#### Property: description
- **Type**: string
- **Purpose**: 违规详细描述
- **Data Source**: RecordViolation交互payload
- **Update Frequency**: 永不更新
- **Computation Decision**: None
- **Reasoning**: 记录一旦创建不允许修改

#### Property: scoreDeducted
- **Type**: number
- **Purpose**: 本次违规扣除的分数
- **Data Source**: RecordViolation交互payload
- **Update Frequency**: 永不更新
- **Computation Decision**: None
- **Reasoning**: 记录一旦创建不允许修改

#### Property: recordedAt
- **Type**: bigint
- **Purpose**: 违规记录时间戳
- **Data Source**: 记录时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 设置为记录时的时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 违规记录通过RecordViolation交互创建

---

## Entity: KickoutRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出用户的流程管理
- **Creation Source**: CreateKickoutRequest交互
- **Update Requirements**: 状态更新（pending → approved/rejected）、处理信息
- **Deletion Strategy**: 永久保留（审计需要）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 踢出申请唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: 永不更新
- **Computation Decision**: None（框架处理）
- **Reasoning**: ID由框架自动生成和管理

#### Property: reason
- **Type**: string
- **Purpose**: 申请踢出的理由
- **Data Source**: CreateKickoutRequest交互payload
- **Update Frequency**: 永不更新
- **Computation Decision**: None
- **Reasoning**: 申请理由不允许修改

#### Property: status
- **Type**: string
- **Purpose**: 申请状态（pending/approved/rejected）
- **Data Source**: 状态转换
- **Update Frequency**: 管理员处理申请时
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（pending → approved/rejected）

#### Property: requestedAt
- **Type**: bigint
- **Purpose**: 申请创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 设置为申请创建时的时间戳

#### Property: processedAt
- **Type**: bigint
- **Purpose**: 申请处理时间戳
- **Data Source**: 处理时的当前时间
- **Update Frequency**: 管理员处理申请时一次性设置
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 在状态转换到approved/rejected时设置为当前时间

#### Property: decision
- **Type**: string
- **Purpose**: 处理决定（approved/rejected）
- **Data Source**: ProcessKickoutRequest交互payload
- **Update Frequency**: 管理员处理申请时一次性设置
- **Computation Decision**: None
- **Reasoning**: 直接从交互payload设置

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过CreateKickoutRequest交互创建

---

## Relation Analysis

### UserDormitoryRelation

#### Relation Analysis
- **Purpose**: 记录用户分配到宿舍的关系
- **Creation**: AssignUserToDormitory交互时创建
- **Deletion Requirements**: 可以删除（用户被踢出或重新分配）
- **Update Requirements**: status属性更新（active ↔ inactive）
- **State Management**: 需要状态管理来处理分配的激活/停用
- **Computation Decision**: Transform + StateMachine for status
- **Reasoning**: 需要创建关系（Transform）并管理状态变化（StateMachine for status），采用软删除模式保留审计记录

#### Property Analysis

##### Property: assignedAt
- **Type**: bigint
- **Purpose**: 分配时间戳
- **Data Source**: 分配时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 记录分配时间，不需要更新

##### Property: status
- **Type**: string
- **Purpose**: 关系状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 踢出或重新分配时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要在用户被踢出时从active转为inactive

### UserBedRelation

#### Relation Analysis
- **Purpose**: 记录用户占用床位的关系
- **Creation**: AssignUserToDormitory交互时创建
- **Deletion Requirements**: 可以删除（用户被踢出或重新分配）
- **Update Requirements**: status属性更新（active ↔ inactive）
- **State Management**: 需要状态管理来处理床位占用的激活/停用
- **Computation Decision**: Transform + StateMachine for status
- **Reasoning**: 需要创建关系（Transform）并管理状态变化（StateMachine for status），采用软删除模式保留审计记录

#### Property Analysis

##### Property: assignedAt
- **Type**: bigint
- **Purpose**: 分配时间戳
- **Data Source**: 分配时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 记录分配时间，不需要更新

##### Property: status
- **Type**: string
- **Purpose**: 关系状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 踢出或重新分配时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要在用户被踢出时从active转为inactive

### DormitoryBedRelation

#### Relation Analysis
- **Purpose**: 记录宿舍包含床位的关系
- **Creation**: CreateDormitory交互时自动创建
- **Deletion Requirements**: 床位与宿舍同生命周期，不单独删除
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: Transform only
- **Reasoning**: 仅需要在创建宿舍时自动创建关系，无删除或状态变更需求

#### Property Analysis

##### Property: createdAt
- **Type**: bigint
- **Purpose**: 关系创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 记录创建时间，不需要更新

### DormitoryHeadRelation

#### Relation Analysis
- **Purpose**: 记录宿舍长职责分配关系
- **Creation**: AppointDormHead交互时创建
- **Deletion Requirements**: 可以删除（撤销宿舍长或重新任命）
- **Update Requirements**: status属性更新（active ↔ inactive）
- **State Management**: 需要状态管理来处理宿舍长职责的激活/停用
- **Computation Decision**: Transform + StateMachine for status
- **Reasoning**: 需要创建关系（Transform）并管理状态变化（StateMachine for status），采用软删除模式保留任命历史

#### Property Analysis

##### Property: appointedAt
- **Type**: bigint
- **Purpose**: 任命时间戳
- **Data Source**: 任命时的当前时间
- **Update Frequency**: 永不更新
- **Computation Decision**: defaultValue
- **Reasoning**: 记录任命时间，不需要更新

##### Property: status
- **Type**: string
- **Purpose**: 关系状态（active/inactive）
- **Data Source**: 状态转换
- **Update Frequency**: 撤销宿舍长时
- **Computation Decision**: StateMachine
- **Reasoning**: 需要在撤销宿舍长时从active转为inactive

### UserViolationRecordRelation

#### Relation Analysis
- **Purpose**: 关联违规用户和违规记录
- **Creation**: RecordViolation交互时自动创建
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: Transform only
- **Reasoning**: 仅需要在记录违规时创建关系，不需要删除或状态变更

### RecorderViolationRecordRelation

#### Relation Analysis
- **Purpose**: 关联记录人和违规记录
- **Creation**: RecordViolation交互时自动创建
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: Transform only
- **Reasoning**: 仅需要在记录违规时创建关系，不需要删除或状态变更

### RequestorKickoutRequestRelation

#### Relation Analysis
- **Purpose**: 关联申请人和踢出申请
- **Creation**: CreateKickoutRequest交互时自动创建
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: Transform only
- **Reasoning**: 仅需要在创建申请时创建关系，不需要删除或状态变更

### TargetUserKickoutRequestRelation

#### Relation Analysis
- **Purpose**: 关联目标用户和踢出申请
- **Creation**: CreateKickoutRequest交互时自动创建
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: Transform only
- **Reasoning**: 仅需要在创建申请时创建关系，不需要删除或状态变更

### ProcessorKickoutRequestRelation

#### Relation Analysis
- **Purpose**: 关联处理人和踢出申请
- **Creation**: ProcessKickoutRequest交互时创建
- **Deletion Requirements**: 永不删除（审计需要）
- **Update Requirements**: 无需更新
- **State Management**: 无需状态管理
- **Computation Decision**: Transform only
- **Reasoning**: 仅需要在处理申请时创建关系，不需要删除或状态变更

---

## 计算属性设计

### User实体计算属性

#### Property: totalScore
- **Type**: number
- **Purpose**: 用户的累计违规扣分总和
- **Data Source**: 用户所有违规记录的scoreDeducted字段
- **Update Frequency**: 每次记录违规时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 需要对UserViolationRecordRelation方向的ViolationRecord进行scoreDeducted求和

#### Property: isEligibleForKickout
- **Type**: boolean
- **Purpose**: 判断用户是否达到踢出标准（扣分≥10）
- **Data Source**: 基于totalScore的计算
- **Update Frequency**: totalScore变化时自动更新
- **Computation Decision**: computed function
- **Reasoning**: 基于当前记录的totalScore进行简单比较计算

### Dormitory实体计算属性

#### Property: currentOccupancy
- **Type**: number
- **Purpose**: 当前入住人数
- **Data Source**: 计算active状态的UserDormitoryRelation数量
- **Update Frequency**: 用户分配/移除时自动更新
- **Computation Decision**: Count with callback
- **Reasoning**: 需要计算状态为active的用户关系数量

#### Property: availableBeds
- **Type**: number
- **Purpose**: 可用床位数量
- **Data Source**: 计算available状态的床位数量
- **Update Frequency**: 床位状态变化时自动更新
- **Computation Decision**: Count with callback
- **Reasoning**: 需要计算关联床位中状态为available的数量

#### Property: occupancyRate
- **Type**: number
- **Purpose**: 入住率（currentOccupancy / capacity）
- **Data Source**: 基于currentOccupancy和capacity的计算
- **Update Frequency**: currentOccupancy或capacity变化时
- **Computation Decision**: computed function
- **Reasoning**: 基于当前记录的字段进行简单除法计算

---

## 过滤实体设计

### ActiveUser
- **Purpose**: 仅包含状态为active的用户
- **Source**: User实体
- **Filter**: status === 'active'
- **Usage**: 用于查询和统计活跃用户

### AvailableBed
- **Purpose**: 仅包含状态为available的床位
- **Source**: Bed实体
- **Filter**: status === 'available'
- **Usage**: 用于床位分配时的查询

### PendingKickoutRequest
- **Purpose**: 仅包含状态为pending的踢出申请
- **Source**: KickoutRequest实体
- **Filter**: status === 'pending'
- **Usage**: 管理员查看待处理申请

### ActiveUserDormitoryRelation
- **Purpose**: 仅包含状态为active的用户-宿舍关系
- **Source**: UserDormitoryRelation
- **Filter**: status === 'active'
- **Usage**: 查询当前有效的宿舍分配关系

---

## StateNode声明清单

以下StateNode需要在使用前声明：

### 用户状态
```typescript
const userActiveState = StateNode.create({ name: 'active' });
const userInactiveState = StateNode.create({ name: 'inactive' });
```

### 宿舍状态
```typescript
const dormitoryActiveState = StateNode.create({ name: 'active' });
const dormitoryInactiveState = StateNode.create({ name: 'inactive' });
```

### 床位状态
```typescript
const bedAvailableState = StateNode.create({ name: 'available' });
const bedOccupiedState = StateNode.create({ name: 'occupied' });
const bedMaintenanceState = StateNode.create({ name: 'maintenance' });
```

### 踢出申请状态
```typescript
const requestPendingState = StateNode.create({ name: 'pending' });
const requestApprovedState = StateNode.create({ 
  name: 'approved',
  computeValue: () => ({ processedAt: Date.now() })
});
const requestRejectedState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => ({ processedAt: Date.now() })
});
```

### 关系状态（用于软删除）
```typescript
const relationActiveState = StateNode.create({ name: 'active' });
const relationInactiveState = StateNode.create({ name: 'inactive' });
```

---

## 实现验证清单

- [x] 所有实体已分析并记录
- [x] 所有属性已分析并记录
- [x] 实体级Transform已确定
- [x] 属性计算类型已根据分析确定
- [x] StateNode变量需要在使用前声明
- [x] 无Transform用于Property computation
- [x] 无循环依赖
- [x] 所有计算属性都提供defaultValue
- [x] 分析文档保存到 `docs/computation-analysis.md`
- [x] 关系生命周期已分析（创建、更新、删除）
- [x] 关系删除策略已明确（硬删除vs软删除）

---

## 关键决策总结

1. **实体创建**: 所有实体都通过对应的交互创建，使用Transform + InteractionEventEntity
2. **状态管理**: 使用StateMachine处理所有状态转换（用户、宿舍、床位、申请状态）
3. **计数统计**: 使用Count和Summation处理聚合计算（入住人数、扣分总和等）
4. **关系管理**: 
   - 审计类关系（违规记录、申请记录）只创建不删除
   - 分配类关系（用户-宿舍、用户-床位、宿舍长）使用软删除保留历史
5. **软删除策略**: 重要关系使用status字段进行软删除，保留审计轨迹
6. **硬删除策略**: 一般不使用，除非确定不需要历史记录

这个分析为宿舍管理系统的计算实现提供了完整的指导和理论基础。