# Medeo Lite ScopedSequence 非项目 Media 专项问题

日期：2026-05-16

## 背景

`prompt/medeo-lite.md` Task 1 已将项目素材命名从 `Project.assetSerialState` JSON counter 迁移到 interaqt 框架级 `ScopedSequence`。

当前核心模型是：

- `Media.serialNumber` 由 `ScopedSequence` 自动分配。
- 分配 scope 是 `{ project, assetPrefix }`。
- `displayName` 由 `assetPrefix + serialNumber` 派生，例如 `p1`、`v2`、`m3`。
- 数据库唯一约束目前是 `assetProjectId + assetPrefix + serialNumber`。

这解决了项目素材在并发创建时重名的问题，并已通过 PostgreSQL 双 Controller 并发测试。

## 当前问题

我们尝试关闭：

```ts
allowManualValue: true
```

并让所有 `Media` 都由 `ScopedSequence` 自动分配 `serialNumber`。测试失败：

```text
ScopedSequence scope "project" is missing
```

失败发生在创建非项目 `Media` 时，例如 public library / import / manual fixture。

## 这不是旧数据迁移问题

本专项与旧数据迁移无关。

即使允许 fresh bootstrap、完全重建数据库，系统里仍然存在“当前设计上不属于某个项目”的 `Media`：

- public library 素材：`source = PUBLIC_LIBRARY`
- stock / seed / import 类素材
- 测试中用于模拟异步任务完成、已有媒体、公共 BGM 的 manual fixture

这些记录并不是旧数据遗留，而是当前业务模型允许存在的非项目媒体。

## 根因

`ScopedSequence` 是绑定在 `Media.serialNumber` 属性上的 property computation。

这意味着只要创建任何 `Media`，框架都会尝试执行序列分配。当前序列定义要求 scope 中必须存在：

```ts
[
  { name: 'project', type: 'ref', base: Project, path: 'project' },
  { name: 'prefix', type: 'string', path: 'assetPrefix' },
]
```

对于非项目 `Media`，`project` 本来就是空的，因此框架无法解析 scope，直接报错。

本质问题是：当前 `Media` 实体同时承载了两类记录：

1. 项目素材：属于某个 `Project`，需要参与 `{ project, assetPrefix }` 序列。
2. 非项目媒体：不属于某个 `Project`，不应该参与项目素材序列。

但 `ScopedSequence` 当前作用于整个 `Media.serialNumber` 属性，无法只对“项目素材”子集生效。

## 当前妥协

目前保留：

```ts
allowManualValue: true
```

并让 public/import/manual fixture 显式写入：

```ts
serialNumber: 0
```

这样框架会保留手工值，不触发自动分配，从而绕过 `{ project, assetPrefix }` scope 解析。

相关 fixture 已经被收敛到统一 helper：

- `modules/asset-layer/tests/media-fixtures.ts`
  - `createManualMediaFixture()`
  - `createPublicMediaFixture()`

这比散落在各测试里的 `assetProjectId: manual:*` / `serialNumber: 0` 更清晰，但仍然是妥协，因为 `allowManualValue` 对整个 `Media.serialNumber` 开放。

## 风险

当前妥协的风险是：

- 任何未来绕过 interaction 直接创建项目素材的代码，都可能手工传入 `serialNumber`，导致 sequence counter 与真实数据脱节。
- `serialNumber: 0` 是 import/public 的特殊语义，但这个语义没有被框架或领域模型强约束，只靠 helper 约定。
- `Media` 既包含项目素材又包含公共/导入媒体，导致项目素材命名规则被迫照顾非项目媒体。

## 框架级阻塞

当前 interaqt `ScopedSequence` 公开能力里没有以下机制：

- 条件性启用 sequence，例如只对 `project != null` 的记录分配。
- match/filter scoped sequence，例如只对 `source != PUBLIC_LIBRARY` 的记录分配。
- 对缺失 scope 返回 `undefined` / 跳过分配的声明式策略。
- 针对 seed/import 的受控 bypass，而不是 property 级 `allowManualValue`。

因此，在不改变领域模型的前提下，无法优雅关闭 `allowManualValue`。

## 期望的框架能力

推荐在 interaqt 增加 `ScopedSequence` 条件能力，例如：

```ts
ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project, path: 'project' },
    { name: 'prefix', type: 'string', path: 'assetPrefix' },
  ],
  match: MatchExp.atom({ key: 'project', value: ['!=', null] }),
})
```

或：

```ts
ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [...],
  appliesTo(record) {
    return Boolean(record.project)
  },
})
```

语义要求：

1. 不匹配的记录不分配 sequence。
2. 不匹配的记录允许 `serialNumber` 为空或保持手工 seed 值。
3. 匹配记录缺少 scope 时仍应报错。
4. `initializeFrom` 只 seed 匹配记录，或要求 initializer 显式声明同样的 match。
5. migration diff 必须把 match/appliesTo 纳入 allocation signature。

## 可选的应用层重构方向

如果不改框架，也可以通过领域模型重构解决：

1. 拆分实体：
   - `ProjectMedia`：项目素材，有 `project`、`assetPrefix`、`serialNumber`。
   - `PublicMedia` / `ImportedMedia`：非项目媒体，不参与项目序列。
2. 保留 `Media` 作为抽象/base entity，但只在 `ProjectMedia.serialNumber` 上挂 `ScopedSequence`。
3. 所有 public/import 路径改写到独立 interaction，不再 direct `storage.create('Media')`。

这个方向代码量较大，而且会影响现有查询、工具、编辑器媒体引用路径，不建议作为 Task 1 的小修补完成。

## 当前建议

短期保持当前实现：

- 保留 `allowManualValue: true`。
- 所有 direct create 非项目媒体只能通过 fixture/helper 或未来 seed/import interaction。
- 项目素材生产入口继续只走四个创建 interaction，不暴露 `serialNumber`。
- 保留 PostgreSQL 双 Controller 并发测试作为门禁。

专项解决时优先选择框架能力增强：给 `ScopedSequence` 增加条件性 appliesTo/match。这样可以在不拆实体的前提下关闭 `allowManualValue`，让项目素材序列规则重新变成强约束。
