# 宿舍管理系统计算分析

## 系统总览
基于`entity-relation-design.md`和`interaction-design.md`的设计，对每个实体、属性和关系进行系统性的计算需求分析。

---

## Entity: User

### Entity-Level Analysis
- **Purpose**: 系统中的用户实体，包括管理员、宿舍长、学生
- **Creation Source**: 通过外部系统创建（注册、导入），不需要通过Interaction创建
- **Update Requirements**: role字段需要在指定宿舍长时更新
- **Deletion Strategy**: 软删除（设置status为inactive），保留历史记录

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 用户唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: None (系统生成)
- **Reasoning**: 主键字段，由系统自动生成，无需计算

#### Property: name
- **Type**: string  
- **Purpose**: 用户显示名称
- **Data Source**: 用户输入或外部系统导入
- **Update Frequency**: 偶尔更新 (通过用户资料修改)
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，不需要计算

#### Property: email
- **Type**: string
- **Purpose**: 用户邮箱，登录凭证
- **Data Source**: 用户注册或导入
- **Update Frequency**: 很少更新
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，不需要计算

#### Property: role
- **Type**: string
- **Purpose**: 用户角色(admin/dormHead/student)
- **Data Source**: 默认为student，通过AssignDormHead交互可更新为dormHead
- **Update Frequency**: 指定宿舍长时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 角色需要在指定宿舍长时从student转换为dormHead
- **Dependencies**: AssignDormHead交互
- **Calculation Method**: 默认为student状态，AssignDormHead触发时转换为dormHead状态

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 用户创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: defaultValue function
- **Reasoning**: 创建时间戳，使用defaultValue生成
- **Dependencies**: None
- **Calculation Method**: `defaultValue: () => Date.now()`

#### Property: totalScore (Computed)
- **Type**: number
- **Purpose**: 用户累计扣分总数
- **Data Source**: 通过用户的所有扣分记录计算
- **Update Frequency**: 每次扣分时自动重新计算
- **Computation Decision**: Summation
- **Reasoning**: 需要累加用户所有扣分记录的points字段
- **Dependencies**: UserScoreRelation关系，ScoreRecord.points属性
- **Calculation Method**: 对用户关联的所有ScoreRecord的points字段求和

#### Property: canBeKickedOut (Computed)
- **Type**: boolean
- **Purpose**: 是否达到踢出门槛
- **Data Source**: 基于totalScore >= 100的判断
- **Update Frequency**: totalScore变化时自动更新
- **Computation Decision**: computed function
- **Reasoning**: 简单的基于当前记录的计算，不需要外部依赖
- **Dependencies**: totalScore属性
- **Calculation Method**: `computed: (user) => (user.totalScore || 0) >= 100`

### Entity Computation Decision
- **Type**: None
- **Source**: N/A
- **Reasoning**: User实体通过外部系统（注册、导入）创建，不需要通过交互创建，因此不需要实体级别的Transform计算

---

## Entity: Dormitory

### Entity-Level Analysis
- **Purpose**: 宿舍建筑或房间实体
- **Creation Source**: 通过CreateDormitory交互创建
- **Update Requirements**: occupiedBeds需要根据床位占用情况自动计算更新
- **Deletion Strategy**: 软删除（可考虑添加status字段），但当前需求中没有删除宿舍的场景

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 宿舍唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统生成)
- **Reasoning**: 主键字段，由系统自动生成

#### Property: name
- **Type**: string
- **Purpose**: 宿舍名称
- **Data Source**: CreateDormitory交互的payload
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，从交互payload直接获取

#### Property: capacity
- **Type**: number
- **Purpose**: 宿舍床位总数
- **Data Source**: CreateDormitory交互的payload
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，从交互payload直接获取，业务规则验证在交互层处理

#### Property: occupiedBeds
- **Type**: number
- **Purpose**: 当前已占用床位数
- **Data Source**: 计算status为occupied的床位数量
- **Update Frequency**: 床位分配或释放时自动更新
- **Computation Decision**: Count
- **Reasoning**: 需要统计宿舍下所有status为occupied的床位数量
- **Dependencies**: DormitoryBedRelation关系，Bed.status属性
- **Calculation Method**: 统计关联床位中status='occupied'的数量

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 宿舍创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: Never
- **Computation Decision**: defaultValue function
- **Reasoning**: 创建时间戳，使用defaultValue生成
- **Dependencies**: None
- **Calculation Method**: `defaultValue: () => Date.now()`

#### Property: availableBeds (Computed)
- **Type**: number
- **Purpose**: 可用床位数
- **Data Source**: capacity - occupiedBeds
- **Update Frequency**: occupiedBeds变化时自动更新
- **Computation Decision**: computed function
- **Reasoning**: 简单的基于当前记录的计算
- **Dependencies**: capacity和occupiedBeds属性
- **Calculation Method**: `computed: (dormitory) => (dormitory.capacity || 0) - (dormitory.occupiedBeds || 0)`

#### Property: isFullyOccupied (Computed)
- **Type**: boolean
- **Purpose**: 是否满员
- **Data Source**: occupiedBeds >= capacity
- **Update Frequency**: occupiedBeds变化时自动更新
- **Computation Decision**: computed function
- **Reasoning**: 简单的基于当前记录的计算
- **Dependencies**: capacity和occupiedBeds属性
- **Calculation Method**: `computed: (dormitory) => (dormitory.occupiedBeds || 0) >= (dormitory.capacity || 0)`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: Dormitory实体通过CreateDormitory交互创建，需要Transform监听交互事件并创建实体
- **Dependencies**: CreateDormitory交互，触发事件的用户和payload数据
- **Calculation Method**: 监听CreateDormitory交互，从payload提取name和capacity，创建新的Dormitory实体

---

## Entity: Bed

### Entity-Level Analysis
- **Purpose**: 宿舍内的具体床位实体
- **Creation Source**: 创建宿舍时自动创建对应数量的床位
- **Update Requirements**: status需要在床位分配/释放时更新
- **Deletion Strategy**: 硬删除（随宿舍删除），但当前需求中没有删除场景

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 床位唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统生成)
- **Reasoning**: 主键字段，由系统自动生成

#### Property: number
- **Type**: number
- **Purpose**: 床位在宿舍内的编号
- **Data Source**: 创建床位时按顺序分配(1, 2, 3...)
- **Update Frequency**: Never
- **Computation Decision**: None (创建时设置)
- **Reasoning**: 静态属性，创建时根据位置设置

#### Property: status
- **Type**: string
- **Purpose**: 床位状态(available/occupied)
- **Data Source**: 默认为available，通过AssignUserToBed分配时更新为occupied
- **Update Frequency**: 床位分配和释放时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 床位状态需要在分配和释放操作时进行状态转换
- **Dependencies**: AssignUserToBed交互，ProcessKickoutRequest交互(approved情况)
- **Calculation Method**: 默认available状态，AssignUserToBed触发转换为occupied，用户被踢出时转换回available

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 床位创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: Never
- **Computation Decision**: defaultValue function
- **Reasoning**: 创建时间戳，使用defaultValue生成
- **Dependencies**: None
- **Calculation Method**: `defaultValue: () => Date.now()`

#### Property: isOccupied (Computed)
- **Type**: boolean
- **Purpose**: 床位是否被占用
- **Data Source**: status === 'occupied'
- **Update Frequency**: status变化时自动更新
- **Computation Decision**: computed function
- **Reasoning**: 简单的基于当前记录的计算
- **Dependencies**: status属性
- **Calculation Method**: `computed: (bed) => bed.status === 'occupied'`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: Bed实体在CreateDormitory交互时创建，需要Transform监听交互并创建对应数量的床位
- **Dependencies**: CreateDormitory交互，宿舍的capacity值
- **Calculation Method**: 监听CreateDormitory交互，根据payload.capacity创建对应数量的床位(编号1到capacity)

---

## Entity: ScoreRecord

### Entity-Level Analysis
- **Purpose**: 用户违规行为的扣分记录实体
- **Creation Source**: 通过RecordScore交互创建
- **Update Requirements**: 创建后不需要更新（只读记录）
- **Deletion Strategy**: 不删除（永久记录）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 扣分记录唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统生成)
- **Reasoning**: 主键字段，由系统自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 扣分原因描述
- **Data Source**: RecordScore交互的payload
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，从交互payload直接获取

#### Property: points
- **Type**: number
- **Purpose**: 扣分数值
- **Data Source**: RecordScore交互的payload
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，从交互payload直接获取，业务规则验证在交互层处理

#### Property: createdAt
- **Type**: bigint
- **Purpose**: 扣分记录创建时间戳
- **Data Source**: 创建时的当前时间
- **Update Frequency**: Never
- **Computation Decision**: defaultValue function
- **Reasoning**: 创建时间戳，使用defaultValue生成
- **Dependencies**: None
- **Calculation Method**: `defaultValue: () => Date.now()`

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: ScoreRecord实体通过RecordScore交互创建，需要Transform监听交互事件并创建记录
- **Dependencies**: RecordScore交互，触发事件的用户和payload数据
- **Calculation Method**: 监听RecordScore交互，从payload提取reason和points，创建新的ScoreRecord实体

---

## Entity: KickoutRequest

### Entity-Level Analysis
- **Purpose**: 宿舍长申请踢出学生的请求记录实体
- **Creation Source**: 通过RequestKickout交互创建
- **Update Requirements**: status、processedAt、processNote需要在处理申请时更新
- **Deletion Strategy**: 不删除（永久记录）

### Property Analysis

#### Property: id
- **Type**: string
- **Purpose**: 申请唯一标识
- **Data Source**: 系统自动生成
- **Update Frequency**: Never
- **Computation Decision**: None (系统生成)
- **Reasoning**: 主键字段，由系统自动生成

#### Property: reason
- **Type**: string
- **Purpose**: 申请踢出的原因
- **Data Source**: RequestKickout交互的payload
- **Update Frequency**: Never (创建后不变)
- **Computation Decision**: None (直接存储)
- **Reasoning**: 静态属性，从交互payload直接获取

#### Property: status
- **Type**: string
- **Purpose**: 申请状态(pending/approved/rejected)
- **Data Source**: 创建时默认为pending，通过ProcessKickoutRequest更新
- **Update Frequency**: 处理申请时更新
- **Computation Decision**: StateMachine
- **Reasoning**: 申请状态需要在处理时从pending转换为approved或rejected
- **Dependencies**: ProcessKickoutRequest交互
- **Calculation Method**: 默认pending状态，ProcessKickoutRequest触发时根据decision转换为approved或rejected状态

#### Property: requestedAt
- **Type**: bigint
- **Purpose**: 申请提交时间
- **Data Source**: 创建时的当前时间
- **Update Frequency**: Never
- **Computation Decision**: defaultValue function
- **Reasoning**: 创建时间戳，使用defaultValue生成
- **Dependencies**: None
- **Calculation Method**: `defaultValue: () => Date.now()`

#### Property: processedAt
- **Type**: bigint | null
- **Purpose**: 申请处理时间
- **Data Source**: 处理申请时的当前时间
- **Update Frequency**: 处理申请时更新一次
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在ProcessKickoutRequest交互触发时设置处理时间
- **Dependencies**: ProcessKickoutRequest交互
- **Calculation Method**: 默认为null，ProcessKickoutRequest触发时computeValue返回当前时间

#### Property: processNote
- **Type**: string | null
- **Purpose**: 处理备注
- **Data Source**: ProcessKickoutRequest交互的payload
- **Update Frequency**: 处理申请时更新一次
- **Computation Decision**: StateMachine with computeValue
- **Reasoning**: 需要在ProcessKickoutRequest交互触发时从payload获取备注
- **Dependencies**: ProcessKickoutRequest交互
- **Calculation Method**: 默认为null，ProcessKickoutRequest触发时从event.payload.processNote获取值

### Entity Computation Decision
- **Type**: Transform
- **Source**: InteractionEventEntity
- **Reasoning**: KickoutRequest实体通过RequestKickout交互创建，需要Transform监听交互事件并创建申请记录
- **Dependencies**: RequestKickout交互，触发事件的用户和payload数据
- **Calculation Method**: 监听RequestKickout交互，从payload提取reason，创建新的KickoutRequest实体

---

## Relation: UserDormitoryRelation

### Relation Analysis
- **Purpose**: 表示用户被分配到宿舍的关系
- **Creation**: 通过AssignUserToBed交互创建，分配用户到床位时同时建立宿舍关系
- **Deletion Requirements**: 用户被踢出宿舍时需要删除关系（硬删除，不需要历史）
- **Update Requirements**: assignedAt创建后不变，status可能需要更新（但当前需求简化，直接删除）
- **State Management**: 简化处理，直接删除关系而不使用status字段
- **Computation Decision**: StateMachine only (hard delete)
- **Reasoning**: 关系需要创建和删除能力，Transform只能创建无法删除，因此使用StateMachine处理完整生命周期
- **Dependencies**: AssignUserToBed交互（创建），ProcessKickoutRequest交互（删除，当decision=approved时）
- **Calculation Method**: AssignUserToBed时创建exists状态的关系，ProcessKickoutRequest(approved)时转换到deleted状态实现硬删除

---

## Relation: UserBedRelation

### Relation Analysis
- **Purpose**: 表示用户占用具体床位的关系
- **Creation**: 通过AssignUserToBed交互创建
- **Deletion Requirements**: 用户被踢出时需要删除关系，释放床位
- **Update Requirements**: assignedAt创建后不变
- **State Management**: 直接删除关系，不需要status字段
- **Computation Decision**: StateMachine only (hard delete)
- **Reasoning**: 关系需要创建和删除能力，Transform只能创建无法删除
- **Dependencies**: AssignUserToBed交互（创建），ProcessKickoutRequest交互（删除）
- **Calculation Method**: 与UserDormitoryRelation相同，使用exists/deleted状态模式

---

## Relation: DormitoryBedRelation

### Relation Analysis
- **Purpose**: 表示宿舍包含床位的从属关系
- **Creation**: 创建宿舍时自动创建，与床位实体同时建立
- **Deletion Requirements**: Never（床位与宿舍永久绑定）
- **Update Requirements**: 关系属性不需要更新
- **State Management**: 不需要状态管理
- **Computation Decision**: None (created with entities)
- **Reasoning**: 关系在创建宿舍和床位实体时自动建立，不需要单独的计算逻辑
- **Dependencies**: Dormitory和Bed实体的创建
- **Calculation Method**: 实体创建时自动建立关系

---

## Relation: DormitoryHeadRelation

### Relation Analysis
- **Purpose**: 表示用户被指定为宿舍长的管理关系
- **Creation**: 通过AssignDormHead交互创建
- **Deletion Requirements**: 可能需要更换宿舍长（删除旧关系，创建新关系）
- **Update Requirements**: appointedAt和appointedBy创建后不变
- **State Management**: 当前需求中没有更换宿舍长的场景，暂不考虑删除
- **Computation Decision**: Transform
- **Reasoning**: 当前需求中只有创建场景，没有删除需求，使用Transform足够
- **Dependencies**: AssignDormHead交互
- **Calculation Method**: 监听AssignDormHead交互，创建用户与宿舍的管理关系

---

## Relation: UserScoreRelation

### Relation Analysis
- **Purpose**: 连接用户和其扣分记录的关系
- **Creation**: 记录扣分时自动创建，与ScoreRecord实体同时建立
- **Deletion Requirements**: Never（扣分记录永久保存）
- **Update Requirements**: recordedBy创建后不变
- **State Management**: 不需要状态管理
- **Computation Decision**: None (created with ScoreRecord)
- **Reasoning**: 关系在创建ScoreRecord实体时自动建立，不需要单独计算
- **Dependencies**: ScoreRecord实体的创建
- **Calculation Method**: ScoreRecord创建时自动建立与targetUser的关系

---

## Relation: RequestTargetRelation

### Relation Analysis
- **Purpose**: 连接踢出申请和目标用户的关系
- **Creation**: 申请踢出时自动创建，与KickoutRequest实体同时建立
- **Deletion Requirements**: Never（申请记录永久保存）
- **Update Requirements**: 无
- **State Management**: 不需要状态管理
- **Computation Decision**: None (created with KickoutRequest)
- **Reasoning**: 关系在创建KickoutRequest实体时自动建立
- **Dependencies**: KickoutRequest实体的创建
- **Calculation Method**: KickoutRequest创建时自动建立与targetUser的关系

---

## Relation: RequestRequesterRelation

### Relation Analysis
- **Purpose**: 连接踢出申请和申请人的关系
- **Creation**: 申请踢出时自动创建
- **Deletion Requirements**: Never
- **Update Requirements**: 无
- **State Management**: 不需要状态管理
- **Computation Decision**: None (created with KickoutRequest)
- **Reasoning**: 关系在创建KickoutRequest实体时自动建立
- **Dependencies**: KickoutRequest实体的创建
- **Calculation Method**: KickoutRequest创建时通过event.user自动建立与申请人的关系

---

## Relation: RequestProcessorRelation

### Relation Analysis
- **Purpose**: 连接踢出申请和处理人的关系
- **Creation**: 处理申请时创建（不是申请创建时）
- **Deletion Requirements**: Never
- **Update Requirements**: 无
- **State Management**: 不需要状态管理
- **Computation Decision**: Transform
- **Reasoning**: 关系在ProcessKickoutRequest交互触发时创建，连接现有的申请和处理人
- **Dependencies**: ProcessKickoutRequest交互
- **Calculation Method**: 监听ProcessKickoutRequest交互，创建申请与处理人的关系

---

## 全局字典分析

当前系统不需要全局字典，所有数据都通过实体和关系管理。

---

## 实现优先级

### 阶段1：核心实体和基础计算
1. User实体（role的StateMachine，totalScore的Summation）
2. Dormitory实体（Transform创建，occupiedBeds的Count）
3. Bed实体（Transform创建，status的StateMachine）
4. ScoreRecord实体（Transform创建）
5. KickoutRequest实体（Transform创建，status等的StateMachine）

### 阶段2：关系计算
1. UserDormitoryRelation（StateMachine生命周期）
2. UserBedRelation（StateMachine生命周期）
3. RequestProcessorRelation（Transform创建）
4. 其他关系（实体创建时自动建立）

### 阶段3：derived属性
1. Dormitory的availableBeds和isFullyOccupied
2. Bed的isOccupied
3. User的canBeKickedOut

## 验证要点
- [ ] 所有Transform使用InteractionEventEntity作为record
- [ ] 所有StateMachine先声明StateNode再使用
- [ ] Count/Summation使用正确的direction和attributeQuery
- [ ] computed函数只依赖当前记录的属性
- [ ] 需要删除的关系使用StateMachine而非Transform
- [ ] 所有计算都有明确的触发条件和依赖关系