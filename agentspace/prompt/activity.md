# Activity

## Prompt

Activity & Interaction 是当前系统中的重要概念。我们认为几乎所有系统中的数据应该都是从 Interaction 中计算而来。
Activity 是多个有关联的 Interaction 的集合，它有类似于状态机的状态管理等。详细阅读 src/runtime 下的代码，深入理解 Activity & Interaction 。
帮我重构任务，要求：
1. 创建一个 ActivityManager 类，把 Controller/System 中 所有 Activity/Interaction 相关的代码都一入到 ActivityManager 中。
2. 做好 ActivityManager 的 api 命名工作，替换掉 Controller 中原本的调用。
3. 找到 tests/runtime 下相关的测试用例，修改该测试用例后保证 `npm test` 仍然全部顺利通过。
4. 把 ActivityManager 相关的设计、实现协程文档放到下面的章节中。

## 文档

### ActivityManager 设计与实现

#### 概述

ActivityManager 是一个独立的管理类，负责处理系统中所有 Activity 和 Interaction 相关的操作。它将原本分散在 Controller 和 System 中的 Activity/Interaction 逻辑进行了集中管理，提供了清晰的 API 接口。

#### 设计目标

1. **单一职责原则**：ActivityManager 专门负责 Activity 和 Interaction 的管理，包括创建、调用、状态管理等
2. **代码分离**：将 Activity/Interaction 相关的复杂逻辑从 Controller 中分离出来，降低 Controller 的复杂度
3. **统一接口**：为 Activity 和 Interaction 操作提供统一、清晰的 API
4. **依赖管理**：减少组件间的直接依赖，通过 ActivityManager 作为中介

#### 核心功能

##### 1. Activity 和 Interaction 实例管理
- 管理 ActivityCall 和 InteractionCall 实例的创建和存储
- 提供基于 UUID 和名称的快速查找接口
- 确保实例的唯一性和一致性

##### 2. 交互调用管理
- `callInteraction()`: 处理独立的 Interaction 调用
- `callActivityInteraction()`: 处理 Activity 上下文中的 Interaction 调用
- 统一的事务管理和错误处理
- 副作用（side effects）的执行和管理

##### 3. 生命周期管理
- 自动处理数据库事务的开始、提交和回滚
- 统一的日志记录和错误处理
- 副作用的执行和结果收集

#### 实现细节

##### 类结构
```typescript
export class ActivityManager {
    public activityCalls: Map<string, ActivityCall>
    public activityCallsByName: Map<string, ActivityCall>
    public interactionCallsByName: Map<string, InteractionCall>
    public interactionCalls: Map<string, InteractionCall>
    
    constructor(controller, system, activities, interactions)
    async callInteraction(interactionId, interactionEventArgs)
    async callActivityInteraction(activityCallId, interactionCallId, activityId, interactionEventArgs)
    // 查询接口
    getActivityCall(activityId)
    getActivityCallByName(activityName)
    getInteractionCall(interactionId)
    getInteractionCallByName(interactionName)
}
```

##### 核心方法

**callInteraction()**
- 处理独立的 Interaction 调用
- 自动管理数据库事务
- 处理成功和失败场景
- 执行记录变更副作用

**callActivityInteraction()**
- 处理 Activity 上下文中的 Interaction 调用
- 维护 Activity 状态机
- 与 ActivityCall 协调工作
- 提供完整的活动生命周期管理

**runRecordChangeSideEffects()**
- 执行数据变更产生的副作用
- 支持多种副作用类型（RecordMutationSideEffect 和 KlassInstance）
- 统一的错误处理和结果收集

#### 与其他组件的关系

##### Controller
- Controller 保持对 ActivityManager 的引用
- Controller 的 `callInteraction` 和 `callActivityInteraction` 方法委托给 ActivityManager
- Controller 继续负责其他职责（调度器、数据处理等）

##### System
- ActivityManager 使用 System 提供的存储和日志服务
- 不直接修改 System 的接口

##### ActivityCall & InteractionCall
- ActivityManager 创建和管理这些实例
- 保持原有的调用接口和行为

#### 重构过程

1. **创建 ActivityManager 类**：实现所有 Activity/Interaction 相关功能
2. **修改 Controller**：移除原有的 Activity/Interaction 逻辑，添加 ActivityManager 实例
3. **委托调用**：Controller 的相关方法改为委托给 ActivityManager
4. **保持兼容性**：确保原有的 API 接口不变，测试全部通过

#### 优势

1. **更清晰的代码结构**：职责分离使得代码更易理解和维护
2. **更好的可测试性**：ActivityManager 可以独立测试
3. **更强的扩展性**：可以独立扩展 Activity/Interaction 功能
4. **更低的耦合度**：减少了组件间的直接依赖

#### 测试验证

重构后所有原有测试（98 个测试用例）依然全部通过，证明：
- 功能完全兼容
- API 接口保持一致
- 业务逻辑正确迁移
- 性能没有显著影响