# 宿舍管理系统交互设计

## 交互设计概述

本文档定义宿舍管理系统中所有用户操作对应的Interactions。每个Interaction包含：
- 名称和目的
- 所需的payload字段
- 影响的实体和关系
- 预期的业务结果

**注意**: 此设计专注于核心业务逻辑，权限控制和业务规则验证将在Stage 2中添加。

## 宿舍管理类交互

### CreateDormitory
- **目的**: 创建新宿舍
- **触发角色**: Admin (Stage 2实现权限控制)
- **Payload字段**:
  - `name`: string (必需) - 宿舍名称
  - `capacity`: number (必需) - 床位数量
- **影响的实体**:
  - 创建新的Dormitory实体
- **预期结果**:
  - 系统中新增一个宿舍记录
  - 宿舍容量设置为指定值
  - 当前入住人数为0
  - 可用床位数等于容量
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 宿舍名称不能重复
  - 容量必须在4-6之间

### UpdateDormitory
- **目的**: 更新宿舍信息
- **触发角色**: Admin
- **Payload字段**:
  - `dormitoryId`: string (必需) - 宿舍ID
  - `name`: string (可选) - 新的宿舍名称
  - `capacity`: number (可选) - 新的床位数量
- **影响的实体**:
  - 更新指定的Dormitory实体
- **预期结果**:
  - 宿舍信息更新为新值
  - 相关计算属性自动重新计算
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 新容量不能小于当前入住人数
  - 新名称不能与其他宿舍重复

### DeleteDormitory
- **目的**: 删除空宿舍
- **触发角色**: Admin
- **Payload字段**:
  - `dormitoryId`: string (必需) - 宿舍ID
- **影响的实体**:
  - 删除指定的Dormitory实体
- **预期结果**:
  - 宿舍记录从系统中移除
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 宿舍必须为空（无住户）
  - 宿舍不能有宿舍长

## 用户角色管理类交互

### AssignDormHead
- **目的**: 指定宿舍长
- **触发角色**: Admin
- **Payload字段**:
  - `userId`: string (必需) - 用户ID
  - `dormitoryId`: string (必需) - 宿舍ID
- **影响的实体和关系**:
  - 创建DormitoryHeadRelation关系
  - 更新User的role为'dormHead'
- **预期结果**:
  - 建立用户与宿舍的管理关系
  - 用户角色自动变更为宿舍长
  - 任命时间记录为当前时间
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 目标用户当前角色必须为'student'
  - 目标宿舍当前没有宿舍长
  - 用户状态必须为'active'

### RemoveDormHead
- **目的**: 撤销宿舍长职务
- **触发角色**: Admin
- **Payload字段**:
  - `userId`: string (必需) - 宿舍长用户ID
- **影响的实体和关系**:
  - 删除或标记DormitoryHeadRelation为inactive
  - 更新User的role为'student'
- **预期结果**:
  - 用户不再是宿舍长
  - 用户角色恢复为学生
  - 宿舍没有管理者
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 用户当前必须是宿舍长
  - 没有待处理的踢出申请

### AssignUserToDormitory
- **目的**: 分配学生到宿舍床位
- **触发角色**: Admin
- **Payload字段**:
  - `userId`: string (必需) - 学生用户ID
  - `dormitoryId`: string (必需) - 宿舍ID
  - `bedNumber`: number (必需) - 床位号
- **影响的实体和关系**:
  - 创建UserDormitoryRelation关系
  - 更新宿舍的currentOccupancy和availableBeds
- **预期结果**:
  - 建立用户与宿舍的居住关系
  - 宿舍入住人数自动增加
  - 可用床位数自动减少
  - 分配时间记录为当前时间
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 用户当前未分配到其他宿舍
  - 宿舍有可用床位
  - 床位号在容量范围内且未被占用
  - 用户状态为'active'

### RemoveUserFromDormitory
- **目的**: 将用户从宿舍中移除
- **触发角色**: Admin
- **Payload字段**:
  - `userId`: string (必需) - 用户ID
- **影响的实体和关系**:
  - 删除或标记UserDormitoryRelation为inactive
  - 更新宿舍的currentOccupancy和availableBeds
- **预期结果**:
  - 用户不再居住在宿舍中
  - 宿舍入住人数自动减少
  - 床位变为可用
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 用户当前必须在宿舍中

## 扣分规则管理类交互

### CreateScoreRule
- **目的**: 创建新的扣分规则
- **触发角色**: Admin
- **Payload字段**:
  - `name`: string (必需) - 规则名称
  - `description`: string (必需) - 规则描述
  - `scoreDeduction`: number (必需) - 扣分数值
- **影响的实体**:
  - 创建新的ScoreRule实体
- **预期结果**:
  - 系统中新增一个扣分规则
  - 规则状态默认为激活
  - 创建时间记录为当前时间
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 规则名称不能重复
  - 扣分值必须为正数

### UpdateScoreRule
- **目的**: 更新扣分规则
- **触发角色**: Admin
- **Payload字段**:
  - `ruleId`: string (必需) - 规则ID
  - `name`: string (可选) - 新的规则名称
  - `description`: string (可选) - 新的规则描述
  - `scoreDeduction`: number (可选) - 新的扣分数值
  - `isActive`: boolean (可选) - 是否激活
- **影响的实体**:
  - 更新指定的ScoreRule实体
- **预期结果**:
  - 规则信息更新为新值
  - 更新时间记录为当前时间
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 新名称不能与其他规则重复
  - 新扣分值必须为正数

### DeleteScoreRule
- **目的**: 删除未使用的扣分规则
- **触发角色**: Admin
- **Payload字段**:
  - `ruleId`: string (必需) - 规则ID
- **影响的实体**:
  - 删除指定的ScoreRule实体
- **预期结果**:
  - 规则从系统中移除
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 规则没有关联的违规记录

## 违规处理类交互

### RecordViolation
- **目的**: 记录用户违规行为
- **触发角色**: Admin或对应宿舍的宿舍长
- **Payload字段**:
  - `userId`: string (必需) - 违规用户ID
  - `ruleId`: string (必需) - 适用的扣分规则ID
  - `description`: string (必需) - 违规具体描述
- **影响的实体和关系**:
  - 创建新的ViolationRecord实体
  - 创建UserViolationRelation和ViolationRuleRelation
  - 更新用户的score（减少相应分数）
- **预期结果**:
  - 创建违规记录
  - 用户积分按规则扣除
  - 记录时间为当前时间
  - 用户违规统计更新
- **Stage 2 - 权限要求**: Admin或目标用户所在宿舍的宿舍长
- **Stage 2 - 业务规则**: 
  - 目标用户必须在宿舍中
  - 扣分规则必须处于激活状态
  - 扣分后积分不能为负数

### RevokeViolation
- **目的**: 撤销错误的违规记录
- **触发角色**: Admin
- **Payload字段**:
  - `violationId`: string (必需) - 违规记录ID
  - `reason`: string (必需) - 撤销原因
- **影响的实体**:
  - 更新ViolationRecord状态为'revoked'
  - 恢复用户的score（增加相应分数）
- **预期结果**:
  - 违规记录标记为已撤销
  - 用户积分恢复
  - 用户违规统计更新
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 违规记录当前状态为'active'

## 踢出申请类交互

### RequestKickout
- **目的**: 宿舍长申请踢出违规用户
- **触发角色**: Admin或对应宿舍的宿舍长
- **Payload字段**:
  - `targetUserId`: string (必需) - 目标用户ID
  - `reason`: string (必需) - 申请理由
- **影响的实体和关系**:
  - 创建新的KickoutRequest实体
  - 创建相关的关系（申请人、目标用户）
- **预期结果**:
  - 创建踢出申请记录
  - 申请状态为'pending'
  - 申请时间记录为当前时间
  - 等待管理员审核
- **Stage 2 - 权限要求**: Admin或目标用户所在宿舍的宿舍长
- **Stage 2 - 业务规则**: 
  - 目标用户积分必须低于60分
  - 目标用户没有待处理的踢出申请
  - 申请人不能是目标用户本人

### ProcessKickoutRequest
- **目的**: 管理员处理踢出申请
- **触发角色**: Admin
- **Payload字段**:
  - `requestId`: string (必需) - 申请ID
  - `decision`: string (必需) - 决定('approved' | 'rejected')
  - `adminComment`: string (可选) - 处理意见
- **影响的实体和关系**:
  - 更新KickoutRequest状态和处理信息
  - 如果批准：更新目标用户状态，移除宿舍关系
  - 创建KickoutProcessorRelation
- **预期结果**:
  - 申请状态更新
  - 如果批准：用户被踢出，宿舍床位释放
  - 如果拒绝：用户保持原状态
  - 处理时间和意见记录
- **Stage 2 - 权限要求**: 仅Admin可执行
- **Stage 2 - 业务规则**: 
  - 申请状态必须为'pending'
  - 处理人不能是申请发起人

## 查询类交互

### ViewSystemOverview
- **目的**: 查看系统整体概况
- **触发角色**: Admin
- **Payload字段**: 无
- **预期结果**:
  - 返回系统统计信息
  - 宿舍总数、用户总数、待处理申请数等
- **Stage 2 - 权限要求**: 仅Admin可执行

### ViewDormitoryList
- **目的**: 查看宿舍列表
- **触发角色**: All users
- **Payload字段**:
  - `status`: string (可选) - 筛选条件
- **预期结果**:
  - 返回宿舍列表信息
  - 根据用户角色返回不同详细程度的信息
- **Stage 2 - 权限要求**: 基于角色返回不同数据

### ViewDormitoryDetails
- **目的**: 查看宿舍详细信息
- **触发角色**: Admin、对应宿舍长、宿舍成员
- **Payload字段**:
  - `dormitoryId`: string (必需) - 宿舍ID
- **预期结果**:
  - 返回宿舍详细信息
  - 包括住户列表、宿舍长信息等
- **Stage 2 - 权限要求**: 仅能查看有权限的宿舍

### ViewUserProfile
- **目的**: 查看用户资料
- **触发角色**: Admin、宿舍长（查看宿舍成员）、用户本人
- **Payload字段**:
  - `userId`: string (必需) - 用户ID
- **预期结果**:
  - 返回用户基本信息
  - 根据权限返回不同详细程度
- **Stage 2 - 权限要求**: 基于关系和角色限制访问

### ViewViolationHistory
- **目的**: 查看违规记录历史
- **触发角色**: Admin、宿舍长（查看宿舍成员）、用户本人
- **Payload字段**:
  - `userId`: string (必需) - 用户ID
  - `limit`: number (可选) - 返回数量限制
  - `offset`: number (可选) - 分页偏移
- **预期结果**:
  - 返回用户违规记录列表
  - 包括违规详情、扣分情况、记录时间等
- **Stage 2 - 权限要求**: 基于关系和角色限制访问

### ViewKickoutRequests
- **目的**: 查看踢出申请列表
- **触发角色**: Admin、宿舍长（查看自己发起的）
- **Payload字段**:
  - `status`: string (可选) - 申请状态筛选
  - `requesterId`: string (可选) - 申请人筛选
- **预期结果**:
  - 返回踢出申请列表
  - 根据角色返回不同范围的申请
- **Stage 2 - 权限要求**: Admin看全部，宿舍长只看自己的

### ViewScoreRules
- **目的**: 查看扣分规则列表
- **触发角色**: All users
- **Payload字段**:
  - `isActive`: boolean (可选) - 是否只显示激活规则
- **预期结果**:
  - 返回扣分规则列表
  - 普通用户只能看到激活的规则
- **Stage 2 - 权限要求**: 普通用户只能查看激活规则

## 交互分组总结

### 管理员专用交互 (Stage 2权限控制)
- CreateDormitory, UpdateDormitory, DeleteDormitory
- AssignDormHead, RemoveDormHead
- AssignUserToDormitory, RemoveUserFromDormitory
- CreateScoreRule, UpdateScoreRule, DeleteScoreRule
- RevokeViolation
- ProcessKickoutRequest
- ViewSystemOverview

### 宿舍长可用交互 (Stage 2权限控制)
- RecordViolation (仅自己宿舍成员)
- RequestKickout (仅自己宿舍成员)
- ViewDormitoryDetails (仅自己管理的宿舍)
- ViewUserProfile (仅宿舍成员)
- ViewViolationHistory (仅宿舍成员)
- ViewKickoutRequests (仅自己发起的)

### 学生可用交互 (Stage 2权限控制)
- ViewDormitoryDetails (仅自己所在宿舍)
- ViewUserProfile (仅自己)
- ViewViolationHistory (仅自己)

### 所有用户可用交互
- ViewDormitoryList
- ViewScoreRules

## 实现注意事项

### Stage 1 实现重点
- 实现所有Interaction的基本结构
- 确保payload定义完整和正确
- 不包含权限控制和业务规则验证
- 专注于核心CRUD功能

### Stage 2 扩展内容
- 添加condition for 权限检查
- 添加condition for 业务规则验证
- 实现复杂的访问控制逻辑
- 添加数据验证和约束检查

### 数据关系处理
- 创建操作自动建立相关关系
- 删除操作考虑级联影响
- 更新操作维护数据一致性
- 查询操作根据关系返回相关数据