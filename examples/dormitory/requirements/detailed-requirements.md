# 宿舍管理系统详细需求分析

## 1. 需求背景分析
本系统是一个宿舍管理系统，主要用于管理宿舍的分配、用户行为监督和违规处理流程。

## 2. 数据视角分析

### 2.1 实体识别
1. **User（用户）**
   - 目的：系统中的所有用户，包含管理员、宿舍长、普通学生
   - 属性：
     - id: string（系统生成的唯一标识）
     - name: string（用户姓名）
     - email: string（邮箱，用于唯一标识）
     - role: string（角色类型：admin、dormHead、student）
     - score: number（当前扣分值，默认0）

2. **Dormitory（宿舍）**
   - 目的：宿舍信息管理
   - 属性：
     - id: string（宿舍唯一标识）
     - name: string（宿舍名称，如"1号楼101"）
     - capacity: number（床位容量，4-6个）
     - currentOccupancy: number（当前入住人数，计算属性）

3. **Bed（床位）**
   - 目的：宿舍内具体床位管理
   - 属性：
     - id: string（床位唯一标识）
     - bedNumber: string（床位号，如"A1"）
     - status: string（床位状态：available、occupied、maintenance）

4. **ViolationRecord（违规记录）**
   - 目的：记录用户违规行为和扣分情况
   - 属性：
     - id: string（记录唯一标识）
     - violationType: string（违规类型）
     - description: string（违规描述）
     - scoreDeducted: number（扣除分数）
     - recordedAt: number（记录时间戳）
     - recordedBy: string（记录人ID）

5. **KickoutRequest（踢出申请）**
   - 目的：宿舍长申请踢出用户的流程管理
   - 属性：
     - id: string（申请唯一标识）
     - reason: string（申请理由）
     - status: string（申请状态：pending、approved、rejected）
     - requestedAt: number（申请时间戳）
     - processedAt: number（处理时间戳，可选）
     - processedBy: string（处理人ID，可选）

### 2.2 关系识别
1. **UserDormitoryRelation（用户-宿舍关系）**
   - 类型：n:1（多个用户对应一个宿舍）
   - 目的：记录用户被分配到哪个宿舍
   - 属性：
     - assignedAt: number（分配时间戳）
     - status: string（分配状态：active、inactive）

2. **UserBedRelation（用户-床位关系）**
   - 类型：1:1（一个用户对应一个床位）
   - 目的：记录用户具体占用的床位
   - 属性：
     - assignedAt: number（分配时间戳）
     - status: string（分配状态：active、inactive）

3. **DormitoryBedRelation（宿舍-床位关系）**
   - 类型：1:n（一个宿舍包含多个床位）
   - 目的：记录宿舍包含的所有床位

4. **DormitoryHeadRelation（宿舍长关系）**
   - 类型：1:1（一个宿舍有一个宿舍长）
   - 目的：记录宿舍长职责分配
   - 属性：
     - appointedAt: number（任命时间戳）
     - status: string（任命状态：active、inactive）

5. **UserViolationRelation（用户-违规记录关系）**
   - 类型：1:n（一个用户可有多个违规记录）
   - 目的：关联用户和其违规记录

6. **KickoutRequestRelation（踢出申请关系）**
   - 类型：多个相关关系
   - UserKickoutRequestRelation：申请人和申请（1:n）
   - TargetUserKickoutRequestRelation：被申请踢出的用户和申请（1:n）
   - ProcessorKickoutRequestRelation：处理人和申请（1:n）

## 3. 交互视角分析

### 3.1 管理员操作
1. **CreateDormitory（创建宿舍）**
   - 输入：宿舍名称、床位容量
   - 权限：仅管理员
   - 业务规则：容量必须在4-6之间

2. **AssignUserToDormitory（分配用户到宿舍）**
   - 输入：用户ID、宿舍ID、床位ID
   - 权限：仅管理员
   - 业务规则：
     - 用户未被分配过宿舍
     - 宿舍有空余床位
     - 床位状态为可用

3. **AppointDormHead（任命宿舍长）**
   - 输入：用户ID、宿舍ID
   - 权限：仅管理员
   - 业务规则：
     - 用户已被分配到该宿舍
     - 该宿舍当前无宿舍长

4. **ProcessKickoutRequest（处理踢出申请）**
   - 输入：申请ID、决定（同意/拒绝）
   - 权限：仅管理员
   - 业务规则：申请状态为pending

### 3.2 宿舍长操作
1. **RecordViolation（记录违规）**
   - 输入：用户ID、违规类型、描述、扣分
   - 权限：宿舍长（仅对本宿舍成员）
   - 业务规则：目标用户必须在同一宿舍

2. **CreateKickoutRequest（创建踢出申请）**
   - 输入：用户ID、理由
   - 权限：宿舍长（仅对本宿舍成员）
   - 业务规则：
     - 目标用户必须在同一宿舍
     - 目标用户扣分达到一定程度（如≥10分）
     - 同一用户无未处理的踢出申请

### 3.3 系统自动操作
1. **UpdateUserScore（更新用户分数）**
   - 触发：记录违规时自动执行
   - 逻辑：累加用户的总扣分

2. **UpdateDormitoryOccupancy（更新宿舍入住率）**
   - 触发：用户分配/移除时自动执行
   - 逻辑：计算宿舍当前入住人数

## 4. 业务流程分析

### 4.1 用户分配流程
1. 管理员创建宿舍和床位
2. 管理员分配用户到特定宿舍的特定床位
3. 系统更新宿舍入住率
4. 管理员可任命该宿舍的用户为宿舍长

### 4.2 违规处理流程
1. 宿舍长发现同宿舍用户违规
2. 宿舍长记录违规行为和扣分
3. 系统自动更新用户总扣分
4. 当用户扣分达到阈值时，宿舍长可申请踢出
5. 管理员审核踢出申请
6. 管理员同意后，用户被移出宿舍

### 4.3 踢出申请流程
1. 宿舍长创建踢出申请（需满足扣分条件）
2. 申请状态设为pending
3. 管理员查看并处理申请
4. 管理员同意：用户被踢出，床位释放
5. 管理员拒绝：申请状态更新为rejected

## 5. 权限系统设计

### 5.1 角色定义
- **admin（管理员）**：系统管理权限，可以创建宿舍、分配用户、任命宿舍长、处理申请
- **dormHead（宿舍长）**：宿舍管理权限，可以记录违规、申请踢出同宿舍用户
- **student（学生）**：基础权限，可以查看自己的信息和违规记录

### 5.2 权限矩阵
| 操作 | admin | dormHead | student |
|------|-------|----------|---------|
| 创建宿舍 | ✓ | ✗ | ✗ |
| 分配用户 | ✓ | ✗ | ✗ |
| 任命宿舍长 | ✓ | ✗ | ✗ |
| 记录违规 | ✓ | ✓(同宿舍) | ✗ |
| 申请踢出 | ✓ | ✓(同宿舍) | ✗ |
| 处理申请 | ✓ | ✗ | ✗ |
| 查看信息 | ✓ | ✓(同宿舍) | ✓(自己) |

## 6. 业务规则总结

### 6.1 数据约束
- 宿舍容量：4-6个床位
- 用户分配：每个用户只能分配到一个宿舍的一个床位
- 宿舍长：每个宿舍最多一个宿舍长，必须是本宿舍成员

### 6.2 业务逻辑约束
- 踢出申请前提：用户扣分≥10分
- 重复申请限制：同一用户不能有多个pending状态的踢出申请
- 分配限制：用户只能被分配到有空余床位的宿舍
- 权限限制：宿舍长只能管理同宿舍的用户

### 6.3 状态管理
- 床位状态：available → occupied → available
- 申请状态：pending → approved/rejected
- 用户分配状态：active → inactive
- 宿舍长状态：active → inactive

这个详细需求分析为后续的系统设计和实现提供了完整的业务逻辑基础。