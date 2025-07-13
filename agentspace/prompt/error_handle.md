# Error Handle

## 背景

当前的框架需要一套完善的内部 Error 处理体系，更加详细地提示外部，错误发生的具体信息。

## task

Interaqt 程序的入口有以下几类：
1. callInteraction/callActivityInteraction
2. 同步外部事件回来（暂未实现）
3. 定时触发（暂未实现）
4. 异步 computation 的 asyncReturn（暂未实现）

你的任务：
1. 阅读 `./examples/dormitory/agentspace/usage` 下的所有文档，了解本框架的用法。
2. 阅读 `./src` 下的源码，深入理解框架。特别是 computation 和 computation handle 的概念。以及 interaction 是如何触发 computation 的。
3. 设计合适的自定义 Erorr 类型（目前只要处理 callInteraction/callActivityInteractionw 为入口的情况）。在 computation 的各个阶段使用 try/catch 捕获错误，抛出合适的自定义 Error，尽量完整地包含上下文，给明确的提示。3.1. 注意自定义 Error 中仍然要保存原本 error 的引用，方便 debug。
4. 自定 Error 对象要有良好 stringify 和 toJSON 的方法，方便展示给前端或者 console。
5. 完成后确保 `npm run test:runtime` 全部通过。目前测试用例是全部通过的，所以完成后也应该全部通过才说明没有问题。


