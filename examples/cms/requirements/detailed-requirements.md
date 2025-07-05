# CMS 系统详细需求分析

## 系统概述
这是一个内容管理系统（CMS），用于让产品运营人员在线管理预置数据。系统的核心是管理 Style 对象，支持版本控制和排序功能。

## 实体分析

### 1. User（用户）
虽然 interaqt 不处理认证，但我们仍需定义 User 实体来支持权限控制和审计。
- **属性**：
  - name: 用户姓名
  - email: 用户邮箱
  - role: 用户角色（admin/operator）
  - isActive: 是否激活

### 2. Style（样式）
系统的核心实体，代表可管理的样式配置。
- **属性**：
  - label: 前端展示名称（如 "Manga"）
  - slug: URL-safe 唯一标识（如 "manga"）
  - description: 描述信息
  - type: 样式类型（animation/surreal 等）
  - thumbKey: S3 上的缩略图地址
  - priority: 排序优先级
  - status: 状态（draft/published/offline）
  - isDeleted: 软删除标记
  - createdAt: 创建时间
  - updatedAt: 更新时间
  - createdBy: 创建者（关联 User）
  - updatedBy: 最后更新者（关联 User）

### 3. Version（版本）
版本管理实体，记录每次发布的快照。
- **属性**：
  - versionNumber: 版本号（自增）
  - publishedAt: 发布时间
  - publishedBy: 发布者（关联 User）
  - isActive: 是否为当前活跃版本
  - comment: 版本说明

### 4. StyleVersion（样式版本关联）
记录每个版本包含的样式快照。
- **属性**：
  - 继承 Style 的所有属性作为快照
  - originalStyleId: 原始 Style 的 ID

## 关系分析

### 1. UserStyleRelation（用户-样式关系）
- source: User
- target: Style
- type: 1:n
- 含义：用户创建/更新的样式

### 2. UserVersionRelation（用户-版本关系）
- source: User
- target: Version
- type: 1:n
- 含义：用户发布的版本

### 3. StyleVersionRelation（样式-版本关系）
- source: Style
- target: Version
- type: n:n
- 通过 StyleVersion 实体实现
- 含义：版本包含的样式快照

## 交互分析

### Style 管理交互
1. **CreateStyle**: 创建新样式
   - 权限：需要 operator 或 admin 角色
   - 输入：label, slug, description, type, thumbKey, priority
   - 效果：创建 Style 实体，status 默认为 'draft'

2. **UpdateStyle**: 更新样式
   - 权限：需要 operator 或 admin 角色
   - 输入：styleId, 更新的字段
   - 效果：更新 Style 属性，更新 updatedAt 和 updatedBy

3. **DeleteStyle**: 删除样式（软删除）
   - 权限：需要 admin 角色
   - 输入：styleId
   - 效果：设置 isDeleted 为 true

4. **RestoreStyle**: 恢复删除的样式
   - 权限：需要 admin 角色
   - 输入：styleId
   - 效果：设置 isDeleted 为 false

5. **PublishStyle**: 发布样式
   - 权限：需要 operator 或 admin 角色
   - 输入：styleId
   - 效果：更新 status 为 'published'

6. **UnpublishStyle**: 下线样式
   - 权限：需要 operator 或 admin 角色
   - 输入：styleId
   - 效果：更新 status 为 'offline'

### 排序管理交互
7. **UpdateStylePriority**: 更新样式优先级
   - 权限：需要 operator 或 admin 角色
   - 输入：styleId, newPriority
   - 效果：更新 priority 值

8. **ReorderStyles**: 批量重排序
   - 权限：需要 operator 或 admin 角色
   - 输入：样式 ID 和优先级的数组
   - 效果：批量更新多个样式的优先级

### 版本管理交互
9. **CreateVersion**: 创建新版本
   - 权限：需要 operator 或 admin 角色
   - 输入：comment
   - 效果：
     - 创建新的 Version 实体
     - 复制所有 published 状态的 Style 到 StyleVersion
     - 设置新版本为 active

10. **RollbackToVersion**: 回滚到指定版本
    - 权限：需要 admin 角色
    - 输入：versionId
    - 效果：
      - 将当前 Style 替换为指定版本的 StyleVersion 数据
      - 创建新的版本记录此次回滚操作

### 查询交互
11. **QueryStyles**: 查询样式列表
    - 权限：需要登录用户
    - 输入：过滤条件（status, type 等）、排序、分页
    - 返回：符合条件的样式列表

12. **QueryVersions**: 查询版本历史
    - 权限：需要登录用户
    - 输入：分页参数
    - 返回：版本列表及其包含的样式数量

13. **QueryVersionStyles**: 查询特定版本的样式
    - 权限：需要登录用户
    - 输入：versionId
    - 返回：该版本的所有样式快照

## 计算属性

### Style 实体的计算属性
1. **versionCount**: 包含此样式的版本数量
   - 使用 Count 计算 StyleVersionRelation

### Version 实体的计算属性
1. **styleCount**: 版本包含的样式数量
   - 使用 Count 计算 StyleVersionRelation

### 全局字典
1. **totalStyles**: 系统中的样式总数
2. **publishedStyles**: 已发布的样式数量
3. **activeVersion**: 当前活跃版本

## 业务规则

1. **唯一性约束**：
   - Style 的 slug 必须唯一（未删除的样式中）

2. **状态转换规则**：
   - draft → published → offline
   - offline → published
   - 已删除的样式不能发布

3. **版本管理规则**：
   - 同时只能有一个活跃版本
   - 只有 published 状态的样式才会被包含在版本中
   - 回滚操作会创建新版本，而不是激活旧版本

4. **权限规则**：
   - operator 可以创建、更新、发布样式，创建版本
   - admin 拥有所有权限，包括删除和回滚

## 错误处理

1. 重复 slug 错误
2. 权限不足错误
3. 样式不存在错误
4. 版本不存在错误
5. 无效状态转换错误 