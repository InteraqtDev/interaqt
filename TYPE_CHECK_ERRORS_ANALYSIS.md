# TypeScript 类型检查错误分析报告

## 问题概述

运行 `npm run check` 时发现 76 个类型错误，但单独运行各个子项目的类型检查（`npm run check:runtime`、`npm run check:storage`、`npm run check:shared`）时都能通过。

## 根本原因

### 1. TypeScript 配置文件范围差异

- **`npm run check`**: 使用根目录的 `tsconfig.json`，检查范围包括：
  - `examples/**/*`
  - `src/**/*`
  - `tests/**/*`
  - `dashboard/**/*`

- **`npm run check:runtime`**: 使用 `tsconfig.runtime.json`，只检查：
  - `src/runtime/**/*`

- **`npm run check:storage`**: 使用 `tsconfig.storage.json`，只检查：
  - `src/storage/**/*`

- **`npm run check:shared`**: 直接检查 `src/shared/refactored/*.ts` 文件

### 2. 主要问题

子项目的类型检查**只检查各自的源代码**，不检查测试文件和示例代码，这导致了大量的类型错误被忽略。

## 为什么子项目检查能通过？

### 检查范围的差异

1. **src/runtime/** 目录本身没有类型错误
   - runtime 模块的源代码已经修复了所有类型问题
   - 但 **tests/runtime/** 中的测试文件有大量类型错误（35个）

2. **src/storage/** 目录本身没有类型错误
   - storage 模块的源代码类型正确
   - 但 **tests/storage/** 中有1个类型错误

3. **src/shared/refactored/** 文件没有类型错误
   - 重构后的 shared 模块已经完全类型安全
   - 但旧的 **src/shared/BoolExp.ts** 仍然存在并有错误

### 关键发现

- **76个错误中，只有1个在 src/ 目录下**（src/shared/BoolExp.ts）
- **其余75个错误都在 tests/ 和 examples/ 目录中**
- 子项目的 tsconfig 配置**刻意排除了测试和示例代码**，只关注源代码的类型正确性

这解释了为什么：
- `npm run check:runtime` ✅ (只检查 src/runtime/)
- `npm run check:storage` ✅ (只检查 src/storage/)
- `npm run check:shared` ✅ (只检查 src/shared/refactored/)
- `npm run check` ❌ (检查所有文件，包括测试和示例)

## 错误分类和统计

### 1. 源代码错误 (1个)
```
src/shared/BoolExp.ts(3,89): error TS2307: Cannot find module './createClass.js'
```
- 原因：旧的 `BoolExp.ts` 文件仍然引用已删除的 createClass 模块

### 2. 示例代码错误 (8个)
```
examples/cms/dashboard/layered-graph/index.tsx(4,37): Cannot find module '@dormitory-management'
examples/cms/dashboard/layered-graph/src/App.tsx(3,58): Module '"@shared"' has no exported member 'KlassInstance'
examples/cms/dashboard/layered-graph/src/DataProcessor.ts(4,58): Module '"@shared"' has no exported member 'KlassInstance'
examples/cms/dashboard/layered-graph/src/Graph.tsx(5,58): Module '"@shared"' has no exported member 'KlassInstance'
examples/cms/scripts/generate-interaction-functions.ts(27,30): Property 'name' does not exist on type 'never'
examples/cms/scripts/generate-interaction-functions.ts(32,21): Property 'payload' does not exist on type 'never'
examples/cms/scripts/generate-interaction-functions.ts(32,44): Property 'payload' does not exist on type 'never'
examples/cms/scripts/generate-interaction-functions.ts(33,19): Property 'payload' does not exist on type 'never'
```

### 3. 测试文件错误 (67个)

#### 3.1 隐式 any 类型错误 (35个)
- 参数缺少类型注解
- 解构参数缺少类型注解

#### 3.2 类型不兼容错误 (8个)
```
AttributiveInstance is not assignable to type '{ [key: string]: unknown; content?: Function | undefined; }'
```
- AttributiveInstance 缺少索引签名

#### 3.3 属性不存在错误 (12个)
- `Property 'entities' does not exist on type 'System'`
- `'computedData' does not exist in type 'RelationCreateArgs'`
- `'computedData' does not exist in type 'PropertyCreateArgs'`
- 等等

#### 3.4 模块导出错误 (7个)
- `'"@shared"' has no exported member 'InteractionEventArgs'`
- `'"@shared"' has no exported member 'KlassInstance'`
- `'"@"' has no exported member named 'boolExpToDataAttributives'`

#### 3.5 其他类型错误 (5个)
- 对象字面量包含未知属性
- 类型赋值错误
- 函数参数类型错误

## 详细错误列表

### 测试文件: tests/runtime/data/activity/index.ts (14个错误)
- 所有错误都是隐式 any 类型

### 测试文件: tests/runtime/data/leaveRequest.ts (14个错误)
- 4个 AttributiveInstance 类型不兼容
- 10个隐式 any 类型

### 测试文件: tests/runtime/data/leaveRequestSimple.ts (18个错误)
- 1个导出错误：boolExpToDataAttributives
- 3个 Property 'entities' does not exist on type 'System'
- 2个 'computedData' does not exist in type 'RelationCreateArgs'
- 5个 'computedData' does not exist in type 'PropertyCreateArgs'
- 1个 'map' does not exist in type 'TransformCreateArgs'
- 1个 Cannot find name 'Count'
- 5个隐式 any 类型

### 测试文件: tests/runtime/data/propertyStateMachine.ts (1个错误)
- InteractionEventArgs 导出错误

### 测试文件: tests/runtime/data/relationStateMachine.ts (5个错误)
- 2个 AttributiveInstance 类型不兼容
- 3个隐式 any 类型

### 测试文件: tests/runtime/data/roles.ts (2个错误)
- 2个隐式 any 类型

### 测试文件: tests/shared/computation-system.spec.ts (3个错误)
- 1个 'eventType' does not exist in type 'InteractionInstance'
- 2个 Type 'string' is not assignable to type 'ActionInstance'

### 测试文件: tests/shared/simple-refactored.spec.ts (4个错误)
- 4个 'event' does not exist in type 'InteractionInstance'

### 测试文件: tests/storage/dbSetup.spec.ts (1个错误)
- Argument of type 'FieldAliasMap' is not assignable to parameter of type 'string'

## 建议

1. **修复源代码中的 BoolExp.ts**：这是唯一真正的源代码错误

2. **更新测试文件**：
   - 添加缺失的类型注解
   - 更新过时的 API 使用
   - 修复导入路径和导出名称

3. **更新示例代码**：
   - 移除对 'KlassInstance' 的引用
   - 修复模块导入路径

4. **考虑调整 TypeScript 配置**：
   - 为测试文件创建单独的 tsconfig
   - 或者在子项目的 tsconfig 中包含相关的测试文件

5. **API 兼容性**：
   - 需要确认某些 API 的变更（如 computedData vs computed）
   - 更新文档以反映这些变更

## 其他发现

### 遗留文件

在 `src/shared/` 目录下发现了一些应该被清理的文件：
- `BoolExp.ts` - 旧的实现，仍然引用已删除的 createClass
- `utils.ts` - 可能也是旧的实现
- `index.ts.backup` - 备份文件

新的实现都在 `src/shared/refactored/` 目录下。

### 测试数据的过时问题

许多测试文件使用了过时的 API：
- 使用 `computedData` 而不是 `computed`
- 引用不存在的导出如 `KlassInstance`、`boolExpToDataAttributives`
- 使用旧的类型定义

### 严格模式的影响

根目录的 `tsconfig.json` 启用了严格模式（`"strict": true`），这导致：
- 所有缺少类型注解的参数都报错
- 隐式 any 类型不被允许
- 更严格的类型检查

而测试文件显然没有为严格模式做好准备。 