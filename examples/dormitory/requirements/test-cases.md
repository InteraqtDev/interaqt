# 宿舍管理系统测试用例

## 测试阶段划分
1. **Stage 1: 核心业务逻辑测试**（优先实现）
2. **Stage 2: 权限和业务规则测试**（核心逻辑完成后实现）

---

## Stage 1: 核心业务逻辑测试

### TC001: 创建宿舍（via CreateDormitory Interaction）
- Interaction: CreateDormitory
- 前置条件: 系统中存在管理员用户
- 输入数据: 
  - admin: { id: 'admin-id' }
  - payload: { name: '东区3栋201', capacity: 6 }
- 预期结果:
  1. 创建新的宿舍记录
  2. 宿舍名称为"东区3栋201"
  3. 容量为6人
  4. 自动创建6个床位（床位号1-6）
  5. 所有床位状态为available
  6. currentOccupancy为0

### TC002: 分配用户到宿舍（via AssignUserToDormitory Interaction）
- Interaction: AssignUserToDormitory
- 前置条件: 
  - 存在管理员用户
  - 存在宿舍"东区3栋201"（6个空床位）
  - 存在学生用户"张三"
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { userId: 'zhangsan-id', dormitoryId: 'dorm-201-id' }
- 预期结果:
  1. 建立用户-宿舍关系
  2. 自动分配第一个空闲床位给用户
  3. 床位状态变为occupied
  4. 宿舍currentOccupancy增加到1

### TC003: 指定宿舍长（via AssignDormHead Interaction）
- Interaction: AssignDormHead
- 前置条件:
  - 存在管理员用户
  - 存在宿舍"东区3栋201"
  - 存在已分配到该宿舍的用户"张三"
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { userId: 'zhangsan-id', dormitoryId: 'dorm-201-id' }
- 预期结果:
  1. 用户角色更新为dormHead
  2. 建立宿舍-宿舍长关系

### TC004: 创建扣分规则（via CreateDeductionRule Interaction）
- Interaction: CreateDeductionRule
- 前置条件: 存在管理员用户
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { 
      name: '晚归', 
      description: '晚上11点后回宿舍', 
      points: 5 
    }
- 预期结果:
  1. 创建新的扣分规则
  2. 规则名称为"晚归"
  3. 扣分值为5分
  4. isActive默认为true

### TC005: 宿舍长扣分（via DeductPoints Interaction）
- Interaction: DeductPoints
- 前置条件:
  - 存在宿舍长"张三"
  - 存在同宿舍成员"李四"（初始100分）
  - 存在扣分规则"晚归"（5分）
- 输入数据:
  - dormHead: { id: 'zhangsan-id' }
  - payload: { 
      userId: 'lisi-id', 
      ruleId: 'rule-wangui-id',
      reason: '昨晚11:30回宿舍' 
    }
- 预期结果:
  1. 创建扣分记录
  2. 记录关联到用户和规则
  3. 用户积分更新为95分

### TC006: 申请踢出用户（via RequestUserRemoval Interaction）
- Interaction: RequestUserRemoval
- 前置条件:
  - 存在宿舍长"张三"
  - 存在同宿舍成员"李四"（积分55分，低于60分）
- 输入数据:
  - dormHead: { id: 'zhangsan-id' }
  - payload: { 
      userId: 'lisi-id',
      reason: '多次违反宿舍规定，积分过低' 
    }
- 预期结果:
  1. 创建踢出申请记录
  2. 申请状态为pending
  3. 申请关联到目标用户和申请人

### TC007: 批准踢出申请（via ProcessRemovalRequest Interaction）
- Interaction: ProcessRemovalRequest
- 前置条件:
  - 存在管理员用户
  - 存在待处理的踢出申请
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { 
      requestId: 'request-id',
      action: 'approve' 
    }
- 预期结果:
  1. 申请状态更新为approved
  2. 目标用户状态更新为removed
  3. 用户床位释放（状态变为available）
  4. 宿舍currentOccupancy减少1
  5. 记录处理时间

### TC008: 拒绝踢出申请（via ProcessRemovalRequest Interaction）
- Interaction: ProcessRemovalRequest
- 前置条件:
  - 存在管理员用户
  - 存在待处理的踢出申请
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { 
      requestId: 'request-id-2',
      action: 'reject' 
    }
- 预期结果:
  1. 申请状态更新为rejected
  2. 目标用户状态保持active
  3. 用户床位保持occupied
  4. 记录处理时间

### TC009: 查看宿舍信息（via ViewDormitoryInfo Interaction）
- Interaction: ViewDormitoryInfo
- 前置条件:
  - 存在学生用户"李四"
  - 用户已分配到宿舍
- 输入数据:
  - student: { id: 'lisi-id' }
- 预期结果:
  1. 返回用户所在宿舍信息
  2. 包含宿舍名称、容量、当前入住人数
  3. 包含同宿舍成员列表（不包含积分等隐私信息）

### TC010: 查看个人积分（via ViewMyScore Interaction）
- Interaction: ViewMyScore
- 前置条件:
  - 存在学生用户"李四"（当前95分）
- 输入数据:
  - student: { id: 'lisi-id' }
- 预期结果:
  1. 返回用户当前积分
  2. 返回扣分记录列表
  3. 包含每条记录的原因、扣分值、时间

---

## Stage 2: 权限和业务规则测试

### TC011: 非管理员创建宿舍失败
- Interaction: CreateDormitory
- 前置条件: 存在普通学生用户
- 输入数据:
  - student: { id: 'student-id' }
  - payload: { name: '西区2栋101', capacity: 4 }
- 预期结果:
  1. Interaction返回错误
  2. 错误类型为"权限不足"
  3. 没有创建宿舍记录

### TC012: 创建超出容量限制的宿舍失败
- Interaction: CreateDormitory
- 前置条件: 存在管理员用户
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { name: '北区1栋301', capacity: 8 }
- 预期结果:
  1. Interaction返回错误
  2. 错误信息提示容量必须在4-6之间
  3. 没有创建宿舍记录

### TC013: 重复分配用户到宿舍失败
- Interaction: AssignUserToDormitory
- 前置条件:
  - 用户"王五"已分配到"东区3栋201"
  - 存在另一个宿舍"西区2栋101"
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { userId: 'wangwu-id', dormitoryId: 'dorm-101-id' }
- 预期结果:
  1. Interaction返回错误
  2. 错误信息提示用户已有宿舍分配
  3. 用户仍在原宿舍

### TC014: 宿舍长只能扣本宿舍成员分
- Interaction: DeductPoints
- 前置条件:
  - "张三"是"东区3栋201"的宿舍长
  - "赵六"在"西区2栋101"宿舍
- 输入数据:
  - dormHead: { id: 'zhangsan-id' }
  - payload: { userId: 'zhaoliu-id', ruleId: 'rule-id' }
- 预期结果:
  1. Interaction返回错误
  2. 错误信息提示无权对其他宿舍成员扣分

### TC015: 扣分后积分不能为负
- Interaction: DeductPoints
- 前置条件:
  - 用户"李四"当前积分为3分
  - 存在扣分规则"严重违规"（10分）
- 输入数据:
  - dormHead: { id: 'zhangsan-id' }
  - payload: { userId: 'lisi-id', ruleId: 'rule-yanzhong-id' }
- 预期结果:
  1. 创建扣分记录
  2. 用户积分更新为0（不是-7）

### TC016: 积分高于60分不能申请踢出
- Interaction: RequestUserRemoval
- 前置条件:
  - 用户"王五"积分为75分（高于60分）
- 输入数据:
  - dormHead: { id: 'zhangsan-id' }
  - payload: { userId: 'wangwu-id', reason: '想踢出' }
- 预期结果:
  1. Interaction返回错误
  2. 错误信息提示用户积分高于60分，不能申请踢出

### TC017: 宿舍满员时分配用户失败
- Interaction: AssignUserToDormitory
- 前置条件:
  - 宿舍"东区3栋201"容量6人，已住满6人
  - 存在新用户"钱七"
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { userId: 'qianqi-id', dormitoryId: 'dorm-201-id' }
- 预期结果:
  1. Interaction返回错误
  2. 错误信息提示宿舍已满
  3. 用户未被分配

### TC018: 重复处理踢出申请失败
- Interaction: ProcessRemovalRequest
- 前置条件:
  - 存在已批准的踢出申请
- 输入数据:
  - admin: { id: 'admin-id' }
  - payload: { requestId: 'approved-request-id', action: 'reject' }
- 预期结果:
  1. Interaction返回错误
  2. 错误信息提示申请已处理 