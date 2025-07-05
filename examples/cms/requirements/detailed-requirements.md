# 详细需求分析

## 背景
需要一套可以让产品运营人员管理在线管理预置数据的后台操作界面。

## 数据模型分析

### 核心实体

#### 1. User（用户）
- **说明**：系统用户，包括产品运营人员
- **属性**：
  - id: uuid (自动生成)
  - name: string
  - email: string
  - role: string (admin/operator)
  - createdAt: string
  - updatedAt: string

#### 2. Style（样式）
- **说明**：需要管理的主要数据对象
- **属性**：
  - id: uuid (自动生成)
  - label: string (前端展示用名称，如 "Manga")
  - slug: string (唯一、URL-safe，如 "manga")
  - description: string
  - type: string (animation/surreal/...)
  - thumbKey: string (S3 上的地址)
  - priority: number (前端排序)
  - status: string (draft/published/offline)
  - createdAt: string
  - updatedAt: string
  - lastModifiedBy: User (关系)

#### 3. Version（版本）
- **说明**：Style 的版本管理
- **属性**：
  - id: uuid (自动生成)
  - versionNumber: number (版本号)
  - publishedAt: string (发布时间)
  - publishedBy: User (发布人)
  - isActive: boolean (是否为当前活动版本)
  - createdAt: string

### 关系定义

1. **UserStyleRelation (User → Style)**
   - 类型：1:n
   - 说明：用户最后修改的样式

2. **StyleVersionRelation (Style → Version)**
   - 类型：1:n
   - 说明：样式的所有版本

3. **UserVersionRelation (User → Version)**
   - 类型：1:n
   - 说明：用户发布的版本

## 交互分析

### 1. Style 管理

#### CreateStyle
- **权限**：admin/operator
- **输入**：label, slug, description, type, thumbKey, priority
- **业务规则**：
  - slug 必须唯一
  - priority 默认为 0
  - status 默认为 draft
  - 自动记录创建人和创建时间

#### UpdateStyle
- **权限**：admin/operator
- **输入**：styleId, label?, slug?, description?, type?, thumbKey?, priority?
- **业务规则**：
  - 只能更新 draft 或 published 状态的样式
  - slug 更新时必须保持唯一
  - 自动更新 updatedAt 和 lastModifiedBy

#### DeleteStyle（软删除）
- **权限**：admin
- **输入**：styleId
- **业务规则**：
  - 将 status 改为 offline
  - 保留所有历史数据

#### PublishStyle
- **权限**：admin/operator
- **输入**：styleId
- **业务规则**：
  - 只能发布 draft 状态的样式
  - 创建新版本记录
  - 将之前的活动版本标记为非活动
  - 更新样式状态为 published

#### UpdateStyleOrder
- **权限**：admin/operator
- **输入**：styleOrders: [{styleId, priority}]
- **业务规则**：
  - 批量更新样式的优先级
  - 只能更新非 offline 的样式

### 2. 版本管理

#### RollbackVersion
- **权限**：admin
- **输入**：versionId
- **业务规则**：
  - 将指定版本的数据恢复到对应的 Style
  - 创建新的版本记录
  - 更新活动版本标记

#### GetVersionHistory
- **查询交互**
- **权限**：admin/operator
- **输入**：styleId
- **输出**：该样式的所有版本历史

### 3. 查询交互

#### GetStyles
- **权限**：admin/operator
- **输入**：status?, sortBy?, sortOrder?
- **输出**：样式列表（根据 priority 排序）

#### GetStyleDetail
- **权限**：admin/operator
- **输入**：styleId
- **输出**：样式详情，包括最新版本信息

## 计算属性

1. **Style.versionCount**
   - 类型：Count
   - 说明：样式的版本数量

2. **User.publishedVersionCount**
   - 类型：Count
   - 说明：用户发布的版本数量

3. **Style.currentVersion**
   - 类型：Relation lookup
   - 说明：当前活动版本

## 状态流转

### Style 状态机
- 状态：draft → published → offline
- 转换：
  - draft → published (PublishStyle)
  - published → offline (DeleteStyle)
  - draft → offline (DeleteStyle)

## 权限控制

1. **admin**：所有操作权限
2. **operator**：除了 DeleteStyle 和 RollbackVersion 外的所有操作

## 数据验证规则

1. **slug**：
   - 必须唯一
   - 只能包含小写字母、数字和连字符
   - 不能以连字符开头或结尾

2. **priority**：
   - 必须为非负整数
   - 默认值为 0

3. **type**：
   - 必须是预定义的类型之一
   - 可选值：animation, surreal, realistic, cartoon, etc.

4. **status**：
   - 只能是：draft, published, offline

## 业务流程

### 1. 创建和发布流程
1. 运营人员创建新样式（draft 状态）
2. 编辑样式内容
3. 发布样式（创建版本，状态变为 published）

### 2. 更新流程
1. 更新已发布的样式
2. 再次发布（创建新版本）

### 3. 版本回滚流程
1. 查看版本历史
2. 选择要回滚的版本
3. 执行回滚（创建新版本，内容为历史版本）

### 4. 排序管理流程
1. 查看样式列表（按 priority 排序）
2. 批量调整优先级
3. 保存新的排序 