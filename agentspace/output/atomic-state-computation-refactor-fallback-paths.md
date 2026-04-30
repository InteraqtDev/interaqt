# 第一阶段 Full Recompute Fallback 覆盖路径

本文档记录原子 State / Computation 第一阶段实现后，内置 computation 增量路径中仍会返回 `ComputationResult.fullRecompute()` 的场景。

这些路径不是本阶段 atomic state 失败，但它们意味着对应事件无法用当前 narrow incremental patch 安全表达，会退回 full compute。在线 full recompute 与普通 dispatch 并发的隔离控制仍属于第二阶段。

## 聚合类通用 fallback

以下 computation 在 mutation source 不属于自己声明的主 data dependency，或 mutation 带有不支持的 `relatedAttribute` 路径时，会退回 full recompute：

- `GlobalCount`
- `GlobalSum`
- `GlobalAverage`
- `GlobalAny`
- `GlobalEvery`
- `GlobalWeightedSummation`

原因：这些 global aggregate 的增量路径只覆盖“主 record 自身 create/update/delete”的贡献变化。额外 dataDeps、关联路径变化、或无法直接定位 contribution state 的事件，需要通过全量扫描重新建立 contribution state 和 aggregate。

## Property aggregate fallback

以下 property-level computation 在相关 relation path 不符合当前支持形态时退回 full recompute：

- `PropertyCount`
- `PropertySum`
- `PropertyAverage`
- `PropertyAny`
- `PropertyEvery`
- `PropertyWeightedSummation`

当前增量路径主要覆盖：

- host record 的目标 relation 增删。
- relation record 自身属性变化。
- related entity 上与 callback/attributeQuery 相关的更新。

以下情况会 fallback：

- `mutationEvent.recordName` 不是当前 host。
- `relatedAttribute` 缺失、为空、长度超出当前支持范围。
- `relatedAttribute` 不是当前 computation 绑定的 relation property。
- related mutation event 缺失。
- related mutation event 无法归类为当前 relation / related record 的增量变化。

## Every 的 relation contribution 缺失 fallback

`PropertyEvery` 在 relation contribution state 不存在时会 fallback：

```text
relation contribution state target not found
```

这个路径主要覆盖 x:n 关系中的深层 related entity 变化：事件到达时能够确定 host record 和 related record，但无法稳定定位已经写过 contribution state 的 relation row。第一阶段选择 full recompute，避免对不存在或不确定的 relation row 执行 atomic replace。

## Custom computation fallback

`Custom` computation 未定义 `incrementalCompute` 时会 fallback：

```text
No incrementalCompute defined
```

Custom computation 的并发安全声明和在线 full recompute 隔离不属于第一阶段目标。

## Transform / StateMachine

当前 `Transform` 和 `StateMachine` 不使用 `ComputationResult.fullRecompute()` 作为常规 fallback：

- `Transform` data-based update 通过 source row lock + mapped rows lock 生成 patch。
- `Transform` delete 使用 delete event snapshot 并锁定 mapped rows。
- `StateMachine` 在 internal state / host row lock 内判断 transition，不匹配则 `skip()`。

## 第二阶段要求

第二阶段需要为 full recompute 增加在线并发控制，至少包括：

- full compute 与普通 dispatch 的互斥或 SERIALIZABLE retry。
- fallback 发生时的可观测日志/指标。
- 明确哪些 custom computation 声明为并发安全，哪些只能离线 repair/rebuild。
