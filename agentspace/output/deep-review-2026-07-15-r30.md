# 全代码库深度 Review 报告（2026-07-15 第三十轮）

- 日期：2026-07-15
- 基线：`main` @ `e5abedbb`（v4.1.3，r1–r29 全部致命/重要修复已落地）
- 基线健康度：`npm run check` 通过；`npm test` 全量 **2129 passed / 38 skipped**；真实 PostgreSQL 16 就绪
- 范围：五路并行深度探查（storage 查询编译 + 写路径 / runtime 调度与计算 / builtins 交互与活动 / 迁移与并发 / drivers），聚焦 r29 复盘点名「fuzzer 未覆盖域」——事件驱动计算、async 计算、activity/interaction 层、迁移破坏性变异——以及 r28/r29 新改动代码
- 方法：与 r1–r29 全部报告逐条去重；每个候选先以最小复现实测定谳（对照 r27 前基线 `7cf5d200` 判定是否回归），再按 fix-the-class 清单收敛
- 修复状态：**四个已修复**（本分支 `cursor/deep-code-review-r30-9b9f`）；回归固化于 `tests/storage/review-fixes-2026-07-15-r30.spec.ts`（4 用例）、`tests/runtime/review-fixes-2026-07-15-r30.spec.ts`（5 用例）

---

## 一、结论摘要

| 级别 | 编号 | 主题 | 状态 |
|------|------|------|------|
| 致命（静默数据损坏） | A | filtered relation 落在 combined base 上 → 嵌套读取被 prune 误删（r28 引入 prune 后的回归） | 已修复 |
| 致命（静默错误结果） | B | async 计算：同步/resolved 新值被 pending 旧 task 完成时覆写回陈旧结果 | 已修复 |
| 致命（静默状态机损坏，activity 层） | D2 | 父级 Transfer 指向 group 内嵌套节点 → 跨分支改写 next 指针，破坏 every/any/race | 已修复 |
| 严重（fail-loud，迁移死路） | E | Transform 链上游输出收缩时的迁移被无条件拒绝 → 永久 kill-resume 死循环 | 记录（开放家族） |
| 重要（报错质量 / 健壮性） | D | isRef payload 传 null/非对象 → 裸 TypeError 而非干净守卫错误 | 已修复 |
| 记录（预存缺口） | — | filtered x:1 关系的谓词在嵌套读取上完全不生效（与 A 不同家族） | 记录 |
| 证伪 | C | 对称关系在 targetPath 中段的脏记录定位缺失 | 证伪（storage 双向查询已覆盖） |

**本轮最深的一课**：A 正是 r29 报告自己点名的开放家族 **EXT-1（merged/filtered × 组合拓扑的装配错位）** 的一个已可复现实例——r29 把 merged pair 限制在 CI 生成域之外来"止血"，但 **filtered relation × combined base** 这条正交路径没有被生成域覆盖，于是回归静默存活了一个版本（v4.1.3）。这再次印证 r28 复盘的判断：**生成域没铺到的形状，预言机再强也不响**。

---

## 二、致命问题（已修复确认）

### A｜filtered relation 落在 combined base 上，嵌套读取被幻影剪枝误删（fatal，r28 回归）

- **位置**：`AttributeQuery`（synthetic `&` 判定）与 `QueryExecutor.pruneUnpairedCombinedReads`（幻影剪枝）。
- **症状**：`PrimaryProfile = filtered(UserProfile, isPrimary=true)`，`UserProfile` 是 1:1 reliance（编译为 combined）。`find('User', ['primaryProfile'])` 对**真实配对**返回空——`primaryProfile` 整体消失。经 `findRelationByName` 读同一配对正确（link id 真相源），只有实体嵌套读取失明。
- **机制（两个拓扑读者分叉）**：r28 为「combined x:1 同行读取」自动附带 `&`(id) 以判配对真实性，剪枝据此剔除幻影同住。但：
  - `AttributeQuery` 的「是否 combined」判定走 `attributeInfo.isMergedWithParent()`——filtered relation 的 link（`createFilteredLink`）没有 `mergedTo`，`isCombined()` 恒 false ⇒ **不附带 `&`**；
  - `pruneUnpairedCombinedReads` 的 `isCombined` 走 `subQuery.attributeName`——filtered 查询构造时已把它解析为 **base 属性名**（combined）⇒ 判定为 combined、又找不到 `&`.id ⇒ **删除真实配对**。
  - 两侧读的是**同一逻辑事实的两个拓扑面**（filtered link vs base link），r28 加 prune 时只让 base-name 面进了剪枝、synthetic `&` 面留在 filtered link 面——分叉。
- **修复（收敛点）**：两侧统一按 **base 拓扑**判定。`AttributeQuery` 的 combined 判定改用 `attributeInfo.isLinkFiltered() ? attributeInfo.getBaseAttributeInfo() : attributeInfo`；并把 filtered 重写块**移到** synthetic `&` 块之前（此前 `relatedSubQueryData = {...subQueryData}` 会把 synthetic `&` 追加覆盖掉——r29 storage 子代理指出的第二处 bug，一并收口）。
- **兼联面（同族预存 bug，一并修复）**：filtered x:1 属性下的 x:n / 深层 x:1 **补全枝干**（`QueryExecutor` 三处）按 `record[attributeName]`（base 名）读取，而 filtered 结果挂在 `record[alias]` 上 ⇒ 永远补不出来。改为按 `alias || attributeName` 读取（对非 filtered 关系恒等，无行为差异）。
- **读者枚举**：combined 配对真相源的两个消费面（synthetic `&` 生成 / prune 判定）✅；filtered x:1 结果挂载点（主 JOIN 结构化用 alias ✅）与三个补全枝干（step 2 link-x:n、step 补全 x:n、step 递归 x:1）✅。
- **回归**：`review-fixes-2026-07-15-r30.spec.ts`（storage）4 用例（真实配对返回 / 显式 `&` 仍可取 / filtered x:1 下 x:n 补全 / 非 filtered combined 不受扰）。

### B｜async 计算：同步/resolved 新值被陈旧 task 覆写（fatal）

- **位置**：`Scheduler.runComputation` 结果处理块 + `isLatestAsyncTask`。
- **症状**：Custom/async property（如 URL.content 爬虫）：`url='slow'` 建 pending task T1；改 `url='preset'` 走 `ComputationResult.resolved` 同步落 `FAST`（**不建 task 行**）；T1 慢慢完成 → daemon `handleAsyncReturn(T1)` → `isLatestAsyncTask`（按 task id 排序、无更新 task）判 T1 为最新 → 用陈旧结果覆写 `FAST`。
- **机制**：异步最新性只以 task 行 id 排序判定。同步/resolved 路径产出新值不留 task 行 ⇒ 旧 task 在其"新鲜维度"里仍是最新。async→async 覆盖由新 task 更大 id 处理，唯独**同步覆盖 async** 这条缝没堵。
- **修复**：应用同步/resolved 结果前，对该 `freshnessKey` 上所有未 apply（pending/success）的 task **删除**（`invalidateSupersededAsyncTasks`）。删除而非标记 skipped：外部 worker 完成时按 id 盲写 `{result, status:'success'}` 会把 skipped 覆盖回 success（复活陈旧任务）；删除后该盲写命中 0 行（no-op），daemon 读不到 task → missing-task 跳过。两种时序（先删后到货 / 先到货后删）都收敛。
- **读者枚举**：`runComputation` 的同步/resolved apply 分支（唯一非 async-task-creation 的产出点）✅；async→async 由 id 排序覆盖，不受影响（回归 B-guard 固化：普通 async 仍正常 apply）✅。
- **诚实边界**：自定义 `args.freshnessKey`（`ComputationResult.async({freshnessKey})` 显式指定）时，纯同步路径（无 args）只能按默认键（record/context 派生）作废；resolved 路径 args 携带同 key 则命中。默认键覆盖最常见形态。

### D2｜活动父级 Transfer 跨分支改写 next 指针（fatal，activity 层，fuzzer 未覆盖）

- **位置**：`ActivityCall.buildGraph`。
- **症状**：`every` group 含两分支（branchA=[A1] 单步、branchB=[B1→B2]），父活动声明 `Transfer(source: A1, target: B2)`——A1/B2 都是 group 内嵌套节点。此声明**被静默接受**，`A1.next` 被改写为 B2 节点。运行期完成 A1 → `transferToNext` 沿污染指针走进 branchB → 状态机错乱，every/any/race 语义静默失效。
- **机制**：`rawToNode`/`uuidToNode` 是整条递归共享的实例状态，`rawToNode.get(A1)` 能解析到嵌套节点；而本层的 start/end 校验（candidateStart/End）只含本层 interactions/groups，`candidateEnd.delete(A1)` 对不在本层的 A1 是 no-op ⇒ 校验不响；单步嵌套源的 `next===null` 又让「同源多 transfer」守卫也不触发。
- **修复**：`buildGraph` 对「transfer 端点不属于本层 `interactions`/`groups`」fail-fast（清晰错误 + 指引用 ActivityGroup 建模分支）。
- **读者枚举**：transfer 循环是唯一接线 `next` 指针的产出点 ✅；本层合法 transfer（Head→group、branch 内 B1→B2）不受影响（回归 D2-guard 固化）✅。

---

## 三、重要 / 健壮性问题（已修复）

### D｜isRef payload 传 null/非对象 → 裸 TypeError（报错质量）

- **位置**：`checkPayload`（`Interaction.ts`）。
- **症状**：`dispatch(EditDoc, { payload: { doc: null } })`（HTTP 客户端常发 null）→ `null.id` 抛裸 `TypeError: Cannot read properties of null`，而非干净的 `InteractionGuardError`。集合形态 `[null]` / `['not-an-object']` 同理。
- **修复**：ref 校验先判「非空对象且有 id」（单值与集合两分支同构）。fail-loud 语义不变，仅把 obscure stack trace 换成业务级守卫错误。

---

## 四、记录，本轮不修（有明确理由）

### E｜Transform 链上游输出收缩时的迁移死路（fatal，narrow，fail-loud）

- **位置**：`migration.ts` `writeComputationPatch`（~3131 无条件拒绝 delete patch）+ `getDestructiveDeletionScope`（按当前数据独立计算各计算的 scope，不模拟级联）。
- **症状**：`Product --TransformA--> Deal --TransformB--> Promo`。V2 改 A 使部分 Deal 消失。A 全量重算发 Deal delete；B（依赖、有 pending 事件）走 `runIncrementalRecompute` → Transform 对孤儿 Promo 发 delete patch → `writeComputationPatch` **无条件拒绝**（`Migration refuses delete patch ... without explicit audited scope`）。SERIALIZABLE 回滚，resume 每次走同一死路。
- **根因**：依赖计算的可删除 scope 取决于上游**迁移后**状态，而 `getDestructiveDeletionScope` 在 diff 期按**当前**数据独立评估各计算（此时上游未收缩，Promo 的 compute 仍见旧 Deal）⇒ 依赖链的 stale id 无法被发现、无法被批准；即便放开 `writeComputationPatch` 的无条件拒绝去查 scope，也查不到对应 id。
- **为何不本轮修**：正确修复需要**级联感知的破坏性 scope**（按 rebuildPlan 依赖序模拟重算、累计各依赖实际删除，再据此批准）——这是迁移引擎级改动，贸然点修风险高于收益。fail-loud（迁移抛错、不静默损坏），可达面窄（Transform 链 × 上游收缩 × 迁移）。与 EXT-1 同等对待：建档，留待专门一轮迁移引擎改造。
- **复现**：见本报告附的 candidate E 复现骨架（`Product/Deal/Promo` 三级 Transform，阈值从 0 提到 15）。

### 预存缺口｜filtered x:1 关系的谓词在嵌套读取上完全不生效（与 A 不同家族）

- **症状**：`find('User', ['primaryProfile'])` 对 `isPrimary=false` 的 profile **仍返回**（谓词未生效）。isolated n:1 与 combined 1:1 两种拓扑皆然，且**在 r27 前基线上同样如此**（非 A 引入）。
- **根因**：嵌套 x:1 的子查询 `matchExpression` 在 JOIN 读取路径上根本不下推（普通 x:1 亦然，见复现 A3：非 filtered n:1 带 `matchExpression:{kind:'eng'}` 也不过滤）。filtered x:1 只是这条通用缺口的特例。x:n filtered 关系经 `findXToManyRelatedRecords` 的独立查询 WHERE 正确生效，所以既有 filteredRelation.spec.ts（全 x:n）全绿。
- **为何不本轮修**：需要把嵌套 x:1 子查询谓词下推为 JOIN ON / WHERE 条件——查询编译级改动，独立家族，风险与 A 不耦合。**A 的修复严格改善现状**（把「真实配对被删」变回「真实配对可见」），谓词缺口正交存在，不因 A 修复而恶化。建档为独立后续项。

### 其余记录项

- r28/r29 既有记录项（EXT-1 merged×x:1/combined Setup 装配、driver 自举 `_IDS_`、非空约束未映射 ConstraintViolationError、Activity 跨层 Transfer 孤儿 group、NOT(combined 路径) 三值逻辑分歧、MySQL 套件并行互扰等）：本轮探查无新增证据，维持记录。

---

## 五、证伪 / 未达门槛

| 候选 | 结论 |
|------|------|
| C：对称关系在 targetPath 中段的脏记录定位缺失（Scheduler `computeDirtyDataDepRecords` 的 TODO 注释） | 证伪：实测「朋友的帖子数」经对称 friends 跳中段的 property Count，删帖/删友双向脏记录定位均正确——storage 的双向查询（`findXToManyRelatedRecords` 反向属性）已覆盖，运行期未泄漏 |
| deepMatch 空对象/空数组模式匹配任意值（子代理 #3） | 未达致命门槛：`record:{tags:[]}` 语义是「tags 是某对象」而非「tags 为空」，属文档/语义澄清项；无静默数据损坏，记录 |
| async `asyncReturn` 返回 undefined 仍标 applied（子代理 #5，r20 记录项） | 维持记录：用户漏写 return 的形态，fail-silent 但非框架逻辑错误 |

---

## 六、逃逸分析（为什么此前没抓到）

完整复盘见 `r30-test-blindness-retrospective.md`（含对本节初版归因的修正）。本轮三个致命项的逃逸机理各不相同，恰好对应三种未覆盖侦测面：

1. **A（storage 查询）逃逸 = 预言机读取面缺格（初版归因于生成域缺格，经敏感性实验修正）**：
   事后实验证明 filtered-over-combined 的**形状自 r29 起就在 fuzzer 生成域里**（extended seed 2 即生成），
   此前全绿是因为**没有任何预言机读过「经 filtered 属性名的实体嵌套读取面」**——第 6 条（配对读取
   一致）只读 base 属性面，第 7 条（filtered 谓词一致）只读 relation-name 面。r30 新增预言机第 7b 条
   （filtered 嵌套读取完备性：link 面可见的配对必须出现在 filtered 属性嵌套读取里），在未修复代码上
   seed 2 当场变红、修复后 120 种子全绿。教训：**覆盖 = 生成域 × 预言机读取面的乘积**，登记册的
   「名字形态」轴（base 名 / filtered 名 / merged input 名）此前只应用在生成侧（写入经 filtered 名），
   从未应用在预言机的读取侧。
2. **B（async 运行时）逃逸 = fuzzer 不生成计算声明 + 手写夹具只测单一路径**：既有 async 测试只覆盖「纯 async→apply」与「纯 resolved→apply」，从不构造「同一 freshnessKey 上 async 与 sync 交错」——因为手写夹具的路径想象力恒为单路径。这是 r28 复盘「状态历史深度是轴」在 async 维度的投影：**混合返回类型的时序交错**是一根未登记的轴。
3. **D2（activity 层）逃逸 = 整层不在任何生成器辖区**：activity/interaction 层从未进入 fuzzer 生成域（r29 §1.5 明列）。手写活动测试只写「有意义的」图，不会写「transfer 指向 group 内嵌套节点」这种 taboo 形状——r27 命名的**夹具偏置**再次命中。fail-fast 守卫是对「类型系统接受但运行时不可用」死路径的标准收口（与 Gateway/program group 同族）。

三项的共同结论仍是 r27–r29 的主旋律：**发现新致命 bug 的产能已完全由机器化/清单化机制承担，而它们各有辖区且辖区不重叠**。本轮 A 靠「对照 r27 前基线判回归」的主动审计抓到、B/D2 靠「未覆盖域的定向探查」抓到——都不是既有 2100+ 手写用例能触发的。

---

## 七、给后续轮次的操作性规则（增补）

1. **从生成域移除形状 = 移出所有预言机辖区**：任何「暂时把某形状排除出 fuzzer 生成域」的止血决策，必须同时评估该形状的**静默损坏面**是否因此失守（A 的教训：EXT-1 移除止住 fail-loud，放走了 prune 误删的静默面）。移除决策要登记「移除放走了哪些预言机规则」。
2. **同一逻辑事实的多个拓扑面必须读同一真相源**：filtered link 面与 base link 面是同一配对事实的两个投影；任何「按拓扑判定行为」的消费点（synthetic `&`、prune、match 守卫、删除足迹）必须显式声明按 base 还是 filtered 面求值，并全枚举核对（A 的收敛修复样板）。
3. **混合返回类型的时序交错是 async 计算的固定审计轴**：同一 freshnessKey 上 async / sync / resolved / skip 的任意交错序列，都要能收敛到「最后一次产出胜出」。async 计算生成式测试（下一步）的预言机应内建这一序列。
4. **未进入生成域的层，taboo 形状靠 fail-fast 兜底**：activity/interaction 层在纳入 fuzzer 前，每个「类型系统接受但运行时语义未定义」的形状都应有声明期 fail-fast（Gateway / program group / 跨层 transfer / 跨分支 transfer 同族）。

---

## 附：红-绿证据链（供验证）

- 回归判定基线：`git worktree add /tmp/pre-r28 7cf5d200`（r27 前 = prune 引入前）。A 在该基线上**绿**（真实配对可读）、在 r29 后（含 v4.1.3）**红**（被剪枝）——确证 r28 回归；修复后复绿。
- A 复现最小化：`review-fixes-2026-07-15-r30.spec.ts`（storage）——真实配对返回 / 显式 `&` / filtered x:1 下 x:n 补全 / 非 filtered combined 不受扰。
- B/D/D2 复现最小化：`review-fixes-2026-07-15-r30.spec.ts`（runtime）——async 陈旧覆写 + 普通 async 不受扰 / null 三形态守卫 / 跨分支 transfer fail-fast + 合法活动仍构建。
- 修复后：`npm run check` 通过；`npm run test:storage` 712 绿；全量套件与真实 PG 套件结果见 PR 描述。
