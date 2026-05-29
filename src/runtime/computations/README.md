# 实现 DataBasedComputation 指南

本文档说明 runtime 中基于数据的 computation 如何实现全量计算和安全的增量计算。当前调度协议的核心原则是：增量路径必须先声明本次事件真正需要读取哪些 `dataDeps`，scheduler 只解析这些依赖；只有初始化、强制全量、计划阶段要求 full recompute 或增量结果回退 full recompute 时，才解析完整依赖。

## 核心概念

一个 `DataBasedComputation` 通常包含：

1. `dataDeps`：全量计算需要的数据依赖。
2. `primaryDataDepKeys`：当前 computation 自己维护的主集合依赖，例如 `main`、`_current`、`_source`。
3. `compute()`：全量计算入口，接收完整 `dataDeps`。
4. `incrementalCompute()` 或 `incrementalPatchCompute()`：增量入口，只接收计划声明的 partial `dataDeps`。
5. `planIncremental()`：增量计划入口，必须为所有 data-based incremental computation 实现。

## 增量计划协议

只要 data-based computation 声明了 `incrementalCompute()` 或 `incrementalPatchCompute()`，就必须实现 `planIncremental()`。缺失该协议会在 source map 初始化或调度阶段抛 `ComputationProtocolError`，不会静默回到旧的 eager resolve 行为。

```typescript
import {
  DataBasedComputation,
  DataDepEventContext,
  IncrementalPlan,
  defaultDataBasedIncrementalPlan,
} from "./Computation.js";

export class GlobalXXXHandle implements DataBasedComputation {
  primaryDataDepKeys = ["main"];

  dataDeps = {
    main: {
      type: "records",
      source: this.args.record,
      attributeQuery: this.args.attributeQuery || [],
      match: this.args.match,
      modifier: this.args.modifier,
    },
    extra: this.args.dataDeps?.extra,
  };

  planIncremental(_event: unknown, _record: unknown, context: DataDepEventContext): IncrementalPlan {
    return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context, {
      needsLastValue: { mode: "normal" },
    });
  }
}
```

`IncrementalPlan` 有三种结果：

```typescript
type IncrementalPlan =
  | { type: "incremental"; dataDepKeys: string[]; needsLastValue?: boolean | LastValuePolicy }
  | { type: "fullRecompute"; reason: string }
  | { type: "skip"; reason: string };
```

- `incremental`：只解析 `dataDepKeys` 中列出的依赖。`[]` 表示本次增量不需要预解析任何 data dep。
- `fullRecompute`：当前事件不能安全增量处理，scheduler 会直接进入 full compute，只解析完整依赖一次。
- `skip`：source map 保守触发了事件，但计划阶段确认该事件不影响计算；scheduler 不读取依赖、不调用计算、不写结果。

`defaultDataBasedIncrementalPlan()` 适合大多数内置聚合类 computation：主 dep 事件走增量并只解析外部 deps；外部 dep 事件、match/modifier membership 风险走 full recompute；可安全判定的非匹配事件走 skip。

对声明 `incrementalPatchCompute()` 的 computation，计划阶段或增量结果触发的 full recompute 会按 full output 写入，而不是传给 `applyResultPatch()`。scheduler 内部会区分 `full`、`incremental`、`patch`、`skip` 执行结果；只有真正执行 `incrementalPatchCompute()` 并返回 patch 结果时才走 patch apply。

## DataDepEventContext

`planIncremental()` 会收到 scheduler 标准化后的事件上下文：

```typescript
type DataDepEventContext = {
  depKey?: string;
  depRole: "primary" | "external" | "self" | "unknown";
  membershipChange: "none" | "entered" | "left" | "maybe" | "unknown";
  requiresFullRecompute: boolean;
  skip?: boolean;
  reason?: string;
};
```

handle 不应该各自重新解析 `event.dataDep`、`records.match` 或 `modifier.orderBy`。如果 `context.requiresFullRecompute` 为 true，返回 full recompute；如果 `context.skip` 为 true，返回 skip。

## Data Deps 解析语义

runtime 提供两个显式入口：

```typescript
await scheduler.resolveAllDataDeps(computation, record);
await scheduler.resolveSelectedDataDeps(computation, record, ["extra"]);
```

全量路径使用 `resolveAllDataDeps()`。增量路径只能使用 `planIncremental().dataDepKeys` 触发的 `resolveSelectedDataDeps()`。partial resolve 会去重、校验未知 key，并按 key 构造结果对象，不能依赖对象枚举顺序。

`records` data dep 的 full resolve 会传入 `match` 和 `modifier`：

```typescript
storage.find(dataDep.source.name, dataDep.match, dataDep.modifier ?? {}, dataDep.attributeQuery);
```

## Records Match 和 Modifier

`RecordsDataDep.match` 同时影响查询语义和 source map 触发语义：

- full resolve 必须应用 `match`。
- update source map 会监听 `match` 中涉及的字段。
- create/delete 事件如果能在本地确认不匹配，计划阶段会 skip。
- update 事件如果跨越 match membership 边界，计划阶段会 full recompute。
- relation path 或无法安全本地判断的复杂 match 会保守 full recompute。

`RecordsDataDep.modifier` 中的 `limit`、`offset`、`orderBy` 会改变窗口或排序 membership，默认不安全增量。`orderBy` 字段会进入 update source map；一旦触发相关事件，计划阶段 full recompute，而不是尝试用单条 delta 维护有序窗口。

## Last Value

增量路径不会因为 `useLastValue` 自动读取 last value。只有 `planIncremental()` 显式声明 `needsLastValue` 时才读取：

```typescript
return {
  type: "incremental",
  dataDepKeys: [],
  needsLastValue: { mode: "normal" },
};
```

对 `entity` / `relation` 输出，当前 last value 读取可能扫描完整输出表，因此必须显式声明高风险策略：

```typescript
needsLastValue: { mode: "fullOutput", reason: "patch needs complete output state" }
```

如果 entity/relation incremental computation 只返回 `needsLastValue: true` 或 `{ mode: "normal" }`，scheduler 会抛 `ComputationProtocolError`。

## 实现示例

全局计数类 computation 的典型结构：

```typescript
export class GlobalXXXHandle implements DataBasedComputation {
  primaryDataDepKeys = ["main"];
  useLastValue = true;

  dataDeps = {
    main: {
      type: "records",
      source: this.args.record,
      attributeQuery: this.args.attributeQuery || [],
      match: this.args.match,
    },
    ...(this.args.dataDeps || {}),
  };

  async compute({ main, ...externalDeps }: Record<string, unknown>) {
    let result = 0;
    for (const item of main as unknown[]) {
      result += this.callback.call(this.controller, item, externalDeps) ? 1 : 0;
    }
    await this.state.result.set(result);
    return result;
  }

  planIncremental(_event: unknown, _record: unknown, context: DataDepEventContext): IncrementalPlan {
    return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context, {
      needsLastValue: { mode: "normal" },
    });
  }

  async incrementalCompute(lastValue: number, mutationEvent: ERRecordMutationEvent, _record: unknown, dataDeps: Record<string, unknown>) {
    // dataDeps only contains keys returned by planIncremental(); it will not contain main.
    return this.applyDelta(lastValue, mutationEvent, dataDeps);
  }
}
```

属性级 computation 通常将 `_current` 作为主 dep：

```typescript
export class PropertyXXXHandle implements DataBasedComputation {
  primaryDataDepKeys = ["_current"];

  dataDeps = {
    _current: {
      type: "property",
      attributeQuery: [[this.relationAttr, { attributeQuery: this.args.attributeQuery || [] }]],
    },
  };

  planIncremental(_event: unknown, _record: unknown, context: DataDepEventContext): IncrementalPlan {
    return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context, {
      needsLastValue: { mode: "normal" },
    });
  }
}
```

## Custom Computation

`Custom` 的增量计算也必须声明计划。简单场景可以使用声明式 `incrementalDataDeps`：

```typescript
Custom.create({
  name: "customScore",
  dataDeps: {
    main: { type: "records", source: Item, attributeQuery: ["id", "score"] },
    config: { type: "global", source: ConfigValue },
  },
  incrementalDataDeps: ["config"],
  incrementalCompute(lastValue, event, record, dataDeps) {
    // dataDeps contains config only.
  },
});
```

复杂场景可以传入 `planIncremental(event, record, context)`，手动返回 `incremental`、`fullRecompute` 或 `skip`。如果声明了 `incrementalCompute` 或 `incrementalPatchCompute`，但没有 `planIncremental` / `incrementalDataDeps`，runtime 会明确失败。

## 最佳实践

1. 把主集合依赖放进 `primaryDataDepKeys`，增量计划只声明外部 deps 或真正需要的 deps。
2. 在 `compute()` 中按完整数据实现正确性，在增量方法中只处理当前事件 delta。
3. 遇到外部 dep 事件、复杂 relation path、match membership 边界变化、modifier 窗口/排序变化时，优先 full recompute。
4. 只有计划明确需要时才读取 last value；entity/relation 输出要显式声明 `fullOutput` 策略。
5. 为新增 computation 补测试：不 eager resolve 主 dep、partial dep key 映射、full recompute fallback、match/modifier membership、last value 策略。
