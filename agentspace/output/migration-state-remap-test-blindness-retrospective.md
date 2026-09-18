# 逃逸复盘：为什么现有迁移测试没有发现「迁移成功但后续交互静默无效」

- 日期：2026-09-18
- 关联：`docs/migration-state-machine-state-remap/`（任务与设计）、`agentspace/output/pr51-migration-state-rebuild-review-2026-09-17.md`（问题陈述输入）、`agentspace/output/r17-test-blindness-retrospective.md`（方法论前例）
- 性质：测试体系的结构性复盘。回答的不是「谁漏写了哪个用例」，而是「**是什么样的体系性盲区让这类用例系统性地不会被写出来**」，以及本轮把结论落成了哪些可执行机制。
- 适用范围：`migration-state-machine-state-remap` 任务的 Task 要求 7（AGENTS.md § 修 bug 清单第 5 条）。

---

## 〇、结论先行

症状：一次成功完成的迁移之后，针对被迁移 StateMachine 的 Interaction `dispatch` 返回成功（`error: undefined`），输出值与内部状态都不变。迁移报告、输出值检查全部是绿的，缺陷只在「迁移后的下一次交互」暴露。

四个结构性盲区让现有体系看不到它：

1. **迁移测试的观察终点是「迁移完成」，不是「迁移之后的系统还能工作」**。`migration.spec.ts` 的断言止于 diff 形状、`migrate()` resolve、重算值正确；没有任何用例在迁移后执行一次真实 Interaction。缺陷的暴露时点在迁移之外，而测试的观察窗口在迁移之内。
2. **签名的语义盲区**：`stateSignature` 只描述 bound state 的形状（key / 作用域 / 宿主 / **默认值**签名），不描述它的**值域**。StateMachine 的 `currentState` 合法值集合 = 状态图节点名，这个约束从未进入任何签名或检测——非初始状态改名在 diff 层完全不可见（`stateSignatureChanged: false`）。
3. **生成式套件的生成域里没有这个物种**。`migrationGenerativeFuzz` 的变异菜单是纯加法（addProperty / addEntity / addRelation / addGlobalCount / addPropertyCount），生成域中没有 StateMachine、Transform、Custom；其保真预言机对比的是值，不是「迁移后 dispatch 是否生效」。两个方向的盲区（生成侧 + 观察侧）叠加，状态图变更这个维度从未进入过任何随机模型的辖区。
4. **运行期的静默 skip 语义让「无效」不产生任何错误信号**。`TransitionFinder.findNextState` 对图中不存在的状态名返回 null → `incrementalCompute` 返回 `ComputationResult.skip()` → dispatch 成功。除非测试显式断言「输出值与持久化状态列发生了变化」，否则没有任何失败信号可捕获——这也是为什么点状的「迁移后查一下值」用例（若存在）也可能放过它：输出值可以由 event rebuild handler 单方面改写正确，而状态列仍然是旧名（设计期求证的「只改输出值」形态）。

---

## 一、逐防线显微镜：缺陷恰好穿过了哪些防线

### 防线一：`migration.spec.ts` 的 state-only 既有覆盖（约 4253 行）

`state-only changes rebuild bound state without changing output` 是迁移子系统里唯一断言 bound state 的用例。它：

- 只用 **Custom + GlobalBoundState**（没有 StateMachine——StateMachine 的 `currentState` 从未出现在迁移断言里）；
- 断言「重置到默认值」这一动作本身，没有断言「迁移后的下一次交互」；
- 语义上把 bound state 固化为「有默认值、可整体重置的附属数据」——这正是被本次任务证伪的根因抽象（`currentState` 是受状态图约束的持久化事实）。

**结论**：该用例不但没覆盖缺陷，还把错误的语义模型固化成了绿灯。

### 防线二：迁移的输出重建链路与链式依赖回归

`recomputeTransformOutput`、聚合 `persistFullResult`、事件链式 rebuild 都有独立回归，但它们验证的是「重建后的值正确」。对 StateMachine：

- 输出重建路径（`runFullRecompute` → event rebuild handler → `writeComputationResult`）从不写 bound state（`setInternal` 在整个 `migration.ts` 中只出现在 `rebuildStateDefaults`）；
- 测试若只断言输出值，handler 可以把值改写为正确的新名（「只改输出值」形态），而 `currentState` 列残留旧名——**值断言对状态断言的替代是结构性的假安全**。

### 防线三：`migrationGenerativeFuzz` / `migrationDestructiveFuzz`

- 生成域：变异菜单纯加法，无 StateMachine / 无状态图变更。rng 决策流契约（`AGENTS.md`）也据此判断本任务的新决策种类不影响既有 seed 池——反过来说明**该维度从一开始就不在生成域内**。
- 预言机：fidelity / backfill oracle 对比迁移前后「值」的保真与回填正确，不执行迁移后交互。「迁移成功但下次交互无效」是保真预言机的盲区（值都对，交互死了）。
- `eventComputationGenerativeFuzz`（r33）覆盖 StateMachine 的**运行期**转移语义，但其模型假设状态图固定——迁移期改名不进入其输入域。

### 防线四：运行期 StateMachine 测试

`stateMachine.spec.ts` 等覆盖转移、skip 语义、computeTarget。但这些测试的模型从 setup 起就是自洽的（状态名与图一致）；「持久化状态名与图脱钩」这个状态只能由**迁移**制造，运行期测试的因果链上不存在这个入口。skip 语义本身在运行期测试里是被**正面断言**的合法行为（无出边→skip），无法区分「图上确实没有出边」与「名字不在图里」。

### 防线五：PR #51 的测试文件（外部输入）

PR #51 的 `migrationStateRebuild.spec.ts` 用了正确的预言机（迁移后执行交互），但矩阵只变化 `renamed` 与作用域两维——没有覆盖「哪个状态被改名」（初始 vs 非初始）与「状态属于谁」（输出路径拥有 vs 不拥有）。它的两行修复通过了自身测试，同时放过了非初始改名（机制 B）并把 Transform 的破坏性路径打开得更大（机制 D）。**预言机正确而矩阵维度不足时，修复本身成为新缺陷的载体**——这与 r17 复盘「交叉格按 bug 驱动补点」的结论同构。

---

## 二、根因归纳（对齐 r17 的盲区清单）

四个盲区在 r17 复盘的框架里各有对应，且有一个新形态：

| 本任务盲区 | r17 框架对应 | 新形态 |
|------------|--------------|--------|
| 观察终点 = 迁移完成 | 「不该沉默的地方沉默了」是否定形命题，逐点断言列不完 | 观察窗口错位：缺陷暴露在迁移**之后**，测试窗口在迁移**之内** |
| 签名不描述值域 | 维度取值未随实现内部状态机制更新 | 签名描述了数据的**形状**却对其**合法值集合**失明——「受约束事实」没有签名表达 |
| fuzz 生成域缺物种 | 生成域 × 观察面的乘积才是覆盖 | 两侧同时缺失（r30 复盘「诚实边界」的双重形态） |
| 静默 skip 无错误信号 | 内部假设以注释存在、失效时静默 | 合法语义（skip）与非法状态（名字不在图里）共享同一表现形态 |

可推广的陈述：**迁移子系统的正确性契约是「迁移后的系统与按新声明 fresh setup 的系统行为等价」，而不是「迁移过程完成且值保真」。任何只在迁移事务内观察的预言机都只验证了后半句。**

---

## 三、落成的机制（不是文字建议）

按 AGENTS.md § 修 bug 清单第 5 条，结论已全部机制化：

1. **新 oracle：迁移后交互 + 双面断言**。`tests/runtime/migrationStateMachineStateGraph.spec.ts`（31 用例）：每个执行层用例在迁移后 dispatch 依赖该状态的 Interaction，断言 `error === undefined` **且**输出值与持久化 `currentState` 列（`_${host}_${property}_bound_currentState`，属性级；`GlobalBoundState`，全局级）**同时**按新图变化。「只改输出值不改状态」的错误实现形态被状态列断言区分（用例 `mapping is per-record and intentional: an implementation that only rewrites the output value is distinguishable`）。真实 PostgreSQL 侧同一 oracle 落在 `postgresqlMigration.spec.ts` 的 `"PostgreSQL state graph mapping migration"` describe（3 场景，含事务回滚负向）。
2. **新不变量：持久化状态名合法性**。`MigrationScheduler.assertPersistedStatesLegal`（宽口径：rebuild 计划项触发即扫描）在迁移事务内 fail-fast，把「迁移制造或放过非法名」从静默 skip 变为受控错误；升级窗口（旧 manifest 无 `stateGraph`）由该不变量兜底。
3. **新检测与决策面：`stateGraph` manifest 字段 + `state-graph-mapping` 决策**。diff 层对三类状态图变更给出 `detected.stateGraphChanged` 与带 `removedStateNames` 的 requirement；`validateApprovedDiff` 校验映射覆盖恰等于 removed 集合、目标合法、与 computation 决策不矛盾（`unchanged`/`unrebuildable` 拒绝）。`modelHash` 显式排除该字段（金值断言钉住）。
4. **新所有权声明：`ownsStateOnRebuild`**。Transform / 聚合双模板基类 / RealTime 双 handle 静态声明，`rebuildStateDefaults` 对输出路径拥有的状态不再适用——机制 D（重置破坏 Transform 键）从「无法施加」与「所有权拦截」双重保证。
5. **维度注册表回填**。`tests/runtime/WritingComputationTests.md` 新增一行：状态图变更类型 × 作用域 × bound state 所有权 × rebuild 标志组合，含映射决策组合面与升级窗口格，及「双面断言」的强制要求。

## 四、登记的未闭合边界（诚实边界，双侧）

1. **fuzz 生成域仍无状态图变异**。`migrationGenerativeFuzz` 的 rng 决策流契约要求变更变异菜单时重验 seed 池（`AGENTS.md`），本轮未扩展。后续建议：为迁移 fuzzer 增加状态图变异（改名 / 删节点 × 作用域），oracle 复用第 1 条（迁移后 dispatch + 双面断言）；扩展时按契约先重验基础池 1–499。**这是建议，不是本轮交付**。
2. **运行期不变量仍不存在**（设计 §3.4 有意决策）：setup / dispatch 不检查持久化状态合法性，成本边界与 Task 要求 8（不改运行期语义）决定了辖区限于迁移路径。迁移路径外的历史腐蚀（直写 SQL 等）仍表现为运行期静默 skip——文档（`agent/agentspace/knowledge/usage/22-state-machine-state-graph-migration.md`）已写明该边界与修复路径。
3. **Custom `createState` 的状态语义不进机制**：值域是应用语义，框架不解释；文档写明其迁移走既有 `state-only` / `changed` 决策。
