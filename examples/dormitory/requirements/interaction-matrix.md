# 宿舍管理系统交互矩阵

## 用户角色定义

### Admin (系统管理员)
- **权限级别**: 最高
- **职责**: 系统全局管理，宿舍创建，角色分配
- **管理范围**: 整个系统

### DormHead (宿舍长)
- **权限级别**: 中等
- **职责**: 宿舍日常管理，违规处理
- **管理范围**: 仅限自己负责的宿舍

### Student (学生)
- **权限级别**: 最低
- **职责**: 查看个人信息，遵守宿舍规定
- **管理范围**: 仅限个人相关信息

## 交互权限矩阵

| 交互名称 | Admin | DormHead | Student | 权限控制 | 业务规则 |
|---------|--------|----------|---------|----------|----------|
| **宿舍管理** |  |  |  |  |  |
| CreateDormitory | ✅ | ❌ | ❌ | 仅管理员 | 名称唯一，容量4-6 |
| UpdateDormitory | ✅ | ❌ | ❌ | 仅管理员 | 不能减少已分配床位 |
| DeleteDormitory | ✅ | ❌ | ❌ | 仅管理员 | 必须为空宿舍 |
| ViewDormitoryList | ✅ | ✅ | ✅ | 无限制 | - |
| ViewDormitoryDetails | ✅ | ✅(自己的) | ✅(自己的) | 基于角色和关系 | - |
| **用户管理** |  |  |  |  |  |
| AssignDormHead | ✅ | ❌ | ❌ | 仅管理员 | 目标用户必须为student |
| RemoveDormHead | ✅ | ❌ | ❌ | 仅管理员 | 宿舍长无待处理申请 |
| AssignUserToDormitory | ✅ | ❌ | ❌ | 仅管理员 | 床位不超容量，用户未分配 |
| RemoveUserFromDormitory | ✅ | ❌ | ❌ | 仅管理员 | 用户当前在宿舍中 |
| ViewUserProfile | ✅ | ✅(宿舍成员) | ✅(自己) | 基于角色和关系 | - |
| **违规管理** |  |  |  |  |  |
| CreateScoreRule | ✅ | ❌ | ❌ | 仅管理员 | 扣分值>0 |
| UpdateScoreRule | ✅ | ❌ | ❌ | 仅管理员 | 扣分值>0 |
| DeleteScoreRule | ✅ | ❌ | ❌ | 仅管理员 | 无关联违规记录 |
| ViewScoreRules | ✅ | ✅ | ✅ | 无限制 | 仅显示激活规则 |
| RecordViolation | ✅ | ✅(宿舍成员) | ❌ | 管理员或对应宿舍长 | 目标用户在宿舍中 |
| ViewViolationHistory | ✅ | ✅(宿舍成员) | ✅(自己) | 基于角色和关系 | - |
| **踢出管理** |  |  |  |  |  |
| RequestKickout | ✅ | ✅(宿舍成员) | ❌ | 管理员或对应宿舍长 | 用户积分<60，无待处理申请 |
| ProcessKickoutRequest | ✅ | ❌ | ❌ | 仅管理员 | 申请状态为pending |
| ViewKickoutRequests | ✅ | ✅(自己发起的) | ❌ | 基于角色和关系 | - |
| **查询统计** |  |  |  |  |  |
| ViewSystemOverview | ✅ | ❌ | ❌ | 仅管理员 | - |
| ViewDormitoryStats | ✅ | ✅(自己的) | ❌ | 管理员或对应宿舍长 | - |
| ViewMyViolations | ❌ | ❌ | ✅ | 仅本人 | - |
| ViewMyDormitoryInfo | ❌ | ❌ | ✅ | 仅本人 | 用户已分配宿舍 |

## 详细权限控制规则

### 1. 宿舍管理权限

#### CreateDormitory
- **权限**: 仅 Admin 可执行
- **验证**: `user.role === 'admin'`
- **业务规则**: 
  - 宿舍名称不能重复
  - 容量必须在4-6之间

#### ViewDormitoryDetails
- **权限**: 分层访问控制
  - Admin: 可查看所有宿舍
  - DormHead: 仅可查看自己管理的宿舍
  - Student: 仅可查看自己所在的宿舍
- **验证逻辑**:
  ```
  user.role === 'admin' OR 
  (user.role === 'dormHead' AND user.managedDormitory.id === dormitoryId) OR
  (user.role === 'student' AND user.dormitory.id === dormitoryId)
  ```

### 2. 用户分配权限

#### AssignUserToDormitory
- **权限**: 仅 Admin 可执行
- **验证**: `user.role === 'admin'`
- **业务规则**:
  - 目标用户当前未分配宿舍
  - 目标宿舍有可用床位
  - 床位号在容量范围内
  - 目标用户状态不为 'kicked'

#### AssignDormHead
- **权限**: 仅 Admin 可执行
- **验证**: `user.role === 'admin'`
- **业务规则**:
  - 目标用户角色为 'student'
  - 目标宿舍当前无宿舍长

### 3. 违规处理权限

#### RecordViolation
- **权限**: Admin 或对应宿舍的宿舍长
- **验证逻辑**:
  ```
  user.role === 'admin' OR 
  (user.role === 'dormHead' AND user.managedDormitory.residents.include(targetUser))
  ```
- **业务规则**:
  - 目标用户必须在宿舍中
  - 扣分规则必须处于激活状态
  - 扣分后积分不能为负数

#### RequestKickout
- **权限**: Admin 或对应宿舍的宿舍长
- **验证逻辑**: 同 RecordViolation
- **业务规则**:
  - 目标用户积分必须低于60分
  - 目标用户不能有待处理的踢出申请
  - 申请人不能是目标用户本人

### 4. 申请处理权限

#### ProcessKickoutRequest
- **权限**: 仅 Admin 可执行
- **验证**: `user.role === 'admin'`
- **业务规则**:
  - 申请状态必须为 'pending'
  - 不能处理自己发起的申请(如果管理员也可以发起申请)

## 交互依赖关系

### 前置依赖
- **AssignDormHead** 依赖 **CreateDormitory**
- **AssignUserToDormitory** 依赖 **CreateDormitory**
- **RecordViolation** 依赖 **CreateScoreRule** 和 **AssignUserToDormitory**
- **RequestKickout** 依赖 **RecordViolation** (需要积分降低)
- **ProcessKickoutRequest** 依赖 **RequestKickout**

### 数据流依赖
```
CreateDormitory → AssignDormHead → AssignUserToDormitory
                                        ↓
CreateScoreRule → RecordViolation → RequestKickout → ProcessKickoutRequest
```

## 业务规则约束

### 数据完整性约束
1. **唯一性约束**:
   - 用户邮箱唯一
   - 宿舍名称唯一
   - 同一宿舍内床位号唯一

2. **引用完整性约束**:
   - 违规记录必须关联有效用户和规则
   - 踢出申请必须关联有效用户和申请人
   - 宿舍分配必须关联有效用户和宿舍

### 业务逻辑约束
1. **状态约束**:
   - 已踢出用户(status='kicked')不能重新分配宿舍
   - 已分配用户不能重复分配到其他宿舍
   - 待处理申请不能重复提交

2. **数量约束**:
   - 宿舍入住人数不能超过容量
   - 用户积分不能为负数
   - 扣分规则的扣分值必须为正数

3. **时间约束**:
   - 踢出申请处理时间必须晚于申请时间
   - 用户分配时间必须晚于宿舍创建时间

## 错误处理策略

### 权限错误
- **错误类型**: `PERMISSION_DENIED`
- **返回信息**: 不透露具体权限信息，统一返回"权限不足"
- **日志记录**: 记录权限违规尝试

### 业务规则错误
- **错误类型**: `BUSINESS_RULE_VIOLATION`
- **返回信息**: 具体的规则违反说明
- **常见错误**:
  - `DORMITORY_FULL`: 宿舍床位已满
  - `USER_ALREADY_ASSIGNED`: 用户已分配宿舍
  - `INSUFFICIENT_SCORE`: 用户积分不足以踢出
  - `DUPLICATE_REQUEST`: 重复申请

### 数据验证错误
- **错误类型**: `VALIDATION_ERROR`
- **返回信息**: 具体的字段验证失败信息
- **常见错误**:
  - `REQUIRED_FIELD_MISSING`: 必填字段缺失
  - `INVALID_FIELD_VALUE`: 字段值无效
  - `FIELD_LENGTH_EXCEEDED`: 字段长度超限

## 测试覆盖要求

### 权限测试覆盖
- ✅ 每个交互的所有角色权限验证
- ✅ 跨宿舍权限边界测试
- ✅ 无权限用户的拒绝访问测试

### 业务规则测试覆盖
- ✅ 所有约束条件的边界测试
- ✅ 规则违反的错误处理测试
- ✅ 复合规则的组合测试

### 数据完整性测试覆盖
- ✅ 唯一性约束违反测试
- ✅ 引用完整性约束测试
- ✅ 并发操作的数据一致性测试