# Controller 生命周期与声明注册表

本文是框架内部技术说明，覆盖两件事：(1) Klass 静态注册表（`X.instances`）的设计对象，
以及运行时派生定义为什么、如何与它隔离；(2) 一个 Controller 图的结束生命周期合同。
设计与审计记录：`docs/controller-retention-via-property-instances/`。

## 1. 注册表的设计对象：用户声明

`Entity` / `Relation` / `Property` 等 Klass 的 `static create()` 在构造实例后把它登记进
模块级静态注册表 `X.instances`。该注册表**面向用户在模块顶层声明的定义**，读者只有：

- `clearAllInstances(...klasses)`——测试工具，整表清空，用于跨测试隔离用户声明；
- `stringifyAllInstances()`——遍历 `KlassByName` 中全部注册表序列化，产物供 `parse`
  （`createInstancesFromString`）做 graph 级回读；migration manifest **不**是其消费者——
  `createMigrationManifest`（`src/runtime/migration.ts`）读 controller 图
  （`controller.entities` / `relations` / `dict` / `scheduler.computationsHandles`）与
  storage schema，不读注册表、不调用 `stringifyAllInstances`。这也是
  「派生定义移出序列化输出不影响 migration manifest」的依据；
- `ScopedSequence.deserializeEntityRef`（parse 路径按 uuid / name 在 `Entity.instances`
  中查找，输入来自 `stringifyAllInstances` 产物）。

用户声明的生命周期与进程相同：模块顶层 `X.create()` 登记一次，不随任何 Controller
结束而移除。这是既定语义，不是泄漏。

## 2. 派生定义与 `derive` 路径

**派生定义**指框架在 `setup` / migration / storage 编译路径上，以用户声明为输入合成出来的
Entity / Relation / Property 实例：

- 为 `RecordBoundState`（聚合、Transform 等 record 级计算状态）合成的系统属性，名形如
  `_<host>_<prop>_bound_<state>`（`Scheduler.getBoundStateName`）；
- merged 编译产物：判别列 `__type`、transformed item、虚拟 base entity / relation、
  rebase 出来的 filtered input relation。

派生定义绑定到某一次 `setup` 与某一个 Controller。历史缺陷：合成路径直接调用
`X.create()`，于是每次 `setup` 都把一批派生定义登记为永久全局对象（注册表无移除路径），
且 bound-state 属性的 `defaultValue` 闭包捕获整个 `RecordBoundState`（其 `.controller`
指向 Controller），形成从静态根到 `Database` 实例的强引用链——同一进程内反复
「构造 → setup → 结束」时注册表单调增长、Controller 图不可回收（PGLite 下每轮 RSS
约 +215 MB）。

修复采用汇合点方案：三个 Klass 提供 **`static derive(args)`** 作为派生定义的唯一构造路径。

```ts
// 语义：与 create 相同的声明期校验，得到一个不登记进 instances、
// 不参与 stringifyAllInstances、拥有新 uuid 的实例。
// 框架内部专用（setup / migration / storage 编译期合成派生定义）；
// 用户声明必须走 create()。
static derive(args: XCreateArgs): XInstance
```

- `create()` 与 `derive()` 共用同一 `validateCreateArgs`（合法面与错误信息完全一致）；
  差别只在登记：`create = validate + new + 登记`，`derive = validate + new`。
- `derive` 与 `clone` 的「运行时工作副本不登记」语义同族，但 `derive` 携带与 `create`
  相同的声明期校验；`clone` 不校验。
- 全部运行时合成点（`MonoSystem.prepareEntitiesForStorage` 的 bound-state 属性注入、
  `MergedItemProcessor` 的判别列 / transformed / 虚拟 base / rebase filtered input）
  统一走 `derive`，由 `tests/core/runtimeCreateSiteAllowlist.spec.ts` 的允许清单
  （模块顶层内置声明 + `HardDeletionProperty` 工厂）机器看护：新增运行时 `X.create()`
  调用会使该测试变红，逼迫作者显式决定「用户声明还是派生定义」。
- bound-state 属性的 `defaultValue` 闭包只捕获求默认值所需的纯值，不捕获
  `RecordBoundState` 本身（该对象持有 `controller`）。

不变量测试见 `tests/runtime/derivedDefinitionRetention.spec.ts`：注册表长度在多次
`setup(true)` 生命周期后不变（含 migration 轨）、`stringifyAllInstances()` 输出不受
setup 影响、Controller / System / Database 在结束后可被 GC 回收（`WeakRef` 断言）、
逐站点（R1–R8）断言派生定义不登记。

## 3. Controller 图的结束生命周期合同

**合同：一个 Controller 图在 `await system.destroy()`（等价于
`storage.destroy()` → `db.close()`）完成、且应用不再持有对 Controller / System /
Database 的全部引用后，视为结束。**

结束后框架保证：

1. 用户声明注册表（`X.instances`）与 `KlassByName` 不持有该 Controller 图的任何对象；
   框架没有任何其它静态结构（定时器、进程级监听、模块级容器）持有它。
2. `stringifyAllInstances()` 输出与该 Controller `setup` 前相同——派生定义（系统属性、
   merged 判别列、虚拟 base 等）不出现在输出中。
3. Controller / System / Database 可被 GC 回收（`WeakRef.deref()` 为空）。
4. 结束后再对该 Controller 调用 `dispatch` / `setup` 的行为未定义（与既定行为一致，
   `db.close()` 之后驱动报错）。
5. 用户声明（模块顶层 `X.create()`）不随 Controller 结束而变化。

### `teardown()` 与结束合同的区分

`Controller.teardown()` 服务于**另一个场景**：system（含数据库连接）存活、仅替换
controller 时（热重载、多租户单进程），注销该 controller 的 reactive computation
listeners 与 dict 读回退。它不销毁数据库连接，也不是本合同的结束入口。

| 场景 | 入口 |
|------|------|
| 整图结束（不再使用该数据库） | `await system.destroy()` + 丢弃全部引用 |
| 仅替换 controller（system 与 db 复用） | `controller.teardown()` + 丢弃 controller 引用 |

storage 的 mutation listener 集合挂在 storage 实例上、随实例一起回收，不构成静态
保留根；整图结束时不需要先调用 `teardown()`。

## 4. 保留链历史证据（为什么是这个设计）

修复前的两族保留链（`/tmp` 因果实验，见设计文档 §1.3）：

- **直接链**：`Property.instances` → 派生 bound-state Property → `defaultValue` 闭包 →
  `RecordBoundState` → `controller` → `system` → `db`。
- **间接链**：`Entity.instances` / `Relation.instances` → merged 编译派生的 Entity /
  Relation → `properties` / `source` / `target` / `baseRelation` → RefContainer clone 图
  → 同一批 bound-state Property 闭包 → controller。

只截断 `Property.instances` 时三个 `WeakRef` 仍存活（第二族链仍在）；同时移出三个
注册表的派生定义后三者全部释放、RSS 平稳——证明除注册表外没有其它静态根，因此
结束合同不需要新增显式 API。截断注册表只是因果验证手段；`clearAllInstances` 仍是
测试工具，框架不提供隐式清理。
