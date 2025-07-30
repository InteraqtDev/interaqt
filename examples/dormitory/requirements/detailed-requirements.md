# 宿舍管理系统详细需求分析

## 1. 业务背景
构建一套完整的宿舍管理系统，实现对宿舍、用户、床位分配、行为评分和踢人流程的全面管理。

## 2. 实体分析

### 2.1 用户 (User)
**用途**: 系统中的用户，包含不同角色
**属性**:
- id: string (系统生成)
- name: string (用户姓名)
- email: string (邮箱，唯一标识)
- role: string (角色: 'admin' | 'dormHead' | 'student')
- score: number (行为评分，默认100分)
- status: string (状态: 'active' | 'expelled')

### 2.2 宿舍 (Dormitory)
**用途**: 宿舍建筑物，包含多个床位
**属性**:
- id: string (系统生成)
- name: string (宿舍名称，如"1号楼101")
- capacity: number (床位数量，4-6个)
- occupiedCount: number (已占用床位数，计算属性)
- availableCount: number (可用床位数，计算属性)

### 2.3 床位 (Bed)
**用途**: 宿舍中的具体床位
**属性**:
- id: string (系统生成)
- bedNumber: number (床位号，1-6)
- status: string (状态: 'available' | 'occupied')

### 2.4 扣分记录 (ScoreRecord)
**用途**: 记录用户的扣分行为
**属性**:
- id: string (系统生成)
- reason: string (扣分原因)
- points: number (扣分分数)
- createdAt: number (创建时间戳)

### 2.5 踢人申请 (ExpelRequest)
**用途**: 宿舍长申请踢出用户的记录
**属性**:
- id: string (系统生成)
- reason: string (申请原因)
- status: string (状态: 'pending' | 'approved' | 'rejected')
- createdAt: number (申请时间)
- processedAt: number (处理时间，可选)

## 3. 关系分析

### 3.1 用户-宿舍关系 (UserDormitoryRelation)
**类型**: n:1 (多个用户对应一个宿舍)
**用途**: 记录用户被分配到哪个宿舍
**源属性**: `dormitory` (在用户实体上)
**目标属性**: `residents` (在宿舍实体上)
**关系属性**:
- assignedAt: number (分配时间)
- status: string (分配状态: 'active' | 'inactive')

### 3.2 用户-床位关系 (UserBedRelation)
**类型**: 1:1 (一个用户对应一个床位)
**用途**: 记录用户占用的具体床位
**源属性**: `bed` (在用户实体上)
**目标属性**: `occupant` (在床位实体上)
**关系属性**:
- assignedAt: number (分配时间)

### 3.3 宿舍-床位关系 (DormitoryBedRelation)
**类型**: 1:n (一个宿舍对应多个床位)
**用途**: 床位属于哪个宿舍
**源属性**: `dormitory` (在床位实体上)
**目标属性**: `beds` (在宿舍实体上)

### 3.4 宿舍-宿舍长关系 (DormitoryHeadRelation)
**类型**: 1:1 (一个宿舍对应一个宿舍长)
**用途**: 指定宿舍的管理员
**源属性**: `managedDormitory` (在用户实体上)
**目标属性**: `head` (在宿舍实体上)
**关系属性**:
- appointedAt: number (任命时间)

### 3.5 用户-扣分记录关系 (UserScoreRecordRelation)
**类型**: 1:n (一个用户对应多个扣分记录)
**用途**: 记录用户的所有扣分历史
**源属性**: `user` (在扣分记录实体上)
**目标属性**: `scoreRecords` (在用户实体上)

### 3.6 踢人申请相关关系
**申请人-踢人申请关系 (ApplicantExpelRequestRelation)**
- 类型: 1:n (一个申请人对应多个申请)
- 源属性: `applicant` (在踢人申请实体上)
- 目标属性: `submittedExpelRequests` (在用户实体上)

**被申请人-踢人申请关系 (TargetExpelRequestRelation)**
- 类型: 1:n (一个被申请人对应多个申请)
- 源属性: `targetUser` (在踢人申请实体上)
- 目标属性: `receivedExpelRequests` (在用户实体上)

**处理人-踢人申请关系 (ProcessorExpelRequestRelation)**
- 类型: 1:n (一个处理人对应多个申请)
- 源属性: `processor` (在踢人申请实体上，可选)
- 目标属性: `processedExpelRequests` (在用户实体上)

## 4. 交互操作分析

### 4.1 管理员操作
1. **创建宿舍** (CreateDormitory)
2. **指定宿舍长** (AssignDormitoryHead)
3. **分配用户到宿舍** (AssignUserToDormitory)
4. **处理踢人申请** (ProcessExpelRequest)
5. **创建用户** (CreateUser)

### 4.2 宿舍长操作
1. **给用户扣分** (DeductUserScore)
2. **申请踢出用户** (SubmitExpelRequest)
3. **查看宿舍成员** (ViewDormitoryMembers)

### 4.3 学生操作
1. **查看自己信息** (ViewUserProfile)
2. **查看扣分记录** (ViewScoreRecords)

### 4.4 系统计算操作
1. **更新用户总分数** (自动计算)
2. **更新宿舍占用情况** (自动计算)
3. **床位状态更新** (自动计算)

## 5. 权限控制需求

### 5.1 管理员权限
- 创建宿舍
- 指定宿舍长
- 分配用户到宿舍
- 处理踢人申请
- 创建用户

### 5.2 宿舍长权限
- 只能给自己管理的宿舍内的用户扣分
- 只能申请踢出自己管理的宿舍内的用户
- 查看自己管理的宿舍成员信息

### 5.3 学生权限
- 只能查看自己的信息和扣分记录

## 6. 业务规则

### 6.1 宿舍相关规则
- 每个宿舍容量为4-6个床位
- 宿舍不能超员分配
- 每个用户只能被分配到一个宿舍的一个床位

### 6.2 扣分相关规则
- 用户初始分数为100分
- 扣分不能为负数
- 常见扣分规则:
  - 晚归: -5分
  - 卫生不达标: -10分
  - 噪音扰民: -15分
  - 违反宿舍规定: -20分

### 6.3 踢人相关规则
- 只有用户分数低于60分时，宿舍长才能申请踢出
- 宿舍长只能申请踢出自己管理宿舍内的成员
- 管理员处理申请后，被踢出的用户状态变为'expelled'，自动释放床位

### 6.4 角色指定规则
- 只有管理员可以指定宿舍长
- 一个宿舍只能有一个宿舍长
- 宿舍长必须是该宿舍的住户

## 7. 数据流程

### 7.1 用户入住流程
1. 管理员创建用户
2. 管理员创建宿舍(包含床位)
3. 管理员分配用户到宿舍的具体床位
4. 从符合条件的住户中指定宿舍长

### 7.2 扣分流程
1. 宿舍长发现违规行为
2. 宿舍长对用户进行扣分
3. 系统自动更新用户总分数
4. 如果分数低于阈值，宿舍长可申请踢出

### 7.3 踢人流程
1. 宿舍长提交踢人申请
2. 管理员审核申请
3. 管理员批准后，用户被踢出，床位释放
4. 系统更新相关状态和统计信息

## 8. 性能和扩展性考虑

### 8.1 数据量预估
- 用户数量: 1000-5000
- 宿舍数量: 100-500
- 床位数量: 400-3000
- 扣分记录: 每月1000-5000条
- 踢人申请: 每月10-50条

### 8.2 查询优化需求
- 按宿舍查询用户列表
- 按用户查询扣分记录
- 按状态查询踢人申请
- 统计宿舍占用率

### 8.3 扩展性考虑
- 支持多种扣分规则配置
- 支持不同类型宿舍管理
- 支持批量操作
- 支持审批工作流扩展