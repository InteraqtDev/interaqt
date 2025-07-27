# Filtered Entity 跨实体查询实现方案

## 概述

本文档提供了一个详细的技术方案，使 filtered entity 的 `filterCondition` 能够支持基于关联实体字段的过滤。该方案涵盖了需要修改的核心组件、新增的类和接口、以及实现的具体步骤。

## 目标与范围

### 支持的功能
1. 支持通过点号语法访问关联实体字段：`user.department.name`
2. 支持多层关联：`user.department.manager.role`
3. 支持各种关系类型：1:1、1:n、n:1、n:n
4. 自动维护跨实体的 filtered entity 标记
5. 关联实体变化时自动传播事件

### 限制范围
1. 最多支持 3 层关联（可配置）
2. 不支持循环引用
3. 不支持聚合函数（COUNT、SUM 等）

## 核心设计思路

### 1. 扩展 MatchExp 支持关联路径

```typescript
// 新的 MatchExp 原子表达式格式
{
  key: 'department.name',        // 支持点号路径
  value: ['=', 'Technology'],
  type: 'cross-entity'          // 标识为跨实体查询
}
```

### 2. 查询重写机制

将跨实体的 MatchExp 转换为包含 JOIN 的 SQL 查询。

### 3. 双向关系追踪

建立反向索引，当关联实体更新时能快速找到受影响的源实体。

### 4. 级联事件系统

实现跨实体的事件传播机制。

## 需要修改的类

### 1. MatchExp 类扩展

**文件**: `src/storage/erstorage/MatchExp.ts`

```typescript
export class MatchExp {
  // 新增方法：解析关联路径
  static parseRelationPath(path: string): RelationPath {
    const parts = path.split('.');
    return {
      segments: parts,
      isRelationPath: parts.length > 1
    };
  }

  // 新增方法：检测是否包含跨实体查询
  hasCrossEntityQuery(): boolean {
    return this.detectCrossEntityQueries(this.data);
  }

  // 新增方法：提取所有跨实体路径
  extractCrossEntityPaths(): string[] {
    const paths: string[] = [];
    this.walkExpression(this.data, (atom) => {
      if (atom.key && atom.key.includes('.')) {
        paths.push(atom.key);
      }
    });
    return paths;
  }
}

interface RelationPath {
  segments: string[];
  isRelationPath: boolean;
}
```

### 2. RecordQuery 类增强

**文件**: `src/storage/erstorage/RecordQuery.ts`

```typescript
export class RecordQuery {
  // 新增属性
  relationJoins?: RelationJoin[];
  
  // 新增方法：添加关联查询
  addRelationJoin(join: RelationJoin): void {
    if (!this.relationJoins) {
      this.relationJoins = [];
    }
    this.relationJoins.push(join);
  }
}

interface RelationJoin {
  relationName: string;
  sourceAlias: string;
  targetAlias: string;
  joinType: 'INNER' | 'LEFT';
  targetEntity: string;
}
```

### 3. RecordQueryAgent 增强

**文件**: `src/storage/erstorage/RecordQueryAgent.ts`

```typescript
export class RecordQueryAgent {
  // 新增：关系反向索引
  private relationReverseIndex: Map<string, Set<RelationReference>>;

  // 修改：增强 findRecords 支持 JOIN
  async findRecords(query: RecordQuery, reason: string): Promise<Record[]> {
    if (query.relationJoins && query.relationJoins.length > 0) {
      return this.findRecordsWithJoins(query, reason);
    }
    // 原有逻辑...
  }

  // 新增：带 JOIN 的查询实现
  private async findRecordsWithJoins(query: RecordQuery, reason: string): Promise<Record[]> {
    const sql = this.buildJoinSQL(query);
    const results = await this.database.query(sql);
    return this.mapJoinResults(results, query);
  }

  // 新增：构建 JOIN SQL
  private buildJoinSQL(query: RecordQuery): string {
    // 实现 JOIN SQL 生成逻辑
  }

  // 修改：增强 updateFilteredEntityFlags 支持跨实体
  async updateFilteredEntityFlags(
    entityName: string, 
    recordId: string, 
    events?: RecordMutationEvent[],
    originalRecord?: Record,
    isCreation?: boolean,
    cascadeFrom?: CascadeInfo  // 新增参数
  ) {
    // 增强逻辑以支持跨实体条件检查
  }

  // 新增：处理关联实体更新的级联
  async handleRelatedEntityUpdate(
    entityName: string,
    recordId: string,
    updatedFields: string[]
  ): Promise<void> {
    const affectedEntities = this.findAffectedFilteredEntities(
      entityName, 
      updatedFields
    );
    
    for (const affected of affectedEntities) {
      await this.cascadeUpdateFilteredFlags(affected);
    }
  }
}

interface RelationReference {
  sourceEntity: string;
  relationName: string;
  targetEntity: string;
  filterPath: string;
}

interface CascadeInfo {
  fromEntity: string;
  fromRecordId: string;
  relationPath: string[];
}
```

### 4. EntityQueryHandle 增强

**文件**: `src/storage/erstorage/EntityQueryHandle.ts`

```typescript
export class EntityQueryHandle {
  // 修改：增强 find 方法以处理跨实体查询
  async find(
    entityName: string, 
    matchExpressionData?: MatchExpressionData,
    modifierData?: ModifierData,
    attributeQueryData: AttributeQueryData = []
  ): Promise<Record[]> {
    if (this.isFilteredEntity(entityName)) {
      const config = this.getFilteredEntityConfig(entityName);
      
      // 检查是否包含跨实体查询
      const matchExp = new MatchExp(config.sourceRecordName, this.map, config.filterCondition);
      if (matchExp.hasCrossEntityQuery()) {
        return this.findWithCrossEntityFilter(entityName, config, matchExpressionData, modifierData, attributeQueryData);
      }
      
      // 原有逻辑...
    }
    // 原有逻辑...
  }

  // 新增：处理跨实体过滤的查询
  private async findWithCrossEntityFilter(
    filteredEntityName: string,
    config: FilteredEntityConfig,
    additionalMatch?: MatchExpressionData,
    modifierData?: ModifierData,
    attributeQueryData?: AttributeQueryData
  ): Promise<Record[]> {
    // 实现跨实体查询逻辑
  }
}
```

### 5. DBSetup 增强

**文件**: `src/storage/erstorage/Setup.ts`

```typescript
export class DBSetup {
  // 新增：构建关系索引
  private buildRelationIndices(): void {
    this.relationIndex = new Map();
    this.reverseRelationIndex = new Map();
    
    for (const relation of this.relations) {
      // 构建正向和反向索引
      this.indexRelation(relation);
    }
  }

  // 新增：分析 filtered entity 的跨实体依赖
  private analyzeFilteredEntityDependencies(): void {
    for (const entity of this.entities) {
      if (entity.sourceEntity && entity.filterCondition) {
        const dependencies = this.extractCrossEntityDependencies(
          entity.filterCondition
        );
        this.registerFilteredEntityDependencies(entity.name, dependencies);
      }
    }
  }

  // 修改：增强表创建以支持额外索引
  async createTables(): Promise<void> {
    await super.createTables();
    
    // 创建支持跨实体查询的额外索引
    await this.createCrossEntityIndices();
  }
}
```

## 需要新增的类

### 1. CrossEntityQueryBuilder

**文件**: `src/storage/erstorage/CrossEntityQueryBuilder.ts`

```typescript
export class CrossEntityQueryBuilder {
  constructor(
    private map: EntityToTableMap,
    private database: Database
  ) {}

  // 构建跨实体查询
  buildQuery(
    sourceEntity: string,
    matchExpression: MatchExpressionData,
    attributeQuery: string[]
  ): CrossEntityQuery {
    const paths = this.extractRelationPaths(matchExpression);
    const joins = this.buildJoins(sourceEntity, paths);
    const whereClause = this.buildWhereClause(matchExpression, joins);
    
    return {
      baseEntity: sourceEntity,
      joins,
      whereClause,
      selectAttributes: this.buildSelectClause(sourceEntity, attributeQuery)
    };
  }

  // 解析关系路径
  private extractRelationPaths(match: MatchExpressionData): RelationPath[] {
    // 实现路径提取逻辑
  }

  // 构建 JOIN 信息
  private buildJoins(sourceEntity: string, paths: RelationPath[]): JoinInfo[] {
    // 实现 JOIN 构建逻辑
  }
}

interface CrossEntityQuery {
  baseEntity: string;
  joins: JoinInfo[];
  whereClause: WhereClause;
  selectAttributes: string[];
}

interface JoinInfo {
  fromTable: string;
  fromAlias: string;
  relationTable: string;
  relationAlias: string;
  toTable: string;
  toAlias: string;
  joinConditions: string[];
}
```

### 2. FilteredEntityDependencyManager

**文件**: `src/storage/erstorage/FilteredEntityDependencyManager.ts`

```typescript
export class FilteredEntityDependencyManager {
  private dependencies: Map<string, FilteredEntityDependency>;
  private reverseDependencies: Map<string, Set<string>>;

  // 注册 filtered entity 的依赖
  registerDependency(
    filteredEntityName: string,
    dependency: FilteredEntityDependency
  ): void {
    this.dependencies.set(filteredEntityName, dependency);
    
    // 构建反向索引
    for (const path of dependency.relationPaths) {
      const targetEntity = path.targetEntity;
      if (!this.reverseDependencies.has(targetEntity)) {
        this.reverseDependencies.set(targetEntity, new Set());
      }
      this.reverseDependencies.get(targetEntity)!.add(filteredEntityName);
    }
  }

  // 查找受影响的 filtered entities
  findAffectedFilteredEntities(
    updatedEntity: string,
    updatedFields: string[]
  ): AffectedFilteredEntity[] {
    const affected: AffectedFilteredEntity[] = [];
    const relatedFilteredEntities = this.reverseDependencies.get(updatedEntity) || new Set();
    
    for (const filteredEntityName of relatedFilteredEntities) {
      const dependency = this.dependencies.get(filteredEntityName)!;
      const affectedPaths = this.checkAffectedPaths(
        dependency,
        updatedEntity,
        updatedFields
      );
      
      if (affectedPaths.length > 0) {
        affected.push({
          filteredEntityName,
          sourceEntity: dependency.sourceEntity,
          affectedPaths
        });
      }
    }
    
    return affected;
  }
}

interface FilteredEntityDependency {
  filteredEntityName: string;
  sourceEntity: string;
  relationPaths: DependencyPath[];
}

interface DependencyPath {
  path: string;
  segments: string[];
  targetEntity: string;
  targetFields: string[];
}

interface AffectedFilteredEntity {
  filteredEntityName: string;
  sourceEntity: string;
  affectedPaths: DependencyPath[];
}
```

### 3. CascadeEventManager

**文件**: `src/storage/erstorage/CascadeEventManager.ts`

```typescript
export class CascadeEventManager {
  constructor(
    private queryAgent: RecordQueryAgent,
    private dependencyManager: FilteredEntityDependencyManager
  ) {}

  // 处理实体更新事件
  async handleEntityUpdate(
    entityName: string,
    recordId: string,
    updatedFields: string[],
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 查找需要级联更新的 filtered entities
    const affected = this.dependencyManager.findAffectedFilteredEntities(
      entityName,
      updatedFields
    );

    for (const affectedEntity of affected) {
      await this.cascadeUpdateToSourceEntity(
        affectedEntity,
        entityName,
        recordId,
        events
      );
    }
  }

  // 级联更新到源实体
  private async cascadeUpdateToSourceEntity(
    affected: AffectedFilteredEntity,
    updatedEntity: string,
    updatedRecordId: string,
    events: RecordMutationEvent[]
  ): Promise<void> {
    // 找到所有相关的源实体记录
    const sourceRecords = await this.findRelatedSourceRecords(
      affected,
      updatedEntity,
      updatedRecordId
    );

    // 更新每个源实体记录的 filtered entity 标记
    for (const sourceRecord of sourceRecords) {
      await this.queryAgent.updateFilteredEntityFlags(
        affected.sourceEntity,
        sourceRecord.id,
        events,
        sourceRecord,
        false,
        {
          fromEntity: updatedEntity,
          fromRecordId: updatedRecordId,
          relationPath: affected.affectedPaths[0].segments
        }
      );
    }
  }

  // 查找相关的源实体记录
  private async findRelatedSourceRecords(
    affected: AffectedFilteredEntity,
    updatedEntity: string,
    updatedRecordId: string
  ): Promise<Record[]> {
    // 实现反向查询逻辑
  }
}
```

### 4. CrossEntityFilterEvaluator

**文件**: `src/storage/erstorage/CrossEntityFilterEvaluator.ts`

```typescript
export class CrossEntityFilterEvaluator {
  constructor(
    private queryBuilder: CrossEntityQueryBuilder,
    private database: Database
  ) {}

  // 评估记录是否满足跨实体过滤条件
  async evaluate(
    recordId: string,
    entityName: string,
    filterCondition: MatchExpressionData
  ): Promise<boolean> {
    // 构建针对单条记录的跨实体查询
    const query = this.queryBuilder.buildQuery(
      entityName,
      this.combineWithIdFilter(filterCondition, recordId),
      ['id']
    );

    // 执行查询
    const results = await this.database.query(query);
    return results.length > 0;
  }

  // 批量评估
  async evaluateBatch(
    recordIds: string[],
    entityName: string,
    filterCondition: MatchExpressionData
  ): Promise<Map<string, boolean>> {
    // 实现批量评估逻辑
  }

  private combineWithIdFilter(
    condition: MatchExpressionData,
    recordId: string
  ): MatchExpressionData {
    return new MatchExp(null, null, condition)
      .and({ key: 'id', value: ['=', recordId] })
      .data;
  }
}
```

## 实现步骤

### 第一阶段：基础架构（2周）

1. **扩展 MatchExp**
   - 实现关联路径解析
   - 添加跨实体查询检测
   - 单元测试

2. **实现 CrossEntityQueryBuilder**
   - 基本 JOIN 生成
   - WHERE 子句转换
   - 单元测试

3. **增强 RecordQuery**
   - 添加 JOIN 支持
   - 修改查询执行逻辑

### 第二阶段：查询支持（2周）

1. **实现跨实体查询执行**
   - RecordQueryAgent 的 findRecordsWithJoins
   - 结果映射处理
   - 性能优化

2. **增强 EntityQueryHandle**
   - 识别跨实体 filtered entity
   - 查询重定向逻辑
   - 集成测试

### 第三阶段：事件级联（3周）

1. **实现 FilteredEntityDependencyManager**
   - 依赖分析
   - 反向索引构建
   - 影响分析算法

2. **实现 CascadeEventManager**
   - 事件监听机制
   - 级联更新逻辑
   - 事务处理

3. **增强 updateFilteredEntityFlags**
   - 支持跨实体条件评估
   - 级联标记更新
   - 事件生成

### 第四阶段：优化与完善（2周）

1. **性能优化**
   - 查询缓存
   - 批量处理
   - 索引优化

2. **错误处理**
   - 循环依赖检测
   - 错误恢复
   - 日志记录

3. **完整测试**
   - 单元测试
   - 集成测试
   - 性能测试

## 数据库变更

### 1. 新增索引

```sql
-- 为关系表添加反向查询索引
CREATE INDEX idx_relation_target ON "UserDepartment" (target);
CREATE INDEX idx_relation_source ON "UserDepartment" (source);

-- 为常用过滤字段添加索引
CREATE INDEX idx_department_type ON "Department" (type);
```

### 2. 新增系统表（可选）

```sql
-- 存储 filtered entity 依赖关系
CREATE TABLE "__filtered_entity_dependencies" (
  filtered_entity_name VARCHAR(255),
  source_entity VARCHAR(255),
  dependency_path TEXT,
  target_entity VARCHAR(255),
  target_fields TEXT[],
  PRIMARY KEY (filtered_entity_name, dependency_path)
);
```

## 配置选项

```typescript
interface CrossEntityFilterConfig {
  // 最大关联深度
  maxJoinDepth: number; // 默认 3
  
  // 是否启用查询缓存
  enableQueryCache: boolean; // 默认 true
  
  // 批量更新阈值
  batchUpdateThreshold: number; // 默认 100
  
  // 是否异步处理级联更新
  asyncCascade: boolean; // 默认 false
}
```

## 性能考虑

### 1. 查询优化

- 使用查询计划缓存
- 限制 JOIN 深度
- 优先使用索引字段

### 2. 更新优化

- 批量处理级联更新
- 使用数据库事务
- 避免 N+1 查询

### 3. 内存优化

- 限制依赖图大小
- 定期清理缓存
- 使用弱引用

## 兼容性保证

1. **向后兼容**：不包含跨实体查询的 filtered entity 行为不变
2. **渐进增强**：可以通过配置开关控制是否启用
3. **降级策略**：当跨实体查询失败时，可以回退到原有逻辑

## 测试策略

### 1. 单元测试

- 每个新增类的独立测试
- 修改类的回归测试
- 边界条件测试

### 2. 集成测试

- 端到端的跨实体查询测试
- 级联更新测试
- 性能基准测试

### 3. 压力测试

- 大数据量测试
- 并发更新测试
- 复杂关联测试

## 总结

本方案通过扩展现有架构，新增专门的跨实体查询和级联管理组件，实现了 filtered entity 对跨实体查询的支持。方案保持了与现有系统的兼容性，同时提供了良好的扩展性和性能优化空间。整个实现预计需要 9 周时间，可以分阶段交付，确保系统的稳定性和可靠性。 