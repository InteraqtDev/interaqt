# Filtered Relation

我们的系统已经支持了 filtered entity 这个 feature，你现在要开始实现 filtered relation 这个 feature。
具体步骤：
1. 仔细阅读 `src/storage` 中的 filtered entity 的实现，理解原理。总结为了实现 filtered entity，具体完成的工作，作为之后实现 filtered relation 的参考。注意，你要在阅读时应该理解 `src/storage` 在处理 relation 部分功能时，也当做是一种 entity 来处理。
2. 从 `src/shared` 中开始支持 filtered relation，注意应该使用 `sourceRelation` 和 `matchExpression` 这两个参数名。filtered relation 在创建的时候不能再指定 `source`/`target`/`sourceProperty`/`targetProperty`，这些属性和 `sourceRelation` 完全一致。
3. 在 `src/storage` 中开始支持 filtered relation 这个 feature。
4. 在 `tests/storage` 下新增 filtered relation 的相关测试案例，使用 `npm run test:storage` 运行测试用例，并保证通过。
5. 实现完成之后使用 `npm test` 保证原本的所有测试用例都通过。

特别注意，在 `src/storage` 中，relation 也是一种 entity，因此 filtered relation 所需要的能力应该在 filtered entity 时已经被实现了。你不应该新增太多复杂的代码来实现 filtered relation。