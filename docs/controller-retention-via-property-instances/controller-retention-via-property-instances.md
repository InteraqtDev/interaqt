# 设计：运行时派生定义不得滞留于用户声明注册表（Controller 图可回收）

```text
status: 已完成
design-round: 1/15
implementation-round: 6/20
current-milestone: M-04
current-milestone-reopens: 1
convergence-mode: normal
next-action: 无
```

任务：`docs/controller-retention-via-property-instances/controller-retention-via-property-instances-task.md` Task 1。
问题陈述输入：`prompt/output/controller-retention-via-property-instances.md`（基于 4.10.0 dist 的观测，未附解法）。

术语（首次使用处定义）：

- **用户声明**：应用代码在模块顶层通过 `X.create()` 构造的 Entity / Relation / Property 等定义。它们是 `X.instances` 注册表的设计对象，`stringifyAllInstances()` / `parse` 以它们为序列化单位。
- **派生定义**：框架在 `setup` / migration / storage 编译路径上，以用户声明为输入合成出来的 Entity / Relation / Property 实例。例如为 `RecordBoundState` 合成的系统属性（名形如 `_<host>_<prop>_bound_<state>`）、merged entity 的判别列 `__type`、merged 编译产出的 transformed item 与虚拟 base。派生定义绑定到某一次 `setup` 与某一个 `Controller`。
- **Controller 图**：一个 `Controller` 实例及其可达的 `Scheduler`、computation handles、`RecordBoundState` / `GlobalBoundState`、`System`、`Storage`、`Database` 实例。
- **结束生命周期**：应用调用 `await system.destroy()`（等价于 `storage.destroy()` → `db.close()`）并丢弃对 Controller 图的全部引用。

---

## 1. 背景和现状（当前 HEAD `0249556`，全部事实经源码或运行复核）

### 1.1 注册表机制

- 每个 Klass 的 `static create()` 在校验后 `new X(args, options)`，对 `this.instances` 线性 `find` 去重，再 `push`（`src/core/Property.ts` 111–176 行；`Entity.ts` 514–577；`Relation.ts` 341–383）。没有任何移除路径。
- `static clone()` 明确**不**登记（`Entity.ts` 583–586 行 CAUTION 注释：clone 是运行时图手术用的工作副本，注册会污染 `stringifyAllInstances` 输出并跨测试泄漏；`Relation.clone` / `Property.clone` 同语义）。因此代码库已有「运行时工作副本不进注册表」的既定语义。
- 注册表的读者（`rg` 全仓）：
  - `clearAllInstances(...klasses)`（`src/core/utils.ts` 122 行，测试工具）。
  - `stringifyAllInstances()`（`utils.ts` 146 行）遍历 `KlassByName` 中全部注册表序列化。`src/` 内没有任何生产代码调用它；测试读者共三个——`tests/core/utils.spec.ts`、`tests/core/stringify.spec.ts`、`tests/core/serialization-roundtrip.spec.ts`，均先 `clearAllInstances` 或自建模型再断言，不依赖派生定义出现在输出中（d=1 裁决轮核实修正：初稿只列了第一个文件）。
  - `src/core/ScopedSequence.ts` 84–104 行 `deserializeEntityRef` 在 **parse** 路径按 uuid / name 在 `Entity.instances` 中查找。它查的是用户声明（parse 输入来自 `stringifyAllInstances` 产物）；派生定义的存在只会污染按 name 的查找（`find` 取首个，当前恰好是用户声明在前），修法把派生定义移出注册表只会使其更可靠，不改变行为。
  - migration manifest（`src/runtime/migration.ts` 1010–1120 行 `createMigrationManifest`）读的是 `controller.entities` / `controller.relations` / `controller.dict` / `scheduler.computationsHandles` 与 storage schema，**不读注册表、不调用 `stringifyAllInstances`**。`modelHash` 不受本任务影响。
  - 测试中 `system.conceptClass = KlassByName`：`MonoSystem.conceptClass` 仅是一个字段（`MonoSystem.ts` 2111 行），`src/` 内无读者。

### 1.2 运行时登记点枚举（`rg "(Entity|Relation|Property)\.create\(" src/runtime src/storage src/builtins src/drivers`）

| # | 位置 | 调用 | 分类 | 是否持有 Controller 图 |
|---|------|------|------|------------------------|
| R1 | `src/runtime/MonoSystem.ts` 2381 `setup()` | `Property.create({ name: stateItem.key, type, collection, defaultValue: () => stateItem.defaultValue })` 推入 RefContainer clone 的根实体 | **派生定义**，每次 `setup` 一批 | **是**：`defaultValue` 闭包捕获整个 `stateItem`（`RecordBoundState`），其 `.controller` 由 `Scheduler.createStates()`（268 行）/ `Custom.ts`（202、225 行）赋值 |
| R2 | `src/runtime/MonoSystem.ts` 2437 `prepareEntitiesForStorage()` | 与 R1 逐字同构 | **派生定义**，每次 `prepareMigrationSchema` / `migrateSchema` 一批（`Controller.setup(install=false)`、`createMigrationBaseline`、`prepareMigrationContext` 各调用一次 `createStates()` + 本函数） | **是**，同 R1 |
| R3 | `src/storage/erstorage/MergedItemProcessor.ts` 399 `rebaseAsFilteredItem` | `Relation.create({ name, baseRelation, sourceProperty, targetProperty, matchExpression })` | **派生定义**（merged relation 的每个 input 与 root base 各一个） | **是（间接）**：`baseRelation` → 虚拟 base / transformed relation → `source` / `target` 指向 RefContainer clone 的实体，clone 的 `properties` 已含 R1 推入的 bound-state Property |
| R4 | `MergedItemProcessor.ts` 418 `createTypeProperty` | `Property.create({ name: '__type', type: 'string', defaultValue })` | **派生定义**（每个 merged item 一个） | 否（闭包只捕获纯字符串映射，已有意设计）；但仍是「派生定义永久滞留」 |
| R5 | `MergedItemProcessor.ts` 536 `transformMergedItem` | `Entity.create({ name: mergedItem.name })` | **派生定义** | **是（间接）**：`properties = mergedProperties`，其中 `Property.clone` 自 input clone 的属性（含 bound-state Property，运行证据见 §1.3：`_Cat_toyCount_bound_count`），且 `mergeProperties` 511 行为每个合并属性新建 `defaultValue` 闭包捕获 `itemPropertyMap`（→ clone 上的 Property → R1 闭包 → controller） |
| R6 | `MergedItemProcessor.ts` 539 | `Entity.create({ name: \`${name}_base\`, properties: mergedProperties })` 虚拟 base | **派生定义** | **是（间接）**，同 R5 |
| R7 | `MergedItemProcessor.ts` 553 | `Relation.create({ name, source, sourceProperty, target, targetProperty, type, isTargetReliance })` | **派生定义** | **是（间接）**：`source` / `target` 是携带 bound-state Property 的实体 clone（运行证据：`AuthorEngagedPost.source.properties` 含 `_Author_postCount_bound_count`） |
| R8 | `MergedItemProcessor.ts` 564 | `Relation.create({ name: \`__${name}_base\`, ..., properties: mergedProperties })` 虚拟 base | **派生定义** | **是（间接）**，同 R5/R7 |
| — | `src/runtime/Controller.ts` 392 `HardDeletionProperty.create()` | `Property.create({ name: '_isDeleted_', type: 'boolean' })` | **用户声明**：由应用代码在实体 `properties` 声明时调用（`tests/runtime/stateMachine.spec.ts`、`tests/runtime/data/leaveRequest.ts`）；`src/` 内无运行时调用点 | 不适用；不随 setup 增长 |
| — | `System.ts` 394/422、`Interaction.ts` 53、`ActivityManager.ts` 12/40、`StateMachine.ts` 283–293 | 模块顶层常量 | 框架内置声明，只登记一次 | 不适用 |
| — | `MonoSystem.ts` 2375/2431 `stateItem.defaultValue instanceof Property` 分支 | 不新建，推入用户提供的 Property 并改写其 `name` | 用户声明（Custom 计算的 `createState` 可构造）；`src/runtime/computations/*` 内没有任何内建计算使用该形态 | 不随 setup 增长。该分支改写用户实例的 `name` 是既有行为，不在本任务范围 |

结论：8 个运行时登记点，全部是派生定义，分布在 3 个 Klass（Entity / Relation / Property）、2 个文件、2 个层（runtime、storage）。R1 与 R2 是同构重复代码。

### 1.3 最小复现（要求 1，脚本 `/tmp/interaqt-retention/repro.mts`，`npx tsx --expose-gc <script> <rounds> <pglite|sqlite> <none|truncate-property|truncate-all>`）

Schema（不依赖任何应用）：`Author`（`postCount` = Count、`totalScore` = Summation）、`Post`（含 `HardDeletionProperty.create()`）、`AuthorPost` 1:n、filtered entity `HotPost`、`Cat`（`toyCount` = Count）/ `Dog` / `Toy`、merged entity `Animal = [Cat, Dog]`、filtered `Kitten` ⊂ `Cat`、merged entity `Pet = [Kitten, Dog]`（产生虚拟 base `Pet_base`）、merged relation `AuthorEngagedPost = [likedPosts, sharedPosts]`、entity-level Transform `Mirror ← Post`。每轮：`new PGLiteDB()` → `new MonoSystem(db)` → `new Controller({...})` → `await controller.setup(true)` → `await system.destroy()` → 丢弃引用 → `gc()` ×3 → 读注册表长度（经 `KlassByName` 枚举）、`WeakRef.deref()`、RSS。

**PGLite，4 轮，不干预：**

```text
baseline registry sizes: {"Entity":14,"Relation":6,"Property":26,...}
round 1: rss=564.3MB heapUsed=46.7MB delta={"Entity":3,"Relation":3,"Property":9} alive=[#1:CSD]
round 2: rss=773.6MB heapUsed=68.9MB delta={"Entity":3,"Relation":3,"Property":9} alive=[#1:CSD #2:CSD]
round 3: rss=988.0MB heapUsed=91.2MB delta={"Entity":3,"Relation":3,"Property":9} alive=[#1:CSD #2:CSD #3:CSD]
round 4: rss=1211.4MB heapUsed=113.9MB delta={"Entity":3,"Relation":3,"Property":9} alive=[#1:CSD #2:CSD #3:CSD #4:CSD]
stringifyAllInstances bound-state property names after: 24   (setup 前为 0)
Entity.instances names: ..., Animal, Kitten, Pet, Mirror, Animal, Pet, Pet_base, Animal, Pet, Pet_base, ...
Relation.instances names: ..., AuthorEngagedPost, AuthorEngagedPost, Author_likedPosts_likedBy_Post, Author_sharedPosts_sharedBy_Post, ...
synthesized Animal.properties: nick,toyCount,_Cat_toyCount_bound_count,__type
synthesized AuthorEngagedPost.source.properties: name,postCount,totalScore,_Author_postCount_bound_count,_Author_totalScore_bound_sum
```

（`C`/`S`/`D` = Controller / System / Database 的 `WeakRef.deref()` 非空。）每轮 Property +9 = 6 个 bound-state 属性 + 3 个 `__type`；Entity +3 = transformed `Animal`、transformed `Pet`、虚拟 `Pet_base`；Relation +3 = transformed `AuthorEngagedPost` + 两个 rebase 出来的 filtered input。四轮结束时全部 4 个 Controller / System / Database 仍存活；RSS 每轮 +≈215 MB。

**SQLite 对照（2 轮）**：注册表增量相同（`Entity+3, Relation+3, Property+9`）、三者同样全部存活、heapUsed 每轮 +0.5 MB、RSS 平稳（SQLite 内存开销小）。说明保留由框架侧引起，与驱动无关；PGLite 只是让它以 RSS 形式可见（WASM 线性内存在 JS 堆外）。

**因果实验 A：只截断 `Property.instances`（`truncate-property`）**

```text
round 1..4: delta={"Entity":3,"Relation":3} alive=[#1:CSD ... #4:CSD]
```

`Property` 注册表停止增长、`stringifyAllInstances` 中 bound-state 名归零，但 **Controller / System / Database 全部仍存活**。问题陈述 §2 的保留链只是其中一条；`Entity.instances` / `Relation.instances` 中的派生定义（R3、R5–R8）通过 clone 图间接持有同一批 bound-state Property 闭包，构成第二族保留链。

**因果实验 B：截断 `Property` + `Entity` + `Relation`（`truncate-all`）**

```text
round 1: rss=407.5MB heapUsed=29.0MB delta={} alive=[#1:---]
round 2: rss=422.4MB heapUsed=28.3MB delta={} alive=[#1:--- #2:---]
round 3: rss=423.3MB heapUsed=28.0MB delta={} alive=[#1:--- #2:--- #3:---]
round 4: rss=423.8MB heapUsed=28.0MB delta={} alive=[#1:--- #2:--- #3:--- #4:---]
```

三个 `WeakRef` 全部释放，RSS 与 heapUsed 平稳。这同时证明：**除 Klass 注册表之外，框架没有其它静态结构持有 Controller 图**（`rg` 复核：`src/` 内模块级可变容器只有 `KlassByName`、`propertyTypes` / `propertyTypeStorage` 的类型注册表、若干 `WeakMap` 与 `AsyncLocalStorage`；无 `setInterval` / `process.on` / 长期定时器，`transaction.ts` 231 行的 `setTimeout` 是一次性重试等待）。

**结论（要求 1）：问题存在**，且范围大于问题陈述：保留链有两族——
(a) 直接链：`Property.instances → 派生 bound-state Property → defaultValue 闭包 → RecordBoundState → controller → system → db`；
(b) 间接链：`Entity.instances / Relation.instances → merged 编译派生的 Entity / Relation → properties / source / target / baseRelation → RefContainer clone 图 → 同上 bound-state Property 闭包 → controller`。
两族的根因相同：派生定义走了面向用户声明的 `X.create()` 注册路径，而 `RecordBoundState` 系统属性的 `defaultValue` 闭包捕获了整个 `RecordBoundState`。

### 1.4 `globalThis.gc` 在本仓库 vitest 配置下的可行方式（设计期验证 3）

用临时 spec（已删除）在 `vitest.config.ts` 默认配置下实测：

| 方式 | 结果 |
|------|------|
| `npx vitest run <spec>` 不加任何参数 | `typeof globalThis.gc === 'undefined'` |
| `NODE_OPTIONS=--expose-gc npx vitest run <spec>` | `typeof globalThis.gc === 'function'`（子进程继承 `NODE_OPTIONS`） |
| spec 内 `v8.setFlagsFromString('--expose-gc')` + `vm.runInNewContext('gc')` | 无需任何命令行参数即得到可用的 `gc`；`WeakRef` 在 3 次 gc 后 `deref()` 为 `undefined`（已验证） |

裁定：可回收性测试用第三种方式获取 `gc`（先取 `globalThis.gc`，缺失时用 `v8.setFlagsFromString` 兜底），因此**无条件运行**，不需要 skip 分支；`NODE_OPTIONS=--expose-gc` 作为等价运行入口写入文档。

### 1.5 基线（任务开始时）

- Git：HEAD `0249556`（`docs: review the paradigm gap list against main and rule on each item`）。工作树未跟踪文件：`agentspace/output/effect-ts-evaluation.md`、`prompt/output/controller-retention-via-property-instances.md`、`docs/controller-retention-via-property-instances/`。无已跟踪文件改动。
- `npm run check`：通过。
- `npx vitest run tests/core tests/storage/review-fixes-2026-07-10-r12.spec.ts tests/runtime/review-fixes-2026-07-12-r23.spec.ts tests/runtime/migration.spec.ts`：28 文件 / 649 用例全部通过（65 s）。
- 真实 PostgreSQL（本机 PostgreSQL 17.6，`INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npm run test:postgres`）：11 文件 / 48 用例全部通过（21 s）。
- 没有任务开始前已存在的失败。

---

## 2. 目标与非目标

| Task 要求 | 处理 |
|-----------|------|
| 1 求证 | §1.3 已完成：存在，两族保留链，8 个登记点 |
| 2 FR-RET-01 | §3.1–3.3：统一的非注册构造路径 `derive`；切断闭包捕获；不截断注册表；用户声明与 Klass 模式不变 |
| 3 FR-RET-02 | §3.4：裁定「`system.destroy()` + 丢弃引用」为唯一结束合同；不新增 API；文档与 CHANGELOG |
| 4 不变量与回归 | §3.5、M-01 / M-03 / M-04 |
| 5 非目标 | 见下 |

非目标（硬约束，逐条对应要求 5）：

- 不改变 `Property.create()` uuid 去重的线性扫描（注册表停止增长后自然缓解）。
- 不引入注册表自动清空、弱引用化、代际管理；不新增隐式行为。
- 不改数据库驱动。
- 不重构 Klass 模式、`stringifyAllInstances` / `parse` 的序列化格式。
- 不处理 `stateItem.defaultValue instanceof Property` 分支改写用户 Property `name` 的既有行为（不属于保留问题）。

---

## 3. 方案

### 3.1 汇合点：`static derive(args)` —— 派生定义的唯一构造路径

在 `Entity`、`Relation`、`Property` 三个 Klass 上新增：

```ts
// 语义：与 create 相同的声明期校验，得到一个 **不登记进 instances、不参与
// stringifyAllInstances、拥有新 uuid** 的实例。用于框架在 setup / migration /
// storage 编译期合成派生定义（与 clone 的「运行时工作副本」语义同族）。
// 不用于用户声明：用户声明必须走 create()。
static derive(args: XCreateArgs): XInstance
```

实现方式：把 `create()` 现有校验块提取为私有静态 `validateCreateArgs(args)`（Klass 内部函数，不导出），`create = validate + new + 去重登记`，`derive = validate + new`。`create()` 对用户声明的校验与登记行为逐字不变（要求 2「Klass 模式不变」）。三个 Klass 的 `derive` 形态一致，不接受 `options`（派生定义不得复用显式 uuid，与 `clone` 的 CAUTION 一致）。

选择 `derive` 而不是其它形态的理由：

- 「`create(args, { register: false })`」会把标志写进 `_options`，而 `_options` 随实例序列化（`stringifyInstance` 输出 `options: instance._options`），污染序列化格式；否决。
- 「直接 `new X(args)`」是 `clone` 的现状，但散落在三个文件里的 `new` 没有名字、不可枚举、不带校验；不满足「一条明确路径」。
- 独立的 `deriveInstance(Klass, args)` 通用工厂需要给每个 Klass 暴露 `validate` 静态成员，表面更大；否决。

只有 Entity / Relation / Property 三个 Klass 存在运行时派生（§1.2）；其它 Klass 不加 `derive`（最小表面）。

### 3.2 全部登记点改走 `derive`（R1–R8）

| 登记点 | 改法 |
|--------|------|
| R1 / R2 | `MonoSystem.setup()` 删除自己的 state 注入循环，改为调用 `prepareEntitiesForStorage()`（两段代码逐字同构，`setup` 传给 `storage.setup` 的 `[...entities, DictionaryEntity, SystemEntity], relations` 与 `prepareEntitiesForStorage` 返回值完全相同）。`prepareEntitiesForStorage` 内 `Property.create` → `Property.derive`。汇合后运行时只剩一个 bound-state 属性注入点 |
| R3 | `Relation.create` → `Relation.derive` |
| R4 | `Property.create` → `Property.derive` |
| R5 / R6 | `Entity.create` → `Entity.derive` |
| R7 / R8 | `Relation.create` → `Relation.derive` |

对实例身份的影响（设计期验证 5）：`create` 与 `derive` 都产生新 uuid；`RefContainer.replace` / `findReplacement` 按 `===` 或 uuid 匹配，`add` 按 `===` / uuid 去重，与今天的行为完全一致。`Relation.create` 的 merged-with-properties 守卫（`Relation.ts` 361–365 行注释）在 R3 / R7 / R8 的实参上今天就已通过（无 `inputRelations`），`derive` 沿用同一校验不改变结果。

### 3.3 切断闭包对 Controller 图的捕获

`prepareEntitiesForStorage` 中：

```ts
const defaultValue = stateItem.defaultValue          // 纯值（number / string / boolean / object / null）
rootEntity.properties.push(Property.derive({
    name: stateItem.key,
    type: typeof defaultValue,
    collection: Array.isArray(defaultValue),
    defaultValue: () => defaultValue,                 // 不再捕获 stateItem
}))
```

`RecordBoundState.defaultValue` 在构造后不再被写入（`rg "\.defaultValue\s*=" src/runtime src/storage`：只有 `MergedItemProcessor.ts` 511 行改写合并属性、`Every.ts` 15/69 行改写 handle 自身字段），所以捕获值与捕获对象再读字段语义等价。

做了 3.2 之后派生 Property 已不进入任何静态根，捕获本身不再导致保留；仍然切断的理由：(1) 派生 Property 被 `Property.clone` 复用到 merged 属性、被 `mergeProperties` 的闭包再次捕获，任何未来把派生定义放进长寿命结构的读者都会重新连上 controller；(2) 与 R4 `createTypeProperty` 「只捕获纯值」的既有设计保持一致。可执行证据在 M-03 的可回收性测试中体现（不截断注册表、不做任何测试侧干预，三个 `WeakRef` 释放）。

### 3.4 FR-RET-02：Controller 图的结束生命周期合同

裁定：**以 `await system.destroy()`（或等价的 `await db.close()`）+ 丢弃对 Controller / System / Database 的全部引用作为唯一结束合同，不新增显式结束 API。**

依据：§1.3 因果实验 B 表明一旦注册表不含派生定义，框架没有其它静态结构持有 Controller 图（三个 `WeakRef` 全部释放）；`rg` 复核无定时器 / 进程级监听。因此仅靠 FR-RET-01 即可满足可回收性，「若且仅若不足才新增 API」的条件不成立。

合同内容（写入文档）：

1. 一个 Controller 图在 `await system.destroy()` 完成、且应用不再持有其引用后视为结束。
2. 结束后框架保证：用户声明注册表（`X.instances`）与 `KlassByName` 不持有该 Controller 图的任何对象；`stringifyAllInstances()` 输出与 `setup` 前相同；Controller / System / Database 可被 GC 回收。
3. 结束后再对该 Controller 调用 `dispatch` / `setup` 的行为未定义（与今天一致，`db.close()` 之后驱动报错）。
4. 用户声明（模块顶层 `X.create()`）的生命周期与进程相同，不随 Controller 结束而变化；这是既定语义，不是泄漏。`clearAllInstances` 仍是测试工具。
5. 与既有 `Controller.teardown()`（`src/runtime/Controller.ts` 596 行，r2 引入）的关系：`teardown` 服务于**另一个场景**——system（含 db）存活、仅替换 controller 时注销该 controller 的 mutation listener 与 dict 读回退，它不销毁数据库连接、也不是本合同的结束入口。整图结束（本合同）= `system.destroy()` + 丢弃引用；controller 单独替换 = `teardown()` 后丢弃 controller。因果实验 B 未调用 `teardown` 即三者全部回收，证明 storage listener 集合不构成静态保留根（listener 挂在 storage 实例上，随实例一起回收）。M-04 的两份文档必须把这两个入口区分表述，避免读者把 `teardown` 误当作生命周期合同（d=1 裁决轮补充；初稿未提及该 API）。

文档落点：
- `agentspace/knowledge/controller-lifecycle-and-declaration-registry.md`（新建，框架内部说明：注册表的设计对象、派生定义、`derive` 路径、保留链两族与因果证据、结束合同）。
- `agent/agentspace/knowledge/usage/13-testing.md` 新增小节「Controller lifecycle and cleanup」：同一进程内多次构造 controller 的清理方式与保证；`clearAllInstances` 只用于隔离用户声明。
- `CHANGELOG.md` `[Unreleased]`：Bug Fixes 条目（派生定义不再登记；Controller 图在 `destroy` 后可回收；`stringifyAllInstances` 不再包含系统属性 / merged 派生定义）+ Features 条目（`Entity.derive` / `Relation.derive` / `Property.derive`，框架内部用途）。

### 3.5 可执行不变量与回归（要求 4）

新增 `tests/runtime/derivedDefinitionRetention.spec.ts`，schema 与 §1.3 相同（覆盖 Count / Summation / Transform 的 `RecordBoundState`、filtered entity、merged entity（含虚拟 base）、merged relation、hard-deletion 属性、Transform 唯一索引），PGLite 为主、SQLite 为对照（`test.each`）：

1. **注册表不变量（无条件运行）**：快照 `KlassByName` 全部注册表长度 → 连续 3 轮 `Controller` 构造 + `setup(true)` + `destroy()` → 断言每个注册表长度与快照相等。当前 HEAD 预期失败：`Entity +3 / Relation +3 / Property +9` 每轮。
2. **可回收性（无条件运行）**：每轮对 Controller / System / Database 建 `WeakRef`，`destroy()` 后丢弃引用，`gc()` ×3（§1.4 方式）→ 三者 `deref()` 均为 `undefined`。当前 HEAD 预期失败（三者存活）。写法必须避开两个 V8 陷阱（评审实测踩过，d=1 采纳为实现约束）：(a) 目标对象在「只返回 `WeakRef` 的函数」内创建，避免测试帧栈槽/局部变量保活；(b) 判定 `deref()` 不与后续 `gc()` 同微任务循环（`WeakRef` KeepDuringJob 保活到当前 job 结束）。§5.2 的重试安排建立在该形态之上，不得靠放宽重试次数掩盖形态错误。
3. **`stringifyAllInstances` 纯净性**：`setup` 前后输出相等；额外断言输出中不含 `_..._bound_...` 名、不含 `__type`、不含 `Pet_base` / `__..._base`。
4. **同类位置覆盖（R1–R8 逐点，每站点一个独立 `test()`）**：`setup` 后按名断言：`Property.instances` 中无 bound-state 名（R1/R2）与 `__type`（R4）；`Entity.instances` 中 `Animal` / `Pet` 恰好各 1 条且 `===` 用户实例、无 `Pet_base`（R5/R6）；`Relation.instances` 中 `AuthorEngagedPost` 恰 1 条且 `=== AuthorPet`（R7）。R3 的登记产物携带 input relation 的**自动生成名**（`<source>_<sourceProperty>_<targetProperty>_<target>`），故按自动名断言：`Author_likedPosts_likedBy_Post` / `Author_hotLikedPosts_hotLikedBy_Post` / `Author_sharedPosts_sharedBy_Post` 各恰 1 条且 `===` 对应用户实例（未修复 2 条，修复后 1 条）。R8（虚拟 base relation `__<merged>_base`）**只在 merged relation 拥有 filtered input relation 时触发**——filtered view over merged relation 不产生虚拟 base relation（k=2 修正：初稿与 M-01 首版 spec 误以为 filtered-over-merged 触发 R8，审计 R8 触发探针证伪）；schema 因此以「plain input（带 `weight` 属性）→ 其 filtered 视图 → 以 `[filteredInput, plainInput]` 作 inputRelations」触发，断言无 `__AuthorEngagedPost_base`，且该 filtered input 自身的 R3 家族产物（`Author_hotLikedPosts_hotLikedBy_Post`）纳入按名断言。此外：migration 轨：`controller.setup(false)`（走 `prepareMigrationSchema` → R2）与 `createMigrationBaseline()` 后同样断言长度不变；一个 **import 期快照 sweep**（在模块声明完成后对 `Entity` / `Relation` / `Property` 三个注册表做身份快照，断言任何轮次后无快照外新条目）兜底「未枚举到的登记点」——快照天然包含框架内置的模块顶层声明，不需要硬编码名单（k=2 修正：首版的全注册表身份清查未容纳内置声明，任何修复后都不可满足）。计量时区分两条轨（评审注意事项 3，d=1 采纳）：`setup(true)` 每轮一批 state 注入（仅 R1）；`setup(false)` 每轮**两批**（`prepareMigrationSchema` 的 R2 一批 + `system.setup` 的 R1 一批）。修订后 schema 的红色基线数字：install 轨每轮 `Entity+3 / Relation+5 / Property+9`（Relation +5 = transformed `AuthorEngagedPost`、虚拟 `__AuthorEngagedPost_base`、三个 rebase 出来的 filtered input）；migration 轨 `setup(false)` 超出先行 `setup(true)` 为 `Entity+6 / Relation+10 / Property+18`，`createMigrationBaseline` 为 `Entity+9 / Relation+15 / Property+27`（三批）。
5. **闭包不捕获 controller（3.3 的可执行证据）**：对 `system.storage` 的 schema 中 bound-state 属性取 `defaultValue.toString()`，断言不含 `stateItem`；并用一轮「不 destroy、只丢弃 controller 引用但保留一个派生 Property」的对照，验证仅持有派生 Property 不会让 Controller 存活。（对照形态在实现期按实际可行性调整；核心是 2 已覆盖端到端。）

新增 `tests/core/deriveDefinition.spec.ts`：`derive` 校验与 `create` 一致（非法 name / 非函数 defaultValue / merged relation 带 properties 同样抛错）、不登记、uuid 新、`Entity.clone` / `RefContainer` 对 derive 实例的 replace / add 正常。

新增 `tests/core/runtimeCreateSiteAllowlist.spec.ts`（把「运行时合成一律走 derive」提升为可检查的不变量）：扫描 `src/runtime`、`src/storage`、`src/builtins`、`src/drivers` 源文件中 `\b(Entity|Relation|Property)\.create\(` 的出现位置，断言集合等于允许清单（`System.ts` / `Interaction.ts` / `ActivityManager.ts` 的模块顶层常量与 `Controller.ts` 的 `HardDeletionProperty`）。新增运行时 `create` 调用会使该测试变红，逼迫作者做出「用户声明还是派生定义」的显式决定。当前 drivers 无命中，纳入扫描只增不减（评审注意事项 5，d=1 采纳）。

维度注册表回填（`tests/runtime/WritingComputationTests.md`）：新增一行「运行时派生定义 × 登记面 × 持有 Controller 图」：取值 = 派生 Klass {Entity / Relation / Property} × 合成路径 {bound-state 注入（setup 轨 / migration 轨）/ merged 编译（判别列 / transformed / 虚拟 base / rebase filtered input）} × 观察面 {注册表长度 / `stringifyAllInstances` / `WeakRef` 可回收性 / 闭包捕获物}。历史逃逸：本任务（问题陈述只覆盖 Property 直接链，Entity / Relation 间接链由因果实验 A 揭示）。

既有套件复跑（修复触及 `Property.create` 重构、`MergedItemProcessor`、`MonoSystem.setup` / `prepareEntitiesForStorage`）：`npm run check`；`tests/core`；`tests/storage`（含 `writePathStructuralFuzz` 默认池）；`tests/runtime` migration 相关 spec（`migration.spec.ts`、`migrationGenerativeFuzz.spec.ts`、`migrationDestructiveFuzz.spec.ts`、`applicationIdentityMigration.spec.ts`）；`tests/storage/review-fixes-2026-07-10-r12.spec.ts`；`tests/runtime/review-fixes-2026-07-12-r23.spec.ts`；真实 PostgreSQL `npm run test:postgres`。

---

## 4. 里程碑

### M-01 红色基线：新增回归 spec 并确认在当前 HEAD 上失败

- 结果：`tests/runtime/derivedDefinitionRetention.spec.ts` 存在，§3.5 第 1–4 项用例在未修改生产代码的 HEAD 上失败，失败输出（注册表增量、存活的 `WeakRef`）记录到本文档「最新证据」。**每个站点一个独立 `test()`**（k=2：审计缺陷 A 逃过自检的机制就是单用例首断言失败遮蔽后续断言）。R8 的触发形态按修正后前提（filtered-input-into-merged，非 filtered-over-merged）落到 schema。
- 覆盖 Task 要求：1（复现固化为 spec）、4（注册表不变量 / 可回收性 / 纯净性 / 同类位置）。
- 前置：无。
- `reopen-count: 1`；`reopen-domains: { per-site 覆盖断言（判别力与可满足性）: 1 }`（审计轮 1：per-site 身份清查不可满足、R3 无判别力、R8 恒空，同一领域归组）。
- 状态：**已完成**（审计轮 2 复验通过，含一处验证缺口的审计侧直接加强）。
- 验收命令：`npx vitest run tests/runtime/derivedDefinitionRetention.spec.ts`（预期：红，且失败原因与 §1.3 数字一致：修订后 schema install 轨每轮 `Entity+3 / Relation+5 / Property+9`、三个 WeakRef 存活；失败输出中不得出现 `_System_` / `_Dictionary_` / `_Interaction_` / `_Activity_` / `activityInteraction`）；`npm run check` 通过（spec 本身能编译）。
- 最新证据（审计轮 2，2026-09-05，独立复验 + 审计侧加强）：
  - 验收复验：spec 全量 **13/13 红**（两次复跑一致）；每条红归因于派生定义登记本身，内置名（`_System_` / `_Dictionary_` / `_Interaction_` / `_Activity_` / `activityInteraction`）在失败输出中出现 **0** 次（`grep -c`）。全量运行计数自洽：R1/R2 bound-state 54（= 前 9 轮 × 6）、R4 `__type` 30（= 前 10 轮 × 3）、`Animal` 12、`AuthorEngagedPost` 13、`__AuthorEngagedPost_base` 13、R3 自动名 15、sweep 超出项 45（= 前 15 轮 × 3 派生实体）。隔离运行（`-t`）各站点单轮即红：R1/R2=6、R4=3、R5/R6=2、R7=2、R8=1、R3=2、sweep 恰为 `['Animal','Pet','Pet_base']`。`npm run check` 通过；与 `tests/core` 同跑（546 用例全绿）无污染。
  - 可满足性探针（`/tmp/interaqt-retention-audit/a2-*.mts`）：（a）新进程两轮逐名增量完全重复（两轮后无任何仅出现一次的懒加载登记条目）——修复后「每轮零增长」与 sweep 可满足；（b）import 期快照截断模拟修复后 `stringifyAllInstances()` 前后逐字节相等——纯净性用例可满足；（c）migration 轨隔离计量 `setup(false)` 为 `Entity+6/Relation+10/Property+18`、`createMigrationBaseline` 为 `+9/+15/+27`，与 spec 消息中预期一致。
  - **审计侧加强（验证缺口，产品实现未被证明错误）**：原 per-site / sweep 用例全部在 `destroy()` 之后观察注册表，「setup 期登记、destroy 期反注册」的截断式伪修复（Task 要求 2 明确禁止的修法）可通过全部形态断言（探针 `/tmp/interaqt-retention-audit/a2-destroy-cleanup-pseudofix.mts`：post-destroy 观察 bound=0 / `__type`=0 / `Animal`=1 / base-rel=0 全通过）。已把观察点移到 `oneRound` 的 `observe` 回调（setup 之后、destroy 之前捕获，destroy 后断言），并用注入实验复验判别力（`a2-pseudofix-discrimination.mts`：伪修复下 R1/R2=6、R3=2、sweep 含 3 派生实体，全部抓红；未修复 HEAD 上仍 13/13 红、计数不变）。
  - k=2 实现轮的三项缺陷修正（均只动 spec）经独立复验成立：A（sweep 隔离恰为 3 派生实体名，内置声明经 import 期快照天然容纳）、B（R3 按自动名隔离 2 条可判别）、C（R8 filtered-input-into-merged 隔离 1 条可判别）。
  - 历史证据（k=1 首版，7/7 红，schema 无 `weight` 属性与 filtered input，Relation 每轮 +3）：保留于 retro.md 轮次记录，不作为修复后的基线。

### M-02 core：`Entity.derive` / `Relation.derive` / `Property.derive`

- 结果：三个 Klass 的 `create()` 拆为共享校验 + 登记；`derive()` 为校验 + 直构；`create()` 行为与错误信息逐字不变。`tests/core/deriveDefinition.spec.ts` 绿；`tests/core/runtimeCreateSiteAllowlist.spec.ts` 存在且在本里程碑**红**（R1–R8 仍是 `create`），其允许清单固定为 §1.2 的用户声明 / 模块顶层项。
- 覆盖 Task 要求：2（汇合点、Klass 模式不变、用户声明语义不变）。
- 前置：M-01。
- `reopen-count: 0`；`reopen-domains: {}`。
- 状态：**已完成**（实现轮 k=3 完成并通过验收；审计轮 a=3 复验通过并直接加强 allowlist，2026-09-05）。
- 实现要点（k=3）：
  - `Property` / `Relation`：校验块原样提取为私有 `validateCreateArgs(args): void`；`create = validate + new + uuid 去重登记`，`derive = validate + new`（无 options，`generateUUID(undefined)` 产生新 uuid，`_options` 为 undefined）。
  - `Entity`：`validateCreateArgs` 返回 `{ retention, identity }`（`normalizeEntityRetention` / `normalizeEntityIdentity` 在校验内一次完成，两条路径消费返回值；不重复调用）。
  - `Relation` 的构造函数内守卫（merged / filtered / 对称 / reliance）随 `new Relation` 对 `create` 与 `derive` 同时生效，无需复制。
  - 三处 `derive` 均带「框架内部专用」注释：不登记、不参与 `stringifyAllInstances`、不复用显式 uuid，与 `clone` 的运行时工作副本语义同族但携带与 `create` 相同的声明期校验。
- 验收命令（k=3 实测；a=3 独立复验一致）：
  - `npx vitest run tests/core`：**26 文件全绿 + allowlist 1 文件红（583 通过 / 1 失败 = 合计 584）**；唯一失败即 allowlist 主断言，失败输出恰好列出 R1–R8 8 处（`MonoSystem.ts:2381/2437`，`MergedItemProcessor.ts:399/418/536/539/553/564`），无其它差异。措辞修正（k=3，实现轮内设计订正）：原文「`npx vitest run tests/core`（全绿）」与本里程碑「allowlist 红」自相矛盾——allowlist spec 位于 `tests/core`，本里程碑的正确读法是「除 allowlist 外全绿」；M-03 落地 R1–R8 后 `tests/core` 才整体全绿。
  - `npx vitest run tests/core/deriveDefinition.spec.ts`：**35/35 绿**（不登记 ×3、`stringifyAllInstances` 纯净、create 仍登记的对照、uuid 新、arity/`_options`、Property 5 + Entity 5 + Relation 7 组「derive 与 create 错误信息逐字一致」判例、retention/identity 规范化一致、deep clone、`RefContainer` constructor/add/replace 对 derive 实例的身份合同）。
  - `npx vitest run tests/core/runtimeCreateSiteAllowlist.spec.ts`：**预期红**，失败输出 8 处与 §1.2 枚举逐项一致；另 2 个用例（扫描覆盖守卫、允许清单无死项）绿。**a=3 审计加强**：允许判定由文件成员资格升级为站点级结构谓词（模块顶层初始化器 / `HardDeletionProperty` 工厂），文件集合降级为收紧断言（恰好四个内置声明文件 + 恰好 1 个工厂站点）——原文件级判定在「白名单文件函数体内新增运行时 `X.create()`」时静默放行（注入实验 + 模拟 M-03 态证实）；强化后注入被抓红、模拟 M-03 干净态仍绿、8 处红不变。
  - `npm run check`：通过。
- 影响面复验（`create()` 内部重构触及全部三个 Klass，k=3 实测，a=3 独立复跑一致）：
  - `tests/runtime/declarationTabooFuzz.spec.ts` 默认池：81/81 绿（错误文本敏感）。
  - `tests/storage` 全量（含 `writePathStructuralFuzz` 默认池）：85 文件 846 通过 / 8 skip。
  - migration 相关 + review-fixes：`migration.spec.ts`、`migrationGenerativeFuzz.spec.ts`、`migrationDestructiveFuzz.spec.ts`、`applicationIdentityMigration.spec.ts`、`review-fixes-2026-07-12-r23.spec.ts`、`review-fixes-2026-07-10-r12.spec.ts`：163/163 绿。
  - `npm test` 全量：249 文件中仅 2 个设计内红（M-01 spec 13 用例 + allowlist 1 用例 = 14 failed；定向复跑确认计数），2755 通过 / 66 skip（postgresql* 套件无 env 按 baseline skip）。
  - M-01 spec 红数字不变：install 轨每轮 `Entity+3 / Relation+5 / Property+9`、migration 轨 `setup(false)` 批 `+6/+10/+18`、baseline `+9/+15/+27`；证明 `create()` 重构未改变登记行为。
  - 真实 PostgreSQL 套件（k=3 留待 M-03，a=3 实测补跑）：11 文件 / 48 用例全绿，与基线一致——`derive` 无生产调用点，`create()` 等价重构在真实 PG 上同样无行为差异。
- 最新证据（a=3，2026-09-05，独立复验）：验收命令逐项复跑一致；三文件 `validateCreateArgs` 与 HEAD 原校验块逐行对照零差异（守卫顺序、条件、错误模板）；`generateUUID` 语义（`options?.uuid || id_${++globalIdCounter}`）证实 derive 必然新 uuid；`Entity.parse` 走 `this.create`、派生实例不进序列化输出，parse 无影响；`RecordQuery.derive` 为无关既有实例方法，无命名冲突；allowlist 允许站点分类复核（四个文件全部顶层初始化器 / HardDeletionProperty 工厂，`rg` 全仓确认工厂无 `src/` 内调用点）；注入实验临时改动全部还原（`git diff --stat src/` = 三 core 文件 +58/−9）。

### M-03 runtime / storage：登记点全部改走 `derive`，切断闭包，`setup` 与 `prepareEntitiesForStorage` 汇合

- 结果：R1–R8 全部改为 `derive`；`MonoSystem.setup` 复用 `prepareEntitiesForStorage`；bound-state 属性 `defaultValue` 只捕获纯值。M-01 的 spec 全绿；allowlist spec 绿；既有套件与真实 PG 套件全绿。`/tmp` 复现脚本 `none` 模式下注册表 delta 为 `{}`、三个 `WeakRef` 释放、RSS 平稳（佐证，不作为验收门）。
- 覆盖 Task 要求：2（FR-RET-01 全部约束）、3（可回收性成立 → 结束合同不需要新 API）、4（复跑清单）。
- 前置：M-02。
- `reopen-count: 0`；`reopen-domains: {}`。
- 状态：**已完成**（实现轮 k=4 完成并通过全部验收命令；审计轮 a=4 独立复验通过，2026-09-05）。
- 实现要点（k=4，生产改动 `src/runtime/MonoSystem.ts` −63/+?、`src/storage/erstorage/MergedItemProcessor.ts` ±12 行，经 `git diff --stat` 复核）：
  - R1/R2 汇合：`MonoSystem.setup()` 删除自己的 state 注入循环，改为调用 `prepareEntitiesForStorage()` 并直接把其返回值交给 `storage.setup()`（此前 setup 自行展开 `[...entities, DictionaryEntity, SystemEntity]`，与 prepareEntitiesForStorage 返回值逐字相同，`storage.setup` 收到的图不变）。汇合点带注释说明 install 轨与 migration 轨共用同一编译入口。
  - bound-state 属性注入改走 `Property.derive`，`defaultValue` 闭包只捕获纯值 `defaultValue`（局部 const），不再捕获 `stateItem`；`stateItem.defaultValue instanceof Property` 分支逐字保留（用户声明路径，非登记点）。
  - R3 `Relation.derive`（`rebaseAsFilteredItem`）、R4 `Property.derive`（`createTypeProperty`）、R5/R6 `Entity.derive`（`transformMergedItem` 实体臂）、R7/R8 `Relation.derive`（transformed relation 与虚拟 base relation）。全部只改构造入口，实参与守卫触发面不变。
  - 按审计注意事项 2，`Scheduler.ts` AsyncTask 合成（raw `new`，不登记）**未迁移**——它不是登记点，不在本任务范围。
- 验收命令（k=4 全部实测通过）：
  - `npx vitest run tests/runtime/derivedDefinitionRetention.spec.ts tests/core`：**28 文件 / 597 用例全绿**——M-01 spec 13/13 由红转绿（注册表不变量 pglite+sqlite、可回收性、纯净性、R1/R2、R4、R5/R6、R7、R8、R3、sweep、migration 轨、闭包捕获）；`tests/core` 全绿意味着 allowlist spec 由红转绿（运行时登记点只剩 4 个内置声明文件的模块顶层站点 + `HardDeletionProperty` 工厂）。
  - `npx vitest run tests/storage`（含 `writePathStructuralFuzz` 默认池）：85 文件 846 通过 / 8 skip，与基线一致。
  - migration + review-fixes 六套件（`migration` / `migrationGenerativeFuzz` / `migrationDestructiveFuzz` / `applicationIdentityMigration` / r23 / r12）：163/163 绿。
  - 真实 PostgreSQL（本机 17.6，`INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npm run test:postgres`）：11 文件 / 48 用例全绿。
  - `npm run check`：通过。
  - `npm test` 全量（基础检查，`MonoSystem.setup` 被全部 runtime 测试覆盖）：234 文件通过 / 15 skip，2769 通过 / 66 skip——与 k=3 相比，此前的 14 个设计内红（M-01 13 + allowlist 1）全部转绿，无任何新增失败。
  - 佐证：`npx tsx --expose-gc /tmp/interaqt-retention/repro.mts 4 pglite none`——每轮 `delta={}`、四轮全部 `#n:---`（Controller / System / Database 三 `WeakRef` 均释放）、RSS 402→411 MB 平稳（修复前每轮 +≈215 MB）、`stringifyAllInstances` bound-state 名前后均为 0、`Animal`/`__type`/注册表名单与用户声明一致。
- 最新证据（a=4，2026-09-05，独立复验 + 两站点缺陷注入检验）：验收命令逐项独立复跑一致（597 / 846 / 163 / 48 / check / 干净树 `npm test` 2769 绿 0 红；第一次全量运行窗口与注入实验重叠，以恢复后干净树复跑为准）；diff 与 §3.2/§3.3 逐项一致（汇合返回值 `[...entities, DictionaryEntity, SystemEntity]` 与旧 `setup()` 展开逐字相同、HEAD 两循环逐字同构、`derive` 静态调用点恰 7 处 = 汇合点 + R3–R8、`create()` 重复 uuid 抛错而非复用故无身份语义差异、AsyncTask raw `new` 维持范围外裁定）；注入实验：R1/R2 站点 derive→create 被 6 用例抓红（注册表不变量 ×2、纯净性、per-site R1/R2、sweep、migration 轨），R4 站点同样 6 用例抓红；注入后恢复，工作树回到 k=4 结束态（+78/−64）。`/tmp` 佐证复跑：每轮 `delta={}`、四轮三 `WeakRef` 全释放、RSS 398→409 MB 平稳。工作树观察：`prompt/skill/` 两文件的 +236/−40 改动（14:00）是任务协议自身的会话启动工具，非里程碑生产改动，不参与构建测试。

### M-04 合同文档、CHANGELOG、维度注册表回填、全量回归

- 结果：`agentspace/knowledge/controller-lifecycle-and-declaration-registry.md` 新建；`agent/agentspace/knowledge/usage/13-testing.md` 新增「Controller lifecycle and cleanup」小节（含 §3.4 合同第 5 条：`teardown()` 与结束合同的场景区分）；`CHANGELOG.md` Unreleased 记录行为变化与新增 `derive`；`tests/runtime/WritingComputationTests.md` 维度登记册新增一行；`npm test` 全量通过；`npm run build` 通过（`derive` 进入 d.ts）。
- 覆盖 Task 要求：3（合同文档化与 CHANGELOG）、4（维度注册表回填）。
- 前置：M-03。
- `reopen-count: 1`；`reopen-domains: { 文档事实准确性（stringifyAllInstances 读者枚举与代码/设计/CHANGELOG 矛盾）: 1 }`（审计轮 5 缺陷 D1）。
- 状态：**已完成**（k=6 修正 D1；审计轮 6 复验通过并完成全任务终验，2026-09-05）。
- 验收命令：`npm test`；`npm run build`；`rg -n "derive|destroy" agentspace/knowledge/controller-lifecycle-and-declaration-registry.md agent/agentspace/knowledge/usage/13-testing.md CHANGELOG.md`（文档存在且含合同要点）；`rg -n "运行时派生定义" tests/runtime/WritingComputationTests.md`。
- 最新证据（a=6 最终核验，2026-09-05，全部独立复跑）：D1 修正逐字段对照 `migration.ts:1010–1117`（manifest 读 controller 图与 storage schema；`rg "stringifyAllInstances|KlassByName|\.instances" src/runtime/migration.ts` 零命中）与 `Interaction.ts:211`（parse round-trip），三方一致（知识文档 ↔ CHANGELOG:28 ↔ 设计 §1.1），同类扫描零残留（`utils.ts:80` 为信任边界注释，非读者枚举）；验收命令全绿——`npm run check`、`npm run build`（derive 仍入三个 d.ts）、rg 11/6/24/1、`npm test` 234 文件 / 2769 通过 / 66 skip / 0 失败；受影响里程碑定向 597 / 846 / 163 全绿；真实 PG 48/48 全绿；合同 §3 五条与 `teardown` 对照表未被扩写（destroy 链 / `Controller.teardown` / `getBoundStateName` 逐点对照代码一致）。Task 要求 1–5 逐项核验通过，最终核验通过，任务`已完成`。
  - **D1 修正（k=6）**：知识文档 §1 第 13–18 行读者枚举重写——`stringifyAllInstances()` 的产物供 `parse`（`createInstancesFromString`，graph 级 round-trip，`src/builtins/interaction/Interaction.ts:211` 注释）回读；migration manifest **不**是其消费者：`createMigrationManifest`（`src/runtime/migration.ts:1010`）读 controller 图（`controller.entities` / `relations` / `dict` / `scheduler.computationsHandles`，源码逐字段核实）与 storage schema，不读注册表、不调用 `stringifyAllInstances`；并保留该事实作为「派生定义移出序列化输出不影响 migration manifest」的依据（审计 §2 D1 要求的修正形态）。审计 §4 注意事项遵守：合同 §3 的 5 条保证与 `teardown` 对照表未动（仅改读者枚举句及其直接支撑句）。
  - 三方一致性复验（审计 §2 D1 验证方式）：`rg -n "migration manifest" agentspace/knowledge/...md` 的表述与 `rg "stringifyAllInstances|\.instances|KlassByName" src/runtime/migration.ts`（零命中）、CHANGELOG:28「the migration manifest never read the registries」一致；同类扫描（两份文档中全部「回读 / 消费者 / 读注册表」表述）无残留错误（同类命中 = 0）。
  - M-04 验收命令复跑（k=6 全部实测通过）：`npm run build` 通过，`static derive` 进入 `dist/core/Entity.d.ts:186` / `Property.d.ts:84` / `Relation.d.ts:153`（17:01 重建产物）；两处 `rg` 命中（知识文档 11 处 derive/destroy、usage 6 处、CHANGELOG 24 处；维度行 1 行 `tests/runtime/WritingComputationTests.md:321`）；`npm test` 全量 **234 文件通过 / 15 skip、2769 通过 / 66 skip / 0 失败**，与 k=5 / a=4 基线完全一致；`npm run check` 通过。
  - 历史证据（k=5 首次实现，验收命令当时已全通过；被 a=5 以 D1 退回）：四份文档交付物清单与 k=5 记录不变——知识文档（§1 注册表设计对象与读者、§2 派生定义 / `derive`、§3 结束合同 5 条 + `teardown` 对照表、§4 保留链两族与不新增 API 依据）、usage `13-testing.md`「Controller lifecycle and cleanup」小节、`CHANGELOG.md` `[Unreleased]`（概述 + Bug Fixes + Features + Docs 两条）、`WritingComputationTests.md` 维度行（`:321`）。

---

## 5. 风险与验证安排

### 5.1 设计期已验证的风险

| 风险 | 验证 | 结果 |
|------|------|------|
| 问题在当前 HEAD 上是否真实存在 | §1.3 最小复现（PGLite / SQLite） | 存在，两族保留链 |
| 保留链是否只有问题陈述那一条 | 因果实验 A / B | 不是；`Entity` / `Relation` 注册表中的 merged 派生定义构成第二族；除注册表外无其它静态根 |
| `RecordBoundState.controller` 是否经其它静态结构可达 | `rg` 模块级容器 + 因果实验 B | 否 |
| vitest 下能否稳定获得 `gc` | §1.4 三种方式实测 | `v8.setFlagsFromString` 兜底无需参数；`NODE_OPTIONS` 亦可 |
| `stringifyAllInstances` / parse / migration manifest 是否依赖派生定义出现 | §1.1 读者枚举 | 不依赖；manifest 不读注册表 |
| 非注册构造是否破坏 `RefContainer` 身份依赖 | §3.2 分析：`create` 与 `derive` 同样产生新 uuid，`RefContainer` 按 `===` / uuid 匹配 | 无影响 |
| 现有测试是否断言派生定义被登记 | `rg "(Entity|Relation|Property)\.instances" tests` | 无；`tests/core/review-fixes-core.spec.ts` 反而断言 clone 不登记 |

### 5.2 实现期验证的风险

| 风险 | 验证安排 |
|------|----------|
| `create()` 拆分校验时改变错误信息或校验顺序 | `tests/core` 全量（既有 taboo / declaration 守卫测试对错误文本敏感）；`tests/runtime/declarationTabooFuzz.spec.ts` 默认池 |
| `MonoSystem.setup` 改为复用 `prepareEntitiesForStorage` 后 `storage.setup` 收到的图不同 | 逐字同构已核对；`tests/storage` + `writePathStructuralFuzz` 默认池 + 真实 PG 套件 |
| `derive` 的 merged 守卫在某个合成形态上误拒 | `tests/storage` merged 相关 spec 与 `writePathStructuralFuzz` 扩展域（merged 在生成域内） |
| `defaultValue` 只捕获值改变某个计算的默认值语义 | `computationGenerativeFuzz` 默认池；`tests/runtime` 聚合 spec。`type: typeof stateItem.defaultValue` 在对象默认值时得 `'object'` 的既有瑕疵不在本任务修复范围，`derive` 沿用同一校验，不顺手改变列类型行为（评审注意事项 4，d=1 采纳为范围边界） |
| 可回收性测试在 CI 上抖动（GC 非确定） | §3.5 第 2 项的 WeakRef 形态（函数内创建 + 判定跨微任务）是前提；在此基础上 `gc()` ×3 + 每次 `setTimeout` 让出事件循环；断言前再做一轮；如仍抖动，放宽为「最多重试 gc 5 次」而不放宽断言 |

---

## 6. 基线

见 §1.5。
