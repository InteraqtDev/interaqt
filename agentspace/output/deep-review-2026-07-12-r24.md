# 全代码库深度 Review 报告(2026-07-12 第二十四轮)

- 日期:2026-07-12
- 基线:`cursor/deep-code-review-r23-35c9` @ `2233f298`(r1–r23 全部致命/重要修复已落地)
- 基线健康度:`npm run check` 通过;`npm test` 全量通过(含 r23 回归)
- 定位:**r23 显著遗留收口轮**——非新一轮全库扫描;按要求把 r23 记录未修项中「能复现、能明确验证修复成功」的全部修掉
- 方法:每个候选**先写红测复现**(PGLite/SQLite/真实 PostgreSQL 16),确认红后修复转绿。为验证 `lockRecord` 与 PG 专属路径,本轮在环境中安装了真实 PostgreSQL 16 并首次跑通全部 `postgresql*.spec.ts`——这些套件因需要 `INTERAQT_POSTGRES_DATABASE` 而在 CI/本地**从未运行过**,首跑即捕获一个沉睡的驱动级致命项(F-1)与两处夹具烂化
- 修复状态:**一个致命项 + 三个重要项已修复,一个记录项经复现探针证伪为已健康并固化守护测试**。本轮提交:`96778796`(atomic 归一化 + lockRecord 图锁 + migration 签名)、`631a9ac6`(PG getAutoId id 类型 + PG 套件 fixture rot)
- 修复后:`npm run check` 通过;`npm test`(默认 PGLite/SQLite 面)**1984 passed / 30 skipped**;全部 `postgresql*` 套件 @ 真实 PostgreSQL 16 **30 passed**

---

## 一、结论摘要

本轮的最大收获不来自新扫描,而来自**把真实 PostgreSQL 16 引入测试环境**:六个 PG 专属套件(Concurrency / Migration / ScopedSequence / DataConstraints + 本轮新增 LockRecord / IdConsistency)此前从未运行,首跑即暴露一个在 22 轮 review 中始终存活的驱动级致命项——「从未运行的测试面 = 从未验证的声明」(见第五节补充教训):

1. **PostgreSQL 驱动 `getAutoId` 返回 bigint 字符串 → id 类型分裂 → merged link 行合并静默不发生**(F-1)——node-pg 把 `nextval()`(bigint)序列化为字符串 `"1"`,INT4 id 列读回却是 number `1`。storage 写路径大量依赖 id 严格相等(flashOut 抢夺判定、同 id 原地引用判定):`"1" !== 1` → 行合并静默跳过 → `addRelationByNameById` 对 1:n merged link 插入独立第二行(同一逻辑 id 两行、实体列 NULL)→ 关系查询返回破损实体、依赖关系的聚合全部拿空数据。四驱动中仅 PG 分裂(PGLite 两侧都是 uuid 字符串)。
2. r23 记录的可复现遗留项全部收口:atomic 读路径 boolean/JSON 归一化(I-1)、`lockRecord` 只锁 root(I-2,真 PG 双并发事务红-绿验证)、migration 签名对显式 undefined 键 / NaN/±Infinity(I-3);r21 #2 / r23 §三 #2 的 `settlePostWriteChecks` × 写失败经复现探针**证伪为已被 r22 F-2 覆盖**,固化守护测试(G-1)。

| 级别 | 数量 | 主题 |
|------|------|------|
| 致命(已复现,已修复) | 1 | PG 驱动 id 分配/读回类型分裂 → merged link 行合并静默失效 |
| 重要(已复现,已修复) | 3 | atomic 读路径归一化、lockRecord 图锁、migration 签名 undefined/NaN |
| 证伪为已健康(固化守护测试) | 1 | settlePostWriteChecks × 写失败(r22 F-2 per-attempt 隔离已覆盖) |
| 附带修复(测试面) | 2 处 | PG 套件 fixture rot(缺 computeTarget / compute 读 record 而非 dataDeps) |
| 记录,本轮不修 | 若干 | 见第三节(与 r23 清单一致,无新增) |

---

## 二、致命问题(全部已复现确认并修复)

### F-1 PostgreSQL 驱动 getAutoId 返回 bigint 字符串:id 类型分裂 → merged link 行合并静默不发生

- 位置:`src/drivers/PostgreSQL.ts` `IDSystem.getAutoId`(`SELECT nextval(...)`);受害消费方是 storage 写路径全部 id 严格相等判定——`src/storage/erstorage/RecordQueryAgent.ts` flashOut 抢夺判定(`recordWithCombined[attr]?.id === ref.id`)、同 id 原地引用判定等。
- 机理:node-pg 把 `nextval()` 的 bigint 序列化为 JS 字符串(`"1"`),而 INT4 id 列读回是 JS number(`1`)——同一逻辑 id 在「分配侧」与「读回侧」类型分裂。写路径依赖 `===`:flashOut 找到了应合并的行却判定「不是同一个」→ `addRelationByNameById` 对 1:n merged link(FK 合并进 n 侧行)不走行合并、插入独立第二行:同一逻辑 id 两行、实体列全 NULL。后续关系查询返回破损实体(只有 id 无字段),依赖关系的聚合计算(Count/Average/…)全部建立在空数据上。
- 复现(实测,真实 PostgreSQL 16):

```
User–Task 1:n(IdcOwns)
create('IdcUser') + create('IdcTask') → addRelationByNameById('IdcOwns', user.id, task.id)

修复前:
  SELECT COUNT(*) FROM "IdcTask" → 2(同一逻辑 id 两行,实体列 NULL)❌
  user.tasks[0].score → undefined(破损实体,只有 id)❌
修复后:物理面 1 行;tasks[0].score === 10 ✓
```

- 影响:PostgreSQL 生产驱动下所有含 merged link 的关系写入(最常用的 1:1 / 1:n / n:1 FK 合表拓扑)。PGLite(uuidv7 字符串,分配/读回同型)、SQLite(驱动运行时返回 number)不受影响——「PGLite 是 PostgreSQL 语义替身」在 SQL 方言层成立,在**驱动 id 分配机制**层不成立。
- 修复:`getAutoId` 归一化 `Number(rows[0].id)`,与 INT4 列读回一致(id 列 INT4,`Number()` 无精度风险;与 SQLite 驱动行为对齐)。
- 回归:`tests/runtime/postgresqlIdConsistency.spec.ts`(2 用例):① 分配/读回 id 同型 + 关系查询返回完整实体 + raw 表物理单行;② 存量数据上迁移新增 relation aggregate(Average)正确算出 `avgScore === 15`。
- **为何存活 22 轮**:PG 专属套件需要 `INTERAQT_POSTGRES_DATABASE`,CI 与本地从未运行;PGLite 作为「PostgreSQL 语义」替身,id 分配机制却完全不同(uuidv7 字符串 vs sequence bigint)——「驱动差异轴(id 分配方式 × 读回类型)」从未被当作正交轴测试。环境可得性缺口的系统性教训见第五节。

---

## 三、重要问题

### 已修复(本轮)

- **I-1 atomic 读路径 boolean 0/1 / JSON 文本不归一化**(r22 §三 #1 + r23 §三 #1 收口):`QueryExecutor.structureRawReturns` 把 SQLite/MySQL 的 boolean 0/1 归一化为 boolean、JSON 文本 parse 为对象;record-target 的 `atomic.get`/`atomic.replace` 与 global `booleanValue` 列此前原样返回驱动值——同一字段 `find` 返回 `true`、atomic 返回 `1` 的跨路径类型分裂(公开 API 面)。修复:`MonoSystem.parseRecordFieldValue`(按 map 中 attr 的 type 归一化 boolean/json,respect `returnsParsedJSON`)+ `parseGlobalValue` 补 `booleanValue` 分支——与 `structureRawReturns` 同一契约。回归 3 用例(SQLite record-target get/replace + SQLite global + PGLite 原生语义对照)。
- **I-2 `lockRecord` 只锁 root 行**(r23 §三 #5):attributeQuery 经 LEFT JOIN 加载的关联行不加锁——并发写者不被阻塞,消费方(Transform update 等)基于快照的派生写建立在已漂移的关联数据上(READ COMMITTED 下的 lost-update 形态)。修复:锁 root 后按返回快照递归收集全部已加载关联行(`collectLoadedRelatedRows`,x:1 对象 / x:n 数组),逐表 `FOR UPDATE` + 重读稳定化(有界 5 轮,与 `lockRows` 同构);锁序 = root 先、关联按 `(record, id)` 排序跨事务一致以降死锁概率;单连接驱动(无 FOR UPDATE)事务本就串行,跳过图锁。验证:真实 PG 两条并发事务——修复前写者不阻塞(红测确认:观察时刻写者已完成、锁内重读漂移到 99),修复后写者阻塞至提交、锁内重读稳定(10)。回归 `tests/runtime/postgresqlLockRecord.spec.ts`(2 用例,含 root-only 旧语义不回退的对照)。
- **I-3 migration 签名对显式 undefined 键 / NaN/±Infinity**(r19 #3 / r22 §三 #2 / r23 §三 #4 家族收口):`canonicalizeArgsForSignature`/`stableStringify` 此前 `JSON.stringify(undefined)` 返回非字符串、模板拼接出非法片段 `"key":undefined`——「键=undefined」与「键缺席」签成不同值(`match: maybeUndefined` 是最常见的意外书写);NaN/±Infinity 全部坍缩为 `"null"`(与真 null 碰撞签名)。修复:对象分支显式 undefined 键按缺席跳过(JSON 语义);非有限数字规范化为带标签字符串(`[NaN]`/`[Infinity]`)保持可区分;语义变更随 `MIGRATION_MANIFEST_GENERATOR_VERSION` `"3"→"4"`(旧 manifest 走既有 re-baseline 门)。Date/Set/Map/RegExp codec 子项不在本次收口面,维持记录。回归 3 用例(undefined ≡ 缺席、NaN/Infinity/null 三方互异、常规字面量签名稳定且变更可分辨)。

### 证伪为已健康,固化守护测试(本轮)

- **G-1 `settlePostWriteChecks` × 写失败**(r21 #2 / r23 §三 #2 记录):以自然失败路径复现探针实测——注入 insert 抛错 + **同一个** events 数组重试、filtered 视图关系在场:失败 attempt 后调用方数组为空,重试后恰好一份 create + 视图事件、关联完整。判定:该形态已被 r22 F-2 的 per-attempt 隔离(每 attempt 新数组、成功后搬运)完全覆盖,属已修复家族的延伸覆盖面而非独立缺陷。处置:固化守护测试防未来回归(`review-fixes-2026-07-12-r24.spec.ts`,1 用例)。

### 附带修复:PG 专属套件 fixture rot(测试面,非框架代码)

从未运行的套件连自身夹具都烂在了声明期守卫之前:

1. `postgresqlMigration.spec.ts` 两处 property 级 StateMachine fixture 缺 `computeTarget`——r7 起为必填且有声明期守卫,但守卫只打得到「实例化过」的声明,这些夹具从未被实例化。
2. 两处 `Custom` compute 回调读 `record.price` 而非声明的 dataDeps(`deps.current.price`)——链式重建/增量路径传入的 record 只是 dirty-record 骨架(可能只有 `{id}`),迁移矩阵里 `doublePrice` 算出 NaN。

修正后全部 PG 套件(Concurrency / Migration / ScopedSequence / DataConstraints / LockRecord / IdConsistency)**30 用例全绿**。

### 记录,本轮不修(与 r23 清单一致,无新增)

1. **filtered targetPath property 级全量重算风暴**(r19 #4 / r21 #1 / r23 §三 #3):性能项,无单点红-绿判据,不满足本轮「能明确验证修复成功」的入选标准;正确性仍由全量兜底。
2. **createClass 统一声明期校验**(r16 建议 4,七轮复确):工程债,属结构性重构而非可红-绿验证的缺陷修复。
3. 其余 r22/r23 §三「记录不修」与 §五 遗留项(StateMachine.clone 共享图、BoolExpressionData operator 白名单、对称关系多跳 targetPath、post-pagination tie 组稳定性等)——本轮未触碰,清单见 r23 报告第三、五节。

---

## 四、证伪/降级的候选(本轮探查结论被推翻或核实为既有修复已覆盖的)

| 候选 | 结论 |
|------|------|
| 「`settlePostWriteChecks` 写失败后队列残留/串批到后续成功写」(r21 #2 / r23 §三 #2 记录项) | **复现探针证伪为已健康**:自然失败路径(insert 抛错 + 同数组重试、filtered 视图在场)下,r22 F-2 的 per-attempt 隔离已完全覆盖——失败后 events 空、重试恰好一份视图事件。降级为守护测试固化(见三 G-1) |

---

## 五、既有遗留项复确 + 本轮补充教训

r23 §三「记录不修」清单本轮定向消去四项:#1 atomic 读路径归一化(I-1 已修)、#2 settlePostWriteChecks × 写失败(G-1 证伪为已健康并固化守护)、#4 `canonicalizeArgsForSignature` 的 undefined/NaN 子项(I-3 已修;Date/Set/Map/RegExp codec 子项仍留)、#5 `lockRecord` 只锁 root(I-2 已修);r23 §五 的镜像条目相应更新(并发组「lockRecord 只锁 root」消去;迁移组条目缩至「Date/Set/Map/RegExp」)。其余条目(语义/契约、性能/资源、并发、异步/install、单一事实源、事件驱动契约、迁移、clone/replace 隔离、驱动、公开面)全部维持,不重复展开——见 r23 报告第三、五节。

### 本轮补充教训(escape analysis 一句话)

**「从未运行的测试面 = 从未验证的声明」**:PG 专属套件因环境缺失沉睡,夹具烂在声明期守卫之前(守卫只保护运行过的代码),驱动级 id 类型分裂在 22 轮 review 后仍存活——**环境可得性本身是测试矩阵的一根轴**。skip 掉的套件对被测面提供的置信度是零,却在心理账本上被记为「已覆盖」;本轮把真实 PG 引入环境后一次性收获 1 个致命(F-1)+ 2 处 fixture rot。机制化建议:CI 补 PG service container,或至少每轮 review 手动跑一次 PG 套件(见第六节 #1)。

---

## 六、修复优先级与后续建议

本轮一个致命项 + 三个重要项已修复,一个记录项证伪并固化守护。后续轮次建议:

1. **CI 补 PostgreSQL service container**(本轮新增,优先级最高):或至少把「每轮 review 跑一次全部 `postgresql*` 套件」纳入流程——本轮证明该面沉睡的成本是致命级(F-1 存活 22 轮)。同理审计其他 env-gated skip 面(MySQL 套件),并把「驱动差异轴(id 分配机制 × 读回类型)」「环境可得性」登记进维度 registry。
2. **filtered targetPath 事件名改写 + 同批去重**(r23 §三 #3,多轮复确)——性能项,需先建基准判据再收口。
3. **createClass 统一声明期校验**(r16 建议 4,七轮复确)——手写守卫积压持续增长。
4. **`canonicalizeArgsForSignature` 的 Date/Set/Map/RegExp codec**(r22 §三 #2 剩余子项)——undefined/NaN 本轮已收口,codec 面仍缺。
5. 其余 r22/r23 记录项按既有清单推进。

### 升级注意(behavior-tightening,供 CHANGELOG 参考)

- **PG 驱动 id 分配返回 number(此前是字符串)**:`create` 等返回的新记录 id 从 `"1"` 变为 `1`,与读回侧一致。以 `typeof id === 'string'` 做分支的下游代码需适配;存量数据不受影响(列类型 INT4 不变)。
- **`lockRecord` 现在锁整个已加载关联图**(此前只锁 root):持锁窗口内并发度略降;可能出现可重试死锁(PG `40P01`),由既有 `runWithTransactionRetry` 接管——调用方无需改动,但高并发热点关联行上需预期重试。attributeQuery 未加载的行仍不加锁(锁面 = 快照面,显式控制)。
- **迁移 manifest generator version `"3"→"4"`**:升级后首次 `setup(false)` 因 generator 版本不匹配触发 `assertManifestGeneratorCurrent` 的明确报错,按既有流程 re-baseline 后继续;签名语义变更(undefined 键 ≡ 缺席、NaN/±Infinity 可区分)只影响含这些形态的声明。
- **行为修正(无 API 变化)**:`atomic.get`/`atomic.replace` 对 boolean/JSON 字段返回 JS 类型(此前 SQLite/MySQL 下返回 0/1 / JSON 文本)——与 `find` 路径一致;依赖旧原样值的代码需适配。

---

## 附录:复现要点(验证用)

本轮回归固化于三个文件:

- `tests/runtime/review-fixes-2026-07-12-r24.spec.ts`(7 用例):
  - atomic 归一化组(3):SQLite record-target `atomic.get/replace` 的 boolean/json 返回 JS 类型且与 find 同型;SQLite global `booleanValue` 归一化;PGLite 原生语义对照不变。
  - migration 签名组(3):`{ match: undefined }` 与 `{}` 签名相同;NaN/Infinity/null 三方签名互异;常规字面量声明间签名稳定、变更可分辨。
  - 写失败守护组(1,G-1):注入 insert 失败 + 同数组重试(filtered 视图在场)→ 失败后 `events.length === 0`,重试后 User/VipLink create 各恰好一份、关联完整。
- `tests/runtime/postgresqlIdConsistency.spec.ts`(2 用例,需 `INTERAQT_POSTGRES_DATABASE`):分配/读回 id 同型 + 关系查询返回完整实体 + raw 表物理单行;存量数据迁移加 Average 后 `avgScore === 15`。
- `tests/runtime/postgresqlLockRecord.spec.ts`(2 用例,需 `INTERAQT_POSTGRES_DATABASE`):事务 A `lockRecord`(含关联 profile)持锁期间,事务 B 写关联行必须阻塞(观察时刻写者未完成、锁内重读仍为 10),A 提交后 B 写照常生效(99)——锁只延迟、不吞写;root-only 旧语义对照不回退。
- 红-绿方法备注:lockRecord 以 env-gated 旧行为(仅锁 root)复跑上述用例确认红(写者不阻塞、锁内重读漂移)后转绿;atomic/签名两项以探针红测先行;F-1 在修复前的真实 PG 上确认 raw 双行与破损实体,修复后转绿。
