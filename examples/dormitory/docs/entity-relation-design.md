# 宿舍管理系统实体和关系设计

## 总体设计原则
根据interaqt框架的最佳实践：
- 实体属性只包含原始值和实体自身数据
- 实体间连接通过Relations定义
- 不在实体属性中包含引用ID字段
- Relations自动创建访问相关实体的属性名

## 实体设计

### User (用户)
**业务含义**: 系统中的所有用户，包括管理员、宿舍长、学生

**属性设计**:
- `id`: string (系统生成的唯一标识)
- `name`: string (用户显示名称)
- `email`: string (用户邮箱，登录凭证)
- `role`: string (用户角色: admin/dormHead/student)
- `createdAt`: bigint (创建时间戳)

**设计说明**:
- role字段用于权限控制
- email作为用户唯一标识符
- 不包含dormitoryId等引用字段，通过Relations访问宿舍信息

### Dormitory (宿舍)
**业务含义**: 宿舍建筑或房间单位

**属性设计**:
- `id`: string (宿舍唯一标识)
- `name`: string (宿舍名称，如"宿舍A"、"1号楼101")
- `capacity`: number (床位总数，4-6床位)
- `occupiedBeds`: number (当前已占用床位数，通过计算得出)
- `createdAt`: bigint (创建时间戳)

**设计说明**:
- capacity限制在4-6之间
- occupiedBeds通过计算床位占用情况得出
- 不包含headUserId等引用字段，通过Relations访问宿舍长信息

### Bed (床位)
**业务含义**: 宿舍内的具体床位

**属性设计**:
- `id`: string (床位唯一标识)
- `number`: number (床位编号，在宿舍内的序号)
- `status`: string (床位状态: available/occupied)
- `createdAt`: bigint (创建时间戳)

**设计说明**:
- number用于在宿舍内标识具体床位位置
- status跟踪床位占用状态
- 通过Relations与宿舍和用户关联

### ScoreRecord (扣分记录)
**业务含义**: 用户违规行为的扣分记录

**属性设计**:
- `id`: string (记录唯一标识)
- `reason`: string (扣分原因描述)
- `points`: number (扣分数值，必须为正数)
- `createdAt`: bigint (扣分时间戳)

**设计说明**:
- reason记录具体违规行为
- points只能为正数
- 通过Relations关联扣分者和被扣分者

### KickoutRequest (踢出申请)
**业务含义**: 宿舍长申请踢出学生的请求记录

**属性设计**:
- `id`: string (申请唯一标识)
- `reason`: string (申请踢出的原因)
- `status`: string (申请状态: pending/approved/rejected)
- `requestedAt`: bigint (申请提交时间)
- `processedAt`: bigint | null (处理时间，初始为null)
- `processNote`: string | null (处理备注，可选)

**设计说明**:
- status跟踪申请处理状态
- processedAt和processNote在申请被处理时填写
- 通过Relations关联申请人、被申请人、处理人

## 关系设计

### UserDormitoryRelation (用户-宿舍关系)
**业务含义**: 用户被分配到宿舍的关系

**关系类型**: n:1 (多个用户对应一个宿舍)
- **Source**: User
- **Target**: Dormitory  
- **Source Property**: `dormitory` (用户访问所属宿舍)
- **Target Property**: `users` (宿舍访问所有成员)

**关系属性**:
- `assignedAt`: bigint (分配时间)
- `status`: string (分配状态: active/inactive)

**设计说明**:
- 一个用户只能分配到一个宿舍
- 一个宿舍可以有多个用户
- 支持软删除（status=inactive）而不物理删除记录

### UserBedRelation (用户-床位关系)
**业务含义**: 用户占用具体床位的关系

**关系类型**: 1:1 (一个用户对应一个床位)
- **Source**: User
- **Target**: Bed
- **Source Property**: `bed` (用户访问占用的床位)
- **Target Property**: `user` (床位访问占用者)

**关系属性**:
- `assignedAt`: bigint (分配时间)

**设计说明**:
- 每个用户最多占用一个床位
- 每个床位最多分配给一个用户
- 建立此关系时需要同步更新Bed的status

### DormitoryBedRelation (宿舍-床位关系)
**业务含义**: 宿舍包含的床位关系

**关系类型**: 1:n (一个宿舍对应多个床位)
- **Source**: Dormitory
- **Target**: Bed
- **Source Property**: `beds` (宿舍访问所有床位)
- **Target Property**: `dormitory` (床位访问所属宿舍)

**关系属性**:
- `createdAt`: bigint (床位创建时间)

**设计说明**:
- 一个宿舍包含4-6个床位
- 创建宿舍时自动创建对应数量的床位
- 床位与宿舍是永久绑定关系

### DormitoryHeadRelation (宿舍长关系)
**业务含义**: 指定用户为宿舍长的管理关系

**关系类型**: 1:1 (一个宿舍对应一个宿舍长)
- **Source**: User
- **Target**: Dormitory
- **Source Property**: `managedDormitory` (宿舍长访问管理的宿舍)
- **Target Property**: `head` (宿舍访问宿舍长)

**关系属性**:
- `appointedAt`: bigint (指定时间)
- `appointedBy`: string (指定管理员的ID)

**设计说明**:
- 每个宿舍最多有一个宿舍长
- 宿舍长只能管理一个宿舍
- 建立此关系时需要更新User的role为dormHead

### UserScoreRelation (用户-扣分记录关系)
**业务含义**: 扣分记录与相关用户的关系

**关系类型**: n:1 (多个扣分记录对应一个被扣分用户)
- **Source**: ScoreRecord
- **Target**: User
- **Source Property**: `targetUser` (扣分记录访问被扣分用户)
- **Target Property**: `scoreRecords` (用户访问所有扣分记录)

**关系属性**:
- `recordedBy`: string (记录扣分的宿舍长ID)

**设计说明**:
- 一个用户可以有多个扣分记录
- 每个扣分记录只针对一个用户
- recordedBy记录是哪个宿舍长执行的扣分

### KickoutRequestRelation (踢出申请关系)
**业务含义**: 踢出申请涉及的各方关系

#### RequestTargetRelation (申请-目标用户关系)
**关系类型**: n:1 (多个申请对应一个目标用户)
- **Source**: KickoutRequest
- **Target**: User
- **Source Property**: `targetUser` (申请访问被申请踢出的用户)
- **Target Property**: `kickoutRequests` (用户访问针对自己的申请)

#### RequestRequesterRelation (申请-申请人关系)
**关系类型**: n:1 (多个申请对应一个申请人)
- **Source**: KickoutRequest  
- **Target**: User
- **Source Property**: `requester` (申请访问申请人)
- **Target Property**: `myKickoutRequests` (申请人访问自己提交的申请)

#### RequestProcessorRelation (申请-处理人关系)
**关系类型**: n:1 (多个申请对应一个处理人)
- **Source**: KickoutRequest
- **Target**: User  
- **Source Property**: `processor` (申请访问处理人)
- **Target Property**: `processedKickoutRequests` (处理人访问自己处理的申请)

**设计说明**:
- 三个独立的关系分别跟踪申请的不同角色参与者
- 支持查询用户作为不同角色参与的所有申请
- processor关系在申请被处理时才建立

## 计算属性设计预览

### User计算属性
- `totalScore`: 用户累计扣分总数 (通过scoreRecords关系计算)
- `canBeKickedOut`: 是否达到踢出门槛 (totalScore >= 100)

### Dormitory计算属性  
- `occupiedBeds`: 已占用床位数 (通过beds关系中status=occupied的数量计算)
- `availableBeds`: 可用床位数 (capacity - occupiedBeds)
- `isFullyOccupied`: 是否满员 (occupiedBeds >= capacity)

### Bed计算属性
- `isOccupied`: 是否被占用 (status === 'occupied')

## 数据访问模式

### 通过Relations访问相关数据
```typescript
// 用户访问宿舍信息
user.dormitory  // 通过UserDormitoryRelation访问
user.bed        // 通过UserBedRelation访问

// 宿舍访问成员和床位
dormitory.users // 通过UserDormitoryRelation访问
dormitory.beds  // 通过DormitoryBedRelation访问  
dormitory.head  // 通过DormitoryHeadRelation访问

// 扣分记录访问
user.scoreRecords        // 通过UserScoreRelation访问
scoreRecord.targetUser   // 通过UserScoreRelation访问

// 踢出申请访问
user.kickoutRequests         // 作为目标用户
user.myKickoutRequests       // 作为申请人
user.processedKickoutRequests // 作为处理人
```

## 设计验证清单

### 实体设计验证
- [ ] 所有实体名称使用PascalCase单数形式
- [ ] 所有属性都是原始类型或实体自身数据
- [ ] 没有在实体中包含引用ID字段
- [ ] 所有defaultValue都是函数而非静态值
- [ ] 实体属性类型正确(string/number/boolean/bigint/object)

### 关系设计验证  
- [ ] 关系类型正确('1:1', '1:n', 'n:1', 'n:n')
- [ ] 没有在Relation.create中指定name属性
- [ ] sourceProperty和targetProperty命名清晰
- [ ] 关系属性设计合理
- [ ] 关系支持必要的业务查询需求

### 业务逻辑验证
- [ ] 支持用户只能分配到一个宿舍一个床位
- [ ] 支持宿舍容量4-6床位限制
- [ ] 支持扣分记录和累计扣分计算
- [ ] 支持踢出申请的完整工作流
- [ ] 支持基于角色的权限控制数据访问