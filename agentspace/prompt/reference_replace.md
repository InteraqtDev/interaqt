# Reference Replace

## 任务
在我们的框架中，有的地方需要对用户传入的原始 Entity/Relation 进行处理，为了不影响原来的对象，框架中采用 clone 的方式并递归进行替换所有引用的地方。
现在你来帮我在 `src/shared` 中实现一个管理工具，当我要替换某个 Entity/Relation 时，工具能自动替换掉所有相关的引用。

### 步骤

1. 阅读 `src/shared` 下的所有代码，理解原本的对象。理解可能有的引用关系：
  1.1. Relation 中 source/target 字段可以引用 Entity/Relation。
  1.2. Relation 的 baseRelation 可以引用 Relation。
  1.3. Entity 的 baseEntity 可以引用 Entity。
  1.4. Entity 的 inputEntities 可以引用 Entity。
2. 实现一个叫做 RefContainer 的工具类，可以传入所有用户输入的 entities/relations。它提供 `replaceEntity`/`replaceRelation` 这两个方法，允许用户传入新的 entity/relation 和要被替换的原对象。当调用时，会替换掉原来的对象，并递归地替换所有引用了原对象的其他对象，使用 clone 的方式，不修改任何老的对象。工具类还提供 api 让用户可以一次性获取到所有替换好后的 entitys&relations。
3. 在 `tests/shared` 下创建新的测试用例，用来测试工具类。并保证测试用例全部通过。


## 重构任务

现在已经完成了 RefContainer 工具了，但功能需要重构：
1. 需要在 replaceEntity/replaceRelation 时直接计算，不要等到 getAll 的时候才计算。
2. 需要提供 `getEntityByName` 接口，获取计算后的 entity。

### 步骤：
1. 阅读 `src/shared` 下 RefContainer 相关的代码，理解现有实现。
2. 阅读 `tests/shared` 下 RefContainer 相关测试用例，了解如何使用，如何编写测试用例。
3. 按照要求重构代码。
4. 补充测试用例。使用 `npm run test:shared` 运行所有测试用例，确保全部通过。