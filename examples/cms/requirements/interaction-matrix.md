# 交互矩阵 - Style 管理系统

## 用户角色定义

### 管理员 (Admin)
- 完整的系统访问权限
- 可以管理版本、发布内容
- 可以管理用户权限

### 编辑者 (Editor) 
- 可以创建和编辑内容
- 不能发布版本或管理权限
- 只能操作草稿状态内容

### 查看者 (Viewer)
- 只读权限
- 只能查看已发布的内容
- 不能进行任何修改操作

## 交互权限矩阵

| 交互操作 | 管理员 | 编辑者 | 查看者 | 对应测试用例 | 权限表达式 |
|----------|--------|--------|--------|--------------|------------|
| **Style 管理** |
| CreateStyle | ✅ | ✅ | ❌ | TC001 | `user.role in ['admin', 'editor']` |
| UpdateStyle | ✅ | ✅* | ❌ | TC002 | `user.role in ['admin', 'editor'] && style.status == 'draft'` |
| PublishStyle | ✅ | ❌ | ❌ | TC003 | `user.role == 'admin'` |
| OfflineStyle | ✅ | ❌ | ❌ | TC004 | `user.role == 'admin'` |
| DeleteStyle | ✅ | ✅* | ❌ | TC018 | `user.role in ['admin', 'editor'] && style.status == 'draft'` |
| GetStyle | ✅ | ✅ | ✅ | TC010 | `true` (公开读取) |
| **排序管理** |
| ReorderStyles | ✅ | ✅ | ❌ | TC005 | `user.role in ['admin', 'editor']` |
| BatchUpdatePriority | ✅ | ✅ | ❌ | TC006 | `user.role in ['admin', 'editor']` |
| **版本管理** |
| CreateVersion | ✅ | ❌ | ❌ | TC007 | `user.role == 'admin'` |
| PublishVersion | ✅ | ❌ | ❌ | TC008 | `user.role == 'admin'` |
| RollbackVersion | ✅ | ❌ | ❌ | TC009 | `user.role == 'admin'` |
| GetVersion | ✅ | ✅ | ✅** | - | `user.role in ['admin', 'editor'] \|\| version.status == 'published'` |
| **查询操作** |
| GetStylesByStatus | ✅ | ✅ | ✅** | TC010 | `user.role in ['admin', 'editor'] \|\| status == 'published'` |
| GetStylesByType | ✅ | ✅ | ✅** | TC011 | `user.role in ['admin', 'editor'] \|\| style.status == 'published'` |
| SearchStyles | ✅ | ✅ | ✅** | TC012 | `user.role in ['admin', 'editor'] \|\| style.status == 'published'` |
| GetVersionStats | ✅ | ✅ | ❌ | TC016 | `user.role in ['admin', 'editor']` |

*编辑者只能编辑草稿状态的内容  
**查看者只能看到已发布的内容

## 详细权限规则

### Style 操作权限

#### CreateStyle 权限
```typescript
// 用户必须是管理员或编辑者
const canCreateStyle = user.role === 'admin' || user.role === 'editor'
// 必须是草稿版本
const isDraftVersion = version.status === 'draft'
// 最终权限
const permission = canCreateStyle && isDraftVersion
```

#### UpdateStyle 权限
```typescript
// 基础权限：管理员或编辑者
const hasBasicPermission = user.role === 'admin' || user.role === 'editor'
// Style 必须是草稿状态
const isStyleDraft = style.status === 'draft'
// 管理员可以编辑任何状态，编辑者只能编辑草稿
const permission = user.role === 'admin' || (hasBasicPermission && isStyleDraft)
```

#### PublishStyle 权限
```typescript
// 只有管理员可以发布
const canPublish = user.role === 'admin'
// Style 必须是草稿状态
const isStyleDraft = style.status === 'draft'
// 最终权限
const permission = canPublish && isStyleDraft
```

### 版本操作权限

#### CreateVersion 权限
```typescript
// 只有管理员可以创建版本
const permission = user.role === 'admin'
```

#### PublishVersion 权限
```typescript
// 只有管理员可以发布版本
const canPublish = user.role === 'admin'
// 版本必须是草稿状态
const isVersionDraft = version.status === 'draft'
// 版本必须包含至少一个已发布的 Style
const hasPublishedStyles = version.styles.some(style => style.status === 'published')
// 最终权限
const permission = canPublish && isVersionDraft && hasPublishedStyles
```

### 查询操作权限

#### 数据可见性规则
```typescript
// 管理员和编辑者可以看到所有数据
const canSeeAllData = user.role === 'admin' || user.role === 'editor'
// 查看者只能看到已发布的数据
const canSeePublishedData = user.role === 'viewer' && data.status === 'published'
// 最终可见性
const isVisible = canSeeAllData || canSeePublishedData
```

## 错误处理策略

### 权限拒绝错误
- **错误代码**: `PERMISSION_DENIED`
- **HTTP 状态码**: 403
- **错误消息**: 根据具体操作提供详细说明

### 状态约束错误
- **错误代码**: `INVALID_STATE`
- **HTTP 状态码**: 400
- **错误消息**: 说明当前状态不允许执行该操作

### 数据约束错误
- **错误代码**: `CONSTRAINT_VIOLATION`
- **HTTP 状态码**: 409
- **错误消息**: 说明具体的约束违反情况

## 交互实现映射

| 交互名称 | 对应 Interaction | 权限检查点 | 异常处理 |
|----------|------------------|------------|----------|
| CreateStyle | CreateStyleInteraction | 创建前检查用户角色和版本状态 | TC001 异常场景 |
| UpdateStyle | UpdateStyleInteraction | 更新前检查用户角色和 Style 状态 | TC002 异常场景 |
| PublishStyle | PublishStyleInteraction | 发布前检查管理员权限 | TC003 异常场景 |
| OfflineStyle | OfflineStyleInteraction | 下线前检查管理员权限 | TC004 异常场景 |
| ReorderStyles | ReorderStylesInteraction | 排序前检查编辑权限 | TC005 异常场景 |
| BatchUpdatePriority | BatchUpdatePriorityInteraction | 批量更新前检查权限 | TC006 异常场景 |
| CreateVersion | CreateVersionInteraction | 创建前检查管理员权限 | TC007 异常场景 |
| PublishVersion | PublishVersionInteraction | 发布前检查权限和状态 | TC008 异常场景 |
| RollbackVersion | RollbackVersionInteraction | 回滚前检查管理员权限 | TC009 异常场景 |
| GetStylesByStatus | GetStylesByStatusInteraction | 查询时过滤可见数据 | TC010 |
| GetStylesByType | GetStylesByTypeInteraction | 查询时过滤可见数据 | TC011 |
| SearchStyles | SearchStylesInteraction | 搜索时过滤可见数据 | TC012 |
| ValidateSlugUniqueness | ValidateSlugUniquenessInteraction | 验证前检查写入权限 | TC013 |

## 审计日志要求

所有权限相关的操作都需要记录审计日志：
- 用户信息
- 操作时间
- 操作类型
- 操作对象
- 操作结果（成功/失败）
- 失败原因（如权限不足）

这些日志用于安全审计和问题排查。