# 宿舍管理系统测试用例

## 测试用例组织结构

**🔴 关键原则：所有测试用例必须基于 Interactions，不能基于 Entity/Relation 操作**

### 测试阶段
1. **核心业务逻辑测试** (优先实现)
2. **权限测试** (核心逻辑完成后)
3. **业务规则测试** (核心逻辑完成后)

---

## 第一阶段：核心业务逻辑测试

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: 
  ```json
  {
    "name": "宿舍A栋101",
    "capacity": 4
  }
  ```
- **预期结果**:
  1. 创建新的宿舍记录
  2. 宿舍容量设置为4
  3. 当前入住人数为0
  4. 可用床位数为4
- **验证**: 宿舍出现在系统宿舍列表中

### TC002: 创建宿舍 - 无效数据 (via CreateDormitory Interaction)
- **Interaction**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: 
  ```json
  {
    "name": "",
    "capacity": 10
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为"validation failed"
  3. 没有创建宿舍记录
- **注意**: 不要用 storage.create 测试 - 它会绕过验证！

### TC003: 指定宿舍长 (via AssignDormHead Interaction)
- **Interaction**: AssignDormHead
- **前置条件**: 宿舍和具有 'student' 角色的用户已存在
- **输入数据**:
  ```json
  {
    "userId": "user123",
    "dormitoryId": "dorm101"
  }
  ```
- **预期结果**:
  1. 创建宿舍长关系记录
  2. 用户角色自动更新为 'dormHead'
  3. 宿舍的 dormHead 属性指向该用户
  4. 任命时间记录为当前时间
- **验证**: 用户出现在宿舍长列表中

### TC004: 分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **Interaction**: AssignUserToDormitory
- **前置条件**: 宿舍有可用床位，用户未被分配到其他宿舍
- **输入数据**:
  ```json
  {
    "userId": "student123",
    "dormitoryId": "dorm101",
    "bedNumber": 1
  }
  ```
- **预期结果**:
  1. 创建用户-宿舍关系记录
  2. 宿舍当前入住人数自动 +1
  3. 宿舍可用床位自动 -1
  4. 用户的 dormitory 属性指向该宿舍
  5. 分配时间记录为当前时间
- **验证**: 用户出现在宿舍成员列表中

### TC005: 创建扣分规则 (via CreateScoreRule Interaction)
- **Interaction**: CreateScoreRule
- **前置条件**: 管理员用户已登录
- **输入数据**:
  ```json
  {
    "name": "晚归",
    "description": "超过晚上11点回宿舍",
    "scoreDeduction": 10
  }
  ```
- **预期结果**:
  1. 创建新的扣分规则记录
  2. 规则状态为 'active'
  3. 扣分数值设置为10
- **验证**: 规则出现在扣分规则列表中

### TC006: 记录违规行为 (via RecordViolation Interaction)
- **Interaction**: RecordViolation
- **前置条件**: 宿舍长已指定，学生已分配到宿舍，扣分规则已存在
- **输入数据**:
  ```json
  {
    "userId": "student123",
    "ruleId": "rule_late_return",
    "description": "11:30分回宿舍"
  }
  ```
- **预期结果**:
  1. 创建违规记录
  2. 用户积分自动减少对应分数
  3. 违规记录关联到用户和规则
  4. 记录时间为当前时间
- **验证**: 用户积分变化，违规记录出现在用户记录中

### TC007: 申请踢出用户 (via RequestKickout Interaction)
- **Interaction**: RequestKickout
- **前置条件**: 宿舍长管理的宿舍中有积分较低的学生
- **输入数据**:
  ```json
  {
    "targetUserId": "student123",
    "reason": "多次违规，积分过低"
  }
  ```
- **预期结果**:
  1. 创建踢出申请记录
  2. 申请状态为 'pending'
  3. 申请时间记录为当前时间
  4. 申请人为当前宿舍长
- **验证**: 申请出现在待处理申请列表中

### TC008: 处理踢出申请 - 批准 (via ProcessKickoutRequest Interaction)
- **Interaction**: ProcessKickoutRequest
- **前置条件**: 存在待处理的踢出申请，管理员已登录
- **输入数据**:
  ```json
  {
    "requestId": "request123",
    "decision": "approved",
    "adminComment": "违规行为属实，同意踢出"
  }
  ```
- **预期结果**:
  1. 申请状态更新为 'approved'
  2. 用户状态更新为 'kicked'
  3. 用户从宿舍中移除
  4. 宿舍可用床位自动 +1
  5. 处理时间记录为当前时间
- **验证**: 用户不再出现在宿舍成员列表中

### TC009: 处理踢出申请 - 拒绝 (via ProcessKickoutRequest Interaction)
- **Interaction**: ProcessKickoutRequest
- **前置条件**: 存在待处理的踢出申请，管理员已登录
- **输入数据**:
  ```json
  {
    "requestId": "request123",
    "decision": "rejected",
    "adminComment": "证据不足，不予批准"
  }
  ```
- **预期结果**:
  1. 申请状态更新为 'rejected'
  2. 用户状态保持不变
  3. 用户仍在原宿舍中
  4. 处理时间记录为当前时间
- **验证**: 用户仍在宿舍成员列表中

### TC010: 更新扣分规则 (via UpdateScoreRule Interaction)
- **Interaction**: UpdateScoreRule
- **前置条件**: 扣分规则已存在，管理员已登录
- **输入数据**:
  ```json
  {
    "ruleId": "rule123",
    "name": "严重晚归",
    "scoreDeduction": 20,
    "isActive": true
  }
  ```
- **预期结果**:
  1. 规则名称更新为"严重晚归"
  2. 扣分数值更新为20
  3. 规则保持激活状态
- **验证**: 规则信息在列表中显示更新后的内容

---

## 第二阶段：权限测试 (核心逻辑完成后实现)

### TC011: 权限测试 - 非管理员创建宿舍 (via CreateDormitory Interaction)
- **测试阶段**: 权限测试
- **Interaction**: CreateDormitory
- **前置条件**: 普通学生用户已登录
- **输入数据**: 有效的宿舍数据
- **预期结果**:
  1. Interaction 返回权限错误
  2. 错误信息指示权限不足
  3. 没有创建宿舍记录
- **注意**: 这是权限验证测试，不是核心功能测试

### TC012: 权限测试 - 非宿舍长记录违规 (via RecordViolation Interaction)
- **测试阶段**: 权限测试
- **Interaction**: RecordViolation
- **前置条件**: 普通学生尝试记录其他学生违规
- **输入数据**: 有效的违规数据
- **预期结果**:
  1. Interaction 返回权限错误
  2. 没有创建违规记录
  3. 目标用户积分保持不变

### TC013: 权限测试 - 跨宿舍管理 (via RecordViolation Interaction)
- **测试阶段**: 权限测试
- **Interaction**: RecordViolation
- **前置条件**: 宿舍长A尝试管理宿舍B的学生
- **输入数据**: 其他宿舍学生的违规数据
- **预期结果**:
  1. Interaction 返回权限错误
  2. 错误信息指示无权管理其他宿舍

---

## 第三阶段：业务规则测试 (核心逻辑完成后实现)

### TC014: 业务规则测试 - 床位容量限制 (via AssignUserToDormitory Interaction)
- **测试阶段**: 业务规则测试
- **Interaction**: AssignUserToDormitory
- **前置条件**: 宿舍床位已满
- **输入数据**: 尝试分配新用户到已满宿舍
- **预期结果**:
  1. Interaction 返回业务规则违反错误
  2. 错误信息指示宿舍床位已满
  3. 用户未被分配到宿舍
- **注意**: 这测试业务规则验证，不是核心分配功能

### TC015: 业务规则测试 - 重复分配用户 (via AssignUserToDormitory Interaction)
- **测试阶段**: 业务规则测试
- **Interaction**: AssignUserToDormitory
- **前置条件**: 用户已被分配到其他宿舍
- **输入数据**: 尝试将已分配用户分配到新宿舍
- **预期结果**:
  1. Interaction 返回业务规则违反错误
  2. 错误信息指示用户已有宿舍分配
  3. 用户的宿舍分配保持不变

### TC016: 业务规则测试 - 积分过低踢出限制 (via RequestKickout Interaction)
- **测试阶段**: 业务规则测试
- **Interaction**: RequestKickout
- **前置条件**: 目标用户积分高于60分
- **输入数据**: 尝试申请踢出高积分用户
- **预期结果**:
  1. Interaction 返回业务规则违反错误
  2. 错误信息指示用户积分未达到踢出标准
  3. 没有创建踢出申请

### TC017: 业务规则测试 - 重复踢出申请 (via RequestKickout Interaction)
- **测试阶段**: 业务规则测试
- **Interaction**: RequestKickout
- **前置条件**: 同一用户已有待处理的踢出申请
- **输入数据**: 尝试为同一用户再次申请踢出
- **预期结果**:
  1. Interaction 返回业务规则违反错误
  2. 错误信息指示用户已有待处理申请
  3. 没有创建新的踢出申请

### TC018: 业务规则测试 - 无效床位号 (via AssignUserToDormitory Interaction)
- **测试阶段**: 业务规则测试
- **Interaction**: AssignUserToDormitory
- **前置条件**: 宿舍容量为4
- **输入数据**: 床位号为5的分配请求
- **预期结果**:
  1. Interaction 返回业务规则违反错误
  2. 错误信息指示床位号超出范围
  3. 用户未被分配

### TC019: 业务规则测试 - 已踢出用户重新分配 (via AssignUserToDormitory Interaction)
- **测试阶段**: 业务规则测试
- **Interaction**: AssignUserToDormitory
- **前置条件**: 用户状态为 'kicked'
- **输入数据**: 尝试为已踢出用户分配宿舍
- **预期结果**:
  1. Interaction 返回业务规则违反错误
  2. 错误信息指示用户已被踢出
  3. 用户未被重新分配

---

## 复合场景测试

### TC020: 完整流程测试 - 从分配到踢出
- **场景**: 完整的用户生命周期管理
- **步骤**:
  1. CreateDormitory - 创建宿舍
  2. AssignDormHead - 指定宿舍长
  3. AssignUserToDormitory - 分配学生
  4. CreateScoreRule - 创建扣分规则
  5. RecordViolation - 多次记录违规(使积分降到60以下)
  6. RequestKickout - 申请踢出
  7. ProcessKickoutRequest - 批准申请
- **验证**: 整个流程顺利执行，用户最终被踢出

### TC021: 边界条件测试 - 恰好60分
- **场景**: 测试积分恰好为60分时的行为
- **步骤**:
  1. 用户初始积分100分
  2. 记录违规使积分恰好降到60分
  3. 尝试申请踢出
- **预期**: 积分为60分时不能申请踢出（需要低于60分）

## 测试数据准备

### 标准测试用户
```json
{
  "admin": {
    "name": "系统管理员",
    "email": "admin@dormitory.com",
    "role": "admin"
  },
  "dormHead": {
    "name": "宿舍长张三",
    "email": "zhangsan@dormitory.com", 
    "role": "student"  // 指定为宿舍长后会变为 dormHead
  },
  "student1": {
    "name": "学生李四",
    "email": "lisi@dormitory.com",
    "role": "student"
  },
  "student2": {
    "name": "学生王五",
    "email": "wangwu@dormitory.com",
    "role": "student"
  }
}
```

### 标准测试宿舍
```json
{
  "dormA": {
    "name": "A栋101",
    "capacity": 4
  },
  "dormB": {
    "name": "B栋201", 
    "capacity": 6
  }
}
```

### 标准扣分规则
```json
{
  "lateReturn": {
    "name": "晚归",
    "description": "超过晚上11点回宿舍",
    "scoreDeduction": 10
  },
  "messyRoom": {
    "name": "内务不整",
    "description": "宿舍内务检查不合格",
    "scoreDeduction": 5
  },
  "noise": {
    "name": "噪音扰民",
    "description": "在休息时间制造噪音",
    "scoreDeduction": 15
  }
}
```

## 测试执行注意事项

1. **Stage 1 测试原则**:
   - 始终使用正确的用户角色和有效数据
   - 即使权限未实现，也要创建具有适当角色的用户
   - 使用符合未来业务规则的现实数据
   - 确保Stage 1测试在Stage 2实现后仍能通过

2. **Stage 2 测试原则**:
   - 不要修改Stage 1测试用例
   - 编写新的测试用例专门测试权限和业务规则
   - Stage 1和Stage 2的测试文件都应该在Stage 2实现后通过

3. **错误处理测试**:
   - 所有无效输入都应该通过Interaction测试
   - 验证返回的错误类型和消息
   - 确保无效操作不会改变系统状态