# Storage 层重构设计方案

## 现状分析

### RecordQueryAgent 的问题

**规模**：1613 行，46 个方法 - 严重违反单一职责原则

**职责混乱**：
```
RecordQueryAgent (1613 行)
├── SQL 生成 (8 个方法, ~300 行)
│   ├── buildXToOneFindQuery
│   ├── buildSelectClause
│   ├── buildFromClause
│   ├── buildJoinClause
│   ├── buildWhereClause
│   ├── buildModifierClause
│   ├── parseMatchExpressionValue
│   └── getJoinTables
├── 查询执行 (4 个方法, ~400 行)
│   ├── findRecords
│   ├── findXToManyRelatedRecords
│   ├── completeXToOneLeftoverRecords
│   └── findPath
├── 创建操作 (7 个方法, ~300 行)
│   ├── createRecord
│   ├── createRecordDependency
│   ├── insertSameRowData
│   ├── handleCreationReliance
│   ├── preprocessSameRowData
│   ├── flashOutCombinedRecordsAndMergedLinks
│   └── relocateCombinedRecordDataForLink
├── 更新操作 (4 个方法, ~200 行)
│   ├── updateRecord
│   ├── updateRecordDataById
│   ├── updateSameRowData
│   └── handleUpdateReliance
├── 删除操作 (5 个方法, ~300 行)
│   ├── deleteRecord
│   ├── deleteRecordSameRowData
│   ├── handleDeletedRecordReliance
│   ├── deleteNotReliantSeparateLinkRecords
│   └── deleteDifferentTableReliance
├── 关系操作 (3 个方法, ~100 行)
│   ├── addLink
│   ├── addLinkFromRecord
│   └── unlink
└── 辅助方法 (4 个)
    └── structureRawReturns, prepareFieldValue, withPrefix...
```

**问题**：
1. ❌ **可测试性差** - 单个类太大，单元测试困难
2. ❌ **可维护性差** - 修改一个功能可能影响其他功能
3. ❌ **可扩展性差** - 添加新功能需要修改这个大类
4. ❌ **代码复用困难** - SQL 生成逻辑无法独立使用
5. ❌ **职责不清** - 新人很难理解代码结构

## 重构目标

### 设计原则

1. **单一职责原则 (SRP)** - 每个类只做一件事
2. **开闭原则 (OCP)** - 对扩展开放，对修改封闭
3. **依赖倒置原则 (DIP)** - 依赖抽象而非具体实现
4. **分层架构** - 清晰的层次划分
5. **关注点分离** - SQL 生成、执行、业务逻辑分离

## 重构方案

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    EntityQueryHandle                         │
│              (对外统一 API，协调各个组件)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ QueryPlanner │ │EventEmitter  │ │DataValidator │
│ (查询计划)   │ │(事件管理)    │ │(数据验证)    │
└──────┬───────┘ └──────────────┘ └──────────────┘
       │
       ↓
┌──────────────────────────────────────────────────┐
│             QueryExecutor                        │
│        (执行查询，协调下层组件)                   │
└────────────┬─────────────────────────────────────┘
             │
     ┌───────┼────────┐
     ↓       ↓        ↓
┌─────────┐ ┌──────────┐ ┌──────────────┐
│ SQLGen  │ │Fetcher   │ │ResultMapper  │
│(SQL生成)│ │(数据获取)│ │(结果映射)    │
└────┬────┘ └────┬─────┘ └──────────────┘
     │           │
     ↓           ↓
┌──────────┐ ┌──────────┐
│ Dialect  │ │ Database │
│(数据库   │ │(底层DB   │
│ 方言)    │ │ 连接)    │
└──────────┘ └──────────┘
```

### 核心类设计

#### 1. SQLGenerator - SQL 生成器

**职责**：将 `RecordQuery` 转换为 SQL

```typescript
/**
 * SQL 生成器 - 纯函数，无副作用
 * 负责所有 SQL 字符串的生成，不涉及执行
 */
class SQLGenerator {
  constructor(
    private map: EntityToTableMap,
    private dialect: Dialect
  ) {}
  
  // ============ SELECT 查询 ============
  
  /**
   * 生成 xToOne 查询的完整 SQL
   * 可以用一个 SQL + JOIN 完成的查询
   */
  generateSelectSQL(query: RecordQuery): SQLStatement {
    const ast = this.buildSelectAST(query)
    return this.compileAST(ast)
  }
  
  /**
   * 生成批量查询 SQL (用于 xToMany)
   * WHERE id IN (?, ?, ...)
   */
  generateBatchSelectSQL(
    recordName: string, 
    ids: (string | number)[], 
    attributeQuery: AttributeQuery
  ): SQLStatement {
    // ...
  }
  
  // ============ INSERT 查询 ============
  
  generateInsertSQL(
    recordName: string, 
    data: NewRecordData
  ): SQLStatement {
    // ...
  }
  
  generateBatchInsertSQL(
    recordName: string, 
    dataList: NewRecordData[]
  ): SQLStatement {
    // ...
  }
  
  // ============ UPDATE 查询 ============
  
  generateUpdateSQL(
    recordName: string,
    match: MatchExp,
    data: NewRecordData
  ): SQLStatement {
    // ...
  }
  
  // ============ DELETE 查询 ============
  
  generateDeleteSQL(
    recordName: string,
    match: MatchExp
  ): SQLStatement {
    // ...
  }
  
  // ============ 内部方法 ============
  
  private buildSelectAST(query: RecordQuery): SelectAST {
    return {
      type: 'SELECT',
      from: this.buildFromClause(query.recordName),
      joins: this.buildJoins(query),
      where: this.buildWhereClause(query.matchExpression),
      select: this.buildSelectFields(query.attributeQuery),
      modifiers: this.buildModifiers(query.modifier)
    }
  }
  
  private buildFromClause(recordName: string): FromClause {
    const recordInfo = this.map.getRecordInfo(recordName)
    return {
      table: recordInfo.table,
      alias: recordName
    }
  }
  
  private buildJoins(query: RecordQuery): JoinClause[] {
    const queryTree = query.attributeQuery.xToOneQueryTree
    return this.getJoinTables(queryTree)
  }
  
  private buildWhereClause(match: MatchExp): WhereClause {
    const fieldMatchExp = match.buildFieldMatchExpression(
      this.dialect.getPlaceholder,
      this.database
    )
    return this.compileMatchExpression(fieldMatchExp)
  }
  
  private buildSelectFields(attrQuery: AttributeQuery): SelectField[] {
    const fields = attrQuery.getValueAndXToOneRecordFields()
    return fields.map(field => ({
      tableAlias: field.tableAliasAndField[0],
      column: field.tableAliasAndField[1],
      alias: this.generateFieldAlias(field.nameContext, field.attribute)
    }))
  }
  
  private buildModifiers(modifier: Modifier): ModifierClause {
    return {
      orderBy: modifier.orderBy,
      limit: modifier.limit,
      offset: modifier.offset
    }
  }
  
  private compileAST(ast: SelectAST): SQLStatement {
    const sql = this.dialect.compileSelect(ast)
    return {
      sql,
      params: ast.params || []
    }
  }
  
  // 辅助方法
  private getJoinTables(queryTree: RecordQueryTree): JoinClause[] {
    // 从当前 RecordQueryAgent.getJoinTables 迁移
    // ...
  }
  
  private generateFieldAlias(context: string[], attribute: string): string {
    // 处理超长字段名
    const path = [...context, attribute].join('.')
    if (path.length <= 63) return path
    return this.shortenFieldName(path)
  }
}

// AST 类型定义
interface SelectAST {
  type: 'SELECT'
  from: FromClause
  joins: JoinClause[]
  where: WhereClause
  select: SelectField[]
  modifiers: ModifierClause
  params?: any[]
}

interface FromClause {
  table: string
  alias: string
}

interface JoinClause {
  type: 'LEFT' | 'INNER' | 'RIGHT'
  table: string
  alias: string
  on: {
    left: { table: string, field: string }
    right: { table: string, field: string }
  }
}

interface WhereClause {
  type: 'AND' | 'OR' | 'NOT' | 'COMPARISON'
  operator?: string
  left?: WhereClause
  right?: WhereClause
  field?: { table: string, column: string }
  value?: any
}

interface SelectField {
  tableAlias: string
  column: string
  alias: string
}

interface ModifierClause {
  orderBy: Array<{ recordName: string, attribute: string, order: 'ASC' | 'DESC' }>
  limit?: number
  offset?: number
}

interface SQLStatement {
  sql: string
  params: any[]
}
```

#### 2. QueryExecutor - 查询执行器

**职责**：执行查询，协调 SQL 生成和结果映射

```typescript
/**
 * 查询执行器 - 协调 SQL 生成、执行、结果映射
 */
class QueryExecutor {
  constructor(
    private map: EntityToTableMap,
    private database: Database,
    private sqlGenerator: SQLGenerator,
    private resultMapper: ResultMapper
  ) {}
  
  /**
   * 执行单个查询
   */
  async executeQuery(query: RecordQuery): Promise<Record[]> {
    // 1. 生成 SQL
    const stmt = this.sqlGenerator.generateSelectSQL(query)
    
    // 2. 执行查询
    const rawResults = await this.database.query(stmt.sql, stmt.params)
    
    // 3. 映射结果
    const records = this.resultMapper.mapToRecords(
      rawResults, 
      query.attributeQuery
    )
    
    // 4. 处理 xToMany 关系
    await this.loadXToManyRelations(records, query)
    
    return records
  }
  
  /**
   * 批量执行查询（用于 xToMany）
   */
  async executeBatchQuery(
    recordName: string,
    ids: (string | number)[],
    attributeQuery: AttributeQuery
  ): Promise<Map<string | number, Record[]>> {
    if (ids.length === 0) return new Map()
    
    // 1. 生成批量查询 SQL
    const stmt = this.sqlGenerator.generateBatchSelectSQL(
      recordName, 
      ids, 
      attributeQuery
    )
    
    // 2. 执行查询
    const rawResults = await this.database.query(stmt.sql, stmt.params)
    
    // 3. 映射并分组结果
    const records = this.resultMapper.mapToRecords(rawResults, attributeQuery)
    return this.groupByParentId(records)
  }
  
  /**
   * 加载 xToMany 关系（批量优化）
   */
  private async loadXToManyRelations(
    records: Record[], 
    query: RecordQuery
  ): Promise<void> {
    const xToManyQueries = query.attributeQuery.xToManyRecords
    
    for (const relatedQuery of xToManyQueries) {
      // 收集所有父 ID
      const parentIds = records.map(r => r.id)
      
      // 批量查询
      const relatedRecordsMap = await this.executeBatchQuery(
        relatedQuery.recordName,
        parentIds,
        relatedQuery.attributeQuery
      )
      
      // 分配到各个父记录
      for (const record of records) {
        record[relatedQuery.attributeName!] = 
          relatedRecordsMap.get(record.id) || []
      }
    }
  }
  
  private groupByParentId(records: Record[]): Map<string | number, Record[]> {
    const map = new Map()
    for (const record of records) {
      const parentId = record.__parentId  // 由 SQL 生成器添加
      if (!map.has(parentId)) map.set(parentId, [])
      map.get(parentId).push(record)
    }
    return map
  }
}
```

#### 3. ResultMapper - 结果映射器

**职责**：将数据库原始结果映射为结构化对象

```typescript
/**
 * 结果映射器 - 纯函数，负责数据转换
 */
class ResultMapper {
  constructor(
    private map: EntityToTableMap
  ) {}
  
  /**
   * 将扁平的数据库行映射为嵌套的记录对象
   */
  mapToRecords(
    rawRows: Record<string, any>[], 
    attributeQuery: AttributeQuery
  ): Record[] {
    if (rawRows.length === 0) return []
    
    // 1. 按主键分组（处理 JOIN 产生的重复行）
    const groupedRows = this.groupByPrimaryKey(rawRows)
    
    // 2. 结构化每一组
    return groupedRows.map(rows => this.structureRecord(rows, attributeQuery))
  }
  
  /**
   * 将扁平的别名字段转为嵌套结构
   * 
   * 输入: { "User.id": 1, "User.name": "Alice", "User.profile.bio": "..." }
   * 输出: { id: 1, name: "Alice", profile: { bio: "..." } }
   */
  private structureRecord(
    rows: Record<string, any>[], 
    attributeQuery: AttributeQuery
  ): Record {
    const record: Record = {}
    const firstRow = rows[0]
    
    // 处理值字段
    for (const attr of attributeQuery.valueAttributes) {
      const alias = this.getFieldAlias([attributeQuery.recordName], attr)
      record[attr] = firstRow[alias]
    }
    
    // 处理 xToOne 关系
    for (const relatedQuery of attributeQuery.xToOneRecords) {
      const relatedRecord = this.structureRecord(
        rows, 
        relatedQuery.attributeQuery
      )
      record[relatedQuery.attributeName!] = relatedRecord
    }
    
    // xToMany 关系由 QueryExecutor 处理，这里不处理
    
    return record
  }
  
  private groupByPrimaryKey(
    rows: Record<string, any>[]
  ): Record<string, any>[][] {
    // 按主键分组
    const groups = new Map<string, Record<string, any>[]>()
    for (const row of rows) {
      const pk = row['id'] || row['_pk']
      if (!groups.has(pk)) groups.set(pk, [])
      groups.get(pk)!.push(row)
    }
    return Array.from(groups.values())
  }
  
  private getFieldAlias(context: string[], attribute: string): string {
    return [...context, attribute].join('.')
  }
  
  /**
   * 解析 JSON 字段
   */
  parseJSONFields(record: Record, jsonFields: string[]): Record {
    for (const field of jsonFields) {
      if (typeof record[field] === 'string') {
        try {
          record[field] = JSON.parse(record[field])
        } catch (e) {
          // 保持原值
        }
      }
    }
    return record
  }
}
```

#### 4. MutationExecutor - 变更执行器

**职责**：处理创建、更新、删除操作

```typescript
/**
 * 变更执行器 - 处理 CUD 操作
 */
class MutationExecutor {
  constructor(
    private map: EntityToTableMap,
    private database: Database,
    private sqlGenerator: SQLGenerator,
    private eventEmitter: EventEmitter,
    private relationManager: RelationManager
  ) {}
  
  // ============ CREATE ============
  
  async create(
    recordName: string, 
    data: NewRecordData
  ): Promise<Record> {
    const events: RecordMutationEvent[] = []
    
    try {
      // 1. 创建依赖记录
      await this.createDependencies(data, events)
      
      // 2. 分配 ID
      const dataWithIds = await this.assignIds(data)
      
      // 3. 处理表合并冲突
      await this.handleMergedTableConflicts(dataWithIds, events)
      
      // 4. 插入主记录
      const stmt = this.sqlGenerator.generateInsertSQL(recordName, dataWithIds)
      const result = await this.database.execute(stmt.sql, stmt.params)
      
      // 5. 创建关系
      await this.relationManager.createRelations(dataWithIds, events)
      
      // 6. 触发事件
      this.eventEmitter.emit('create', events)
      
      return result
    } catch (error) {
      // 回滚事件
      this.eventEmitter.emit('rollback', events)
      throw error
    }
  }
  
  private async createDependencies(
    data: NewRecordData, 
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 处理 combined records, merged links 等
    // 从当前 createRecordDependency 迁移
  }
  
  private async assignIds(data: NewRecordData): Promise<NewRecordData> {
    // 分配所有必要的 ID
    // 从当前 preprocessSameRowData 迁移
  }
  
  private async handleMergedTableConflicts(
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 处理三表合一的冲突
    // 从当前 flashOutCombinedRecordsAndMergedLinks 迁移
  }
  
  // ============ UPDATE ============
  
  async update(
    recordName: string,
    match: MatchExp,
    data: NewRecordData
  ): Promise<Record[]> {
    const events: RecordMutationEvent[] = []
    
    // 1. 查找匹配的记录
    const matchedRecords = await this.queryExecutor.executeQuery(
      RecordQuery.create(recordName, this.map, { matchExpression: match.data })
    )
    
    // 2. 更新每条记录
    const results = []
    for (const record of matchedRecords) {
      const updated = await this.updateOne(recordName, record, data, events)
      results.push(updated)
    }
    
    // 3. 触发事件
    this.eventEmitter.emit('update', events)
    
    return results
  }
  
  private async updateOne(
    recordName: string,
    record: Record,
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<Record> {
    // 1. 更新同行数据
    await this.updateSameRowData(recordName, record, data, events)
    
    // 2. 更新关系
    await this.relationManager.updateRelations(record, data, events)
    
    return record
  }
  
  private async updateSameRowData(
    recordName: string,
    record: Record,
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 从当前 updateSameRowData 迁移
  }
  
  // ============ DELETE ============
  
  async delete(
    recordName: string,
    match: MatchExp
  ): Promise<number> {
    const events: RecordMutationEvent[] = []
    
    // 1. 查找要删除的记录
    const records = await this.queryExecutor.executeQuery(
      RecordQuery.create(recordName, this.map, { matchExpression: match.data })
    )
    
    // 2. 删除关系
    await this.relationManager.deleteRelations(recordName, records, events)
    
    // 3. 删除记录
    const stmt = this.sqlGenerator.generateDeleteSQL(recordName, match)
    await this.database.execute(stmt.sql, stmt.params)
    
    // 4. 触发事件
    this.eventEmitter.emit('delete', events)
    
    return records.length
  }
}
```

#### 5. RelationManager - 关系管理器

**职责**：专门处理实体间的关系

```typescript
/**
 * 关系管理器 - 处理实体间的关联关系
 */
class RelationManager {
  constructor(
    private map: EntityToTableMap,
    private database: Database,
    private sqlGenerator: SQLGenerator
  ) {}
  
  /**
   * 创建关系
   */
  async createRelations(
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 处理各种类型的关系创建
    await this.createIsolatedRelations(data, events)
    await this.createMergedRelations(data, events)
  }
  
  /**
   * 更新关系
   */
  async updateRelations(
    record: Record,
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 处理关系的更新
    await this.handleXToOneRelations(record, data, events)
    await this.handleXToManyRelations(record, data, events)
  }
  
  /**
   * 删除关系
   */
  async deleteRelations(
    recordName: string,
    records: Record[],
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 删除与这些记录相关的所有关系
    await this.deleteSeparateLinkRecords(recordName, records, events)
    await this.deleteMergedLinkRecords(recordName, records, events)
  }
  
  /**
   * 添加链接
   */
  async addLink(
    linkName: string,
    sourceId: string,
    targetId: string,
    attributes: Record<string, any> = {},
    events: RecordMutationEvent[] = []
  ): Promise<Record> {
    // 从当前 addLink 迁移
    const stmt = this.sqlGenerator.generateInsertSQL(linkName, {
      source: { id: sourceId },
      target: { id: targetId },
      ...attributes
    })
    return await this.database.execute(stmt.sql, stmt.params)
  }
  
  /**
   * 删除链接
   */
  async removeLink(
    linkName: string,
    match: MatchExp,
    events: RecordMutationEvent[] = []
  ): Promise<number> {
    // 从当前 unlink 迁移
    const stmt = this.sqlGenerator.generateDeleteSQL(linkName, match)
    return await this.database.execute(stmt.sql, stmt.params)
  }
  
  // 内部方法
  private async createIsolatedRelations(
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 从 handleCreationReliance 迁移
  }
  
  private async createMergedRelations(
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 处理合并到表中的关系
  }
  
  private async handleXToOneRelations(
    record: Record,
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 从 handleUpdateReliance 迁移 xToOne 部分
  }
  
  private async handleXToManyRelations(
    record: Record,
    data: NewRecordData,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 从 handleUpdateReliance 迁移 xToMany 部分
  }
  
  private async deleteSeparateLinkRecords(
    recordName: string,
    records: Record[],
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 从 deleteNotReliantSeparateLinkRecords 迁移
  }
  
  private async deleteMergedLinkRecords(
    recordName: string,
    records: Record[],
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 从 deleteDifferentTableReliance 迁移
  }
}
```

#### 6. EventEmitter - 事件管理器

**职责**：管理记录变更事件

```typescript
/**
 * 事件管理器
 */
class EventEmitter {
  private listeners: Map<string, Set<EventListener>> = new Map()
  
  on(event: 'create' | 'update' | 'delete', listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }
  
  off(event: string, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener)
  }
  
  emit(event: string, events: RecordMutationEvent[]): void {
    const listeners = this.listeners.get(event)
    if (!listeners) return
    
    for (const listener of listeners) {
      listener(events)
    }
  }
}

type EventListener = (events: RecordMutationEvent[]) => void
```

#### 7. 重构后的 RecordQueryAgent（简化版）

```typescript
/**
 * RecordQueryAgent - 简化为协调器角色
 * 现在只有 ~100 行，主要负责协调各个专门的执行器
 */
class RecordQueryAgent {
  private queryExecutor: QueryExecutor
  private mutationExecutor: MutationExecutor
  private relationManager: RelationManager
  
  constructor(
    public map: EntityToTableMap,
    public database: Database
  ) {
    // 初始化各个组件
    const sqlGenerator = new SQLGenerator(map, database.dialect)
    const resultMapper = new ResultMapper(map)
    const eventEmitter = new EventEmitter()
    
    this.queryExecutor = new QueryExecutor(
      map, database, sqlGenerator, resultMapper
    )
    
    this.relationManager = new RelationManager(
      map, database, sqlGenerator
    )
    
    this.mutationExecutor = new MutationExecutor(
      map, database, sqlGenerator, eventEmitter, this.relationManager
    )
  }
  
  // ============ 查询操作 ============
  
  async findRecords(
    query: RecordQuery
  ): Promise<Record[]> {
    return this.queryExecutor.executeQuery(query)
  }
  
  // ============ 变更操作 ============
  
  async createRecord(
    recordName: string,
    data: NewRecordData,
    events?: RecordMutationEvent[]
  ): Promise<Record> {
    return this.mutationExecutor.create(recordName, data)
  }
  
  async updateRecord(
    recordName: string,
    match: MatchExp,
    data: NewRecordData,
    events?: RecordMutationEvent[]
  ): Promise<Record[]> {
    return this.mutationExecutor.update(recordName, match, data)
  }
  
  async deleteRecord(
    recordName: string,
    match: MatchExp,
    events?: RecordMutationEvent[]
  ): Promise<number> {
    return this.mutationExecutor.delete(recordName, match)
  }
  
  // ============ 关系操作 ============
  
  async addLink(
    linkName: string,
    sourceId: string,
    targetId: string,
    attributes?: Record<string, any>
  ): Promise<Record> {
    return this.relationManager.addLink(linkName, sourceId, targetId, attributes)
  }
  
  async removeLink(
    linkName: string,
    match: MatchExp
  ): Promise<number> {
    return this.relationManager.removeLink(linkName, match)
  }
}
```

### 文件结构

```
src/storage/erstorage/
├── index.ts                    # 导出所有公共接口
├── EntityQueryHandle.ts        # 对外 API (保持不变)
├── RecordQueryAgent.ts         # 简化的协调器 (~100 行)
│
├── query/                      # 查询相关
│   ├── QueryExecutor.ts        # 查询执行器 (~200 行)
│   ├── ResultMapper.ts         # 结果映射器 (~150 行)
│   └── QueryPlanner.ts         # 查询计划器 (可选，未来扩展)
│
├── mutation/                   # 变更相关
│   ├── MutationExecutor.ts     # 变更执行器 (~300 行)
│   ├── RelationManager.ts      # 关系管理器 (~250 行)
│   └── EventEmitter.ts         # 事件管理器 (~50 行)
│
├── sql/                        # SQL 生成
│   ├── SQLGenerator.ts         # SQL 生成器 (~400 行)
│   ├── ASTBuilder.ts           # AST 构建器 (~200 行)
│   ├── ASTCompiler.ts          # AST 编译器 (~200 行)
│   └── types.ts                # AST 类型定义
│
├── dialect/                    # 数据库方言 (已有)
│   ├── Dialect.ts
│   ├── PostgresDialect.ts
│   └── SQLiteDialect.ts
│
├── core/                       # 核心类 (保持不变)
│   ├── EntityToTableMap.ts
│   ├── RecordQuery.ts
│   ├── MatchExp.ts
│   ├── AttributeQuery.ts
│   ├── NewRecordData.ts
│   └── FilteredEntityManager.ts
│
└── util/                       # 工具类
    ├── FieldAliasMap.ts
    ├── RecursiveContext.ts
    └── validation.ts
```

## 重构收益

### 代码质量提升

**重构前**：
```
RecordQueryAgent.ts - 1613 行，46 个方法
├── 职责混乱
├── 难以测试
├── 难以维护
└── 难以扩展
```

**重构后**：
```
query/
├── QueryExecutor.ts       - 200 行，10 个方法  ✅ 查询执行
├── ResultMapper.ts        - 150 行，6 个方法   ✅ 结果映射

mutation/
├── MutationExecutor.ts    - 300 行，12 个方法  ✅ 变更操作
├── RelationManager.ts     - 250 行，10 个方法  ✅ 关系管理

sql/
├── SQLGenerator.ts        - 400 行，15 个方法  ✅ SQL 生成

RecordQueryAgent.ts        - 100 行，8 个方法   ✅ 协调器

总计：~1400 行，61 个方法（分散在 6 个类中）
```

### 具体改进

1. **可测试性** ⬆️⬆️⬆️
   - 每个类可独立测试
   - SQLGenerator 是纯函数，极易测试
   - 可以 mock 依赖

2. **可维护性** ⬆️⬆️⬆️
   - 修改 SQL 生成逻辑只需改 SQLGenerator
   - 修改事件处理只需改 EventEmitter
   - 职责清晰，定位 bug 容易

3. **可扩展性** ⬆️⬆️
   - 添加新数据库方言只需实现 Dialect
   - 添加查询优化器只需扩展 QueryPlanner
   - 添加新功能不会影响现有代码

4. **代码复用** ⬆️⬆️
   - SQLGenerator 可以独立使用
   - ResultMapper 可以用于其他场景
   - RelationManager 封装了所有关系逻辑

5. **性能优化** ⬆️
   - QueryExecutor 实现了批量查询
   - 解决了 N+1 问题
   - 可以添加查询缓存

## 迁移策略

### 第一阶段：SQL 生成分离（1-2 周）

1. 创建 `sql/SQLGenerator.ts`
2. 迁移所有 `build*` 方法
3. 测试 SQL 生成正确性
4. 在 RecordQueryAgent 中使用 SQLGenerator

**风险**：低 - 纯重构，不改变行为

### 第二阶段：查询执行分离（1-2 周）

1. 创建 `query/QueryExecutor.ts`
2. 创建 `query/ResultMapper.ts`
3. 迁移 `findRecords`, `findXToManyRelatedRecords` 等
4. 实现批量查询优化
5. 测试查询功能

**风险**：中 - 涉及核心查询逻辑

### 第三阶段：变更操作分离（2-3 周）

1. 创建 `mutation/MutationExecutor.ts`
2. 创建 `mutation/RelationManager.ts`
3. 迁移所有 create/update/delete 方法
4. 测试变更功能

**风险**：高 - 涉及复杂的业务逻辑

### 第四阶段：清理和优化（1 周）

1. 删除 RecordQueryAgent 中的旧代码
2. 更新所有测试
3. 性能测试
4. 文档更新

**风险**：低 - 收尾工作

## 测试策略

### 单元测试

```typescript
// SQLGenerator 单元测试
describe('SQLGenerator', () => {
  it('should generate SELECT SQL for xToOne query', () => {
    const query = RecordQuery.create(...)
    const sql = sqlGenerator.generateSelectSQL(query)
    expect(sql.sql).toContain('SELECT')
    expect(sql.sql).toContain('LEFT JOIN')
  })
})

// QueryExecutor 单元测试（mock database）
describe('QueryExecutor', () => {
  it('should execute query and map results', async () => {
    const mockDB = { query: jest.fn().mockResolvedValue([...]) }
    const executor = new QueryExecutor(..., mockDB, ...)
    const results = await executor.executeQuery(query)
    expect(results).toHaveLength(10)
  })
})
```

### 集成测试

```typescript
// 完整流程测试
describe('Storage Integration', () => {
  it('should create record with relations', async () => {
    const agent = new RecordQueryAgent(map, database)
    const user = await agent.createRecord('User', {
      name: 'Alice',
      profile: { bio: '...' },
      posts: [{ title: 'Post 1' }]
    })
    expect(user.id).toBeDefined()
    expect(user.profile.id).toBeDefined()
  })
})
```

### 性能测试

```typescript
describe('Performance', () => {
  it('should solve N+1 problem with batch loading', async () => {
    const queryCount = 0
    database.on('query', () => queryCount++)
    
    // 查询 100 个用户和他们的帖子
    const users = await agent.findRecords(...)
    
    // 应该只有 2 次查询：1 次用户 + 1 次批量帖子
    expect(queryCount).toBe(2)
  })
})
```

## 总结

### 核心改进

1. **单一职责** - 每个类只做一件事
2. **分层架构** - 清晰的层次划分
3. **依赖注入** - 组件间松耦合
4. **批量优化** - 解决 N+1 问题
5. **易于测试** - 每个组件可独立测试

### 代码对比

**重构前**：
```typescript
class RecordQueryAgent {
  // 1613 行，46 个方法
  // SQL 生成、查询执行、变更操作、关系管理全部混在一起
}
```

**重构后**：
```typescript
class SQLGenerator       { /* 400 行，纯 SQL 生成 */ }
class QueryExecutor      { /* 200 行，查询执行 */ }
class ResultMapper       { /* 150 行，结果映射 */ }
class MutationExecutor   { /* 300 行，变更操作 */ }
class RelationManager    { /* 250 行，关系管理 */ }
class EventEmitter       { /* 50 行，事件管理 */ }
class RecordQueryAgent   { /* 100 行，协调器 */ }

// 总计：~1450 行，61 个方法，分散在 7 个类中
// 每个类职责清晰，易于理解和维护
```

### 关键价值

- ✅ **可维护性提升** - 定位和修复 bug 更容易
- ✅ **可测试性提升** - 单元测试覆盖率可达 90%+
- ✅ **可扩展性提升** - 添加新功能不影响现有代码
- ✅ **性能提升** - 批量查询优化，解决 N+1 问题
- ✅ **代码质量提升** - 符合 SOLID 原则

这个重构方案不是一次性完成的大爆炸重构，而是可以分阶段、增量式地实施，风险可控。





