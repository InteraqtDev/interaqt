# 记录项收口轮（2026-07-17 第三十六轮）

- 日期：2026-07-17
- 基线：分支 `cursor/deep-review-r35-fatal-fixes-2d63`（r35 全部修复 + 复盘机制之上）
- 性质：**记录项收口轮**——r35 报告 §六诚实边界、r35 复盘 §八登记跟进的逐项执行
  （与 r32 对 r28–r31 的收口同构）。每个疑点先探测定谳再处置。
- 修复后健康度：`npm run check` 通过；`npm test` 全量 **2422 passed / 49 skipped**；
  真实 PostgreSQL 16 七套件 33 passed；match 语义 fuzz 新生成域 25+75 种子绿；
  迁移破坏性 fuzz 新宇宙 44 种子绿（菜单扩到 9 种）；storage 结构 fuzz 双池 +
  驱动差分（真实 PG 次驱动）复跑绿。

---

## 一、探测定谳的缺陷（两个，均已修复 + 红-绿证据）

### F-1｜深嵌 EXISTS 的子查询前缀链越过 63 字节标识符上限（r35 登记边界定谳为真实缺陷）

**探针**：长实体名（`OrganizationLongName` 等）× 三层嵌套 exist →
`column ... does not exist`。**机制**：子查询前缀链 = 外层前缀 + 路径别名逐层串联
（level-2 别名 98 字节、level-3 131 字节）；PostgreSQL 对超长标识符**静默截断**，
而前缀链的**前缀性质**使 level-2 FROM 别名的截断形恰好等于 level-1 别名——内层
作用域遮蔽外层，关联引用解析到错误的表。r35 报告 §六已登记「>4 层可能逼近上限」，
实测三层即中（登记的量化估计偏乐观——遮蔽由前缀性质保证必然发生，不是巧合碰撞）。

**修复**（收敛点）：`AliasManager.registerSubqueryPrefix`——子查询前缀一律 token 化
（`Q<n>`，确定性、与超长表路径的 `T<n>` 命名空间分离）；`registerTablePath` 为前缀
让出长度预算（`SUBQUERY_PREFIX_BUDGET = 8`：路径别名上限 63−8，保证任意嵌套深度下
最终标识符 ≤ 63）。回归：`reviewFixesR36.spec.ts`（双驱动 × 正/反极性 ×
「全部标识符 ≤ 63」结构不变量）。

### F-2｜global 目标的 json compareAndSet 缺规范化比较（r25 record 目标修复的兄弟格）

**探针**：`atomic.compareAndSet({key, valueType:'json'}, …)` 在 PGLite 直接抛
`operator does not exist: json = unknown`；SQLite 按存储文本比较，而 global 写路径是
非规范 `JSON.stringify`——键序不同的语义相等对象恒不相等（静默 false，与并发竞争
失败不可区分）。r25 修 record 目标时 global 是漏掉的兄弟格（r35 复盘 §五 S-1 类
「接口方法 × 值类型」矩阵审计的首个产出）。

**修复**：json 列走「锁定读 → 规范形比较 → 条件写」事务路径（与 record 目标同一
实现形态），含「行缺席 + expected === defaultValue ⇒ 默认态命中」分支。
回归：键序颠倒命中 / 错误 expected 拒绝 / 默认态 insert，双驱动。

## 二、机器化扩域（三项）

1. **迁移破坏性 fuzz 加 filtered 链**（F-4 家族生成域化）：全部变异共享
   Derived → Big(value>50) → Summation 链 + 新变异 `transformValueChange`（行集不变、
   值变化——成员资格经 update 派生事件退出/留存）。**绝对朴素重算预言机**在每个
   非阻塞种子对账 bigSum（与事件流零共享）+ 迁移后冒烟断言 filtered 链 live 接线。
   菜单扩到 9 种 ⇒ 新种子宇宙，默认池重派为 1–44（9 种全命中，含 valueChange 的
   fault/非 fault 变体）。**敏感性**：未修复基线（main）上 seed 43 红，
   签名正是 F-4（bigSum=127 残留退出成员旧值 vs 朴素 56）。
2. **match 语义 fuzz 扩域**：between（非 null 边界 × 三值）、**引用值**
   （isReferenceValue，`NULL = NULL` 按 UNKNOWN 建模；跨关联引用路径的 JOIN 树收集
   r19/r20 家族入生成域）、**filtered 实体作为查询根**（resolvedMatchExpression 与
   用户 match 的 AND 合并面，每条表达式双根对拍）、**对称单段 exist**（∃ 邻居语义）。
   25 默认 + 75 扩池绿。仍排除（登记）：like（方言大小写分裂）、对称/filtered 中段
   （legacy 编译边界，existCorrelationScope 已 pin）。
3. **用户文档**：`12-data-querying.md` §11.2.4 增补 to-many 匹配的量化语义——
   exist 按父记录量化（否定用 exist）；值原子按行量化、否定不对易、无关联行的父
   两集皆不在（契约决策的用户可见面，r35 §三.1 的收尾）。

## 三、探测后判定健全（不改码）

| 疑点 | 判定 |
|------|------|
| `updateGlobalFields` 聚合语义 | 事务内探针：增量、负增量、defaults 合并全部正确 |
| record 目标 CAS × boolean | 双驱动 true/false/true 全对（S-1 矩阵的又一格） |

## 四、验证证据链

- ✅ `npm run check`；`npm test` 全量 2422 passed / 49 skipped
- ✅ 真实 PostgreSQL 16 七套件 33 passed
- ✅ match 语义 fuzz：默认 25 + 扩池 75（新生成域）
- ✅ 迁移破坏性 fuzz：新宇宙 1–44 全绿；基线敏感性 seed 43 红（F-4 签名）
- ✅ storage 结构 fuzz base 100 种子 ×40 ops + extended 60、驱动差分 60（真实 PG 次驱动）
- 红-绿：深嵌 exist 长名三层（`column ... does not exist` → 双极性正确 + 标识符全 ≤63）；
  global json CAS（PGLite 裸报错 / SQLite 静默 false → 三形态全对）

## 五、遗留登记（维持）

- match fuzz 生成域：like / 对称中段 / filtered 中段（编译边界随 existAtomCorrelation
  的未来定谳一并解锁）；
- atomic「方法 × 值类型」全矩阵的系统化 meta-test（本轮点探 CAS×boolean/json-global，
  枚举式盘点与 callbackSynchronyContract 同构，独立轮）；
- 迁移生成式 fuzz（加法轨）的 filtered 链扩域（破坏性轨已落，加法轨同构可复制）；
- C3 迁移规模化 / D1 索引声明面 / Phase 0.2 bench（performance-debt-plan 既定计划）。
