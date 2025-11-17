# SQL 标准：ORDER BY 中使用别名还是原始列名？

## SQL 标准规定

### 核心规则

根据 SQL 标准（SQL-92 及后续版本），**ORDER BY 子句中可以使用以下三种引用方式**：

1. **列位置编号**：`ORDER BY 1, 2`
2. **SELECT 列表中定义的别名**：`ORDER BY user_name`
3. **原始表列名**：`ORDER BY users.name`

### 执行顺序

SQL 查询的逻辑执行顺序是：

```
FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

**关键点：** ORDER BY 在 SELECT 之后执行，因此：
- ✅ ORDER BY 可以看到 SELECT 中定义的别名
- ✅ ORDER BY 也可以看到原始表中的列（只要在 FROM 中）

## 具体场景分析

### 场景 1：字段在 SELECT 中且有别名

```sql
SELECT 
    name AS user_name,
    age AS user_age
FROM users
ORDER BY user_name ASC;  -- ✅ 使用别名
```

或

```sql
SELECT 
    name AS user_name,
    age AS user_age
FROM users
ORDER BY name ASC;  -- ✅ 使用原始列名（虽然有别名）
```

**结论：** 两种都合法，但**使用别名更清晰**。

---

### 场景 2：字段不在 SELECT 中

```sql
SELECT 
    name AS user_name
FROM users
ORDER BY age ASC;  -- ✅ 可以引用不在 SELECT 中的列
```

**重要限制：** 如果使用 `DISTINCT`、`GROUP BY` 或 `UNION`，则 ORDER BY 只能引用 SELECT 列表中的列：

```sql
SELECT DISTINCT name AS user_name
FROM users
ORDER BY age ASC;  -- ❌ 错误！DISTINCT 时不能引用 SELECT 外的列
```

---

### 场景 3：SELECT 中使用表达式

```sql
SELECT 
    UPPER(name) AS upper_name,
    age * 2 AS double_age
FROM users
ORDER BY upper_name ASC;  -- ✅ 必须使用别名
```

或

```sql
SELECT 
    UPPER(name) AS upper_name,
    age * 2 AS double_age
FROM users
ORDER BY UPPER(name) ASC;  -- ✅ 重复表达式（但不推荐，冗余）
```

但不能：

```sql
SELECT 
    UPPER(name) AS upper_name
FROM users
ORDER BY name ASC;  -- ❌ 错误！SELECT 中没有 name，只有 UPPER(name)
```

---

## 数据库实现差异

虽然 SQL 标准规定了这些规则，但不同数据库实现有细微差别：

### PostgreSQL

- 优先解析为 SELECT 别名
- 如果别名不存在，再查找表列名
- 如果两者同名，别名优先

```sql
-- PostgreSQL 示例
SELECT age AS name FROM users ORDER BY name;
-- 会使用 age 列（别名优先）
```

### MySQL

- 类似 PostgreSQL
- 别名优先于列名

### SQLite

- 非常宽容，两种都支持
- 没有严格的优先级规则

### SQL Server

- 遵循标准
- 别名和列名都支持

---

## 最佳实践

### 推荐做法

1. **如果列在 SELECT 中且有别名** → 使用别名
   ```sql
   SELECT name AS user_name
   FROM users
   ORDER BY user_name;  -- ✅ 清晰、一致
   ```

2. **如果列不在 SELECT 中** → 使用完整列引用（表.列）
   ```sql
   SELECT name
   FROM users
   ORDER BY users.age;  -- ✅ 明确、可靠
   ```

3. **避免歧义** → 使用表前缀
   ```sql
   SELECT u.name, o.name AS order_name
   FROM users u
   JOIN orders o ON u.id = o.user_id
   ORDER BY u.name, o.name;  -- ✅ 明确指定
   ```

### 避免的做法

```sql
-- ❌ 不好：混淆别名和列名
SELECT name AS user_name
FROM users
ORDER BY name;  -- 虽然合法，但不清晰

-- ❌ 不好：重复表达式
SELECT UPPER(name) AS upper_name
FROM users
ORDER BY UPPER(name);  -- 冗余，应该用别名
```

---

## 在 interaqt 框架中的应用

### 当前情况

interaqt 生成的 SQL：

```sql
SELECT
"User"."use_thi_2" AS "FIELD_0",
"User"."use_nam_1" AS "FIELD_1"
FROM "User" AS "User"
ORDER BY ???
```

### 选项分析

#### 选项 A：使用 SELECT 别名（当字段在 SELECT 中）

```sql
ORDER BY "FIELD_0" ASC
```

**优点：**
- ✅ 符合 SQL 标准
- ✅ 简洁

**缺点：**
- ❌ 要求字段必须在 SELECT 中
- ❌ 需要 FieldAliasMap 的状态管理
- ❌ 当前 bug 的根源：FieldAliasMap 作用域不足

#### 选项 B：始终使用原始表.列名

```sql
ORDER BY "User"."use_thi_2" ASC
```

**优点：**
- ✅ 总是有效（无论字段是否在 SELECT 中）
- ✅ 不依赖 FieldAliasMap
- ✅ 明确、可靠
- ✅ 所有主流数据库都支持

**缺点：**
- ⚠️ 当字段在 SELECT 中时，没有使用别名（但这不是错误）

---

## 推荐方案

**对于 interaqt 框架，推荐使用选项 B：始终使用原始表.列名**

### 理由

1. **可靠性**：无论字段是否在 SELECT 中都有效
2. **简单性**：不需要检查 FieldAliasMap
3. **正确性**：直接从 EntityToTableMap 获取真实列名
4. **标准兼容**：所有数据库都支持

### 实现

```typescript
buildModifierClause(modifier: Modifier, prefix: string = ''): string {
    const { limit, offset, orderBy } = modifier
    const clauses: string[] = []
    
    if (orderBy.length) {
        clauses.push(`ORDER BY ${orderBy.map(({ attribute, recordName, order }) => {
            // 直接获取数据库实际列名
            const [tableAlias, fieldName] = this.map.getTableAliasAndFieldName(
                [recordName],
                attribute
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

### 生成的 SQL

```sql
SELECT
"User"."use_thi_2" AS "FIELD_0",
"User"."use_nam_1" AS "FIELD_1"
FROM "User" AS "User"
WHERE "User"."use_id_3" IS NOT NULL
ORDER BY "User"."use_thi_2" ASC  -- ✅ 使用表.列名，清晰、可靠
```

---

## 总结

### SQL 标准答案

**当 SELECT 中有别名时，ORDER BY 可以使用：**
1. ✅ SELECT 别名
2. ✅ 原始列名
3. ✅ 两者都合法

### 对于 interaqt 框架

**推荐始终使用原始表.列名（选项 B）**，因为：
- 简单、可靠、不依赖 FieldAliasMap 状态
- 适用于所有场景（包括字段不在 SELECT 中的情况）
- 符合 SQL 标准，所有数据库都支持
- 避免了当前 bug 的根本原因

**核心原则：** ORDER BY 和 WHERE/JOIN 一样，应该直接引用数据库表结构，而不是依赖 SELECT 的输出别名。

