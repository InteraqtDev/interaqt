# 宿舍管理系统详细需求分析

## 系统角色
1. **系统管理员** - 拥有全局管理权限
2. **宿舍长** - 管理特定宿舍，可以申请踢出用户
3. **普通用户** - 居住在宿舍的学生

## 数据实体分析

### User 用户实体
- id: 用户唯一标识
- name: 用户名
- email: 邮箱
- role: 用户角色 (admin, dorm_leader, student)
- score: 用户积分（扣分系统）
- dormId: 所在宿舍ID（可选，用户可能未分配宿舍）
- bedNumber: 床位号（可选，与宿舍ID关联）
- createdAt: 创建时间
- updatedAt: 更新时间

### Dorm 宿舍实体
- id: 宿舍唯一标识
- name: 宿舍名称
- capacity: 容量（4-6人）
- leaderId: 宿舍长用户ID
- createdAt: 创建时间
- updatedAt: 更新时间

### DormAssignment 宿舍分配关系实体
- id: 分配记录唯一标识
- userId: 用户ID
- dormId: 宿舍ID
- bedNumber: 床位号（1-capacity）
- assignedAt: 分配时间
- removedAt: 移除时间（可选，用于记录历史）
- status: 状态 (active, removed)

### ScoreRecord 扣分记录实体
- id: 扣分记录唯一标识
- userId: 被扣分用户ID
- deductorId: 执行扣分用户ID
- points: 扣分点数
- reason: 扣分原因
- createdAt: 扣分时间

### EvictionRequest 踢出申请实体
- id: 申请唯一标识
- applicantId: 申请人ID（宿舍长）
- targetUserId: 被申请踢出用户ID
- dormId: 相关宿舍ID
- reason: 申请理由
- status: 申请状态 (pending, approved, rejected)
- createdAt: 申请时间
- resolvedAt: 处理时间（可选）

## 交互操作分析

### 管理员操作
1. **CreateDorm** - 创建新宿舍
2. **AssignDormLeader** - 指定宿舍长
3. **AssignUserToDorm** - 分配用户到宿舍
4. **RemoveUserFromDorm** - 将用户从宿舍移除
5. **DeductPoints** - 给用户扣分
6. **ProcessEvictionRequest** - 处理踢出申请（同意/拒绝）

### 宿舍长操作
1. **ApplyForEviction** - 申请踢出用户
2. **ViewDormMembers** - 查看宿舍成员

### 普通用户操作
1. **ViewMyDorm** - 查看自己的宿舍信息
2. **ViewMyScore** - 查看自己的积分

## 业务规则
1. 每个宿舍有固定容量（4-6人）
2. 每个用户只能被分配到一个宿舍的一个床位上
3. 宿舍长必须是该宿舍的成员
4. 扣分达到一定阈值（如-100分）才能申请踢出
5. 踢出申请需要管理员审批
6. 用户被踢出后，床位变为可用
7. 宿舍长不能申请踢出自己

## 权限控制
- 管理员：所有操作
- 宿舍长：只能管理自己宿舍的成员，只能申请踢出自己宿舍的用户
- 普通用户：只能查看与自己相关的信息

## 状态管理
- 宿舍：正常运营状态
- 用户：正常/被踢出状态
- 踢出申请：待处理/已批准/已拒绝