# CMS 交互矩阵

## 用户角色定义

### Admin (管理员)
- 拥有所有权限
- 可以执行所有操作

### Operator (运营人员)
- 可以管理内容但权限受限
- 不能删除和设置 offline 状态

### Viewer (查看者)
- 只读权限
- 仅能查看已发布内容

## 交互矩阵表

| 交互名称 | Admin | Operator | Viewer | 对应测试用例 | 说明 |
|---------|-------|----------|--------|-------------|------|
| **Style 基础操作** |
| CreateStyle | ✅ | ✅ | ❌ | TC001, TC101, TC102 | 创建新的 Style 记录 |
| UpdateStyle | ✅ | ✅* | ❌ | TC002, TC101, TC102 | 更新 Style 记录 (*仅自己创建的) |
| DeleteStyle | ✅ | ❌ | ❌ | TC003, TC101, TC102 | 删除 Style 记录 |
| GetStyleList | ✅ | ✅ | ✅* | TC004, TC103 | 获取 Style 列表 (*仅 published) |
| GetStyleDetail | ✅ | ✅ | ✅* | TC004, TC103 | 获取单个 Style 详情 (*仅 published) |
| **状态管理操作** |
| SetStyleStatus | ✅ | ✅* | ❌ | TC201, TC202 | 修改状态 (*不能设置 offline) |
| PublishStyle | ✅ | ✅ | ❌ | TC201 | 发布 Style (draft→published) |
| DraftStyle | ✅ | ✅ | ❌ | TC201 | 转为草稿 (published→draft) |
| OfflineStyle | ✅ | ❌ | ❌ | TC201 | 下线 Style (→offline) |
| **排序管理操作** |
| UpdateStyleOrder | ✅ | ✅ | ❌ | TC301, TC302 | 更新 Style 排序 |
| BatchUpdateOrder | ✅ | ✅ | ❌ | TC303 | 批量更新排序 |
| GetOrderedStyles | ✅ | ✅ | ✅* | TC301 | 获取排序后的列表 |
| **版本管理操作** |
| CreateVersion | ✅ | ❌ | ❌ | TC401 | 创建版本快照 |
| GetVersionList | ✅ | ✅ | ❌ | TC401 | 获取版本列表 |
| GetVersionDetail | ✅ | ✅ | ❌ | TC401 | 获取版本详情 |
| RollbackVersion | ✅ | ❌ | ❌ | TC402 | 回滚到指定版本 |
| CompareVersions | ✅ | ✅ | ❌ | TC403 | 比较版本差异 |
| **批量操作** |
| BatchUpdateStatus | ✅ | ✅* | ❌ | TC503 | 批量修改状态 (*不能设置 offline) |
| BatchDeleteStyles | ✅ | ❌ | ❌ | TC503 | 批量删除 Style |
| **文件管理操作** |
| UploadThumbnail | ✅ | ✅ | ❌ | - | 上传缩略图 |
| DeleteThumbnail | ✅ | ✅ | ❌ | - | 删除缩略图 |
| **查询和筛选操作** |
| SearchStyles | ✅ | ✅ | ✅* | TC004 | 搜索 Style (*仅 published) |
| FilterStylesByStatus | ✅ | ✅ | ✅* | TC004 | 按状态筛选 (*仅 published) |
| FilterStylesByType | ✅ | ✅ | ✅* | TC004 | 按类型筛选 (*仅 published) |

## 权限规则详细说明

### Style 访问权限
- **Admin**: 可以访问所有状态的 Style 记录
- **Operator**: 可以访问 draft 和 published 状态的记录，可以查看但不能修改 offline 记录
- **Viewer**: 只能访问 published 状态的记录

### Style 修改权限
- **Admin**: 可以修改任何 Style 记录的任何字段
- **Operator**: 
  - 只能修改自己创建的 Style 记录
  - 不能修改其他用户创建的记录
  - 不能删除任何记录
- **Viewer**: 无修改权限

### 状态变更权限
- **Admin**: 可以将 Style 设置为任何状态
- **Operator**: 
  - 可以设置 draft → published
  - 可以设置 published → draft
  - 不能设置任何状态 → offline
  - 不能从 offline 状态恢复记录
- **Viewer**: 无状态修改权限

### 版本管理权限
- **Admin**: 拥有所有版本管理权限
- **Operator**: 可以查看版本历史和比较，但不能创建版本或回滚
- **Viewer**: 无版本管理权限

## 权限检查实现

### 实体级权限 (Entity Level)
```typescript
// Style 实体的查看权限
const StyleViewPermission = Attributive.create({
  name: 'StyleViewPermission',
  content: async function(style, { user }) {
    if (user.role === 'Admin') return true;
    if (user.role === 'Operator') {
      return ['draft', 'published'].includes(style.status);
    }
    if (user.role === 'Viewer') {
      return style.status === 'published';
    }
    return false;
  }
});

// Style 实体的修改权限
const StyleEditPermission = Attributive.create({
  name: 'StyleEditPermission', 
  content: async function(style, { user }) {
    if (user.role === 'Admin') return true;
    if (user.role === 'Operator') {
      return style.createdBy === user.id;
    }
    return false;
  }
});
```

### 交互级权限 (Interaction Level)
```typescript
// 删除操作权限
const DeleteStylePermission = Attributive.create({
  name: 'DeleteStylePermission',
  content: async function(payload, { user }) {
    return user.role === 'Admin';
  }
});

// 版本管理权限
const VersionManagementPermission = Attributive.create({
  name: 'VersionManagementPermission',
  content: async function(payload, { user }) {
    return user.role === 'Admin';
  }
});
```

### 字段级权限 (Field Level)
```typescript
// 状态字段修改权限
const StatusUpdatePermission = Attributive.create({
  name: 'StatusUpdatePermission',
  content: async function(payload, { user }) {
    if (user.role === 'Admin') return true;
    if (user.role === 'Operator') {
      // 运营人员不能设置 offline 状态
      return payload.status !== 'offline';
    }
    return false;
  }
});
```

## 交互用例映射

### 每个交互对应的具体用例

| 交互 | 成功用例 | 失败用例 | 权限用例 |
|------|---------|---------|---------|
| CreateStyle | TC001 | TC801, TC802 | TC101, TC102, TC103 |
| UpdateStyle | TC002 | TC802 | TC101, TC102, TC103 |
| DeleteStyle | TC003 | - | TC101, TC102, TC103 |
| SetStyleStatus | TC201, TC202 | - | TC101, TC102, TC103 |
| UpdateStyleOrder | TC301, TC302 | - | TC101, TC102, TC103 |
| CreateVersion | TC401 | - | TC101, TC102, TC103 |
| RollbackVersion | TC402 | - | TC101, TC102, TC103 |

## 完整性检查清单

- [ ] 每个用户角色的所有操作都有对应的 Interaction
- [ ] 每个 Interaction 都有明确的权限控制
- [ ] 每个 Interaction 都有对应的测试用例
- [ ] 权限规则覆盖所有业务场景
- [ ] 异常情况和错误处理完整
- [ ] 性能和安全要求得到考虑