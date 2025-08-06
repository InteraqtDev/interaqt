# 宿舍管理系统交互设计

## 交互设计原则

### Stage 1 设计重点
- **仅包含核心业务逻辑**：基础CRUD操作、状态转换、关系管理
- **无权限检查**：先实现功能，后续添加权限控制
- **无业务规则验证**：专注核心功能，后续添加复杂验证
- **完整载荷定义**：确保所有必要参数都已定义

### Stage 2 扩展项目
- **权限检查**：基于角色的访问控制
- **业务规则验证**：容量限制、状态检查、时间限制等
- **复杂数据验证**：除基础字段要求外的复杂验证

## 用户管理交互

### CreateUser
**目的**: 创建新用户账号
**载荷字段**:
- `name`: string (必需) - 用户姓名
- `email`: string (必需) - 邮箱地址
- `phone`: string (必需) - 手机号码
- `role`: string (必需) - 用户角色 (admin/dormHead/student)

**效果**:
- 创建新User实体
- 设置初始状态为active
- 记录创建时间戳

**Stage 2 - 权限**: 仅管理员可创建
**Stage 2 - 业务规则**: 邮箱唯一性检查

### AssignDormHead
**目的**: 指定用户为宿舍长
**载荷字段**:
- `userId`: string (必需) - 目标用户ID
- `dormitoryId`: string (必需) - 宿舍ID

**效果**:
- 用户角色更新为dormHead
- 创建UserDormitoryHeadRelation关系
- 记录指定时间戳

**Stage 2 - 权限**: 仅管理员可操作
**Stage 2 - 业务规则**: 
- 目标用户必须存在
- 宿舍必须存在且未分配宿舍长

### GetUserInfo
**目的**: 获取用户信息
**载荷字段**:
- `userId`: string (可选) - 目标用户ID，不提供则返回当前用户信息

**效果**:
- 返回用户基本信息
- 包含相关的宿舍和分配信息

**Stage 2 - 权限**: 
- Admin: 所有用户
- DormHead: 本宿舍学生
- Student: 仅本人信息

## 宿舍管理交互

### CreateDormitory
**目的**: 创建新宿舍
**载荷字段**:
- `name`: string (必需) - 宿舍名称
- `bedCount`: number (必需) - 床位数量

**效果**:
- 创建新Dormitory实体
- 自动创建对应数量的Bed实体
- 所有床位初始状态为available

**Stage 2 - 权限**: 仅管理员可创建
**Stage 2 - 业务规则**: 床位数必须在4-6之间

### AssignUserToBed
**目的**: 分配用户到床位
**载荷字段**:
- `userId`: string (必需) - 用户ID
- `bedId`: string (必需) - 床位ID

**效果**:
- 创建UserBedAssignment实体
- 更新床位状态为occupied
- 更新宿舍可用床位数

**Stage 2 - 权限**: 仅管理员可操作
**Stage 2 - 业务规则**:
- 用户只能分配到一个床位
- 床位必须可用
- 宿舍不能超过容量

### GetDormitoryInfo
**目的**: 获取宿舍信息
**载荷字段**:
- `dormitoryId`: string (必需) - 宿舍ID

**效果**:
- 返回宿舍基本信息
- 包含床位和住户信息

**Stage 2 - 权限**:
- Admin: 所有宿舍
- DormHead: 所管理宿舍
- Student: 所居住宿舍

### GetDormitoryList
**目的**: 获取宿舍列表
**载荷字段**:
- `status`: string (可选) - 过滤状态

**效果**:
- 返回宿舍列表
- 包含床位占用情况

**Stage 2 - 权限**: 基于角色的数据过滤

## 行为管理交互

### RecordBehavior
**目的**: 记录用户违规行为
**载荷字段**:
- `userId`: string (必需) - 目标用户ID
- `behaviorType`: string (必需) - 违规类型
- `description`: string (必需) - 违规描述
- `penaltyPoints`: number (必需) - 扣分数值

**效果**:
- 创建BehaviorRecord实体
- 自动累计用户总扣分
- 记录时间和记录人信息

**Stage 2 - 权限**:
- Admin: 所有学生
- DormHead: 本宿舍学生

**Stage 2 - 业务规则**: 扣分值必须为正数

### GetBehaviorRecords
**目的**: 查看行为记录
**载荷字段**:
- `userId`: string (可选) - 目标用户ID
- `startDate`: number (可选) - 开始时间戳
- `endDate`: number (可选) - 结束时间戳

**效果**:
- 返回行为记录列表
- 包含扣分统计

**Stage 2 - 权限**:
- Admin: 所有记录
- DormHead: 本宿舍学生记录
- Student: 本人记录

## 踢出管理交互

### CreateExpulsionRequest
**目的**: 申请踢出学生
**载荷字段**:
- `targetUserId`: string (必需) - 目标学生ID
- `reason`: string (必需) - 申请理由

**效果**:
- 创建ExpulsionRequest实体
- 设置状态为pending
- 记录申请时间

**Stage 2 - 权限**: 宿舍长针对本宿舍学生
**Stage 2 - 业务规则**:
- 目标学生扣分达到阈值(100分)
- 同一学生不能有pending状态的申请

### ProcessExpulsionRequest
**目的**: 处理踢出申请
**载荷字段**:
- `requestId`: string (必需) - 申请ID
- `decision`: string (必需) - 决定 (approved/rejected)
- `adminNotes`: string (可选) - 管理员备注

**效果**:
- 更新申请状态
- 如果批准：
  - 用户状态变为expelled
  - 床位分配状态变为inactive
  - 床位状态变为available
- 记录处理时间

**Stage 2 - 权限**: 仅管理员可处理
**Stage 2 - 业务规则**: 申请状态必须为pending

### GetExpulsionRequests
**目的**: 查看踢出申请
**载荷字段**:
- `status`: string (可选) - 过滤状态

**效果**:
- 返回申请列表
- 包含相关用户和申请人信息

**Stage 2 - 权限**:
- Admin: 所有申请
- DormHead: 本人提交的申请

## 实体引用交互

以下交互涉及实体引用，需要使用`isRef: true`和`base`属性:

### UpdateUserBedAssignment
**目的**: 更新床位分配状态
**载荷字段**:
- `assignment`: UserBedAssignment (必需, isRef: true) - 分配记录引用
- `status`: string (必需) - 新状态

### UpdateBedStatus
**目的**: 更新床位状态
**载荷字段**:
- `bed`: Bed (必需, isRef: true) - 床位引用
- `status`: string (必需) - 新状态

## 查询交互模式

### 列表查询模式
```typescript
export const GetDormitoryList = Interaction.create({
  name: 'GetDormitoryList',
  action: Action.create({ name: 'getDormitoryList' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});
```

### 详情查询模式
```typescript
export const GetUserDetail = Interaction.create({
  name: 'GetUserDetail',
  action: Action.create({ name: 'getUserDetail' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      })
    ]
  })
});
```

## 完整交互列表

### 核心业务逻辑交互 (Stage 1)
1. **CreateUser** - 创建用户
2. **AssignDormHead** - 指定宿舍长
3. **CreateDormitory** - 创建宿舍
4. **AssignUserToBed** - 分配床位
5. **RecordBehavior** - 记录违规行为
6. **CreateExpulsionRequest** - 申请踢出
7. **ProcessExpulsionRequest** - 处理踢出申请

### 查询交互 (Stage 1)
8. **GetUserInfo** - 获取用户信息
9. **GetDormitoryInfo** - 获取宿舍信息
10. **GetDormitoryList** - 获取宿舍列表
11. **GetBehaviorRecords** - 查看行为记录
12. **GetExpulsionRequests** - 查看踢出申请

### 更新交互 (Stage 1)
13. **UpdateUserBedAssignment** - 更新床位分配
14. **UpdateBedStatus** - 更新床位状态

## 设计验证清单

- [ ] 所有用户操作都有对应交互
- [ ] Action仅包含name标识符
- [ ] 载荷项目有适当的required标记
- [ ] 集合使用isCollection: true
- [ ] 实体引用使用isRef和base
- [ ] 未包含权限或约束条件
- [ ] 载荷字段与测试用例匹配
- [ ] TypeScript编译通过

## Stage 2 扩展规划

### 权限条件
- 基于用户角色的访问控制
- 基于关系的数据范围限制
- 操作权限的细粒度控制

### 业务规则条件
- 容量和数量限制
- 状态和流程约束
- 时间和业务逻辑验证