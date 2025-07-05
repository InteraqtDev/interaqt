# 交互矩阵

## 用户角色定义

1. **admin**：系统管理员，拥有所有权限
2. **operator**：产品运营人员，可以管理样式但不能删除和回滚
3. **viewer**：只读用户（如果需要）

## 交互权限矩阵

| 交互名称 | 说明 | admin | operator | viewer |
|---------|------|-------|----------|--------|
| **Style 管理** |
| CreateStyle | 创建新样式 | ✓ | ✓ | ✗ |
| UpdateStyle | 更新样式信息 | ✓ | ✓ | ✗ |
| DeleteStyle | 软删除样式 | ✓ | ✗ | ✗ |
| PublishStyle | 发布样式 | ✓ | ✓ | ✗ |
| UpdateStyleOrder | 批量更新排序 | ✓ | ✓ | ✗ |
| **版本管理** |
| RollbackVersion | 回滚到指定版本 | ✓ | ✗ | ✗ |
| **查询操作** |
| GetStyles | 查询样式列表 | ✓ | ✓ | ✓ |
| GetStyleDetail | 查询样式详情 | ✓ | ✓ | ✓ |
| GetVersionHistory | 查询版本历史 | ✓ | ✓ | ✓ |

## 交互测试用例覆盖

| 交互名称 | 成功用例 | 失败用例 | 边界用例 |
|---------|---------|---------|---------|
| CreateStyle | TC001 | TC002, TC003 | TC017, TC019 |
| UpdateStyle | TC004 | TC005, TC018 | TC020 |
| DeleteStyle | TC007 | TC008 | - |
| PublishStyle | TC006 | - | - |
| UpdateStyleOrder | TC009 | TC010 | - |
| RollbackVersion | TC011 | TC012 | - |
| GetStyles | TC013, TC014 | - | - |
| GetStyleDetail | TC015 | - | - |
| GetVersionHistory | TC016 | - | - |

## 业务流程覆盖检查

### 1. 样式创建和发布流程
- [x] CreateStyle - 创建草稿样式
- [x] UpdateStyle - 编辑样式内容
- [x] PublishStyle - 发布样式并创建版本

### 2. 样式管理流程
- [x] GetStyles - 查看样式列表
- [x] GetStyleDetail - 查看样式详情
- [x] UpdateStyleOrder - 调整显示顺序
- [x] DeleteStyle - 下线样式

### 3. 版本管理流程
- [x] PublishStyle - 创建新版本
- [x] GetVersionHistory - 查看版本历史
- [x] RollbackVersion - 回滚到历史版本

### 4. 查询和筛选流程
- [x] GetStyles (with filters) - 按状态筛选
- [x] GetStyles (with sorting) - 按优先级排序

## 权限控制验证

### Admin 角色
- [x] 可以执行所有操作
- [x] 特别是 DeleteStyle 和 RollbackVersion

### Operator 角色
- [x] 可以创建、编辑、发布样式
- [x] 可以调整排序
- [x] 不能删除样式（TC008）
- [x] 不能回滚版本（TC012）

### Viewer 角色
- [x] 只能查询，不能修改（TC003）

## 数据完整性检查

1. **唯一性约束**
   - [x] slug 必须唯一（TC002）

2. **状态转换规则**
   - [x] draft → published（TC006）
   - [x] published/draft → offline（TC007）
   - [x] offline 不能更新（TC005）

3. **版本管理规则**
   - [x] 发布时创建版本（TC006）
   - [x] 只有一个活动版本（TC006, TC011）
   - [x] 版本号递增（TC006）

4. **关系完整性**
   - [x] 创建时记录 lastModifiedBy（TC001）
   - [x] 更新时更新 lastModifiedBy（TC004）
   - [x] 版本记录 publishedBy（TC006）

## 未覆盖的场景（如有）

目前的交互设计已经覆盖了需求中的所有主要场景。如果后续发现新的业务需求，可以在此处添加。 