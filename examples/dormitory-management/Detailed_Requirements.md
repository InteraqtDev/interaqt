# 宿舍管理系统详细需求文档

## 一、系统概述

宿舍管理系统是一个用于管理学校宿舍分配、成员管理、积分考核等业务的综合管理平台。系统支持学生申请入住、宿舍长管理、管理员审批等多角色协作流程。

## 二、用户角色

### 1. 管理员（Admin）
- 负责创建和管理宿舍
- 指定宿舍长
- 直接分配学生到宿舍
- 审批入住申请的最终决定
- 处理踢出成员申请

### 2. 学生（Student）
- 申请加入宿舍
- 查看宿舍信息
- 取消自己的申请

### 3. 宿舍长（Dormitory Leader）
- 由管理员从宿舍成员中指定
- 审批本宿舍的入住申请
- 管理成员积分（加分/扣分）
- 申请踢出违纪成员

## 三、核心实体

### 1. User（用户）
- **基础属性**：
  - name: 姓名
  - role: 角色（admin/student）
  - email: 邮箱
  - studentId: 学号
  - createdAt: 创建时间
- **计算属性**：
  - isAdmin: 是否是管理员
  - hasActiveDormitory: 是否有活跃的宿舍
  - totalScore: 历史总积分
  - applicationCount: 发起的申请数量

### 2. Dormitory（宿舍）
- **基础属性**：
  - name: 宿舍名称
  - building: 楼栋
  - roomNumber: 房间号
  - capacity: 容量（4-6个床位）
  - description: 描述
  - createdAt: 创建时间
- **计算属性**：
  - totalMemberCount: 总成员数（包括非活跃）
  - currentOccupancy: 当前活跃成员数
  - isFull: 是否已满
  - availableBeds: 剩余床位数
  - hasLeader: 是否有宿舍长
  - pendingApplicationCount: 待处理申请数
  - totalScore: 宿舍总积分
  - averageScore: 平均积分
  - allMembersActive: 所有成员是否都是活跃状态

### 3. DormitoryMember（宿舍成员）
- **基础属性**：
  - role: 角色（leader/member）
  - score: 积分（默认0）
  - joinedAt: 加入时间
  - status: 状态（active/kicked）
  - bedNumber: 床位号
- **计算属性**：
  - isLeader: 是否是宿舍长
  - isActive: 是否是活跃成员
  - scoreRecordCount: 积分记录数量
  - atKickRisk: 是否处于被踢出风险（积分<-50）
- **状态机**：
  - active → kicked（当管理员批准踢出申请时自动转换）

### 4. DormitoryApplication（入住申请）
- **属性**：
  - status: 状态（pending/leader_approved/admin_approved/rejected/cancelled）
  - message: 申请留言
  - leaderComment: 宿舍长意见
  - adminComment: 管理员意见
  - createdAt: 创建时间
  - updatedAt: 更新时间

### 5. ScoreRecord（积分记录）
- **属性**：
  - points: 积分值（正数加分，负数扣分）
  - reason: 原因
  - category: 类别（hygiene卫生/discipline纪律/activity活动/other其他）
  - createdAt: 创建时间

### 6. KickRequest（踢出申请）
- **属性**：
  - reason: 申请原因
  - status: 状态（pending/approved/rejected）
  - adminComment: 管理员意见
  - createdAt: 创建时间
  - processedAt: 处理时间

## 四、业务流程

### 1. 入住申请流程
1. **学生发起申请**
   - 前置条件：学生角色且没有活跃宿舍
   - 选择未满的宿舍
   - 填写申请留言

2. **宿舍长审批**
   - 查看待处理申请
   - 批准或拒绝，填写意见

3. **管理员最终审批**
   - 对宿舍长批准的申请进行最终审批
   - 分配床位号
   - 创建宿舍成员关系

4. **学生取消申请**
   - 在任何阶段都可以取消申请

### 2. 积分管理流程
1. **宿舍长记录积分**
   - 选择本宿舍成员
   - 填写加分/扣分值
   - 选择类别和原因

2. **自动计算影响**
   - 成员总积分自动更新
   - 宿舍总积分和平均分自动更新
   - 积分低于-50分自动标记为"踢出风险"

### 3. 踢出成员流程
1. **宿舍长发起申请**
   - 选择要踢出的成员
   - 填写申请原因

2. **管理员审批**
   - 查看申请详情和成员积分记录
   - 批准或拒绝，填写处理意见

3. **状态自动更新**
   - 批准后成员状态自动从active变为kicked
   - 宿舍当前入住人数自动减少

## 五、交互功能清单

### 管理员功能
1. **CreateDormitory** - 创建宿舍
2. **AssignDormitoryLeader** - 指定宿舍长
3. **AssignMemberToDormitory** - 直接分配成员
4. **AdminApproveApplication** - 批准入住申请
5. **AdminRejectApplication** - 拒绝入住申请
6. **ApproveKickRequest** - 批准踢出申请
7. **RejectKickRequest** - 拒绝踢出申请

### 宿舍长功能
1. **LeaderApproveApplication** - 批准入住申请
2. **LeaderRejectApplication** - 拒绝入住申请
3. **RecordScore** - 记录积分
4. **RequestKickMember** - 申请踢出成员

### 学生功能
1. **ApplyForDormitory** - 申请加入宿舍
2. **CancelApplication** - 取消申请

### 查询功能（所有角色）
1. **GetDormitories** - 查看宿舍列表
2. **GetUsers** - 查看用户信息
3. **GetDormitoryMembers** - 查看宿舍成员
4. **GetApplications** - 查看申请列表
5. **GetScoreRecords** - 查看积分记录
6. **GetKickRequests** - 查看踢出申请

## 六、权限控制

### 基于角色的权限
- **AdminAttributive**: 检查用户是否为管理员
- **StudentAttributive**: 检查用户是否为学生
- **DormitoryLeaderAttributive**: 检查用户是否为宿舍长
- **DormitoryMemberAttributive**: 检查用户是否为某宿舍成员
- **NoActiveDormitoryAttributive**: 检查学生是否没有活跃宿舍
- **DormitoryNotFullAttributive**: 检查宿舍是否未满

### 权限组合
- 申请加入宿舍：学生角色 AND 没有活跃宿舍
- 宿舍长操作：必须是目标宿舍的宿舍长

## 七、数据一致性保证

### 响应式计算
1. **自动更新的计算属性**
   - 宿舍入住人数随成员变化自动更新
   - 用户总积分随积分记录自动汇总
   - 宿舍平均分随成员积分变化自动计算

2. **状态机自动转换**
   - 管理员批准踢出申请时，成员状态自动转为kicked

3. **级联关系**
   - 通过关系定义确保数据引用完整性
   - 删除操作的级联处理

## 八、系统限制

1. **宿舍容量**：每个宿舍4-6个床位
2. **积分阈值**：积分低于-50分标记为踢出风险
3. **角色限制**：每个宿舍只能有一个宿舍长
4. **申请限制**：学生同时只能有一个活跃宿舍
5. **审批流程**：入住申请必须经过宿舍长和管理员双重审批

## 九、数据统计功能

系统自动维护以下统计数据：
1. 用户维度：总积分、申请数量、是否有活跃宿舍
2. 宿舍维度：入住率、平均积分、待处理申请数
3. 成员维度：积分记录数、是否处于踢出风险

## 十、扩展性考虑

系统设计支持以下扩展：
1. 积分类别可扩展（卫生、纪律、活动等）
2. 申请状态可扩展
3. 成员状态可通过状态机扩展
4. 权限系统可灵活组合和扩展 