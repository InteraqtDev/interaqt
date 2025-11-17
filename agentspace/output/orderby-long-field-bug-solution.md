# OrderBy Long Field Name Bug - 解决方案

## 问题描述

当使用 `orderBy` 对超长字段名（>63字符）进行排序时，如果该字段不在 `attributeQuery` 中，框架会生成错误的 SQL，导致数据库报错。

### Bug 复现

```typescript
// 创建实体，包含超长字段名
const UserEntity = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({
            name: 'thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters',
            type: 'number'
        })
    ]
})

// 查询：orderBy 使用长字段，但不在 attributeQuery 中
const users = await entityQueryHandle.find(
    'User',
    undefined,
    {
        orderBy: {
            thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters: 'ASC'
        }
    },
    ['name']  // 注意：长字段不在这里
)

// 错误: no such column: "User.thisIsAVeryLongPropertyNameThat..."
```

### 错误的 SQL

```sql
SELECT
"User"."use_id_3" AS "FIELD_0",
"User"."use_nam_1" AS "FIELD_1"
FROM
"User" AS "User"
WHERE
"User"."use_id_3" IS NOT NULL
ORDER BY "User.thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters" ASC
--       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
--       错误：使用了原始长字段名，但数据库中实际存储的是缩短后的名字 use_thi_2
```

## 根本原因分析

### 1. 字段名缩短机制

在 `DBSetup.assignTableAndField()` 中，框架会为所有超过限制的字段名生成缩短的名字：

```typescript
// src/storage/erstorage/Setup.ts:847
valueAttributeData.field = this.generateShortFieldName(`${recordName}_${attributeName}`)
```

例如：`thisIsAVeryLongPropertyNameThatExceedsThePostgreSQLColumnNameLimitOf63Characters` → `use_thi_2`

### 2. FieldAliasMap 的作用域限制

在 `SQLBuilder.buildSelectClause()` 中创建 `FieldAliasMap`，只为 `attributeQuery` 中的字段注册别名：

```typescript
// src/storage/erstorage/SQLBuilder.ts:107-128
buildSelectClause(queryFields, prefix): [string, FieldAliasMap] {
    const fieldAliasMap = new FieldAliasMap()
    
    // 只为 SELECT 子句中的字段注册别名
    const aliasClauses = queryFields.map(({ tableAliasAndField, attribute, nameContext }) => {
        const path = [...]
        const aliasName = fieldAliasMap.getAlias(path, true)  // 注册到 map 中
        return `"${tableAliasAndField[0]}"."${tableAliasAndField[1]}" AS "${aliasName}"`
    })
    
    return [aliasClauses.join(',\n'), fieldAliasMap]
}
```

### 3. buildModifierClause 的回退逻辑失败

```typescript
// src/storage/erstorage/SQLBuilder.ts:194-221
buildModifierClause(modifier, prefix, fieldAliasMap): string {
    if (orderBy.length) {
        clauses.push(`ORDER BY ${orderBy.map(({ attribute, recordName, order }) => {
            const fieldPath = [
                `${this.withPrefix(prefix)}${recordName}`,
                attribute
            ]
            // 问题：当字段不在 attributeQuery 中时，getAlias 返回 undefined
            const field = fieldAliasMap.getAlias(fieldPath) || fieldPath.join('.')
            //                                                  ^^^^^^^^^^^^^^^^^^
            //                                      回退使用原始长字段名（错误！）
            return `"${field}" ${order}`
        }).join(',')}`)
    }
    // ...
}
```

**问题链条：**
1. `fieldAliasMap` 只包含 `attributeQuery` 中的字段
2. orderBy 字段不在 `attributeQuery` 中
3. `fieldAliasMap.getAlias()` 返回 `undefined`
4. 回退使用 `fieldPath.join('.')` = `"User.thisIsAVeryLong..."`（原始名）
5. 但数据库表中实际字段名是 `"use_thi_2"`（缩短后）
6. SQL 执行失败：`no such column`

## 解决方案

### 方案 A：直接从 EntityToTableMap 获取字段名（推荐）

**核心思想：** orderBy 不使用 FieldAliasMap 的别名系统，直接使用数据库实际字段名。

#### 修改点 1：`SQLBuilder.buildModifierClause()`

```typescript
// src/storage/erstorage/SQLBuilder.ts
buildModifierClause(
    modifier: Modifier,
    prefix: string = '',
    fieldAliasMap: FieldAliasMap  // 保留但不使用，保持接口兼容
): string {
    const { limit, offset, orderBy } = modifier
    const clauses: string[] = []
    
    if (orderBy.length) {
        clauses.push(`ORDER BY ${orderBy.map(({ attribute, recordName, order }) => {
            // 新方法：直接从 EntityToTableMap 获取实际字段名
            const [tableAlias, fieldName, tableName] = this.map.getTableAliasAndFieldName(
                [recordName],
                attribute
            )
            
            // 使用实际的表别名和字段名
            const fullFieldRef = `${this.withPrefix(prefix)}${tableAlias}`
            return `"${fullFieldRef}"."${fieldName}" ${order}`
        }).join(',')}`)
    }

    if (limit) {
        clauses.push(`LIMIT ${limit}`)
    }
    if (offset) {
        clauses.push(`OFFSET ${offset}`)
    }

    return clauses.join('\n')
}
```

#### 优点
- ✅ 直接、准确、简单
- ✅ 不依赖 FieldAliasMap 的注册逻辑
- ✅ 自动处理所有字段名（长/短/合并表/关系）
- ✅ 保持现有接口兼容性
- ✅ 性能影响可忽略（只是简单的 Map 查询）

#### 缺点
- ⚠️ orderBy 使用原始字段名而不是 SELECT 别名
  - 但这在 SQL 中是完全合法且常见的做法
  - 大多数数据库都支持在 ORDER BY 中引用原始列名

### 方案 B：预先注册 orderBy 字段到 FieldAliasMap

**核心思想：** 在构建查询时，将 orderBy 中的字段也注册到 FieldAliasMap。

#### 修改点 1：`SQLBuilder.buildSelectClause()`

```typescript
buildSelectClause(
    queryFields: ReturnType<AttributeQuery["getValueAndXToOneRecordFields"]>,
    prefix = '',
    orderByFields?: Array<{ attribute: string, recordName: string }>  // 新增参数
): [string, FieldAliasMap] {
    const fieldAliasMap = new FieldAliasMap()

    if (!queryFields.length) return ['1', fieldAliasMap]

    // 原有逻辑：注册 SELECT 字段
    const aliasClauses = queryFields.map(({ tableAliasAndField, attribute, nameContext }) => {
        const path = [...]
        const aliasName = fieldAliasMap.getAlias(path, true)
        return `"${tableAliasAndField[0]}"."${tableAliasAndField[1]}" AS "${aliasName}"`
    })
    
    // 新增：预注册 orderBy 字段（不出现在 SELECT 中）
    if (orderByFields) {
        orderByFields.forEach(({ attribute, recordName }) => {
            const path = [`${this.withPrefix(prefix)}${recordName}`, attribute]
            fieldAliasMap.getAlias(path, true)  // 强制注册
        })
    }

    return [aliasClauses.join(',\n'), fieldAliasMap]
}
```

#### 修改点 2：`SQLBuilder.buildXToOneFindQuery()`

```typescript
buildXToOneFindQuery(recordQuery, prefix, parentP): [string, any[], FieldAliasMap] {
    // ... 现有代码 ...
    
    const [selectClause, fieldAliasMap] = this.buildSelectClause(
        recordQuery.attributeQuery.getValueAndXToOneRecordFields(),
        prefix,
        recordQuery.modifier.orderBy  // 传入 orderBy 字段
    )
    
    // ... 其余代码不变 ...
}
```

#### 优点
- ✅ orderBy 使用统一的别名系统
- ✅ 保持架构一致性

#### 缺点
- ❌ 需要修改多个方法签名
- ❌ 逻辑更复杂（需要预判哪些字段会用到）
- ❌ 可能需要在 SELECT 中包含 orderBy 字段（某些 SQL 方言要求）

### 方案 C：扩展 FieldAliasMap 支持动态查询

**核心思想：** 让 FieldAliasMap 能够在运行时动态查询 EntityToTableMap。

#### 实现方式

```typescript
// src/storage/erstorage/util/FieldAliasMap.ts
export class FieldAliasMap {
    aliasToPath: Map<string, string[]> = new Map()
    pathStrToAlias: Map<string, string> = new Map()
    aliasPlaceholder: number = 0
    
    // 新增：保存对 EntityToTableMap 的引用
    constructor(private map?: EntityToTableMap) {}
    
    getAlias(path: string[], forceCreate = false): string | undefined {
        const pathStr = path.join('.')
        const alias = this.pathStrToAlias.get(pathStr)
        if (alias || !forceCreate) return alias

        const newAlias = `FIELD_${this.aliasPlaceholder++}`
        this.pathStrToAlias.set(pathStr, newAlias)
        this.aliasToPath.set(newAlias, path)
        return newAlias
    }
    
    // 新增：获取实际字段名
    getRealFieldName(path: string[]): string | undefined {
        if (path.length < 2) return undefined
        
        const recordName = path[0]
        const attribute = path[path.length - 1]
        
        if (!this.map) return undefined
        
        try {
            const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
                [recordName],
                attribute
            )
            return fieldName
        } catch {
            return undefined
        }
    }
}
```

#### 优点
- ✅ 统一的接口
- ✅ 向后兼容

#### 缺点
- ❌ 混合了两种职责（别名管理 + 字段查询）
- ❌ 增加了耦合度

## 关键问题：Self-Join 和表别名

**用户提出的重要问题：** 如果使用原始表.列名，当有 self-join（同表 JOIN）时，ORDER BY 无法区分是哪个表实例的列。

### 示例场景

```sql
-- 查询员工和他们的经理（都来自 User 表）
SELECT 
    u1.name AS employee_name,
    u2.name AS manager_name
FROM User u1
LEFT JOIN User u2 ON u1.manager_id = u2.id
ORDER BY User.name ASC  -- ❌ 歧义！是 u1.name 还是 u2.name？
```

### 框架的实际情况

经过测试代码分析，发现：

1. **框架支持 self-referencing 关系**（如 `User.leader -> User`）
2. **框架的查询 API 只针对单一根实体**
3. **框架通过关系导航来访问关联实体**
4. **所有测试中 orderBy 只使用简单字段名**，没有路径导航的例子

### orderBy 的实际用途

在 interaqt 框架中：
- ✅ `orderBy: { name: 'ASC' }` - 对主查询实体的字段排序
- ❌ `orderBy: { 'manager.name': 'ASC' }` - 不支持（未在测试中出现）

**关键点：** `Modifier.recordName` 始终是主查询实体名，`orderBy` 只对主实体的字段排序。

### 方案 A 在框架中是安全的

```typescript
buildModifierClause(modifier, prefix) {
    orderBy.map(({ attribute, recordName, order }) => {
        // recordName 是主查询实体（如 "User"）
        // attribute 是该实体的字段（如 "name"）
        
        const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
            [recordName],  // 总是单一实体，没有 self-join
            attribute
        )
        
        return `"${prefix}${tableAlias}"."${fieldName}" ${order}`
    })
}
```

**为什么安全：**
1. 框架设计上只查询一个根实体
2. `recordName` = `tableAlias`（在主查询中）
3. 不会产生 self-join 的歧义
4. JOIN 的其他表不会在 ORDER BY 中引用

## 推荐方案

**推荐采用方案 A**，理由：

1. **符合框架设计**：只对主查询实体排序，没有 self-join 场景
2. **简单直接**：一处修改即可解决问题
3. **性能优秀**：`getTableAliasAndFieldName` 是简单的 Map 查询，性能开销可忽略
4. **正确性保证**：直接使用 EntityToTableMap 是获取真实字段名的唯一可靠来源
5. **SQL 标准兼容**：在 ORDER BY 中使用原始列名是标准做法，所有主流数据库都支持
6. **可维护性好**：逻辑清晰，未来维护容易理解
7. **无歧义**：在当前框架设计下，主查询实体的表别名就是实体名本身

### SQL 语法验证

方案 A 生成的 SQL 示例：

```sql
SELECT
"User"."use_id_3" AS "FIELD_0",
"User"."use_nam_1" AS "FIELD_1"
FROM "User" AS "User"
WHERE "User"."use_id_3" IS NOT NULL
ORDER BY "User"."use_thi_2" ASC
--       ^^^^^^^^^^^^^^^^^^^
--       正确：使用实际的数据库字段名
```

这是完全合法的 SQL，所有数据库都支持：
- ✅ SQLite
- ✅ PostgreSQL / PGLite
- ✅ MySQL
- ✅ SQL Server

## 测试验证

测试用例已添加到 `tests/storage/longColumnNames.spec.ts`：

1. ✅ `should handle orderBy with very long property names`
   - 验证当字段在 attributeQuery 中时，orderBy 正常工作

2. ❌ `should handle orderBy with long property name not in attributeQuery`
   - 验证 bug：当字段不在 attributeQuery 中时，orderBy 失败
   - 修复后应该通过

修复后运行：
```bash
npm test -- tests/storage/longColumnNames.spec.ts
```

所有测试应该通过。

## 实施步骤

1. 修改 `src/storage/erstorage/SQLBuilder.ts` 中的 `buildModifierClause()` 方法
2. 运行测试验证修复
3. 可选：添加更多边缘情况测试（关系字段、合并表等）

## 潜在风险

### 风险 1：关系字段的 orderBy

如果 orderBy 使用关系字段（如 `user.profile.age`），需要确保 `getTableAliasAndFieldName` 能正确处理多级路径。

**验证：** 查看 `getTableAliasAndFieldName` 的实现，它已经支持通过 `getTableAndAliasStack` 处理复杂路径。

### 风险 2：Prefix 处理

在子查询中可能有 prefix，需要确保 `withPrefix` 正确应用。

**解决：** 当前实现已经正确处理 prefix：
```typescript
const fullFieldRef = `${this.withPrefix(prefix)}${tableAlias}`
```

## 总结

- **Bug 原因**：FieldAliasMap 只包含 SELECT 字段，orderBy 使用不在其中的长字段名时回退失败
- **推荐方案**：方案 A - 直接从 EntityToTableMap 获取真实字段名
- **预期效果**：完全修复 bug，所有测试通过
- **实施难度**：低（单文件单方法修改）
- **风险等级**：低（SQL 标准语法，完全兼容）

