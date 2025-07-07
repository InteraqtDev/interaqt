# 宿舍管理系统交互矩阵

## 角色-交互权限矩阵

| 交互名称 | 管理员 (admin) | 宿舍长 (dormLeader) | 普通用户 (student) | 描述 |
|---------|---------------|-------------------|------------------|------|
| **宿舍管理** |
| CreateDormitory | ✅ | ❌ | ❌ | 创建宿舍 |
| ViewAllDormitories | ✅ | ❌ | ❌ | 查看所有宿舍 |
| **用户管理** |
| ViewAllUsers | ✅ | ❌ | ❌ | 查看所有用户 |
| AssignUserToDormitory | ✅ | ❌ | ❌ | 分配用户到宿舍 |
| AppointDormLeader | ✅ | ❌ | ❌ | 任命宿舍长 |
| **纪律管理** |
| RecordScoreDeduction | ❌ | ✅ (限本宿舍) | ❌ | 记录扣分 |
| CreateKickoutRequest | ❌ | ✅ (限本宿舍) | ❌ | 创建踢出申请 |
| ProcessKickoutRequest | ✅ | ❌ | ❌ | 处理踢出申请 |
| **信息查询** |
| ViewMyDormitory | ❌ | ✅ | ✅ | 查看我的宿舍 |
| ViewMyScore | ❌ | ✅ | ✅ | 查看我的积分 |
| ViewMyScoreRecords | ❌ | ✅ | ✅ | 查看我的扣分记录 |
| ViewDormitoryMembers | ❌ | ✅ (限本宿舍) | ❌ | 查看宿舍成员 |

## 交互详细分析

### 1. 管理员专属交互

#### CreateDormitory
- **权限要求**: 仅管理员
- **功能**: 创建新宿舍并自动生成床位
- **数据权限**: 无限制
- **测试用例**: TC001, TC002, TC016

#### ViewAllDormitories
- **权限要求**: 仅管理员
- **功能**: 查看系统中所有宿舍信息
- **数据权限**: 查看所有宿舍数据
- **测试用例**: TC014

#### ViewAllUsers
- **权限要求**: 仅管理员
- **功能**: 查看系统中所有用户信息
- **数据权限**: 查看所有用户数据
- **测试用例**: TC015

#### AssignUserToDormitory
- **权限要求**: 仅管理员
- **功能**: 分配用户到指定宿舍的指定床位
- **数据权限**: 操作所有用户和宿舍
- **测试用例**: TC004, TC005, TC019, TC020

#### AppointDormLeader
- **权限要求**: 仅管理员
- **功能**: 任命指定用户为宿舍长
- **数据权限**: 操作所有用户角色
- **测试用例**: TC003

#### ProcessKickoutRequest
- **权限要求**: 仅管理员
- **功能**: 审核和处理踢出申请
- **数据权限**: 处理所有踢出申请
- **测试用例**: TC009, TC010

### 2. 宿舍长专属交互

#### RecordScoreDeduction
- **权限要求**: 宿舍长
- **功能**: 为本宿舍成员记录扣分
- **数据权限**: 仅限本宿舍成员
- **业务规则**: 
  - 只能对同宿舍成员操作
  - 必须提供扣分原因
  - 扣分值必须为正数
- **测试用例**: TC006, TC007, TC017

#### CreateKickoutRequest
- **权限要求**: 宿舍长
- **功能**: 为本宿舍低积分成员创建踢出申请
- **数据权限**: 仅限本宿舍成员
- **业务规则**:
  - 只能对同宿舍成员操作
  - 目标用户积分必须低于20
  - 必须提供踢出原因
- **测试用例**: TC008, TC018

#### ViewDormitoryMembers
- **权限要求**: 宿舍长
- **功能**: 查看本宿舍所有成员详细信息
- **数据权限**: 仅限本宿舍成员数据
- **测试用例**: TC013

### 3. 全用户共享交互

#### ViewMyDormitory
- **权限要求**: 已分配宿舍的用户
- **功能**: 查看自己所在宿舍信息
- **数据权限**: 仅限自己的宿舍信息
- **业务规则**: 用户必须已分配宿舍
- **测试用例**: TC011

#### ViewMyScore
- **权限要求**: 所有用户
- **功能**: 查看自己的当前积分
- **数据权限**: 仅限自己的积分数据
- **测试用例**: TC012

#### ViewMyScoreRecords
- **权限要求**: 所有用户
- **功能**: 查看自己的扣分记录历史
- **数据权限**: 仅限自己的扣分记录
- **测试用例**: TC012

## 数据权限控制

### 用户属性权限 (userAttributive)

#### 角色检查
```typescript
// 管理员权限检查
{
  "user.role": "admin"
}

// 宿舍长权限检查
{
  "user.role": "dormLeader"
}

// 已分配宿舍用户检查
{
  "user.dormitory": { "exists": true }
}
```

#### 宿舍范围权限
```typescript
// 宿舍长只能操作本宿舍成员
{
  "user.role": "dormLeader",
  "user.dormitory": payload.targetUser.dormitory
}
```

### 数据属性权限 (dataAttributive)

#### 业务规则验证
```typescript
// 踢出申请的积分限制
{
  "targetUser.score": { "lt": 20 }
}

// 宿舍容量检查
{
  "dormitory.currentCount": { "lt": "dormitory.capacity" }
}

// 床位占用检查
{
  "bed.isOccupied": false
}
```

## 权限矩阵验证

### 权限测试覆盖
- ✅ 所有角色都有对应的交互
- ✅ 每个交互都有明确的权限要求
- ✅ 跨角色权限边界有测试用例
- ✅ 数据范围权限有验证逻辑

### 安全性检查
- ✅ 普通用户无法执行管理员操作
- ✅ 宿舍长无法操作其他宿舍
- ✅ 用户只能查看自己的私有数据
- ✅ 所有写操作都有权限验证

### 业务逻辑检查
- ✅ 积分不足无法申请踢出
- ✅ 重复分配会被阻止
- ✅ 宿舍满员无法继续分配
- ✅ 床位占用冲突检测

## 交互依赖关系

### 前置依赖
1. **AppointDormLeader** → 需要先 **AssignUserToDormitory**
2. **RecordScoreDeduction** → 需要先 **AppointDormLeader**
3. **CreateKickoutRequest** → 需要先 **RecordScoreDeduction** (积分降低)
4. **ProcessKickoutRequest** → 需要先 **CreateKickoutRequest**

### 业务流程
```
CreateDormitory → AssignUserToDormitory → AppointDormLeader → 
RecordScoreDeduction → CreateKickoutRequest → ProcessKickoutRequest
```

### 查询交互无依赖
- ViewMyDormitory
- ViewMyScore
- ViewMyScoreRecords
- ViewDormitoryMembers
- ViewAllDormitories
- ViewAllUsers

## 异常处理矩阵

| 异常类型 | 涉及交互 | 处理方式 |
|---------|---------|---------|
| 权限不足 | 所有受限交互 | 返回 permission denied |
| 数据不存在 | 所有查询/操作 | 返回 not found |
| 业务规则违反 | 分配、踢出相关 | 返回 business rule violation |
| 数据验证失败 | 创建、更新相关 | 返回 validation failed |
| 系统错误 | 所有交互 | 返回 internal error |

这个交互矩阵确保了：
1. 每个用户角色都有合适的操作权限
2. 所有交互都有对应的测试用例
3. 权限控制覆盖所有关键操作
4. 业务规则得到正确实施