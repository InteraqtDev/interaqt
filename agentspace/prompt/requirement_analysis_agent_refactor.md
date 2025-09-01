我们找到了一种更加系统化的分析需求的方法。详细的方法写在了 `agentspace/output/requirement_completion_handler.md` 中。
现在你来负责把这个方法完全整合到 `examples/dormitory/.claude/agents/requirements-analysis-handler.md` 中。
要求：
1. 完整阅读 `agentspace/output/requirement_completion_handler.md`，完全理解这个方法。
2. 完整阅读 `examples/dormitory/.claude/agents/requirements-analysis-handler.md`。完全理解之前的 agent 的工作。
3. 这个新方法只涵盖了从用户目标如何一步步深度挖掘变成详细的需求和用来支持需求的交互。没有包含在前期，当用户提出的目标非常的模糊或者片面的时候如何自动帮助用户补全的部分。所以你需要在前面增加一个对用户的给出的原始目标进行判断、简单补全的阶段。注意补全的信息不应该太多，只应该补充非常常见的。
4. 将新方法替代到 `examples/dormitory/.claude/agents/requirements-analysis-handler.md` 中老的方法。注意新方法最终的需要产出的文件名应该和原来相同，才能保证后面能继续。
5. 强调后面的基于角色的测试用例设计等步骤，都应该从新方法的产出物中总结诶出来，不能凭空出现新的概念。