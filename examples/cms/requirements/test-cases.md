# Style 管理系统测试用例

## TC001: 创建 Style
- **前置条件**: 用户已登录且具有 Editor 或 Admin 权限
- **输入数据**: 
  ```json
  {
    "label": "Manga Style",
    "slug": "manga-style", 
    "description": "Japanese manga illustration style",
    "type": "animation",
    "thumb_key": "styles/manga/thumb.jpg",
    "priority": 10
  }
  ```
- **预期结果**:
  1. 创建新的 Style 记录
  2. Style 状态默认为 "draft"
  3. created_at 和 updated_at 设置为当前时间
  4. id 自动生成为 UUID
  5. 创建者关联到当前用户
- **后置验证**: Style 出现在草稿列表中

## TC002: 编辑 Style
- **前置条件**: Style 存在且用户有编辑权限（创建者或 Admin）
- **输入数据**: 
  ```json
  {
    "id": "existing-style-id",
    "label": "Updated Manga Style",
    "description": "Updated description",
    "priority": 5
  }
  ```
- **预期结果**:
  1. 更新 Style 的指定字段
  2. updated_at 自动更新为当前时间
  3. 其他字段保持不变
- **异常场景**: 
  - 非创建者且非 Admin 用户编辑应失败
  - slug 重复应失败

## TC003: 删除 Style
- **前置条件**: Style 存在且用户有删除权限
- **输入数据**: `styleId: "style-to-delete"`
- **预期结果**:
  1. Style 记录被标记为删除或物理删除
  2. 相关的 StyleVersion 关系被移除
- **异常场景**: 
  - Style 被已发布版本引用时删除应失败
  - 非创建者且非 Admin 用户删除应失败

## TC004: 调整 Style 排序
- **前置条件**: 存在多个 Style 记录
- **输入数据**: 
  ```json
  {
    "styleUpdates": [
      {"id": "style1", "priority": 1},
      {"id": "style2", "priority": 2},
      {"id": "style3", "priority": 3}
    ]
  }
  ```
- **预期结果**:
  1. 批量更新多个 Style 的 priority 值
  2. 所有相关 Style 的 updated_at 更新
  3. 排序立即生效

## TC005: 更改 Style 状态
- **前置条件**: Style 存在且用户有权限
- **输入数据**: 
  ```json
  {
    "id": "style-id",
    "status": "published"
  }
  ```
- **预期结果**:
  1. Style 状态更新为指定值
  2. updated_at 自动更新
- **状态转换规则**:
  - draft → published/offline
  - published → offline
  - offline → draft

## TC006: 查询 Style 列表
- **前置条件**: 系统中存在多个 Style
- **输入数据**: 
  ```json
  {
    "filter": {
      "type": "animation",
      "status": "published"
    },
    "sort": "priority",
    "page": 1,
    "limit": 10
  }
  ```
- **预期结果**:
  1. 返回符合条件的 Style 列表
  2. 按 priority 排序
  3. 分页信息正确
  4. 总数统计正确

## TC007: 创建版本
- **前置条件**: 用户具有 Admin 权限，存在 published 状态的 Style
- **输入数据**: 
  ```json
  {
    "name": "Spring Festival 2024",
    "description": "春节活动版本",
    "styleIds": ["style1", "style2", "style3"]
  }
  ```
- **预期结果**:
  1. 创建新的 Version 记录
  2. 状态默认为 "draft"
  3. 创建 StyleVersion 关系记录
  4. version_number 自动递增
  5. 创建者关联到当前用户

## TC008: 发布版本
- **前置条件**: 版本存在且状态为 "draft"，用户为 Admin
- **输入数据**: `versionId: "version-id"`
- **预期结果**:
  1. 版本状态更新为 "published"
  2. published_at 设置为当前时间
  3. 其他已发布版本状态变为 "archived"
  4. 版本中的 Style 按指定排序生效
- **业务规则**: 同时只能有一个版本处于 published 状态

## TC009: 版本回滚
- **前置条件**: 存在历史版本，用户为 Admin
- **输入数据**: `targetVersionId: "historical-version-id"`
- **预期结果**:
  1. 目标版本状态更新为 "published"
  2. 当前版本状态变为 "archived"
  3. Style 配置恢复到目标版本状态
  4. 操作记录到审计日志

## TC010: 编辑版本内容
- **前置条件**: 版本状态为 "draft"，用户有权限
- **输入数据**: 
  ```json
  {
    "versionId": "version-id",
    "styleUpdates": [
      {"styleId": "style1", "sortOrder": 1, "isActive": true},
      {"styleId": "style2", "sortOrder": 2, "isActive": false}
    ]
  }
  ```
- **预期结果**:
  1. 更新版本中 Style 的排序和激活状态
  2. StyleVersion 关系记录被更新
- **异常场景**: 已发布版本不允许编辑

## TC011: 用户权限验证 - Admin 操作
- **前置条件**: 用户角色为 Admin
- **测试操作**: 执行所有 Style 和 Version 操作
- **预期结果**: 所有操作都应成功

## TC012: 用户权限验证 - Editor 操作
- **前置条件**: 用户角色为 Editor
- **测试操作**: 
  - 创建、编辑自己的 Style ✓
  - 编辑他人的 Style ✗
  - 创建版本草稿 ✓
  - 发布版本 ✗
- **预期结果**: 权限范围内操作成功，超出权限操作失败

## TC013: 用户权限验证 - Viewer 操作
- **前置条件**: 用户角色为 Viewer
- **测试操作**: 只能查看已发布的 Style 和版本
- **预期结果**: 所有修改操作都应失败

## TC014: 并发操作测试
- **前置条件**: 多个用户同时操作
- **测试场景**:
  1. 两个用户同时编辑同一 Style
  2. 两个 Admin 同时发布不同版本
- **预期结果**:
  1. Style 编辑：后提交的覆盖先提交的（乐观锁）
  2. 版本发布：只有一个成功，另一个失败

## TC015: 数据完整性测试
- **测试场景**:
  1. 删除被版本引用的 Style
  2. 修改已发布版本中的 Style
  3. 创建重复 slug 的 Style
- **预期结果**: 所有违反完整性约束的操作都应失败并返回明确错误信息

## TC016: 计算属性验证
- **前置条件**: 版本包含多个 Style
- **验证内容**:
  1. 版本的 Style 总数自动计算
  2. 用户创建的 Style 数量自动计算
  3. Style 在版本中的排序自动计算
- **预期结果**: 所有计算属性值正确且实时更新

## TC017: 批量操作测试
- **输入数据**: 选择多个 Style 进行批量状态更新
- **预期结果**:
  1. 所有选中的 Style 状态同时更新
  2. 操作在单个事务中完成
  3. 失败时所有更改回滚

## TC018: 搜索和过滤测试
- **输入数据**: 各种搜索条件组合
- **预期结果**:
  1. 按 label 模糊搜索正确
  2. 按 type 精确过滤正确
  3. 按状态组合过滤正确
  4. 结果排序和分页正确

## TC019: 边界值测试
- **测试场景**:
  1. priority 值为 0 或负数
  2. label 为空字符串
  3. 超长的 description
  4. 无效的 slug 格式
- **预期结果**: 边界值处理正确，无效输入被拒绝

## TC020: 系统恢复测试
- **测试场景**: 版本发布过程中系统异常
- **预期结果**:
  1. 事务回滚，数据一致性保持
  2. 系统重启后状态正确恢复
  3. 无数据丢失或损坏