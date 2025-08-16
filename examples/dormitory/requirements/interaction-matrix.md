# 宿舍管理系统 - 交互矩阵

## 概述
本文档定义了系统中所有的交互操作（Interactions），明确每个角色的操作权限、业务规则约束，并确保每个交互都有对应的测试用例。

## 交互分类

### 1. 宿舍管理类交互
用于管理宿舍的创建、配置和状态。

### 2. 用户管理类交互
用于管理用户分配、角色任命等。

### 3. 积分管理类交互
用于记录和管理用户积分扣除。

### 4. 申请处理类交互
用于处理各类申请（如踢出申请）。

### 5. 查询类交互
用于查询各类信息。

---

## 完整交互列表

### 1. CreateDormitory - 创建宿舍

| 属性 | 说明 |
|-----|------|
| **描述** | 创建新的宿舍并自动生成对应数量的床位 |
| **允许角色** | Admin |
| **输入参数** | name (string), capacity (number), floor (number), building (string) |
| **权限要求** | user.role === 'admin' |
| **业务规则** | - capacity必须在4-6之间<br>- name必须唯一<br>- 自动创建capacity数量的床位 |
| **影响实体** | Dormitory (创建), Bed (批量创建) |
| **测试用例** | TC001, TC016 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段2（权限）+ 阶段3（业务规则） |

### 2. AssignUserToDormitory - 分配用户到宿舍

| 属性 | 说明 |
|-----|------|
| **描述** | 将用户分配到指定宿舍的指定床位 |
| **允许角色** | Admin |
| **输入参数** | userId (string), dormitoryId (string), bedId (string) |
| **权限要求** | user.role === 'admin' |
| **业务规则** | - 用户不能已有宿舍<br>- 床位必须空闲<br>- 宿舍不能已满<br>- 床位必须属于该宿舍 |
| **影响实体** | User-Dormitory关系 (创建), User-Bed关系 (创建), Bed.status (更新), Dormitory计算属性 (更新) |
| **测试用例** | TC002, TC010, TC017, TC018, TC021, TC026 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段3（业务规则） |

### 3. AppointDormHead - 任命宿舍长

| 属性 | 说明 |
|-----|------|
| **描述** | 任命指定用户为宿舍长 |
| **允许角色** | Admin |
| **输入参数** | userId (string), dormitoryId (string) |
| **权限要求** | user.role === 'admin' |
| **业务规则** | - 用户必须是该宿舍成员<br>- 宿舍不能已有宿舍长（或需要先撤销） |
| **影响实体** | User.role (更新), Dormitory-DormHead关系 (创建) |
| **测试用例** | TC003, TC022 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段3（业务规则） |

### 4. RecordPointDeduction - 记录扣分

| 属性 | 说明 |
|-----|------|
| **描述** | 记录对指定用户的扣分 |
| **允许角色** | Admin, DormHead |
| **输入参数** | targetUserId (string), reason (string), points (number), category (enum) |
| **权限要求** | user.role === 'admin' OR (user.role === 'dormHead' AND 目标用户与操作者同宿舍) |
| **业务规则** | - points必须为正数<br>- 目标用户必须存在<br>- 宿舍长只能扣本宿舍成员分<br>- 扣分后积分不能为负（最低为0） |
| **影响实体** | PointDeduction (创建), User.points (更新), User计算属性 (更新) |
| **测试用例** | TC004, TC012, TC013, TC020, TC023 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段2（权限）+ 阶段3（业务规则） |

### 5. RequestEviction - 申请踢出用户

| 属性 | 说明 |
|-----|------|
| **描述** | 宿舍长申请踢出违规用户 |
| **允许角色** | DormHead |
| **输入参数** | targetUserId (string), reason (string) |
| **权限要求** | user.role === 'dormHead' AND 目标用户与申请者同宿舍 |
| **业务规则** | - 目标用户积分必须低于30分<br>- 目标用户必须是本宿舍成员<br>- 不能有未处理的相同申请 |
| **影响实体** | EvictionRequest (创建) |
| **测试用例** | TC005, TC019 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段2（权限）+ 阶段3（业务规则） |

### 6. ApproveEviction - 批准踢出申请

| 属性 | 说明 |
|-----|------|
| **描述** | 管理员批准踢出申请 |
| **允许角色** | Admin |
| **输入参数** | requestId (string), adminComment (string, 可选) |
| **权限要求** | user.role === 'admin' |
| **业务规则** | - 申请必须处于pending状态<br>- 批准后自动执行踢出操作 |
| **影响实体** | EvictionRequest.status (更新), User.status (更新), User-Dormitory关系 (删除), User-Bed关系 (删除), Bed.status (更新) |
| **测试用例** | TC006, TC014, TC024, TC025 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段2（权限）+ 阶段3（业务规则） |

### 7. RejectEviction - 拒绝踢出申请

| 属性 | 说明 |
|-----|------|
| **描述** | 管理员拒绝踢出申请 |
| **允许角色** | Admin |
| **输入参数** | requestId (string), adminComment (string, 可选) |
| **权限要求** | user.role === 'admin' |
| **业务规则** | - 申请必须处于pending状态 |
| **影响实体** | EvictionRequest.status (更新) |
| **测试用例** | TC007 |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段2（权限） |

### 8. ViewMyDormitory - 查看我的宿舍信息

| 属性 | 说明 |
|-----|------|
| **描述** | 查看当前用户的宿舍信息 |
| **允许角色** | User, DormHead, Admin |
| **输入参数** | 无（使用当前用户） |
| **权限要求** | 已登录即可 |
| **业务规则** | - 用户必须已分配宿舍 |
| **影响实体** | 无（只读查询） |
| **测试用例** | TC008 |
| **实现阶段** | 阶段1（核心逻辑） |

### 9. ViewMyPoints - 查看我的积分记录

| 属性 | 说明 |
|-----|------|
| **描述** | 查看当前用户的积分和扣分记录 |
| **允许角色** | User, DormHead, Admin |
| **输入参数** | 无（使用当前用户） |
| **权限要求** | 已登录即可 |
| **业务规则** | 无 |
| **影响实体** | 无（只读查询） |
| **测试用例** | TC009 |
| **实现阶段** | 阶段1（核心逻辑） |

### 10. ViewDormitoryMembers - 查看宿舍成员

| 属性 | 说明 |
|-----|------|
| **描述** | 查看指定宿舍或当前用户宿舍的成员列表 |
| **允许角色** | User, DormHead, Admin |
| **输入参数** | dormitoryId (string, 可选) |
| **权限要求** | - 普通用户只能查看自己宿舍<br>- 宿舍长可以查看自己管理的宿舍<br>- 管理员可以查看任何宿舍 |
| **业务规则** | 无 |
| **影响实体** | 无（只读查询） |
| **测试用例** | TC008（部分） |
| **实现阶段** | 阶段1（核心逻辑）+ 阶段2（权限） |

### 11. ViewAllDormitories - 查看所有宿舍

| 属性 | 说明 |
|-----|------|
| **描述** | 查看系统中所有宿舍的列表和统计信息 |
| **允许角色** | Admin |
| **输入参数** | 无 |
| **权限要求** | user.role === 'admin' |
| **业务规则** | 无 |
| **影响实体** | 无（只读查询） |
| **测试用例** | TC015 |
| **实现阶段** | 阶段2（权限） |

---

## 权限控制总结

### Admin（管理员）权限
- ✅ 所有交互操作
- 特有操作：CreateDormitory, AppointDormHead, AssignUserToDormitory, ApproveEviction, RejectEviction, ViewAllDormitories

### DormHead（宿舍长）权限
- ✅ RecordPointDeduction（仅本宿舍成员）
- ✅ RequestEviction（仅本宿舍成员）
- ✅ 所有查询操作（受限于本宿舍）

### User（普通用户）权限
- ✅ ViewMyDormitory
- ✅ ViewMyPoints
- ✅ ViewDormitoryMembers（仅本宿舍）
- ❌ 所有管理操作

---

## 业务规则验证总结

### 数据完整性规则
1. **唯一性约束**
   - User.email唯一
   - Dormitory.name唯一
   - 每个宿舍内Bed.bedNumber唯一

2. **引用完整性**
   - 分配用户时，用户和宿舍必须存在
   - 任命宿舍长时，用户必须是宿舍成员
   - 记录扣分时，目标用户必须存在

### 业务逻辑规则
1. **容量限制**
   - 宿舍容量4-6个床位
   - 满员宿舍不能继续分配

2. **分配规则**
   - 用户只能分配到一个宿舍
   - 床位不能重复分配
   - 用户被踢出后需重新分配

3. **积分规则**
   - 扣分必须为正数
   - 用户积分不能为负
   - 积分低于30分才能申请踢出

4. **申请规则**
   - 只能对本宿舍成员发起申请
   - 已处理的申请不能重复处理

---

## 测试覆盖度检查

| 交互名称 | 核心功能测试 | 权限测试 | 业务规则测试 | 覆盖率 |
|---------|------------|---------|-------------|--------|
| CreateDormitory | TC001 | TC011 | TC016 | ✅ 100% |
| AssignUserToDormitory | TC002, TC010 | - | TC017, TC018, TC021, TC026 | ✅ 100% |
| AppointDormHead | TC003 | - | TC022 | ✅ 100% |
| RecordPointDeduction | TC004 | TC012, TC013 | TC020, TC023 | ✅ 100% |
| RequestEviction | TC005 | - | TC019 | ✅ 100% |
| ApproveEviction | TC006 | TC014 | TC024, TC025 | ✅ 100% |
| RejectEviction | TC007 | - | - | ✅ 100% |
| ViewMyDormitory | TC008 | - | - | ✅ 100% |
| ViewMyPoints | TC009 | - | - | ✅ 100% |
| ViewDormitoryMembers | TC008 | - | - | ✅ 100% |
| ViewAllDormitories | - | TC015 | - | ✅ 100% |

**总体测试覆盖率**: 100% ✅

---

## 实现优先级

### 第一优先级（核心业务）
1. CreateDormitory
2. AssignUserToDormitory
3. AppointDormHead
4. RecordPointDeduction
5. RequestEviction
6. ApproveEviction
7. RejectEviction

### 第二优先级（查询功能）
1. ViewMyDormitory
2. ViewMyPoints
3. ViewDormitoryMembers
4. ViewAllDormitories

### 第三优先级（扩展功能）
- 后续可添加：
  - TransferUser（转宿舍）
  - ResignDormHead（辞去宿舍长）
  - RestorePoints（恢复积分）
  - ViewStatistics（查看统计）

---

## 注意事项

1. **权限检查优先**：所有交互必须先进行权限检查，再进行业务规则验证
2. **事务一致性**：涉及多个实体更新的操作（如ApproveEviction）必须保证事务一致性
3. **审计追踪**：所有修改操作都应记录操作时间和操作者
4. **错误处理**：返回清晰的错误信息，区分权限错误和业务规则错误
5. **性能考虑**：查询操作应考虑分页和缓存策略
