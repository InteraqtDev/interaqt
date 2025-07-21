# 宿舍管理系统测试用例

## TC001: 创建宿舍 (CreateDorm Interaction)
- Interaction: CreateDorm
- Preconditions: 用户已登录且具有管理员权限
- Input Data: name="A101", capacity=4
- Expected Results:
  1. 创建新的宿舍记录
  2. 宿舍名称为"A101"
  3. 宿舍容量为4
  4. 创建时间为当前时间
  5. 宿舍leader为空（未指定）
- Post Validation: 宿舍出现在宿舍列表中

## TC002: 创建宿舍容量超限 (CreateDorm with Invalid Capacity)
- Interaction: CreateDorm
- Preconditions: 用户已登录且具有管理员权限
- Input Data: name="A102", capacity=3
- Expected Results:
  1. 交互返回错误
  2. 错误类型为"validation failed"
  3. 错误消息包含"capacity must be between 4 and 6"
  4. 没有宿舍记录被创建

## TC003: 创建宿舍无权限 (CreateDorm without Permission)
- Interaction: CreateDorm
- Preconditions: 普通用户登录
- Input Data: name="A103", capacity=4
- Expected Results:
  1. 交互返回错误
  2. 错误类型为"permission denied"
  3. 没有宿舍记录被创建

## TC004: 指定宿舍长 (AssignDormLeader Interaction)
- Interaction: AssignDormLeader
- Preconditions: 
  - 管理员已登录
  - 宿舍已存在
  - 用户是该宿舍的成员
- Input Data: dormId="dorm123", userId="user456"
- Expected Results:
  1. 宿舍的leaderId更新为指定用户ID
  2. 用户的role更新为"dorm_leader"
  3. 更新时间为当前时间
- Post Validation: 用户现在具有宿舍长权限

## TC005: 分配用户到宿舍 (AssignUserToDorm Interaction)
- Interaction: AssignUserToDorm
- Preconditions:
  - 管理员已登录
  - 宿舍存在且有可用床位
  - 用户未被分配到任何宿舍
- Input Data: userId="user789", dormId="dorm123", bedNumber=1
- Expected Results:
  1. 创建DormAssignment记录
  2. 用户的dormId更新为指定宿舍ID
  3. 用户的bedNumber更新为指定床位号
  4. 宿舍当前入住人数+1
  5. 分配状态为"active"

## TC006: 重复分配用户到宿舍 (AssignUserToDorm Duplicate)
- Interaction: AssignUserToDorm
- Preconditions:
  - 管理员已登录
  - 用户已被分配到其他宿舍
- Input Data: userId="user789", dormId="dorm124", bedNumber=2
- Expected Results:
  1. 交互返回错误
  2. 错误类型为"validation failed"
  3. 错误消息包含"user already assigned to a dorm"
  4. 原分配关系保持不变

## TC007: 分配用户到满员宿舍 (AssignUserToDorm Full)
- Interaction: AssignUserToDorm
- Preconditions:
  - 管理员已登录
  - 宿舍已满员
- Input Data: userId="user999", dormId="dorm123", bedNumber=5
- Expected Results:
  1. 交互返回错误
  2. 错误类型为"validation failed"
  3. 错误消息包含"dorm is full"
  4. 没有新的分配记录创建

## TC008: 给用户扣分 (DeductPoints Interaction)
- Interaction: DeductPoints
- Preconditions:
  - 管理员已登录
  - 用户存在
- Input Data: userId="user123", points=10, reason="late return"
- Expected Results:
  1. 创建ScoreRecord记录
  2. 用户的score减少10分
  3. 扣分记录包含原因和操作人员
  4. 返回更新后的用户积分

## TC009: 宿舍长申请踢出用户 (ApplyForEviction Interaction)
- Interaction: ApplyForEviction
- Preconditions:
  - 宿舍长已登录
  - 目标用户是其宿舍成员
  - 用户积分低于阈值(-100分)
- Input Data: targetUserId="user456", reason="repeated violations"
- Expected Results:
  1. 创建EvictionRequest记录
  2. 申请状态为"pending"
  3. 申请者为当前宿舍长
  4. 返回申请成功信息

## TC010: 宿舍长申请踢出积分不足用户 (ApplyForEviction Not Eligible)
- Interaction: ApplyForEviction
- Preconditions:
  - 宿舍长已登录
  - 目标用户积分高于阈值
- Input Data: targetUserId="user456", reason="minor issue"
- Expected Results:
  1. 交互返回错误
  2. 错误类型为"validation failed"
  3. 错误消息包含"user score is not low enough"
  4. 没有创建申请记录

## TC011: 处理踢出申请 (ProcessEvictionRequest Interaction)
- Interaction: ProcessEvictionRequest
- Preconditions:
  - 管理员已登录
  - 踢出申请存在且状态为"pending"
- Input Data: requestId="req123", action="approve"
- Expected Results:
  1. EvictionRequest状态更新为"approved"
  2. 用户的宿舍分配被移除
  3. 用户的dormId和bedNumber清空
  4. 宿舍空余床位+1
  5. 用户的role更新为"student"

## TC012: 拒绝踢出申请 (ProcessEvictionRequest Reject)
- Interaction: ProcessEvictionRequest
- Preconditions:
  - 管理员已登录
  - 踢出申请存在且状态为"pending"
- Input Data: requestId="req123", action="reject"
- Expected Results:
  1. EvictionRequest状态更新为"rejected"
  2. 用户宿舍分配保持不变
  3. 返回拒绝信息

## TC013: 查看宿舍成员 (ViewDormMembers Interaction)
- Interaction: ViewDormMembers
- Preconditions:
  - 宿舍长已登录
- Input Data: dormId="dorm123"
- Expected Results:
  1. 返回宿舍所有成员列表
  2. 包含每个成员的详细信息
  3. 只返回当前宿舍的成员

## TC014: 查看我的宿舍 (ViewMyDorm Interaction)
- Interaction: ViewMyDorm
- Preconditions:
  - 普通用户已登录
  - 用户已被分配到宿舍
- Expected Results:
  1. 返回用户所在宿舍的详细信息
  2. 包含宿舍名称、容量、成员列表
  3. 包含用户的床位信息

## TC015: 查看我的积分 (ViewMyScore Interaction)
- Interaction: ViewMyScore
- Preconditions:
  - 普通用户已登录
- Expected Results:
  1. 返回当前用户的积分信息
  2. 包含历史扣分记录
  3. 按时间倒序排列扣分记录

## TC016: 移除用户从宿舍 (RemoveUserFromDorm Interaction)
- Interaction: RemoveUserFromDorm
- Preconditions:
  - 管理员已登录
  - 用户当前在宿舍中
- Input Data: userId="user123"
- Expected Results:
  1. 用户的宿舍分配状态更新为"removed"
  2. 用户的dormId和bedNumber清空
  3. 用户的role更新为"student"
  4. 宿舍空余床位+1

## 测试数据约束
- 宿舍容量：4-6人
- 踢出积分阈值：-100分
- 角色限制：宿舍长必须是宿舍成员
- 床位分配：1到capacity之间的整数
- 唯一性：用户只能在一个宿舍的一个床位上