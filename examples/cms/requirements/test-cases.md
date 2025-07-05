# 测试用例文档

## 测试用例说明
所有测试用例都基于 Interactions，不测试单独的 Entity/Relation 操作。

## Style 管理测试用例

### TC001: 创建样式 - 成功案例
- **Interaction**: CreateStyle
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 系统中不存在 slug 为 "manga" 的样式
- **输入数据**: 
  ```javascript
  {
    label: "Manga",
    slug: "manga",
    description: "Japanese comic style",
    type: "animation",
    thumbKey: "s3://bucket/manga-thumb.jpg",
    priority: 10
  }
  ```
- **预期结果**:
  1. 创建新的 Style 记录
  2. Style 的 status 为 "draft"
  3. createdAt 为当前时间
  4. updatedAt 为当前时间
  5. lastModifiedBy 关联到当前用户
  6. 所有输入字段正确保存
- **后续验证**: 
  - 通过 GetStyles 能查询到新创建的样式
  - 通过 GetStyleDetail 能获取完整信息

### TC002: 创建样式 - slug 重复失败
- **Interaction**: CreateStyle
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 系统中已存在 slug 为 "manga" 的样式
- **输入数据**: 
  ```javascript
  {
    label: "Another Manga",
    slug: "manga", // 重复的 slug
    description: "Another manga style",
    type: "animation",
    thumbKey: "s3://bucket/another-manga.jpg",
    priority: 5
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为 "validation failed"
  3. 错误信息包含 "slug already exists"
  4. 没有创建新的 Style 记录
- **后续验证**: GetStyles 查询结果中只有一个 slug 为 "manga" 的样式

### TC003: 创建样式 - 权限不足失败
- **Interaction**: CreateStyle
- **前置条件**: 
  - 用户已登录，角色为 "viewer"（无权限角色）
- **输入数据**: 
  ```javascript
  {
    label: "Test Style",
    slug: "test-style",
    description: "Test",
    type: "animation",
    thumbKey: "s3://bucket/test.jpg",
    priority: 1
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为 "permission denied"
  3. 没有创建新的 Style 记录

### TC004: 更新样式 - 成功案例
- **Interaction**: UpdateStyle
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在一个 status 为 "draft" 的样式
- **输入数据**: 
  ```javascript
  {
    styleId: "existing-style-id",
    label: "Updated Manga",
    description: "Updated description",
    priority: 20
  }
  ```
- **预期结果**:
  1. Style 的指定字段被更新
  2. updatedAt 更新为当前时间
  3. lastModifiedBy 更新为当前用户
  4. 未指定的字段保持不变
- **后续验证**: GetStyleDetail 返回更新后的数据

### TC005: 更新样式 - 更新 offline 状态失败
- **Interaction**: UpdateStyle
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在一个 status 为 "offline" 的样式
- **输入数据**: 
  ```javascript
  {
    styleId: "offline-style-id",
    label: "Try to update"
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息表明不能更新 offline 状态的样式
  3. Style 数据保持不变

### TC006: 发布样式 - 成功案例
- **Interaction**: PublishStyle
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在一个 status 为 "draft" 的样式
  - 系统中没有活动版本或有一个活动版本
- **输入数据**: 
  ```javascript
  {
    styleId: "draft-style-id"
  }
  ```
- **预期结果**:
  1. Style 的 status 更新为 "published"
  2. 创建新的 Version 记录
  3. Version 的 versionNumber 自增
  4. Version 的 isActive 为 true
  5. 之前的活动版本（如果存在）的 isActive 更新为 false
  6. Version 的 publishedBy 关联到当前用户
  7. Version 的 publishedAt 为当前时间
- **后续验证**: 
  - GetVersionHistory 能查询到新版本
  - Style 的 versionCount 增加 1

### TC007: 删除样式（软删除）- 成功案例
- **Interaction**: DeleteStyle
- **前置条件**: 
  - 用户已登录，角色为 admin
  - 存在一个 status 为 "published" 的样式
- **输入数据**: 
  ```javascript
  {
    styleId: "published-style-id"
  }
  ```
- **预期结果**:
  1. Style 的 status 更新为 "offline"
  2. 其他数据保持不变
  3. 相关的版本记录保持不变
- **后续验证**: 
  - GetStyles 默认查询不返回 offline 状态的样式
  - 指定 status="offline" 可以查询到该样式

### TC008: 删除样式 - 权限不足失败
- **Interaction**: DeleteStyle
- **前置条件**: 
  - 用户已登录，角色为 operator（非 admin）
  - 存在一个样式
- **输入数据**: 
  ```javascript
  {
    styleId: "any-style-id"
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为 "permission denied"
  3. Style 状态保持不变

### TC009: 批量更新排序 - 成功案例
- **Interaction**: UpdateStyleOrder
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在多个非 offline 状态的样式
- **输入数据**: 
  ```javascript
  {
    styleOrders: [
      { styleId: "style-1", priority: 1 },
      { styleId: "style-2", priority: 2 },
      { styleId: "style-3", priority: 3 }
    ]
  }
  ```
- **预期结果**:
  1. 所有指定样式的 priority 被更新
  2. 每个样式的 updatedAt 更新为当前时间
  3. 每个样式的 lastModifiedBy 更新为当前用户
- **后续验证**: GetStyles 返回的样式按新的 priority 排序

### TC010: 批量更新排序 - 包含 offline 样式失败
- **Interaction**: UpdateStyleOrder
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在一个 status 为 "offline" 的样式
- **输入数据**: 
  ```javascript
  {
    styleOrders: [
      { styleId: "active-style", priority: 1 },
      { styleId: "offline-style", priority: 2 }
    ]
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息表明不能更新 offline 样式的排序
  3. 所有样式的 priority 保持不变（事务回滚）

## 版本管理测试用例

### TC011: 版本回滚 - 成功案例
- **Interaction**: RollbackVersion
- **前置条件**: 
  - 用户已登录，角色为 admin
  - 存在一个有多个版本的样式
  - 要回滚的版本不是当前活动版本
- **输入数据**: 
  ```javascript
  {
    versionId: "old-version-id"
  }
  ```
- **预期结果**:
  1. 创建新的 Version 记录作为回滚版本
  2. 相关 Style 的数据恢复为指定版本的快照
  3. 新版本的 isActive 为 true
  4. 之前的活动版本的 isActive 更新为 false
  5. 新版本的 publishedBy 为当前用户
- **后续验证**: 
  - GetStyleDetail 返回回滚后的数据
  - GetVersionHistory 显示新的回滚版本

### TC012: 版本回滚 - 权限不足失败
- **Interaction**: RollbackVersion
- **前置条件**: 
  - 用户已登录，角色为 operator（非 admin）
  - 存在版本记录
- **输入数据**: 
  ```javascript
  {
    versionId: "any-version-id"
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误类型为 "permission denied"
  3. 没有创建新版本
  4. Style 数据保持不变

## 查询测试用例

### TC013: 查询样式列表 - 默认查询
- **Interaction**: GetStyles
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 系统中有多个不同状态的样式
- **输入数据**: 
  ```javascript
  {}
  ```
- **预期结果**:
  1. 返回所有非 offline 状态的样式
  2. 结果按 priority 升序排序
  3. 每个样式包含基本信息和 versionCount

### TC014: 查询样式列表 - 按状态过滤
- **Interaction**: GetStyles
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 系统中有不同状态的样式
- **输入数据**: 
  ```javascript
  {
    status: "draft"
  }
  ```
- **预期结果**:
  1. 只返回 status 为 "draft" 的样式
  2. 结果按 priority 升序排序

### TC015: 查询样式详情 - 成功案例
- **Interaction**: GetStyleDetail
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在指定 ID 的样式
- **输入数据**: 
  ```javascript
  {
    styleId: "existing-style-id"
  }
  ```
- **预期结果**:
  1. 返回完整的样式信息
  2. 包含 lastModifiedBy 用户信息
  3. 包含 currentVersion 信息（如果有）
  4. 包含 versionCount

### TC016: 查询版本历史 - 成功案例
- **Interaction**: GetVersionHistory
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在指定样式的多个版本
- **输入数据**: 
  ```javascript
  {
    styleId: "style-with-versions"
  }
  ```
- **预期结果**:
  1. 返回该样式的所有版本
  2. 按 versionNumber 降序排序
  3. 每个版本包含 publishedBy 用户信息
  4. 标识当前活动版本

## 边界情况测试用例

### TC017: 创建样式 - 必填字段缺失
- **Interaction**: CreateStyle
- **前置条件**: 用户已登录，角色为 operator
- **输入数据**: 
  ```javascript
  {
    label: "Test",
    // 缺少 slug
    type: "animation"
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息表明必填字段缺失

### TC018: 更新样式 - 不存在的样式
- **Interaction**: UpdateStyle
- **前置条件**: 用户已登录，角色为 operator
- **输入数据**: 
  ```javascript
  {
    styleId: "non-existent-id",
    label: "Update"
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息表明样式不存在

### TC019: 创建样式 - 无效的 slug 格式
- **Interaction**: CreateStyle
- **前置条件**: 用户已登录，角色为 operator
- **输入数据**: 
  ```javascript
  {
    label: "Test",
    slug: "Invalid-Slug!", // 包含大写和特殊字符
    type: "animation"
  }
  ```
- **预期结果**:
  1. Interaction 返回错误
  2. 错误信息表明 slug 格式无效

### TC020: 并发更新同一样式
- **Interaction**: UpdateStyle（并发调用）
- **前置条件**: 
  - 用户已登录，角色为 operator
  - 存在一个样式
- **输入数据**: 
  - 请求1: `{ styleId: "same-id", priority: 10 }`
  - 请求2: `{ styleId: "same-id", priority: 20 }`
- **预期结果**:
  1. 两个请求都成功执行
  2. 最终结果取决于执行顺序
  3. 数据保持一致性，没有损坏 