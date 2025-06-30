# 测试用例文档 - Style 管理系统

## TC001: 创建新 Style
- **前置条件**: 用户已登录且具有管理员权限，当前版本为草稿状态
- **输入数据**: 
  - label: "Manga Style"
  - slug: "manga" 
  - description: "日式漫画风格"
  - type: "animation"
  - thumb_key: "styles/manga-thumb.jpg"
- **预期结果**:
  1. 创建新的 Style 记录
  2. 自动生成 UUID 作为 id
  3. 状态自动设置为 "draft"
  4. created_at 和 updated_at 设置为当前时间
  5. priority 自动设置为当前版本中最大值 + 1
  6. 版本中的 Style 总数自动 +1
- **后验证**: Style 出现在当前版本的 Style 列表中

## TC002: 编辑 Style 信息
- **前置条件**: Style 存在且状态为 "draft"，用户具有编辑权限
- **输入数据**: 
  - styleId: "existing-style-id"
  - label: "Updated Manga Style"
  - description: "更新的日式漫画风格描述"
- **预期结果**:
  1. 更新指定 Style 的 label 和 description
  2. updated_at 自动更新为当前时间
  3. 其他字段保持不变
- **异常场景**: 尝试编辑已发布的 Style 应该失败

## TC003: 发布 Style
- **前置条件**: Style 状态为 "draft"，用户具有发布权限
- **输入数据**: styleId: "draft-style-id"
- **预期结果**:
  1. Style 状态从 "draft" 变更为 "published"
  2. updated_at 自动更新
  3. 版本中已发布 Style 计数自动 +1
- **异常场景**: 重复发布应该失败

## TC004: 下线 Style
- **前置条件**: Style 状态为 "published"，用户具有管理权限
- **输入数据**: styleId: "published-style-id"
- **预期结果**:
  1. Style 状态从 "published" 变更为 "offline"
  2. updated_at 自动更新
  3. 版本中已发布 Style 计数自动 -1，下线 Style 计数自动 +1
- **后验证**: Style 不再出现在公开的 Style 列表中

## TC005: 拖拽排序 Style
- **前置条件**: 版本中存在多个 Style，用户具有编辑权限
- **输入数据**: 
  - styleId: "style-to-move"
  - newPriority: 2
  - affectedStyles: ["style1", "style2", "style3"]
- **预期结果**:
  1. 目标 Style 的 priority 更新为新值
  2. 受影响的其他 Style 的 priority 自动调整
  3. 所有 Style 的 priority 保持唯一且连续
  4. 所有涉及的 Style 的 updated_at 自动更新
- **后验证**: Style 列表按新的 priority 顺序排列

## TC006: 批量调整 Style 优先级
- **前置条件**: 版本中存在多个 Style，用户具有编辑权限
- **输入数据**: 
  - priorityUpdates: [
    {styleId: "style1", priority: 1},
    {styleId: "style2", priority: 2},
    {styleId: "style3", priority: 3}
  ]
- **预期结果**:
  1. 所有指定的 Style 的 priority 批量更新
  2. 确保没有 priority 冲突
  3. 所有涉及的 Style 的 updated_at 自动更新
- **异常场景**: priority 冲突应该回滚整个操作

## TC007: 创建新版本
- **前置条件**: 用户具有版本管理权限
- **输入数据**: 
  - name: "v1.1"
  - description: "新增动画风格支持"
  - baseVersionId: "v1.0-id" (可选，用于复制)
- **预期结果**:
  1. 创建新的 Version 记录
  2. 状态设置为 "draft"
  3. 如果指定了 baseVersionId，复制基础版本的所有 Style
  4. 复制的 Style 状态重置为 "draft"
  5. 版本计数自动更新

## TC008: 发布版本
- **前置条件**: Version 状态为 "draft"，包含至少一个已发布的 Style
- **输入数据**: versionId: "draft-version-id"
- **预期结果**:
  1. Version 状态从 "draft" 变更为 "published"
  2. published_at 设置为当前时间
  3. 该版本成为当前活跃版本
  4. 之前的活跃版本状态保持 "published" 但不再是活跃版本

## TC009: 回滚到历史版本
- **前置条件**: 存在已发布的历史版本，用户具有版本管理权限
- **输入数据**: targetVersionId: "historical-version-id"
- **预期结果**:
  1. 目标版本成为当前活跃版本
  2. 系统记录回滚操作的时间戳
  3. 所有相关的计算属性重新计算
- **后验证**: 前端显示的 Style 列表对应目标版本

## TC010: 按状态查询 Style
- **前置条件**: 版本中存在不同状态的 Style
- **输入数据**: 
  - versionId: "current-version-id"
  - status: "published"
- **预期结果**:
  1. 返回指定版本中状态为 "published" 的所有 Style
  2. 结果按 priority 升序排列
  3. 包含所有必要的字段信息

## TC011: 按类型查询 Style
- **前置条件**: 版本中存在不同类型的 Style
- **输入数据**: 
  - versionId: "current-version-id"
  - type: "animation"
- **预期结果**:
  1. 返回指定版本中类型为 "animation" 的所有 Style
  2. 结果按 priority 升序排列
  3. 包含各种状态的 Style

## TC012: 搜索 Style
- **前置条件**: 版本中存在多个 Style
- **输入数据**: 
  - versionId: "current-version-id"
  - keyword: "manga"
- **预期结果**:
  1. 返回 label 或 description 包含 "manga" 的 Style
  2. 搜索不区分大小写
  3. 结果按相关性或 priority 排序

## TC013: 验证 slug 唯一性
- **前置条件**: 版本中已存在 slug 为 "manga" 的 Style
- **输入数据**: 
  - label: "New Manga"
  - slug: "manga"
  - 其他字段...
- **预期结果**:
  1. 创建操作失败
  2. 返回错误信息说明 slug 已存在
  3. 数据库状态保持不变

## TC014: 权限控制 - 编辑者权限
- **前置条件**: 用户具有编辑者权限（非管理员）
- **输入数据**: 尝试发布版本操作
- **预期结果**:
  1. 操作被拒绝
  2. 返回权限不足的错误信息
  3. 版本状态保持不变

## TC015: 权限控制 - 查看者权限
- **前置条件**: 用户具有查看者权限
- **输入数据**: 尝试创建新 Style
- **预期结果**:
  1. 操作被拒绝
  2. 返回权限不足的错误信息
  3. 不创建任何新记录

## TC016: 自动计算版本统计
- **前置条件**: 版本中存在多个不同状态的 Style
- **输入数据**: 查询版本详情
- **预期结果**:
  1. 自动计算并返回版本中的 Style 总数
  2. 自动计算并返回各状态的 Style 数量
  3. 统计数据与实际数据一致

## TC017: 事务性排序更新
- **前置条件**: 版本中存在 5 个 Style，priority 分别为 1,2,3,4,5
- **输入数据**: 将 priority=1 的 Style 移动到 priority=3 的位置
- **预期结果**:
  1. 目标 Style priority 更新为 3
  2. 原 priority=2,3 的 Style 自动调整为 1,2
  3. 如果过程中出现错误，所有变更回滚
  4. 最终 priority 序列保持 1,2,3,4,5

## TC018: 删除草稿 Style
- **前置条件**: Style 状态为 "draft"，用户具有删除权限
- **输入数据**: styleId: "draft-style-id"
- **预期结果**:
  1. Style 记录被软删除（或硬删除，根据业务需求）
  2. 版本中的 Style 总数自动 -1
  3. 其他 Style 的 priority 自动调整以填补空隙

## TC019: 并发编辑冲突处理
- **前置条件**: 两个用户同时编辑同一个 Style
- **输入数据**: 
  - 用户A: 更新 label
  - 用户B: 更新 description  
- **预期结果**:
  1. 使用乐观锁定机制检测冲突
  2. 后提交的操作失败并返回冲突提示
  3. 数据保持一致性，不出现部分更新

## TC020: 版本切换的数据完整性
- **前置条件**: 存在两个不同的版本 A 和 B
- **输入数据**: 从版本 A 切换到版本 B
- **预期结果**:
  1. 所有相关的计算属性重新计算
  2. 前端查询结果立即反映版本 B 的数据
  3. 没有缓存或延迟导致的数据不一致