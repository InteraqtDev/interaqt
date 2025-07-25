# 宿舍管理系统交互矩阵

## 交互矩阵设计目的

确保：
- 每个用户角色都有对应的交互来执行所需操作
- 每个交互都有明确的权限控制或业务规则约束
- 每个交互都有对应的测试用例
- 同时记录访问控制要求和业务逻辑验证

---

## 用户角色定义

### Admin（管理员）
- **全局管理权限**：可以管理整个系统的宿舍、用户分配、宿舍长任命
- **申请处理权限**：处理所有踢出申请的最终决定权
- **数据创建权限**：创建宿舍、用户等基础数据

### DormHead（宿舍长）
- **宿舍管理权限**：管理所负责宿舍内的用户行为
- **违规记录权限**：记录同宿舍用户的违规行为
- **申请发起权限**：对扣分达标的同宿舍用户发起踢出申请

### Student（学生）
- **基础查看权限**：查看自己的信息、违规记录等
- **受管理对象**：接受宿舍分配、违规记录等管理操作

---

## 完整交互矩阵

| 交互名称 | Admin | DormHead | Student | 权限控制规则 | 业务逻辑约束 | 对应测试用例 |
|---------|-------|----------|---------|-------------|-------------|-------------|
| **CreateDormitory** | ✓ | ✗ | ✗ | 仅管理员可创建 | 容量必须4-6个床位 | TC001, TC201 |
| **CreateUser** | ✓ | ✗ | ✗ | 仅管理员可创建 | 邮箱唯一性验证 | TC002 |
| **AssignUserToDormitory** | ✓ | ✗ | ✗ | 仅管理员可分配 | 用户未分配过、宿舍有空余、床位可用 | TC003, TC102, TC202, TC203, TC204 |
| **AppointDormHead** | ✓ | ✗ | ✗ | 仅管理员可任命 | 用户已在该宿舍、宿舍无现任宿舍长 | TC004 |
| **RecordViolation** | ✓ | ✓(同宿舍) | ✗ | 管理员全局、宿舍长限同宿舍 | 目标用户必须在记录人管辖范围内 | TC005, TC103, TC104 |
| **CreateKickoutRequest** | ✓ | ✓(同宿舍) | ✗ | 管理员全局、宿舍长限同宿舍 | 目标用户扣分≥10、无pending申请 | TC006, TC205, TC206 |
| **ProcessKickoutRequest** | ✓ | ✗ | ✗ | 仅管理员可处理 | 申请状态必须为pending | TC007, TC008, TC207 |
| **ViewUserInfo** | ✓(全部) | ✓(同宿舍) | ✓(自己) | 分级查看权限 | 根据角色限制查看范围 | - |
| **ViewDormitoryInfo** | ✓(全部) | ✓(负责宿舍) | ✓(所在宿舍) | 分级查看权限 | 根据角色限制查看范围 | - |
| **ViewViolationRecords** | ✓(全部) | ✓(同宿舍) | ✓(自己) | 分级查看权限 | 根据角色限制查看范围 | - |

---

## 权限控制详细说明

### 1. CreateDormitory（创建宿舍）
- **权限要求**: user.role === 'admin'
- **访问控制**: 非管理员调用返回权限错误
- **业务规则**: capacity必须在4-6之间
- **失败场景**: 
  - 权限不足（TC101）
  - 容量超限（TC201）

### 2. CreateUser（创建用户）
- **权限要求**: user.role === 'admin'
- **访问控制**: 非管理员调用返回权限错误
- **业务规则**: email必须唯一
- **失败场景**: 
  - 权限不足
  - 邮箱重复

### 3. AssignUserToDormitory（分配用户到宿舍）
- **权限要求**: user.role === 'admin'
- **访问控制**: 非管理员调用返回权限错误（TC102）
- **业务规则**: 
  - 用户未被分配过宿舍（TC202）
  - 宿舍有空余容量（TC203）
  - 指定床位状态为available（TC204）
- **失败场景**: 权限不足、重复分配、宿舍已满、床位占用

### 4. AppointDormHead（任命宿舍长）
- **权限要求**: user.role === 'admin'
- **访问控制**: 非管理员调用返回权限错误
- **业务规则**: 
  - 用户已被分配到该宿舍
  - 该宿舍当前没有active状态的宿舍长
- **失败场景**: 权限不足、用户不在宿舍、已有宿舍长

### 5. RecordViolation（记录违规）
- **权限要求**: 
  - user.role === 'admin' OR
  - (user.role === 'dormHead' AND user.managedDormitory === target.dormitory)
- **访问控制**: 
  - 非管理员且非宿舍长返回权限错误（TC104）
  - 宿舍长记录非同宿舍用户返回权限错误（TC103）
- **业务规则**: 目标用户必须在记录人的管辖范围内
- **失败场景**: 权限不足、跨宿舍管理

### 6. CreateKickoutRequest（创建踢出申请）
- **权限要求**: 
  - user.role === 'admin' OR
  - (user.role === 'dormHead' AND user.managedDormitory === target.dormitory)
- **访问控制**: 非管理员且非相关宿舍长返回权限错误
- **业务规则**: 
  - 目标用户扣分≥10（TC205）
  - 目标用户无pending状态的踢出申请（TC206）
- **失败场景**: 权限不足、扣分不够、重复申请

### 7. ProcessKickoutRequest（处理踢出申请）
- **权限要求**: user.role === 'admin'
- **访问控制**: 非管理员调用返回权限错误
- **业务规则**: 申请状态必须为pending（TC207）
- **失败场景**: 权限不足、申请已处理

---

## 业务流程交互链

### 用户入住流程
1. **CreateUser** (Admin) → 创建用户账户
2. **CreateDormitory** (Admin) → 创建宿舍和床位
3. **AssignUserToDormitory** (Admin) → 分配用户到宿舍床位
4. **AppointDormHead** (Admin) → 任命其中一人为宿舍长

### 违规处理流程
1. **RecordViolation** (DormHead/Admin) → 记录用户违规行为
2. **ViewViolationRecords** (DormHead/Admin/Student) → 查看累计违规
3. **CreateKickoutRequest** (DormHead/Admin) → 扣分达标后申请踢出
4. **ProcessKickoutRequest** (Admin) → 管理员审核处理申请

### 权限升级流程
1. **AssignUserToDormitory** (Admin) → 先分配普通学生到宿舍
2. **AppointDormHead** (Admin) → 再任命为宿舍长获得管理权限

---

## 错误处理矩阵

| 错误类型 | 触发条件 | 返回信息 | 相关测试用例 |
|---------|---------|---------|-------------|
| **权限错误** | 角色不匹配访问控制规则 | "权限不足" | TC101-104 |
| **业务规则错误** | 违反业务逻辑约束 | 具体规则错误信息 | TC201-207 |
| **数据验证错误** | 输入数据格式或范围错误 | 验证失败详情 | - |
| **状态冲突错误** | 操作与当前状态不符 | 状态冲突描述 | TC206, TC207 |

---

## 交互依赖关系

### 强依赖关系（必须先执行）
- **AssignUserToDormitory** 依赖 CreateUser + CreateDormitory
- **AppointDormHead** 依赖 AssignUserToDormitory
- **RecordViolation** 依赖 AssignUserToDormitory（记录人和目标都需要）
- **CreateKickoutRequest** 依赖 RecordViolation（需要扣分记录）
- **ProcessKickoutRequest** 依赖 CreateKickoutRequest

### 弱依赖关系（影响权限或可见性）
- **RecordViolation** 最好有 AppointDormHead（宿舍长权限）
- **CreateKickoutRequest** 最好有 AppointDormHead（宿舍长权限）

---

## 测试覆盖验证

### 核心业务逻辑测试覆盖
- ✅ 每个交互都有基础功能测试（TC001-008）
- ✅ 关键业务流程有端到端测试
- ✅ 数据关系建立和更新验证

### 权限测试覆盖
- ✅ 每个受限交互都有权限拒绝测试（TC101-104）
- ✅ 跨角色权限边界测试
- ✅ 同角色不同范围权限测试

### 业务规则测试覆盖
- ✅ 每个业务约束都有违反测试（TC201-207）
- ✅ 边界条件测试（如容量限制、分数阈值）
- ✅ 状态冲突测试

这个交互矩阵确保了系统的完整性和安全性，为后续的代码实现提供了明确的指导。