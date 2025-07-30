# 宿舍管理系统交互矩阵

## 概述
此文档确保：
- 每个用户角色都有对应的Interactions来执行所需操作
- 每个Interaction都有清晰的权限控制或业务规则约束
- 每个Interaction都有对应的测试用例
- 记录访问控制要求和业务逻辑验证

## 用户角色分析

### 1. 系统管理员 (Admin)
**职责**: 系统管理，宿舍和用户管理，审批流程
**权限级别**: 最高权限

### 2. 宿舍长 (DormHead)
**职责**: 管理分配给自己的宿舍，用户扣分，踢人申请
**权限级别**: 中等权限，仅限管理范围内

### 3. 学生 (Student)
**职责**: 查看个人信息，查看扣分记录
**权限级别**: 最低权限，仅限个人数据

## 交互操作矩阵

| 交互名称 | 管理员 | 宿舍长 | 学生 | 权限控制 | 业务规则 | 测试用例 |
|---------|--------|--------|------|----------|----------|----------|
| **CreateUser** | ✅ | ❌ | ❌ | 仅管理员 | 邮箱唯一性 | TC003 |
| **CreateDormitory** | ✅ | ❌ | ❌ | 仅管理员 | 容量4-6 | TC001, TC002, TC016 |
| **AssignUserToDormitory** | ✅ | ❌ | ❌ | 仅管理员 | 容量限制，唯一分配 | TC004, TC017, TC018, TC019 |
| **AssignDormitoryHead** | ✅ | ❌ | ❌ | 仅管理员 | 必须是宿舍成员 | TC005 |
| **DeductUserScore** | ❌ | ✅ | ❌ | 仅宿舍长，且同宿舍 | 扣分>0，目标用户同宿舍 | TC006, TC012, TC013, TC022 |
| **SubmitExpelRequest** | ❌ | ✅ | ❌ | 仅宿舍长，且同宿舍 | 目标用户分数<60，无pending申请 | TC007, TC014, TC020, TC021, TC023 |
| **ProcessExpelRequest** | ✅ | ❌ | ❌ | 仅管理员 | 申请状态为pending | TC008, TC009, TC015, TC024 |
| **ViewDormitoryMembers** | ✅ | ✅ | ❌ | 管理员可查看所有，宿舍长仅限管理宿舍 | 无 | TC010 |
| **ViewUserProfile** | ✅ | ✅ | ✅ | 管理员查看所有，宿舍长查看管理范围，学生查看自己 | 无 | - |
| **ViewScoreRecords** | ✅ | ✅ | ✅ | 管理员查看所有，宿舍长查看管理范围，学生查看自己 | 无 | - |

## 详细交互分析

### 1. CreateUser
- **权限控制**: `user.role === 'admin'`
- **业务规则**: `email` 字段唯一性验证
- **错误处理**: 邮箱重复，必填字段缺失
- **测试覆盖**: TC003 (成功), TC011 (权限失败)

### 2. CreateDormitory
- **权限控制**: `user.role === 'admin'`
- **业务规则**: `capacity >= 4 && capacity <= 6`
- **错误处理**: 容量超范围，名称重复
- **测试覆盖**: TC001 (成功), TC002 (数据验证), TC011 (权限), TC016 (业务规则)

### 3. AssignUserToDormitory
- **权限控制**: `user.role === 'admin'`
- **业务规则**: 
  - 宿舍有可用床位
  - 用户未被分配到其他宿舍
  - 指定床位未被占用
- **错误处理**: 宿舍满员，用户已分配，床位被占用
- **测试覆盖**: TC004 (成功), TC017-TC019 (业务规则)

### 4. AssignDormitoryHead
- **权限控制**: `user.role === 'admin'`
- **业务规则**: 
  - 用户必须是目标宿舍的成员
  - 宿舍不能已有宿舍长
- **错误处理**: 用户不在宿舍，宿舍已有宿舍长
- **测试覆盖**: TC005 (成功)

### 5. DeductUserScore
- **权限控制**: 
  - `user.role === 'dormHead'`
  - `user.managedDormitory === targetUser.dormitory`
- **业务规则**: 
  - `points > 0`
  - 目标用户在同一宿舍
- **错误处理**: 权限不足，扣分为负数，跨宿舍操作
- **测试覆盖**: TC006 (成功), TC012-TC013 (权限), TC022 (业务规则)

### 6. SubmitExpelRequest
- **权限控制**: 
  - `user.role === 'dormHead'`
  - `user.managedDormitory === targetUser.dormitory`
- **业务规则**: 
  - `targetUser.score < 60`
  - 目标用户无pending状态的踢人申请
- **错误处理**: 权限不足，分数过高，重复申请
- **测试覆盖**: TC007 (成功), TC014 (权限), TC020-TC021, TC023 (业务规则)

### 7. ProcessExpelRequest
- **权限控制**: `user.role === 'admin'`
- **业务规则**: `request.status === 'pending'`
- **错误处理**: 权限不足，申请已处理
- **副作用**: 批准时更新用户状态，释放床位
- **测试覆盖**: TC008-TC009 (成功), TC015 (权限), TC024 (业务规则)

### 8. ViewDormitoryMembers
- **权限控制**: 
  - 管理员: 查看所有宿舍
  - 宿舍长: 仅查看管理的宿舍
- **业务规则**: 无
- **错误处理**: 权限不足，宿舍不存在
- **测试覆盖**: TC010 (成功)

### 9. ViewUserProfile
- **权限控制**: 
  - 管理员: 查看所有用户
  - 宿舍长: 查看管理宿舍内用户
  - 学生: 仅查看自己
- **业务规则**: 无
- **错误处理**: 权限不足，用户不存在

### 10. ViewScoreRecords
- **权限控制**: 
  - 管理员: 查看所有用户扣分记录
  - 宿舍长: 查看管理宿舍内用户扣分记录
  - 学生: 仅查看自己的扣分记录
- **业务规则**: 无
- **错误处理**: 权限不足，用户不存在

## 权限控制实现策略

### 基于角色的访问控制 (RBAC)
```typescript
// 基础权限检查
const isAdmin = (user) => user.role === 'admin'
const isDormHead = (user) => user.role === 'dormHead'
const isStudent = (user) => user.role === 'student'

// 复合权限检查
const canManageUser = (user, targetUser) => {
  return isAdmin(user) || 
    (isDormHead(user) && user.managedDormitory === targetUser.dormitory)
}

const canAccessDormitory = (user, dormitory) => {
  return isAdmin(user) || 
    (isDormHead(user) && user.managedDormitory === dormitory)
}
```

### 业务规则实现策略

#### 数据完整性规则
- 宿舍容量限制 (4-6床位)
- 邮箱唯一性
- 用户唯一宿舍分配

#### 业务逻辑规则
- 踢人申请分数阈值 (<60分)
- 扣分数值验证 (>0)
- 申请状态管理 (防重复处理)

#### 关系约束规则
- 宿舍长必须是宿舍成员
- 扣分操作限制在管理范围内
- 床位分配唯一性

## 测试覆盖矩阵

| 测试类型 | 测试用例 | 覆盖的交互 | 验证点 |
|----------|----------|------------|---------|
| **核心功能** | TC001-TC010 | 所有主要交互 | 基本CRUD操作 |
| **权限控制** | TC011-TC015 | CreateDormitory, DeductUserScore, SubmitExpelRequest, ProcessExpelRequest | 角色权限验证 |
| **业务规则** | TC016-TC024 | 所有有业务约束的交互 | 数据验证，业务逻辑 |

## 遗漏检查清单

### ✅ 已覆盖的操作
- [x] 宿舍管理 (创建、分配)
- [x] 用户管理 (创建、分配宿舍)
- [x] 权限管理 (指定宿舍长)
- [x] 扣分管理 (扣分记录)
- [x] 踢人流程 (申请、审批)
- [x] 信息查询 (宿舍成员、个人信息)

### ⚠️ 可能需要补充的操作
- [ ] 取消宿舍长指定 (RemoveDormitoryHead)
- [ ] 用户换宿舍 (TransferUserDormitory)
- [ ] 批量导入用户 (BulkImportUsers)
- [ ] 扣分记录撤销 (RevokeScoreDeduction)
- [ ] 宿舍统计信息 (GetDormitoryStatistics)

### 📋 后续扩展考虑
- [ ] 宿舍类型区分 (男生宿舍、女生宿舍)
- [ ] 扣分规则配置化
- [ ] 消息通知系统
- [ ] 审批流程扩展 (多级审批)
- [ ] 数据导出功能

## 实现优先级

### P0 (必须实现)
1. CreateUser, CreateDormitory, AssignUserToDormitory
2. AssignDormitoryHead, DeductUserScore
3. SubmitExpelRequest, ProcessExpelRequest
4. ViewDormitoryMembers

### P1 (重要)
1. ViewUserProfile, ViewScoreRecords
2. 权限控制实现
3. 业务规则验证

### P2 (可选)
1. 扩展操作 (如取消宿舍长等)
2. 高级功能 (如统计、批量操作)
3. 系统集成 (如通知、审批流)

## 总结

该交互矩阵确保了：
1. **完整性**: 所有用户角色的操作需求都有对应的Interaction
2. **安全性**: 每个Interaction都有明确的权限控制策略
3. **一致性**: 业务规则和权限控制逻辑一致
4. **可测试性**: 每个Interaction都有对应的测试用例覆盖

通过这个矩阵，可以系统地实现和验证整个宿舍管理系统的功能完整性和安全性。