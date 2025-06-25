# 宿舍管理系统前端页面设计方案

## 一、页面结构概述

根据后端的 Entity、Relation 和 Interaction 设计，前端需要支持三种角色：管理员(Admin)、学生(Student)、宿舍长(Dormitory Leader)。每个角色有不同的功能页面。

## 二、页面路由规划

### 主要页面：
1. **Dashboard 仪表板** - 所有角色
2. **Dormitory Management 宿舍管理** - 管理员/宿舍长
3. **Application Management 申请管理** - 管理员/宿舍长  
4. **Member Management 成员管理** - 管理员/宿舍长
5. **Score Management 积分管理** - 宿舍长
6. **Student Portal 学生门户** - 学生
7. **Reports 报表中心** - 管理员

## 三、详细页面设计

### 3.1 Dashboard 仪表板 (所有角色)
**路由**: `/dashboard`  
**功能**: 显示角色相关的统计信息和快捷操作

**管理员视图**:
- 统计信息：总宿舍数、总学生数、待处理申请数、踢出申请数
- 最近活动列表
- 快捷操作：创建宿舍、查看待处理申请

**宿舍长视图**:
- 统计信息：管理宿舍信息、成员数量、宿舍平均分、待处理申请
- 成员积分概览
- 快捷操作：处理申请、记录积分

**学生视图**:
- 个人信息：当前宿舍、个人积分、申请状态
- 可申请宿舍列表
- 申请历史

**使用的 Interactions**:
- `GetDormitories` - 获取宿舍列表
- `GetUsers` - 获取用户信息  
- `GetApplications` - 获取申请信息
- `GetDormitoryMembers` - 获取成员信息

### 3.2 Dormitory Management 宿舍管理 (管理员)
**路由**: `/admin/dormitories`  
**功能**: 创建和管理宿舍

**页面组件**:
- 宿舍列表表格：显示宿舍名称、楼栋、房间号、容量、当前入住人数、宿舍长
- 创建宿舍模态框
- 指定宿舍长功能
- 直接分配成员功能

**使用的 Interactions**:
- `CreateDormitory` - 创建宿舍
- `AssignDormitoryLeader` - 指定宿舍长
- `AssignMemberToDormitory` - 直接分配成员
- `GetDormitories` - 获取宿舍列表
- `GetDormitoryMembers` - 获取宿舍成员

### 3.3 Application Management 申请管理 (管理员/宿舍长)
**路由**: `/applications`  
**功能**: 处理入住申请

**管理员视图**:
- 显示所有需要管理员审批的申请（leader_approved状态）
- 申请详情：申请人信息、目标宿舍、申请时间、宿舍长意见
- 批准/拒绝操作，需填写管理员意见

**宿舍长视图**:
- 显示本宿舍的待处理申请（pending状态）
- 申请详情：申请人信息、申请留言
- 批准/拒绝操作，需填写宿舍长意见

**使用的 Interactions**:
- `LeaderApproveApplication` - 宿舍长批准申请
- `LeaderRejectApplication` - 宿舍长拒绝申请
- `AdminApproveApplication` - 管理员批准申请
- `AdminRejectApplication` - 管理员拒绝申请
- `GetApplications` - 获取申请列表

### 3.4 Member Management 成员管理 (管理员/宿舍长)
**路由**: `/members`  
**功能**: 管理宿舍成员

**管理员视图**:
- 所有宿舍成员列表
- 成员详情：姓名、宿舍、角色、积分、状态、床位号
- 踢出申请处理

**宿舍长视图**:
- 本宿舍成员列表
- 成员详情：姓名、积分、床位号、加入时间
- 踢出成员申请功能

**使用的 Interactions**:
- `RequestKickMember` - 申请踢出成员
- `ApproveKickRequest` - 批准踢出申请
- `RejectKickRequest` - 拒绝踢出申请
- `GetDormitoryMembers` - 获取成员信息
- `GetKickRequests` - 获取踢出申请

### 3.5 Score Management 积分管理 (宿舍长)
**路由**: `/scores`  
**功能**: 管理成员积分

**页面组件**:
- 成员积分概览表格
- 记录积分模态框：选择成员、积分值、类别、原因
- 积分记录历史列表
- 积分统计图表

**使用的 Interactions**:
- `RecordScore` - 记录积分
- `GetScoreRecords` - 获取积分记录
- `GetDormitoryMembers` - 获取成员信息

### 3.6 Student Portal 学生门户 (学生)
**路由**: `/student`  
**功能**: 学生相关操作

**页面组件**:
- 个人信息卡片：当前宿舍、个人积分、申请状态
- 可申请宿舍列表：显示未满宿舍，支持申请
- 我的申请历史：申请状态、处理进度
- 取消申请功能

**使用的 Interactions**:
- `ApplyForDormitory` - 申请加入宿舍
- `CancelApplication` - 取消申请
- `GetDormitories` - 获取宿舍列表
- `GetApplications` - 获取申请信息

### 3.7 Reports 报表中心 (管理员)
**路由**: `/admin/reports`  
**功能**: 数据统计和报表

**页面组件**:
- 宿舍入住率统计
- 积分分布统计
- 申请处理效率统计
- 导出功能

**使用的 Interactions**:
- `GetDormitories` - 获取宿舍数据
- `GetDormitoryMembers` - 获取成员数据
- `GetScoreRecords` - 获取积分数据
- `GetApplications` - 获取申请数据

## 四、共享组件设计

### 4.1 Layout Components
- **AppLayout**: 主布局组件，包含导航栏、侧边栏、内容区域
- **Navigation**: 导航栏组件，根据用户角色显示不同菜单
- **Sidebar**: 侧边栏组件，快捷功能入口

### 4.2 Data Display Components  
- **DormitoryCard**: 宿舍信息卡片
- **MemberCard**: 成员信息卡片
- **ApplicationCard**: 申请信息卡片
- **ScoreChart**: 积分图表组件
- **StatCard**: 统计信息卡片

### 4.3 Form Components
- **DormitoryForm**: 创建/编辑宿舍表单
- **ApplicationForm**: 申请表单
- **ScoreForm**: 积分记录表单
- **CommentForm**: 意见/评论表单

### 4.4 Table Components
- **DormitoryTable**: 宿舍列表表格
- **MemberTable**: 成员列表表格
- **ApplicationTable**: 申请列表表格
- **ScoreTable**: 积分记录表格

## 五、页面权限控制

每个页面都需要根据用户角色进行访问控制：

- **管理员**: 可访问所有页面
- **宿舍长**: 可访问除管理员专用页面外的其他页面
- **学生**: 只能访问学生门户和仪表板

## 六、数据展示策略

所有页面优先展示模拟数据，基于以下后端实体结构：

**实体展示**:
- `User`: 姓名、角色、邮箱、学号
- `Dormitory`: 宿舍名称、楼栋、房间号、容量、描述
- `DormitoryMember`: 角色、积分、加入时间、状态、床位号
- `DormitoryApplication`: 状态、申请留言、审批意见、时间
- `ScoreRecord`: 积分值、原因、类别、时间
- `KickRequest`: 踢出原因、状态、管理员意见、时间

**计算属性展示**:
- 宿舍入住率 (currentOccupancy/capacity)
- 用户总积分 (sum of scoreRecords)
- 宿舍平均积分 (average of member scores)
- 申请数量统计

## 七、技术实现细节

使用 axii 框架特性：
- `atom` 管理组件状态
- `RxList` 管理列表数据
- `computed` 计算衍生数据
- `axii-ui` 组件库提供 UI 组件
- `styleSystem` 统一样式管理

所有页面都采用响应式设计，支持桌面和移动端访问。