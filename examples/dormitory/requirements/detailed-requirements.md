# 宿舍管理系统详细需求分析

## 系统概述
构建一个宿舍管理系统，支持管理员、宿舍长和学生三种角色，实现宿舍分配、用户管理和违规处理功能。

## 数据视角分析

### 核心实体识别

#### User (用户)
- **目的**: 系统中的所有用户，包括管理员、宿舍长、学生
- **属性**:
  - id: string (系统生成的唯一标识)
  - name: string (用户姓名)
  - email: string (唯一邮箱标识)
  - role: string (角色: 'admin' | 'dormHead' | 'student')
  - score: number (行为积分，初始值为100)
  - status: string (状态: 'active' | 'kicked')

#### Dormitory (宿舍)
- **目的**: 宿舍楼栋或房间
- **属性**:
  - id: string (唯一标识)
  - name: string (宿舍名称)
  - capacity: number (床位数量，4-6个)
  - currentOccupancy: number (当前入住人数，计算属性)
  - availableBeds: number (可用床位，计算属性)

#### ScoreRule (扣分规则)
- **目的**: 定义各种违规行为对应的扣分规则
- **属性**:
  - id: string
  - name: string (规则名称，如"晚归"、"不整理内务")
  - description: string (规则描述)
  - scoreDeduction: number (扣分数值)
  - isActive: boolean (规则是否启用)

#### ViolationRecord (违规记录)
- **目的**: 记录用户的违规行为
- **属性**:
  - id: string
  - description: string (违规描述)
  - recordedAt: number (记录时间戳)
  - scoreDeducted: number (扣除分数)

#### KickoutRequest (踢出申请)
- **目的**: 宿舍长申请踢出违规用户
- **属性**:
  - id: string
  - reason: string (申请理由)
  - requestedAt: number (申请时间)
  - status: string ('pending' | 'approved' | 'rejected')
  - processedAt: number (处理时间)
  - adminComment: string (管理员备注)

### 关系分析

#### UserDormitoryRelation (用户-宿舍关系)
- **类型**: n:1 (多个用户对应一个宿舍)
- **目的**: 分配学生到宿舍床位
- **源属性**: `dormitory` (在User实体上)
- **目标属性**: `residents` (在Dormitory实体上)
- **关系属性**:
  - assignedAt: number (分配时间)
  - bedNumber: number (床位号)
  - status: string ('active' | 'inactive')

#### DormitoryHeadRelation (宿舍长关系)
- **类型**: 1:1 (一个宿舍对应一个宿舍长)
- **目的**: 指定宿舍的管理者
- **源属性**: `managedDormitory` (在User实体上)
- **目标属性**: `dormHead` (在Dormitory实体上)
- **关系属性**:
  - appointedAt: number (任命时间)
  - isActive: boolean (是否活跃)

#### UserViolationRelation (用户-违规记录关系)
- **类型**: 1:n (一个用户对应多个违规记录)
- **目的**: 关联用户和其违规行为
- **源属性**: `violationRecords` (在User实体上)
- **目标属性**: `user` (在ViolationRecord实体上)

#### ViolationRuleRelation (违规记录-规则关系)
- **类型**: n:1 (多个违规记录对应一个规则)
- **目的**: 关联违规记录和对应的扣分规则
- **源属性**: `rule` (在ViolationRecord实体上)
- **目标属性**: `violations` (在ScoreRule实体上)

#### KickoutRequestRelation (踢出申请关系)
- **类型**: 涉及多个实体的复合关系
- **申请人关系**: 1:n (一个宿舍长可以发起多个申请)
- **被申请人关系**: 1:n (一个用户可能被多次申请踢出)
- **处理人关系**: 1:n (一个管理员可以处理多个申请)

## 交互视角分析

### 用户操作识别

#### 管理员操作
1. **创建宿舍** - CreateDormitory
2. **指定宿舍长** - AssignDormHead
3. **分配用户到宿舍** - AssignUserToDormitory
4. **创建/管理扣分规则** - CreateScoreRule, UpdateScoreRule
5. **处理踢出申请** - ProcessKickoutRequest
6. **查看系统概况** - ViewSystemOverview

#### 宿舍长操作
1. **记录违规行为** - RecordViolation
2. **申请踢出用户** - RequestKickout
3. **查看宿舍成员** - ViewDormitoryMembers
4. **查看违规统计** - ViewViolationStats

#### 学生操作
1. **查看个人信息** - ViewProfile
2. **查看违规记录** - ViewMyViolations
3. **查看宿舍信息** - ViewDormitoryInfo

### 权限控制需求
- **管理员**: 拥有所有操作权限
- **宿舍长**: 只能管理自己负责的宿舍
- **学生**: 只能查看与自己相关的信息

### 业务流程分析

#### 用户分配流程
1. 管理员创建宿舍
2. 管理员指定宿舍长
3. 管理员将学生分配到宿舍床位

#### 违规处理流程
1. 宿舍长发现违规行为
2. 宿舍长记录违规，系统自动扣分
3. 如果用户分数过低，宿舍长可申请踢出
4. 管理员审核踢出申请
5. 如果批准，用户被踢出宿舍

## 业务规则定义

### 床位管理规则
- 每个宿舍床位数量为4-6个
- 每个用户只能被分配到一个宿舍的一个床位
- 床位分配不能超过宿舍容量

### 积分管理规则
- 新用户初始积分为100分
- 积分低于60分时，宿舍长可以申请踢出
- 积分扣除按照预定义规则执行

### 权限控制规则
- 只有管理员可以创建宿舍和指定宿舍长
- 宿舍长只能管理自己负责的宿舍
- 用户被踢出后状态变为'kicked'，不能再被分配宿舍

### 申请处理规则
- 同一用户在同一时间只能有一个待处理的踢出申请
- 踢出申请需要管理员审核批准
- 申请批准后，用户立即从宿舍移除

## 数据流图

```
用户创建 → 角色分配 → 宿舍分配 → 日常管理 → 违规处理 → 踢出处理
    ↓         ↓         ↓         ↓         ↓         ↓
  User    DormHead   UserDorm   Violation  Request  Status
  实体     关系       关系       记录       申请      更新
```

## 系统约束

### 数据约束
- 用户邮箱必须唯一
- 宿舍名称必须唯一
- 床位号在同一宿舍内必须唯一
- 积分不能为负数

### 业务约束
- 一个宿舍只能有一个宿舍长
- 用户只能被分配到一个宿舍
- 已被踢出的用户不能再被分配宿舍
- 扣分规则的分数必须为正数

## 扩展需求考虑

### 可能的未来功能
- 违规行为统计报表
- 宿舍评分排名
- 积分恢复机制
- 批量操作功能
- 消息通知系统

### 性能考虑
- 支持多个宿舍并发管理
- 快速查询用户分配状态
- 高效的积分计算和更新