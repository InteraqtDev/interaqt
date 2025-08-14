# Dependency Analyze
## 任务
我们需要根据 entity/relation/property/dictionary 上的 computation 来做一个完整的依赖分析，最后总根据定先从哪些 computation 实现。

现在我们的引导程序已经能指挥大模型根据需求生成结构化的 `computation-analysis.json` 文件。`examples/dormitory/docs/computation-analysis.json` 是生成的例子。你来负责用 typescript 写一个依赖分析脚本，构建出 computation 从最少依赖到最多依赖的实现顺序，要求每个 computation 实现的时候，它的依赖都已经实现了。

## 具体步骤
1. 阅读 `src/runtime` 下的源码
  1.1. 理解 entity/relation/property/dictionary 的概念.
  1.2. 理解 global level/entity level/property level 的 computation 的含义。
  1.3. 理解 computation 的依赖是什么意思，如何将 entity/relation/property/dictionary 串联起来组成了依赖树。
2. 在 `examples/dormitory/scripts` 下写一个名为 `plan.ts` typescript 分析脚本，构建出 computation 从最少依赖到最多依赖的实现顺序，要求每个 computation 实现的时候，它的依赖都已经实现了。数据结果输出到 `examples/dormitory/docs/computation-implemention-plan.json` 中。
3. 在 `examples/dormitory` 目录下使用 `tsx plan.ts` 命令，应该能正确输出结果到`examples/dormitory/docs/computation-implemention-plan.json`中。运行完之后检查文件，看是否正确输出。如果没有正确输出，持续修复代码，直到正确输出。


