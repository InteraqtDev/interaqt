# interaqt `any` 类型滥用分析与修复计划

## 一、总体概况

| 层 | 文件数 | `any` 出现次数（约） | HIGH | MEDIUM | LOW |
|----|--------|---------------------|------|--------|-----|
| core | 17 | 62 | 14 | 28 | 20 |
| runtime | 28 | 204 | 47 | 125 | 32 |
| storage | 13 | 82 | 2 | 54 | 26 |
| drivers | 4 | 31 | 24 | 4 | 3 |
| builtins | 9 | 81 | 25 | 38 | 18 |
| **合计** | **71** | **~460** | **112** | **249** | **99** |

---

## 二、问题分类与模式

### 模式 A：`Record<string, any>` / `{ [k: string]: any }` （~95 处）

最常见的模式。出现在：
- 事件数据（`mapEventData` 返回值）
- `dataDeps`（计算依赖数据）
- 错误上下文 `context`
- 实体记录 `record`/`oldRecord`
- JSON 序列化输出

**修复方案**: 全部替换为 `Record<string, unknown>`，或在有明确结构时定义专用接口。

### 模式 B：回调函数 `this: any` （~20 处）

`EventSource` 和 `Interaction` 的回调（`guard`, `resolve`, `afterDispatch`）使用 `this: any`。

**修复方案**: 替换为 `this: Controller` 或 `this: System`，视回调执行上下文而定。

### 模式 C：函数参数 `(...args: any[]) => any` （~36 处）

计算Handle 和回调中大量使用。

**修复方案**: 根据调用场景定义具体元组类型或使用泛型。

### 模式 D：`as any` 类型断言 （~54 处）

分两类：
1. **可消除的**（~30 处）：如 `(args.callback as any).startsWith('func::')` — 只需先做 `typeof` 检查即可消除。
2. **结构性的**（~24 处）：如 Setup.ts 中 `(entity as any).baseEntity` — 需要扩展接口或使用联合类型。

### 模式 E：驱动层 SQL 参数 `values: any[]` （~24 处）

所有数据库驱动的 `query/insert/update/delete` 方法。

**修复方案**: 替换为 `values: unknown[]`，泛型约束 `T extends any` → `T`。

### 模式 F：泛型默认值 `TArgs = any` （~12 处）

`EventSource<TArgs = any>`, `Controller.dispatch<TArgs = any>` 等公开 API。

**修复方案**: 替换为 `TArgs = unknown`。

### 模式 G：`ComputedEffect = any` 等类型别名 （~3 处）

定义直接等于 `any` 的类型别名。

**修复方案**: 定义具体联合类型或使用 `unknown`。

---

## 三、分阶段修复计划

### Phase 1：无风险机械替换（预计 ~180 处）

**原则**: 不改变运行时行为，只收紧类型约束。

| 子任务 | 涉及文件 | 改动量 | 说明 |
|--------|---------|--------|------|
| 1.1 `Record<string, any>` → `Record<string, unknown>` | 全局 | ~95 处 | 直接替换，编译器会指出需要类型收窄的地方 |
| 1.2 `catch (error: any)` → `catch (error: unknown)` | drivers, runtime | ~6 处 | 标准做法 |
| 1.3 `values: any[]` → `values: unknown[]` (SQL 参数) | drivers 4 个文件 | ~24 处 | SQL 参数本就是 unknown |
| 1.4 `T extends any` → `T` (无约束泛型) | drivers, Controller | ~8 处 | 无实际约束的泛型 |
| 1.5 消除 `func::` 反序列化中的 `as any` | core: Property, Count, Every, Any, WeightedSummation, SideEffect; builtins: Condition, Attributive, Data | ~20 处 | 添加 `typeof x === 'string'` 类型守卫 |
| 1.6 `Promise<any>` → `Promise<void>` (无返回值函数) | System.ts (begin/commit/rollback/setup), drivers | ~10 处 | 返回值未使用时用 void |

### Phase 2：公共 API 类型收紧（预计 ~80 处）

**原则**: 收紧框架对外暴露的类型签名。

| 子任务 | 涉及文件 | 说明 |
|--------|---------|------|
| 2.1 `EventSource` 泛型默认值 | core/EventSource.ts | `TArgs = any` → `TArgs = unknown`，`this: any` → `this: Controller` |
| 2.2 `Controller.dispatch` 签名 | runtime/Controller.ts | 泛型默认值 `any` → `unknown` |
| 2.3 `System` 接口方法签名 | runtime/System.ts | 定义 `StorageRecord`, `EntityIdRef` 等类型，替换 ~30 处 `any` |
| 2.4 `Interaction` 回调签名 | builtins/Interaction.ts | `this: any` → `this: Controller`，参数和返回值用 `unknown` |
| 2.5 驱动 `Database` 接口 | runtime/System.ts + drivers | 统一 `query<T>`, `insert`, `update`, `delete` 签名 |

### Phase 3：计算引擎内部类型（预计 ~120 处）

**原则**: 为计算引擎引入类型体系，减少内部 `any`。

| 子任务 | 涉及文件 | 说明 |
|--------|---------|------|
| 3.1 定义核心计算类型 | 新建 `runtime/types/computation.ts` | 定义 `ComputedEffect`, `DataDeps`, `ComputationRecord`, `MutationEventData` 等 |
| 3.2 `Computation` 基类签名 | runtime/computations/Computation.ts | 用 Phase 3.1 的类型替换 ~58 处 `any` |
| 3.3 聚合计算 Handle | Count, Every, Any, Summation, Average, WeightedSummation, Transform | 统一 `record`, `dataDeps`, `{main: any[]}` 等 |
| 3.4 `Scheduler` | runtime/Scheduler.ts | `dirtyRecord`, `dataDeps`, `computationResult` 等 |
| 3.5 `StateMachine` / `TransitionFinder` | runtime/computations/ | `event` 参数用 `RecordMutationEvent` |

### Phase 4：存储层结构性重构（预计 ~60 处）

**原则**: 消除 `as any` 断言，引入类型安全的接口。

| 子任务 | 涉及文件 | 说明 |
|--------|---------|------|
| 4.1 FilteredEntity 联合类型 | core 或 storage | 定义 `FilteredEntityInstance extends EntityInstance` 含 `baseEntity`, `matchExpression` |
| 4.2 Setup.ts 断言消除 | storage/erstorage/Setup.ts | 用 4.1 的类型替换 ~15 处 `as any` |
| 4.3 `RecordQueryAgent.Record` | storage/erstorage/RecordQueryAgent.ts | `{ [k: string]: any }` → `Record<string, unknown>` + 泛型 |
| 4.4 `AttributeData` 联合类型 | storage/erstorage/ | 为 `isRecord`, `relType`, `recordName`, `field` 等属性定义完整接口 |

### Phase 5：错误系统（预计 ~20 处）

| 子任务 | 涉及文件 | 说明 |
|--------|---------|------|
| 5.1 `FrameworkError.context` | runtime/errors/ | `Record<string, any>` → `Record<string, unknown>` |
| 5.2 `isErrorType(error: any)` | runtime/errors/index.ts | `any` → `unknown` |
| 5.3 各子错误类 | ConditionErrors, ComputationErrors, etc. | 统一用 `unknown`，定义 `ErrorContext` 接口 |

---

## 四、关键新增类型定义

以下类型需要新建或从现有代码中提取：

```typescript
// runtime/types/computation.ts (新建)
export type DataDeps = Record<string, unknown>;
export type ComputationRecord = Record<string, unknown> & { id: string };
export type MutationEventData = {
  type: string;
  recordName: string;
  record?: ComputationRecord;
  oldRecord?: ComputationRecord;
};
export type ComputedEffect = {
  type: 'create' | 'update' | 'delete';
  recordName: string;
  data: Record<string, unknown>;
} | null;
export type AggregateDataDeps = { main: ComputationRecord[] } & DataDeps;
export type IncrementalDataDeps = { _current: ComputationRecord } & DataDeps;

// core/FilteredEntity.ts 或 storage 层
export interface FilteredEntityInstance extends EntityInstance {
  baseEntity: EntityInstance;
  matchExpression: MatchExpressionData;
  isFiltered: true;
}
```

---

## 五、执行策略

1. **逐 Phase 提交**：每个 Phase 作为独立 PR，便于 review 和回退。
2. **先编译后测试**：每步改动后先确保 `tsc --noEmit` 通过，再跑 `vitest`。
3. **Phase 1 优先**：纯机械替换，风险最低，收益最大（消除 ~180 处 `any`）。
4. **Phase 3 最复杂**：计算引擎是 `any` 最密集的区域，需要先设计类型再逐步替换。
5. **不追求 zero-any**：部分第三方库边界（如 `pg` 驱动返回值）保留 `any` 是合理的，用 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 标记。

---

## 六、预期收益

| 指标 | 当前 | Phase 1 后 | 全部完成后 |
|------|------|-----------|-----------|
| `any` 总数 | ~460 | ~280 | <30 |
| 类型覆盖率 | 低 | 中 | 高 |
| 编译器能捕获的错误类型 | 少 | 多 | 大幅增加 |
| IDE 自动补全准确性 | 差 | 中等 | 好 |

---

## 七、风险与注意事项

1. **`unknown` 需要类型收窄**：替换 `any` → `unknown` 后，使用处可能需要添加类型守卫或断言，编译器会报错指引。
2. **循环依赖**：`core` 层不能导入 `runtime`/`storage`，因此 `core/Computation.ts` 中的 `match`/`modifier` 类型需要在 `core` 层定义基础接口。
3. **测试文件中的 `any`**：不在本计划范围内，测试文件中的 `any` 可以后续单独处理。
4. **`Function` 类型**：`core/Custom.ts` 中使用了 `Function` 类型（比 `any` 略好但仍不安全），应一并替换为具体函数签名。
