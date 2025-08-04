# 宿舍管理系统交互设计

## 交互概览

本文档详细定义了宿舍管理系统中所有交互的设计，包括输入参数、影响实体、预期结果和业务规则。

## 第一阶段：核心业务交互

### 1. CreateDormitory (创建宿舍)
**用途**: 管理员创建新的宿舍
**Payload**:
```typescript
{
  name: string,        // 宿舍名称，必填
  capacity: number,   // 床位数量，必填，4-6
  headId: string       // 宿舍长ID，必填
}
```
**影响实体**:
- 创建 Dormitory 实体
- 创建指定数量的 Bed 实体
- 建立 DormitoryHeadRelation
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: capacity 必须在 4-6 之间

### 2. AssignUserToDormitory (分配用户到宿舍)
**用途**: 将用户分配到指定宿舍的床位
**Payload**:
```typescript
{
  userId: string,      // 用户ID，必填
  dormitoryId: string, // 宿舍ID，必填
  bedNumber: number    // 床位号，必填
}
```
**影响实体**:
- 更新 UserDormitoryRelation
- 更新 Bed.isOccupied 状态
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 
- 用户必须未分配宿舍
- 指定床位必须可用
- 宿舍必须有空余床位

### 3. AssignDormHead (指定宿舍长)
**用途**: 管理员指定用户为宿舍长
**Payload**:
```typescript
{
  dormitoryId: string, // 宿舍ID，必填
  headId: string       // 新宿舍长ID，必填
}
```
**影响实体**:
- 更新 DormitoryHeadRelation
- 更新 User.role 为 'dormHead'
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 
- 宿舍必须存在
- 用户必须是 student 角色

### 4. CreateBehaviorRecord (创建行为记录)
**用途**: 记录用户的行为评分
**Payload**:
```typescript
{
  userId: string,      // 被记录用户ID，必填
  points: number,      // 分数变化，必填
  reason: string,      // 原因描述，必填
  recordedBy: string   // 记录者ID，必填
}
```
**影响实体**:
- 创建 BehaviorRecord 实体
- 更新 User.points
**Stage 2 权限**: admin 和 dormHead 可执行
**Stage 2 业务规则**: 
- dormHead 只能记录本宿舍用户
- reason 不能为空

### 5. RequestEviction (申请踢出用户)
**用途**: 宿舍长申请踢出违规用户
**Payload**:
```typescript
{
  userId: string,      // 被申请用户ID，必填
  reason: string,      // 申请原因，必填
  requestedBy: string  // 申请人ID，必填
}
```
**影响实体**:
- 创建 EvictionRequest 实体
**Stage 2 权限**: admin 和 dormHead 可执行
**Stage 2 业务规则**: 
- 用户积分必须 < 60
- dormHead 只能申请本宿舍用户

### 6. ApproveEviction (审批踢出申请)
**用途**: 管理员审批踢出申请
**Payload**:
```typescript
{
  requestId: string,   // 申请ID，必填
  approved: boolean,    // 是否批准，必填
  approvedBy: string   // 审批人ID，必填
}
```
**影响实体**:
- 更新 EvictionRequest 状态
- 如果批准，清除用户的宿舍分配
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 
- 申请必须是 pending 状态
- 如果批准，用户必须仍在宿舍中

## 第二阶段：查询交互

### 7. GetDormitory (获取宿舍信息)
**用途**: 获取宿舍详细信息
**Payload**:
```typescript
{
  id: string           // 宿舍ID，必填
}
```
**返回数据**: Dormitory 实体及关联数据
**Stage 2 权限**: 
- admin: 可查看任何宿舍
- dormHead: 仅可查看自己管理的宿舍
- student: 仅可查看自己所在的宿舍

### 8. ListDormitories (列出宿舍)
**用途**: 获取宿舍列表
**Payload**: 无
**返回数据**: Dormitory 数组
**Stage 2 权限**: 
- admin: 查看所有宿舍
- dormHead: 仅查看自己管理的宿舍
- student: 仅查看自己所在的宿舍

### 9. GetUser (获取用户信息)
**用途**: 获取用户详细信息
**Payload**:
```typescript
{
  id: string           // 用户ID，必填
}
```
**返回数据**: User 实体及关联数据
**Stage 2 权限**: 
- admin: 可查看任何用户
- dormHead: 仅可查看本宿舍用户
- student: 仅可查看自己

### 10. ListUsers (列出用户)
**用途**: 获取用户列表
**Payload**:
```typescript
{
  dormitoryId?: string, // 可选，按宿舍筛选
  role?: string         // 可选，按角色筛选
}
```
**返回数据**: User 数组
**Stage 2 权限**: 
- admin: 可查看所有用户
- dormHead: 仅可查看本宿舍用户
- student: 仅可查看自己

### 11. GetBehaviorRecords (获取行为记录)
**用途**: 获取行为记录列表
**Payload**:
```typescript
{
  userId?: string,     // 可选，按用户筛选
  dormitoryId?: string // 可选，按宿舍筛选
}
```
**返回数据**: BehaviorRecord 数组
**Stage 2 权限**: 
- admin: 可查看所有记录
- dormHead: 仅可查看本宿舍记录
- student: 仅可查看自己的记录

### 12. GetEvictionRequests (获取踢出申请)
**用途**: 获取踢出申请列表
**Payload**:
```typescript
{
  status?: string,      // 可选，按状态筛选
  userId?: string       // 可选，按用户筛选
}
```
**返回数据**: EvictionRequest 数组
**Stage 2 权限**: 
- admin: 可查看所有申请
- dormHead: 仅可查看自己提交的申请
- student: 不可查看

### 13. GetUserPoints (获取用户积分)
**用途**: 获取用户当前积分
**Payload**:
```typescript
{
  userId: string       // 用户ID，必填
}
```
**返回数据**: 用户积分和积分历史
**Stage 2 权限**: 
- admin: 可查看任何用户
- dormHead: 仅可查看本宿舍用户
- student: 仅可查看自己

### 14. GetDormitoryOccupancy (获取宿舍占用情况)
**用途**: 获取宿舍床位占用情况
**Payload**:
```typescript
{
  dormitoryId: string  // 宿舍ID，必填
}
```
**返回数据**: 占用统计和床位列表
**Stage 2 权限**: 
- admin: 可查看任何宿舍
- dormHead: 仅可查看自己管理的宿舍
- student: 仅可查看自己所在宿舍

## 第三阶段：管理交互

### 15. UpdateDormitory (更新宿舍信息)
**用途**: 更新宿舍基本信息
**Payload**:
```typescript
{
  id: string,          // 宿舍ID，必填
  name?: string,       // 可选，新名称
  capacity?: number,   // 可选，新容量
  status?: string      // 可选，新状态
}
```
**影响实体**: 更新 Dormitory 实体
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 
- capacity 必须在 4-6 之间
- 不能减少到低于当前占用数

### 16. RemoveUserFromDormitory (移除用户)
**用途**: 管理员直接移除用户（不通过申请流程）
**Payload**:
```typescript
{
  userId: string       // 用户ID，必填
}
```
**影响实体**: 
- 清除 UserDormitoryRelation
- 更新 Bed.isOccupied
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 用户必须已分配宿舍

### 17. UpdateUser (更新用户信息)
**用途**: 更新用户基本信息
**Payload**:
```typescript
{
  id: string,          // 用户ID，必填
  name?: string,       // 可选，新姓名
  email?: string,      // 可选，新邮箱
  role?: string        // 可选，新角色
}
```
**影响实体**: 更新 User 实体
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 
- email 必须唯一
- 不能修改自己的角色

### 18. DeleteDormitory (删除宿舍)
**用途**: 删除空宿舍
**Payload**:
```typescript
{
  id: string           // 宿舍ID，必填
}
```
**影响实体**: 
- 删除 Dormitory
- 删除关联的 Bed
- 清除相关关系
**Stage 2 权限**: 仅 admin 可执行
**Stage 2 业务规则**: 宿舍必须为空

## 错误处理设计

### 1. 权限错误
- 错误码: PERMISSION_DENIED
- 返回信息: "Insufficient permissions"
- 适用场景: 用户尝试执行无权操作

### 2. 验证错误
- 错误码: VALIDATION_FAILED
- 返回信息: 具体验证失败原因
- 适用场景: 输入数据不符合业务规则

### 3. 未找到错误
- 错误码: NOT_FOUND
- 返回信息: "Resource not found"
- 适用场景: 请求的实体不存在

### 4. 业务规则错误
- 错误码: BUSINESS_RULE_VIOLATION
- 返回信息: 具体违反的规则
- 适用场景: 操作违反业务逻辑

## 状态设计

### 1. 宿舍状态
- active: 活跃，可正常使用
- inactive: 停用，不可分配新用户

### 2. 踢出申请状态
- pending: 待审批
- approved: 已批准
- rejected: 已拒绝

### 3. 床位状态
- 通过 isOccupied 布尔值表示
- true: 已占用
- false: 可用

## 实现注意事项

1. **所有时间戳**: 使用 Unix 时间戳（毫秒）
2. **ID生成**: 使用 UUID 或类似的唯一标识符
3. **数据一致性**: 确保相关数据同时更新（如分配用户时更新床位状态）
4. **事务处理**: 关键操作需要事务支持
5. **审计日志**: 所有关键操作需要记录操作日志

## 扩展性考虑

1. **批量操作**: 未来可能需要支持批量分配用户
2. **导入导出**: 支持批量导入用户和宿舍数据
3. **通知系统**: 关键事件（如踢出）需要通知相关用户
4. **报表功能**: 生成各种统计报表
5. **API 分页**: 列表查询需要支持分页