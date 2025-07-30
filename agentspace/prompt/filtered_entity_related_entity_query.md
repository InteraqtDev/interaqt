# Filtered Entity By Related Entity

## 背景
我们的系统中提供一个 filter 功能，让用从已有的 Entity 中定义出一个子集entity。但是目前这个功能有个明显的限制，就是无法使用关联实体、或者关系上的字段来进行 filter。接下来你来帮我进行改造，实现这个 filter。

## 任务
1. 详细阅读 src 下的源文件，理解整个项目。
2. 详细阅读 src/storage 下的源文件，详细理解 filtered entity 的实现原理。
3. 开始实现支持使用关联实体、关联关系上的字段进行 filter。
  3.1. 建立一个数据结构，记录 source entity 和 filtered entity 之间的关系，以供后续查找使用。
  3.2. 在 entity delete/update/create 之后，进行判断，如果 entity 是某个 filtered entity 的 source entity，那么就要找到所有受影响的 filtered entity record，更新它们的标记。
  3.3. 特别注意，你不需要构建查询、生成 sql 代码等能力，找到受影响的 filtered entity record所需要的基础能力，在 `src/storage` 已经都有了。
  3.4. 特别注意，在我们的系统中，filtered entity 查询的路径上，不支持 'x:n' 的关系。因为出于性能考虑，我们已经要求用户如果有对 'x:n' 关系的依赖，都要显式声明成一个新的字段，断开直接联系。
4. 在 `tests/storage` 下添加新的测试用例，来测试新增的功能。并通过 `npm run test:storage` 来运行测试用例。不断修复代码，直到测试用例全部通过。注意一定要保证所有测试用例通过，才说明没有破坏之前的功能，因为开始当前任务之前，所有测试用例是通过的。

