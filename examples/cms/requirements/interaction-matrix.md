# Style 管理系统交互矩阵

## 用户角色定义

### Admin（管理员）
- 系统最高权限
- 可以管理用户、Style、版本的所有操作
- 可以发布和回滚版本

### Editor（编辑者）
- 可以创建和编辑 Style
- 只能编辑自己创建的 Style
- 可以创建版本草稿，但无法发布

### Viewer（查看者）
- 只读权限
- 可以查看已发布的内容
- 可以导出数据

## 交互矩阵

### Style 管理交互

| 交互名称 | Admin | Editor | Viewer | 对应测试用例 | 权限验证 |
|---------|-------|--------|--------|-------------|----------|
| CreateStyle | ✓ | ✓ | ✗ | TC001 | 需要登录 + (Admin \|\| Editor) |
| UpdateStyle | ✓ | ✓* | ✗ | TC002 | 需要登录 + (Admin \|\| (Editor && 创建者)) |
| DeleteStyle | ✓ | ✓* | ✗ | TC003 | 需要登录 + (Admin \|\| (Editor && 创建者)) |
| GetStyleList | ✓ | ✓ | ✓ | TC006 | 需要登录 |
| GetStyleDetail | ✓ | ✓ | ✓ | TC006 | 需要登录 |
| UpdateStyleStatus | ✓ | ✓* | ✗ | TC005 | 需要登录 + (Admin \|\| (Editor && 创建者)) |
| UpdateStylePriority | ✓ | ✓ | ✗ | TC004 | 需要登录 + (Admin \|\| Editor) |
| BatchUpdateStyles | ✓ | ✓ | ✗ | TC017 | 需要登录 + (Admin \|\| Editor) |

*注：Editor 只能操作自己创建的 Style

### 版本管理交互

| 交互名称 | Admin | Editor | Viewer | 对应测试用例 | 权限验证 |
|---------|-------|--------|--------|-------------|----------|
| CreateVersion | ✓ | ✓ | ✗ | TC007 | 需要登录 + (Admin \|\| Editor) |
| UpdateVersion | ✓ | ✓* | ✗ | TC010 | 需要登录 + (Admin \|\| (Editor && 创建者 && 状态为draft)) |
| DeleteVersion | ✓ | ✓* | ✗ | - | 需要登录 + (Admin \|\| (Editor && 创建者 && 状态为draft)) |
| PublishVersion | ✓ | ✗ | ✗ | TC008 | 需要登录 + Admin |
| ArchiveVersion | ✓ | ✗ | ✗ | - | 需要登录 + Admin |
| RollbackVersion | ✓ | ✗ | ✗ | TC009 | 需要登录 + Admin |
| GetVersionList | ✓ | ✓ | ✓ | - | 需要登录 |
| GetVersionDetail | ✓ | ✓ | ✓ | - | 需要登录 |
| CompareVersions | ✓ | ✓ | ✓ | - | 需要登录 |

*注：Editor 只能操作自己创建的版本，且只能在 draft 状态下操作

### 用户管理交互

| 交互名称 | Admin | Editor | Viewer | 对应测试用例 | 权限验证 |
|---------|-------|--------|--------|-------------|----------|
| CreateUser | ✓ | ✗ | ✗ | - | 需要登录 + Admin |
| UpdateUser | ✓ | ✗ | ✗ | - | 需要登录 + Admin |
| DeleteUser | ✓ | ✗ | ✗ | - | 需要登录 + Admin |
| GetUserList | ✓ | ✗ | ✗ | - | 需要登录 + Admin |
| GetCurrentUser | ✓ | ✓ | ✓ | - | 需要登录 |
| UpdateProfile | ✓ | ✓ | ✓ | - | 需要登录 + 本人 |

### 查询和搜索交互

| 交互名称 | Admin | Editor | Viewer | 对应测试用例 | 权限验证 |
|---------|-------|--------|--------|-------------|----------|
| SearchStyles | ✓ | ✓ | ✓ | TC018 | 需要登录 |
| FilterStyles | ✓ | ✓ | ✓ | TC018 | 需要登录 |
| GetStylesByType | ✓ | ✓ | ✓ | TC006 | 需要登录 |
| GetStylesByStatus | ✓ | ✓ | ✓ | TC006 | 需要登录 |
| GetPublishedStyles | ✓ | ✓ | ✓ | - | 无需权限 |

## 权限验证详细规则

### 属性级权限控制

```typescript
// Style 实体权限规则
Style.canCreate = (user) => user.role === 'Admin' || user.role === 'Editor'
Style.canRead = (user, style) => true // 所有登录用户都可读
Style.canUpdate = (user, style) => 
  user.role === 'Admin' || 
  (user.role === 'Editor' && style.createdBy === user.id)
Style.canDelete = (user, style) => 
  user.role === 'Admin' || 
  (user.role === 'Editor' && style.createdBy === user.id && !style.isReferencedByPublishedVersion)

// Version 实体权限规则  
Version.canCreate = (user) => user.role === 'Admin' || user.role === 'Editor'
Version.canUpdate = (user, version) => 
  user.role === 'Admin' || 
  (user.role === 'Editor' && version.createdBy === user.id && version.status === 'draft')
Version.canPublish = (user) => user.role === 'Admin'
Version.canRollback = (user) => user.role === 'Admin'
```

### 业务规则权限控制

```typescript
// 业务规则级别的权限验证
BusinessRules = {
  // 只有 Admin 可以同时发布多个版本
  publishMultipleVersions: (user) => user.role === 'Admin',
  
  // Editor 不能删除被版本引用的 Style
  deleteReferencedStyle: (user, style) => 
    user.role === 'Admin' || !style.isReferencedByAnyVersion,
    
  // 只有 Admin 可以修改已发布版本
  modifyPublishedVersion: (user) => user.role === 'Admin',
  
  // Editor 只能在自己创建的版本中操作 Style
  manageStyleInVersion: (user, version) =>
    user.role === 'Admin' || 
    (user.role === 'Editor' && version.createdBy === user.id)
}
```

## 交互实现映射

### 核心 CRUD 交互

1. **CreateStyle** → TC001: 创建 Style
   - 验证输入数据格式
   - 检查 slug 唯一性
   - 设置默认状态和时间戳
   - 关联创建者

2. **UpdateStyle** → TC002: 编辑 Style  
   - 权限验证（创建者或 Admin）
   - 部分字段更新
   - 更新时间戳

3. **DeleteStyle** → TC003: 删除 Style
   - 检查引用关系
   - 权限验证
   - 级联删除相关数据

4. **UpdateStylePriority** → TC004: 调整排序
   - 批量更新 priority 值
   - 保证排序的一致性

5. **UpdateStyleStatus** → TC005: 状态管理
   - 验证状态转换规则
   - 检查业务约束

### 版本管理交互

6. **CreateVersion** → TC007: 创建版本
   - 验证包含的 Style 列表
   - 生成版本号
   - 创建关联关系

7. **PublishVersion** → TC008: 发布版本
   - 归档当前发布版本
   - 更新版本状态
   - 记录发布时间

8. **RollbackVersion** → TC009: 版本回滚
   - 验证目标版本有效性
   - 原子性操作保证一致性
   - 记录操作日志

### 查询交互

9. **GetStyleList** → TC006: 查询列表
   - 支持多维度过滤
   - 分页和排序
   - 权限过滤（Viewer 只看已发布）

10. **SearchStyles** → TC018: 搜索过滤
    - 全文搜索支持
    - 组合条件过滤
    - 性能优化

## 权限测试用例映射

- **TC011**: Admin 权限全覆盖测试
- **TC012**: Editor 权限边界测试  
- **TC013**: Viewer 权限限制测试
- **TC014**: 并发权限冲突测试
- **TC015**: 数据完整性权限保护测试

## 错误处理和边界情况

### 权限错误
- `PERMISSION_DENIED`: 用户无权限执行操作
- `RESOURCE_NOT_FOUND`: 资源不存在或无权访问
- `OWNERSHIP_REQUIRED`: 需要资源所有权

### 业务规则错误
- `SLUG_DUPLICATE`: slug 重复
- `VERSION_CONFLICT`: 版本冲突
- `REFERENCE_CONSTRAINT`: 引用约束违反
- `STATUS_TRANSITION_INVALID`: 无效状态转换

### 并发错误
- `OPTIMISTIC_LOCK_FAILED`: 乐观锁冲突
- `RESOURCE_LOCKED`: 资源被锁定
- `TRANSACTION_CONFLICT`: 事务冲突