# storage package 深度分析报告

> 分析范围：`src/storage/`（erstorage 全部 26 个文件，约 7400 行），以及与其耦合的 driver 层（`src/drivers/`）和 runtime 调用方式。
> 所有标注 **[已验证]** 的问题均通过针对性测试在本地复现确认（PGLite / SQLite），非推测。

---

## 一、storage package 职责概述

storage 是 interaqt 的持久化层，本质是一个为"响应式计算"定制的 ORM：

1. **Schema 映射**（`Setup.ts` / `EntityToTableMap.ts`）：把 Entity/Relation 定义映射成物理表。核心特色是三种合表策略（1:1 三表合一、x:1 关系字段合入实体表、独立关系表），以及 filtered/merged entity 的虚拟化处理。
2. **查询**（`RecordQuery` / `AttributeQuery` / `MatchExp` / `SQLBuilder` / `QueryExecutor`）：语义查询 → SQL。x:1 靠 JOIN 一次查出，x:n 靠逐条二次查询；支持递归查询（label/goto）。
3. **变更**（`CreationExecutor` / `UpdateExecutor` / `DeletionExecutor`）：在合表策略下正确地创建/更新/删除记录与关系，处理"flash out"（合表数据搬迁）、reliance 级联删除等。
4. **事件**（`RecordMutationEvent`）：每次变更产生精确的事件序列，是上层 runtime 增量计算（Count/Every/StateMachine 等）的输入。**事件的正确性直接决定框架核心承诺（响应式计算正确性）**。
5. **filtered / merged entity**（`FilteredEntityManager` / `MergedItemProcessor`）：实体的"谓词子集视图"与"联合类型"，是复杂度最高的部分。

---

## 二、致命错误（按严重程度排序）

### F1. PostgreSQL 系 driver 上，EXIST 子查询导致参数错位绑定 **[已验证]**

**现象**：当 match 条件中 EXIST 原子之后还有其他值条件时，PG/PGLite 上查询结果错误（静默返回错误数据，而非报错）。同样的查询在 SQLite 上正确。

复现（PGLite）：

```typescript
// age > 20 AND EXIST(teams.name='Alpha') AND name='Bob'  → 返回 []（应返回 Bob）
const match = MatchExp.atom({ key: 'age', value: ['>', 20] })
    .and({ key: 'teams', value: ['exist', MatchExp.atom({ key: 'name', value: ['=', 'Alpha'] })] })
    .and({ key: 'name', value: ['=', 'Bob'] });
```

**根因**：占位符编号与参数收集顺序不一致。`buildXToOneFindQuery` 分两遍处理：

```72:79:src/storage/erstorage/SQLBuilder.ts
        const p = parentP || this.getPlaceholder()
        const fieldMatchExp = recordQuery.matchExpression.buildFieldMatchExpression(p, this.database)

        const [whereClause, params] = this.buildWhereClause(
            this.parseMatchExpressionValue(recordQuery.recordName, fieldMatchExp, recordQuery.contextRootEntity, p),
            prefix,
            p
        )
```

第一遍 `buildFieldMatchExpression` 按树序为所有**值原子**分配 `$1, $2...`；第二遍 `parseMatchExpressionValue` 才为 EXIST 内层子查询分配（拿到更大的编号）。但 `buildWhereClause` 收集参数是**按树序**的——EXIST 原子的内层参数会被插在中间。于是上例中 SQL 为 `age > $1 AND EXISTS(... = $3) AND name = $2`，参数数组却是 `[20, 'Alpha', 'Bob']`：`name` 被绑成 `'Alpha'`，内层被绑成 `'Bob'`。SQLite 用顺序型 `?` 占位符所以恰好正确——**测试套件全部用 EXIST 在末尾或单独出现的写法，从未覆盖到这个组合**。

**影响**：所有生产环境（PostgreSQL/PGLite）中 EXIST 与其他条件组合的查询结果静默错误。

**修复方向**：占位符分配与参数收集必须同一遍完成。最直接的改法是让 `parseMatchExpressionValue` 在 `buildFieldMatchExpression` 之前执行（先展开 EXIST 为 SQL 片段占位），或者让 `buildWhereClause` 不再依赖预先分配的编号，而是在拼 WHERE 时统一 `p()` 并同步 push 参数。

### F2. 跨实体 filtered entity：关系变更不触发标记/事件更新，产生持久性脏状态 **[已验证]**

**现象**（filtered entity `TechTeamUsers = User where team.type = 'tech'`）：

- 把用户从 tech team 改到 sales team（`update User { team: salesTeam }`）：查询结果正确地不再包含该用户（因为查询走 matchExpression 重写），但**不产生 `TechTeamUsers` 的 delete 事件**，且 `__filtered_entities` 标记保持 `true` 不变；
- 之后删除该用户时，基于脏标记又产生**一条虚假的 `TechTeamUsers` delete 事件**。

**根因**：两条独立的成员判定机制不同步。

1. 查询路径：`resolvedMatchExpression` 重写，永远实时正确；
2. 事件路径：依赖 `__filtered_entities` JSON 标记 + `FilteredEntityManager` 的依赖图。而依赖图只登记了"**实体属性**变更"：

```103:129:src/storage/erstorage/FilteredEntityManager.ts
                for (let i = 1; i < fullPath.length - 1; i++) {
                    const currentPath = fullPath.slice(0, i + 1)
                    const info = this.map.getInfoByPath(currentPath)
                    
                    if (info && info.isRecord) {
                        const depEntityName = info.recordName
                        const depPath = pathParts.slice(0, i)
                        const attribute = pathParts[pathParts.length - 1]
```

`team.type` 只登记了 "Team 的 type 属性变化"。当变化的是**关系本身**（user.team 指向另一条 Team，无论走 `update` 还是 `addRelationByNameById`/`removeRelationByName`/`addLink`/`unlink`），没有任何路径调用 `updateFilteredEntityFlags`。此外上面代码还有个次级 bug：路径中间节点（如 `team`）登记的 attribute 是**最末端的属性名**（`budget`），而不是该节点上实际存在的属性——中间实体恰有同名属性时会产生多余的重算。

**影响**：runtime 的增量计算（对 filtered entity 的 Count/Every/Transform 等）在任何"关系变更影响成员资格"的场景下**永久性地算错**，且 `__filtered_entities` 脏值会在未来的删除操作中继续产生虚假事件。这直接破坏框架的核心承诺。

**修复方向**：见第三节的架构建议（去掉持久化标记，或把关系（link）也纳入依赖图，让 addLink/unlink/update-relation 都经过统一的"成员资格 diff"钩子）。

### F3. merged entity 使用 filtered input 时，破坏根 base entity 的语义 **[已验证]**

**现象**：

```typescript
const active = Entity.create({ name: 'ActiveCustomer', baseEntity: base, matchExpression: {isActive = true} });
const merged = Entity.create({ name: 'Merged', inputEntities: [active, other] });
```

变换后的 map（实测 dump）：

```
CustomerBase   -> filtered entity of Merged_base, match: __Merged_input_entity contains 'ActiveCustomer'   ← 错！
ActiveCustomer -> match: isActive = true AND contains 'ActiveCustomer'
```

后果：

- 通过 `create('CustomerBase', {isActive: true})` 创建的记录 tag 为 `['CustomerBase']`，**在 `CustomerBase`、`ActiveCustomer`、`Merged` 里全都查不到**——记录被"黑洞化"，只有内部名 `Merged_base` 可见；
- 通过 `create('ActiveCustomer', {isActive: false})` 创建的记录不在 `ActiveCustomer` 中（谓词不满足），却**出现在 `Merged` 中**（Merged 只查 tag）——merged entity 包含了不属于任何 input 的记录。

**根因**：`createFilteredItemFromInput` 把 input tag 的 matchExpression 错误地安到了**根 base entity** 头上：

```483:491:src/storage/erstorage/MergedItemProcessor.ts
            // 创建新的 filtered entity
            const filteredEntity = Entity.clone(rootBase as EntityInstance, true);
            filteredEntity.baseEntity = baseEntity;
            filteredEntity.matchExpression = MatchExp.atom({
                key: inputFieldName,
                value: ['contains', inputEntity.name]
            });
            
            return [filteredEntity as T, rootBase as T];
```

克隆的是 `rootBase`（保留其 name），随后 `processInputItem` 用它**替换掉了原始的 base entity**。若多个 filtered input 共享同一个 root base，最后一个 input 的 tag 胜出（覆盖）。现有测试恰好只创建"不满足谓词的 base 记录"并断言其不在 merged 中，所以从未暴露。

**修复方向**：根 base entity 应保持原样（仅 rebase 到共享表/虚拟 base，matchExpression 为空或恒真）；filtered input 的成员条件应是 `(__type/tag 判定) AND (原谓词)` 且原谓词不能丢（见 F3'）。

### F3'. filtered entity 作为 merged input 后，谓词语义被创建时 tag 替代（设计层面问题）

即使修好 F3，当前设计中 input entity 的成员资格由**创建时写死的 tag** 决定，而不是声明的谓词：`ActiveCustomer` 从"isActive=true 的 CustomerBase"静默变成"以 ActiveCustomer 名义创建的记录"。记录后续 `isActive` 变为 false 时不会退出（tag 不变）。这与 filtered entity 的声明式语义直接矛盾，用户无从察觉。这是"用 filter 机制模拟 union 类型"带来的根本性概念混叠，详见第三节。

### F4. 每次 create/update 都对整表做无条件全表查询（flash out） **[已验证]**

**现象**：创建一条无任何 1:1 合表关系的普通记录，日志中出现：

```
SELECT ... FROM "User7" AS "User7" WHERE 1=?     -- name: finding combined records ... to flash out
```

即**把该表全部行捞回内存**。表越大，每次插入越慢，属于 O(N) 级别的写放大。

**根因**：`preprocessSameRowData` 无条件调用 `flashOutCombinedRecordsAndMergedLinks`，而后者在 `combinedRecordIdRefs` 为空时 `match` 保持 `undefined`，加上 `allowNull=true` 去掉了 `id not null` 兜底，最终 WHERE 变成 `1=1`：

```176:196:src/storage/erstorage/RecordQueryAgent.ts
        let match: MatchExpressionData | undefined
        // 这里的目的是抢夺 combined record 上的所有数据，那么一定穷尽 combined record 的同表数据才行。
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(newEntityData.recordName, this.map, true, true, false, true)
        for (let combinedRecordIdRef of newEntityData.combinedRecordIdRefs) {
            ...
        }

        const recordQuery = RecordQuery.create(newEntityData.recordName, this.map, {
            matchExpression: match,
            attributeQuery: attributeQuery,
        }, undefined, undefined, undefined, false, true)

        const recordsWithCombined = await this.queryExecutor.findRecords(recordQuery, reason, undefined)
```

**修复方向**：`combinedRecordIdRefs.length === 0` 时直接返回 `{}`，跳过查询。一行 guard 即可，收益巨大。

### F5. 通过 x:n 关联属性做 match 时结果集重复 **[已验证]**

**现象**：用户属于两个名字都匹配 `Alpha%` 的团队时，`find('User', {teams.name like 'Alpha%'})` 返回**同一个用户两次**。

**根因**：match 树中的 x:n 路径直接进 `getJoinTables` 变成 LEFT JOIN（`SQLBuilder.ts` 66-70 行合并 `matchQueryTree`），SELECT 无 DISTINCT，也没有改写成 EXISTS。注释里其实写明了 x:n 应当用 EXIST（`MatchExp.ts` 313 行附近），但普通的 `teams.name = x` 扁平路径写法没有走 EXIST 分支。

**影响**：结果重复本身就是错的；叠加 `limit/offset` 时分页语义也坏了（重复行占据配额）。`findOne` 恰好因为取第一条而掩盖问题。

**修复方向**：要么在语义层禁止 match 里出现 x:n 扁平路径（强制用 EXIST，schema 校验期报错），要么自动把 x:n 路径原子改写为 EXISTS 子查询。前者与 filtered entity 对 x:n 路径的既有校验（`Setup.validateFilteredEntityPaths`）一致，更符合"explicit control"原则。

### F6. `lockRecords`（FOR UPDATE）带 x:1 关联查询在 PG 上直接报错 **[已验证]**

**现象**：`handle.lock('User', undefined, ['name', ['team', {...}]])` 在 PGLite/PG 上抛 `FOR UPDATE cannot be applied to the nullable side of an outer join`。

**根因**：

```140:146:src/storage/erstorage/QueryExecutor.ts
        const [querySQL, params, fieldAliasMap] = this.sqlBuilder.buildXToOneFindQuery(entityQuery, '')
        const supportsForUpdate = this.database.constructor.name !== 'SQLiteDB'
        const rawReturns: { [k: string]: unknown }[] = await this.database.query(
            forUpdate && supportsForUpdate ? `${querySQL}\nFOR UPDATE` : querySQL,
            params,
            queryName
        )
```

x:1 一律 LEFT JOIN，`FOR UPDATE` 不允许作用于 outer join 的可空侧。另外用 `constructor.name !== 'SQLiteDB'` 判断能力：字符串匹配在压缩/继承/新 driver 下都会失效，这类能力应该是 `Database` 接口上的显式声明（如 `supportsForUpdate?: boolean`）。

**修复方向**：`FOR UPDATE OF "<主表别名>"`（只锁主表），能力判断改为 driver 接口属性。

### F7. 关联记录上的 JSON 字段不做反序列化（SQLite/MySQL 系）**[已验证]**

**现象**：`findOne('User', ..., ['name', ['profile', { attributeQuery: ['tags'] }]])`，`profile.tags` 返回的是字符串 `"[\"a\",\"b\"]"` 而不是数组。

**根因**：结果结构化时只用**根记录**的 JSONFields、且只判断一层路径：

```81:90:src/storage/erstorage/QueryExecutor.ts
            Object.entries(rawReturn).forEach(([key, value]) => {
                // CAUTION 注意这里去掉了最开始的 entityName
                const attributePath = fieldAliasMap.getPath(key)!.slice(1, Infinity)
                if (attributePath.length === 1 && JSONFields.includes(attributePath[0]) && typeof value === 'string') {
                    value = JSON.parse(value)
                }
```

PGLite 的 JSON 列原生返回对象，掩盖了问题——测试大量使用 PGLite 所以没发现。SQLite/MySQL 返回字符串。**同一 API 在不同 driver 下返回类型不一致**，对框架是不可接受的。

**修复方向**：按 `attributePath` 逐级解析出所属 record 的 JSONFields（`fieldAliasMap` 已含完整路径，成本很低）。

### F8. MySQL driver 的 JSON `contains` 存在 SQL 注入

```163:169:src/drivers/Mysql.ts
        if (fieldType === 'JSON') {
            if (value[0].toLowerCase() === 'contains') {
                const fieldNameWithQuotes = fieldName.split('.').map(x => `"${x}"`).join('.')
                return {
                    fieldValue: `IS NOT NULL AND JSON_CONTAINS(${fieldNameWithQuotes}, '${JSON.stringify(value[1])}', '$')`,
                    fieldParams: []
                }
```

`value[1]` 直接字符串拼接进 SQL。`JSON.stringify("a'b")` 不会转义单引号，可逃逸出字符串字面量。match 的 value 常来自用户输入（API 查询参数），这是标准注入面。PG/SQLite 的同名实现用了参数绑定，只有 MySQL 例外。注意 `__filtered_entities`、merged entity 的 `__X_input_entity` 匹配全部依赖 `contains`，所以这个路径在 MySQL 上是必经的。

顺带：`SQLBuilder.buildModifierClause` 中 `LIMIT ${limit}` / `OFFSET ${offset}` / `ORDER BY ... ${order}` 都是裸插值。类型上虽是 `number` / `'ASC'|'DESC'`，但 storage 是边界层（modifier 常直接透传自 HTTP 请求），应做运行时白名单/数值校验。

---

## 三、merge / filter 的实现分析与更优方案

### 3.1 现状：三套机制层层叠加

当前"一个概念、三套并行实现"：

| 概念 | 机制 | 位置 |
|---|---|---|
| filtered entity 查询 | `resolvedBaseRecordName` + `resolvedMatchExpression` 查询重写 | `Setup` 预计算，`RecordQuery.create` / `MatchExp` 构造器**两处各自**做合并 |
| filtered entity 事件 | `__filtered_entities` JSON 标记列 + 依赖图 + 逐条读-改-写 | `FilteredEntityManager`，由三个 Executor 手工调用 |
| filtered relation | attribute 级重写（`AttributeQuery` 构造器内联 rebase）+ `MatchExp.convertFilteredRelation` 路径改写 | 又一条独立代码路径 |
| merged entity/relation | `MergedItemProcessor` 在 setup 前把实体图整体改写：克隆→替换→虚拟 base→`__X_input_entity` tag 列→把 input 转成 filtered entity | 550 行图手术 |

复杂度的根源可以概括为三点：

1. **成员资格有两个真相源**。查询走谓词重写（实时正确），事件走持久化标记（增量维护）。任何一条变更路径忘记维护标记，两者就永久分叉——F2 证明了这不是理论风险。而且标记的读-改-写（`updateSingleFilteredEntityFlag` 里先 SELECT `['*']` 再 UPDATE 整个 JSON）在并发下还有丢失更新问题。
2. **用"子集"机制模拟"联合"语义**。merged entity 本质是 Single Table Inheritance（联合类型/子类型），却被实现为"tag 列 + filtered entity"的组合：tag 是**创建时写死**的（存进 JSON 数组，靠 `contains` 匹配，不可索引），而 filter 是**声明式谓词**（随数据变化）。两种成员判定语义互相污染，产生 F3/F3' 这类概念级 bug。`mergeProperties` 里为 defaultValue 生成闭包（捕获 `leafToInputMap`），还使得 schema 无法序列化、难以调试。
3. **name 字符串驱动的图手术**。`MergedItemProcessor` 通过 `RefContainer` 克隆整个实体图、按 name 查找替换、生成 `${name}_base` / `__${name}_input_entity` 等约定命名。任何一步 name 冲突或替换顺序问题都是静默错误（F3 即是替换错对象）。

### 3.2 建议的目标架构

**核心思路：把"视图（子集）"和"子类型（联合）"拆成两个正交概念，各自用最贴合的机制实现；成员资格只保留一个真相源。**

#### (a) filtered entity → 纯虚拟视图，删除持久化标记

- 查询：保留现有 `resolvedMatchExpression` 重写（这部分是对的），但合并逻辑收敛到**一处**（目前 `RecordQuery.create` 和 `MatchExp` 构造器各有一份，语义重复）。
- 事件：不再持久化 `__filtered_entities`，改为**变更时的成员资格 diff**：
  - setup 期为每个 base entity 预编译一个 `MembershipEvaluator`：`{ filteredEntityName, 谓词, 依赖 = {本地属性集, 关系边集, 远端属性集} }`。依赖提取时把**路径上的每条关系（link）本身**也登记为依赖——这是 F2 的根本修复。
  - 所有变更路径（create/update/delete/addLink/unlink，包括合表产生的隐式关系变化）收敛到一个钩子：`onMutation(recordName | linkName, before, after)`。钩子按依赖图找出受影响的 base 记录，本地属性谓词直接在内存中对 before/after 求值（0 次额外查询，UpdateExecutor 本来就取回了完整旧记录）；跨实体谓词按现在的方式发两次 membership 查询（次数与现状相同，但不再有可脱同步的状态）。
  - 好处：无脏状态可言（stateless），并发下也不需要对 JSON 列做读-改-写；创建记录时也省掉现在"INSERT 后再补一条 UPDATE 写 flags"的额外往返。

#### (b) merged entity → 显式的单表继承 + 可索引判别列

- 用**单个字符串判别列** `__type`（或框架统一的 `_entity` 列）替代 `__X_input_entity` JSON 数组 + `contains`：
  - 记录创建时 `__type = 创建所用的实体名`（普通 input 直接是自身；filtered input 的记录 `__type = 其根 base 名`）。
  - 普通 input entity 的成员条件：`__type = 'Cat'`——可加索引，等值匹配，跨 driver 无 JSON 兼容问题（顺带消除 F8 的必经路径）。
  - filtered input 的成员条件：`__type = 'CustomerBase' AND isActive = true`——**原谓词保留**，语义不漂移，记录属性变化时自然进出，且事件由 (a) 的统一 diff 钩子覆盖。
  - merged entity 的成员条件：各 input 条件的 OR。
  - root base entity 保持原语义（`__type = 'CustomerBase'`，不带 input 谓词），修复 F3 的黑洞。
- `MergedItemProcessor` 从"运行前图手术"退化为纯粹的 **schema 编译**：输出仍是 `MapData`（表、列、每个 record 的成员谓词），不再需要克隆实体实例、生成闭包 defaultValue、虚拟 `_base` 实体命名约定。嵌套 merged（merged of merged）在判别列模型下就是谓词 OR 的展开，无需 `buildLeafToInputMap` 这类逐层传播。
- 直接以 merged 名字创建记录应当在 schema 编译期或运行期**显式报错**（union 是抽象类型）。当前行为是静默接受并产生不属于任何 input 的记录（普通 input 情形）或黑洞记录（filtered input 情形），违反"explicit control"。

#### (c) 统一 filtered relation 到同一模型

filtered relation 目前在 `AttributeQuery` 构造器里内联 rebase、在 `MatchExp.convertFilteredRelation` 里做路径替换，两处都很难读。在 (a) 的模型里，link record 与 entity record 本就同构（都是 `RecordMapItem`），filtered relation 只是"base 为 link 的视图"，谓词重写和事件 diff 可以完全复用同一个 evaluator，无需独立代码路径。

这一方案不是推翻重来：查询重写层（现有最稳的部分）原样保留；改动集中在 `FilteredEntityManager`（重写为 evaluator + 统一钩子）、`MergedItemProcessor`（重写为 schema 编译）、三个 Executor 中散落的 filtered 调用点（收敛到钩子）。`__filtered_entities` 与 `__X_input_entity` 两个物理列被一个 `__type` 判别列取代（仅 merged 场景需要）。

---

## 四、其他显著值得改进的地方

### 4.1 正确性/健壮性

1. **死代码带 bug**：`Setup.resolveBaseSourceEntityAndFilter`（159-172 行）读取不存在的 `baseEntity.filter` 字段，且从未被调用。应删除。
2. **依赖图自身属性重复注册**：`FilteredEntityManager.analyzeDependencies`（44-56 行）当谓词只含自身属性时，同一 dependency 被 push 进同一数组两次，每次 update 做双倍的 membership 查询（结果幂等但白做）。
3. **`preprocessSameRowData` 双份实现**：`RecordQueryAgent.ts` 90-167 行与 `CreationExecutor.ts` 114-206 行是近乎逐行复制的两份复杂逻辑（更新分支/创建分支各留一份在不同类里），已经出现注释漂移（`CreationExecutor` 104 行注释说"不持久化 __filtered_entities"，实际代码持久化）。必然随时间分叉，应合并为一份。
4. **事件切片靠位置约定**：`DeletionExecutor.deleteRecord` 72-77 行用 `slice(length - records.length)` 从事件数组尾部"猜"出 record 删除事件。事件应携带足够的结构信息（或分数组收集），而不是依赖"最后 N 条一定是 X"的脆弱不变量。
5. **name 约束声明了但未执行**：`Entity`/`Relation` 的 Klass 元数据里有 `nameFormat: /^[a-zA-Z0-9_]+$/`，但 create 时没有任何代码校验它，而表名/字段名/别名全部裸插值进 SQL（`CREATE TABLE "${name}"` 等）。应在 `Entity.create` 或 `DBSetup` 入口强制校验并给出清晰报错。
6. **`in` 空数组产生非法 SQL**：`MatchExp.getFinalFieldValue` 的 `IN (${...join(',')})` 在空数组时生成 `IN ()`。内部调用（如 `deleteNotReliantSeparateLinkRecords`）恰好有非空保证，但这是公共 API，应显式处理（空数组 ⇒ 恒 false）。同函数中 `['not', 非null值]` 会生成 `"field" not $1` 这种非法 SQL，应校验并报错。
7. **`__filtered_entities` 为 NULL 时崩溃**：`updateSingleFilteredEntityFlag` 381 行 `currentFlags[...]` 在字段为 NULL（如存量数据/手工迁移）时抛 TypeError。当然若采纳三节方案此代码整体移除。

### 4.2 性能

1. **写路径全表扫描**：即 F4，一行 guard 的事，优先级最高。
2. **update/delete 的前置查询过重**：`UpdateExecutor.updateRecord` 对每条匹配记录取回**全量** attributeQuery（代码中自己标了 FIXME，48 行）。应按 newEntityData 实际涉及的字段 + filtered 依赖字段裁剪。
3. **x:n 关联查询 N+1**：`findRecords` 对每条父记录逐一发起子查询（`QueryExecutor` 216-231 行）。x:n 完全可以按父 id 集合批量查询（`IN (...)` + 按反向属性分组回填），一次消掉一层 N。
4. **filtered 标记维护 N+1**：`updateFilteredEntityFlags` 对每个依赖 × 每条受影响记录顺序执行"SELECT 全字段 → membership SELECT → UPDATE"三连。若保留现架构，至少应批量化；采纳三节方案则本地谓词场景归零。
5. **别名预生成深度上限 5**（`Setup.pregenerateTableAliases`）：超过 5 层的路径查询会拿不到预生成别名，落回原始长名。PG 会把 >63 字节的标识符**静默截断**，两条长路径截断后可能同名碰撞产生错误 JOIN。应改为运行时兜底注册（`AliasManager` 本来就支持动态注册），而不是固定深度。
6. **每次查询重建元数据对象**：`getRecordInfo`/`getInfoByPath`/`AttributeInfo` 每次调用都新建对象并做字符串拆解，热路径上应缓存（`EntityToTableMap` 是不可变的，天然可缓存）。

### 4.3 API/代码质量

1. **`EntityQueryHandle` 每次 new 都创建全套 executor**（构造器里 new `RecordQueryAgent` → 5 个 executor + FilteredEntityManager），而 `RecordQueryAgent` 构造器还会全量重算 filtered 依赖。runtime 里 `migration.ts` 等处会临时 new handle，成本不小；依赖分析结果应挂在 `EntityToTableMap`（不可变数据）上。
2. **executor 间用 `helper` 对象互相回调**：`CreationExecutor`/`UpdateExecutor`/`DeletionExecutor` 的构造器接收手工拼出来的函数字典（且 `RecordQueryAgent` 传的是 `this`，依赖方法名恰好匹配）。这是循环依赖的信号：要么承认它们是一个聚合（合回 agent，按文件拆分只是物理组织），要么抽出真正的公共下层（linkOps/sameRowOps）。
3. **`AttributeQuery.id = Math.random()`**（19 行）：来源不明的调试残留，公开字段，应删除。
4. **`EntityToTableMap.getShrinkedAttribute`**（429-529 行）：留有大段注释掉的 try/catch、无效赋值（`currentEntity = ''` 紧跟 `previousEntity = ''` 再无使用）。此函数被 filtered relation rebase 依赖，值得重写并补齐单测。
5. **`MatchExp` 与 `RecordQuery.create` 重复实现 filtered 合并**（`MatchExp.ts` 91-95 行 vs `RecordQuery.ts` 42-46 行），语义上"谁负责加 resolvedMatchExpression"不清晰，容易出现双重 AND（目前靠传 base name 恰好避开）。收敛到一处。
6. **文档失真**：`src/storage/IMPLEMENTATION_DETAILS.md` / `USAGE_GUIDE.md` 里的接口（`RelationType.OneToOne`、`{ name, properties }` 字面量、`updateSameRowData 在 RecordQueryAgent`）与现实现已不符，容易误导贡献者。

---

## 五、结论与优先级建议

storage 的分层（Setup → Map → Query/Executor → SQLBuilder）与合表策略设计是有想法的，查询重写路径（filtered entity 的读侧）也基本稳固。核心问题集中在两处：

1. **写侧与事件侧的一致性**——F2/F3/F3' 都源于"成员资格存在第二个（可脱同步的）真相源"，这是当前架构最深的裂缝，会直接把错误传导进 runtime 的响应式计算。
2. **PG 系 driver 的静默错误**——F1（参数错位）与 F5（结果重复）都属于"不报错但结果错"的最危险类别，且测试矩阵（大量 PGLite + EXIST 使用姿势单一）恰好覆盖不到。

建议的处理顺序：

| 优先级 | 项 | 工作量特征 |
|---|---|---|
| P0 | F1 占位符错位、F4 全表扫描、F8 MySQL 注入 | 局部修复，改动小、收益大 |
| P0 | F5 x:n match 重复（先做 schema 期校验禁止，后续再考虑自动 EXISTS 改写） | 校验一处 + 报错信息 |
| P1 | F2/F3：按第三节重构 filtered/merged（evaluator + 判别列） | 涉及 FilteredEntityManager、MergedItemProcessor、三个 Executor 的调用点；查询重写层不动 |
| P1 | F6 FOR UPDATE、F7 嵌套 JSON 解析 | 局部修复 |
| P2 | 4.2 性能项（N+1 批量化、update 前置查询裁剪、元数据缓存） | 独立可分批 |
| P2 | 4.3 代码质量项 | 随重构顺带 |
