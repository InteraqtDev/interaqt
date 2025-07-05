# CMS 系统测试用例文档

## Style 管理测试用例

### TC001: 创建 Style（通过 CreateStyle 交互）
- 交互：CreateStyle
- 前置条件：operator 角色用户已登录
- 输入数据：
  - label: "Manga Style"
  - slug: "manga-style"
  - description: "Japanese comic art style"
  - type: "animation"
  - thumbKey: "s3://bucket/thumbnails/manga.jpg"
  - priority: 100
- 预期结果：
  1. 创建新的 Style 记录
  2. status 默认为 'draft'
  3. isDeleted 默认为 false
  4. createdAt 为当前时间
  5. updatedAt 为当前时间
  6. createdBy 关联到当前用户
  7. totalStyles 全局计数 +1

### TC002: 创建 Style 失败 - 重复 slug（通过 CreateStyle 交互）
- 交互：CreateStyle
- 前置条件：已存在 slug 为 "manga-style" 的 Style
- 输入数据：
  - label: "Another Manga"
  - slug: "manga-style"  // 重复的 slug
  - type: "animation"
  - priority: 200
- 预期结果：
  1. 交互返回错误
  2. 错误信息包含 "slug already exists"
  3. 不创建新的 Style 记录
  4. totalStyles 保持不变

### TC003: 创建 Style 失败 - 权限不足（通过 CreateStyle 交互）
- 交互：CreateStyle
- 前置条件：普通用户（非 operator/admin）已登录
- 输入数据：有效的 Style 数据
- 预期结果：
  1. 交互返回错误
  2. 错误类型为 "permission denied"
  3. 不创建 Style 记录

### TC004: 更新 Style（通过 UpdateStyle 交互）
- 交互：UpdateStyle
- 前置条件：存在一个 Style，operator 用户已登录
- 输入数据：
  - styleId: 现有 Style 的 ID
  - label: "Updated Manga Style"
  - description: "Updated description"
- 预期结果：
  1. Style 的 label 和 description 被更新
  2. updatedAt 更新为当前时间
  3. updatedBy 更新为当前用户
  4. 其他字段保持不变

### TC005: 发布 Style（通过 PublishStyle 交互）
- 交互：PublishStyle
- 前置条件：存在 status 为 'draft' 的 Style
- 输入数据：styleId
- 预期结果：
  1. Style 的 status 更新为 'published'
  2. publishedStyles 全局计数 +1
  3. updatedAt 更新为当前时间

### TC006: 软删除 Style（通过 DeleteStyle 交互）
- 交互：DeleteStyle
- 前置条件：admin 用户已登录，存在一个 Style
- 输入数据：styleId
- 预期结果：
  1. Style 的 isDeleted 设置为 true
  2. 如果 status 是 'published'，publishedStyles 计数 -1
  3. 被删除的 Style 不出现在普通查询中

### TC007: 恢复已删除的 Style（通过 RestoreStyle 交互）
- 交互：RestoreStyle
- 前置条件：存在 isDeleted 为 true 的 Style
- 输入数据：styleId
- 预期结果：
  1. Style 的 isDeleted 设置为 false
  2. Style 重新出现在查询结果中

### TC008: 更新 Style 优先级（通过 UpdateStylePriority 交互）
- 交互：UpdateStylePriority
- 前置条件：存在多个 Style
- 输入数据：
  - styleId: 目标 Style ID
  - newPriority: 50
- 预期结果：
  1. 目标 Style 的 priority 更新为 50
  2. 查询时按 priority 排序正确

## 版本管理测试用例

### TC009: 创建版本（通过 CreateVersion 交互）
- 交互：CreateVersion
- 前置条件：存在多个 published 状态的 Style
- 输入数据：
  - comment: "First release version"
- 预期结果：
  1. 创建新的 Version 记录
  2. versionNumber 自动递增
  3. 所有 published 状态的 Style 被复制到 StyleVersion
  4. 新版本的 isActive 设置为 true
  5. 之前的活跃版本 isActive 设置为 false
  6. Version 的 styleCount 等于 published Style 数量

### TC010: 回滚到指定版本（通过 RollbackToVersion 交互）
- 交互：RollbackToVersion
- 前置条件：存在历史版本，admin 用户已登录
- 输入数据：versionId（历史版本 ID）
- 预期结果：
  1. 创建新的版本记录
  2. 当前 Style 被替换为指定版本的 StyleVersion 数据
  3. 新版本的 comment 包含 "Rollback to version X"
  4. 新版本成为活跃版本

## 查询测试用例

### TC011: 查询 Style 列表（通过 QueryStyles 交互）
- 交互：QueryStyles
- 前置条件：存在多个不同状态的 Style
- 输入数据：
  - filter: { status: 'published' }
  - sort: { field: 'priority', order: 'asc' }
  - pagination: { page: 1, pageSize: 10 }
- 预期结果：
  1. 只返回 published 状态的 Style
  2. 按 priority 升序排序
  3. 返回正确的分页数据
  4. 不包含 isDeleted 为 true 的记录

### TC012: 查询版本历史（通过 QueryVersions 交互）
- 交互：QueryVersions
- 前置条件：存在多个版本
- 输入数据：
  - pagination: { page: 1, pageSize: 5 }
- 预期结果：
  1. 返回版本列表，按创建时间倒序
  2. 每个版本包含 styleCount
  3. 标识当前活跃版本

### TC013: 查询特定版本的样式（通过 QueryVersionStyles 交互）
- 交互：QueryVersionStyles
- 前置条件：存在包含样式的版本
- 输入数据：versionId
- 预期结果：
  1. 返回该版本的所有 StyleVersion 记录
  2. 数据为版本创建时的快照，不受当前 Style 影响

## 批量操作测试用例

### TC014: 批量重排序（通过 ReorderStyles 交互）
- 交互：ReorderStyles
- 前置条件：存在多个 Style
- 输入数据：
  ```
  [
    { styleId: "id1", priority: 10 },
    { styleId: "id2", priority: 20 },
    { styleId: "id3", priority: 30 }
  ]
  ```
- 预期结果：
  1. 所有指定 Style 的 priority 被更新
  2. 查询时排序正确反映新的优先级

## 边界条件测试用例

### TC015: 删除已发布的 Style
- 交互：DeleteStyle
- 前置条件：Style status 为 'published'
- 输入数据：styleId
- 预期结果：
  1. Style 被软删除
  2. publishedStyles 全局计数 -1

### TC016: 发布已删除的 Style 失败
- 交互：PublishStyle
- 前置条件：Style 的 isDeleted 为 true
- 输入数据：styleId
- 预期结果：
  1. 交互返回错误
  2. 错误信息表明无法发布已删除的样式

### TC017: 创建版本时没有 published 样式
- 交互：CreateVersion
- 前置条件：系统中没有 published 状态的 Style
- 输入数据：comment: "Empty version"
- 预期结果：
  1. 版本创建成功
  2. styleCount 为 0
  3. 没有 StyleVersion 记录被创建

## 并发操作测试用例

### TC018: 并发更新同一 Style
- 交互：UpdateStyle
- 前置条件：两个用户同时编辑同一个 Style
- 输入数据：不同的更新内容
- 预期结果：
  1. 后执行的更新覆盖先执行的
  2. updatedAt 和 updatedBy 反映最后的更新

## 计算属性测试用例

### TC019: Style 的 versionCount 计算
- 前置条件：一个 Style 被包含在多个版本中
- 预期结果：
  1. Style 的 versionCount 属性正确反映包含它的版本数量
  2. 创建新版本后 versionCount 自动更新

### TC020: 全局字典更新
- 前置条件：执行各种 Style 操作
- 预期结果：
  1. totalStyles 反映所有未删除的 Style 数量
  2. publishedStyles 反映 published 状态的 Style 数量
  3. activeVersion 指向当前活跃版本 