# CMS 系统交互矩阵

## 用户角色定义

| 角色 | 权限描述 |
|------|----------|
| admin | 系统管理员，拥有所有权限 |
| operator | 运营人员，可以管理样式和版本，但不能删除和回滚 |
| viewer | 只读用户，只能查看数据 |

## 交互权限矩阵

| 交互名称 | admin | operator | viewer | 说明 |
|----------|-------|----------|--------|------|
| **Style 管理** |
| CreateStyle | ✅ | ✅ | ❌ | 创建新样式 |
| UpdateStyle | ✅ | ✅ | ❌ | 更新样式属性 |
| DeleteStyle | ✅ | ❌ | ❌ | 软删除样式 |
| RestoreStyle | ✅ | ❌ | ❌ | 恢复已删除样式 |
| PublishStyle | ✅ | ✅ | ❌ | 发布样式 |
| UnpublishStyle | ✅ | ✅ | ❌ | 下线样式 |
| **排序管理** |
| UpdateStylePriority | ✅ | ✅ | ❌ | 更新单个样式优先级 |
| ReorderStyles | ✅ | ✅ | ❌ | 批量重排序 |
| **版本管理** |
| CreateVersion | ✅ | ✅ | ❌ | 创建新版本快照 |
| RollbackToVersion | ✅ | ❌ | ❌ | 回滚到历史版本 |
| **查询操作** |
| QueryStyles | ✅ | ✅ | ✅ | 查询样式列表 |
| QueryVersions | ✅ | ✅ | ✅ | 查询版本历史 |
| QueryVersionStyles | ✅ | ✅ | ✅ | 查询版本的样式快照 |

## 交互依赖关系

### 前置条件依赖

| 交互 | 前置条件 |
|------|----------|
| UpdateStyle | Style 必须存在且未被删除 |
| DeleteStyle | Style 必须存在且未被删除 |
| RestoreStyle | Style 必须存在且已被删除 |
| PublishStyle | Style 必须存在、未被删除且状态为 draft |
| UnpublishStyle | Style 必须存在、未被删除且状态为 published |
| UpdateStylePriority | Style 必须存在且未被删除 |
| CreateVersion | 至少存在一个 published 状态的 Style |
| RollbackToVersion | Version 必须存在 |

### 数据影响关系

| 交互 | 影响的数据 |
|------|------------|
| CreateStyle | 创建 Style 实体，totalStyles +1 |
| UpdateStyle | 更新 Style 属性，更新 updatedAt/updatedBy |
| DeleteStyle | 设置 isDeleted=true，如果是 published 则 publishedStyles -1 |
| RestoreStyle | 设置 isDeleted=false |
| PublishStyle | 更新 status='published'，publishedStyles +1 |
| UnpublishStyle | 更新 status='offline'，publishedStyles -1 |
| CreateVersion | 创建 Version 实体，复制所有 published Style 到 StyleVersion |
| RollbackToVersion | 创建新 Version，更新 Style 数据 |

## 交互参数完整性检查

| 交互 | 必需参数 | 可选参数 | 参数验证 |
|------|----------|----------|----------|
| CreateStyle | label, slug, type, priority | description, thumbKey | slug 唯一性，type 枚举值 |
| UpdateStyle | styleId | label, description, type, thumbKey, priority | styleId 存在性 |
| DeleteStyle | styleId | - | styleId 存在性 |
| RestoreStyle | styleId | - | styleId 存在性 |
| PublishStyle | styleId | - | styleId 存在性，状态检查 |
| UnpublishStyle | styleId | - | styleId 存在性，状态检查 |
| UpdateStylePriority | styleId, newPriority | - | styleId 存在性，priority > 0 |
| ReorderStyles | styles[] | - | 数组非空，styleId 存在性 |
| CreateVersion | - | comment | - |
| RollbackToVersion | versionId | - | versionId 存在性 |
| QueryStyles | - | filter, sort, pagination | - |
| QueryVersions | - | pagination | - |
| QueryVersionStyles | versionId | - | versionId 存在性 |

## 交互测试覆盖度

| 交互 | 成功用例 | 失败用例 | 边界用例 |
|------|----------|----------|----------|
| CreateStyle | TC001 | TC002, TC003 | - |
| UpdateStyle | TC004 | - | TC018 |
| DeleteStyle | TC006 | - | TC015 |
| RestoreStyle | TC007 | - | - |
| PublishStyle | TC005 | TC016 | - |
| UnpublishStyle | - | - | - |
| UpdateStylePriority | TC008 | - | - |
| ReorderStyles | TC014 | - | - |
| CreateVersion | TC009 | - | TC017 |
| RollbackToVersion | TC010 | - | - |
| QueryStyles | TC011 | - | - |
| QueryVersions | TC012 | - | - |
| QueryVersionStyles | TC013 | - | - |

## 并发控制策略

| 场景 | 策略 |
|------|------|
| 并发更新同一 Style | 后写覆盖，记录所有更新历史 |
| 并发创建相同 slug | 数据库唯一约束，第二个失败 |
| 并发创建版本 | 顺序执行，版本号自增 |
| 并发删除/恢复 | 最后操作生效 | 