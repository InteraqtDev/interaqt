# Filtered Entity VIEW 实现计划

## 目标

通过数据库 VIEW 重新实现 Filtered Entity 功能，替代现有的特殊业务逻辑。

## 当前进度

**注意，一定要完整完成 phase，才可以进入下一个 phase**

- ✅ **Phase 1 完成**：VIEW 创建与基础映射（Setup.ts, SQLBuilder.ts）
  - 已实现 filtered entity 识别和 RecordMapItem 创建
  - 已实现 VIEW SQL 生成（重构到 SQLBuilder，复用现有能力）
  - 已实现按依赖顺序创建 VIEWs
  - 代码质量优化：消除重复，提高可维护性

- 🚧 **Phase 2 进行中**：查询支持（核心功能已完成 85%+）
  - ✅ 01-direct-query.spec.ts: 6/6 通过
  - ✅ 02-query-via-relation.spec.ts: 3/4 通过
  - ✅ 04-fetch-related-entities.spec.ts: 3/5 通过
  - ✅ 已实现 VIEW 的跨实体 JOIN 支持
  - ✅ 已实现 filtered entity 继承 base entity 的 relations
  - ✅ 已修复 getReverseAttribute 处理 filtered entity 的逻辑
  - ⚠️ 剩余边缘情况（3个失败测试）：
    - cross-entity conditions 中的复杂 JOIN
    - relation filter 条件应用
    - x:1 relation 查询

## 实施步骤

### Phase 1: VIEW 创建与基础映射 (Setup.ts, SQLBuilder.ts) ✅

#### 1.1 扩展 buildMap 方法 ✅
- [x] 识别 filtered entities (baseEntity 不为空的 Entity)
- [x] 为每个 filtered entity 创建 RecordMapItem，标记 `isFilteredEntity: true`
- [x] 存储 baseEntity 引用和 matchExpression
- [x] 解析 matchExpression 中的跨实体路径（x:1 关系）- 使用 MatchExp
- [x] 为 filtered entity 生成 VIEW 名称（格式：`VIEW_{entityName}`）
- [x] 跳过 filtered entities 的合表逻辑

#### 1.2 创建 VIEW SQL 生成 (重构到 SQLBuilder) ✅
- [x] 在 SQLBuilder 中添加 buildCreateViewSQL 方法
- [x] VIEW 的 SELECT 从 base entity 的表（或 VIEW）
- [x] 将 matchExpression 转换为 WHERE 子句（复用 buildWhereClause）
- [x] 实现参数内联逻辑（inlineParamsForView）
- [x] 处理嵌套 filtered entity (base entity 也是 filtered entity)
- [x] 支持 PostgreSQL 和 MySQL/SQLite 占位符格式

#### 1.3 修改 createTables 方法 ✅
- [x] 在创建表后创建 VIEWs
- [x] 按依赖顺序创建 VIEWs（处理嵌套 filtered entities）
- [x] 添加 VIEW 创建错误处理
- [x] 使用 CREATE OR REPLACE VIEW

### Phase 2: 查询支持 (QueryExecutor.ts, SQLBuilder.ts)

#### 2.1 识别 Filtered Entity 查询
- [ ] 在 EntityQueryHandle.find/findOne 中检测 filtered entity
- [ ] 路由到正确的查询逻辑

#### 2.2 修改 SQLBuilder.buildXToOneFindQuery
- [ ] 对 filtered entity，使用 VIEW 名称而不是表名
- [ ] 处理 filtered entity 的 JOIN（VIEW 作为表）
- [ ] 确保 alias 正确生成

#### 2.3 修改 SQLBuilder.buildFindQuery
- [ ] 支持从 VIEW 查询
- [ ] 处理 filtered entity 的额外查询条件

#### 2.4 测试点
- [ ] 运行测试：01-direct-query.spec.ts
- [ ] 运行测试：02-query-via-relation.spec.ts
- [ ] 运行测试：04-fetch-related-entities.spec.ts

### Phase 3: 创建与验证 (CreationExecutor.ts, EntityQueryHandle.ts)

#### 3.1 禁止直接创建 Filtered Entity
- [ ] 在 EntityQueryHandle.create 中检测 filtered entity
- [ ] 抛出错误：filtered entity 不能直接创建

#### 3.2 关系验证机制
- [ ] 创建 validateFilteredEntityMembership 方法
- [ ] 在 addLink 时验证 target 是否在 filtered VIEW 中
- [ ] 验证逻辑：SELECT COUNT(*) FROM {view} WHERE id = ?

#### 3.3 连带创建验证
- [ ] 在 handleCreationReliance 中检测 filtered entity
- [ ] 创建 base entity 后验证是否符合 filter
- [ ] 不符合则抛出错误并回滚

#### 3.4 测试点
- [ ] 运行测试：03-create-via-relation.spec.ts
- [ ] 运行测试：05-create-with-related.spec.ts

### Phase 4: 更新与删除传播 (UpdateExecutor.ts, DeletionExecutor.ts)

#### 4.1 更新后的关系验证
- [ ] 在 UpdateExecutor.updateRecord 后检查受影响的 filtered entities
- [ ] 查询所有引用该实体的 filtered entity 关系
- [ ] 验证每个关系是否仍然有效
- [ ] 删除失效的关系

#### 4.2 删除传播
- [ ] 在 DeletionExecutor.deleteRecord 中检测 filtered entity 引用
- [ ] 自动删除所有相关的 filtered entity 关系
- [ ] 处理级联删除（reliance relations）

#### 4.3 创建 FilteredEntityPropagator 类
- [ ] propagateUpdate(entityName, recordIds): 检查并删除失效关系
- [ ] propagateDelete(entityName, recordIds): 删除所有相关关系
- [ ] findAffectedFilteredEntityRelations(entityName, recordIds): 查找受影响的关系

#### 4.4 测试点
- [ ] 运行测试：06-recursive-propagation.spec.ts

### Phase 5: Relation 作为 Base Entity (Setup.ts, QueryExecutor.ts)

#### 5.1 支持 Relation 作为 Base
- [ ] 在 buildMap 中检测 baseEntity 是 Relation
- [ ] 为 relation-based filtered entity 创建 VIEW
- [ ] VIEW 从 relation 表查询
- [ ] 支持 source/target 的跨实体条件

#### 5.2 Relation Filtered Entity 的查询
- [ ] 修改 SQLBuilder 支持 relation VIEW
- [ ] 处理 source/target 属性的查询
- [ ] 处理关系属性的过滤

#### 5.3 测试点
- [ ] 运行测试：07-relation-as-base.spec.ts

### Phase 6: 嵌套 Filtered Entity (Setup.ts, QueryExecutor.ts)

#### 6.1 检测嵌套依赖
- [ ] 在 buildMap 中识别 base entity 也是 filtered entity
- [ ] 构建 filtered entity 依赖图
- [ ] 拓扑排序确定 VIEW 创建顺序

#### 6.2 嵌套 VIEW 创建
- [ ] 嵌套 filtered VIEW 引用 base filtered VIEW
- [ ] 合并 matchExpression（AND 逻辑）
- [ ] 测试多层嵌套（2-3 层）

#### 6.3 嵌套传播
- [ ] 更新 FilteredEntityPropagator 处理嵌套
- [ ] 从根向叶传播变化
- [ ] 递归检查所有层级的关系

#### 6.4 测试点
- [ ] 运行测试：06-recursive-propagation.spec.ts (嵌套场景)

### Phase 7: 清理与优化

#### 7.1 清理旧代码
- [ ] 删除 FilteredEntityManager.ts 中的旧逻辑
- [ ] 删除 MergedItemProcessor.ts 中的 filtered entity 处理
- [ ] 清理 EntityToTableMap.ts 中的旧 filtered entity 标记

#### 7.2 文档更新
- [ ] 更新 README.md 说明 VIEW 实现
- [ ] 添加 VIEW SQL 示例
- [ ] 文档化限制和注意事项

#### 7.3 性能优化
- [ ] 添加 VIEW 的索引建议
- [ ] 考虑 MATERIALIZED VIEW（如果数据库支持）
- [ ] 优化复杂 matchExpression 的 SQL

### Phase 8: 完整测试

#### 8.1 运行所有测试
- [ ] npm run test:storage -- tests/storage/filteredEntity
- [ ] npm run test:storage（确保不破坏其他功能）

#### 8.2 边界情况测试
- [ ] 空结果集
- [ ] 循环依赖检测
- [ ] 大量数据性能
- [ ] 并发更新场景

#### 8.3 集成测试
- [ ] 与 merged entity 混合使用
- [ ] 与 reliance relations 混合使用
- [ ] 复杂的业务场景

## 实施顺序

严格按照 Phase 1 -> Phase 2 -> ... -> Phase 8 的顺序执行。每个 Phase 完成后：

1. 运行对应的测试用例
2. 确保测试通过
3. 运行 `npm run test:storage` 确保不破坏现有功能
4. 提交代码

## 关键文件

已修改的文件：

1. ✅ `src/storage/erstorage/Setup.ts` - VIEW 创建与依赖排序
2. ✅ `src/storage/erstorage/SQLBuilder.ts` - VIEW SQL 生成（新增 buildCreateViewSQL 等方法）

待修改的文件：

3. `src/storage/erstorage/EntityToTableMap.ts` - 映射扩展（如需）
4. `src/storage/erstorage/QueryExecutor.ts` - 查询执行
5. `src/storage/erstorage/CreationExecutor.ts` - 创建验证
6. `src/storage/erstorage/UpdateExecutor.ts` - 更新传播
7. `src/storage/erstorage/DeletionExecutor.ts` - 删除传播
8. `src/storage/erstorage/EntityQueryHandle.ts` - 入口验证

新增文件（待创建）：

1. `src/storage/erstorage/FilteredEntityPropagator.ts` - 变化传播逻辑

## 注意事项

1. **不破坏现有功能**：每次修改后运行完整测试套件
2. **VIEW 性能**：注意复杂 matchExpression 的性能
3. **错误处理**：提供清晰的错误信息
4. **事务一致性**：确保验证和创建在同一事务中
5. **递归处理**：小心处理嵌套和循环依赖

## 已完成的重构优化

### 代码质量改进
- ✅ 将 VIEW SQL 生成逻辑统一到 SQLBuilder.ts
- ✅ 复用 buildWhereClause 方法处理条件表达式
- ✅ 删除 Setup.ts 中约 130 行重复的 SQL 拼接代码
- ✅ 实现参数内联逻辑支持 PostgreSQL ($1) 和 MySQL/SQLite (?) 两种占位符
- ✅ 使用 CREATE OR REPLACE VIEW 避免重复创建错误

### 架构改进
- ✅ 更好的职责分离：SQLBuilder 负责所有 SQL 生成，Setup 负责表结构映射
- ✅ 提高可维护性：VIEW 创建和查询使用相同的 WHERE 子句构建逻辑
- ✅ 代码复用：参数内联逻辑集中在 SQLBuilder 中

