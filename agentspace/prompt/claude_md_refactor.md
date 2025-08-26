# CLAUDE.md refactor

`examples/dormitory/CLAUDE.md` 现在太长了，需要重构。
步骤：
1. 阅读 `examples/dormitory/CLAUDE.md` 文件，完全理解其中的内容。
2. 将其中的 Task 1/Task 2/Task 3 的内容拆到 `examples/dormitory/agentspace/tasks` 下的独立文件中。
3. 在原本的 `CLAUDE.md` 添加说明：通过查看 `docs/STATUS.json` 文件中当前的 Task 序号，来找到 `agentspace/tasks` 相应的 task 文件并执行 task 。