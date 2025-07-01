# Style 管理系统详细需求分析

## 业务背景

需要为产品运营人员提供一套在线管理预置数据的后台操作界面，主要管理 Style 对象数据结构。

## 数据分析视角

### 核心实体分析

#### Style 实体
Style 是系统的核心数据实体，包含以下属性：

**基础属性**：
- `id` (UUID): 系统自动生成的唯一标识
- `label` (Text): 前端展示用名称，如 "Manga"
- `slug` (Text): URL安全的唯一标识符，对应旧代码的 value，如 "manga"
- `description` (Text): 详细描述信息
- `type` (varchar(32)): 分类类型，如 "animation"、"surreal" 等
- `thumb_key` (Text): S3上的缩略图地址
- `priority` (Integer): 前端排序权重，数值越小越靠前
- `status` (varchar(16)): 状态，支持 "draft"、"published"、"offline"

**时间戳属性**：
- `created_at` (timestamptz): 创建时间，自动设置为当前时间
- `updated_at` (timestamptz): 更新时间，每次修改时自动更新

#### Version 实体（版本管理）
为支持版本管理和回滚功能，需要版本实体：

**基础属性**：
- `id` (UUID): 版本唯一标识
- `version_number` (Integer): 版本号，自动递增
- `name` (Text): 版本名称，如 "v1.0"、"春节活动版本"
- `description` (Text): 版本描述
- `status` (varchar(16)): 版本状态 "draft"、"published"、"archived"
- `published_at` (timestamptz): 发布时间
- `created_at` (timestamptz): 创建时间
- `created_by` (UUID): 创建者ID

#### User 实体（操作用户）
为支持权限控制和操作记录：

**基础属性**：
- `id` (UUID): 用户唯一标识
- `username` (Text): 用户名
- `email` (Text): 邮箱
- `role` (varchar(32)): 角色，"admin"、"editor"、"viewer"
- `is_active` (Boolean): 是否激活
- `created_at` (timestamptz): 创建时间

### 关系分析

#### StyleVersion 关系（Style - Version）
- 类型：n:n 关系
- 描述：一个 Style 可以属于多个版本，一个版本包含多个 Style
- 额外属性：
  - `sort_order` (Integer): 在该版本中的排序位置
  - `is_active` (Boolean): 在该版本中是否激活

#### UserVersion 关系（User - Version）
- 类型：n:1 关系
- 描述：记录版本的创建者和管理者

## 交互分析视角

### 用户角色和权限

#### Admin（管理员）
- 创建、编辑、删除 Style
- 创建、发布、回滚版本
- 管理用户权限
- 查看所有操作日志

#### Editor（编辑者）
- 创建、编辑 Style（仅自己创建的）
- 创建版本草稿
- 查看版本历史

#### Viewer（查看者）
- 查看已发布的 Style 和版本
- 导出数据

### 核心业务流程

#### Style 管理流程
1. **创建 Style**：填写基本信息，状态默认为 draft
2. **编辑 Style**：修改任意字段，自动更新 updated_at
3. **排序管理**：拖拽调整 priority 值
4. **状态管理**：在 draft、published、offline 之间切换
5. **删除 Style**：软删除或硬删除

#### 版本管理流程
1. **创建版本**：选择要包含的 Style，生成新版本
2. **编辑版本**：调整版本中的 Style 列表和排序
3. **发布版本**：将版本状态改为 published，记录发布时间
4. **回滚版本**：恢复到历史版本的 Style 配置

### 关键业务规则

#### 数据约束
- `slug` 必须唯一且符合 URL 安全规范
- `priority` 值必须为非负整数
- 同一时间只能有一个版本处于 published 状态
- 删除 Style 时需检查是否被版本引用

#### 权限约束
- Editor 只能编辑自己创建的 Style
- 只有 Admin 可以发布版本
- Viewer 无法进行任何修改操作

#### 业务约束
- Style 状态为 offline 时不能被新版本引用
- 已发布版本中的 Style 不能被删除
- 版本发布后不能修改其中的 Style 列表

## 系统功能需求

### 基础 CRUD 功能
1. Style 的增删改查
2. Version 的增删改查
3. User 的基础管理

### 高级功能
1. **排序功能**：通过拖拽调整 Style 的 priority 值
2. **批量操作**：批量修改 Style 状态、删除等
3. **搜索过滤**：按 type、status、label 等条件搜索
4. **版本对比**：对比不同版本之间的差异
5. **操作日志**：记录所有关键操作的历史

### 数据完整性需求
1. **事务一致性**：版本发布时的所有操作必须在同一事务中
2. **引用完整性**：删除被引用的 Style 时需要提示
3. **数据备份**：版本发布前自动备份当前状态

## 性能需求

### 响应时间
- Style 列表加载：< 500ms
- 版本切换：< 1s
- 排序拖拽：< 200ms

### 并发需求
- 支持多用户同时编辑不同 Style
- 版本发布时需要加锁防止并发冲突

## 安全需求

### 数据安全
- 敏感操作需要二次确认
- 关键操作记录操作日志
- 定期数据备份

### 访问控制
- 基于角色的权限控制
- API 接口需要身份验证
- 操作权限实时校验