# 宿舍管理系统测试用例

## 测试用例组织结构

### Phase 1: 核心业务逻辑测试 (先实现)
### Phase 2: 权限测试 (核心逻辑完成后实现)  
### Phase 3: 业务规则测试 (核心逻辑完成后实现)

---

## Phase 1: 核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: name="宿舍A", capacity=4
- **预期结果**:
  1. 创建新的宿舍记录
  2. 宿舍状态为active
  3. 当前入住人数为0
  4. 自动创建4个床位 (编号1-4)
  5. 所有床位状态为available
- **后置验证**: 宿舍出现在宿舍列表中，床位可查询

### TC002: 创建无效容量宿舍 (via CreateDormitory Interaction)  
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: name="宿舍B", capacity=3 // 无效容量
- **预期结果**:
  1. Interaction返回错误
  2. 错误类型为"validation failed"
  3. 未创建宿舍记录
  4. 未创建床位记录

### TC003: 指定宿舍长 (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead  
- **前置条件**: 宿舍已存在，目标用户为student角色
- **输入数据**: dormitoryId="dorm1", userId="user1"
- **预期结果**:
  1. 创建宿舍-宿舍长关系记录
  2. 用户角色自动更新为dormHead
  3. 宿舍长可以查询到管理的宿舍
- **后置验证**: 用户角色已变更，关系已建立

### TC004: 分配学生到床位 (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **前置条件**: 宿舍和床位存在且可用，用户为student且未分配
- **输入数据**: userId="student1", bedId="bed1"  
- **预期结果**:
  1. 创建用户-床位关系记录
  2. 创建用户-宿舍关系记录  
  3. 床位状态更新为occupied
  4. 宿舍当前入住人数自动+1
  5. 记录分配时间
- **后置验证**: 关系已建立，计数已更新

### TC005: 分配用户到已占用床位 (via AssignUserToBed Interaction)
- **Interaction**: AssignUserToBed
- **前置条件**: 床位已被其他用户占用
- **输入数据**: userId="student2", bedId="bed1" // 已占用床位
- **预期结果**:
  1. Interaction返回错误
  2. 错误类型为"bed already occupied"
  3. 未创建新的关系记录
  4. 原有关系不受影响

### TC006: 记录纪律扣分 (via RecordDiscipline Interaction)
- **Interaction**: RecordDiscipline
- **前置条件**: 用户已分配到宿舍，记录者有权限
- **输入数据**: targetUserId="student1", reason="晚归", points=5
- **预期结果**:
  1. 创建纪律记录
  2. 用户分数自动减5 (100->95)
  3. 记录创建时间
  4. 记录状态为active
- **后置验证**: 用户分数已更新，记录可查询

### TC007: 发起踢出申请 (via CreateExpelRequest Interaction)
- **Interaction**: CreateExpelRequest  
- **前置条件**: 宿舍长已指定，目标学生分数较低
- **输入数据**: targetUserId="student1", reason="多次违纪"
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态为pending
  3. 记录申请时间
  4. 建立申请者-被申请者关系
- **后置验证**: 申请记录可查询，状态正确

### TC008: 审核踢出申请 (via ReviewExpelRequest Interaction)
- **Interaction**: ReviewExpelRequest
- **前置条件**: 存在pending状态的申请，管理员已登录
- **输入数据**: requestId="req1", decision="approved"
- **预期结果**:
  1. 申请状态更新为approved
  2. 目标用户状态更新为expelled
  3. 释放用户的床位分配
  4. 宿舍当前入住人数自动-1
  5. 记录审核时间
- **后置验证**: 用户状态已变更，床位已释放

### TC009: 拒绝踢出申请 (via ReviewExpelRequest Interaction)  
- **Interaction**: ReviewExpelRequest
- **前置条件**: 存在pending状态的申请，管理员已登录
- **输入数据**: requestId="req1", decision="rejected"
- **预期结果**:
  1. 申请状态更新为rejected
  2. 目标用户状态保持不变
  3. 床位分配保持不变
  4. 记录审核时间
- **后置验证**: 申请状态已更新，其他状态未变

### TC010: 查询宿舍信息 (via GetDormitoryInfo Interaction)
- **Interaction**: GetDormitoryInfo
- **前置条件**: 宿舍存在且有学生入住
- **输入数据**: dormitoryId="dorm1"
- **预期结果**:
  1. 返回宿舍基本信息
  2. 返回床位列表及占用状态
  3. 返回入住学生列表
  4. 返回宿舍长信息
- **后置验证**: 数据完整性和准确性

---

## Phase 2: 权限测试 (核心逻辑完成后实现)

### TC101: 学生尝试创建宿舍 (Permission Denied)
- **Interaction**: CreateDormitory
- **前置条件**: 当前用户角色为student
- **输入数据**: name="宿舍C", capacity=4
- **预期结果**:
  1. Interaction返回权限错误
  2. 未创建宿舍记录
  3. 错误信息明确指出权限不足

### TC102: 非宿舍长记录纪律 (Permission Denied)
- **Interaction**: RecordDiscipline  
- **前置条件**: 记录者不是目标宿舍的宿舍长或管理员
- **输入数据**: targetUserId="student1", reason="晚归", points=5
- **预期结果**:
  1. Interaction返回权限错误
  2. 未创建纪律记录
  3. 用户分数未变化

### TC103: 学生发起踢出申请 (Permission Denied)
- **Interaction**: CreateExpelRequest
- **前置条件**: 申请者角色为student
- **输入数据**: targetUserId="student2", reason="违纪"  
- **预期结果**:
  1. Interaction返回权限错误
  2. 未创建申请记录

### TC104: 宿舍长审核申请 (Permission Denied)
- **Interaction**: ReviewExpelRequest
- **前置条件**: 审核者角色为dormHead
- **输入数据**: requestId="req1", decision="approved"
- **预期结果**:
  1. Interaction返回权限错误  
  2. 申请状态未变化

---

## Phase 3: 业务规则测试 (核心逻辑完成后实现)

### TC201: 超出宿舍容量分配 (Business Rule Violation)
- **Interaction**: AssignUserToBed
- **前置条件**: 宿舍容量为4，已有4人入住
- **输入数据**: userId="student5", bedId="bed5" // 不存在的床位
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指出容量已满
  3. 未创建分配关系

### TC202: 重复分配用户 (Business Rule Violation)
- **Interaction**: AssignUserToBed  
- **前置条件**: 用户已分配到其他床位
- **输入数据**: userId="student1", bedId="bed2" // 用户已在bed1
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指出用户已有床位
  3. 原有分配关系不变

### TC203: 分数过高时申请踢出 (Business Rule Violation)  
- **Interaction**: CreateExpelRequest
- **前置条件**: 目标用户分数为80分 (高于60分阈值)
- **输入数据**: targetUserId="student1", reason="申请踢出"
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指出分数不满足条件
  3. 未创建申请记录

### TC204: 重复申请踢出 (Business Rule Violation)
- **Interaction**: CreateExpelRequest
- **前置条件**: 目标用户已有pending状态申请
- **输入数据**: targetUserId="student1", reason="再次申请"
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指出已有待处理申请
  3. 未创建新申请记录

### TC205: 宿舍长申请踢出自己 (Business Rule Violation)
- **Interaction**: CreateExpelRequest
- **前置条件**: 申请者同时是目标用户
- **输入数据**: targetUserId="dormHead1", reason="自我申请" // 申请者就是dormHead1
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指出不能申请踢出自己
  3. 未创建申请记录

### TC206: 扣分导致负分 (Business Rule Violation)
- **Interaction**: RecordDiscipline
- **前置条件**: 用户当前分数为5分
- **输入数据**: targetUserId="student1", reason="严重违纪", points=10
- **预期结果**:
  1. Interaction返回业务规则错误
  2. 错误信息指出分数不能为负
  3. 用户分数保持5分不变

---

## 测试数据准备

### 基础用户数据
```typescript
const admin = {
  name: 'Admin User',
  email: 'admin@dorm.com', 
  role: 'admin'
}

const dormHead = {
  name: 'Dorm Head',
  email: 'head@dorm.com',
  role: 'dormHead'  
}

const student1 = {
  name: 'Student One',
  email: 'student1@dorm.com',
  role: 'student',
  score: 100
}

const student2 = {
  name: 'Student Two', 
  email: 'student2@dorm.com',
  role: 'student',
  score: 50  // 低分用于踢出测试
}
```

### 基础宿舍数据
```typescript
const dormitory = {
  name: 'Dormitory A',
  capacity: 4,
  status: 'active'
}
```

## 注意事项

1. **测试阶段**: 必须按Phase 1 -> Phase 2 -> Phase 3顺序执行
2. **数据准备**: Phase 1测试中就要使用正确的角色和有效数据
3. **错误处理**: 每个错误场景都要验证具体的错误类型和消息
4. **数据一致性**: 每个测试后都要验证相关数据的完整性
5. **权限分离**: Phase 2测试专门验证权限控制，不混合业务逻辑