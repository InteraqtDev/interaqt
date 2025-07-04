# 向后兼容类型工具文档

## 概述
本文档记录了在从 `createClass` 重构到 ES6 类的过程中，为了保持向后兼容而创建的类型工具和接口。这些类型主要在 `src/shared/refactored/` 目录中定义，并被 `runtime` 和 `storage` 模块使用。

## 移除进度
- [x] 第一步：移除 `KlassInstance<T>` 类型别名 (已完成)
  - 已将所有 `KlassInstance<typeof T>` 替换为具体的实例类型
  - runtime 和 storage 模块的类型检查都已通过
- [x] 第二步：移除 `Klass<T>` 接口 (已完成)
  - 已从 utils.ts 中移除 Klass 接口定义
  - 已将所有 `Klass<any>` 替换为 `any`
  - 已从所有导入语句中移除 Klass
- [ ] 第三步：移除 `KlassByName`
- [ ] 第四步：移除 `isKlass` 属性
- [ ] 第五步：清理其他向后兼容代码

## 向后兼容类型列表

### 1. `KlassInstance<T>` 类型别名 (已移除)
- **定义位置**: `src/shared/refactored/interfaces.ts:73`
- **定义**: `export type KlassInstance<T> = T extends { create(args: infer A, options?: any): infer R } ? R : never;`
- **用途**: 获取类的实例类型，用于替代原始的 `KlassInstance` 类型
- **移除情况**: ✅ 已完成，所有使用都已替换为具体的实例类型

### 2. `Klass<T>` 接口 (已移除)
- **定义位置**: `src/shared/refactored/utils.ts:54-70` (已删除)
- **定义**: 一个为重构后的类提供与原始 `createClass` 系统兼容的接口
- **移除情况**: ✅ 已完成
  - 从 utils.ts 中移除了接口定义
  - `src/runtime/Scheduler.ts:65`: 已改为 `handles.get(args.constructor as any)`
  - `src/runtime/InteractionCall.ts:235`: 已改为 `(concept.constructor as any)?.check`
  - `src/runtime/computationHandles/ComputationHandle.ts:42`: 已改为 `Map<any, HandlesForType>`

### 3. `KlassByName` 全局注册表
- **定义位置**: `src/shared/refactored/utils.ts:52`
- **定义**: `export const KlassByName = new Map<string, any>();`
- **用途**: 替代原始的 `KlassByName` 全局注册表，用于通过名称查找类
- **使用情况**:
  - `src/shared/refactored/init.ts`: 注册所有重构后的类
  - `src/shared/refactored/utils.ts`: `createInstances` 和 `stringifyAllInstances` 函数使用

### 4. `isKlass` 静态属性
- **定义位置**: 所有重构后的类中
- **定义**: `static isKlass = true as const;`
- **用途**: 标识一个类是否是通过 `createClass` 系统创建的（向后兼容）
- **使用情况**: 在每个重构后的类中都有定义（如 Entity、Relation、Property 等）

### 5. `IKlass` 接口
- **定义位置**: `src/shared/refactored/interfaces.ts:8-23`
- **定义**: 
```typescript
export interface IKlass<TInstance extends IInstance, TCreateArgs> {
    isKlass: true;
    displayName: string;
    instances: TInstance[];
    public: Record<string, unknown>;
    create(args: TCreateArgs, options?: { uuid?: string }): TInstance;
    stringify(instance: TInstance): string;
    clone(instance: TInstance, deep: boolean): TInstance;
    is(obj: unknown): obj is TInstance;
    check(data: unknown): boolean;
    parse(json: string): TInstance;
}
```
- **用途**: 定义重构后的类需要实现的标准接口
- **使用情况**: 主要在 `shared/refactored` 内部使用

### 6. `BaseKlass` 抽象类
- **定义位置**: `src/shared/refactored/interfaces.ts:33-64`
- **用途**: 提供通用的类方法实现（如 `createBase`、`isBase`、`checkBase`）
- **使用情况**: 作为基类在 `shared/refactored` 内部使用

### 7. 向后兼容函数

#### `registerKlass`
- **定义位置**: `src/shared/refactored/utils.ts:55-59`
- **用途**: 注册一个重构后的类到 `KlassByName`

#### `removeAllInstance`
- **定义位置**: `src/shared/refactored/utils.ts:47-50`
- **用途**: 清空所有实例（向后兼容 `createClass` 系统的功能）

#### `boolExpToAttributives` 和 `boolExpToConditions`
- **定义位置**: `src/shared/refactored/index.ts`
- **用途**: 转换布尔表达式到属性或条件（向后兼容）

## 影响范围

### Runtime 模块
- 大量使用 `KlassInstance<typeof T>` 类型 (已修复)
- 使用 `Klass<any>` 进行类型检查和动态调用 (已修复)
- 依赖 `KlassByName` 进行类查找

### Storage 模块
- 在 `Setup.ts` 中使用 `KlassInstance<typeof T>` 定义参数类型 (已修复)
- 较少依赖其他向后兼容类型

### 测试
- 测试中使用了 `createClass` 兼容层（已在之前的重构中处理） 