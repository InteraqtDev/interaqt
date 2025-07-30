# 交互矩阵 (Interaction Matrix)

## 概述
此文档确保每个用户角色都有对应的交互来执行所需操作，每个交互都有明确的权限控制和业务规则约束。

---

## 角色权限矩阵

| 交互 | 管理员(Admin) | 宿舍长(DormHead) | 学生(Student) | 权限控制 | 业务规则 |
|------|---------------|------------------|---------------|----------|----------|
| **宿舍管理** |
| CreateDormitory | ✅ | ❌ | ❌ | 仅管理员 | 容量4-6床位 |
| UpdateDormitory | ✅ | ❌ | ❌ | 仅管理员 | 不能减少已占用床位 |
| DeleteDormitory | ✅ | ❌ | ❌ | 仅管理员 | 必须为空宿舍 |
| GetDormitoryInfo | ✅ | ✅(自己管理的) | ✅(自己所在的) | 基于关系 | - |
| GetDormitoryList | ✅ | ✅(自己管理的) | ❌ | 角色+关系 | - |
| **用户管理** |
| AssignDormHead | ✅ | ❌ | ❌ | 仅管理员 | 目标用户必须在该宿舍 |
| RemoveDormHead | ✅ | ❌ | ❌ | 仅管理员 | - |
| AssignUserToDormitory | ✅ | ❌ | ❌ | 仅管理员 | 用户未分配+床位可用+宿舍未满 |
| RemoveUserFromDormitory | ✅ | ❌ | ❌ | 仅管理员 | - |
| GetUserInfo | ✅ | ✅(本宿舍学生) | ✅(自己) | 基于关系 | - |
| **扣分管理** |
| CreateDeductionRule | ✅ | ❌ | ❌ | 仅管理员 | 扣分>0 |
| UpdateDeductionRule | ✅ | ❌ | ❌ | 仅管理员 | - |
| DisableDeductionRule | ✅ | ❌ | ❌ | 仅管理员 | - |
| GetDeductionRules | ✅ | ✅ | ❌ | 管理员+宿舍长 | - |
| RecordDeduction | ❌ | ✅(本宿舍学生) | ❌ | 宿舍长+同宿舍 | 规则必须启用 |
| CancelDeduction | ✅ | ✅(自己记录的) | ❌ | 管理员或记录者 | 记录必须为active |
| GetDeductionHistory | ✅ | ✅(本宿舍学生) | ✅(自己) | 基于关系 | - |
| **踢出申请管理** |
| CreateKickoutRequest | ❌ | ✅(本宿舍学生) | ❌ | 宿舍长+同宿舍 | 目标学生扣分≥30+无pending申请 |
| ApproveKickoutRequest | ✅ | ❌ | ❌ | 仅管理员 | 申请状态为pending |
| RejectKickoutRequest | ✅ | ❌ | ❌ | 仅管理员 | 申请状态为pending |
| GetKickoutRequests | ✅ | ✅(自己发起的) | ❌ | 管理员或申请者 | - |
| **查询统计** |
| GetUserDeductionSummary | ✅ | ✅(本宿舍学生) | ✅(自己) | 基于关系 | - |
| GetDormitoryStatistics | ✅ | ✅(自己管理的) | ❌ | 基于关系 | - |
| GetSystemStatistics | ✅ | ❌ | ❌ | 仅管理员 | - |

---

## 权限控制设计

### 1. 角色基础权限
```typescript
// 基础角色权限检查
const hasAdminRole = user.role === 'admin'
const isDormHead = user.role === 'dormHead'
const isStudent = user.role === 'student'
```

### 2. 关系基础权限
```typescript
// 宿舍长管理权限
const canManageDormitory = (user, dormitoryId) => {
  return user.role === 'admin' || 
         (user.role === 'dormHead' && user.managedDormitory?.id === dormitoryId)
}

// 同宿舍权限
const isInSameDormitory = (user, targetUserId) => {
  return user.dormitory?.id === targetUser.dormitory?.id
}

// 自己信息权限
const canAccessUserInfo = (user, targetUserId) => {
  return user.role === 'admin' || 
         user.id === targetUserId ||
         isInSameDormitory(user, targetUserId)
}
```

### 3. 复合权限逻辑
```typescript
// 扣分权限：宿舍长且目标学生在同一宿舍
const canRecordDeduction = (user, targetUserId) => {
  return user.role === 'dormHead' && 
         isInSameDormitory(user, targetUserId)
}

// 踢出申请权限：宿舍长且目标学生在同一宿舍
const canCreateKickoutRequest = (user, targetUserId) => {
  return user.role === 'dormHead' && 
         isInSameDormitory(user, targetUserId)
}
```

---

## 业务规则约束

### 1. 宿舍容量约束
- **规则**: 宿舍床位数必须在4-6之间
- **影响交互**: CreateDormitory, UpdateDormitory
- **验证时机**: 创建和更新时

### 2. 用户分配约束
- **规则**: 每个用户只能分配到一个宿舍的一个床位
- **影响交互**: AssignUserToDormitory
- **验证逻辑**: 检查用户当前分配状态

### 3. 床位占用约束
- **规则**: 床位不能重复分配
- **影响交互**: AssignUserToDormitory
- **验证逻辑**: 检查床位当前占用状态

### 4. 扣分阈值约束
- **规则**: 总扣分≥30分才能申请踢出
- **影响交互**: CreateKickoutRequest
- **验证逻辑**: 计算目标用户有效扣分总数

### 5. 踢出申请唯一性约束
- **规则**: 每个学生同时只能有一个pending状态的踢出申请
- **影响交互**: CreateKickoutRequest
- **验证逻辑**: 检查现有pending申请

### 6. 宿舍长身份约束
- **规则**: 宿舍长必须是该宿舍的成员
- **影响交互**: AssignDormHead
- **验证逻辑**: 检查目标用户的宿舍分配

### 7. 扣分规则状态约束
- **规则**: 只能使用启用状态的扣分规则
- **影响交互**: RecordDeduction
- **验证逻辑**: 检查规则isActive状态

---

## 交互对应测试用例映射

### 核心业务逻辑测试
| 交互 | 对应测试用例 |
|------|-------------|
| CreateDormitory | TC001 |
| AssignDormHead | TC002 |
| AssignUserToDormitory | TC003 |
| CreateDeductionRule | TC004 |
| RecordDeduction | TC005 |
| CreateKickoutRequest | TC006 |
| ApproveKickoutRequest | TC007 |
| RejectKickoutRequest | TC008 |
| CancelDeduction | TC009 |
| GetDormitoryInfo | TC010 |

### 权限测试
| 权限场景 | 对应测试用例 |
|----------|-------------|
| 非管理员创建宿舍 | TC101 |
| 非宿舍长记录扣分 | TC102 |
| 跨宿舍管理限制 | TC103 |

### 业务规则测试
| 业务规则 | 对应测试用例 |
|----------|-------------|
| 宿舍容量限制 | TC201 |
| 重复分配限制 | TC202 |
| 床位占用限制 | TC203 |
| 扣分阈值限制 | TC204 |
| 重复申请限制 | TC205 |
| 宿舍满员限制 | TC206 |
| 边界条件测试 | TC207 |

---

## 缺失交互识别

### 可能需要补充的交互

1. **GetMyDormitoryInfo** - 学生查看自己宿舍信息
   - 角色：Student
   - 权限：自己所在宿舍
   - 用途：学生查看宿舍基本信息和室友

2. **GetMyDeductionSummary** - 学生查看自己扣分汇总
   - 角色：Student  
   - 权限：仅自己信息
   - 用途：学生了解自己的扣分情况

3. **UpdateUserProfile** - 用户更新个人信息
   - 角色：All
   - 权限：仅自己信息
   - 用途：更新姓名、联系方式等基本信息

4. **GetDormitoryMembers** - 查看宿舍成员列表
   - 角色：Admin, DormHead, Student(自己宿舍)
   - 权限：基于关系
   - 用途：查看宿舍成员详细信息

### 管理功能补充

5. **BatchAssignUsers** - 批量分配用户
   - 角色：Admin
   - 权限：仅管理员
   - 用途：提高分配效率

6. **TransferUser** - 转移用户到其他宿舍
   - 角色：Admin
   - 权限：仅管理员
   - 用途：调整宿舍分配

7. **GetUserHistory** - 查看用户历史记录
   - 角色：Admin
   - 权限：仅管理员
   - 用途：了解用户完整历史

---

## 验证清单

### 完整性检查
- [ ] 每个用户角色都有相应的交互来完成其职责
- [ ] 每个交互都有明确的权限控制
- [ ] 每个交互都有对应的业务规则约束
- [ ] 每个交互都有相应的测试用例

### 安全性检查  
- [ ] 没有权限绕过漏洞
- [ ] 敏感操作都有适当的权限控制
- [ ] 跨宿舍操作都有正确限制
- [ ] 角色提升操作都有管理员权限要求

### 业务逻辑检查
- [ ] 所有业务约束都在交互层面实现
- [ ] 数据一致性得到保证
- [ ] 状态转换逻辑完整
- [ ] 边界条件都有处理

### 测试覆盖检查
- [ ] 所有核心交互都有基础功能测试
- [ ] 所有权限控制都有对应测试
- [ ] 所有业务规则都有违规测试
- [ ] 边界条件和异常情况都有测试

---

## 实现优先级

### 高优先级 (Phase 1 - 核心功能)
1. CreateDormitory
2. AssignUserToDormitory  
3. AssignDormHead
4. CreateDeductionRule
5. RecordDeduction
6. CreateKickoutRequest
7. ApproveKickoutRequest

### 中优先级 (Phase 2 - 管理功能)
1. GetDormitoryInfo
2. GetDeductionHistory
3. CancelDeduction
4. RejectKickoutRequest
5. RemoveUserFromDormitory

### 低优先级 (Phase 3 - 增强功能)
1. UpdateDormitory
2. DeleteDormitory
3. UpdateDeductionRule
4. GetSystemStatistics
5. BatchAssignUsers

这个矩阵确保了系统的完整性和安全性，为后续的设计和实现提供了清晰的指导。