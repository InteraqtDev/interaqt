# 宿舍管理系统计算分析

基于实体关系设计和交互设计，对所有实体、属性、关系进行系统化的计算类型分析。

---

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的所有用户（管理员、宿舍长、学生）
- **Creation Source**: 用户创建不在当前系统范围内（外部系统处理）
- **Update Requirements**: 角色变更（student↔dormHead）、状态变更（active↔kicked）
- **Deletion Strategy**: 软删除使用status字段（active/kicked）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 用户唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: 框架自动生成的ID字段

#### Property: name
- **Type**: string
- **Purpose**: 用户姓名
- **Data Source**: 外部创建或更新
- **Update Frequency**: 通过UpdateUserProfile交互（低优先级）
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接设置和更新

#### Property: email
- **Type**: string
- **Purpose**: 邮箱地址，唯一标识
- **Data Source**: 外部创建
- **Update Frequency**: Never（业务规则：邮箱不可变更）
- **Computation Decision**: None
- **Reasoning**: 创建后不可变更的标识字段

#### Property: role
- **Type**: string
- **Purpose**: 用户角色（admin/dormHead/student）
- **Data Source**: 角色转换交互
- **Update Frequency**: AssignDormHead、RemoveDormHead交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（student ↔ dormHead），角色变更有业务逻辑
- **Dependencies**: AssignDormHead交互、RemoveDormHead交互、当前role值
- **Calculation Method**: student→dormHead (AssignDormHead), dormHead→student (RemoveDormHead), admin角色保持不变

#### Property: status
- **Type**: string
- **Purpose**: 用户状态（active/kicked）
- **Data Source**: 踢出申请处理结果
- **Update Frequency**: ApproveKickoutRequest交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→kicked），状态变更触发相关业务逻辑
- **Dependencies**: ApproveKickoutRequest交互、当前status值
- **Calculation Method**: active→kicked (ApproveKickoutRequest批准时)

#### Property: totalScore
- **Type**: number
- **Purpose**: 用户总扣分数
- **Data Source**: 所有有效扣分记录的总和
- **Update Frequency**: 扣分记录创建或取消时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 需要对相关扣分记录求和，但只计算status='active'的记录
- **Dependencies**: UserDeductionRecordRelation (direction: source), DeductionRecord实体 (points属性, status属性)
- **Calculation Method**: Sum of DeductionRecord.points for all related records where DeductionRecord.status = 'active'

#### Property: createdAt
- **Type**: number
- **Purpose**: 用户创建时间戳
- **Data Source**: 创建时系统时间
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置的时间戳，不需要计算

### Entity Computation Decision
- **Type**: None
- **Source**: N/A
- **Reasoning**: 用户创建由外部系统处理，当前系统只处理角色和状态变更
- **Dependencies**: N/A
- **Calculation Method**: N/A

---

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍建筑的基本信息
- **Creation Source**: CreateDormitory交互
- **Update Requirements**: 名称和容量更新
- **Deletion Strategy**: 硬删除（当宿舍为空时）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 宿舍唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: 框架自动生成的ID字段

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称
- **Data Source**: CreateDormitory或UpdateDormitory交互
- **Update Frequency**: UpdateDormitory交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接设置和更新

#### Property: capacity
- **Type**: number
- **Purpose**: 宿舍床位总数
- **Data Source**: CreateDormitory或UpdateDormitory交互
- **Update Frequency**: UpdateDormitory交互（有限制）
- **Computation Decision**: None
- **Reasoning**: 简单数值字段，通过交互设置

#### Property: currentOccupancy
- **Type**: number
- **Purpose**: 当前入住人数
- **Data Source**: 活跃的用户-宿舍关系计数
- **Update Frequency**: 用户分配或移除时自动更新
- **Computation Decision**: Count
- **Reasoning**: 需要计算与此宿舍相关的活跃用户数量
- **Dependencies**: UserDormitoryRelation (direction: target), relation status属性
- **Calculation Method**: Count UserDormitoryRelation records where target=this dormitory and status='active'

#### Property: availableBeds
- **Type**: number
- **Purpose**: 可用床位数
- **Data Source**: capacity - currentOccupancy
- **Update Frequency**: 当capacity或currentOccupancy变化时
- **Computation Decision**: computed (计算属性)
- **Reasoning**: 基于当前记录的简单计算，不依赖外部数据
- **Dependencies**: 同一记录的capacity和currentOccupancy属性
- **Calculation Method**: this.capacity - this.currentOccupancy

#### Property: createdAt
- **Type**: number
- **Purpose**: 宿舍创建时间戳
- **Data Source**: CreateDormitory交互时的系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (defaultValue函数)
- **Reasoning**: 创建时设置的时间戳，使用defaultValue即可

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 宿舍通过CreateDormitory交互创建
- **Dependencies**: CreateDormitory交互事件、payload数据
- **Calculation Method**: 当CreateDormitory交互触发时，创建新的Dormitory实体并从payload获取name和capacity

---

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内的具体床位
- **Creation Source**: 宿舍创建时自动生成对应数量的床位
- **Update Requirements**: 基本不需要更新
- **Deletion Strategy**: 随宿舍删除而删除

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 床位唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: 框架自动生成的ID字段

#### Property: number
- **Type**: number
- **Purpose**: 床位号（1-6）
- **Data Source**: 床位创建时分配
- **Update Frequency**: Never
- **Computation Decision**: None
- **Reasoning**: 创建时设置的固定值

#### Property: isOccupied
- **Type**: boolean
- **Purpose**: 床位是否被占用
- **Data Source**: 是否存在活跃的用户-床位关系
- **Update Frequency**: 用户分配或释放床位时自动更新
- **Computation Decision**: Any
- **Reasoning**: 检查是否存在任何活跃的用户关系
- **Dependencies**: UserBedRelation (direction: target), relation status属性
- **Calculation Method**: Check if any UserBedRelation exists where target=this bed and status='active'

#### Property: createdAt
- **Type**: number
- **Purpose**: 床位创建时间戳
- **Data Source**: 床位创建时系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (defaultValue函数)
- **Reasoning**: 创建时设置的时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 床位在CreateDormitory交互时自动创建多个
- **Dependencies**: CreateDormitory交互事件、宿舍容量信息
- **Calculation Method**: 当CreateDormitory交互触发时，根据capacity数量创建对应的Bed实体（number从1到capacity）

---

## Entity: DeductionRule

### Entity-Level Analysis
- **Purpose**: 扣分规则的定义和管理
- **Creation Source**: CreateDeductionRule交互
- **Update Requirements**: 规则名称、描述、分数和启用状态
- **Deletion Strategy**: 软删除使用isActive字段（保留历史规则）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 规则唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: 框架自动生成的ID字段

#### Property: name
- **Type**: string
- **Purpose**: 规则名称
- **Data Source**: CreateDeductionRule或UpdateDeductionRule交互
- **Update Frequency**: UpdateDeductionRule交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接设置和更新

#### Property: description
- **Type**: string
- **Purpose**: 规则详细描述
- **Data Source**: CreateDeductionRule或UpdateDeductionRule交互
- **Update Frequency**: UpdateDeductionRule交互
- **Computation Decision**: None
- **Reasoning**: 简单字段，直接设置和更新

#### Property: points
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: CreateDeductionRule或UpdateDeductionRule交互
- **Update Frequency**: UpdateDeductionRule交互
- **Computation Decision**: None
- **Reasoning**: 简单数值字段，通过交互设置

#### Property: isActive
- **Type**: boolean
- **Purpose**: 规则是否启用
- **Data Source**: 规则状态管理
- **Update Frequency**: DisableDeductionRule交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→inactive），状态变更影响规则使用
- **Dependencies**: DisableDeductionRule交互、当前isActive值
- **Calculation Method**: true→false (DisableDeductionRule触发时)

#### Property: usageCount
- **Type**: number
- **Purpose**: 基于此规则的扣分记录总数
- **Data Source**: 相关扣分记录计数
- **Update Frequency**: 扣分记录创建时自动更新
- **Computation Decision**: Count
- **Reasoning**: 需要计算使用此规则的扣分记录数量
- **Dependencies**: DeductionRuleRecordRelation (direction: source)
- **Calculation Method**: Count DeductionRuleRecordRelation records where source=this rule

#### Property: totalPointsDeducted
- **Type**: number
- **Purpose**: 基于此规则的总扣分数
- **Data Source**: 相关有效扣分记录的分数总和
- **Update Frequency**: 扣分记录创建或取消时自动更新
- **Computation Decision**: Summation
- **Reasoning**: 需要对基于此规则的有效扣分求和
- **Dependencies**: DeductionRuleRecordRelation (direction: source), DeductionRecord实体 (points属性, status属性)
- **Calculation Method**: Sum of DeductionRecord.points for related records where DeductionRecord.status='active'

#### Property: createdAt
- **Type**: number
- **Purpose**: 规则创建时间戳
- **Data Source**: CreateDeductionRule交互时系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (defaultValue函数)
- **Reasoning**: 创建时设置的时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分规则通过CreateDeductionRule交互创建
- **Dependencies**: CreateDeductionRule交互事件、payload数据
- **Calculation Method**: 当CreateDeductionRule交互触发时，创建新的DeductionRule实体并从payload获取规则信息

---

## Entity: DeductionRecord

### Entity-Level Analysis
- **Purpose**: 具体的扣分记录
- **Creation Source**: RecordDeduction交互
- **Update Requirements**: 状态变更（active↔cancelled）
- **Deletion Strategy**: 软删除使用status字段（保留扣分历史）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 记录唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: 框架自动生成的ID字段

#### Property: reason
- **Type**: string
- **Purpose**: 具体扣分原因
- **Data Source**: RecordDeduction交互payload
- **Update Frequency**: Never（扣分原因不可修改）
- **Computation Decision**: None
- **Reasoning**: 创建时设置的不可变字段

#### Property: points
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: 从关联的扣分规则继承
- **Update Frequency**: Never（从规则继承后不变）
- **Computation Decision**: Transform中设置
- **Reasoning**: 创建时从DeductionRule获取points值

#### Property: status
- **Type**: string
- **Purpose**: 记录状态（active/cancelled）
- **Data Source**: 扣分记录状态管理
- **Update Frequency**: CancelDeduction交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（active→cancelled），状态变更影响总扣分计算
- **Dependencies**: CancelDeduction交互、当前status值
- **Calculation Method**: active→cancelled (CancelDeduction触发时)

#### Property: createdAt
- **Type**: number
- **Purpose**: 记录创建时间戳
- **Data Source**: RecordDeduction交互时系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (defaultValue函数)
- **Reasoning**: 创建时设置的时间戳

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 扣分记录通过RecordDeduction交互创建
- **Dependencies**: RecordDeduction交互事件、payload数据、相关的DeductionRule实体
- **Calculation Method**: 当RecordDeduction交互触发时，创建新的DeductionRecord实体，从payload获取reason，从相关规则获取points

---

## Entity: KickoutRequest

### Entity-Level Analysis
- **Purpose**: 踢出学生的申请记录
- **Creation Source**: CreateKickoutRequest交互
- **Update Requirements**: 状态变更和处理时间更新
- **Deletion Strategy**: 不删除（保留完整申请历史）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 申请唯一标识符
- **Data Source**: 系统生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统处理)
- **Reasoning**: 框架自动生成的ID字段

#### Property: reason
- **Type**: string
- **Purpose**: 申请理由
- **Data Source**: CreateKickoutRequest交互payload
- **Update Frequency**: Never（申请理由不可修改）
- **Computation Decision**: None
- **Reasoning**: 创建时设置的不可变字段

#### Property: status
- **Type**: string
- **Purpose**: 申请状态（pending/approved/rejected）
- **Data Source**: 申请处理结果
- **Update Frequency**: ApproveKickoutRequest、RejectKickoutRequest交互
- **Computation Decision**: StateMachine
- **Reasoning**: 有明确的状态转换（pending→approved/rejected），状态变更触发不同业务逻辑
- **Dependencies**: ApproveKickoutRequest交互、RejectKickoutRequest交互、当前status值
- **Calculation Method**: pending→approved (ApproveKickoutRequest), pending→rejected (RejectKickoutRequest)

#### Property: createdAt
- **Type**: number
- **Purpose**: 申请创建时间戳
- **Data Source**: CreateKickoutRequest交互时系统时间
- **Update Frequency**: Never
- **Computation Decision**: None (defaultValue函数)
- **Reasoning**: 创建时设置的时间戳

#### Property: processedAt
- **Type**: number
- **Purpose**: 申请处理时间戳
- **Data Source**: 申请处理时系统时间
- **Update Frequency**: ApproveKickoutRequest、RejectKickoutRequest交互
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 状态变更时需要记录处理时间
- **Dependencies**: ApproveKickoutRequest交互、RejectKickoutRequest交互
- **Calculation Method**: 设置为Date.now()当任何处理状态转换发生时

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: 踢出申请通过CreateKickoutRequest交互创建
- **Dependencies**: CreateKickoutRequest交互事件、payload数据
- **Calculation Method**: 当CreateKickoutRequest交互触发时，创建新的KickoutRequest实体并从payload获取reason

---

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 用户分配到宿舍的关系
- **Creation**: AssignUserToDormitory交互创建
- **Deletion Requirements**: 软删除当用户被踢出或重新分配时
- **Update Requirements**: 状态变更（active↔inactive）
- **State Management**: 使用status字段管理状态（保留分配历史）
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建关系并支持软删除以保留审计跟踪
- **Dependencies**: AssignUserToDormitory交互（创建）, ApproveKickoutRequest交互（状态变更）, RemoveUserFromDormitory交互（状态变更）
- **Calculation Method**: 通过AssignUserToDormitory创建，通过踢出或移除操作将status设为inactive

---

## Relation: UserBedRelation

### Relation Analysis
- **Purpose**: 用户分配到具体床位的关系
- **Creation**: AssignUserToDormitory交互同时创建
- **Deletion Requirements**: 软删除当用户被踢出或重新分配时
- **Update Requirements**: 状态变更（active↔inactive）
- **State Management**: 使用status字段管理状态（保留床位历史）
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建关系并支持软删除以保留床位使用历史
- **Dependencies**: AssignUserToDormitory交互（创建）, ApproveKickoutRequest交互（状态变更）, RemoveUserFromDormitory交互（状态变更）
- **Calculation Method**: 通过AssignUserToDormitory创建，通过踢出或移除操作将status设为inactive

---

## Relation: DormitoryBedRelation

### Relation Analysis
- **Purpose**: 床位归属于特定宿舍
- **Creation**: 宿舍和床位创建时自动建立
- **Deletion Requirements**: 随宿舍删除而删除
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 关系在实体创建时自动建立，无需额外计算
- **Dependencies**: N/A（实体引用自动创建）
- **Calculation Method**: N/A（实体引用自动创建）

---

## Relation: DormitoryHeadRelation

### Relation Analysis
- **Purpose**: 宿舍长与宿舍的管理关系
- **Creation**: AssignDormHead交互创建
- **Deletion Requirements**: 软删除当宿舍长被撤职时
- **Update Requirements**: 状态变更和任命时间记录
- **State Management**: 使用status字段管理状态（保留任职历史）
- **Computation Decision**: Transform + status StateMachine
- **Reasoning**: 需要创建关系并支持软删除以保留任职历史
- **Dependencies**: AssignDormHead交互（创建）, RemoveDormHead交互（状态变更）
- **Calculation Method**: 通过AssignDormHead创建，通过RemoveDormHead将status设为inactive

---

## Relation: UserDeductionRecordRelation

### Relation Analysis
- **Purpose**: 扣分记录归属于特定用户
- **Creation**: RecordDeduction交互时自动创建
- **Deletion Requirements**: 不删除（保留完整扣分历史）
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 关系在扣分记录创建时自动建立
- **Dependencies**: N/A（实体引用自动创建）
- **Calculation Method**: N/A（实体引用自动创建）

---

## Relation: DeductionRuleRecordRelation

### Relation Analysis
- **Purpose**: 扣分记录基于特定规则
- **Creation**: RecordDeduction交互时自动创建
- **Deletion Requirements**: 不删除（保留规则应用历史）
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 关系在扣分记录创建时自动建立
- **Dependencies**: N/A（实体引用自动创建）
- **Calculation Method**: N/A（实体引用自动创建）

---

## Relation: RecorderDeductionRelation

### Relation Analysis
- **Purpose**: 记录谁进行了扣分操作
- **Creation**: RecordDeduction交互时自动创建
- **Deletion Requirements**: 不删除（保留操作历史）
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 关系在扣分记录创建时自动建立
- **Dependencies**: N/A（实体引用自动创建）
- **Calculation Method**: N/A（实体引用自动创建）

---

## Relation: ApplicantKickoutRelation

### Relation Analysis
- **Purpose**: 踢出申请的申请人
- **Creation**: CreateKickoutRequest交互时自动创建
- **Deletion Requirements**: 不删除（保留申请历史）
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 关系在踢出申请创建时自动建立
- **Dependencies**: N/A（实体引用自动创建）
- **Calculation Method**: N/A（实体引用自动创建）

---

## Relation: TargetKickoutRelation

### Relation Analysis
- **Purpose**: 踢出申请的目标用户
- **Creation**: CreateKickoutRequest交互时自动创建
- **Deletion Requirements**: 不删除（保留申请历史）
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: None
- **Reasoning**: 关系在踢出申请创建时自动建立
- **Dependencies**: N/A（实体引用自动创建）
- **Calculation Method**: N/A（实体引用自动创建）

---

## Relation: ProcessorKickoutRelation

### Relation Analysis
- **Purpose**: 踢出申请的处理人
- **Creation**: ApproveKickoutRequest或RejectKickoutRequest交互时创建
- **Deletion Requirements**: 不删除（保留处理历史）
- **Update Requirements**: 无
- **State Management**: 无需状态管理
- **Computation Decision**: Transform
- **Reasoning**: 关系在申请处理时创建，建立处理人与申请的关联
- **Dependencies**: ApproveKickoutRequest交互、RejectKickoutRequest交互、申请实体
- **Calculation Method**: 当申请处理交互触发时，创建处理人与申请的关系

---

## 实现注意事项

### StateNode声明优先级
在实现StateMachine计算之前，必须先声明所需的StateNode：

```typescript
// 1. 首先声明所有StateNode
const activeUserState = StateNode.create({ name: 'active' });
const kickedUserState = StateNode.create({ name: 'kicked' });

const studentRoleState = StateNode.create({ name: 'student' });
const dormHeadRoleState = StateNode.create({ name: 'dormHead' });

const activeDeductionState = StateNode.create({ name: 'active' });
const cancelledDeductionState = StateNode.create({ name: 'cancelled' });

const pendingRequestState = StateNode.create({ name: 'pending' });
const approvedRequestState = StateNode.create({ name: 'approved' });
const rejectedRequestState = StateNode.create({ name: 'rejected' });

// 2. 然后在实体和属性中使用这些StateNode
```

### 计算类型使用规则
- **Transform**: 仅用于Entity和Relation的computation
- **StateMachine**: 仅用于Property的computation
- **Count/Summation/Any**: 仅用于Property的computation
- **computed**: 仅用于Property定义时的简单计算

### 依赖关系管理
- 确保所有计算的依赖实体和关系都已定义
- 避免循环依赖
- 按依赖顺序排列实体和关系定义

### 软删除vs硬删除选择
- **硬删除**: 用于不需要历史记录的场景（如Bed实体）
- **软删除**: 用于需要审计跟踪的场景（如用户分配关系）

这个分析为后续的代码实现提供了详细的指导，确保每个计算都有明确的业务逻辑和实现方案。