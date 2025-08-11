# 宿舍管理系统详细需求分析

## 1. 系统概述

宿舍管理系统是一个用于高校或企业宿舍管理的业务系统，支持宿舍创建、人员分配、违规管理和踢出申请等核心功能。系统采用角色权限管理，确保不同角色用户只能执行授权的操作。

## 2. 用户角色定义

### 2.1 管理员 (admin)
- **职责**：系统的最高权限管理者
- **权限**：
  - 创建和管理宿舍
  - 指定宿舍长
  - 分配用户到宿舍床位
  - 审批踢出申请
  - 查看所有系统数据

### 2.2 宿舍长 (dormHead)
- **职责**：负责管理特定宿舍的日常事务
- **权限**：
  - 记录宿舍成员的违规行为
  - 申请踢出违规严重的成员
  - 查看所管理宿舍的详细信息
  - 查看宿舍成员的违规记录

### 2.3 普通用户/学生 (student)
- **职责**：宿舍的普通住户
- **权限**：
  - 查看自己的宿舍信息
  - 查看自己的违规记录
  - 查看同宿舍成员的基本信息

## 3. 数据实体分析

### 3.1 User（用户）
**用途**：系统中的所有用户账户
**属性**：
- id: string - 系统生成的唯一标识
- name: string - 用户姓名
- email: string - 用户邮箱（唯一）
- role: string - 用户角色 (admin/dormHead/student)
- status: string - 用户状态 (active/inactive/evicted)
- violationScore: number - 累计违规分数（默认0）
- createdAt: number - 创建时间戳
- updatedAt: number - 更新时间戳

### 3.2 Dormitory（宿舍）
**用途**：宿舍楼或宿舍房间
**属性**：
- id: string - 系统生成的唯一标识
- name: string - 宿舍名称（如"A栋301"）
- capacity: number - 床位容量（4-6）
- status: string - 宿舍状态 (active/inactive)
- createdAt: number - 创建时间戳
- updatedAt: number - 更新时间戳

### 3.3 Bed（床位）
**用途**：宿舍内的单个床位
**属性**：
- id: string - 系统生成的唯一标识
- number: number - 床位编号（1-6）
- status: string - 床位状态 (available/occupied)
- createdAt: number - 创建时间戳
- updatedAt: number - 更新时间戳

### 3.4 ViolationRecord（违规记录）
**用途**：记录用户的违规行为
**属性**：
- id: string - 系统生成的唯一标识
- reason: string - 违规原因描述
- score: number - 扣分值（1-10分）
- createdAt: number - 记录时间戳

### 3.5 EvictionRequest（踢出申请）
**用途**：宿舍长对违规用户的踢出申请
**属性**：
- id: string - 系统生成的唯一标识
- reason: string - 申请理由
- status: string - 申请状态 (pending/approved/rejected)
- createdAt: number - 申请时间戳
- processedAt: number - 处理时间戳（可选）
- adminComment: string - 管理员处理意见（可选）

## 4. 关系定义

### 4.1 UserDormitoryRelation（用户-宿舍关系）
- **类型**：n:1（多个用户对应一个宿舍）
- **含义**：用户被分配到的宿舍
- **源属性**：dormitory（在User上）
- **目标属性**：users（在Dormitory上）
- **关系属性**：
  - assignedAt: number - 分配时间戳
  - assignedBy: string - 分配人ID

### 4.2 UserBedRelation（用户-床位关系）
- **类型**：1:1（一个用户对应一个床位）
- **含义**：用户占用的具体床位
- **源属性**：bed（在User上）
- **目标属性**：occupant（在Bed上）
- **关系属性**：
  - assignedAt: number - 分配时间戳

### 4.3 DormitoryBedsRelation（宿舍-床位关系）
- **类型**：1:n（一个宿舍对应多个床位）
- **含义**：宿舍包含的所有床位
- **源属性**：beds（在Dormitory上）
- **目标属性**：dormitory（在Bed上）

### 4.4 DormitoryDormHeadRelation（宿舍-宿舍长关系）
- **类型**：1:1（一个宿舍对应一个宿舍长）
- **含义**：负责管理该宿舍的宿舍长
- **源属性**：dormHead（在Dormitory上）
- **目标属性**：managedDormitory（在User上）
- **关系属性**：
  - appointedAt: number - 任命时间戳

### 4.5 UserViolationRelation（用户-违规记录关系）
- **类型**：1:n（一个用户对应多个违规记录）
- **含义**：用户的所有违规记录
- **源属性**：violations（在User上）
- **目标属性**：user（在ViolationRecord上）

### 4.6 ViolationRecorderRelation（违规记录-记录人关系）
- **类型**：n:1（多个违规记录对应一个记录人）
- **含义**：记录违规的宿舍长
- **源属性**：recordedBy（在ViolationRecord上）
- **目标属性**：recordedViolations（在User上）

### 4.7 EvictionRequestUserRelation（踢出申请-用户关系）
- **类型**：n:1（多个申请对应一个用户）
- **含义**：被申请踢出的用户
- **源属性**：targetUser（在EvictionRequest上）
- **目标属性**：evictionRequests（在User上）

### 4.8 EvictionRequestDormHeadRelation（踢出申请-宿舍长关系）
- **类型**：n:1（多个申请对应一个宿舍长）
- **含义**：发起申请的宿舍长
- **源属性**：requestedBy（在EvictionRequest上）
- **目标属性**：submittedEvictions（在User上）

### 4.9 EvictionRequestAdminRelation（踢出申请-管理员关系）
- **类型**：n:1（多个申请对应一个管理员）
- **含义**：处理申请的管理员
- **源属性**：processedBy（在EvictionRequest上）
- **目标属性**：processedEvictions（在User上）

## 5. 业务流程

### 5.1 宿舍创建流程
1. 管理员创建宿舍，指定名称和容量
2. 系统自动创建对应数量的床位（编号1到capacity）
3. 所有床位初始状态为"available"

### 5.2 用户分配流程
1. 管理员选择用户和目标宿舍
2. 系统检查宿舍是否有空床位
3. 如果有空床位，分配用户到该宿舍的第一个空床位
4. 更新床位状态为"occupied"
5. 建立用户与宿舍、用户与床位的关系

### 5.3 宿舍长任命流程
1. 管理员选择一个宿舍和一个用户
2. 检查用户是否已经是该宿舍的成员
3. 更新用户角色为"dormHead"
4. 建立宿舍与宿舍长的关系

### 5.4 违规记录流程
1. 宿舍长选择本宿舍的一个成员
2. 填写违规原因和扣分值（1-10分）
3. 创建违规记录
4. 更新用户的累计违规分数

### 5.5 踢出申请流程
1. 宿舍长检查某用户的累计违规分数
2. 如果分数达到阈值（如30分），可以发起踢出申请
3. 填写申请理由，创建踢出申请（状态为pending）
4. 管理员审核申请
5. 如果批准：
   - 更新申请状态为approved
   - 更新用户状态为evicted
   - 释放用户占用的床位
   - 解除用户与宿舍的关系
6. 如果拒绝：
   - 更新申请状态为rejected
   - 记录拒绝理由

## 6. 业务规则

### 6.1 宿舍管理规则
- 宿舍容量必须在4-6之间
- 宿舍名称必须唯一
- 宿舍创建后自动生成对应数量的床位
- 不能删除有人居住的宿舍

### 6.2 用户分配规则
- 每个用户只能被分配到一个宿舍
- 每个用户只能占用一个床位
- 只有状态为active的用户才能被分配宿舍
- 被踢出(evicted)的用户不能再被分配到任何宿舍

### 6.3 宿舍长规则
- 每个宿舍只能有一个宿舍长
- 宿舍长必须是该宿舍的成员
- 宿舍长不能记录自己的违规
- 宿舍长不能申请踢出自己

### 6.4 违规管理规则
- 违规扣分范围为1-10分
- 违规记录一旦创建不可删除或修改
- 累计违规分数只增不减
- 只有宿舍长可以记录本宿舍成员的违规

### 6.5 踢出申请规则
- 只有当用户累计违规分数≥30分时，才能发起踢出申请
- 一个用户可以有多个pending状态的踢出申请
- 一旦有申请被批准，用户立即被踢出
- 被踢出的用户不能再被分配到任何宿舍（除非管理员重新激活其账户）

## 7. 计算属性

### 7.1 Dormitory计算属性
- occupiedBeds: number - 已占用床位数（通过beds关系计算）
- availableBeds: number - 可用床位数（capacity - occupiedBeds）
- occupancyRate: number - 入住率（occupiedBeds / capacity）

### 7.2 User计算属性
- violationCount: number - 违规次数（violations关系的数量）
- canBeEvicted: boolean - 是否可被踢出（violationScore >= 30）
- isAssigned: boolean - 是否已分配宿舍（dormitory关系是否存在）

### 7.3 EvictionRequest计算属性
- isPending: boolean - 是否待处理（status === 'pending'）
- isProcessed: boolean - 是否已处理（status !== 'pending'）

## 8. 状态管理

### 8.1 User状态
- active: 正常状态，可以被分配宿舍
- inactive: 非活跃状态，暂时不能分配宿舍
- evicted: 被踢出状态，永久不能分配宿舍

### 8.2 Bed状态
- available: 可用，可以分配给用户
- occupied: 已占用，有用户居住

### 8.3 EvictionRequest状态
- pending: 待审核，等待管理员处理
- approved: 已批准，用户已被踢出
- rejected: 已拒绝，申请被驳回

### 8.4 Dormitory状态
- active: 正常使用
- inactive: 停用，不接受新的分配

## 9. 权限矩阵

| 操作 | 管理员 | 宿舍长 | 普通用户 |
|------|--------|--------|----------|
| 创建宿舍 | ✓ | ✗ | ✗ |
| 指定宿舍长 | ✓ | ✗ | ✗ |
| 分配用户到宿舍 | ✓ | ✗ | ✗ |
| 记录违规 | ✗ | ✓ | ✗ |
| 申请踢出 | ✗ | ✓ | ✗ |
| 审批踢出申请 | ✓ | ✗ | ✗ |
| 查看所有宿舍 | ✓ | ✗ | ✗ |
| 查看本宿舍信息 | ✓ | ✓ | ✓ |
| 查看所有用户 | ✓ | ✗ | ✗ |
| 查看本宿舍成员 | ✓ | ✓ | ✓ |
| 查看自己信息 | ✓ | ✓ | ✓ |

## 10. 数据约束

### 10.1 唯一性约束
- User.email 必须唯一
- Dormitory.name 必须唯一
- 一个用户只能占用一个床位
- 一个床位只能被一个用户占用
- 一个宿舍只能有一个宿舍长

### 10.2 引用完整性
- 删除用户前必须解除所有关系
- 删除宿舍前必须确保没有用户居住
- 违规记录不可删除（审计需要）

### 10.3 数值约束
- Dormitory.capacity: 4-6
- ViolationRecord.score: 1-10
- User.violationScore: >= 0
- Bed.number: 1-capacity

## 11. 非功能需求

### 11.1 性能要求
- 用户分配操作应在1秒内完成
- 违规记录创建应实时更新用户累计分数
- 踢出操作应立即生效

### 11.2 可靠性要求
- 所有操作必须保证事务性
- 关键操作（如踢出）需要记录操作日志
- 系统应支持数据备份和恢复

### 11.3 安全性要求
- 严格的角色权限控制
- 所有操作必须有用户身份验证
- 敏感操作需要记录审计日志

### 11.4 可扩展性
- 支持未来添加更多角色类型
- 支持自定义违规规则和分数
- 支持批量操作（如批量分配）
