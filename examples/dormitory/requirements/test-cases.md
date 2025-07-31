# 宿舍管理系统测试用例

## 测试阶段说明

**🔴 关键**: 所有测试用例都基于 Interactions，而非直接的实体/关系操作

### Stage 1: 核心业务逻辑测试 (优先实现)
- 基本CRUD操作
- 实体关系建立
- 计算属性验证
- 状态机转换

### Stage 2: 权限控制测试 (核心逻辑完成后实现)
- 角色基础访问控制
- 权限拒绝场景

### Stage 3: 业务规则测试 (权限控制完成后实现)
- 业务约束验证
- 复杂验证场景

---

## Stage 1: 核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员已登录
- **输入数据**: name="A栋101", capacity=4
- **预期结果**:
  1. 创建新的宿舍记录
  2. 宿舍状态为 active
  3. 当前入住人数为 0
  4. 创建时间为当前时间
- **后置验证**: 宿舍出现在系统宿舍列表中

### TC002: 指定宿舍长 (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **前置条件**: 
  - 管理员已登录
  - 宿舍A栋101已存在
  - 用户张三已分配到该宿舍
- **输入数据**: userId="zhang3", dormitoryId="dorm_a101"
- **预期结果**:
  1. 创建宿舍长关系记录
  2. 用户角色更新为 dormHead
  3. 任命时间为当前时间
  4. 关系状态为 active
- **后置验证**: 
  - 张三可以访问宿舍管理功能
  - 宿舍显示张三为宿舍长

### TC003: 分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**:
  - 管理员已登录
  - 宿舍A栋101已存在且有空床位
  - 用户李四尚未分配宿舍
- **输入数据**: userId="li4", dormitoryId="dorm_a101", bedNumber=1
- **预期结果**:
  1. 创建用户-宿舍关系记录
  2. 宿舍当前入住人数自动 +1
  3. 床位1被标记为占用
  4. 分配时间为当前时间
- **后置验证**: 
  - 李四可以查看自己的宿舍信息
  - 宿舍A栋101显示李四在床位1

### TC004: 创建扣分规则 (via CreateScoreRule Interaction)
- **Interaction**: CreateScoreRule
- **前置条件**: 管理员已登录
- **输入数据**: name="晚归", description="超过23:00回宿舍", scoreDeduction=10
- **预期结果**:
  1. 创建新的扣分规则记录
  2. 规则状态为 active
  3. 扣分数值为 10
  4. 创建时间为当前时间
- **后置验证**: 规则出现在扣分规则列表中

### TC005: 对用户扣分 (via DeductUserScore Interaction)
- **Interaction**: DeductUserScore
- **前置条件**:
  - 宿舍长张三已登录
  - 李四在张三管理的宿舍中
  - 晚归规则已存在
  - 李四当前分数为100分
- **输入数据**: userId="li4", ruleId="late_return", reason="23:30回宿舍"
- **预期结果**:
  1. 创建扣分记录
  2. 李四总分数自动更新为90分
  3. 扣分时间为当前时间
  4. 操作员为张三
- **后置验证**: 
  - 李四分数显示为90分
  - 扣分记录显示在李四的记录中

### TC006: 申请踢出用户 (via RequestKickUser Interaction)
- **Interaction**: RequestKickUser
- **前置条件**:
  - 宿舍长张三已登录
  - 李四在张三管理的宿舍中
  - 李四分数为15分(低于20分阈值)
- **输入数据**: userId="li4", reason="多次违规，分数过低"
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态为 pending
  3. 申请时间为当前时间
  4. 申请人为张三
- **后置验证**: 踢出申请出现在管理员待处理列表中

### TC007: 批准踢出申请 (via ApproveKickRequest Interaction)
- **Interaction**: ApproveKickRequest
- **前置条件**:
  - 管理员已登录
  - 存在针对李四的待处理踢出申请
- **输入数据**: requestId="kick_req_001", approved=true, adminNotes="同意踢出"
- **预期结果**:
  1. 申请状态更新为 approved
  2. 李四用户状态更新为 kicked
  3. 李四与宿舍关系状态更新为 inactive
  4. 宿舍当前入住人数自动 -1
  5. 床位1状态更新为可用
  6. 处理时间为当前时间
- **后置验证**:
  - 李四无法访问宿舍相关功能
  - 宿舍A栋101显示床位1空闲

### TC008: 查看宿舍信息 (via GetDormitoryInfo Interaction)
- **Interaction**: GetDormitoryInfo
- **前置条件**: 用户已登录并有权限查看宿舍信息
- **输入数据**: dormitoryId="dorm_a101"
- **预期结果**:
  1. 返回宿舍基本信息
  2. 返回当前住户列表
  3. 返回宿舍长信息
  4. 返回床位使用情况
- **后置验证**: 信息完整且准确

### TC009: 查看用户扣分记录 (via GetUserScoreRecords Interaction)
- **Interaction**: GetUserScoreRecords
- **前置条件**: 宿舍长或管理员已登录
- **输入数据**: userId="li4"
- **预期结果**:
  1. 返回用户所有扣分记录
  2. 记录按时间倒序排列
  3. 包含扣分原因、分数、时间、操作员等信息
- **后置验证**: 记录完整且时间顺序正确

---

## Stage 2: 权限控制测试

### TC201: 非管理员创建宿舍被拒绝 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 普通学生李四已登录
- **输入数据**: name="B栋201", capacity=4
- **预期结果**:
  1. Interaction 返回权限错误
  2. 错误类型为 "permission denied"
  3. 未创建任何宿舍记录
- **注意**: 不要用 storage.create 测试 - 这会绕过权限验证！

### TC202: 非宿舍长申请踢出用户被拒绝 (via RequestKickUser Interaction)
- **Interaction**: RequestKickUser
- **前置条件**: 普通学生李四已登录
- **输入数据**: userId="wang5", reason="不喜欢"
- **预期结果**:
  1. Interaction 返回权限错误
  2. 未创建任何踢出申请记录
- **后置验证**: 踢出申请列表中无新记录

### TC203: 宿舍长对非本宿舍用户扣分被拒绝 (via DeductUserScore Interaction)
- **Interaction**: DeductUserScore
- **前置条件**:
  - 宿舍长张三已登录(管理A栋101)
  - 王五住在B栋201(非张三管理宿舍)
- **输入数据**: userId="wang5", ruleId="late_return", reason="晚归"
- **预期结果**:
  1. Interaction 返回权限错误
  2. 王五分数不变
  3. 未创建扣分记录

### TC204: 普通用户查看其他宿舍信息被拒绝 (via GetDormitoryInfo Interaction)
- **Interaction**: GetDormitoryInfo
- **前置条件**: 李四住在A栋101，尝试查看B栋201信息
- **输入数据**: dormitoryId="dorm_b201"
- **预期结果**:
  1. Interaction 返回权限错误
  2. 未返回任何宿舍信息

---

## Stage 3: 业务规则测试

### TC301: 宿舍满员时分配新用户失败 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **测试阶段**: 业务规则 (核心逻辑完成后实现)
- **前置条件**:
  - 管理员已登录
  - 宿舍A栋101容量为4，已住满4人
  - 新用户王五尚未分配宿舍
- **输入数据**: userId="wang5", dormitoryId="dorm_a101", bedNumber=5
- **预期结果**:
  1. Interaction 返回业务规则错误
  2. 错误信息提示宿舍已满
  3. 未创建任何关系记录
  4. 宿舍入住人数保持4人
- **注意**: 这测试业务规则验证，非核心功能

### TC302: 重复分配用户到宿舍失败 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **测试阶段**: 业务规则
- **前置条件**:
  - 管理员已登录
  - 李四已分配到A栋101的床位1
- **输入数据**: userId="li4", dormitoryId="dorm_b201", bedNumber=1
- **预期结果**:
  1. Interaction 返回业务规则错误
  2. 错误信息提示用户已有宿舍
  3. 李四仍在原宿舍A栋101

### TC303: 分数过高用户踢出申请失败 (via RequestKickUser Interaction)
- **Interaction**: RequestKickUser
- **测试阶段**: 业务规则
- **前置条件**:
  - 宿舍长张三已登录
  - 李四在张三管理的宿舍中
  - 李四当前分数为80分(高于20分阈值)
- **输入数据**: userId="li4", reason="个人不喜欢"
- **预期结果**:
  1. Interaction 返回业务规则错误
  2. 错误信息提示分数过高不允许踢出
  3. 未创建踢出申请记录

### TC304: 创建无效容量宿舍失败 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **测试阶段**: 业务规则
- **前置条件**: 管理员已登录
- **输入数据**: name="C栋301", capacity=10  // 超出4-6范围
- **预期结果**:
  1. Interaction 返回验证错误
  2. 错误信息提示容量必须在4-6之间
  3. 未创建任何宿舍记录

### TC305: 宿舍长尝试踢出自己失败 (via RequestKickUser Interaction)
- **Interaction**: RequestKickUser
- **测试阶段**: 业务规则
- **前置条件**:
  - 宿舍长张三已登录
  - 张三同时是A栋101的宿舍长和住户
- **输入数据**: userId="zhang3", reason="自我惩罚"
- **预期结果**:
  1. Interaction 返回业务规则错误
  2. 错误信息提示不能踢出自己
  3. 未创建踢出申请记录

### TC306: 床位冲突检测 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **测试阶段**: 业务规则
- **前置条件**:
  - 管理员已登录
  - 李四已占用A栋101的床位1
  - 新用户王五尚未分配宿舍
- **输入数据**: userId="wang5", dormitoryId="dorm_a101", bedNumber=1  // 床位已被占用
- **预期结果**:
  1. Interaction 返回业务规则错误
  2. 错误信息提示床位已被占用
  3. 王五未被分配到宿舍
  4. 床位1仍属于李四

---

## 异常情况测试

### TC401: 对不存在用户进行操作
- **Interaction**: DeductUserScore
- **输入数据**: userId="nonexistent", ruleId="late_return"
- **预期结果**: 返回"用户不存在"错误

### TC402: 使用不存在的扣分规则
- **Interaction**: DeductUserScore
- **输入数据**: userId="li4", ruleId="nonexistent_rule"
- **预期结果**: 返回"扣分规则不存在"错误

### TC403: 处理不存在的踢出申请
- **Interaction**: ApproveKickRequest
- **输入数据**: requestId="nonexistent_request"
- **预期结果**: 返回"申请不存在"错误

---

## 测试数据初始化

### 基础用户数据
```javascript
// 管理员
const admin = {
  name: '系统管理员',
  email: 'admin@dormitory.com',
  role: 'admin'
}

// 宿舍长
const dormHead = {
  name: '张三',
  email: 'zhang3@student.com',
  role: 'student'  // 初始为学生，后续指定为宿舍长
}

// 普通学生
const students = [
  { name: '李四', email: 'li4@student.com', role: 'student' },
  { name: '王五', email: 'wang5@student.com', role: 'student' },
  { name: '赵六', email: 'zhao6@student.com', role: 'student' }
]
```

### 基础宿舍数据
```javascript
const dormitories = [
  { name: 'A栋101', capacity: 4 },
  { name: 'A栋102', capacity: 6 },
  { name: 'B栋201', capacity: 4 }
]
```

### 基础扣分规则
```javascript
const scoreRules = [
  { name: '晚归', description: '超过23:00回宿舍', scoreDeduction: 10 },
  { name: '卫生不合格', description: '宿舍卫生检查不合格', scoreDeduction: 15 },
  { name: '噪音扰民', description: '夜间噪音影响他人休息', scoreDeduction: 20 }
]
```