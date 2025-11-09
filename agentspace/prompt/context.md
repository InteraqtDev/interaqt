当前项目是一个后端响应式数据框架。它的核心组成：
- `src/shared` 定义各种基础的数据结构，例如 Entity/Relation/Property。
- `src/storage` 核心的 ORM 工具。提供一些高级特性：merged entity/filtered entity。超长表名/字段名自动缩短。提供操作中的所数据变化作为事件抛出等。
- `src/runtime` 框架的响应式核心。提供了常见的 Entity/Relation/Property computation，例如 Count/Transform/Statemachin 等。框架根据 computation 的定义和数据变化的事件来决定如何进行响应式计算。

项目包含完整的测试。所有报的测试都在 `tests` 目录下。