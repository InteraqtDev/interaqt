测试用例任务：在 tests/runtime/stateMachine.spec.ts 中添加通过 statemachine computation 删除 entity 的测试用例。
步骤：
1. 阅读 src/runtime/ 下的源码。
  1.1. 理解项目和 computation 的概念
  1.2. 理解 statemachine 的实现和使用
2. 阅读 tests/runtime/ 中的测试用例。理解 statemachine 的测试用例写法。
3. 在 tests/runtime/stateMachine.spec.ts 中仿照 statemachine 控制 relation 的例子，添加通过 statemachine computation 创建和删除 entity 的测试用例。
4. 使用 `npm run test:runtime` 确保所有测试用例仍然全部通过。