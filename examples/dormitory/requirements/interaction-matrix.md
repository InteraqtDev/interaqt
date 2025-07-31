# 宿舍管理系统交互矩阵

## 1. 用户角色与交互操作矩阵

### 1.1 完整权限矩阵

| 交互操作 | 系统管理员 (admin) | 宿舍长 (dormHead) | 学生 (student) | 权限控制说明 |
|---------|-------------------|------------------|---------------|------------|
| **宿舍管理** |
| CreateDormitory | ✓ | ✗ | ✗ | 只有系统管理员可以创建宿舍 |
| UpdateDormitory | ✓ | ✗ | ✗ | 只有系统管理员可以修改宿舍信息 |
| GetDormitoryInfo | ✓ | ✓(管理的宿舍) | ✓(自己的宿舍) | 用户只能查看相关宿舍信息 |
| GetAllDormitories | ✓ | ✗ | ✗ | 只有管理员可以查看所有宿舍 |
| **用户分配管理** |
| AssignUserToDormitory | ✓ | ✗ | ✗ | 只有管理员可以分配用户到宿舍 |
| RemoveUserFromDormitory | ✓ | ✗ | ✗ | 只有管理员可以移除用户宿舍分配 |
| TransferUserDormitory | ✓ | ✗ | ✗ | 只有管理员可以转移用户宿舍 |
| **宿舍长管理** |
| AssignDormHead | ✓ | ✗ | ✗ | 只有管理员可以指定宿舍长 |
| RemoveDormHead | ✓ | ✗ | ✗ | 只有管理员可以移除宿舍长 |
| **扣分规则管理** |
| CreateScoreRule | ✓ | ✗ | ✗ | 只有管理员可以创建扣分规则 |
| UpdateScoreRule | ✓ | ✗ | ✗ | 只有管理员可以修改扣分规则 |
| DeactivateScoreRule | ✓ | ✗ | ✗ | 只有管理员可以禁用扣分规则 |
| GetScoreRules | ✓ | ✓ | ✗ | 管理员和宿舍长可以查看扣分规则 |
| **扣分操作** |
| DeductUserScore | ✓ | ✓(管理宿舍内) | ✗ | 管理员可以对所有用户扣分，宿舍长只能对管理宿舍内用户扣分 |
| GetUserScoreRecords | ✓ | ✓(管理宿舍内) | ✓(自己的) | 用户只能查看自己的扣分记录 |
| **踢出申请管理** |
| RequestKickUser | ✗ | ✓(管理宿舍内) | ✗ | 只有宿舍长可以申请踢出用户 |
| ApproveKickRequest | ✓ | ✗ | ✗ | 只有管理员可以批准踢出申请 |
| RejectKickRequest | ✓ | ✗ | ✗ | 只有管理员可以拒绝踢出申请 |
| GetKickRequests | ✓ | ✓(自己发起的) | ✗ | 管理员可以查看所有申请，宿舍长只能查看自己发起的 |
| **用户查询** |
| GetUserInfo | ✓ | ✓(管理宿舍内) | ✓(自己的) | 用户查看权限受限 |
| GetDormitoryUsers | ✓ | ✓(管理的宿舍) | ✓(自己的宿舍) | 只能查看相关宿舍用户 |

### 1.2 业务规则约束

| 交互操作 | 业务规则约束说明 |
|---------|----------------|
| **CreateDormitory** | - 宿舍名称必须唯一<br>- 容量必须在4-6之间<br>- 创建后状态为active |
| **AssignUserToDormitory** | - 用户不能已有宿舍分配<br>- 宿舍不能满员<br>- 床位不能已被占用<br>- 床位号必须在1-capacity范围内 |
| **AssignDormHead** | - 用户必须已分配到该宿舍<br>- 一个宿舍只能有一个宿舍长<br>- 用户角色会自动更新为dormHead |
| **DeductUserScore** | - 扣分规则必须处于active状态<br>- 用户分数不能低于0<br>- 必须提供扣分原因 |
| **RequestKickUser** | - 用户分数必须低于20分<br>- 不能申请踢出自己<br>- 不能重复申请踢出同一用户<br>- 必须提供申请理由 |
| **ApproveKickRequest** | - 申请必须处于pending状态<br>- 批准后用户状态变为kicked<br>- 自动释放床位和宿舍关系 |

## 2. 交互依赖关系

### 2.1 前置依赖关系
```
CreateDormitory (创建宿舍)
  ↓
AssignUserToDormitory (分配用户)
  ↓
AssignDormHead (指定宿舍长)
  ↓
CreateScoreRule (创建扣分规则)
  ↓
DeductUserScore (扣分操作)
  ↓
RequestKickUser (申请踢出)
  ↓
ApproveKickRequest (批准申请)
```

### 2.2 并行操作组
- **宿舍信息查询**: GetDormitoryInfo, GetAllDormitories 可以并行
- **用户信息查询**: GetUserInfo, GetUserScoreRecords 可以并行
- **规则管理**: CreateScoreRule, UpdateScoreRule 可以并行
- **申请管理**: RequestKickUser, GetKickRequests 可以并行

## 3. 权限验证策略

### 3.1 基于角色的访问控制 (RBAC)
```typescript
// 权限检查伪代码
function checkPermission(interaction: string, user: User, context?: any) {
  switch (interaction) {
    case 'CreateDormitory':
      return user.role === 'admin'
    
    case 'DeductUserScore':
      if (user.role === 'admin') return true
      if (user.role === 'dormHead') {
        // 检查是否为用户所在宿舍的宿舍长
        return isDormHead(user, context.targetUser)
      }
      return false
    
    case 'GetDormitoryInfo':
      if (user.role === 'admin') return true
      if (user.role === 'dormHead') {
        // 检查是否为该宿舍的宿舍长
        return isManagedDormitory(user, context.dormitoryId)
      }
      if (user.role === 'student') {
        // 检查是否为用户自己的宿舍
        return isUserOwnDormitory(user, context.dormitoryId)
      }
      return false
  }
}
```

### 3.2 上下文相关权限
- **宿舍长权限**: 仅限于管理自己负责的宿舍
- **学生权限**: 仅限于查看自己相关的信息
- **管理员权限**: 对所有资源的完全访问权限

## 4. 交互测试覆盖

### 4.1 每个交互的测试用例覆盖

| 交互操作 | 成功场景 | 权限拒绝 | 业务规则失败 | 数据验证失败 |
|---------|---------|---------|-------------|-------------|
| CreateDormitory | ✓ | ✓ | ✓ | ✓ |
| AssignUserToDormitory | ✓ | ✓ | ✓ | ✓ |
| AssignDormHead | ✓ | ✓ | ✓ | ✓ |
| DeductUserScore | ✓ | ✓ | ✓ | ✓ |
| RequestKickUser | ✓ | ✓ | ✓ | ✓ |
| ApproveKickRequest | ✓ | ✓ | ✓ | ✓ |
| GetDormitoryInfo | ✓ | ✓ | N/A | ✓ |
| GetUserScoreRecords | ✓ | ✓ | N/A | ✓ |

### 4.2 关键业务流程测试
1. **完整宿舍分配流程**: CreateDormitory → AssignUserToDormitory → AssignDormHead
2. **扣分踢出流程**: CreateScoreRule → DeductUserScore → RequestKickUser → ApproveKickRequest
3. **权限传递测试**: 角色变更后的权限验证
4. **数据一致性测试**: 关联数据的自动更新验证

## 5. 错误处理策略

### 5.1 权限错误
- **错误码**: PERMISSION_DENIED
- **HTTP状态**: 403 Forbidden
- **错误信息**: 具体说明缺少的权限

### 5.2 业务规则错误
- **错误码**: BUSINESS_RULE_VIOLATION
- **HTTP状态**: 400 Bad Request
- **错误信息**: 具体说明违反的业务规则

### 5.3 数据验证错误
- **错误码**: VALIDATION_ERROR
- **HTTP状态**: 400 Bad Request
- **错误信息**: 具体说明验证失败的字段

### 5.4 资源不存在错误
- **错误码**: RESOURCE_NOT_FOUND
- **HTTP状态**: 404 Not Found
- **错误信息**: 具体说明不存在的资源

## 6. 性能考虑

### 6.1 高频操作
- **GetDormitoryInfo**: 需要优化查询性能
- **GetUserScoreRecords**: 可能需要分页
- **DeductUserScore**: 需要确保原子性

### 6.2 并发控制
- **AssignUserToDormitory**: 防止床位分配冲突
- **RequestKickUser**: 防止重复申请
- **ApproveKickRequest**: 确保申请状态一致性

## 7. 审计日志

### 7.1 需要记录的操作
- 所有管理员操作 (CreateDormitory, AssignDormHead等)
- 所有扣分操作 (DeductUserScore)
- 所有踢出相关操作 (RequestKickUser, ApproveKickRequest)

### 7.2 日志信息包含
- 操作时间
- 操作用户
- 操作类型
- 操作对象
- 操作结果
- 相关上下文信息