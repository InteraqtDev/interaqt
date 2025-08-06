# Default Value

## 任务
在当前 `src/storage` 中，允许用户在 entity 的 property 中定义 default value。
`src/storage` 在 setup 过程中会把 default value 的定义转化成数据库 column 的 default value。
现在你来将 default value 的实现从数据库改成调用 create record api 时由程序控制的方式。

## 具体步骤
1. 阅读 `src/storage` 下的源码，完全理解框架。特别是 default value 的使用方式。
2. 去掉 default value 利用数据库字段的实现，开始完成 default value 在 api 调用中使用程序控制的方式实现。
3. 阅读 `tests/storage` 下的测试用例，理解测试用例写法。
4. 为 default value 的新实现方式编写测试用例，并使用 `npm run test:storage` 运行测试用例，保证所有测试用例通过，不破坏原有功能。

