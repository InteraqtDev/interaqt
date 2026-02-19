# src/shared 目录说明

## 概述

`src/shared` 是 interaqt 框架的核心类型定义模块，提供了框架的基础类型系统和概念模型。这个模块定义了所有核心概念的数据结构，包括实体(Entity)、关系(Relation)、交互(Interaction)、活动(Activity)、计算(Computation)等。

## 核心功能

### 1. 类型系统基础设施 (createClass)

`createClass.ts` 提供了一个强大的类工厂系统，用于创建具有：
- 类型安全的属性定义
- 运行时实例管理
- 序列化/反序列化支持
- 深度克隆功能
- 约束验证
- 计算属性支持
- Entity/Relation 的定义还可以作为运行时用户传入参数的类型/数据校验规则。

这个系统被所有其他概念定义所使用，提供了统一的对象创建和管理机制。

### 2. 核心概念定义

#### 实体和关系 (entity/)
- **Entity**: 定义数据实体，包含属性集合和计算逻辑
- **Property**: 定义实体的属性，支持基本类型、默认值、计算属性
- **Relation**: 定义实体间的关系，支持 1:1、1:n、n:1、n:n 关系类型

#### 交互和活动 (activity/)
- **Interaction**: 定义用户交互，包含动作、载荷、条件和副作用
- **Activity**: 定义业务流程，包含多个交互和转移规则
- **Action**: 定义交互动作类型
- **Payload/PayloadItem**: 定义交互参数结构
- **Condition**: 定义交互执行条件
- **Data**: 定义数据相关的属性和查询

#### 计算 (computed.ts)
- **Count**: 计数计算
- **Summation**: 求和计算
- **Average**: 平均值计算
- **WeightedSummation**: 加权求和
- **Every/Any**: 布尔聚合计算
- **Transform**: 数据转换
- **StateMachine**: 状态机计算
- **RealTime**: 实时值计算

#### 其他核心概念
- **Attributive** (attributive.ts): 定义属性修饰符，用于权限和验证
- **BoolExp** (BoolExp.ts): 布尔表达式系统，支持复杂条件组合
- **Dictionary** (dictionary/): 全局字典定义，用于存储全局状态

## 与其他模块的关系

### runtime 模块
- 使用 shared 中定义的类型来：
  - 创建控制器(Controller)管理实体、关系、交互
  - 执行交互调用(InteractionCall)
  - 管理活动流程(ActivityManager)
  - 调度计算任务(Scheduler)

### storage 模块
- 使用 shared 中定义的类型来：
  - 设置数据库表结构(Setup)
  - 执行实体查询(EntityQueryHandle)
  - 处理匹配表达式(MatchExp)

## 关键类型导出

所有概念都通过 `createClass` 创建，生成的类型包括：
- `Klass<T>`: 类定义，包含创建方法、类型信息等
- `KlassInstance<T>`: 类实例类型
- 各种具体概念类：Entity, Relation, Property, Interaction, Activity 等

## 重构影响

当前代码大量使用了 `createClass` 系统和 `KlassInstance` 类型。移除这个系统需要：
1. 将所有通过 `createClass` 创建的类改为普通 TypeScript 类或接口
2. 重新实现实例管理、序列化等功能
3. 更新所有使用 `KlassInstance<T>` 的地方为新的类型定义
4. 确保类型安全性不受影响

## Task 1: Understanding createClass System (Completed ✅)

### 发现
- `createClass` 提供了一个完整的类工厂系统
- 支持属性定义、约束验证、序列化、深克隆等功能
- 所有核心概念（Entity、Relation、Interaction等）都基于此系统
- `KlassInstance<T>` 类型在 runtime 和 storage 模块中广泛使用

## Task 2: Refactoring to Direct Classes (In Progress 🔄)

### 重构策略
我们正在将 createClass/createSimpleKlass 系统替换为直接实现标准接口的 TypeScript 类。

### 进度总结
- **已完成**: 6 个类已重构 (Action, Gateway, Event, Dictionary, StateNode, StateTransfer, StateMachine)
- **待完成**: 21 个类仍在使用 createSimpleKlass
- **测试状态**: 所有已重构的类测试通过

### 新架构
1. **标准接口** (`interfaces.ts`):
   - `IInstance`: 所有实例的基础接口，包含 uuid、_type、_options
   - `IKlass<TInstance, TCreateArgs>`: 定义静态方法的接口
   - `SerializedData<T>`: 标准化的序列化格式
   - `generateUUID()`: 集中的 UUID 生成功能

2. **类模式**:
   ```typescript
   export class MyClass implements MyClassInstance {
     // 实例属性
     constructor(args: CreateArgs, options?: { uuid?: string }) { }
     
     // 遵循 IKlass 接口的静态方法
     static create() { }
     static stringify() { }
     static clone() { }
     static is() { }
     static check() { }
     static parse() { }
   }
   ```

### 已实现的优势
- 直接的 TypeScript 类，更好的类型推断
- 移除抽象层，代码更简洁
- 保持与现有 API 的向后兼容
- 改进的 IDE 支持和自动完成

详细状态和后续步骤请参见 `refactored/REFACTORING_PROGRESS.md`。 