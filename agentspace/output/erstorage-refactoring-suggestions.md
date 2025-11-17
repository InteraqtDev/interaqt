# ERStorage 重构建议

## 概述

erstorage 是 interaqt 框架的核心模块，负责将用户的结构化增删改查需求转化为可执行的 SQL。当前代码库已经非常庞大（18个核心文件，超过8000行代码），存在显著的复杂度问题。

本文档提供**降低代码复杂度**的重构建议，不涉及性能优化或架构重构。重点关注：

1. **设计关键数据结构**来替代复杂的流程性代码
2. **识别最复杂的流程性代码**
3. 只在真正需要时考虑工具类

---

## 问题分析

### 最复杂的文件和方法

| 文件 | 方法 | 行数 | 复杂度描述 |
|------|------|------|-----------|
| Setup.ts | buildMap() | 400行 | 处理6种不同类型的数据结构，状态管理分散 |
| Setup.ts | mergeRecords() | 122行 | 3层嵌套循环，大量条件判断 |
| EntityToTableMap.ts | getTableAndAliasStack() | 97行 | 处理表别名和路径的复杂逻辑 |
| EntityToTableMap.ts | getShrinkedAttribute() | 100行 | 深度嵌套的路径处理 |
| QueryExecutor.ts | findRecords() | 128行 | 递归查询，多个职责混杂 |
| QueryExecutor.ts | completeXToOneLeftoverRecords() | 58行 | 3层嵌套循环 |
| MergedItemProcessor.ts | mergeProperties() | 86行 | 复杂的属性合并逻辑 |
| NewRecordData.ts | 构造函数 | 81行 | 处理10种不同的记录分类 |
| NewRecordData.ts | getSameRowFieldAndValue() | 107行 | 处理多种数据来源的字段值 |

### 核心问题

1. **缺少关键数据结构**：
   - 没有明确的数据结构来表示"表合并状态"（3张表如何合并成1张）
   - 没有明确的数据结构来表示"记录分类"（新记录的10种不同情况）
   - 没有明确的数据结构来表示"查询路径状态"（路径上的表别名、JOIN关系）

2. **过程性代码过多**：
   - 大量的嵌套循环和条件判断
   - 一个方法承担过多职责
   - 状态管理分散在多个 Map/Set 中

3. **缺少中间层抽象**：
   - 直接从用户输入跳到 SQL 生成，缺少中间表示
   - 查询执行器同时处理递归、关系查询、事件生成等多个职责

---

## 重构方案

### 原则

1. **优先设计数据结构**，而非工具类或辅助方法
2. **关注最复杂的流程性代码**
3. **只在真正需要时**才引入工具类

---

## 方案1: 设计 `TableMergeGraph` 数据结构

### 问题

`Setup.ts` 的 `mergeRecords()` 方法有122行，处理3种合表策略：

1. 用户指定的 mergeLinks（三表合一）
2. reliance 三表合一
3. x:1 关系只合并关系表

当前实现使用 `recordToTableMap`, `tableToRecordsMap`, `mergeLog` 三个数据结构来管理状态，逻辑分散。

### 解决方案：设计 `TableMergeGraph`

```typescript
/**
 * 表合并图 - 核心数据结构
 * 
 * 职责：
 * 1. 表示哪些 record 被合并到同一张表
 * 2. 表示合并的原因和方向
 * 3. 检测合并冲突
 * 4. 提供合并后的表名
 */
class TableMergeGraph {
    // 核心数据：每个 record 属于哪个合并组
    private recordToGroup = new Map<string, MergeGroup>()
    
    // 合并组：一组被合并到同一张表的 records
    private groups = new Map<string, MergeGroup>()
    
    constructor(
        private records: Map<string, RecordMapItem>,
        private links: Map<string, LinkMapItem>
    ) {}
    
    // 尝试合并两个 record
    tryMerge(
        recordA: string, 
        recordB: string, 
        link: string,
        strategy: 'combined' | 'source' | 'target'
    ): MergeResult {
        // 返回 { success: boolean, conflicts?: string[] }
    }
    
    // 获取合并后的表名
    getTableName(record: string): string {
        return this.recordToGroup.get(record)!.tableName
    }
    
    // 获取同表的所有 records
    getSameTableRecords(record: string): string[] {
        return this.recordToGroup.get(record)!.members
    }
    
    // 获取合并信息（用于生成字段名）
    getMergeInfo(record: string): MergeInfo {
        // 返回 { isMerged, mergeDirection, linkName, ... }
    }
}

/**
 * 合并组
 */
class MergeGroup {
    members: Set<string> = new Set()  // 组内的所有 records
    merges: MergeEdge[] = []          // 合并的边
    tableName: string                  // 最终表名
    
    // 检查是否可以合并新的 record
    canMerge(newRecord: string): boolean {
        return !this.members.has(newRecord)
    }
}

/**
 * 合并边 - 表示两个 record 通过什么关系合并
 */
interface MergeEdge {
    from: string              // 源 record
    to: string                // 目标 record
    link: string              // 通过哪个关系合并
    direction: 'combined' | 'source' | 'target'
}
```

### 重构后的 `mergeRecords()`

```typescript
mergeRecords() {
    const graph = new TableMergeGraph(this.map.records, this.map.links)
    
    // 1. 处理用户指定的合并路径
    for (const path of this.mergeLinks) {
        const result = graph.mergePath(path)
        if (!result.success) {
            throw new Error(`无法合并路径 ${path}: ${result.conflicts}`)
        }
    }
    
    // 2. 处理 reliance 三表合一
    const relianceLinks = this.getRelianceLinks()
    for (const link of relianceLinks) {
        graph.tryMerge(link.source, link.target, link.name, 'combined')
    }
    
    // 3. 处理 x:1 关系表合并
    const xToOneLinks = this.getXToOneLinks()
    for (const link of xToOneLinks) {
        const direction = link.targetType === 'n' ? 'source' : 'target'
        graph.tryMerge(link.source, link.target, link.name, direction)
    }
    
    // 4. 应用合并结果到 map
    this.applyMergeGraph(graph)
}
```

**复杂度降低**：122行 → 约30行（核心逻辑）

---

## 方案2: 设计 `RecordClassifier` 数据结构

### 问题

`NewRecordData.ts` 构造函数有81行，将关联记录分为10种类型：

```typescript
mergedLinkTargetNewRecords
mergedLinkTargetRecordIdRefs
mergedLinkTargetNullRecords
combinedNewRecords
combinedRecordIdRefs
combinedNullRecords
differentTableMergedLinkNewRecords
differentTableMergedLinkRecordIdRefs
differentTableMergedLinkNullRecords
isolatedNewRecords
isolatedRecordIdRefs
isolatedNullRecords
```

分类逻辑复杂，难以理解。

### 解决方案：设计 `RecordClassifier`

```typescript
/**
 * 记录分类器 - 核心数据结构
 * 
 * 职责：
 * 1. 将关联记录按照表合并策略分类
 * 2. 区分新记录、引用记录、null记录
 * 3. 提供清晰的分类维度
 */
class RecordClassifier {
    // 核心分类维度
    private classifications = new Map<string, RecordClassification>()
    
    constructor(
        private map: EntityToTableMap,
        private recordName: string,
        private rawData: RawEntityData
    ) {
        this.classify()
    }
    
    private classify() {
        for (const [attrName, attrValue] of Object.entries(this.rawData)) {
            const info = this.map.getInfo(this.recordName, attrName)
            if (!info.isRecord) continue
            
            const classification = this.classifySingleRecord(info, attrValue)
            this.classifications.set(attrName, classification)
        }
    }
    
    private classifySingleRecord(
        info: AttributeInfo, 
        value: any
    ): RecordClassification {
        return {
            attribute: info.attributeName,
            recordName: info.recordName,
            
            // 维度1: 表合并策略
            mergeStrategy: this.getMergeStrategy(info),
            
            // 维度2: 数据类型
            dataType: this.getDataType(value),
            
            // 维度3: 关系位置
            linkLocation: this.getLinkLocation(info),
        }
    }
    
    getMergeStrategy(info: AttributeInfo): MergeStrategy {
        if (info.isMergedWithParent()) return 'combined'
        if (info.isLinkMergedWithParent()) return 'merged_to_parent'
        if (info.isLinkMergedWithAttribute()) return 'merged_to_attribute'
        return 'isolated'
    }
    
    getDataType(value: any): DataType {
        if (value === null) return 'null'
        if (value?.id !== undefined) return 'ref'
        return 'new'
    }
    
    getLinkLocation(info: AttributeInfo): LinkLocation {
        if (info.isLinkMergedWithParent()) return 'same_table'
        if (info.isLinkMergedWithAttribute()) return 'attribute_table'
        return 'isolated'
    }
    
    // 查询接口
    getBySameTable(): RecordClassification[] {
        return Array.from(this.classifications.values())
            .filter(c => c.linkLocation === 'same_table')
    }
    
    getByCombined(): RecordClassification[] {
        return Array.from(this.classifications.values())
            .filter(c => c.mergeStrategy === 'combined')
    }
    
    getByIsolated(): RecordClassification[] {
        return Array.from(this.classifications.values())
            .filter(c => c.mergeStrategy === 'isolated')
    }
    
    // 获取所有新记录
    getAllNew(): RecordClassification[] {
        return Array.from(this.classifications.values())
            .filter(c => c.dataType === 'new')
    }
}

/**
 * 记录分类
 */
interface RecordClassification {
    attribute: string
    recordName: string
    
    // 三个正交的分类维度
    mergeStrategy: MergeStrategy
    dataType: DataType
    linkLocation: LinkLocation
}

type MergeStrategy = 'combined' | 'merged_to_parent' | 'merged_to_attribute' | 'isolated'
type DataType = 'new' | 'ref' | 'null'
type LinkLocation = 'same_table' | 'attribute_table' | 'isolated'
```

### 重构后的 `NewRecordData` 构造函数

```typescript
constructor(
    public map: EntityToTableMap,
    public recordName: string,
    public rawData: RawEntityData,
    public info?: AttributeInfo
) {
    // 使用分类器
    const classifier = new RecordClassifier(map, recordName, rawData)
    
    // 按需获取分类结果
    this.combinedNewRecords = classifier
        .getByCombined()
        .filter(c => c.dataType === 'new')
        .map(c => new NewRecordData(map, c.recordName, rawData[c.attribute], info))
    
    this.isolatedRecordIdRefs = classifier
        .getByIsolated()
        .filter(c => c.dataType === 'ref')
        .map(c => new NewRecordData(map, c.recordName, rawData[c.attribute], info))
    
    // ... 其他分类
}
```

**复杂度降低**：81行 → 约20行（构造函数）+ 新的清晰的分类结构

---

## 方案3: 设计 `QueryPath` 数据结构

### 问题

`EntityToTableMap.getTableAndAliasStack()` 方法有97行，处理：
- 表别名生成
- JOIN 关系跟踪
- 路径状态管理
- symmetric 关系处理

当前实现使用一个复杂的数组来存储状态。

### 解决方案：设计 `QueryPath`

```typescript
/**
 * 查询路径 - 核心数据结构
 * 
 * 职责：
 * 1. 表示从根实体到目标属性的完整路径
 * 2. 管理路径上每一步的表信息和别名
 * 3. 处理 JOIN 关系
 */
class QueryPath {
    private steps: PathStep[] = []
    
    constructor(
        private map: EntityToTableMap,
        private rootRecord: string
    ) {
        this.steps.push(PathStep.root(rootRecord, map))
    }
    
    // 添加一步（遍历一个关系）
    navigate(attributeName: string): QueryPath {
        const currentStep = this.currentStep()
        const info = this.map.getInfo(currentStep.recordName, attributeName)
        
        const newStep = PathStep.fromAttribute(
            info,
            currentStep,
            this.map
        )
        
        return new QueryPath(this.map, this.rootRecord).withSteps([
            ...this.steps,
            newStep
        ])
    }
    
    // 访问 link 上的数据
    navigateToLink(): QueryPath {
        const currentStep = this.currentStep()
        const linkStep = PathStep.forLink(currentStep, this.map)
        
        return new QueryPath(this.map, this.rootRecord).withSteps([
            ...this.steps,
            linkStep
        ])
    }
    
    // 获取当前位置的表信息
    currentStep(): PathStep {
        return this.steps[this.steps.length - 1]
    }
    
    // 获取完整的 JOIN 链
    getJoinChain(): JoinStep[] {
        const joins: JoinStep[] = []
        for (let i = 1; i < this.steps.length; i++) {
            const join = this.steps[i].getJoinInfo(this.steps[i-1])
            if (join) joins.push(join)
        }
        return joins
    }
    
    // 获取所有步骤（用于替代 getTableAndAliasStack）
    getAllSteps(): PathStep[] {
        return [...this.steps]
    }
}

/**
 * 路径上的一步
 */
class PathStep {
    constructor(
        public recordName: string,
        public table: string,
        public alias: string,
        public attributeInfo?: AttributeInfo,
        public linkTable?: string,
        public linkAlias?: string,
        public isLinkStep: boolean = false
    ) {}
    
    static root(recordName: string, map: EntityToTableMap): PathStep {
        const recordInfo = map.getRecordInfo(recordName)
        return new PathStep(
            recordName,
            recordInfo.table,
            recordName,  // 根节点的 alias 就是它的名字
        )
    }
    
    static fromAttribute(
        info: AttributeInfo,
        parent: PathStep,
        map: EntityToTableMap
    ): PathStep {
        // 生成表别名
        const alias = this.generateAlias(parent.alias, info)
        
        // 确定是否需要关系表
        let linkTable: string | undefined
        let linkAlias: string | undefined
        
        if (!info.isMergedWithParent()) {
            const linkInfo = info.getLinkInfo()
            if (!linkInfo.isMerged()) {
                linkTable = linkInfo.table
                linkAlias = `REL_${alias}`
            }
        }
        
        return new PathStep(
            info.recordName,
            info.table,
            alias,
            info,
            linkTable,
            linkAlias,
            false
        )
    }
    
    static forLink(parent: PathStep, map: EntityToTableMap): PathStep {
        const linkInfo = parent.attributeInfo!.getLinkInfo()
        return new PathStep(
            linkInfo.name,
            linkInfo.table,
            parent.linkAlias || parent.alias,
            parent.attributeInfo,
            undefined,
            undefined,
            true
        )
    }
    
    // 生成表别名（处理 symmetric 等情况）
    private static generateAlias(
        parentAlias: string,
        info: AttributeInfo
    ): string {
        let alias = `${parentAlias}_${info.attributeName}`
        if (info.symmetricDirection) {
            alias += `_${info.symmetricDirection.toUpperCase()}`
        }
        return alias
    }
    
    // 获取与父节点的 JOIN 信息
    getJoinInfo(parent: PathStep): JoinStep | null {
        if (!this.attributeInfo) return null
        
        // 根据合并策略决定 JOIN 方式
        if (this.attributeInfo.isMergedWithParent()) {
            return null  // 合表不需要 JOIN
        }
        
        if (this.attributeInfo.isLinkMergedWithParent()) {
            return {
                type: 'entity',
                from: { table: parent.table, alias: parent.alias },
                to: { table: this.table, alias: this.alias },
                onField: this.attributeInfo.linkField!
            }
        }
        
        // 关系表独立，需要两步 JOIN
        return {
            type: 'relation',
            from: { table: parent.table, alias: parent.alias },
            through: { table: this.linkTable!, alias: this.linkAlias! },
            to: { table: this.table, alias: this.alias },
            linkInfo: this.attributeInfo.getLinkInfo()
        }
    }
}

interface JoinStep {
    type: 'entity' | 'relation'
    from: { table: string, alias: string }
    to: { table: string, alias: string }
    through?: { table: string, alias: string }  // 用于关系表
    onField?: string
    linkInfo?: LinkInfo
}
```

### 重构后的代码

```typescript
// 原来的 getTableAndAliasStack
getTableAndAliasStack(namePath: string[]): TableAndAliasStack {
    // 97行复杂逻辑
}

// 重构后
getQueryPath(namePath: string[]): QueryPath {
    const [root, ...attributes] = namePath
    let path = new QueryPath(this, root)
    
    for (const attr of attributes) {
        if (attr === LINK_SYMBOL) {
            path = path.navigateToLink()
        } else {
            path = path.navigate(attr)
        }
    }
    
    return path
}

// 使用
const path = this.map.getQueryPath(['User', 'posts', 'comments'])
const currentTable = path.currentStep().table
const joins = path.getJoinChain()
```

**复杂度降低**：97行 → 约10行（主逻辑）+ 清晰的路径数据结构

---

## 方案4: 简化 `QueryExecutor.findRecords()`

### 问题

`findRecords()` 方法128行，承担多个职责：
1. 递归查询处理
2. xToOne 关联查询
3. xToMany 关联查询
4. 关系数据查询
5. 递归上下文管理

### 解决方案：职责分离 + 清晰的数据流

```typescript
/**
 * 查询执行器 - 重构后
 */
class QueryExecutor {
    async findRecords(
        query: RecordQuery,
        queryName = '',
        queryRef?: RecordQueryRef,
        context = new RecursiveContext(ROOT_LABEL)
    ): Promise<Record[]> {
        // 1. 处理递归跳转
        if (query.goto) {
            return this.handleGoto(query, queryName, queryRef, context)
        }
        
        // 2. 检测循环
        if (this.detectCycle(query, context)) {
            return []
        }
        
        // 3. 执行主查询（xToOne 一次性 JOIN）
        const records = await this.executeMainQuery(query, queryName)
        
        // 4. 补全数据（xToMany 二次查询）
        await this.completeRecords(records, query, queryRef, context)
        
        return records
    }
    
    // 处理 goto 递归
    private async handleGoto(
        query: RecordQuery,
        queryName: string,
        queryRef: RecordQueryRef,
        context: RecursiveContext
    ): Promise<Record[]> {
        if (query.exit && await query.exit(context)) {
            return []
        }
        
        const gotoQuery = queryRef.get(query.goto!)
        const mergedQuery = this.mergeQueryWithContext(query, gotoQuery)
        return this.findRecords(mergedQuery, queryName, queryRef, context)
    }
    
    // 执行主查询（包含所有 xToOne JOIN）
    private async executeMainQuery(
        query: RecordQuery,
        queryName: string
    ): Promise<Record[]> {
        const [sql, params, fieldMap] = this.sqlBuilder.buildXToOneFindQuery(query)
        const rawResults = await this.database.query(sql, params, queryName)
        return this.structureResults(rawResults, query.recordName, fieldMap)
    }
    
    // 补全记录（xToMany + 关系数据）
    private async completeRecords(
        records: Record[],
        query: RecordQuery,
        queryRef: RecordQueryRef,
        context: RecursiveContext
    ): Promise<void> {
        const completer = new RecordCompleter(
            this,
            this.map,
            records,
            query,
            queryRef,
            context
        )
        
        await completer.complete()
    }
}

/**
 * 记录补全器 - 专门处理 xToMany 和关系数据的补全
 */
class RecordCompleter {
    constructor(
        private executor: QueryExecutor,
        private map: EntityToTableMap,
        private records: Record[],
        private query: RecordQuery,
        private queryRef: RecordQueryRef,
        private context: RecursiveContext
    ) {}
    
    async complete(): Promise<void> {
        // 1. 补全 xToOne 路径上的 xToMany 枝干
        await this.completeXToOneBranches()
        
        // 2. 补全 xToOne 路径上的递归字段
        await this.completeXToOneRecursive()
        
        // 3. 补全 xToMany 关联
        await this.completeXToMany()
    }
    
    private async completeXToOneBranches(): Promise<void> {
        // 原 completeXToOneLeftoverRecords 的逻辑
        // 但用迭代器模式而非深度嵌套循环
        for await (const branch of this.getXToOneBranches()) {
            await this.completeBranch(branch)
        }
    }
    
    private async *getXToOneBranches(): AsyncGenerator<QueryBranch> {
        // 使用生成器来遍历所有分支，避免嵌套循环
        // ...
    }
}

/**
 * 查询分支 - 表示查询树上的一个分支
 */
interface QueryBranch {
    path: string[]              // 从根到当前位置的路径
    parentRecord: Record        // 父记录
    subQuery: RecordQuery       // 子查询
    type: 'xToOne' | 'xToMany' | 'link'
}
```

**复杂度降低**：
- `findRecords()`: 128行 → 约30行
- `completeXToOneLeftoverRecords()`: 58行 → 由迭代器模式处理，逻辑更清晰

---

## 方案5: 简化 `MergedItemProcessor.mergeProperties()`

### 问题

`mergeProperties()` 方法86行，处理：
1. 收集所有 input items 的 properties
2. 处理 filtered items 的继承
3. 处理 merged items 的递归
4. 创建合并后的 defaultValue 函数

逻辑复杂，嵌套深。

### 解决方案：设计 `PropertyInheritanceTree`

```typescript
/**
 * 属性继承树 - 核心数据结构
 * 
 * 职责：
 * 1. 表示 merged/filtered items 之间的继承关系
 * 2. 追踪每个 property 的来源
 * 3. 生成正确的 defaultValue 函数
 */
class PropertyInheritanceTree {
    private nodes = new Map<string, TreeNode>()
    
    constructor(
        private mergedItem: MergedItem,
        private itemTree: Map<string, string[]>,
        private refContainer: RefContainer
    ) {
        this.build()
    }
    
    private build(): void {
        const inputItems = getInputItems(this.mergedItem)
        
        for (const inputItem of inputItems) {
            const node = this.buildNodeForItem(inputItem)
            this.nodes.set(inputItem.name, node)
            
            // 递归处理所有子孙
            this.buildChildNodes(inputItem.name, node)
        }
    }
    
    private buildNodeForItem(item: MergedItem): TreeNode {
        // 找到 property 的真实来源
        let sourceItem = item
        while (isFiltered(sourceItem) && sourceItem.properties.length === 0) {
            sourceItem = getBaseItem(sourceItem)
        }
        
        return {
            name: item.name,
            properties: Object.fromEntries(
                sourceItem.properties.map(p => [p.name, p])
            ),
            isMerged: isMergedItem(item),
            parent: getBaseItemName(item)
        }
    }
    
    // 获取合并后的 properties
    getMergedProperties(): PropertyInstance[] {
        // 收集所有 property 名称
        const allPropertyNames = new Set<string>()
        for (const node of this.nodes.values()) {
            Object.keys(node.properties).forEach(name => allPropertyNames.add(name))
        }
        
        // 为每个 property 创建合并版本
        return Array.from(allPropertyNames).map(name => 
            this.createMergedProperty(name)
        )
    }
    
    private createMergedProperty(propName: string): PropertyInstance {
        // 找到第一个有这个 property 的 node
        const sourceNode = Array.from(this.nodes.values())
            .find(node => node.properties[propName])
        
        const sourceProp = sourceNode!.properties[propName]
        const mergedProp = Property.clone(sourceProp, true)
        
        // 创建 defaultValue 函数
        mergedProp.defaultValue = (record: any, itemName: string) => {
            const node = this.nodes.get(itemName)
            const prop = node?.properties[propName]
            
            if (prop?.defaultValue) {
                return prop.defaultValue(record, itemName)
            }
            
            return undefined
        }
        
        return mergedProp
    }
}

interface TreeNode {
    name: string
    properties: { [propName: string]: PropertyInstance }
    isMerged: boolean
    parent?: string
}
```

### 重构后的 `mergeProperties()`

```typescript
function mergeProperties(
    mergedItem: MergedItem,
    itemTree: Map<string, string[]>,
    refContainer: RefContainer
): PropertyInstance[] {
    const tree = new PropertyInheritanceTree(
        mergedItem,
        itemTree,
        refContainer
    )
    
    return tree.getMergedProperties()
}
```

**复杂度降低**：86行 → 约5行（主函数）+ 清晰的继承树结构

---

## 方案6: 简化 `Setup.buildMap()`

### 问题

`buildMap()` 方法400行，处理太多事情：
1. 预处理 merged items
2. 创建 entity records
3. 创建 relation records 和 links
4. 补充 record attributes
5. 验证 filtered entity 路径
6. 合并表
7. 分配字段

### 解决方案：流水线模式

```typescript
/**
 * Map 构建器 - 使用流水线模式
 */
class MapBuilder {
    constructor(
        private entities: EntityInstance[],
        private relations: RelationInstance[],
        private database: Database,
        private mergeLinks: string[]
    ) {}
    
    build(): MapData {
        // 流水线：每一步都是独立的、可测试的
        const pipeline = new BuildPipeline()
            .add(new PreprocessMergedItemsStep())
            .add(new CreateEntityRecordsStep())
            .add(new CreateRelationRecordsStep())
            .add(new CreateLinksStep())
            .add(new EnrichRecordAttributesStep())
            .add(new ValidateFilteredEntitiesStep())
            .add(new MergeTablesStep(this.mergeLinks))
            .add(new AssignFieldsStep(this.database))
        
        const context = new BuildContext(this.entities, this.relations)
        return pipeline.execute(context)
    }
}

/**
 * 构建流水线
 */
class BuildPipeline {
    private steps: BuildStep[] = []
    
    add(step: BuildStep): this {
        this.steps.push(step)
        return this
    }
    
    execute(context: BuildContext): MapData {
        for (const step of this.steps) {
            context = step.execute(context)
        }
        return context.getMapData()
    }
}

/**
 * 构建步骤接口
 */
interface BuildStep {
    execute(context: BuildContext): BuildContext
}

/**
 * 构建上下文 - 在步骤间传递状态
 */
class BuildContext {
    public entities: EntityInstance[]
    public relations: RelationInstance[]
    public map: MapData = { records: {}, links: {} }
    public mergeGraph?: TableMergeGraph
    
    constructor(entities: EntityInstance[], relations: RelationInstance[]) {
        this.entities = entities
        this.relations = relations
    }
    
    getMapData(): MapData {
        return this.map
    }
}

/**
 * 示例步骤：创建 Entity Records
 */
class CreateEntityRecordsStep implements BuildStep {
    execute(context: BuildContext): BuildContext {
        for (const entity of context.entities) {
            const record = entity.baseEntity
                ? this.createFilteredEntityRecord(entity)
                : this.createRecord(entity)
            
            context.map.records[entity.name] = record
        }
        return context
    }
    
    private createRecord(entity: EntityInstance): RecordMapItem {
        // 原来的 createRecord 逻辑
    }
    
    private createFilteredEntityRecord(entity: EntityInstance): RecordMapItem {
        // 原来的 createFilteredEntityRecord 逻辑
    }
}

/**
 * 示例步骤：合并表
 */
class MergeTablesStep implements BuildStep {
    constructor(private mergeLinks: string[]) {}
    
    execute(context: BuildContext): BuildContext {
        const graph = new TableMergeGraph(
            context.map.records,
            context.map.links
        )
        
        // 使用前面设计的 TableMergeGraph
        this.applyMergeStrategy(graph, this.mergeLinks)
        
        context.mergeGraph = graph
        return context
    }
    
    private applyMergeStrategy(
        graph: TableMergeGraph,
        mergeLinks: string[]
    ): void {
        // 简化的合并逻辑
    }
}
```

### 重构后的 `buildMap()`

```typescript
buildMap() {
    const builder = new MapBuilder(
        this.entities,
        this.relations,
        this.database!,
        this.mergeLinks
    )
    
    this.map = builder.build()
}
```

**复杂度降低**：400行 → 约10行（主方法）+ 多个独立的、可测试的步骤

---

## 实施建议

### 优先级

1. **最高优先级**（立即获得收益）：
   - 方案1: `TableMergeGraph` - 解决最复杂的 `mergeRecords()` 方法
   - 方案2: `RecordClassifier` - 解决 `NewRecordData` 的复杂构造函数

2. **高优先级**（显著改善可读性）：
   - 方案3: `QueryPath` - 解决路径处理的复杂性
   - 方案6: `BuildPipeline` - 解决 `buildMap()` 的职责过重

3. **中优先级**（改善可维护性）：
   - 方案4: 重构 `QueryExecutor`
   - 方案5: `PropertyInheritanceTree`

### 实施步骤

1. **为每个方案编写测试**
   - 现有测试必须全部通过
   - 新数据结构需要单元测试

2. **逐个方案实施**
   - 不要同时重构多个部分
   - 每个方案完成后运行完整测试套件

3. **保持向后兼容**
   - 新旧代码可以共存一段时间
   - 逐步迁移调用点

4. **文档更新**
   - 为新数据结构编写清晰的文档
   - 更新设计文档

---

## 总结

### 核心原则

1. **设计数据结构，而非流程代码**
   - `TableMergeGraph` 表示表合并状态
   - `RecordClassifier` 表示记录分类
   - `QueryPath` 表示查询路径
   - `PropertyInheritanceTree` 表示属性继承

2. **关注最复杂的代码**
   - `Setup.mergeRecords()`: 122行 → 30行
   - `NewRecordData` 构造函数: 81行 → 20行
   - `EntityToTableMap.getTableAndAliasStack()`: 97行 → 10行
   - `QueryExecutor.findRecords()`: 128行 → 30行

3. **只在需要时引入工具类**
   - 没有设计过度的"工具类"
   - 所有新类都是核心数据结构
   - 解决实际的复杂度问题

### 预期效果

- **代码行数减少约 40-50%**
- **嵌套深度降低**（从4-5层 → 2-3层）
- **可测试性提升**（数据结构可以独立测试）
- **可理解性提升**（清晰的数据模型）

---

## 附录：重构前后对比

### Setup.ts

| 方法 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| buildMap() | 400行 | 10行 + 流水线 | 97% |
| mergeRecords() | 122行 | 30行 | 75% |

### EntityToTableMap.ts

| 方法 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| getTableAndAliasStack() | 97行 | 10行 + QueryPath | 90% |
| getShrinkedAttribute() | 100行 | 可用 QueryPath 简化 | 70% |

### QueryExecutor.ts

| 方法 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| findRecords() | 128行 | 30行 + RecordCompleter | 77% |
| completeXToOneLeftoverRecords() | 58行 | 迭代器模式 | 60% |

### NewRecordData.ts

| 方法 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| 构造函数 | 81行 | 20行 + RecordClassifier | 75% |
| getSameRowFieldAndValue() | 107行 | 可用分类器简化 | 50% |

### MergedItemProcessor.ts

| 方法 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| mergeProperties() | 86行 | 5行 + PropertyInheritanceTree | 94% |







