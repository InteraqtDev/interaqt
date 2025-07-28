# 宿舍管理系统详细需求分析

## 系统概述
本系统是一个宿舍管理系统，用于管理宿舍、用户、床位分配和违规行为处理。

## 用户角色分析

### 1. 系统管理员 (admin)
- **权限**：系统最高权限
- **职责**：
  - 创建和管理宿舍
  - 指定宿舍长
  - 分配用户到宿舍
  - 审批踢出申请
  - 管理扣分规则

### 2. 宿舍长 (dormHead) 
- **权限**：管理所负责的宿舍
- **职责**：
  - 查看本宿舍成员信息
  - 对本宿舍成员进行扣分
  - 申请踢出违规用户
  - 查看本宿舍的违规记录

### 3. 普通学生 (student)
- **权限**：基本查看权限
- **职责**：
  - 查看自己的宿舍信息
  - 查看自己的扣分记录
  - 查看宿舍成员信息

## 数据实体分析

### 1. 用户 (User)
- **属性**：
  - id: string - 用户唯一标识
  - name: string - 用户姓名
  - email: string - 邮箱地址
  - role: string - 用户角色 (admin/dormHead/student)
  - totalScore: number - 当前总扣分
  - status: string - 用户状态 (active/kicked/pending_kick)

### 2. 宿舍 (Dormitory)
- **属性**：
  - id: string - 宿舍唯一标识
  - name: string - 宿舍名称
  - capacity: number - 床位数量 (4-6)
  - currentOccupancy: number - 当前入住人数
  - status: string - 宿舍状态 (active/inactive)

### 3. 床位 (Bed)
- **属性**：
  - id: string - 床位唯一标识
  - number: number - 床位号
  - status: string - 床位状态 (occupied/available)

### 4. 扣分记录 (ScoreRecord)
- **属性**：
  - id: string - 记录唯一标识
  - reason: string - 扣分原因
  - score: number - 扣分数值
  - createdAt: number - 创建时间
  - status: string - 记录状态 (active/revoked)

### 5. 踢出申请 (KickRequest)
- **属性**：
  - id: string - 申请唯一标识
  - reason: string - 申请理由
  - requestedAt: number - 申请时间
  - status: string - 申请状态 (pending/approved/rejected)
  - processedAt: number - 处理时间

### 6. 扣分规则 (ScoreRule)
- **属性**：
  - id: string - 规则唯一标识
  - name: string - 规则名称
  - description: string - 规则描述
  - score: number - 扣分数值
  - category: string - 违规类别
  - isActive: boolean - 是否启用

## 关系分析

### 1. 用户-宿舍关系 (UserDormitoryRelation)
- **类型**：n:1 (多个用户对一个宿舍)
- **属性**：
  - assignedAt: number - 分配时间
  - status: string - 分配状态 (active/inactive)
- **访问属性**：
  - user.dormitory - 用户的宿舍
  - dormitory.users - 宿舍的所有用户

### 2. 用户-床位关系 (UserBedRelation)
- **类型**：1:1 (一个用户对一个床位)
- **属性**：
  - assignedAt: number - 分配时间
  - status: string - 分配状态 (active/inactive)
- **访问属性**：
  - user.bed - 用户的床位
  - bed.user - 床位的用户

### 3. 宿舍-床位关系 (DormitoryBedRelation)
- **类型**：1:n (一个宿舍对多个床位)
- **属性**：无额外属性
- **访问属性**：
  - dormitory.beds - 宿舍的所有床位
  - bed.dormitory - 床位所属宿舍

### 4. 宿舍-宿舍长关系 (DormitoryHeadRelation)
- **类型**：1:1 (一个宿舍对一个宿舍长)
- **属性**：
  - appointedAt: number - 任命时间
  - status: string - 任命状态 (active/inactive)
- **访问属性**：
  - dormitory.head - 宿舍长
  - user.managedDormitory - 用户管理的宿舍

### 5. 用户-扣分记录关系 (UserScoreRecordRelation)
- **类型**：1:n (一个用户对多个扣分记录)
- **属性**：无额外属性
- **访问属性**：
  - user.scoreRecords - 用户的扣分记录
  - scoreRecord.user - 扣分记录的用户

### 6. 扣分记录-操作者关系 (ScoreRecordOperatorRelation)
- **类型**：n:1 (多个扣分记录对一个操作者)
- **属性**：无额外属性
- **访问属性**：
  - scoreRecord.operator - 扣分记录的操作者
  - user.operatedScoreRecords - 用户操作的扣分记录

### 7. 踢出申请-相关用户关系 (KickRequestRelations)
- **申请人关系 (KickRequestRequesterRelation)**：n:1
  - kickRequest.requester - 申请人
  - user.requestedKicks - 用户发起的踢出申请
- **被申请人关系 (KickRequestTargetRelation)**：n:1
  - kickRequest.target - 被申请踢出的用户
  - user.receivedKicks - 用户收到的踢出申请
- **审批人关系 (KickRequestApproverRelation)**：n:1
  - kickRequest.approver - 审批人
  - user.approvedKicks - 用户审批的踢出申请

## 业务流程分析

### 1. 宿舍管理流程
1. 管理员创建宿舍 → 自动创建对应床位
2. 管理员指定宿舍长 → 用户角色更新为dormHead
3. 管理员分配用户到宿舍 → 建立用户-宿舍-床位关系

### 2. 扣分管理流程
1. 宿舍长发现违规行为 → 创建扣分记录
2. 扣分记录创建 → 用户总扣分自动更新
3. 总扣分达到阈值 → 触发踢出条件

### 3. 踢出申请流程
1. 宿舍长申请踢出用户 → 创建踢出申请
2. 管理员审核申请 → 更新申请状态
3. 申请批准 → 用户状态更新，解除宿舍关系

## 业务规则分析

### 1. 宿舍容量规则
- 每个宿舍必须有4-6个床位
- 宿舍入住人数不能超过床位数
- 每个用户只能分配到一个宿舍的一个床位

### 2. 角色权限规则
- 只有管理员可以创建宿舍和指定宿舍长
- 宿舍长只能管理自己负责的宿舍
- 学生只能查看自己相关的信息

### 3. 扣分规则
- 扣分记录一旦创建不可修改，只能撤销
- 用户总扣分达到10分时，宿舍长可以申请踢出
- 被踢出的用户状态变为kicked，失去宿舍分配

### 4. 踢出申请规则
- 只有宿舍长可以申请踢出本宿舍的用户
- 用户总扣分必须达到10分才能申请踢出
- 踢出申请需要管理员审批
- 申请一旦批准不可撤销

## 数据完整性约束

### 1. 唯一性约束
- 用户邮箱必须唯一
- 宿舍名称必须唯一
- 每个宿舍内床位号必须唯一

### 2. 引用完整性约束
- 扣分记录必须关联到有效用户
- 踢出申请的目标用户必须在申请人管理的宿舍内
- 床位必须属于某个宿舍

### 3. 状态一致性约束
- 被踢出用户不能有活跃的宿舍分配
- 非活跃宿舍不能分配新用户
- 已占用床位不能分配给其他用户

## 计算字段需求

### 1. 用户相关计算
- totalScore: 基于活跃扣分记录的总分计算
- canBeKicked: 基于totalScore是否达到踢出阈值

### 2. 宿舍相关计算
- currentOccupancy: 基于活跃用户分配的数量计算
- availableBeds: 基于床位状态的可用床位数量
- hasAvailableSpace: 基于容量和当前入住数的空间状态

### 3. 统计相关计算
- monthlyKickRequests: 每月踢出申请数量统计
- dormitoryAverageScore: 宿舍平均扣分统计

## 系统约束和限制

### 1. 数据约束
- 扣分数值必须为正数
- 宿舍容量必须在4-6之间
- 用户状态转换有严格的状态机约束

### 2. 业务约束
- 宿舍长不能给自己扣分
- 不能重复分配同一用户到多个宿舍
- 踢出申请在处理期间不能重复提交

### 3. 时间约束
- 扣分记录不能回溯修改
- 踢出申请有效期为30天
- 用户状态变更需要审计日志