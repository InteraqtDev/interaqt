# 宿舍管理系统交互矩阵

## 用户角色与交互对应关系

### 管理员 (Admin) 权限交互
| 交互名称 | 描述 | 权限控制 | 业务规则验证 | 对应测试用例 |
|---------|------|----------|-------------|-------------|
| CreateDormitory | 创建宿舍 | 仅管理员 | 容量4-6床位 | TC001, TC101, TC201 |
| AssignDormHead | 指定宿舍长 | 仅管理员 | 目标用户为学生角色 | TC002 |
| AssignUserToBed | 分配用户到床位 | 仅管理员 | 床位可用，用户未分配 | TC003, TC202, TC203 |
| ProcessKickoutRequest | 处理踢出申请 | 仅管理员 | 申请状态为pending | TC006, TC104 |
| GetAllDormitories | 查看所有宿舍 | 仅管理员 | 无 | - |
| GetAllUsers | 查看所有用户 | 仅管理员 | 无 | - |
| GetKickoutRequests | 查看踢出申请 | 仅管理员 | 无 | - |

### 宿舍长 (DormHead) 权限交互
| 交互名称 | 描述 | 权限控制 | 业务规则验证 | 对应测试用例 |
|---------|------|----------|-------------|-------------|
| RecordScore | 记录扣分 | 仅管理本宿舍学生 | 扣分为正数，不能给自己扣分 | TC004, TC102, TC103, TC206 |
| RequestKickout | 申请踢出用户 | 仅针对本宿舍学生 | 扣分达到阈值，无重复申请 | TC005, TC204, TC205 |
| GetDormitoryInfo | 查看宿舍信息 | 仅查看管理的宿舍 | 无 | TC007 |
| GetDormitoryMembers | 查看宿舍成员 | 仅查看管理的宿舍 | 无 | - |
| GetUserScoreHistory | 查看扣分记录 | 仅查看本宿舍学生 | 无 | TC008 |

### 学生 (Student) 权限交互
| 交互名称 | 描述 | 权限控制 | 业务规则验证 | 对应测试用例 |
|---------|------|----------|-------------|-------------|
| GetMyDormitoryInfo | 查看我的宿舍信息 | 仅查看自己宿舍 | 无 | - |
| GetMyScoreHistory | 查看我的扣分记录 | 仅查看自己记录 | 无 | - |

## 交互详细设计

### 1. CreateDormitory (创建宿舍)
- **触发角色**: 管理员
- **Payload字段**:
  - name: string (必需) - 宿舍名称
  - capacity: number (必需) - 床位数量
- **权限验证**: 
  - 用户角色必须为admin
- **业务规则验证**:
  - capacity必须在4-6之间
  - 宿舍名称不能重复
- **执行效果**:
  - 创建Dormitory实体
  - 自动创建对应数量的Bed实体
  - 初始化occupiedBeds为0

### 2. AssignDormHead (指定宿舍长)
- **触发角色**: 管理员
- **Payload字段**:
  - userId: string (必需) - 目标用户ID
  - dormitoryId: string (必需) - 宿舍ID
- **权限验证**:
  - 用户角色必须为admin
- **业务规则验证**:
  - 目标用户当前角色为student
  - 宿舍不能已有宿舍长
- **执行效果**:
  - 创建DormitoryHeadRelation关系
  - 更新用户角色为dormHead

### 3. AssignUserToBed (分配用户到床位)
- **触发角色**: 管理员
- **Payload字段**:
  - userId: string (必需) - 目标用户ID
  - dormitoryId: string (必需) - 宿舍ID
  - bedNumber: number (必需) - 床位编号
- **权限验证**:
  - 用户角色必须为admin
- **业务规则验证**:
  - 用户未被分配到其他宿舍
  - 目标床位状态为available
  - 宿舍有剩余容量
- **执行效果**:
  - 创建UserBedRelation关系
  - 创建UserDormitoryRelation关系
  - 更新床位状态为occupied
  - 增加宿舍occupiedBeds数量

### 4. RecordScore (记录扣分)
- **触发角色**: 宿舍长
- **Payload字段**:
  - targetUserId: string (必需) - 被扣分用户ID
  - reason: string (必需) - 扣分原因
  - points: number (必需) - 扣分数
- **权限验证**:
  - 当前用户角色必须为dormHead
  - 目标用户必须在当前用户管理的宿舍中
  - 不能给自己扣分
- **业务规则验证**:
  - points必须为正数
  - reason不能为空
- **执行效果**:
  - 创建ScoreRecord实体
  - 自动更新用户总扣分

### 5. RequestKickout (申请踢出用户)
- **触发角色**: 宿舍长
- **Payload字段**:
  - targetUserId: string (必需) - 被申请踢出用户ID
  - reason: string (必需) - 申请原因
- **权限验证**:
  - 当前用户角色必须为dormHead
  - 目标用户必须在当前用户管理的宿舍中
- **业务规则验证**:
  - 目标用户总扣分达到100分阈值
  - 目标用户没有pending状态的踢出申请
- **执行效果**:
  - 创建KickoutRequest实体
  - 状态设置为pending

### 6. ProcessKickoutRequest (处理踢出申请)
- **触发角色**: 管理员
- **Payload字段**:
  - requestId: string (必需) - 申请ID
  - decision: string (必需) - 决定 (approved/rejected)
  - note: string (可选) - 处理备注
- **权限验证**:
  - 用户角色必须为admin
- **业务规则验证**:
  - 申请状态必须为pending
  - decision必须为approved或rejected
- **执行效果**:
  - 更新申请状态和处理时间
  - 如果approved，执行踢出操作：
    - 删除UserBedRelation和UserDormitoryRelation
    - 更新床位状态为available
    - 减少宿舍occupiedBeds数量

### 7. GetDormitoryInfo (查看宿舍信息)
- **触发角色**: 管理员、宿舍长
- **Payload字段**:
  - dormitoryId: string (必需) - 宿舍ID
- **权限验证**:
  - 管理员可查看任意宿舍
  - 宿舍长只能查看管理的宿舍
- **业务规则验证**: 无
- **返回内容**:
  - 宿舍基本信息
  - 床位占用情况
  - 宿舍成员列表
  - 宿舍长信息

### 8. GetUserScoreHistory (查看扣分记录)
- **触发角色**: 管理员、宿舍长、学生本人
- **Payload字段**:
  - userId: string (必需) - 用户ID
- **权限验证**:
  - 管理员可查看任意用户
  - 宿舍长只能查看本宿舍学生
  - 学生只能查看自己
- **业务规则验证**: 无
- **返回内容**:
  - 扣分记录列表(按时间倒序)
  - 总扣分统计

## 权限控制总结

### 权限层级
1. **管理员** - 最高权限，可执行所有管理操作
2. **宿舍长** - 中级权限，可管理分配的宿舍
3. **学生** - 基础权限，只能查看自己相关信息

### 数据访问范围
- **管理员**: 全局访问所有数据
- **宿舍长**: 仅访问管理宿舍的相关数据
- **学生**: 仅访问自己的相关数据

### 操作权限分离
- **创建权限**: 仅管理员可创建宿舍和分配用户
- **管理权限**: 宿舍长可管理本宿舍学生
- **查看权限**: 基于角色和数据归属关系控制