<p align="center">
  <img src="./logo.svg" />
</p>

# 什么是 Interaqt

Interaqt 是一个致力于将应用业务逻辑与具体实现分离的项目，提供了一种革命性的、严谨地描述业务逻辑的数据结构，以及自动根据业务逻辑来决定和实施软件架构，
直接提供可用 API 的一系列工具。
Interaqt 期望通过这种方式，让任何个人或者团队不再被具体实现、性能需求、成本需求等束缚，能专注于业务逻辑的描述，更快地创造应用。
同时我们也相信，这种方式是大语言模型时代的最佳开发方式。相比使用 LLM 生成代码，构建中间数据结构完全排除了生成出来的系统不确定性，可以真正做到
除非有特殊能力要求之外无需工程师参与。

# Interaqt 的组成

Interaqt 的主要组成部分：
- Interaqt IDE: 基于浏览器的 IDE，集成 LLM，用于帮助用户直观地使用 Interaqt。研发中
- Interaqt Runtime(NodeJS/Go/Java): 将用户的业务逻辑描述转换为可用系统，并提供 API 的运行时。已发布 nodejs 版。
- Interaqt Infra: 用于部署 Interaqt Runtime 的基础设施。研发中。

# 开始使用 Interaqt

目前 Interaqt Runtime 的 NodeJS 版本已发布，请参考 [Interaqt Runtime](./packages/runtime/README.md)。




