# Interaction Design

## Overview

本文档定义了宿舍管理系统的所有Interactions（交互），按照渐进式实施策略设计：
- Stage 1：实现核心业务逻辑，不含权限和业务规则验证
- Stage 2：添加权限控制和业务规则验证

## Core Interactions

### 1. CreateDormitory - 创建宿舍

**Purpose**: 创建新的宿舍并自动生成对应数量的床位

**Payload**:
- `name` (string, required): 宿舍名称，如"A栋301"
- `capacity` (number, required): 床位容量

**Effects**:
- 创建新的Dormitory实体
- 自动创建capacity数量的Bed实体（编号1到capacity）
- 建立DormitoryBedsRelation关系
- 所有床位初始状态为'available'
- 宿舍初始状态为'active'

**Stage 2 - Permissions**: 
- 只有admin角色可以执行

**Stage 2 - Business Rules**:
- capacity必须在4-6之间
- name必须唯一（不能与现有宿舍重名）

---

### 2. AssignUserToDormitory - 分配用户到宿舍

**Purpose**: 将用户分配到指定宿舍的空床位

**Payload**:
- `userId` (string, required): 要分配的用户ID
- `dormitoryId` (string, required): 目标宿舍ID

**Effects**:
- 建立UserDormitoryRelation关系
- 自动选择第一个available状态的床位
- 建立UserBedRelation关系
- 更新选中床位状态为'occupied'
- 记录分配时间和分配人

**Stage 2 - Permissions**: 
- 只有admin角色可以执行

**Stage 2 - Business Rules**:
- 用户不能已有宿舍（检查是否存在UserDormitoryRelation）
- 宿舍必须有空床位（至少有一个床位status='available'）
- 用户状态不能是'evicted'

---

### 3. AssignDormHead - 指定宿舍长

**Purpose**: 指定某用户为特定宿舍的宿舍长

**Payload**:
- `userId` (string, required): 要指定为宿舍长的用户ID
- `dormitoryId` (string, required): 目标宿舍ID

**Effects**:
- 更新用户的role为'dormHead'
- 建立DormitoryDormHeadRelation关系
- 记录任命时间戳

**Stage 2 - Permissions**: 
- 只有admin角色可以执行

**Stage 2 - Business Rules**:
- 用户必须是该宿舍的成员（存在UserDormitoryRelation）
- 宿舍不能已有宿舍长（不存在DormitoryDormHeadRelation）

---

### 4. RecordViolation - 记录违规

**Purpose**: 宿舍长记录本宿舍成员的违规行为

**Payload**:
- `userId` (string, required): 违规用户ID
- `reason` (string, required): 违规原因描述
- `score` (number, required): 扣分值

**Effects**:
- 创建新的ViolationRecord实体
- 建立UserViolationRelation关系
- 建立ViolationRecorderRelation关系（记录人为当前用户）
- 累加用户的violationScore（使用StateMachine更新）
- 记录创建时间戳

**Stage 2 - Permissions**: 
- 只有dormHead角色可以执行

**Stage 2 - Business Rules**:
- 只能记录本宿舍成员的违规（目标用户和记录人在同一宿舍）
- 不能记录自己的违规（userId不能等于当前用户ID）
- score必须在1-10之间

---

### 5. RequestEviction - 申请踢出

**Purpose**: 宿舍长申请踢出违规严重的成员

**Payload**:
- `userId` (string, required): 要踢出的用户ID
- `reason` (string, required): 申请理由

**Effects**:
- 创建新的EvictionRequest实体，状态为'pending'
- 建立EvictionRequestUserRelation关系（目标用户）
- 建立EvictionRequestDormHeadRelation关系（申请人为当前用户）
- 记录申请时间戳

**Stage 2 - Permissions**: 
- 只有dormHead角色可以执行

**Stage 2 - Business Rules**:
- 只能申请踢出本宿舍成员
- 不能申请踢出自己
- 用户违规分数必须≥30

---

### 6. ApproveEviction - 批准踢出

**Purpose**: 管理员批准踢出申请

**Payload**:
- `requestId` (string, required): 踢出申请ID
- `comment` (string, optional): 管理员处理意见

**Effects**:
- 更新EvictionRequest状态为'approved'
- 记录管理员处理意见
- 记录处理时间戳
- 建立EvictionRequestAdminRelation关系（处理人为当前用户）
- 更新目标用户状态为'evicted'
- 解除UserDormitoryRelation关系
- 解除UserBedRelation关系
- 更新床位状态为'available'

**Stage 2 - Permissions**: 
- 只有admin角色可以执行

**Stage 2 - Business Rules**:
- 申请必须是'pending'状态

---

### 7. RejectEviction - 拒绝踢出

**Purpose**: 管理员拒绝踢出申请

**Payload**:
- `requestId` (string, required): 踢出申请ID
- `comment` (string, optional): 管理员处理意见

**Effects**:
- 更新EvictionRequest状态为'rejected'
- 记录管理员处理意见
- 记录处理时间戳
- 建立EvictionRequestAdminRelation关系（处理人为当前用户）
- 用户保持原状态不变

**Stage 2 - Permissions**: 
- 只有admin角色可以执行

**Stage 2 - Business Rules**:
- 申请必须是'pending'状态

---

## Query Interactions (Optional - Lower Priority)

### GetDormitoryInfo - 查询宿舍信息

**Purpose**: 查询宿舍详细信息

**Payload**:
- `dormitoryId` (string, required): 宿舍ID

**Effects**: 只读操作，返回宿舍信息及相关统计

---

### GetUserInfo - 查询用户信息

**Purpose**: 查询用户详细信息

**Payload**:
- `userId` (string, required): 用户ID

**Effects**: 只读操作，返回用户信息及相关记录

---

## Implementation Strategy

### Stage 1 - Core Business Logic

在Stage 1阶段，所有Interactions都实现基本功能，不包含任何权限检查或业务规则验证。这个阶段的目标是：

1. 确保所有基本的CRUD操作正常工作
2. 验证实体关系正确建立
3. 测试计算属性正确更新
4. 确认状态管理正常运行

**测试策略**：
- 使用正确的角色（admin、dormHead、student）
- 使用有效的数据（符合未来业务规则的数据）
- 确保所有核心功能测试通过（TC001-TC010）

### Stage 2 - Add Permissions and Business Rules

在Stage 1完全通过后，添加：

1. **权限控制**（通过condition）：
   - 角色检查
   - 权限范围验证

2. **业务规则**（通过condition）：
   - 数值范围验证
   - 唯一性检查
   - 状态前置条件
   - 关系约束

**测试策略**：
- Stage 1的测试应该仍然通过
- 添加权限拒绝测试（TC011-TC015）
- 添加业务规则违反测试（TC016-TC027）

## Data Flow Examples

### Example 1: 完整的用户入住流程

1. **CreateDormitory** → 创建"A栋301"宿舍（4个床位）
2. **AssignUserToDormitory** → 分配student1到宿舍
3. **AssignUserToDormitory** → 分配student2到宿舍
4. **AssignDormHead** → 指定student1为宿舍长

### Example 2: 违规处理流程

1. **RecordViolation** → 记录student2违规（5分）
2. **RecordViolation** → 再次记录违规（10分）
3. **RecordViolation** → 第三次违规（10分）
4. **RecordViolation** → 第四次违规（8分，累计33分）
5. **RequestEviction** → 申请踢出student2
6. **ApproveEviction** → 批准踢出申请

## Error Handling

### Error Types

1. **Permission Denied**: 用户角色不符合要求
2. **Business Rule Violation**: 违反业务逻辑约束
3. **Validation Error**: 输入数据不合法
4. **State Error**: 实体状态不允许操作
5. **Reference Error**: 引用的实体不存在

### Error Response Format

```javascript
{
  error: {
    type: 'PERMISSION_DENIED',
    message: '只有管理员可以创建宿舍'
  }
}
```

## Important Notes

1. **不要在Interaction中包含操作逻辑**：所有业务逻辑通过Computations实现
2. **Action只是标识符**：不包含任何execute或handler方法
3. **用户通过执行时传入**：不是Interaction的属性
4. **Stage 1优先**：先确保核心功能工作，再添加约束
5. **测试数据要合理**：即使Stage 1不验证，也要使用符合规则的数据

## Next Steps

基于这个设计文档，下一步将：
1. 分析需要的Computations（计算）
2. 生成实际的TypeScript代码实现
3. 实现Stage 1测试
4. 添加Stage 2的权限和规则
