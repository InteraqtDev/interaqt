现在系统中的 Dictionary 是 SystemEntity 里的一种类型，你来把它独立出来变成一个独立的 Entity。
步骤：
1. 阅读 `src/runtime` 下面的所有源码，完全掌握框架的实现。
2. 完全掌握 Dictionary 的初始化、获取 Dictionary 数据的 api 实现。
3. 我已经在 `src/runtime/System.ts` 中单独声明了 Dictionary entity。你来完成中其他部分的重构。
  3.1. 在 `src/runtime/MonoSystem.ts` 中 Storage 新增一个 dict property，有 get/set 方法，直接就是获取/设置的 Dictionary 值。不再通过 storage.get/storage.set 来操作，而是 `storage.dict.get` 和 `storage.dict.set` 来操作。
4. 修改 `tests/runtime` 下所有原本使用`storage.get`/`storage.set`来操作 Dictionary 的代码为新的方式。并使用 `npm run test:runtime` 确保所有测试用例正确，才说明重构成功。

