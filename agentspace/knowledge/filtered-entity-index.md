# Filtered Entity 文档索引

## 概览

Filtered Entity 是 interaqt 框架中的一个高级特性，它允许从已有的实体或关系中创建满足特定条件的子集视图，而无需创建新的数据表。这个功能通过响应式系统自动维护数据的一致性，为应用提供了强大的数据组织和查询能力。

## 核心特性

- **虚拟实体**：不创建额外的数据表，减少存储冗余
- **响应式更新**：自动跟踪记录的成员资格变化
- **事件驱动**：完全集成到 interaqt 的事件系统
- **灵活查询**：支持复杂的过滤条件和查询组合
- **高性能**：通过查询重定向和索引优化实现高效访问

## 文档导航

### 1. [实现详解](./filtered-entity-implementation.md)

深入了解 Filtered Entity 的架构设计和实现原理：
- 架构设计和核心思想
- 核心组件介绍
- 详细的工作流程
- 技术要点和实现细节
- 与响应式系统的集成

**适合阅读对象**：框架开发者、需要深入理解实现的高级用户

### 2. [使用指南](./filtered-entity-usage-guide.md)

学习如何在实际项目中使用 Filtered Entity：
- 基本概念和定义方法
- 常见使用场景
- CRUD 操作示例
- 与 Computation 结合使用
- 最佳实践和常见问题

**适合阅读对象**：应用开发者、初次使用 Filtered Entity 的用户

### 3. [技术细节](./filtered-entity-technical-details.md)

深入探讨实现的技术细节和设计决策：
- 内部实现机制
- 数据结构和算法
- 性能优化技术
- 边界情况处理
- 设计决策和权衡

**适合阅读对象**：需要进行性能优化或功能扩展的开发者

### 4. [测试指南](./filtered-entity-testing-guide.md)

全面的测试策略和示例代码：
- 测试环境设置
- 各类测试场景
- 事件测试策略
- 性能测试方法
- 调试技巧

**适合阅读对象**：需要编写测试用例的开发者、QA工程师

## 快速开始

如果你是第一次接触 Filtered Entity，建议按以下顺序阅读：

1. 先阅读[使用指南](./filtered-entity-usage-guide.md)了解基本概念和用法
2. 通过实际例子尝试使用 Filtered Entity
3. 参考[测试指南](./filtered-entity-testing-guide.md)编写测试用例
4. 如需深入了解，再阅读[实现详解](./filtered-entity-implementation.md)
5. 遇到性能问题或需要优化时，参考[技术细节](./filtered-entity-technical-details.md)

## 相关资源

### 源代码位置

- Entity 定义扩展：`src/shared/refactored/Entity.ts`
- 查询处理：`src/storage/erstorage/EntityQueryHandle.ts`
- 标记维护：`src/storage/erstorage/RecordQueryAgent.ts`
- 数据库设置：`src/storage/erstorage/Setup.ts`

### 测试用例

- 完整测试：`tests/storage/filteredEntity.spec.ts`

### 示例项目

- Dormitory 示例：`examples/dormitory/agentspace/knowledge/usage/09-filtered-entities.md`

## 版本信息

- 当前版本：1.0
- 最后更新：2024
- 主要限制：
  - 不支持嵌套 filtered entity
  - 过滤条件在定义时确定，不支持动态修改
  - 不支持跨实体的过滤条件

## 反馈和贡献

如果你在使用 Filtered Entity 时遇到问题，或有改进建议，欢迎：

1. 查看测试用例了解更多使用示例
2. 阅读源代码了解实现细节
3. 提交 Issue 或 Pull Request

---

> 💡 **提示**：Filtered Entity 是一个强大但需要正确理解的功能。建议先在小规模场景中尝试，熟悉后再应用到复杂场景。 