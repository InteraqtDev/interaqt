# 宿舍管理系统交互设计

## 设计原则
根据interaqt框架的最佳实践：
- 交互是修改系统状态的唯一方式
- Action只作为标识符，不包含执行逻辑
- Payload定义交互所需的参数
- Stage 1专注核心业务逻辑，不包含权限和业务规则
- Stage 2添加条件验证（权限控制和业务规则）

## 核心业务逻辑交互 (Stage 1)

### 1. CreateDormitory (创建宿舍)
**业务目的**: 管理员创建新宿舍
**执行效果**:
- 创建新的Dormitory实体
- 根据capacity自动创建对应数量的Bed实体
- 建立DormitoryBedRelation关系
- 初始化occupiedBeds为0

**Payload设计**:
```typescript
{
  name: string;      // 宿舍名称 (必需)
  capacity: number;  // 床位数量 (必需)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行
- 业务规则: capacity必须在4-6范围内

### 2. AssignDormHead (指定宿舍长)
**业务目的**: 管理员指定某用户为宿舍长
**执行效果**:
- 创建DormitoryHeadRelation关系
- 更新用户role为dormHead
- 记录指定时间和指定人

**Payload设计**:
```typescript
{
  userId: string;      // 目标用户ID (必需)
  dormitoryId: string; // 宿舍ID (必需)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行
- 业务规则: 目标用户当前必须为student角色，宿舍不能已有宿舍长

### 3. AssignUserToBed (分配用户到床位)
**业务目的**: 管理员将学生分配到具体床位
**执行效果**:
- 创建UserBedRelation关系
- 创建UserDormitoryRelation关系
- 更新床位status为occupied
- 增加宿舍occupiedBeds计数

**Payload设计**:
```typescript
{
  userId: string;      // 目标用户ID (必需)
  dormitoryId: string; // 宿舍ID (必需)
  bedNumber: number;   // 床位编号 (必需)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行
- 业务规则: 用户未被分配到其他宿舍，目标床位可用，宿舍有剩余容量

### 4. RecordScore (记录扣分)
**业务目的**: 宿舍长给学生记录扣分
**执行效果**:
- 创建ScoreRecord实体
- 建立UserScoreRelation关系
- 记录扣分者信息
- 自动更新用户总扣分

**Payload设计**:
```typescript
{
  targetUserId: string; // 被扣分用户ID (必需)
  reason: string;       // 扣分原因 (必需)
  points: number;       // 扣分数值 (必需)
}
```

**Stage 2扩展**:
- 权限: 仅宿舍长可对本宿舍学生执行，不能给自己扣分
- 业务规则: points必须为正数，reason不能为空

### 5. RequestKickout (申请踢出用户)
**业务目的**: 宿舍长申请踢出违规学生
**执行效果**:
- 创建KickoutRequest实体
- 建立申请相关的关系（申请人、目标用户）
- 设置申请状态为pending
- 记录申请时间

**Payload设计**:
```typescript
{
  targetUserId: string; // 被申请踢出用户ID (必需)
  reason: string;       // 申请原因 (必需)
}
```

**Stage 2扩展**:
- 权限: 仅宿舍长可对本宿舍学生执行
- 业务规则: 目标用户扣分达到100分阈值，无重复pending申请

### 6. ProcessKickoutRequest (处理踢出申请)
**业务目的**: 管理员审批踢出申请
**执行效果**:
- 更新申请状态（approved/rejected）
- 设置处理时间和处理备注
- 建立RequestProcessorRelation关系
- 如果批准：执行踢出操作（删除用户关系，释放床位）

**Payload设计**:
```typescript
{
  requestId: string;    // 申请ID (必需)
  decision: string;     // 决定 approved/rejected (必需)
  processNote?: string; // 处理备注 (可选)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行
- 业务规则: 申请状态必须为pending，decision必须为有效值

## 查询交互设计

### 7. GetDormitoryInfo (查看宿舍信息)
**业务目的**: 获取宿舍详细信息
**执行效果**:
- 返回宿舍基本信息
- 返回床位占用情况
- 返回宿舍成员列表
- 返回宿舍长信息

**Payload设计**:
```typescript
{
  dormitoryId: string; // 宿舍ID (必需)
}
```

**Stage 2扩展**:
- 权限: 管理员可查看任意宿舍，宿舍长只能查看管理的宿舍

### 8. GetDormitoryMembers (查看宿舍成员)
**业务目的**: 获取宿舍成员列表
**执行效果**:
- 返回宿舍所有成员信息
- 包含床位分配情况
- 包含成员扣分统计

**Payload设计**:
```typescript
{
  dormitoryId: string; // 宿舍ID (必需)
}
```

**Stage 2扩展**:
- 权限: 管理员可查看任意宿舍，宿舍长只能查看管理的宿舍

### 9. GetUserScoreHistory (查看扣分记录)
**业务目的**: 获取用户扣分历史
**执行效果**:
- 返回用户所有扣分记录
- 按时间倒序排列
- 包含总扣分统计

**Payload设计**:
```typescript
{
  userId: string; // 用户ID (必需)
}
```

**Stage 2扩展**:
- 权限: 管理员可查看任意用户，宿舍长只能查看本宿舍学生，学生只能查看自己

### 10. GetMyDormitoryInfo (查看我的宿舍信息)
**业务目的**: 学生查看自己的宿舍信息
**执行效果**:
- 返回用户所在宿舍信息
- 返回室友信息
- 返回自己的床位信息

**Payload设计**:
```typescript
{
  // 无需参数，通过用户身份获取
}
```

**Stage 2扩展**:
- 权限: 学生只能查看自己的宿舍信息

### 11. GetMyScoreHistory (查看我的扣分记录)
**业务目的**: 学生查看自己的扣分记录
**执行效果**:
- 返回自己的扣分记录
- 包含总扣分统计

**Payload设计**:
```typescript
{
  // 无需参数，通过用户身份获取
}
```

**Stage 2扩展**:
- 权限: 学生只能查看自己的扣分记录

## 管理查询交互

### 12. GetAllDormitories (查看所有宿舍)
**业务目的**: 管理员查看系统中所有宿舍
**执行效果**:
- 返回所有宿舍列表
- 包含占用率统计
- 包含宿舍长信息

**Payload设计**:
```typescript
{
  status?: string;  // 筛选状态 (可选)
  limit?: number;   // 分页限制 (可选)
  offset?: number;  // 分页偏移 (可选)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行

### 13. GetAllUsers (查看所有用户)
**业务目的**: 管理员查看系统中所有用户
**执行效果**:
- 返回所有用户列表
- 包含角色和宿舍分配情况
- 包含扣分统计

**Payload设计**:
```typescript
{
  role?: string;     // 筛选角色 (可选)
  dormitoryId?: string; // 筛选宿舍 (可选)
  limit?: number;    // 分页限制 (可选)
  offset?: number;   // 分页偏移 (可选)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行

### 14. GetKickoutRequests (查看踢出申请)
**业务目的**: 管理员查看待处理的踢出申请
**执行效果**:
- 返回踢出申请列表
- 包含申请详情和相关用户信息
- 支持状态筛选

**Payload设计**:
```typescript
{
  status?: string;   // 筛选状态 pending/approved/rejected (可选)
  limit?: number;    // 分页限制 (可选)
  offset?: number;   // 分页偏移 (可选)
}
```

**Stage 2扩展**:
- 权限: 仅管理员可执行

## 交互实现要点

### Stage 1实现重点
1. **专注核心功能**: 确保基本CRUD操作正确执行  
2. **忽略权限检查**: 所有交互都能被任何用户调用
3. **忽略业务规则**: 不验证容量限制、扣分阈值等
4. **确保关系正确**: 实体间关系正确建立和维护
5. **数据一致性**: 确保相关计算属性正确更新

### Stage 2扩展要点
1. **添加权限条件**: 基于用户角色和数据归属关系
2. **添加业务规则**: 验证容量、阈值、状态等约束
3. **保持Stage 1测试**: 原有测试应继续通过
4. **添加失败测试**: 验证权限拒绝和规则违反

### PayloadItem设计规范
```typescript
// 基本字段
PayloadItem.create({ 
  name: 'fieldName', 
  required: true 
})

// 实体引用
PayloadItem.create({ 
  name: 'entityRef',
  base: EntityName,
  isRef: true,
  required: true 
})

// 集合数据
PayloadItem.create({ 
  name: 'items',
  isCollection: true,
  required: true 
})

// 可选参数
PayloadItem.create({ 
  name: 'optionalField'
  // required默认为false
})
```

## 实现清单

### Stage 1基础交互实现
- [ ] CreateDormitory - 创建宿舍
- [ ] AssignDormHead - 指定宿舍长  
- [ ] AssignUserToBed - 分配床位
- [ ] RecordScore - 记录扣分
- [ ] RequestKickout - 申请踢出
- [ ] ProcessKickoutRequest - 处理申请
- [ ] GetDormitoryInfo - 查看宿舍信息
- [ ] GetUserScoreHistory - 查看扣分记录
- [ ] GetMyDormitoryInfo - 查看我的宿舍
- [ ] GetAllDormitories - 查看所有宿舍 (管理员)
- [ ] GetKickoutRequests - 查看踢出申请 (管理员)

### Stage 2权限和规则扩展
- [ ] 添加基于角色的权限条件
- [ ] 添加数据归属权限条件  
- [ ] 添加业务规则验证条件
- [ ] 实现错误处理和消息返回

### 验证要点
- [ ] 所有Action只包含name字段
- [ ] 所有PayloadItem正确设置required标志
- [ ] 实体引用使用isRef和base
- [ ] 集合参数使用isCollection
- [ ] TypeScript编译通过
- [ ] 交互名称清晰且符合业务语义