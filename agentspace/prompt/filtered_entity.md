# Filtered Entity

## Prompt
用户可以提供一个 filter 来从已有的 Entity 中定义出一个子集entity。
这个功能主要由 src/storage 这个包实现，接下来你来帮我实现这个功能。

你的具体任务：
1. 详细阅读 src 下的原文件，理解整个项目。
2. 设计表达 filtered entity 的字段，在 src/shared/entity/Entity.ts 中修改 Entity 的定义。增加表达 filtered entity 的两个字段，一个用来表达从哪个 entity 中 filter，另一个表示 filter 条件。filter 应该使用 storage 中的 matchExp 来表达。当用户填了这个字段时就表示当前是 filtered entity。
3. 在 src/storage 中增加处理 filtered entity 的方法。对于 filtered entity，不要创建新实体表，而是在 source entity 上加上一个 json 数组来表示某条记录是否属于某个 filtered entity。
4. 在增删改的代码中，如果操作的是有 filtered entity，就要重新检验是否 filtered entity，并更新标记字段。检验的方法是：对于新增和修改操作，你可以在新增和修改之后拿 filter 的条件加上有变化的 record id 重新 select 一下，如果 select 有记录，就说明是相应的 filtered entity 了。对于删除的记录就不用重新校验了。
5. 我们的 src/storage 包在增删改中都最后返回实体变化的事件，当发现操作涉及到 filtered entity 时，也要新增相应的事件。特别注意的是，修改是否属于某个 filtered entity 的 update 操作，就不要事件了，这属于内部操作。
6. 在 tests/storage 下新增一个文件，写出完整的测试用例，并保证 `npm test` 全部通过。
7. 完成之后，把重要的概念、实现等总结一下，写在下面的章节中。

## document

### Filtered Entity 概念和实现

Filtered Entity 是一个虚拟实体概念，它允许用户从已有的源实体中定义出一个子集，而不需要创建新的数据表。

#### 核心概念

1. **源实体 (Source Entity)**: 被过滤的原始实体
2. **过滤条件 (Filter Condition)**: 使用 MatchExp 表达的过滤逻辑
3. **标记字段 (__filtered_entities)**: 源实体表中的 JSON 字段，记录该记录属于哪些 filtered entities

#### 实现要点

##### 1. Entity 定义扩展
在 `src/shared/entity/Entity.ts` 中为 Entity 类型添加了两个可选字段：
- `sourceEntity`: string 类型，指定源实体名称
- `filterCondition`: object 类型，存储 MatchExp 格式的过滤条件

当这两个字段都存在时，该 Entity 被视为 filtered entity。

##### 2. Storage 层实现
在 `src/storage/erstorage/EntityQueryHandle.ts` 中实现了：
- `isFilteredEntity()`: 检查给定实体是否为 filtered entity
- `getFilteredEntityConfig()`: 获取 filtered entity 的配置信息
- `getFilteredEntitiesForSource()`: 获取基于某个源实体的所有 filtered entities
- `findForFilteredEntity()`: 处理 filtered entity 的查询，重定向到源实体并添加过滤条件

在 `src/storage/erstorage/RecordQueryAgent.ts` 中实现了：
- `updateFilteredEntityFlags()`: 更新记录的 filtered entity 标记
- `getFilteredEntitiesForSource()`: 获取基于源实体的 filtered entities

##### 3. 事件系统集成
在增删改操作中集成了 filtered entity 处理：
- **创建**: 检查新记录是否满足任何 filtered entity 条件，生成相应的 create 事件
- **更新**: 检查更新后的记录是否仍属于 filtered entity，生成 create/delete 事件
- **删除**: 清理相关的 filtered entity 标记

##### 4. 数据存储机制
不为 filtered entity 创建新表，而是在源实体表中添加 `__filtered_entities` JSON 字段：
```json
{
  "FilteredEntityName1": true,
  "FilteredEntityName2": false
}
```

##### 5. 查询重定向
当查询 filtered entity 时：
1. 解析过滤条件和源实体
2. 将查询重定向到源实体
3. 添加过滤条件和标记字段条件
4. 返回符合条件的记录

#### 优势

1. **性能优化**: 无需创建额外的表，减少数据冗余
2. **实时性**: 通过事件系统保证 filtered entity 的实时更新
3. **灵活性**: 支持复杂的过滤条件，可以随时修改过滤逻辑
4. **一致性**: 与现有的响应式系统完全集成

#### 使用示例

```javascript
// 定义源实体
const User = Entity.create({
    name: 'User',
    properties: [
        { name: 'age', type: 'number' },
        { name: 'isActive', type: 'boolean' }
    ]
});

// 定义 filtered entity
const ActiveUsers = Entity.create({
    name: 'ActiveUsers',
    sourceEntity: 'User',
    filterCondition: MatchExp.atom({
        key: 'isActive',
        value: ['=', true]
    }).data
});

// 查询 filtered entity
const activeUsers = await entityQueryHandle.findForFilteredEntity('ActiveUsers');
```

这样的设计使得 Filtered Entity 功能既高效又易用，完美融入了现有的响应式框架架构。


