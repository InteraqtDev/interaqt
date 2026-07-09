# 全代码库深度 Review 报告（2026-07-09 第四轮）

> **维护说明（2026-07-09 更新）**：本报告发现的问题已在同分支（`cursor/deep-code-review-r4-9580`）修复：
>
> - **致命 F-1 ~ F-3 全部修复**，回归测试见 `tests/runtime/review-fixes-2026-07-09-r4.spec.ts`（5 个用例）与 `tests/builtins/serialization-r4.spec.ts`（4 个用例）：
>   - F-1：`ActivityCall.isActivityHead` 函数体改用递归参数 `head`（原来误读 `this.graph.head` 导致 group 起点无限递归）。group 起点的多分支创建语义维持与线性 activity 一致：「head interaction 无 activityId = 隐式创建新 activity」，第二个分支带 activityId 在同一 activity 内推进；回归测试覆盖 every group 双分支完成的全流程。
>   - F-2 / I-7：builtins 序列化统一接入 core 管线——`Interaction.stringify` 改用 `stringifyInstance`（嵌套 Klass 编码为 `uuid::` 引用、函数编码为 `func::`）；全部 builtins 的 `parse` 与 core 对齐（`decodeFunctionValues` + 保持 uuid 身份）；`Transfer`/`ActivityGroup`/`Attributives` 注册进 `builtins/init.ts`。graph 级 round-trip（`createInstances`）现在可完整还原含 interactions/transfers/groups/conditions（含函数）的 Activity 图；standalone `parse` 的契约（`uuid::` 引用需 graph 管线）与 core 一致并在测试中固化。
>   - F-3：新增 `interaqt/drivers` 子路径导出（`vite.prod.config.ts` 多 entry + `package.json` exports）；四个驱动改为从主入口 `"interaqt"` 导入共享单例（`asyncInteractionContext` 等），drivers bundle 对主包保持 external（包自引用）。已验证 `npm run build` 后 `import('interaqt/drivers')` 可获得全部四个驱动，并以发布包形态跑通最小 controller 冒烟测试。README 快速示例补上 `import { PGLiteDB } from 'interaqt/drivers'`（README 其他位置早已使用该路径——文档承诺的导入路径此前在包里并不存在）。
> - **重要项修复**：R-1（`checkActivityState`/`completeInteractionState` 对不存在的 activityId 抛业务级 `activity ... not found` 错误）、R-2（`computeDirtyRecords` 归一化 computeTarget 四种返回形态：`{id}`/`{id}[]`/`{source,target}`/`[[s,t]]`，端点形态在 relation 宿主上按端点查询 relation 记录，entity 宿主上 fail-fast 抛 `ComputationProtocolError`）、R-3（source-map 对 `_self` 宿主 create 监听与业务 dataDep 已注册的宿主 create 监听去重，computeCalls 2→1，global dict 更新触发不受影响）、R-6.1（Property Average 负 count 守卫，与 PropertyCount 对齐）。
> - **明确遗留（建议独立 PR）**：R-4（`program` ActivityGroup 完成语义的产品决策）、R-5（Global StateMachine `initialState.computeValue` 契约文档化）、R-6.2/6.3（聚合 handle recordName 校验对齐 + relation 属性 update 增量测试，随六 handle 模板抽取一并处理）、R-7（dictionary defaultValue 进 modelHash + stableStringify undefined 处理）、第四节全部改进项。
>
> 修复后全量测试 1725 passed / 26 skipped（基线 1716，新增 9 个用例，更新 10 个既有序列化用例以匹配「parse 保持 uuid 身份」的统一契约）；`npm run check` 与 `npm run build` 通过。下文正文保留 review 时的原始判定，作为问题背景与复现依据。

- 日期：2026-07-09
- 基线：`main` @ `b9ee8404`（PR #20 合入之后，前三轮 review 修复全部落地）
- 范围：`src/core`、`src/runtime`（含 computations、migration）、`src/storage`、`src/builtins`（重点：Activity/序列化）、`src/drivers`、打包与发布配置（`package.json` / `vite.prod.config.ts`）
- 方法：四个方向并行深度探查（storage 删除/对称关系/查询修饰符 / runtime dispatch 与 builtins / computations 增量语义 / core 序列化+drivers+migration+打包）→ 人工精读交叉验证 → **对每个致命候选编写最小复现测试并实际运行**（PGLiteDB / SQLiteDB）。只有「已运行复现确认」的问题列为致命；仅凭精读判定的问题单独分级并标注置信度。
- 与既有报告的关系：前三轮（`full-codebase-review-2026-07.md`、`deep-review-2026-07-08-r2.md`、`deep-review-2026-07-09-r3.md`）的致命与重要项已全部修复并有回归测试；其「明确遗留」项（r3 的 R-4/R-5/R-6/R-8、六聚合 handle 模板抽取、I-1~I-16，r2 的驱动类型映射、级联深度、async task 清理、合表事件完整性、migration 运维项）仍然有效，本报告不重复展开。本报告发现均为**新增**。
- 基线健康度：`npm run check` 通过；`npm test` 全量 1716 passed / 26 skipped，全部通过；`npm run build` 成功。

---

## 一、结论摘要

前三轮把火力集中在 storage 读写路径、filtered entity、增量计算边界上，这些区域经三轮修复已明显收敛（本轮对 DELETE 级联、对称关系、查询修饰符、JSON 值处理、事务回滚边界的复查全部通过，见第五节）。本轮把纵深转向**此前零覆盖的区域**：Activity 图的非线性形态、builtins 的序列化 round-trip、以及**发布打包链路**——三处各查出一个已复现的致命问题。

值得注意的规律：本轮致命问题全部集中在「**测试从未走过的公开 API 形态**」——group 起点的 Activity（现有测试只有线性 head→group）、含 interactions/conditions 的 Activity/Interaction 序列化（现有测试只 round-trip 空 Activity 和 name/action）、npm 消费者视角的驱动导入（测试全部走 `@drivers` 路径别名，从不走发布包入口）。测试矩阵的盲区即缺陷聚集区。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命（已复现） | 3 | group 起点 Activity 无限递归栈溢出、Activity/Interaction 序列化 round-trip 断裂、发布包无法获得任何数据库驱动 |
| 重要（已复现） | 3 | 不存在的 activityId 抛裸 TypeError、StateMachine computeTarget 对象形式静默失效、global dataDep 触发同一计算双跑 |
| 重要（精读，高置信度） | 5 | `program` ActivityGroup 永久卡死、Global StateMachine initialState.computeValue 无 event 契约、Property Average 负 count 无守卫、聚合 handle recordName 校验不对称、dictionary defaultValue 变更不进 modelHash |
| 显著改进 | 若干 | 见第四节 |

---

## 二、致命问题（已编写复现测试运行确认）

### F-1 Activity 以 ActivityGroup 为起点：`isActivityHead` 无限递归，**构造期栈溢出**

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` L326–332：

```ts
isActivityHead(interaction: InteractionInstance, head: InteractionLikeNodeBase = this.graph.head): boolean {
    if (ActivityGroup.is(this.graph.head.content)) {          // ← 应检查参数 head.content
        return !!(this.graph.head as ActivityGroupNode)       // ← 应使用参数 head
            .childSeqs?.some(seq => this.isActivityHead(interaction, seq.head))
    } else {
        return interaction === this.graph.head.content        // ← 应比较参数 head.content
    }
}
```

  方法签名接收 `head` 参数并在递归时传入 `seq.head`，但**函数体三处全部读取 `this.graph.head`**——当 graph 起点是 group 时，`ActivityGroup.is(this.graph.head.content)` 恒真，递归永不落到 else 分支。
- 调用链：`new ActivityManager(activities)` → `buildActivityInteractionEventSource` L103 `activityCall.isActivityHead(interaction)` → 无限递归。
- 复现（REPRO-7，实测输出）：`Activity.create({ interactions: [], groups: [everyGroup], ... })`（并行分支直接作为流程起点，合法建模形态）：

```
RangeError: Maximum call stack size exceeded
  at ActivityCall.isActivityHead (ActivityCall.ts:326)  ← ActivityManager 构造期即崩 ❌
```

- 影响：任何以 group 为起点的 Activity（「多个并行分支组成的审批流」是常见建模）在 `new ActivityManager` 时就以裸 RangeError 崩溃，应用无法启动，错误信息与用户声明毫无关联。现有测试（`tests/runtime/data/activity/index.ts`）的图形态全部是「线性 head → group」，从未覆盖 group 即起点。
- 修复方向：函数体统一改用参数 `head`（`head.content` / `(head as ActivityGroupNode).childSeqs`）。**注意修复递归后还有第二层问题**：group 起点意味着多个分支 head 都会被判定为 `isHeadInteraction`，`wrappedGuard`（`ActivityManager.ts` L106–111）对每个无 `activityId` 的 head dispatch 都会 `activityCall.create()` 新建一条 `_Activity_` 记录——两个分支各自 dispatch 会把同一业务流拆成两条互不关联的 activity。需要同时决策：group 起点场景下只允许第一个分支隐式创建，其余分支无 activityId 时抛明确错误（或都要求显式创建）。修复必须附带 group-起点 activity 的完整测试。

### F-2 Activity 序列化 round-trip 断裂：`parse` 不还原 `uuid::` 引用，Transfer/ActivityGroup 未注册

- 位置：
  - `src/builtins/interaction/Activity.ts` L122–138（`stringify` 用 `stringifyAttribute` 把 interactions/transfers/groups/events 编码为 `"uuid::<id>"` 字符串）与 L162–165（`parse` 直接 `this.create(data.public)`，**不做任何 uuid 解码**）；`Transfer.parse`（L336–338）同构。
  - `src/builtins/init.ts` L14–26：`Transfer`、`ActivityGroup` 未 `registerKlass`，即使走统一管线（`createInstancesFromString`）也无法按 displayName 还原。
- 复现（REPRO-6，实测输出）：

```
const act = Activity.create({ name: 'R4Act', interactions: [a, b], transfers: [Transfer.create(...)] })
const parsed = Activity.parse(Activity.stringify(act))
parsed.interactions[0]  →  "uuid::id_87"（string）❌  应为 InteractionInstance
parsed.transfers[0]     →  "uuid::id_90"（string）❌
```

- 影响：parse 产物在任何运行时消费点（`ActivityCall` 构图 / `forEachInteraction`）都会把字符串当 Klass 实例使用而崩溃或静默错行为。现有测试仅 round-trip **空** Activity（`tests/builtins/attributive.spec.ts` L172–182），从未覆盖含节点的图。
- 修复方向：Activity/Transfer/ActivityGroup 的 parse 接入 core 的统一反序列化管线（uuid 引用需在 `KlassInstancesGraph` 上下文中解析，参考 `createInstancesFromString`），并把 Transfer/ActivityGroup 注册进 `init.ts`；或者明确这组 `stringify/parse` 不支持独立使用、从公开面移除并指向 `stringifyAllInstances`/`createInstancesFromString`。半可用的序列化 API 比没有更危险。

### F-3 发布包无法获得任何数据库驱动：README 快速上手在 npm 消费者侧**不可运行**

- 位置：
  - `src/index.ts` L1–4：主入口只导出 `runtime/storage/core/builtins`，**不含 `drivers`**；
  - `package.json` L49–62：`exports` 仅有 `"."`（`dist/index.js`），无 `./drivers` 子路径；
  - `vite.prod.config.ts`：build entry 仅 `src/index.ts`，alias 里也没有 `@drivers`。
- 复现（实测）：`npm run build` 成功后：

```
dist/drivers/ 只有 *.d.ts（类型声明），没有任何 .js 运行时产物
node -e "import('./dist/index.js').then(m => console.log('PGLiteDB' in m))"  →  false ❌
```

- 影响：README 的 Quick Example（L171 `new MonoSystem(new PGLiteDB())`）对安装 `interaqt` 的 npm 用户**没有任何合法 import 路径可以成立**——四个驱动（SQLite/PG/PGLite/MySQL）全部不可达，框架开箱即不可用。仓库内测试全部走 `@drivers` 路径别名，所以 CI 永远发现不了。这是 v2.0.0 已发布版本的打包缺陷。
- 修复方向：新增 `./drivers` 子路径导出（独立 entry 打包 `src/drivers/index.ts`，四个驱动依赖已在 rollup external 列表中），README 补 `import { PGLiteDB } from 'interaqt/drivers'`；不建议并入主入口（会把 better-sqlite3/pg/mysql2 变成主包的隐式可选依赖解析负担）。修复后应加一个「以发布包形态 import」的冒烟测试（pack + 从 tarball import）。

---

## 三、重要问题

### R-1 不存在的 `activityId`：guard 阶段抛裸 `TypeError`（已复现）

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` L289–291（`getState` 对不存在的 activity 返回 `undefined`）→ L334–338（`checkActivityState` 直接 `new ActivityState(undefined, ...)`）→ `ActivitySeqState.create` 读 `undefined.current`。`completeInteractionState`（L349–351）同族。
- 复现（REPRO-2/2b，实测输出）：

```
dispatch(es, { activityId: '01890a5d-…'(合法 uuid 格式、不存在) })
  → error: TypeError :: Cannot read properties of undefined (reading 'current') ❌
dispatch(es, { activityId: 'non-existent-id'(非 uuid 格式) })
  → error: invalid input syntax for type uuid（PGLite 裸 DB 错误）❌
```

- 影响：API 边界输入（客户端传来的 activityId）导致内部 TypeError / 裸数据库错误，与相邻路径已有的受控错误（`activityId must be provided ...`）风格断裂，`forceThrowDispatchError` 场景下极难诊断。
- 修复方向：`checkActivityState` / `completeInteractionState` 入口 fail-closed：`getActivity` 为空时抛 `activity ${activityId} not found` 的业务级错误。

### R-2 PropertyStateMachine `computeTarget` 返回 `{source, target}` 对象：转移静默失效（已复现）

- 位置：`src/runtime/computations/StateMachine.ts` L73–76 声明了 `ComputeRelationTargetResult = SourceTargetPair | {source, target} | undefined` 等类型（**死类型，无任何实现消费**）；`computeDirtyRecords` L183–197 对返回值只做 `.flat().filter(Boolean)`——`{source, target}` 对象整个保留，`record.id === undefined`，`lock(dirtyRecord)` 失败后 `ComputationResult.skip()`（L202–203），无错误无日志。
- 复现（REPRO-1，实测输出）：Follow 关系 create 触发 User.status 转移，`computeTarget: e => ({source: {id}, target: {id}})`：

```
create Follow 后：users = [{status:'pending'}, {status:'pending'}] ❌（应为 'linked'，且无任何报错）
```

- 影响：类型层面像是承诺过的返回形态（且 `[[s,t],…]` 数组对形式恰好能被 `.flat()` 展开而工作），对象形式静默 no-op。与 r2 F-3（trigger.keys 死 API）同族——「类型系统允许的声明静默失效」。
- 修复方向：`computeDirtyRecords` 统一归一化 `{id}` / `{id}[]` / `[[s,t]]` / `{source,target}` 四种形态；无法归一化的形态抛 `ComputationProtocolError`。同时删掉或真正实现那组死类型。顺带：`lock` 失败（stale id）建议加 debug 日志，消除静默 skip 的排查黑洞。

### R-3 property 计算声明 global dataDep 时：宿主 create 触发同一计算**两次**（已复现）

- 位置：`src/runtime/ComputationSourceMap.ts` L116–124——存在 global dataDep 时额外注册 `_self` 的宿主 create 监听（初始化用），但与该计算其余 dataDep 自身的宿主 create 监听**不去重**；`Scheduler.ts` L388–404 的 listener 对同一 (computation, event) 无去重。
- 复现（REPRO-4，实测输出）：`dataDeps: { _current: property, threshold: global }`：

```
create Item 后：computeCalls = 2 ❌（值正确，但完整 compute 执行了两遍）
```

- 影响：值正确（两次都是全量求值），但对昂贵计算 / async 计算（会创建两条 async task）/ 含外部副作用的 Custom 是实打实的双跑。宿主实体高频创建的场景计算量翻倍。
- 修复方向：在 source-map 初始化时对「同 computation × 同 recordName × 同事件类型」的监听去重（`_self` 与业务 dataDep 合并）；或在 Scheduler 的单事件分发循环内按 computation 去重。

### R-4 `program` ActivityGroup：注册了类型但无完成语义，activity 永久卡死（精读，高置信度）

- 位置：`src/builtins/interaction/activity/ActivityCall.ts` L458–460——`ProgrammaticActivityStateNode` 空类注册进 `GroupStateNodeType`，无 `onChange`、无人调用 `complete()`。声明 `ActivityGroup.create({type: 'program'})` 合法、运行时永远无法越过该 group。
- 修复方向：实现完成语义（暴露程序化 complete 入口）或从类型注册表移除并在声明期拒绝。

### R-5 Global StateMachine `initialState.computeValue` 在 setup 期收到 `event === undefined`：契约未声明（已实测行为，语义分级）

- 位置：`StateMachine.ts` L108–110（Global 的 `getInitialValue` 把 `event` 透传给 `computeValue`，setup 调用链 `Scheduler.setupGlobalComputationDefaultValue` L356–364 不传 event）。对照 Property 路径（L164–177）有显式 assert 与分支。
- 实测（REPRO-10）：`computeValue: (last, event) => event?.record?.reason ?? 'unknown-reason'` 在 setup 后 dict 值为 `'unknown-reason'`——回调必须自己防御 undefined，框架无任何提示。若用户直接解构 `event.record` 则 setup 崩溃且栈指向用户代码。
- 修复方向：文档化「initialState.computeValue 的 event 恒为 undefined」，或与 Property 路径对齐加保护性错误消息。

### R-6 计算层三处漂移（精读，高置信度，与六 handle 模板抽取同根）

1. **Property Average 无负 count 守卫**：`Average.ts` L308–311 返回 `count > 0 ? sum/count : 0`，count 被减成负数时静默产出错误比例；对照 `Count.ts` L287 有 `count < 0 throw`。
2. **update 分支 recordName 校验不对称**：`Every.ts` L252 / `Any.ts` 在 relation 属性 update 分支显式校验 `relatedMutationEvent.recordName`，`Count/Summation/Average/WeightedSummation` 不校验——当前路由下正确，路由扩展时是漂移温床。
3. **relation 属性 update 的增量路径测试缺口**：`count.spec.ts`/`summation.spec.ts` 对 relation 侧 `& field` 只覆盖 create，update 增量无回归。

### R-7 migration：dictionary `defaultValue` 变更不进 modelHash / diff（精读，高置信度）

- 位置：`migration.ts` L929–938 / L1547–1566——manifest 对 dictionary 只收集 `type/collection/computed`；函数型 defaultValue 变更完全不可见，`setup(false)` 直接放行。与已修复的 r2 R-8（bound-state defaultValue 进签名）同族漏项。
- 修复方向：复用 `serializeState` 的函数文本哈希模式（L722–730）收集 dictionary defaultValue。同族顺带：`stableStringify`（L542–551）对值为 `undefined` 的字段产出 `"key":` 空片段，应显式省略键或序列化为 null，保证 hash 输入恒为合法 JSON 文本。

---

## 四、显著值得改进的地方

### 4.1 storage / 查询语义（本轮实测确认的两项语义陷阱）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-1 | 查询结果丢弃 SQL NULL（实测确认） | `QueryExecutor.ts` L119–121 `if (value !== null) setByPath(...)` | `create({subtitle: null})` 后 find 返回的对象**没有 subtitle 键**（REPRO-12 实测）。与写侧 `['=', null]` 语义不对齐，下游 `record.field === null` 恒 false。至少在 USAGE_GUIDE 文档化「NULL = 键缺失」，或改为保留 null（行为变更需评审） |
| I-2 | `!=` 对 NULL 行的三值逻辑（实测确认） | `MatchExp.ts` L211–231 | `category != 'news'` 不命中 category 为 NULL 的行（REPRO-14 实测返回 []）。标准 SQL 语义但对 JS 用户是陷阱；文档化或提供 `['is distinct from', v]` 算子 |
| I-3 | `like` 无 ESCAPE / 通配符转义 | `MatchExp.getFinalFieldValue` L211 | 用户数据里的 `%`/`_` 被当通配符；提供转义 helper 或 ESCAPE 子句 |
| I-4 | 写路径 boolean 归一化只在 driver 层 | `SQLBuilder.prepareFieldValue` L562–567 只处理 json | SQLite/MySQL 靠各 driver 的 `true→1` 兜底；应上提到 SQLBuilder 统一（读侧 `structureRawReturns` 已归一化） |
| I-5 | 合表部分删除发 `delete` 事件但物理行保留 | `DeletionExecutor.ts` L139–151 | 事件语义上区分 hardDelete 与 rowEviction，或文档说明 |
| I-6 | 后分页（x:n 剥离 LIMIT）缺根级 orderBy 重排 | `QueryExecutor.ts` L229–234 | 常规路径实测正确（REPRO-13），但按 x:n 关联字段排序时 tie-order 取决于 JOIN 顺序，非确定；dedupe 后按 modifier 重排根记录更稳 |

### 4.2 runtime / builtins

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-7 | Interaction 序列化未走统一 Klass 管线：函数丢失（实测确认） | `Interaction.ts` L169–217 | REPRO-11 实测：含 `Conditions` 的 Interaction round-trip 后 Condition 的 `content` 函数**丢失**（`stringify` 对嵌套 Klass 直接 JSON.stringify、`parse` 无 `decodeFunctionValues`）。简单字段（action/payload）表面存活（REPRO-5），但 guard 能力静默损毁。与 F-2 一并统一到 core 管线 |
| I-8 | `setup(true)` 不执行 entity/relation 级计算的 getInitialValue | `Scheduler.ts` L356–365（相关分支被注释） | 纯 entity/relation 级计算空库 install 后为 null 直到首次 mutation；文档化或补一次性 full compute |
| I-9 | 非 isRef 的 Entity/Relation payload 校验过弱 | `Interaction.ts` L517–519 | 任意 `{}` 通过 guard（r2 I-14 的延续）；`type: 'object'` 的 primitive 检查也接受数组，应排除 `Array.isArray` |
| I-10 | `saveUserRefs` 的 refs 合并不在 stateVersion CAS 保护内 | `ActivityCall.ts` L375–396 | 既有遗留 I-12 的再确认：refs 是无版本 read-modify-write，修 F-1 的多分支并行时优先级上升 |
| I-11 | records dataDep 的 DELETE 事件无 source-map 级预过滤 | `Scheduler.ts` L669–717 兜底 | 功能正确、大删除量时多余触发；可与 update 的 membership 预检对称 |

### 4.3 computations / core / drivers

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I-12 | MathResolver：Inequality.solve 忽略运算符方向、二次方程丢负根、多变量 throw | `MathResolver.ts` L315–367、L425–430 | RealTime 用作「翻转时刻」尚可，语义应文档化；实现 R-5（时间调度器）前还需 clamp 过去时间戳（`RealTime.ts` L14–47） |
| I-13 | RealTime property 初始值 `0` vs global `null` | `RealTime.ts` L78–79、L139–140 | boolean RealTime property 类型不一致 |
| I-14 | RefContainer.updateSpecificReferences 不遍历 computation 引用 | `RefContainer.ts` L309–350 | replace 后其他实体 `Property.computation.record` 仍指向旧对象；当前主线未消费该路径，防御性修复 + 测试 |
| I-15 | relation `type` 变更（1:n→n:n）缺 storage blocking 显式兜底 | `migration.ts` L1517–1531 vs `getStorageBlockingChanges` L2265–2346 | 中置信度：布局不变时可能仅逻辑层 changed 而 DDL 放行；补 relation type 专项测试确认 |
| I-16 | MySQL `LAST_INSERT_ID` 可能返回 bigint | `Mysql.ts` L137–139 | `Number()` 归一化并写入驱动契约 |
| I-17 | 对称 n:n 不阻止 (A,B)+(B,A) 双向重复边 | `CreationExecutor.ts` L417–427 | 现有测试有意允许；若语义是「无向边唯一」则 Count 会 double-count——需要产品决策后文档化 |
| I-18 | `BoolExp.find` 的 context 类型 `unknown[]` 实际按 `string[]` 使用 | `BoolExp.ts` L365–377 | 类型/语义不一致 |

### 4.4 测试矩阵缺口（本轮致命项的共同根因）

| 场景 | 现状 |
|------|------|
| group 为起点的 Activity（构图 + 多分支 dispatch） | **零覆盖** → F-1 |
| 含 interactions/transfers/conditions 的 Activity/Interaction 序列化 round-trip + 还原后 dispatch | 仅空 Activity / 仅 name+action → F-2、I-7 |
| 以发布包形态（pack + import tarball）的冒烟测试 | 零覆盖（全部走 `@drivers` alias）→ F-3 |
| computeTarget 四种返回形态矩阵 | 仅 `{id}`/`undefined` → R-2 |
| 无效 activityId | 零覆盖 → R-1 |
| global dataDep + 宿主 create 的调用次数断言 | 零覆盖 → R-3 |
| relation 属性 update 的 Count/Summation/Average 增量 | 仅 create → R-6.3 |

### 4.5 既有报告遗留项（仍有效）

r3 的 R-4（asyncReturn advisory lock）、R-5（RealTime 时间调度器）、R-6（迁移终态 phase）、R-8（批量 1:n 孤儿告警）、I-1~I-16；r2 的驱动类型映射统一、级联深度上限、async task 清理、合表事件完整性（本轮 storage 复查确认 `flashOutCombinedRecordsAndMergedLinks`/`relocateCombinedRecordDataForLink` 的内部 `deleteRecordSameRowData`/`insertSameRowData` 仍不传 events——该路径当前仅显式 mergeLinks 配置可达，维持「先决策 mergeLinks 去留」的结论）；六聚合 handle 共享模板抽取（本轮 R-6 又见三处漂移，四轮累计 10 个具体缺陷，优先级应再次上调）。

---

## 五、本轮复查确认健康的区域

| 区域 | 结论 |
|------|------|
| dispatch 事务回滚 / guard 失败无部分事件 / retry 不重复 effects | `Controller.ts` L669–708 顺序正确；`transactionRetry.spec.ts` 覆盖 |
| 主 DELETE 路径 filtered membership（含级联 reliance 树快照） | `DeletionExecutor` + `FilteredEntityManager.collectDeletionMemberships` 在物理删除前快照 |
| 对称 n:n 的 match OR 双路径 / x:n 查询 / `&` 数据 | `MatchExp.buildFieldMatchExpression` L347–389 + 既有测试 |
| JSON/collection 字段 UPDATE round-trip（PGLite/SQLite 实测） | REPRO-8/8b 通过（SQLBuilder 不做 stringify，但各 driver 的对象参数兜底成立；上提归一化列为 I-4） |
| x:n 谓词 + limit/offset 的后分页去重（常规 SELECT） | REPRO-13 实测分页正确 |
| r3 修复的持久性：global dict key 过滤、records dataDep fail-fast、Transform lockRecord miss 清理、成员资格 changedFields | 复查 + 既有回归测试均在位 |
| ScopedSequence 并发 / 回滚 / gap 语义 | PG 100×2 并发测试在位；删除不回收为 by-design |
| isRef payload 存在性校验、嵌套 dispatch 拦截 | `checkPayload` L456–474 fail-fast |

---

## 六、修复优先级建议

**P0（应用无法启动 / 公开 API 断裂 / 发布包不可用，全部有复现）：**
1. F-3 驱动子路径导出（影响所有 npm 消费者，v2.0.0 已带病发布）+ 发布包冒烟测试
2. F-1 `isActivityHead` 递归修复 + group 起点多分支创建语义决策 + 测试
3. F-2 / I-7 builtins 序列化统一接入 core 管线（Interaction/Activity/Transfer/ActivityGroup/Conditions），注册缺失 Klass；或从公开面收缩

**P1（错误契约 / 静默失效 / 双跑）：**
R-1 activityId fail-closed、R-2 computeTarget 归一化 + 死类型清理、R-3 source-map 触发去重、R-4 program group 决策、R-6.1 Average 负 count 守卫。

**P2（契约文档化与防御）：**
R-5 initialState.computeValue 契约、R-7 dictionary defaultValue 进 modelHash + stableStringify undefined、I-1/I-2 NULL 语义文档化、I-3~I-18、测试矩阵缺口补齐（4.4 节）。

---

## 附录：复现测试代码（验证用，未提交为正式测试）

以下测试在 `b9ee8404` 上以 PGLiteDB/SQLiteDB 运行，结果如注释所示。修复时可改造为回归测试（断言改为正确语义）。

```ts
// F-1 (REPRO-7)：group 起点 Activity 构造期栈溢出
const group = ActivityGroup.create({ type: 'every', activities: [
  Activity.create({ name: 'seqA', interactions: [a] }),
  Activity.create({ name: 'seqB', interactions: [b] }),
]})
const act = Activity.create({ name: 'R4Parallel', interactions: [], groups: [group] })
new ActivityManager([act])
// RangeError: Maximum call stack size exceeded @ ActivityCall.isActivityHead:326 ❌

// F-2 (REPRO-6)：Activity round-trip 不还原 uuid 引用
const act2 = Activity.create({ name: 'R4Act', interactions: [a, b],
  transfers: [Transfer.create({ name: 't', source: a, target: b })] })
const parsed = Activity.parse(Activity.stringify(act2))
parsed.interactions[0]  // "uuid::id_87"（string）❌
parsed.transfers[0]     // "uuid::id_90"（string）❌

// F-3：发布包无驱动（npm run build 后）
// dist/drivers/ 只有 *.d.ts；package.json exports 仅 "."
import('./dist/index.js').then(m => 'PGLiteDB' in m)  // false ❌

// R-1 (REPRO-2b)：不存在的 activityId
await controller.dispatch(nonHeadES, { user, payload: {}, activityId: '01890a5d-…' })
// error: TypeError :: Cannot read properties of undefined (reading 'current') ❌

// R-2 (REPRO-1)：computeTarget 对象形式静默失效
StateTransfer.create({ trigger: { recordName: Follow.name, type: 'create' },
  current: pending, next: linked,
  computeTarget: e => ({ source: {id: e.record.source.id}, target: {id: e.record.target.id} }) })
// create Follow 后 status 仍为 'pending'，无报错 ❌

// R-3 (REPRO-4)：global dataDep 双触发
Custom.create({ dataDeps: { _current: {type:'property',attributeQuery:['value']},
                            threshold: {type:'global',source:thresholdDict} }, compute })
await storage.create('R4dItem', { value: 10 })
// computeCalls === 2 ❌（应为 1）

// I-7 (REPRO-11)：Interaction round-trip 丢失 condition 函数
const ix = Interaction.create({ name: 'R4CondIx', action,
  conditions: Conditions.create({ content: BoolExp.atom(Condition.create({ name:'c', content: async () => true })) }) })
const p = Interaction.parse(Interaction.stringify(ix))
// p.conditions.content.data = {_type:'Condition', name:'c'} —— content 函数丢失 ❌

// I-1 (REPRO-12)：NULL 值从查询结果中消失
await storage.create('R4nDoc', { title: 't', subtitle: null })
const found = await storage.findOne('R4nDoc', matchId, undefined, ['*'])
// 'subtitle' in found === false ❌（键整体缺失）

// I-2 (REPRO-14)：!= 不命中 NULL 行
// rows: {category:'news'}, {category:null}
await storage.find('R4tDoc', MatchExp.atom({key:'category',value:['!=','news']}), undefined, ['title'])
// → []（NULL 行被三值逻辑排除）
```
