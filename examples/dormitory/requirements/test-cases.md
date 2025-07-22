# 宿舍管理系统测试用例

## 阶段说明
测试用例分为两个阶段：
- **Stage 1**: 核心业务逻辑测试（不包含权限和业务规则验证）
- **Stage 2**: 权限和业务规则测试（在Stage 1完成后实施）

---

## Stage 1: 核心业务逻辑测试用例

### TC001: 创建宿舍 (via CreateDormitory Interaction)
- **交互**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: 
  ```json
  {
    "user": admin,
    "payload": { "name": "宿舍A", "capacity": 4 }
  }
  ```
- **预期结果**:
  1. 成功创建新宿舍记录
  2. 宿舍名称为"宿舍A"
  3. 宿舍容量为4
  4. 当前入住人数为0
  5. 创建时间为当前时间
- **后置验证**: 宿舍出现在系统宿舍列表中

### TC002: 分配用户到宿舍 (via AssignUserToDormitory Interaction)
- **交互**: AssignUserToDormitory
- **前置条件**: 
  - 管理员用户已登录
  - 宿舍已创建且有空床位
  - 目标用户存在且未被分配宿舍
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": { 
      "userId": student.id,
      "dormitoryId": dormitory.id,
      "bedNumber": 1
    }
  }
  ```
- **预期结果**:
  1. 创建新的宿舍分配记录
  2. 用户被分配到指定宿舍的指定床位
  3. 宿舍当前入住人数+1
  4. 分配时间为当前时间
  5. 分配者为当前管理员
- **后置验证**: 用户宿舍分配关系建立成功

### TC003: 提升用户为宿舍长 (via PromoteToDormHead Interaction)
- **交互**: PromoteToDormHead  
- **前置条件**:
  - 管理员用户已登录
  - 目标用户已被分配到宿舍
  - 目标用户当前不是宿舍长
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": { "userId": user.id }
  }
  ```
- **预期结果**:
  1. 用户角色更新为'dormHead'
  2. 用户保持在原宿舍分配
  3. 更新操作成功完成
- **后置验证**: 用户角色确认为宿舍长

### TC004: 记录违规行为 (via RecordViolation Interaction)
- **交互**: RecordViolation
- **前置条件**:
  - 宿舍长用户已登录
  - 目标学生与宿舍长在同一宿舍
- **输入数据**:
  ```json
  {
    "user": dormHead,
    "payload": {
      "targetUserId": student.id,
      "violationType": "晚归",
      "description": "23:30回宿舍",
      "scoreDeduction": 5
    }
  }
  ```
- **预期结果**:
  1. 创建新的违规记录
  2. 学生分数自动减少5分（100 -> 95）
  3. 违规记录包含完整信息
  4. 记录时间为当前时间
  5. 记录者为当前宿舍长
- **后置验证**: 学生分数更新，违规记录保存

### TC005: 申请踢出用户 (via RequestKickout Interaction)
- **交互**: RequestKickout
- **前置条件**:
  - 宿舍长用户已登录
  - 目标学生与宿舍长在同一宿舍
  - 目标学生分数较低（用于测试，暂不验证分数限制）
- **输入数据**:
  ```json
  {
    "user": dormHead,
    "payload": {
      "targetUserId": student.id,
      "reason": "多次违规，分数过低"
    }
  }
  ```
- **预期结果**:
  1. 创建新的踢出申请记录
  2. 申请状态为'pending'
  3. 申请时间为当前时间
  4. 申请人为当前宿舍长
  5. 目标用户和宿舍信息正确
- **后置验证**: 踢出申请记录创建成功

### TC006: 处理踢出申请 - 同意 (via ProcessKickoutRequest Interaction)
- **交互**: ProcessKickoutRequest
- **前置条件**:
  - 管理员用户已登录
  - 存在pending状态的踢出申请
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": {
      "requestId": kickoutRequest.id,
      "decision": "approved"
    }
  }
  ```
- **预期结果**:
  1. 踢出申请状态更新为'approved'
  2. 目标用户的宿舍分配记录被移除
  3. 宿舍当前入住人数-1
  4. 处理时间为当前时间
  5. 处理者为当前管理员
- **后置验证**: 用户被成功移出宿舍

### TC007: 处理踢出申请 - 拒绝 (via ProcessKickoutRequest Interaction)
- **交互**: ProcessKickoutRequest
- **前置条件**:
  - 管理员用户已登录
  - 存在pending状态的踢出申请
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": {
      "requestId": kickoutRequest.id,
      "decision": "rejected"
    }
  }
  ```
- **预期结果**:
  1. 踢出申请状态更新为'rejected'
  2. 目标用户保持在原宿舍
  3. 宿舍当前入住人数不变
  4. 处理时间为当前时间
  5. 处理者为当前管理员
- **后置验证**: 用户仍在原宿舍，申请被拒绝

---

## Stage 2: 权限和业务规则测试用例

### 权限测试用例

#### TC101: 非管理员创建宿舍权限测试
- **交互**: CreateDormitory
- **前置条件**: 普通学生用户已登录
- **输入数据**: 
  ```json
  {
    "user": student,
    "payload": { "name": "宿舍B", "capacity": 4 }
  }
  ```
- **预期结果**:
  1. 交互返回权限错误
  2. 错误信息指示权限不足
  3. 未创建宿舍记录

#### TC102: 非宿舍长记录违规权限测试
- **交互**: RecordViolation
- **前置条件**: 普通学生用户已登录
- **输入数据**:
  ```json
  {
    "user": student,
    "payload": {
      "targetUserId": anotherStudent.id,
      "violationType": "晚归",
      "scoreDeduction": 5
    }
  }
  ```
- **预期结果**:
  1. 交互返回权限错误
  2. 未创建违规记录
  3. 目标学生分数不变

#### TC103: 非管理员处理踢出申请权限测试
- **交互**: ProcessKickoutRequest
- **前置条件**: 宿舍长用户已登录
- **输入数据**:
  ```json
  {
    "user": dormHead,
    "payload": {
      "requestId": kickoutRequest.id,
      "decision": "approved"
    }
  }
  ```
- **预期结果**:
  1. 交互返回权限错误
  2. 申请状态保持pending
  3. 目标用户保持在原宿舍

### 业务规则测试用例

#### TC201: 宿舍容量限制测试
- **交互**: CreateDormitory
- **前置条件**: 管理员用户已登录
- **输入数据**: 
  ```json
  {
    "user": admin,
    "payload": { "name": "无效宿舍", "capacity": 8 }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示容量必须在4-6之间
  3. 未创建宿舍记录

#### TC202: 重复床位分配测试
- **交互**: AssignUserToDormitory
- **前置条件**:
  - 管理员用户已登录
  - 宿舍床位1已被占用
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": { 
      "userId": newStudent.id,
      "dormitoryId": dormitory.id,
      "bedNumber": 1
    }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示床位已被占用
  3. 未创建新的分配记录

#### TC203: 超出宿舍容量分配测试
- **交互**: AssignUserToDormitory
- **前置条件**:
  - 管理员用户已登录
  - 4人宿舍已满员
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": { 
      "userId": newStudent.id,
      "dormitoryId": fullDormitory.id,
      "bedNumber": 5
    }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示宿舍已满员
  3. 未创建新的分配记录

#### TC204: 用户重复分配测试
- **交互**: AssignUserToDormitory
- **前置条件**:
  - 管理员用户已登录
  - 用户已被分配到其他宿舍
- **输入数据**:
  ```json
  {
    "user": admin,
    "payload": { 
      "userId": assignedStudent.id,
      "dormitoryId": anotherDormitory.id,
      "bedNumber": 1
    }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示用户已被分配宿舍
  3. 用户保持在原宿舍分配

#### TC205: 分数不足踢出申请测试
- **交互**: RequestKickout
- **前置条件**:
  - 宿舍长用户已登录
  - 目标学生分数高于30分
- **输入数据**:
  ```json
  {
    "user": dormHead,
    "payload": {
      "targetUserId": highScoreStudent.id,
      "reason": "测试踢出"
    }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示学生分数过高，不满足踢出条件
  3. 未创建踢出申请

#### TC206: 跨宿舍违规记录测试
- **交互**: RecordViolation
- **前置条件**:
  - 宿舍长用户已登录
  - 目标学生在不同宿舍
- **输入数据**:
  ```json
  {
    "user": dormHead,
    "payload": {
      "targetUserId": otherDormStudent.id,
      "violationType": "晚归",
      "scoreDeduction": 5
    }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示不能记录其他宿舍学生违规
  3. 未创建违规记录

#### TC207: 重复踢出申请测试
- **交互**: RequestKickout
- **前置条件**:
  - 宿舍长用户已登录
  - 目标学生已有pending状态的踢出申请
- **输入数据**:
  ```json
  {
    "user": dormHead,
    "payload": {
      "targetUserId": student.id,
      "reason": "重复申请测试"
    }
  }
  ```
- **预期结果**:
  1. 交互返回业务规则违反错误
  2. 错误信息指示该学生已有待处理的踢出申请
  3. 未创建新的踢出申请

---

## 测试实施策略

### Stage 1 实施要点
1. **使用正确的用户角色**: 即使权限未强制执行，也要创建具有正确角色的用户
2. **使用有效数据**: 确保测试数据符合未来的业务规则要求
3. **验证核心功能**: 专注于验证实体创建、关系建立、计算属性更新等核心功能
4. **为Stage 2做准备**: Stage 1的测试应该在Stage 2实施后仍然能通过

### Stage 2 实施要点
1. **不修改Stage 1测试**: Stage 1测试应该继续通过
2. **新增专门的权限和规则测试**: 创建新的测试文件验证权限控制和业务规则
3. **验证错误处理**: 确保无权限操作和违规操作都能正确返回错误
4. **测试边界条件**: 验证各种边界情况的处理