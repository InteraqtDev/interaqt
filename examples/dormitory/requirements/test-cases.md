# 宿舍管理系统测试用例

## 重要说明
**🔴 CRITICAL: 所有测试用例必须基于 Interactions，不能基于 Entity/Relation 操作**

## TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**: 
  ```json
  {
    "name": "A101",
    "building": "A栋",
    "floor": 1,
    "capacity": 4
  }
  ```
- **预期结果**:
  1. 创建新的宿舍记录
  2. 自动创建4个床位记录
  3. 宿舍当前人数为0
  4. 创建时间为当前时间
- **后置验证**: 宿舍出现在宿舍列表中

## TC002: 创建宿舍 - 无效数据 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**: 
  ```json
  {
    "name": "",
    "building": "",
    "capacity": 10
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为 "validation failed"
  3. 没有创建宿舍记录
  4. 没有创建床位记录
- **注意**: 不要用 storage.create 测试 - 会绕过验证！

## TC003: 任命宿舍长 (via AppointDormLeader Interaction)
- **Interaction**: AppointDormLeader
- **前置条件**: 管理员已登录，宿舍和用户已存在，用户已分配到该宿舍
- **输入数据**: 
  ```json
  {
    "dormitoryId": "dorm123",
    "userId": "user456"
  }
  ```
- **预期结果**:
  1. 用户角色更新为 "dormLeader"
  2. 创建宿舍长关系记录
  3. 任命时间为当前时间
  4. 任命人为当前管理员
- **异常场景**: 用户不在该宿舍应该失败

## TC004: 分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**: 管理员已登录，宿舍和用户已存在，宿舍有空床位
- **输入数据**: 
  ```json
  {
    "userId": "user123",
    "dormitoryId": "dorm456",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. 创建用户-宿舍关系记录
  2. 创建用户-床位关系记录
  3. 床位状态更新为已占用
  4. 宿舍当前人数自动 +1
  5. 分配时间为当前时间
- **异常场景**: 重复分配同一用户应该失败

## TC005: 分配用户到已满宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**: 管理员已登录，宿舍已满员
- **输入数据**: 
  ```json
  {
    "userId": "user789",
    "dormitoryId": "dormFull",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为 "dormitory full"
  3. 没有创建任何关系记录
  4. 宿舍人数不变
- **后置验证**: 用户仍然没有宿舍分配

## TC006: 记录扣分 (via RecordScoreDeduction Interaction)
- **Interaction**: RecordScoreDeduction
- **前置条件**: 宿舍长已登录，目标用户在同一宿舍
- **输入数据**: 
  ```json
  {
    "userId": "user123",
    "reason": "晚归",
    "score": 10
  }
  ```
- **预期结果**:
  1. 创建扣分记录
  2. 用户积分自动 -10
  3. 记录时间为当前时间
  4. 记录人为当前宿舍长
- **异常场景**: 非宿舍长用户尝试记录扣分应该失败

## TC007: 记录扣分 - 权限不足 (via RecordScoreDeduction Interaction)
- **Interaction**: RecordScoreDeduction
- **前置条件**: 普通用户已登录
- **输入数据**: 
  ```json
  {
    "userId": "user456",
    "reason": "违规",
    "score": 5
  }
  ```
- **预期结果**:
  1. Interaction 返回权限错误
  2. 错误类型为 "permission denied"
  3. 没有创建扣分记录
  4. 用户积分不变

## TC008: 创建踢出申请 (via CreateKickoutRequest Interaction)
- **Interaction**: CreateKickoutRequest
- **前置条件**: 宿舍长已登录，目标用户积分低于20
- **输入数据**: 
  ```json
  {
    "userId": "user123",
    "reason": "多次违规，积分过低"
  }
  ```
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态为 "pending"
  3. 申请时间为当前时间
  4. 申请人为当前宿舍长
- **异常场景**: 目标用户积分不够低应该失败

## TC009: 处理踢出申请 - 批准 (via ProcessKickoutRequest Interaction)
- **Interaction**: ProcessKickoutRequest
- **前置条件**: 管理员已登录，踢出申请存在且状态为 pending
- **输入数据**: 
  ```json
  {
    "requestId": "req123",
    "decision": "approved",
    "comment": "同意踢出"
  }
  ```
- **预期结果**:
  1. 申请状态更新为 "approved"
  2. 处理时间为当前时间
  3. 移除用户的宿舍分配关系
  4. 移除用户的床位分配关系
  5. 床位状态更新为未占用
  6. 宿舍当前人数自动 -1
- **后置验证**: 用户不再属于任何宿舍

## TC010: 处理踢出申请 - 拒绝 (via ProcessKickoutRequest Interaction)
- **Interaction**: ProcessKickoutRequest
- **前置条件**: 管理员已登录，踢出申请存在且状态为 pending
- **输入数据**: 
  ```json
  {
    "requestId": "req456",
    "decision": "rejected",
    "comment": "情节较轻，给予警告"
  }
  ```
- **预期结果**:
  1. 申请状态更新为 "rejected"
  2. 处理时间为当前时间
  3. 用户宿舍分配关系不变
  4. 用户床位分配关系不变
- **后置验证**: 用户仍然在原宿舍

## TC011: 查看我的宿舍 (via ViewMyDormitory Interaction)
- **Interaction**: ViewMyDormitory
- **前置条件**: 普通用户已登录且已分配宿舍
- **输入数据**: 无
- **预期结果**:
  1. 返回用户所在宿舍信息
  2. 包括宿舍基本信息
  3. 包括床位信息
  4. 包括室友列表（不包含详细个人信息）
- **权限验证**: 只能查看自己的宿舍

## TC012: 查看我的积分 (via ViewMyScore Interaction)
- **Interaction**: ViewMyScore
- **前置条件**: 用户已登录
- **输入数据**: 无
- **预期结果**:
  1. 返回用户当前积分
  2. 返回扣分记录列表
  3. 按时间倒序排列
- **权限验证**: 只能查看自己的积分

## TC013: 查看宿舍成员 (via ViewDormitoryMembers Interaction)
- **Interaction**: ViewDormitoryMembers
- **前置条件**: 宿舍长已登录
- **输入数据**: 无
- **预期结果**:
  1. 返回所在宿舍所有成员信息
  2. 包括成员基本信息
  3. 包括成员积分信息
  4. 包括床位分配信息
- **权限验证**: 只有宿舍长可以查看详细成员信息

## TC014: 查看所有宿舍 (via ViewAllDormitories Interaction)
- **Interaction**: ViewAllDormitories
- **前置条件**: 管理员已登录
- **输入数据**: 无
- **预期结果**:
  1. 返回所有宿舍列表
  2. 包括宿舍基本信息
  3. 包括入住情况统计
  4. 包括宿舍长信息
- **权限验证**: 只有管理员可以查看所有宿舍

## TC015: 查看所有用户 (via ViewAllUsers Interaction)
- **Interaction**: ViewAllUsers
- **前置条件**: 管理员已登录
- **输入数据**: 无
- **预期结果**:
  1. 返回所有用户列表
  2. 包括用户基本信息
  3. 包括宿舍分配情况
  4. 包括积分信息
- **权限验证**: 只有管理员可以查看所有用户

## TC016: 无权限用户尝试管理员操作 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 普通用户已登录
- **输入数据**: 
  ```json
  {
    "name": "B101",
    "building": "B栋",
    "floor": 1,
    "capacity": 4
  }
  ```
- **预期结果**:
  1. Interaction 返回权限错误
  2. 错误类型为 "permission denied"
  3. 没有创建宿舍记录
  4. 没有创建床位记录

## TC017: 宿舍长尝试管理其他宿舍 (via RecordScoreDeduction Interaction)
- **Interaction**: RecordScoreDeduction
- **前置条件**: 宿舍长已登录，目标用户在其他宿舍
- **输入数据**: 
  ```json
  {
    "userId": "userInOtherDorm",
    "reason": "违规",
    "score": 5
  }
  ```
- **预期结果**:
  1. Interaction 返回权限错误
  2. 错误类型为 "permission denied"
  3. 没有创建扣分记录
  4. 用户积分不变

## TC018: 积分不足时的踢出申请 (via CreateKickoutRequest Interaction)
- **Interaction**: CreateKickoutRequest
- **前置条件**: 宿舍长已登录，目标用户积分高于20
- **输入数据**: 
  ```json
  {
    "userId": "userHighScore",
    "reason": "尝试踢出高积分用户"
  }
  ```
- **预期结果**:
  1. Interaction 返回业务逻辑错误
  2. 错误类型为 "score too high"
  3. 没有创建踢出申请记录
- **业务验证**: 只有积分低于20的用户才能被申请踢出

## TC019: 重复分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**: 管理员已登录，用户已分配到其他宿舍
- **输入数据**: 
  ```json
  {
    "userId": "assignedUser",
    "dormitoryId": "dorm456",
    "bedNumber": 2
  }
  ```
- **预期结果**:
  1. Interaction 返回业务逻辑错误
  2. 错误类型为 "user already assigned"
  3. 没有创建新的分配关系
  4. 原有分配关系不变

## TC020: 分配用户到已被占用的床位 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**: 管理员已登录，目标床位已被占用
- **输入数据**: 
  ```json
  {
    "userId": "newUser",
    "dormitoryId": "dorm789",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. Interaction 返回业务逻辑错误
  2. 错误类型为 "bed already occupied"
  3. 没有创建分配关系
  4. 床位占用状态不变

## 测试执行优先级

### 高优先级 (必须通过)
- TC001-TC005: 基本宿舍管理功能
- TC006-TC010: 纪律管理功能
- TC016-TC017: 基本权限控制

### 中优先级 (重要功能)
- TC011-TC015: 查询功能
- TC018-TC020: 边界情况和异常处理

### 测试环境要求
- 测试数据库独立于生产环境
- 每个测试用例执行前重置数据
- 模拟不同角色的用户登录状态
- 验证所有业务规则和权限控制

### 测试成功标准
- 所有 Interaction 调用返回预期结果
- 所有权限控制生效
- 所有业务规则得到验证
- 所有数据变更符合预期
- 所有异常情况得到正确处理