# 问题描述：Controller 实例在 setup 后被模块级静态注册表永久保留

状态：问题描述，未附解法。请在 interaqt 源码上独立复现、定位并决定修法。
观测版本：interaqt 4.10.0（npm 发布产物 `dist/index.js`，类名被压缩；下文类名按 `dist/**/*.d.ts` 的公开声明还原）。
观测环境：Node 22.18，`@electric-sql/pglite` 驱动。数据库驱动只是让问题可见，不是问题所在。

## 1. 现象

在同一个 Node 进程内重复执行「构造 `Controller` → `controller.setup(true)` → 使用 → 释放引用」，每一轮之后：

- 进程 RSS 单调增长，每轮约 +250 MB（实体 128 / 关系 50 / 交互 271 的应用聚合；规模与聚合大小相关）。
- 对 `Controller`、`MonoSystem`、`Database` 实例各挂一个 `WeakRef`，在调用 `db.close()`、丢弃所有局部引用并用 `--expose-gc` 强制两次 GC 之后，三者 **全部仍然存活**（`deref()` 非空）。
- 对照：不经过 `Controller`，单纯 `new PGlite()` → `query('select 1')` → `close()` 循环，RSS 在第一轮之后保持平稳。因此增长来源是 interaqt 侧对 controller 图的保留，而不是驱动本身。
- `Property.instances.length` 每轮增加固定数量（该聚合下 +564），从不减少。

## 2. 保留路径（V8 heap snapshot，从 GC roots 到 Database 实例的最短路径）

```
(GC roots) → (Global handles) → ModuleWrap → SourceTextModule 的模块作用域
  → 闭包 Property（类对象）
  → .instances : Array                       ← 模块级静态注册表
  → [1753] : Property 实例                   ← setup 期间新建，不属于用户声明的任何实体
  → .defaultValue : 闭包
  → 闭包上下文捕获的 RecordBoundState 实例
  → .controller : Controller
  → .system : MonoSystem
  → .db : Database（此处为 PGLite，持有 WASM 线性内存）
```

验证：在 `setup()` 返回后，把 `Property.instances.length` 截回 setup 之前的长度，再 `db.close()` + GC，三个 `WeakRef` 全部变空，三轮之后 RSS 从 1221 MB 降到 613 MB 并趋于平稳。这一步只是用来确认因果，不是建议的修法。

## 3. 涉及的框架代码位置（按 4.10.0 dist 阅读，需在源码上核对）

1. `MonoSystem.setup(originalEntities, originalRelations, states, options)`：遍历每个 computation 的 `state`，凡 `RecordBoundState` 且带 `record` 的条目，为宿主实体追加一个系统属性。若 `state.defaultValue` 本身不是 `Property`，则执行

   ```ts
   entity.properties.push(Property.create({
     name: state.key,
     type: typeof state.defaultValue,
     collection: Array.isArray(state.defaultValue),
     defaultValue: () => state.defaultValue,   // 闭包捕获整个 state 对象
   }))
   ```

   `prepareEntitiesForStorage()` 中存在同样的一段。

2. `RecordBoundState.controller`（`runtime/computations/Computation.d.ts`）：在 controller 装配期间被赋值，使上述闭包间接持有 controller。

3. `Property.create()`（`core/Property.ts`）：每次创建都先在 `this.instances` 中做一次 `find(uuid)` 重复检查，再 `push` 进 `static instances`。该数组没有任何移除路径；`clearAllInstances(...klasses)` 会把传入类的整张注册表清空（包括用户在模块顶层声明的定义），`stringifyAllInstances()` 会遍历它做序列化。除这两处外，运行时不读取该注册表。

4. `Entity` / `Relation` 等其他 `create()` 工厂也维护同构的 `static instances`；本次只观测到 `Property` 这一条路径在 setup 期间增长，其余是否有类似的 setup 期注册未验证。

说明：setup 中实体是经 clone 得到的（用户声明的 `entity.properties` 长度在多轮 setup 后不变，见观测），所以问题不在「共享定义被反复 push」，而在「clone 上新建的 Property 被登记进全局注册表且永不注销」。

## 4. 复现步骤（无需任何具体应用）

1. 声明少量实体，并为其中至少一个属性挂上会产生 `RecordBoundState` 的 computation（任何在 `state` 中使用 `RecordBoundState` 的内建或自定义 computation 均可）。
2. 在一个进程中循环 N 次：`new Controller({ system: new MonoSystem(new <任意 Database>()), entities, relations, ... })` → `await controller.setup(true)` → `await db.close()` → 丢弃引用。
3. 每轮记录：`process.memoryUsage().rss`、`Property.instances.length`、对 controller 的 `WeakRef.deref()`（配合 `--expose-gc`）。
4. 预期观察：`Property.instances.length` 每轮递增且不回落；controller 的 `WeakRef` 在 GC 后仍非空；RSS 随轮次增长（PGLite 最明显，因为 WASM 内存在 JS 堆之外，`--max-old-space-size` 对它无约束）。

## 5. 影响面

- 任何在单进程内多次构造 controller 的场景：测试套件（每文件或每用例一个 controller）、迁移 / 校验工具、开发期热重载、多租户或多实例宿主。一个持续运行的 worker 里每次 setup 都会不可回收地累积一整套 controller 图与数据库实例。
- 在测试场景下，内存增长直接决定了可用的并行度和分片策略；WASM 内存不受 V8 堆上限约束，表现为宿主级 OOM 而不是 JS 堆异常。
- 次级效应：`Property.create()` 的重复 uuid 检查是对 `instances` 的线性扫描，注册表越大每次创建越慢；`stringifyAllInstances()` 的输出会把历史 controller 的系统属性一并序列化出来。

## 6. 需要回答的问题（供后续 session 探索）

- setup 期间为 `RecordBoundState` 生成的系统属性，是否应当进入面向「用户声明定义」的全局注册表？
- `RecordBoundState` 与 `Property.defaultValue` 闭包之间的引用关系，是否是框架期望的生命周期（controller 结束后仍然可达）？
- controller 是否有、或是否应当有一个明确的结束生命周期（`System.destroy` / `Database.close` 存在，但都不触及框架侧的静态注册表）？
- `Entity` / `Relation` / `Interaction` 等其他 `static instances` 在 setup 或 dispatch 路径上是否也有 setup 期新增？

## 7. 观测数据摘要

- 单轮 `setup(true)`：140 张表、525 个索引（含框架内部表），空闲机器约 1.1 s，其中数据库初始化与 DDL 各占约一半。
- 每轮 `Property.instances` +564；每轮 RSS +≈255 MB；`db.close()` 单独不改变 RSS 曲线。
- 截断 `Property.instances` 后：三轮 RSS 613 MB（对照 1221 MB），三个 `WeakRef` 全部释放。
