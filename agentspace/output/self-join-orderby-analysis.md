# Self-Join 场景下的 ORDER BY 问题分析

## 问题描述

用户提出的重要问题：**当查询包含 self-join（同表 JOIN）时，使用原始表.列名的方式无法区分是哪个表实例的列。**

### 示例场景

```sql
-- 查询员工和他们的经理（都来自 users 表）
SELECT 
    u1.name AS employee_name,
    u2.name AS manager_name
FROM users u1
LEFT JOIN users u2 ON u1.manager_id = u2.id
ORDER BY users.name ASC  -- ❌ 歧义！是 u1.name 还是 u2.name？
```

正确的 SQL 应该是：

```sql
ORDER BY u1.name ASC  -- ✅ 明确是员工的名字
-- 或
ORDER BY u2.name ASC  -- ✅ 明确是经理的名字
```

## 当前实现分析

### Modifier 的结构

```typescript
// src/storage/erstorage/Modifier.ts
export class Modifier {
    constructor(public recordName: string, ...) {}
    
    get orderBy() {
        return Object.entries(this.data?.orderBy || {}).map(([k, v]) => {
            return {
                attribute: k,
                recordName: this.recordName,  // ⚠️ 固定的实体名
                order: v
            }
        })
    }
}
```

**问题：** `recordName` 是固定的实体名（如 "User"），不包含表别名信息（如 "u1", "u2"）。

### getTableAliasAndFieldName 的处理

```typescript
// src/storage/erstorage/EntityToTableMap.ts:295
getTableAliasAndFieldName(namePath: string[], attributeName: string): [string, string, string] {
    const stack = this.getTableAndAliasStack(namePath)
    const {alias, record} = stack.at(-1)!
    
    const fieldName = record.attributes[attributeName].field
    return [alias, fieldName!, table]
    //      ^^^^^  这是表别名
}
```

**关键点：** `alias` 返回的是表别名，但问题是：
- 在简单查询中，`alias` = `recordName`（如 "User"）
- 在 JOIN 查询中，`alias` 应该是什么？

### 当前的 SQL 构建

```typescript
// src/storage/erstorage/SQLBuilder.ts:203
orderBy.map(({ attribute, recordName, order }) => {
    const fieldPath = [
        `${this.withPrefix(prefix)}${recordName}`,  // ⚠️ 使用固定的 recordName
        attribute
    ]
    // ...
})
```

## 框架是否支持 Self-Join？

### 查看 EntityQueryHandle 的 API

interaqt 框架的查询 API 是：

```typescript
entityQueryHandle.find(
    'User',           // 实体名
    matchExpression,  // 过滤条件
    modifier,         // { orderBy: { name: 'ASC' } }
    attributeQuery    // ['id', 'name', ...]
)
```

**观察：** API 级别上，只提供了单一的实体名，没有提供别名机制。

### 框架的设计理念

从代码结构看，interaqt 框架的设计是：
1. **主查询实体**：只有一个根实体（如 "User"）
2. **关系导航**：通过 `attributeQuery` 导航到关联实体（如 `['posts', 'author']`）
3. **JOIN 生成**：框架自动生成 LEFT JOIN 来获取关联数据

**关键：** 框架似乎**不支持显式的 self-join**，而是通过关系导航来处理。

## 两种 JOIN 场景

### 场景 1：关系导航（框架支持）

```typescript
// 查询用户和他们的帖子
entityQueryHandle.find(
    'User',
    undefined,
    { orderBy: { name: 'ASC' } },
    [
        'name',
        ['posts', { attributeQuery: ['title'] }]
    ]
)
```

生成的 SQL：

```sql
SELECT
    "User"."name" AS "FIELD_0",
    "Post"."title" AS "FIELD_1"
FROM "User" AS "User"
LEFT JOIN "User_posts_Post" AS "T1" ON ...
LEFT JOIN "Post" AS "Post" ON ...
ORDER BY "User"."name" ASC  -- ✅ 明确是主实体的列
```

**在这种场景下：**
- 每个实体名是唯一的（User, Post）
- ORDER BY 的 `recordName` 是主查询实体 "User"
- 没有歧义

### 场景 2：Self-Join（框架不支持？）

```typescript
// 想要查询员工和他们的经理
entityQueryHandle.find(
    'User',
    undefined,
    { orderBy: { ??? } },  // 如何指定按经理的名字排序？
    [
        'name',  // 员工名字
        ['manager', { attributeQuery: ['name'] }]  // 经理名字
    ]
)
```

**问题：** 
- 在 `orderBy` 中，只能写 `{ name: 'ASC' }`
- 无法指定是 `User.name`（员工）还是 `User.manager.name`（经理）

**但是！** 如果 orderBy 支持路径：

```typescript
{
    orderBy: {
        'manager.name': 'ASC'  // 按经理的名字排序
    }
}
```

那么框架可能已经处理了这种情况！

## 验证：orderBy 是否支持路径？

### 检查 ModifierData 类型

```typescript
export type ModifierData = {
    orderBy?: {
        [k: string]: 'ASC'|'DESC'  // key 可以是任意字符串
    }
}
```

**可能性：** key 可能支持点路径（如 `'manager.name'`）

### 检查实际使用

我需要查看测试用例，看是否有使用路径的例子。

## 正确的解决方案

### 方案 A：orderBy 支持路径（如果框架已支持）

```typescript
{
    orderBy: {
        'manager.name': 'ASC'  // 路径导航
    }
}
```

**处理方式：**

```typescript
buildModifierClause(modifier, prefix) {
    orderBy.map(({ attribute, recordName, order }) => {
        // attribute 可能是 'name' 或 'manager.name'
        
        // 解析路径
        const pathParts = attribute.split('.')
        const namePath = [recordName, ...pathParts.slice(0, -1)]
        const finalAttribute = pathParts[pathParts.length - 1]
        
        // 获取正确的表别名和字段名
        const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
            namePath,      // ['User', 'manager']
            finalAttribute // 'name'
        )
        
        return `"${prefix}${tableAlias}"."${fieldName}" ${order}`
    })
}
```

### 方案 B：如果框架不支持路径

那么在当前框架设计下，**self-join 本身可能不是一个支持的用例**。

框架的限制：
- 只查询一个根实体
- 关联实体通过不同的实体类型来区分
- 不支持同一实体的多个实例同时出现在查询中

## 需要验证的问题

1. **orderBy 的 attribute 是否支持路径？**
   - 检查测试用例
   - 查看 Modifier 如何解析 attribute

2. **框架是否有 self-join 的使用场景？**
   - 查找相关测试
   - 检查文档

3. **getTableAliasAndFieldName 是否支持多级路径？**
   - 从代码看，`namePath` 是数组，支持多级
   - 例如：`['User', 'manager']` → 返回经理表的别名

## 临时结论

在验证之前，我的理解是：

### 对于当前 bug 的修复

**simple case（无关系导航）：**

```typescript
// orderBy: { name: 'ASC' }
const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
    [recordName],  // ['User']
    attribute      // 'name'
)
// 返回: ['User', 'use_nam_1', 'User']
// SQL: ORDER BY "User"."use_nam_1" ASC
```

**complex case（关系导航）：**

```typescript
// orderBy: { 'manager.name': 'ASC' }
const pathParts = attribute.split('.')
const namePath = [recordName, ...pathParts.slice(0, -1)]
const finalAttribute = pathParts.at(-1)

const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
    namePath,       // ['User', 'manager']
    finalAttribute  // 'name'
)
// 返回: ['User_manager', 'use_nam_1', 'User']
// SQL: ORDER BY "User_manager"."use_nam_1" ASC
```

### 关于 FieldAliasMap 的使用

**FieldAliasMap 确实不应该在 ORDER BY 中使用**，因为：
1. 它只包含 SELECT 中的字段
2. ORDER BY 可能引用不在 SELECT 中的字段
3. ORDER BY 需要使用表别名来区分（尤其是在 JOIN 场景）

**正确做法：** 使用 `getTableAliasAndFieldName` 配合路径解析。

## 下一步

1. 检查现有测试，确认 orderBy 是否支持路径
2. 编写测试验证 self-join 场景
3. 根据验证结果调整修复方案

