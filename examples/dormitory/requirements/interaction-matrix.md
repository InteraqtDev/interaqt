# 宿舍管理系统交互矩阵

## 角色权限矩阵

| 交互操作 | 系统管理员 | 宿舍长 | 普通用户 | 权限控制说明 |
|----------|------------|--------|----------|--------------|
| **CreateDorm** | ✅ | ❌ | ❌ | 仅管理员可以创建宿舍 |
| **AssignDormLeader** | ✅ | ❌ | ❌ | 仅管理员可以指定宿舍长 |
| **AssignUserToDorm** | ✅ | ❌ | ❌ | 仅管理员可以分配用户到宿舍 |
| **RemoveUserFromDorm** | ✅ | ❌ | ❌ | 仅管理员可以直接移除用户 |
| **DeductPoints** | ✅ | ❌ | ❌ | 仅管理员可以扣分 |
| **ProcessEvictionRequest** | ✅ | ❌ | ❌ | 仅管理员可以处理踢出申请 |
| **ApplyForEviction** | ❌ | ✅ | ❌ | 仅宿舍长可以申请踢出用户 |
| **ViewDormMembers** | ✅ | ✅* | ❌ | 宿舍长只能查看自己宿舍的成员 |
| **ViewMyDorm** | ✅ | ✅ | ✅ | 所有用户都可以查看自己的宿舍 |
| **ViewMyScore** | ✅ | ✅ | ✅ | 所有用户都可以查看自己的积分 |

## 数据权限控制

### 用户权限检查 (userAttributive)
- **CreateDorm**: 检查用户角色是否为"admin"
- **AssignDormLeader**: 检查用户角色是否为"admin"
- **AssignUserToDorm**: 检查用户角色是否为"admin"
- **RemoveUserFromDorm**: 检查用户角色是否为"admin"
- **DeductPoints**: 检查用户角色是否为"admin"
- **ProcessEvictionRequest**: 检查用户角色是否为"admin"
- **ApplyForEviction**: 检查用户角色是否为"dorm_leader"
- **ViewDormMembers**: 检查用户角色是否为"dorm_leader"

### 数据权限检查 (dataAttributive)
- **ApplyForEviction**: 检查目标用户是否与申请者在同一宿舍
- **ViewDormMembers**: 检查查询的宿舍是否为当前宿舍长管理的宿舍

## 业务规则验证

### 宿舍相关验证
- **CreateDorm**: 宿舍容量必须在4-6之间
- **AssignUserToDorm**: 
  - 宿舍必须有空余床位
  - 用户不能被重复分配
  - 床位号必须在1-capacity范围内

### 用户相关验证
- **AssignDormLeader**: 被指定用户必须是该宿舍的成员
- **ApplyForEviction**: 目标用户积分必须低于-100分
- **ApplyForEviction**: 宿舍长不能申请踢出自己

### 积分系统验证
- **DeductPoints**: 扣分可以为负值，表示加分
- **ApplyForEviction**: 只有在用户积分≤-100时才允许申请

## 状态管理

### 宿舍状态
- **正常**: 宿舍正常运营，接受新成员
- **满员**: 宿舍达到最大容量，不再接受新成员

### 用户状态
- **正常**: 用户在宿舍中正常居住
- **被移除**: 用户被从宿舍中移除，可以重新分配

### 踢出申请状态
- **pending**: 申请等待管理员处理
- **approved**: 申请被批准，用户被移除
- **rejected**: 申请被拒绝，用户保留在宿舍中

## 交互流程图

```
管理员操作流程：
CreateDorm → AssignDormLeader → AssignUserToDorm → DeductPoints → ProcessEvictionRequest

宿舍长操作流程：
ViewDormMembers → ApplyForEviction

普通用户操作流程：
ViewMyDorm → ViewMyScore
```

## 权限检查优先级
1. **身份认证**: 用户必须已登录
2. **角色检查**: 检查用户角色是否符合要求
3. **数据权限**: 检查用户是否有权限操作特定数据
4. **业务规则**: 检查是否符合业务规则

## 异常处理
- **权限不足**: 返回"permission denied"错误
- **数据不存在**: 返回"not found"错误
- **业务规则违反**: 返回"validation failed"错误，包含具体错误信息
- **重复操作**: 返回"already exists"或"already assigned"错误

## 权限配置示例

### 管理员权限配置
```typescript
userAttributive: {
  role: 'admin'
}
```

### 宿舍长权限配置
```typescript
userAttributive: {
  role: 'dorm_leader'
},
dataAttributive: {
  dormId: 'current_user_dorm_id'
}
```

### 普通用户权限配置
```typescript
userAttributive: {
  id: 'current_user_id'
}
```