# interaqt 专项需求：Scoped Atomic Sequence

## 背景

medeo-lite 的素材库使用统一序号命名素材，例如：

- 图片：`p1`, `p2`, ...
- 视频：`v1`, `v2`, ...
- BGM：`m1`, `m2`, ...
- 音频：`a1`, `a2`, ...
- 文档：`d1`, `d2`, ...

业务规则是：同一项目内，同一素材类型前缀下，序号必须单调递增且不能重名；删除素材后不能复用旧序号。

当前 medeo-lite 使用 interaqt 表达业务逻辑。素材创建通过 interaction + computation 完成，业务代码不应直接访问数据库，也不应绕过 interaqt 写 raw SQL。

## 当前问题

medeo-lite 现在的序号生成依赖 `Project.assetSerialState` 上的 JSON counter：

```ts
const nextSerialNumber = (previous.counters?.[prefix] ?? 0) + 1
return {
  counters: {
    ...(previous.counters ?? {}),
    [prefix]: nextSerialNumber,
  },
  _chainBridge: {
    eventId: event.id,
    prefix,
    serialNumber: nextSerialNumber,
  },
}
```

随后 `Media.computation` 读取 `_chainBridge` 创建素材：

```ts
serialNumber: bridge.serialNumber,
displayName: `${bridge.prefix}${bridge.serialNumber}`,
```

这个模型在单个 Controller / 单个 Node 进程内看起来成立，但 medeo-lite 实际运行时存在多个进程/组件共同写同一个 main DB：

- `main-component`
- `agent-component`

当前 PostgreSQL adapter 的事务串行能力是 `single-process-serialized`，进程内 `transactionQueue` 无法约束另一个进程。因此跨进程并发创建素材时，两个 dispatch 可能读到同一个旧 counter，生成相同 `serialNumber/displayName`。

## 现有 interaqt 能力缺口

当前 interaqt 已具备：

- `dispatch` 事务边界。
- `StateMachine` / `Transform` / `Custom` computation。
- `UniqueConstraint`，可表达业务唯一约束。
- SERIALIZABLE retry 相关机制。

但缺少一个框架级能力：

> 在不直接访问数据库、不写 raw SQL 的前提下，为某个业务 scope 原子分配递增序号。

当前业务层无法用 interaqt storage API 等价表达：

```sql
INSERT INTO counters(scope..., last_serial_number)
VALUES (..., 1)
ON CONFLICT(scope...)
DO UPDATE SET last_serial_number = counters.last_serial_number + 1
RETURNING last_serial_number;
```

也无法声明式表达：

```sql
SELECT ... FOR UPDATE;
```

只用 `StateMachine(lastValue + 1)`、`storage.find max + 1` 或普通 `storage.update` 都无法保证跨进程/多实例下的唯一递增。

## 期望新增能力

建议在 interaqt 中新增 scoped atomic sequence / counter 能力，业务侧以声明式方式使用。

建议 API 形态之一：

```ts
ScopedSequence.create({
  name: 'projectAssetSerial',
  scope: [
    { name: 'project', type: 'ref', base: Project },
    { name: 'prefix', type: 'string' },
  ],
  initialValue: 0,
  step: 1,
})
```

业务计算中可以请求下一个值：

```ts
const serialNumber = await this.system.sequence.next('projectAssetSerial', {
  project: { id: projectId },
  prefix,
})
```

或者作为 computation 使用：

```ts
Property.create({
  name: 'serialNumber',
  type: 'number',
  computation: ScopedSequence.create({
    scope: ['project', 'prefix'],
  }),
})
```

具体 API 可以由 interaqt 设计决定，但必须满足以下语义。

## 必须满足的语义

1. **跨进程原子性**
   - 多个 Node 进程、多个 Controller、多个 DB client 同时请求同一个 scope 的 next value，返回值必须互不重复。

2. **事务一致性**
   - sequence 分配和业务记录创建应处于同一个 dispatch 事务语义下。
   - 如果业务记录创建失败，序号是否允许产生 gap 需要框架明确。
   - 对 medeo-lite 来说，允许 gap，但不允许重复和倒退。

3. **scope 唯一性**
   - 同一个 sequence name + scope 只对应一条 counter 状态。
   - 数据库层必须有唯一约束兜底。

4. **多数据库适配**
   - PostgreSQL：可用 `INSERT ... ON CONFLICT DO UPDATE RETURNING` 或行级锁实现。
   - SQLite/PGLite：测试环境也要有等价原子行为。
   - 不支持强一致事务的 driver 必须明确报错，不能静默退化成非原子实现。

5. **可迁移**
   - interaqt migration 能创建 sequence/counter 所需表、索引、唯一约束。
   - 能从已有业务数据初始化 counter。

6. **声明式业务边界**
   - 业务模块只声明 sequence 及其 scope。
   - 业务模块不直接访问 DB，不写 raw SQL，不依赖具体 driver。

## medeo-lite 目标用法

素材命名应表达为：

- `prefix = assetPrefixFromBizKind(bizKind)`
- `serialNumber = next(projectAssetSerial, { projectId, prefix })`
- `displayName = prefix + serialNumber`

所有素材创建入口共用同一个 sequence：

- `CreateMediaFromUpload`
- `RegisterUploadedMedia`
- `CreateMediaFromUrl`
- `CreateMediaFromAI`

并保留业务唯一约束兜底：

- `(project, bizKind, serialNumber)` unique，仅约束项目素材。

## 必须补充的框架测试

### 1. 单进程并发

同一个 Controller 中并发 dispatch 100 次，scope 相同，得到 `1..100`，无重复。

### 2. 双 Controller 并发

两个 Controller 连接同一个 PostgreSQL DB，同时 dispatch 100 次，scope 相同，得到 `1..200`，无重复。

### 3. 多 scope 隔离

同一个 sequence：

- `{ project: A, prefix: p }` 得到 `1,2,3`
- `{ project: A, prefix: v }` 得到 `1,2`
- `{ project: B, prefix: p }` 得到 `1`

scope 之间互不影响。

### 4. 失败语义

dispatch 中先分配 sequence，再触发业务唯一约束失败：

- 不允许导致后续成功请求拿到重复值。
- gap 是否存在按框架定义断言。

### 5. driver 能力声明

对不支持跨进程原子 sequence 的 driver：

- setup 或 dispatch 必须明确失败。
- 不能降级为 `find max + 1`。

## medeo-lite 迁移依赖

interaqt 支持该能力后，medeo-lite 会做以下迁移：

1. 删除 `Project.assetSerialState` 作为素材命名来源。
2. 改造 `Media` 创建 computation，使用 interaqt scoped sequence 分配序号。
3. 添加 `(project, bizKind, serialNumber)` 唯一约束。
4. 编写数据迁移：按 `project + prefix + createdAt ASC + id ASC` 重排历史重复素材名，并初始化 sequence counter。

## 一句话需求

interaqt 需要提供一个声明式、可迁移、跨进程安全的 scoped atomic sequence 能力，让业务模型可以在 interaction/computation 中原子获取“某个 scope 下的下一个序号”，而不需要业务代码直接访问数据库。
