# Filtered Relation Based Computation

我们的系统中已经支持 filtered entity 和 filtered relation。现在开始你来增加基于 filtered relation 的测试用例。具体步骤：

1. 阅读 `src/runtime` 下的源码，完全理解 computation 的概念。
2. 阅读 `tests/storage` 下的测试用例，理解 filtered entity 和 filtered relation 的用法。
3. 阅读 `tests/runtime` 下的测试用例代码。
  3.1. 理解各种类型的 computation 的用法和测试用例写法。
  3.2. 理解 filtered entity 在 computation 中的用法和测试用例写法。
  3.3. 理解 property level computation 测试用例的写法。
4. 参考 filtered entity 和 property level computation 的写法，在 `tests/runtime` 下的 count/any/every/average/summation 的测试用例文件中增加基于 filtered relation 的 property level computation 的测试用例。
5. 使用 `npm run test:runtime` 来运行测试用例，确保测试用例完全通过。