# 任务
我们系统中现在允许用户定义 property type 时使用 timestamp 类型。现在你来帮我更新文档和例子：
1. 更新 `examples/dormitory/agentspace/generator` 下的所有文档例子代码应该使用时间戳的 property type。常见的有`createdAt` `updatedAt` `deletedAt` 等等字段。
2. 更新 `examples/dormitory/tests/crud.example.test.ts` 中应该使用时间戳的代码。
3. 不要更新其他地方的文档或者代码，严格按照我上面指示的地方来更新。

## 追加任务
1. 所有使用了 timestamp 类型的 property，如果 property 有 default value，那么应该使用 `Math.floor(Date.now()/1000)`，因为数据库的时间戳精度是秒，而 js 中的 Date.now() 返回的是毫秒。
2. 如果在例子代码中的 Computation 进行了 timestamp 的更新，那么也应该除以 1000，是精度变成“秒”。