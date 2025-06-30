# 详细需求分析 - Style 管理系统

## 业务背景
构建一个内容管理系统，让产品运营人员能够在线管理预置的 Style 数据，包括拖拽排序、版本管理和发布控制等功能。

## 数据模型分析

### 核心实体：Style
Style 对象代表一种风格样式，具有以下属性：

| 字段 | 类型 | 必填 | 描述 | 业务规则 |
|------|------|------|------|----------|
| id | uuid | 是 | 唯一标识符 | 系统自动生成 |
| label | text | 是 | 显示名称 | 如 "Manga"，用于前端展示 |
| slug | text | 是 | URL安全标识 | 全局唯一，如 "manga"，对应旧系统 value |
| description | text | 否 | 描述信息 | 详细说明该风格 |
| type | varchar(32) | 是 | 风格类型 | 如 "animation", "surreal" 等 |
| thumb_key | text | 否 | 缩略图地址 | S3 存储地址 |
| priority | int | 是 | 排序优先级 | 用于前端排序显示，数值越小优先级越高 |
| status | varchar(16) | 是 | 状态 | draft/published/offline |
| created_at | timestamptz | 是 | 创建时间 | 系统自动设置 |
| updated_at | timestamptz | 是 | 更新时间 | 系统自动维护 |

### 辅助实体：Version
为支持版本管理和回滚功能，需要版本控制实体：

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | uuid | 是 | 版本标识符 |
| name | text | 是 | 版本名称 |
| description | text | 否 | 版本描述 |
| status | varchar(16) | 是 | draft/published |
| created_at | timestamptz | 是 | 创建时间 |
| published_at | timestamptz | 否 | 发布时间 |

### 关系模型
- Style 与 Version 是多对一关系
- 每个 Style 属于一个 Version
- 一个 Version 可以包含多个 Style

## 功能需求分析

### 1. Style 管理功能
- **创建 Style**：新建风格样式记录
- **编辑 Style**：修改现有风格样式信息
- **删除 Style**：软删除（设置状态为 offline）
- **状态管理**：draft → published → offline 状态流转

### 2. 排序功能
- **拖拽排序**：支持用户通过拖拽调整 Style 显示顺序
- **批量排序**：一次性调整多个 Style 的 priority 值
- **自动排序**：新建 Style 时自动分配合适的 priority 值

### 3. 版本管理功能
- **创建版本**：创建新的 Style 版本
- **发布版本**：将草稿版本发布为正式版本
- **回滚版本**：回滚到历史版本
- **版本对比**：查看不同版本间的差异

### 4. 查询功能
- **按状态查询**：获取特定状态的 Style 列表
- **按类型查询**：获取特定类型的 Style 列表
- **按版本查询**：获取特定版本下的 Style 列表
- **搜索功能**：根据 label 或 description 搜索

## 权限需求
- **管理员**：完整的 CRUD 权限，版本管理权限
- **编辑者**：可以创建和编辑 Style，但不能发布版本
- **查看者**：仅能查看已发布的 Style

## 业务规则
1. **唯一性约束**：同一版本内 slug 必须唯一
2. **状态流转**：draft → published → offline，不可逆向流转
3. **版本约束**：已发布版本不可修改，只能创建新版本
4. **排序约束**：priority 值在同一版本内不能重复
5. **删除约束**：已发布的 Style 不能直接删除，只能设置为 offline

## 技术约束
1. 使用 interaqt 框架的响应式编程模式
2. 所有数据变更必须通过 Interaction 触发
3. 排序、状态变更等需要通过 Computation 自动维护
4. 必须支持事务性操作确保数据一致性