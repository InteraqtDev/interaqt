# 宿舍管理系统测试用例

## 测试用例分类
测试用例按照实现阶段分为三个阶段：
1. **核心业务逻辑测试** (Stage 1 - 优先实现)
2. **权限测试** (Stage 2 - 核心逻辑完成后实现)
3. **业务规则测试** (Stage 2 - 核心逻辑完成后实现)

---

## 阶段一：核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: 
  - name: "宿舍A"
  - capacity: 4
- **预期结果**:
  1. 创建新的宿舍记录
  2. 宿舍容量设置为4
  3. 初始已占用床位数为0
  4. 自动创建4个床位，状态为available
- **后置验证**: 宿舍出现在宿舍列表中，包含4个可用床位

### TC002: 指定宿舍长 (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **前置条件**: 
  - 宿舍已存在
  - 目标用户为学生角色
- **输入数据**:
  - userId: "user123"
  - dormitoryId: "dorm001"
- **预期结果**:
  1. 创建宿舍长关系记录
  2. 用户角色更新为dormHead
  3. 建立用户与宿舍的管理关系
- **后置验证**: 用户可以查看和管理该宿舍

### TC003: 分配用户到宿舍床位 (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **前置条件**: 
  - 宿舍存在且有空床位
  - 用户未被分配到其他宿舍
- **输入数据**:
  - userId: "student001"
  - dormitoryId: "dorm001"
  - bedNumber: 1
- **预期结果**:
  1. 创建用户-床位关系
  2. 创建用户-宿舍关系
  3. 床位状态更新为occupied
  4. 宿舍已占用床位数+1
- **后置验证**: 用户出现在宿舍成员列表中，床位显示为已占用

### TC004: 记录扣分 (via RecordScore Interaction)
- **Interaction**: RecordScore
- **前置条件**: 
  - 宿舍长已登录
  - 目标学生在该宿舍中
- **输入数据**:
  - targetUserId: "student001"
  - reason: "晚归"
  - points: 10
- **预期结果**:
  1. 创建扣分记录
  2. 记录扣分原因和分数
  3. 设置扣分时间为当前时间
  4. 用户总扣分自动累加
- **后置验证**: 扣分记录出现在用户的扣分历史中

### TC005: 申请踢出用户 (via RequestKickout Interaction)
- **Interaction**: RequestKickout
- **前置条件**: 
  - 宿舍长已登录
  - 目标学生扣分达到阈值(100分)
- **输入数据**:
  - targetUserId: "student001"
  - reason: "累计扣分达到100分"
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态设置为pending
  3. 记录申请时间
  4. 关联申请人、被申请人
- **后置验证**: 踢出申请出现在待处理列表中

### TC006: 处理踢出申请 (via ProcessKickoutRequest Interaction)
- **Interaction**: ProcessKickoutRequest
- **前置条件**: 
  - 管理员已登录
  - 存在待处理的踢出申请
- **输入数据**:
  - requestId: "request001"
  - decision: "approved"
  - note: "同意踢出申请"
- **预期结果**:
  1. 申请状态更新为approved
  2. 设置处理时间
  3. 用户被移出宿舍
  4. 床位状态更新为available
  5. 宿舍已占用床位数-1
- **后置验证**: 用户不再出现在宿舍成员列表中，床位重新可用

### TC007: 查询宿舍信息 (via GetDormitoryInfo Interaction)
- **Interaction**: GetDormitoryInfo
- **前置条件**: 宿舍存在
- **输入数据**: dormitoryId: "dorm001"
- **预期结果**:
  1. 返回宿舍基本信息
  2. 返回床位占用情况
  3. 返回宿舍成员列表
  4. 返回宿舍长信息
- **后置验证**: 信息准确完整

### TC008: 查询用户扣分记录 (via GetUserScoreHistory Interaction)
- **Interaction**: GetUserScoreHistory
- **前置条件**: 用户存在扣分记录
- **输入数据**: userId: "student001"
- **预期结果**:
  1. 返回用户所有扣分记录
  2. 按时间倒序排列
  3. 包含扣分原因、分数、时间
  4. 返回总扣分
- **后置验证**: 扣分历史完整准确

---

## 阶段二：权限测试

### TC101: 非管理员创建宿舍 (via CreateDormitory Interaction)
- **测试阶段**: 权限测试 (核心逻辑完成后实现)
- **Interaction**: CreateDormitory
- **前置条件**: 非管理员用户(学生)已登录
- **输入数据**: name: "宿舍B", capacity: 4
- **预期结果**:
  1. Interaction返回权限错误
  2. 错误类型为"permission denied"
  3. 没有创建宿舍记录
- **注意**: 不要用storage.create测试 - 它会绕过权限验证！

### TC102: 非宿舍长给学生扣分 (via RecordScore Interaction)
- **测试阶段**: 权限测试 (核心逻辑完成后实现)
- **Interaction**: RecordScore
- **前置条件**: 普通学生用户已登录
- **输入数据**: targetUserId: "student002", reason: "迟到", points: 5
- **预期结果**:
  1. Interaction返回权限错误
  2. 没有创建扣分记录
  3. 目标用户扣分不变

### TC103: 宿舍长跨宿舍扣分 (via RecordScore Interaction)
- **测试阶段**: 权限测试 (核心逻辑完成后实现)
- **Interaction**: RecordScore
- **前置条件**: 
  - 宿舍长A管理宿舍A
  - 目标学生在宿舍B
- **输入数据**: targetUserId: "studentInDormB", reason: "违规", points: 10
- **预期结果**:
  1. Interaction返回权限错误
  2. 没有创建扣分记录

### TC104: 非管理员处理踢出申请 (via ProcessKickoutRequest Interaction)
- **测试阶段**: 权限测试 (核心逻辑完成后实现)
- **Interaction**: ProcessKickoutRequest
- **前置条件**: 宿舍长用户已登录
- **输入数据**: requestId: "request001", decision: "approved"
- **预期结果**:
  1. Interaction返回权限错误
  2. 申请状态保持不变

---

## 阶段三：业务规则测试

### TC201: 创建超出容量限制的宿舍 (via CreateDormitory Interaction)
- **测试阶段**: 业务规则测试 (核心逻辑完成后实现)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: name: "宿舍C", capacity: 10  // 超出4-6范围
- **预期结果**:
  1. Interaction返回验证错误
  2. 错误信息指示容量超出允许范围
  3. 没有创建宿舍记录

### TC202: 重复分配用户到床位 (via AssignUserToBed Interaction)
- **测试阶段**: 业务规则测试 (核心逻辑完成后实现)
- **Interaction**: AssignUserToBed
- **前置条件**: 用户已被分配到某个床位
- **输入数据**: userId: "student001", dormitoryId: "dorm002", bedNumber: 1
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示用户已被分配
  3. 用户分配关系保持不变

### TC203: 分配到已占用床位 (via AssignUserToBed Interaction)
- **测试阶段**: 业务规则测试 (核心逻辑完成后实现)
- **Interaction**: AssignUserToBed
- **前置条件**: 目标床位已被其他用户占用
- **输入数据**: userId: "student002", dormitoryId: "dorm001", bedNumber: 1  // 已占用
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示床位已被占用
  3. 没有创建新的分配关系

### TC204: 扣分不足时申请踢出 (via RequestKickout Interaction)
- **测试阶段**: 业务规则测试 (核心逻辑完成后实现)
- **Interaction**: RequestKickout
- **前置条件**: 
  - 宿舍长已登录
  - 目标学生扣分只有50分(未达到100分阈值)
- **输入数据**: targetUserId: "student003", reason: "申请踢出"
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示扣分未达到阈值
  3. 没有创建踢出申请

### TC205: 重复申请踢出同一用户 (via RequestKickout Interaction)
- **测试阶段**: 业务规则测试 (核心逻辑完成后实现)
- **Interaction**: RequestKickout
- **前置条件**: 
  - 宿舍长已登录
  - 目标用户已有pending状态的踢出申请
- **输入数据**: targetUserId: "student001", reason: "再次申请踢出"
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指示已存在待处理申请
  3. 没有创建重复申请

### TC206: 负数扣分测试 (via RecordScore Interaction)
- **测试阶段**: 业务规则测试 (核心逻辑完成后实现)
- **Interaction**: RecordScore
- **前置条件**: 宿舍长已登录
- **输入数据**: targetUserId: "student001", reason: "测试", points: -5  // 负数
- **预期结果**:
  1. Interaction返回验证错误
  2. 错误信息指示扣分必须为正数
  3. 没有创建扣分记录

---

## 测试执行说明

### Stage 1 测试执行要点：
- **使用正确的用户角色和有效数据**，即使权限尚未实现
- 创建具有适当角色的用户(admin, dormHead, student)
- 使用符合未来业务规则的有效数据
- 确保Stage 1测试在Stage 2实现后仍能通过

### Stage 2 测试执行要点：
- **不要修改Stage 1测试用例** - 它们应该继续通过
- **编写新的测试用例**专门验证权限和业务规则
- Stage 1测试验证核心功能使用有效输入
- Stage 2测试验证无效输入被正确拒绝
- **两套测试文件都应该在Stage 2实现后通过**