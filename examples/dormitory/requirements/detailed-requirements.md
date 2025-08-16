# 宿舍管理系统 - 详细需求分析

## 1. 业务背景与目标
需要一套数字化的宿舍管理系统，用于管理学生宿舍的分配、日常管理和纪律维护。系统旨在提高宿舍管理效率，规范学生行为，并建立公平透明的奖惩机制。

## 2. 用户角色定义

### 2.1 管理员（Admin）
- **定义**: 宿舍管理系统的最高权限用户，负责整体管理
- **权限**: 
  - 创建和管理宿舍
  - 分配用户到宿舍
  - 任命宿舍长
  - 审批踢出申请
  - 查看所有数据

### 2.2 宿舍长（DormHead）
- **定义**: 由管理员指定的宿舍负责人，协助管理本宿舍
- **权限**:
  - 查看本宿舍成员信息
  - 记录宿舍成员的违规行为和扣分
  - 申请踢出违规严重的成员
  - 管理本宿舍日常事务

### 2.3 普通用户（User）
- **定义**: 入住宿舍的学生或住户
- **权限**:
  - 查看自己的宿舍信息
  - 查看自己的扣分记录
  - 查看宿舍公告

## 3. 实体分析

### 3.1 User（用户）
**属性**:
- name: 姓名（string, 必填）
- email: 邮箱（string, 必填，唯一）
- phone: 电话（string, 可选）
- role: 角色（enum: 'admin' | 'dormHead' | 'user'，默认'user'）
- status: 状态（enum: 'active' | 'inactive'，默认'active'）
- points: 积分（number，默认100，用于记录行为分数）
- joinedAt: 加入时间（datetime）

### 3.2 Dormitory（宿舍）
**属性**:
- name: 宿舍名称（string, 必填，如"A栋101"）
- capacity: 容量（number, 必填，范围4-6）
- floor: 楼层（number）
- building: 楼栋（string）
- status: 状态（enum: 'available' | 'full' | 'maintenance'，默认'available'）
- createdAt: 创建时间（datetime）

### 3.3 Bed（床位）
**属性**:
- bedNumber: 床位号（string, 必填，如"1号床"）
- status: 状态（enum: 'vacant' | 'occupied'，默认'vacant'）
- createdAt: 创建时间（datetime）

### 3.4 PointDeduction（扣分记录）
**属性**:
- reason: 扣分原因（string, 必填）
- points: 扣分数值（number, 必填，正数）
- category: 违规类别（enum: 'hygiene' | 'noise' | 'lateness' | 'damage' | 'other'）
- occurredAt: 违规时间（datetime）
- recordedAt: 记录时间（datetime）

### 3.5 EvictionRequest（踢出申请）
**属性**:
- reason: 申请理由（string, 必填）
- totalPoints: 累计扣分（number）
- status: 状态（enum: 'pending' | 'approved' | 'rejected'，默认'pending'）
- requestedAt: 申请时间（datetime）
- processedAt: 处理时间（datetime，可选）
- adminComment: 管理员备注（string，可选）

## 4. 关系分析

### 4.1 User-Dormitory（用户-宿舍关系）
- **类型**: n:1（多个用户对一个宿舍）
- **说明**: 每个用户只能分配到一个宿舍
- **属性**: assignedAt（分配时间）

### 4.2 User-Bed（用户-床位关系）
- **类型**: 1:1（一个用户对一个床位）
- **说明**: 每个用户占用一个床位，每个床位只能分配给一个用户
- **属性**: occupiedAt（入住时间）

### 4.3 Dormitory-Bed（宿舍-床位关系）
- **类型**: 1:n（一个宿舍对多个床位）
- **说明**: 每个宿舍包含4-6个床位

### 4.4 Dormitory-DormHead（宿舍-宿舍长关系）
- **类型**: 1:1（一个宿舍对一个宿舍长）
- **说明**: 每个宿舍有一个指定的宿舍长（从User中选择）
- **属性**: appointedAt（任命时间）

### 4.5 User-PointDeduction（用户-扣分记录关系）
- **类型**: 1:n（一个用户对多个扣分记录）
- **说明**: 记录用户的所有违规扣分

### 4.6 PointDeduction-Recorder（扣分记录-记录者关系）
- **类型**: n:1（多个扣分记录对一个记录者）
- **说明**: 记录是谁（宿舍长）记录的扣分

### 4.7 EvictionRequest-TargetUser（踢出申请-目标用户关系）
- **类型**: n:1（多个申请对一个用户）
- **说明**: 一个用户可能有多次被申请踢出的记录

### 4.8 EvictionRequest-Requester（踢出申请-申请人关系）
- **类型**: n:1（多个申请对一个申请人）
- **说明**: 宿舍长提出的踢出申请

### 4.9 EvictionRequest-Approver（踢出申请-审批人关系）
- **类型**: n:1（多个申请对一个审批人）
- **说明**: 管理员审批的踢出申请

## 5. 交互操作分析

### 5.1 管理员操作
1. **CreateDormitory**: 创建宿舍
   - 输入：名称、容量、楼层、楼栋
   - 输出：新建的宿舍（自动创建对应数量的床位）

2. **AppointDormHead**: 任命宿舍长
   - 输入：用户ID、宿舍ID
   - 约束：用户必须是该宿舍成员

3. **AssignUserToDormitory**: 分配用户到宿舍
   - 输入：用户ID、宿舍ID、床位ID
   - 约束：床位必须空闲，用户未分配其他宿舍

4. **ApproveEviction**: 批准踢出申请
   - 输入：申请ID、管理员备注
   - 效果：更新申请状态，移除用户宿舍关系，释放床位

5. **RejectEviction**: 拒绝踢出申请
   - 输入：申请ID、拒绝理由
   - 效果：更新申请状态

### 5.2 宿舍长操作
1. **RecordPointDeduction**: 记录扣分
   - 输入：目标用户ID、扣分原因、扣分数值、违规类别
   - 约束：目标用户必须是本宿舍成员
   - 效果：创建扣分记录，更新用户积分

2. **RequestEviction**: 申请踢出用户
   - 输入：目标用户ID、申请理由
   - 约束：目标用户必须是本宿舍成员，积分低于阈值（如30分）
   - 效果：创建踢出申请

### 5.3 普通用户操作
1. **ViewMyDormitory**: 查看我的宿舍信息
2. **ViewMyPoints**: 查看我的积分和扣分记录
3. **ViewDormitoryMembers**: 查看同宿舍成员

## 6. 业务规则

### 6.1 宿舍分配规则
- 每个宿舍容量为4-6个床位
- 用户只能被分配到一个宿舍的一个床位
- 宿舍满员后状态自动变为'full'
- 用户被踢出后，床位自动释放

### 6.2 积分规则
- 新用户初始积分为100分
- 扣分只能由宿舍长或管理员执行
- 扣分类别包括：卫生(hygiene)、噪音(noise)、晚归(lateness)、损坏公物(damage)、其他(other)
- 不同类别的标准扣分值：
  - 卫生问题：5-10分
  - 噪音干扰：5-15分
  - 晚归：10-20分
  - 损坏公物：20-30分
  - 其他：5-20分

### 6.3 踢出规则
- 只有当用户积分低于30分时，宿舍长才能申请踢出
- 踢出申请必须由管理员审批
- 用户被踢出后，状态变为'inactive'
- 被踢出的用户需要重新分配宿舍

## 7. 计算属性需求

### 7.1 实体级计算
- **Dormitory.occupancy**: 当前入住人数（通过统计occupied床位数）
- **Dormitory.availableBeds**: 可用床位数（capacity - occupancy）
- **User.totalDeductions**: 累计扣分总数
- **User.deductionCount**: 扣分次数

### 7.2 关系级计算
- **自动状态更新**:
  - 宿舍满员时，Dormitory.status自动变为'full'
  - 宿舍有空位时，Dormitory.status自动变为'available'
  - 用户被踢出时，User.status自动变为'inactive'

### 7.3 响应式更新
- 记录扣分时，User.points自动减少
- 分配床位时，Bed.status自动变为'occupied'
- 用户被踢出时，Bed.status自动变为'vacant'

## 8. 权限控制矩阵

| 操作 | Admin | DormHead | User |
|-----|-------|----------|------|
| 创建宿舍 | ✓ | ✗ | ✗ |
| 分配用户到宿舍 | ✓ | ✗ | ✗ |
| 任命宿舍长 | ✓ | ✗ | ✗ |
| 记录扣分 | ✓ | ✓(仅本宿舍) | ✗ |
| 申请踢出 | ✗ | ✓(仅本宿舍) | ✗ |
| 审批踢出 | ✓ | ✗ | ✗ |
| 查看所有宿舍 | ✓ | ✗ | ✗ |
| 查看本宿舍信息 | ✓ | ✓ | ✓ |
| 查看个人信息 | ✓ | ✓ | ✓ |

## 9. 数据约束

### 9.1 唯一性约束
- User.email必须唯一
- Dormitory.name必须唯一
- 每个宿舍的Bed.bedNumber必须唯一

### 9.2 完整性约束
- 删除宿舍前必须确保没有用户入住
- 用户被踢出时必须解除所有宿舍关系
- 扣分记录不可删除（审计需要）

### 9.3 业务约束
- 宿舍容量必须在4-6之间
- 扣分数值必须为正数
- 用户积分不能为负数
- 踢出申请只能在用户积分<30时创建

## 10. 系统初始化数据

系统启动时需要创建：
1. 一个管理员账户（role='admin'）
2. 示例宿舍数据（可选）
3. 扣分类别和标准（配置数据）
