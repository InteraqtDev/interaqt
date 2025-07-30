# 宿舍管理系统实体关系设计

## 实体设计

### User (用户)
- **目的**: 系统中的所有用户，包括管理员、宿舍长和学生
- **业务含义**: 代表使用系统的人员，具有不同的角色和权限
- **属性**:
  - `id`: string (系统生成的唯一标识)
  - `name`: string (用户姓名)
  - `email`: string (唯一邮箱标识，用于登录)
  - `role`: string (角色: 'admin' | 'dormHead' | 'student')
  - `score`: number (行为积分，初始值为100，用于违规管理)
  - `status`: string (状态: 'active' | 'kicked'，用于标识是否被踢出)
  - `createdAt`: number (创建时间戳)
  - `updatedAt`: number (更新时间戳)

### Dormitory (宿舍)
- **目的**: 宿舍楼栋或房间实体
- **业务含义**: 表示具体的宿舍单元，有固定的床位容量
- **属性**:
  - `id`: string (唯一标识)
  - `name`: string (宿舍名称，如"A栋101")
  - `capacity`: number (床位数量，4-6个)
  - `currentOccupancy`: number (当前入住人数，计算属性)
  - `availableBeds`: number (可用床位数，计算属性)
  - `createdAt`: number (创建时间戳)
  - `updatedAt`: number (更新时间戳)

### ScoreRule (扣分规则)
- **目的**: 定义各种违规行为对应的扣分规则
- **业务含义**: 标准化的违规行为定义和对应的处罚标准
- **属性**:
  - `id`: string (唯一标识)
  - `name`: string (规则名称，如"晚归"、"不整理内务")
  - `description`: string (规则详细描述)
  - `scoreDeduction`: number (扣分数值，必须为正数)
  - `isActive`: boolean (规则是否启用，默认为true)
  - `createdAt`: number (创建时间戳)
  - `updatedAt`: number (更新时间戳)

### ViolationRecord (违规记录)
- **目的**: 记录用户的具体违规行为实例
- **业务含义**: 用户违规的历史记录，用于积分扣除和统计分析
- **属性**:
  - `id`: string (唯一标识)
  - `description`: string (违规具体描述)
  - `recordedAt`: number (记录时间戳)
  - `scoreDeducted`: number (本次扣除的分数)
  - `status`: string (记录状态: 'active' | 'revoked'，用于撤销错误记录)

### KickoutRequest (踢出申请)
- **目的**: 宿舍长申请踢出违规用户的正式申请
- **业务含义**: 用于管理违规用户移除流程的审批记录
- **属性**:
  - `id`: string (唯一标识)
  - `reason`: string (申请理由)
  - `requestedAt`: number (申请提交时间)
  - `status`: string (申请状态: 'pending' | 'approved' | 'rejected')
  - `processedAt`: number (处理时间，可选)
  - `adminComment`: string (管理员处理意见，可选)

## 关系设计

### UserDormitoryRelation (用户-宿舍关系)
- **类型**: n:1 (多个用户对应一个宿舍)
- **业务含义**: 学生被分配到特定宿舍的特定床位
- **源属性**: `dormitory` (在User实体上，用户可通过user.dormitory访问所在宿舍)
- **目标属性**: `residents` (在Dormitory实体上，宿舍可通过dormitory.residents访问所有住户)
- **关系属性**:
  - `assignedAt`: number (分配时间戳)
  - `bedNumber`: number (床位号，1-6)
  - `status`: string (分配状态: 'active' | 'inactive')

**为什么是n:1**: 
- 一个用户只能被分配到一个宿舍
- 一个宿舍可以有多个用户（4-6个）

### DormitoryHeadRelation (宿舍长关系)
- **类型**: 1:1 (一个宿舍对应一个宿舍长)
- **业务含义**: 指定宿舍的负责管理人员
- **源属性**: `managedDormitory` (在User实体上，宿舍长可通过user.managedDormitory访问管理的宿舍)
- **目标属性**: `dormHead` (在Dormitory实体上，宿舍可通过dormitory.dormHead访问宿舍长)
- **关系属性**:
  - `appointedAt`: number (任命时间戳)
  - `isActive`: boolean (任命是否有效，默认true)

**为什么是1:1**:
- 一个宿舍只能有一个宿舍长
- 一个宿舍长只能管理一个宿舍

### UserViolationRelation (用户-违规记录关系)
- **类型**: 1:n (一个用户对应多个违规记录)
- **业务含义**: 用户的违规行为历史记录
- **源属性**: `violationRecords` (在User实体上，用户可通过user.violationRecords访问所有违规记录)
- **目标属性**: `user` (在ViolationRecord实体上，违规记录通过violationRecord.user访问对应用户)

**为什么是1:n**:
- 一个用户可能有多个违规记录
- 一个违规记录只属于一个特定用户

### ViolationRuleRelation (违规记录-规则关系)
- **类型**: n:1 (多个违规记录对应一个规则)
- **业务含义**: 违规记录基于的扣分规则
- **源属性**: `rule` (在ViolationRecord实体上，违规记录通过violationRecord.rule访问适用规则)
- **目标属性**: `violations` (在ScoreRule实体上，规则通过scoreRule.violations访问所有基于该规则的违规记录)

**为什么是n:1**:
- 多个违规记录可能基于同一个规则（如多次晚归）
- 一个违规记录只基于一个特定规则

### KickoutRequesterRelation (踢出申请-申请人关系)
- **类型**: n:1 (多个申请对应一个申请人)
- **业务含义**: 记录谁发起了踢出申请
- **源属性**: `requester` (在KickoutRequest实体上，申请通过kickoutRequest.requester访问申请人)
- **目标属性**: `kickoutRequests` (在User实体上，用户通过user.kickoutRequests访问发起的申请)

### KickoutTargetRelation (踢出申请-目标用户关系)
- **类型**: n:1 (多个申请对应一个目标用户)
- **业务含义**: 记录申请踢出的目标用户
- **源属性**: `targetUser` (在KickoutRequest实体上，申请通过kickoutRequest.targetUser访问目标用户)
- **目标属性**: `kickoutRequestsAgainst` (在User实体上，用户通过user.kickoutRequestsAgainst访问针对自己的申请)

### KickoutProcessorRelation (踢出申请-处理人关系)
- **类型**: n:1 (多个申请对应一个处理人)
- **业务含义**: 记录管理员处理申请的关系（可选，仅在申请被处理时建立）
- **源属性**: `processor` (在KickoutRequest实体上，申请通过kickoutRequest.processor访问处理人)
- **目标属性**: `processedKickoutRequests` (在User实体上，管理员通过user.processedKickoutRequests访问处理的申请)

## 计算属性设计

### Dormitory 计算属性
1. **currentOccupancy** (当前入住人数):
   - 计算逻辑: 统计与该宿舍有活跃UserDormitoryRelation的用户数量
   - 更新时机: 用户分配或移除时自动更新

2. **availableBeds** (可用床位数):
   - 计算逻辑: capacity - currentOccupancy
   - 更新时机: 入住人数变化时自动更新

### User 计算属性
1. **totalViolations** (违规次数):
   - 计算逻辑: 统计用户的活跃违规记录数量
   - 更新时机: 添加违规记录时自动更新

2. **canBeKickedOut** (是否可被踢出):
   - 计算逻辑: score < 60 && status === 'active'
   - 更新时机: 积分或状态变化时自动更新

## 数据流图

```
用户创建 → 角色分配 → 宿舍分配 → 日常管理 → 违规处理 → 踢出处理
    ↓         ↓         ↓         ↓         ↓         ↓
  User     DormHead   UserDorm   Violation  Request   Status
  实体      关系       关系       记录       申请      更新
    ↓         ↓         ↓         ↓         ↓         ↓
 创建用户   指定管理    建立居住    扣分累积   申请审批   移除关系
```

## 实体关系总览

```
User
├── UserDormitoryRelation (n:1) → Dormitory
├── DormitoryHeadRelation (1:1) → Dormitory (仅宿舍长)
├── UserViolationRelation (1:n) → ViolationRecord
├── KickoutRequesterRelation (1:n) → KickoutRequest (作为申请人)
├── KickoutTargetRelation (1:n) → KickoutRequest (作为目标)
└── KickoutProcessorRelation (1:n) → KickoutRequest (作为处理人)

Dormitory
├── UserDormitoryRelation (1:n) → User (residents)
└── DormitoryHeadRelation (1:1) → User (dormHead)

ScoreRule
└── ViolationRuleRelation (1:n) → ViolationRecord

ViolationRecord
├── UserViolationRelation (n:1) → User
└── ViolationRuleRelation (n:1) → ScoreRule

KickoutRequest
├── KickoutRequesterRelation (n:1) → User (requester)
├── KickoutTargetRelation (n:1) → User (targetUser)
└── KickoutProcessorRelation (n:1) → User (processor, optional)
```

## 关键约束和验证

### 数据完整性约束
1. **唯一性约束**:
   - User.email 必须唯一
   - Dormitory.name 必须唯一
   - 同一宿舍内 UserDormitoryRelation.bedNumber 必须唯一

2. **引用完整性约束**:
   - 所有关系的源和目标实体必须存在
   - 删除实体前必须处理相关的关系

### 业务逻辑约束
1. **容量约束**:
   - Dormitory.capacity 必须在 4-6 之间
   - UserDormitoryRelation.bedNumber 不能超过对应宿舍的容量
   - 宿舍的 currentOccupancy 不能超过 capacity

2. **状态约束**:
   - 被踢出的用户 (status='kicked') 不能建立新的 UserDormitoryRelation
   - 同一用户只能有一个活跃的 UserDormitoryRelation
   - 同一宿舍只能有一个活跃的 DormitoryHeadRelation

3. **积分约束**:
   - User.score 不能为负数
   - ScoreRule.scoreDeduction 必须为正数
   - ViolationRecord.scoreDeducted 必须与对应规则的 scoreDeduction 一致

### 时间约束
1. **时序约束**:
   - 所有 recordedAt、requestedAt、processedAt 时间戳必须合理
   - processedAt 必须晚于 requestedAt
   - assignedAt 必须晚于宿舍创建时间

## 设计决策说明

### 为什么分离 User 和角色
- 用户的角色可能会变化（学生可能被提升为宿舍长）
- 便于权限管理和业务逻辑处理
- 支持未来可能的多角色需求

### 为什么独立设计 ScoreRule
- 扣分规则可能会变化或增加
- 便于管理员统一管理违规标准
- 支持规则的启用/禁用功能
- 便于统计和分析违规类型

### 为什么使用多个关系表示 KickoutRequest
- 清晰地表示申请人、目标用户、处理人的不同角色
- 支持复杂的查询需求（如查询某用户发起的申请、针对某用户的申请等）
- 便于扩展更复杂的审批流程

### 为什么使用计算属性
- 避免数据冗余和不一致
- 自动保持数据的实时性
- 简化业务逻辑实现