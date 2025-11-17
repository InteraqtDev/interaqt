# OrderBy 支持关联路径的分析

## 假设场景：支持关联实体字段排序

如果框架允许：

```typescript
entityQueryHandle.find(
    'User',
    undefined,
    {
        orderBy: {
            'leader.age': 'ASC'  // 按关联实体的字段排序
        }
    },
    ['name', 'age']
)
```

## 当前实现会出现的问题

### 问题 1：Modifier 无法处理路径

```typescript
// src/storage/erstorage/Modifier.ts:23
get orderBy() {
    return Object.entries(this.data?.orderBy || {}).map(([k, v]) => {
        return {
            attribute: k,           // 'leader.age' (路径字符串)
            recordName: this.recordName,  // 'User' (主实体)
            order: v
        }
    })
}
```

**问题：** `attribute` 包含路径但没有解析。

### 问题 2：buildModifierClause 无法正确处理

```typescript
// 当前的错误处理
orderBy.map(({ attribute, recordName, order }) => {
    const fieldPath = [
        `${this.withPrefix(prefix)}${recordName}`,  // 'User'
        attribute                                     // 'leader.age'
    ]
    // fieldPath = ['User', 'leader.age'] ❌ 错误！
    
    const field = fieldAliasMap.getAlias(fieldPath)
    // 找不到，因为路径错误
})
```

**问题：** 没有解析路径，直接把 `'leader.age'` 作为单一字段名。

### 问题 3：Self-Join 的歧义

如果有：

```typescript
{
    orderBy: {
        'leader.name': 'ASC',        // User 的 leader 的 name
        'leader.leader.name': 'DESC' // leader 的 leader 的 name
    }
}
```

生成的 SQL 需要区分：

```sql
SELECT ...
FROM "User" AS "User"
LEFT JOIN "User" AS "User_leader" ON ...
LEFT JOIN "User" AS "User_leader_leader" ON ...
ORDER BY 
    "User_leader"."use_nam_1" ASC,      -- leader.name
    "User_leader_leader"."use_nam_1" DESC  -- leader.leader.name
```

**关键：** 必须使用正确的表别名来区分不同层级的同一实体。

## 正确的解决方案（如果要支持路径）

### 方案：解析路径 + getTableAliasAndFieldName

```typescript
buildModifierClause(modifier: Modifier, prefix: string = ''): string {
    const { limit, offset, orderBy } = modifier
    const clauses: string[] = []
    
    if (orderBy.length) {
        clauses.push(`ORDER BY ${orderBy.map(({ attribute, recordName, order }) => {
            // 解析路径
            const pathParts = attribute.split('.')
            
            let namePath: string[]
            let finalAttribute: string
            
            if (pathParts.length === 1) {
                // 简单字段：{ age: 'ASC' }
                namePath = [recordName]
                finalAttribute = attribute
            } else {
                // 路径字段：{ 'leader.age': 'ASC' }
                namePath = [recordName, ...pathParts.slice(0, -1)]
                finalAttribute = pathParts[pathParts.length - 1]
            }
            
            // 获取正确的表别名和字段名
            const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
                namePath,       // ['User', 'leader'] 或 ['User']
                finalAttribute  // 'age'
            )
            
            const fullFieldRef = `${this.withPrefix(prefix)}${tableAlias}`
            return `"${fullFieldRef}"."${fieldName}" ${order}`
        }).join(',')}`)
    }
    
    if (limit) clauses.push(`LIMIT ${limit}`)
    if (offset) clauses.push(`OFFSET ${offset}`)
    
    return clauses.join('\n')
}
```

### 工作原理

#### 场景 1：简单字段

```typescript
orderBy: { name: 'ASC' }

// 解析
namePath = ['User']
finalAttribute = 'name'

// getTableAliasAndFieldName(['User'], 'name')
// 返回: ['User', 'use_nam_1', 'User']

// SQL: ORDER BY "User"."use_nam_1" ASC
```

#### 场景 2：一级关联

```typescript
orderBy: { 'leader.age': 'ASC' }

// 解析
namePath = ['User', 'leader']
finalAttribute = 'age'

// getTableAliasAndFieldName(['User', 'leader'], 'age')
// 返回: ['User_leader', 'use_age_1', 'User']

// SQL: ORDER BY "User_leader"."use_age_1" ASC
```

#### 场景 3：多级关联（Self-Join）

```typescript
orderBy: {
    'leader.name': 'ASC',
    'leader.leader.name': 'DESC'
}

// 第一个
namePath = ['User', 'leader']
finalAttribute = 'name'
// 返回: ['User_leader', 'use_nam_1', 'User']
// SQL: "User_leader"."use_nam_1" ASC

// 第二个
namePath = ['User', 'leader', 'leader']
finalAttribute = 'name'
// 返回: ['User_leader_leader', 'use_nam_1', 'User']
// SQL: "User_leader_leader"."use_nam_1" DESC
```

**完美解决 Self-Join 歧义！** 因为每一级都有独特的表别名。

## FieldAliasMap 为什么不适用

### 问题 1：作用域不足

```typescript
// FieldAliasMap 只包含 SELECT 中的字段
buildSelectClause() {
    // 只为 attributeQuery 中的字段注册
    queryFields.map(({ attribute, nameContext }) => {
        fieldAliasMap.getAlias([...nameContext, attribute], true)
    })
}

// 但 orderBy 可能引用不在 SELECT 中的字段
{
    orderBy: { 'leader.age': 'ASC' }  // leader.age 不在 SELECT 中
}
```

### 问题 2：别名不是数据库列名

```typescript
// FieldAliasMap 生成 SELECT 结果别名
SELECT "User_leader"."use_age_1" AS "FIELD_5"

// 如果 orderBy 使用别名
ORDER BY "FIELD_5" ASC  // ✅ 可以工作

// 但如果字段不在 SELECT 中
ORDER BY ???  // ❌ FieldAliasMap 没有这个字段
```

### 问题 3：路径解析不匹配

```typescript
// FieldAliasMap 的路径格式
const path = [
    `${prefix}${nameContext[0]}`,  // 'User'
    ...nameContext.slice(1),        // ['leader']
    attribute                       // 'age'
]
// 结果: ['User', 'leader', 'age']

// orderBy 的路径格式
const attribute = 'leader.age'  // 字符串，需要解析
```

## 关键对比：两种方案

| 特性 | FieldAliasMap 方案 | getTableAliasAndFieldName 方案 |
|------|--------------------|---------------------------------|
| **支持不在 SELECT 中的字段** | ❌ | ✅ |
| **处理路径** | ❌ 需要预解析 | ✅ 原生支持 |
| **Self-Join 消歧** | ❌ | ✅ |
| **依赖 SELECT** | ✅ 强依赖 | ❌ 独立 |
| **获取真实列名** | ❌ 间接 | ✅ 直接 |
| **实现复杂度** | 高 | 低 |

## 结论

**如果框架要支持 `'leader.age'` 这样的路径排序：**

1. **必须使用 `getTableAliasAndFieldName`**
   - ✅ 原生支持多级路径
   - ✅ 自动处理表别名
   - ✅ 完美解决 Self-Join 歧义

2. **FieldAliasMap 根本不适用**
   - ❌ 作用域限制（只包含 SELECT 字段）
   - ❌ 需要复杂的预处理
   - ❌ 无法处理动态路径

3. **实现很简单**
   - 解析 `attribute.split('.')`
   - 构建 `namePath`
   - 调用 `getTableAliasAndFieldName(namePath, finalAttribute)`
   - 使用返回的 `tableAlias` 和 `fieldName`

## 对当前 Bug 修复的影响

即使当前框架不支持路径，**使用 `getTableAliasAndFieldName` 仍然是最好的选择**：

1. **当前可用**：简单字段排序正常工作
2. **面向未来**：如果将来支持路径，只需添加路径解析逻辑
3. **正确性**：直接从 EntityToTableMap 获取真实信息
4. **一致性**：与 WHERE、JOIN 使用相同的机制

**核心原则：** ORDER BY 应该像 WHERE/JOIN 一样，直接引用数据库结构，而不是依赖 SELECT 的输出。

