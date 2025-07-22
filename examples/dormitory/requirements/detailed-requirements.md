# 宿舍管理系统详细需求分析

## 1. 业务背景
宿舍管理系统用于管理学生宿舍的分配、日常管理和行为管理。系统需要支持管理员、宿舍长和普通学生三种角色的不同操作权限。

## 2. 数据分析

### 2.1 实体（Entities）
1. **User（用户）**
   - id: 唯一标识
   - name: 姓名
   - email: 邮箱（唯一）
   - role: 角色（admin/dormHead/student）
   - status: 状态（active/removed）
   - score: 积分（默认100分）
   - joinedAt: 加入时间

2. **Dormitory（宿舍）**
   - id: 唯一标识
   - name: 宿舍名称（如"东区3栋201"）
   - capacity: 容量（4-6人）
   - currentOccupancy: 当前入住人数（计算属性）
   - createdAt: 创建时间

3. **Bed（床位）**
   - id: 唯一标识
   - bedNumber: 床位号（1-6）
   - status: 状态（available/occupied）

4. **DeductionRule（扣分规则）**
   - id: 唯一标识
   - name: 规则名称
   - description: 规则描述
   - points: 扣分值
   - isActive: 是否生效

5. **DeductionRecord（扣分记录）**
   - id: 唯一标识
   - reason: 扣分原因
   - points: 扣分值
   - createdAt: 扣分时间

6. **RemovalRequest（踢出申请）**
   - id: 唯一标识
   - reason: 申请原因
   - status: 状态（pending/approved/rejected）
   - createdAt: 申请时间
   - processedAt: 处理时间

### 2.2 关系（Relations）
1. **UserDormitoryRelation**（用户-宿舍关系）
   - 类型：n:1（多个用户属于一个宿舍）
   - source: User
   - target: Dormitory

2. **UserBedRelation**（用户-床位关系）
   - 类型：1:1（一个用户占用一个床位）
   - source: User
   - target: Bed

3. **DormitoryBedRelation**（宿舍-床位关系）
   - 类型：1:n（一个宿舍有多个床位）
   - source: Dormitory
   - target: Bed

4. **DormitoryDormHeadRelation**（宿舍-宿舍长关系）
   - 类型：1:1（一个宿舍有一个宿舍长）
   - source: Dormitory
   - target: User

5. **UserDeductionRecordRelation**（用户-扣分记录关系）
   - 类型：1:n（一个用户有多个扣分记录）
   - source: User
   - target: DeductionRecord

6. **DeductionRuleDeductionRecordRelation**（扣分规则-扣分记录关系）
   - 类型：1:n（一个规则对应多个记录）
   - source: DeductionRule
   - target: DeductionRecord

7. **RemovalRequestUserRelation**（踢出申请-用户关系）
   - 类型：n:1（多个申请针对一个用户）
   - source: RemovalRequest
   - target: User

8. **RemovalRequestDormHeadRelation**（踢出申请-宿舍长关系）
   - 类型：n:1（多个申请由一个宿舍长发起）
   - source: RemovalRequest
   - target: User（as dormHead）

## 3. 交互分析

### 3.1 管理员（Admin）交互
1. **CreateDormitory**: 创建宿舍
2. **AssignDormHead**: 指定宿舍长
3. **AssignUserToDormitory**: 分配用户到宿舍
4. **CreateDeductionRule**: 创建扣分规则
5. **ProcessRemovalRequest**: 处理踢出申请（批准/拒绝）

### 3.2 宿舍长（DormHead）交互
1. **DeductPoints**: 对宿舍成员扣分
2. **RequestUserRemoval**: 申请踢出用户

### 3.3 学生（Student）交互
1. **ViewDormitoryInfo**: 查看宿舍信息
2. **ViewMyScore**: 查看个人积分

### 3.4 系统自动交互
1. **CheckScoreThreshold**: 检查积分阈值（当用户积分低于60分时，宿舍长可以申请踢出）

## 4. 业务规则

### 4.1 权限规则
- 只有管理员可以创建宿舍和指定宿舍长
- 只有管理员可以分配用户到宿舍
- 宿舍长只能管理自己宿舍的成员
- 学生只能查看自己的信息

### 4.2 业务逻辑规则
- 每个宿舍容量为4-6人
- 每个用户只能被分配到一个宿舍的一个床位
- 用户初始积分为100分
- 扣分后积分不能为负数
- 积分低于60分时，宿舍长可以申请踢出
- 被踢出的用户状态变为removed，床位释放

### 4.3 状态流转
- 床位状态：available → occupied → available（用户被踢出后）
- 用户状态：active → removed（被踢出后）
- 踢出申请状态：pending → approved/rejected

## 5. 计算属性
1. **Dormitory.currentOccupancy**: 统计当前宿舍的入住人数
2. **User.score**: 基于扣分记录动态计算当前积分
3. **User.canBeRemoved**: 判断用户是否可以被踢出（积分<60）

## 6. 响应式行为
1. 当用户被分配到宿舍时，自动分配空闲床位
2. 当用户被踢出时，自动释放床位
3. 当扣分记录创建时，自动更新用户积分
4. 当踢出申请被批准时，自动更新用户状态 