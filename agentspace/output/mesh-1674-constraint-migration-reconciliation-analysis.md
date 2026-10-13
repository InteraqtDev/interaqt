# 分析：迁移不对账已安装的数据约束（one2x-ai/mesh#1674）

- 日期：2026-10-13
- 关联：one2x-ai/mesh#1674（报告）；mesh#1592 / PR #1668（触发场景，已改用不需要删除约束的产品方案）
- 版本：issue 在 interaqt 4.11.1 上观测；本文在 main `11742d4`（v4.11.2）上复现。两版之间 `src/` 只改了
  `migration.ts` 的 destructive-scope 部分，本缺陷涉及的代码路径没有变化（`git diff 7df97c3..11742d4 -- src/`）。
- 协议：escaped-defect，full tier。理由：迁移报告成功，写入的 manifest 记录的约束集合与数据库实际约束集合不一致，
  属于静默失败；同族的 D-2 会让已声明的唯一性不被数据库强制，属于数据完整性缺陷；D-3 会让应用无法重启。
- 状态：已修复（分支 `fix/migration-constraint-reconciliation`，见 §八）。§〇–§七 是修复前的分析，代码锚点指向 v4.11.2。
- 回归用例：`tests/runtime/migrationConstraintReconciliation.spec.ts`、`tests/storage/managedConstraintCatalog.spec.ts`、
  `tests/runtime/migrationGenerativeFuzz.spec.ts`（约束变更轴与预言机 5/6）。

术语：
- **声明约束集合**：当前模型的 `UniqueConstraint`、`NonNullConstraint`、`Entity.identity` 推导出的物理对象
  （唯一索引、CHECK 约束）。
- **已安装约束集合**：数据库目录（`pg_indexes`、`pg_constraint`）中由框架按声明创建的这些对象。
- **对账（reconciliation）**：按「已安装集合 → 声明集合」的差异规划 DDL：缺失的创建，多余的删除，
  定义不同的重建，一致的不动。

---

## 〇、结论

| 编号 | 现象 | 机制 | 复现格 |
|---|---|---|---|
| D-1 | 删除或替换 UniqueConstraint 后，旧唯一索引保留，写入仍按旧约束被拒绝（issue 本体） | 约束 DDL 只为新模型的声明生成创建语句，不存在删除路径 | C1、C2 |
| D-2 | 同名 UniqueConstraint 改定义（加 `where`、增减属性）后，数据库保持旧定义 | 物理名只由（记录名，约束名）派生；`CREATE UNIQUE INDEX IF NOT EXISTS` 按名字判断已存在，新定义被静默跳过 | C3（放宽无效，写入仍被拒）；C4（收紧不生效，违反新声明的重复行写入成功） |
| D-3 | 已安装 NonNullConstraint 的模型，此后**任何**迁移都失败，`setup(false)` 也失败；重试结果相同 | NonNull 的 DDL 是没有存在性判断的 `ALTER TABLE … ADD CONSTRAINT`，在每次 setup 和每次迁移中重复执行 | C6、C7、C9 |
| D-4 | 删除 NonNullConstraint 后 CHECK 约束保留 | 同 D-1 | C5 |
| D-5 | 删除或更换 `Entity.identity` 后，旧 `interaqt_ident_*` 唯一索引保留 | identity 索引走同一条只创建、不删除的路径 | C8、C10 |
| D-6 | 上述变更的 diff 没有任何约束条目（changes、requiredDecisions、blockingChanges 都为空），但 modelHash 变化；审批与执行都「成功」，随后 manifest 记录新约束集合 | diff 只列出 `preRecomputeDDL`（建表、加列），约束 DDL 不进入审阅面；manifest 由声明生成，不由数据库目录生成 | C1、C2、C5 中的 diff 断言 |

两项后果：

1. **迁移后，数据库与 manifest 的不一致永久存在，且现有机制无法检测。** manifest 已不再包含旧约束，后续
   `setup(false)` 的 modelHash 校验通过，后续迁移以这个 manifest 为源状态。旧索引只存在于数据库目录中。
2. **违反孤立约束的写入错误无法归属到声明。** `findConstraintForError`（`MonoSystem.ts:1929`）只在当前声明中
   查找：孤立唯一索引的冲突变成不带 `constraintName` / `violationCode` 的 `ConstraintViolationError`（C1、C2、C8）；
   孤立 CHECK 的冲突以驱动原始错误抛出（C5）；同名改定义时，冲突被归到新声明（C3），业务侧拿到新声明的
   `violationCode`，但新声明本身允许这次写入。

D-3 不在 issue 中。它是按「修类不修例」枚举声明约束集合的读者时发现的（§二）。D-3 的触发条件是最普通的操作：
重启应用，或做一次与约束无关的迁移。只要 PostgreSQL 系驱动上的模型声明了 NonNullConstraint，就会触发。
Mesh 目前没有使用 NonNullConstraint，所以 Mesh 没有遇到它。

## 一、根因

约束 DDL 的规划是**目标声明的单向投影**，不是源状态与目标状态的对账。

源状态在系统里有两处可读：上一个 manifest 的 `storage.constraints`（每次 install 和迁移都会写入，并且参与
modelHash，`migration.ts:1167`），以及数据库目录。规划器、安全闸门、diff 生成都不读这两处：

1. **规划器只创建。** `MonoStorage.createPostRecomputeSchemaPlan`（`MonoSystem.ts:809`）只把
   `dbSetup.createConstraintSQL()`（新模型）转成 `create-constraint` 操作；identity 索引与 Transform 唯一索引同样
   只创建（`MonoSystem.ts:850-863`、`:2546`）。整个运行时唯一的 `DROP INDEX` 用来清理旧弱哈希命名的
   Transform 索引（`MonoSystem.ts:2537`），与用户约束无关。
2. **物理名与定义无关。** `buildPhysicalConstraintName`（`Setup.ts:1481`）生成
   `uniq_<记录名>_<约束名>_<hash(记录名:约束名)>`，不包含属性、字段和 `where`。`createUniqueIndexSQL`
   （`SchemaDialect.ts:145`）生成 `CREATE UNIQUE INDEX IF NOT EXISTS`，数据库只按名字判断是否已存在，看不到定义变化。
   NonNull 生成 `ALTER TABLE … ADD CONSTRAINT`（`SchemaDialect.ts:306`）。PostgreSQL 没有这条语句的
   `IF NOT EXISTS` 形式，代码也没有先查询目录。
3. **同一份 DDL 在两个入口重复执行。** `MonoStorage.setup`（install 与 attach 共用，`MonoSystem.ts:548`）每次都调用
   `createConstraints`；每次迁移的 `postRecomputeDDL` 都包含全部现存约束。迁移操作日志按 `migrationId` 记录完成
   状态（`MonoSystem.ts:665`），不能跨迁移去重。唯一索引因为 `IF NOT EXISTS` 恰好是幂等的；NonNull 不是，因此有 D-3。
4. **安全闸门不看约束。** `getStorageBlockingChanges`（`migration.ts:2635`）比较 records 与 attributes 的物理路径和
   类型，不比较 constraints。迁移指南写明「Fact destructive schema changes remain blocked」：删除事实列会被阻断，
   删除约束却既不执行也不阻断。约束是唯一一类既不执行也不阻断的非加法 schema 变更。
5. **diff 不列约束。** `buildMigrationDiff` 只把 `schemaPlan.preRecomputeDDL` 列为 storage 变更（`migration.ts:2001`），
   约束 DDL 在任何方向上都不进入审阅面，新增也一样。
6. **manifest 不反映物理状态。** 迁移成功后写入的 `nextManifest.storage.constraints` 来自新声明
   （`MonoSystem.ts:1022` `createSchemaMetadata`），不来自数据库目录。

对照：表和列的加法规划是对账式的。`createAdditiveSchemaPlan`（`MonoSystem.ts:776`）现查目录
（`getExistingTables` / `getExistingColumns`），只为缺失对象生成 DDL；删除则通过 manifest 对比被阻断。
「根据已安装状态与声明状态规划 DDL」这条规则对表和列实现了，对约束和索引没有实现。这是同一条规则在 schema
规划中有两套实现、其中一套不完整（第二写入者）。

同族先例：`MonoSystem.ts` 的 `hashIdentifier` 注释记录了 r25 §三 #3 / r26 的 Transform 唯一索引名碰撞：两个
Transform 复用同一索引名时，第二个 `CREATE UNIQUE INDEX IF NOT EXISTS` 静默 no-op。当时修复的是哈希碰撞这个实例；
「`IF NOT EXISTS` 按名字判定，看不到定义变化」这条一般规则在用户约束管线上仍然存在，表现为 D-2。r10 I-2
（merged 实体移除 input 时无阻断）属于同一个「声明收缩没有审阅」的家族。

## 二、声明约束集合的读者全集

| 读者 | 位置 | 是否读取源状态 | 删除 / 同名改定义时的行为 |
|---|---|---|---|
| `DBSetup.buildConstraints` → `constraintSchemaItems` | `Setup.ts:1572` | 不适用（声明 → 条目） | 物理名只由（记录名，约束名）派生 |
| `MonoStorage.setup` → `createConstraints`（setup(true) 与 setup(false)） | `MonoSystem.ts:548`、`:1146` | 否 | 唯一索引：`IF NOT EXISTS` 跳过；NonNull：已存在即失败（C7） |
| `setupFrameworkApplicationIdentityIndexes` | `MonoSystem.ts:1119` | 否 | 只创建新索引，不删除旧索引（C8、C10） |
| `createPostRecomputeSchemaPlan`（verificationDDL + postRecomputeDDL） | `MonoSystem.ts:809` | 否 | 只创建；NonNull 不幂等（C6、C9） |
| `createTransformUniqueIndexOperations` | `MonoSystem.ts:2546` | 否 | 只创建 |
| `createSchemaMetadata` → `manifest.storage.constraints` → modelHash | `MonoSystem.ts:1022`、`migration.ts:1167` | 写入，但规划器从不读取 | 变化只表现为 modelHash 不一致 |
| `buildMigrationDiff` | `migration.ts:1704`（storage 段 `:2001`） | 读上一个 manifest 的 records/properties/computations，不读 constraints | 约束变化不可见（changes 为空） |
| `getStorageBlockingChanges` | `migration.ts:2635` | 只读 `storage.records` | 没有约束闸门 |
| `createMigrationBaseline` | `Controller.ts:831` | 只核对表和列 | 不核对目录就记录声明的约束集合（代码阅读，未单独复现） |
| `findConstraintForError` / `mapConstraintError` | `MonoSystem.ts:1929` | 只看当前声明 | 孤立对象的冲突无名或被错误归属 |

## 三、复现

```bash
# PGLite（无需环境变量）
npx vitest run tests/runtime/migrationConstraintReconciliation.spec.ts
# 加上真实 PostgreSQL（本机 PostgreSQL 17.6；每格使用独立库 <db>_constraint_reconcile_<cell>）
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
  npx vitest run tests/runtime/migrationConstraintReconciliation.spec.ts
```

结果（`11742d4`）：**迁移格 20/20 红（PGLite 10、PostgreSQL 10），新装对照格 6/6 绿。**

每一格：v1 `setup(true)` 并写入存量行 → v2 `generateMigrationDiff` → 按推荐全部批准 → `migrate` → 检查数据库目录与写入行为。
断言写的是正确契约，所以在 v4.11.2 上为红。

| 格 | v1 → v2 | 期望 | v4.11.2 实际 |
|---|---|---|---|
| C1 | `slug_unique(workspaceId, slug)` → 无 | diff 列出删除；索引删除；重复写入成功 | diff 无条目；索引保留；写入被拒（无名 `ConstraintViolationError`） |
| C2 | `slug_unique` → `active_slug_unique(workspaceId, activeSlugKey)`（issue 形态） | 只剩新索引；复用已归档频道的 slug 成功 | 新旧两个索引并存；写入撞旧索引 |
| C3 | 同名，加 `where status = 'active'` | 索引带 `WHERE`；已归档行不再占用 slug | 索引仍是全表唯一；写入被拒，错误归到 `slug_unique` |
| C4 | 同名，`(workspaceId, slug)` → `(slug)` | 跨 workspace 的重复 slug 被拒 | **写入成功**，表中出现违反声明的重复行 |
| C5 | `NonNull(note)` → 无 | CHECK 删除；`note = null` 写入成功 | CHECK 保留；写入以驱动原始错误被拒 |
| C6 | `NonNull(note)` 不变 + 加一个无关属性 | 迁移成功 | `constraint … already exists`，迁移失败 |
| C7 | `NonNull(note)` 不变，`setup(false)` | 启动成功 | `ConstraintSetupError`（`already exists`） |
| C8 | `identity(workspaceId, slug)` → 无 | `interaqt_ident_*` 删除；重复写入成功 | 索引保留；写入被拒 |
| C9 | 同名 NonNull 从 `note` 改到 `slug` | 迁移成功，新 CHECK 生效 | `already exists`，迁移失败 |
| C10 | identity `(workspaceId, slug)` → `(workspaceId, activeSlugKey)` | 只剩一个 identity 索引 | 两个 identity 索引并存 |

**预言机正向对照**（同文件 `fresh-install twins`）：对每格的 v2 直接执行 `setup(true)` 并写入相同的存量行，同样的
写入与目录断言全部成立。期望契约就是「v2 全新安装的结果」，只有 v1 → v2 的迁移路径偏离它。这也解释了 issue 中
「新建的库只有新索引，测试全绿」。

补充观测（D-3 的持续性，探针执行后已删除，可用 C6 的形态手工重现）：迁移第一次失败后，失败前的 `ADD COLUMN`
已提交（applyMigrationSchema 在重算事务之外执行）；第二次迁移以完全相同的错误失败；旧模型的 `setup(false)` 也以
`ConstraintSetupError` 失败。数据库处于既无法前进、也无法用旧代码启动的状态，只能手工执行 DDL 恢复。

环境说明：SQLite 格没有执行。本机 `better-sqlite3` 按 Node ABI 127 编译，当前 Node 26 需要 ABI 147，
`dataConstraints.spec.ts` 中原有的 SQLite 格也因此失败。按代码阅读，SQLite 的唯一索引同样走
`CREATE UNIQUE INDEX IF NOT EXISTS`，受 D-1、D-2、D-5 影响；SQLite 本来就拒绝 NonNullConstraint，不受 D-3、D-4 影响。

## 四、为什么测试体系没有抓到

### 4.1 逃逸证明：最近的现有测试在 v4.11.2 上全绿

| 套件 | 结果 |
|---|---|
| `tests/runtime/migration.spec.ts`（含约束格 L3363 / L3405 / L3446 / L3483 / L3527 / L4078） | 90/90 绿 |
| `tests/runtime/migrationGenerativeFuzz.spec.ts` / `migrationDestructiveFuzz.spec.ts` | 7/7、44/44 绿 |
| `tests/runtime/applicationIdentityMigration.spec.ts` | 9/9 绿 |
| `tests/runtime/dataConstraints.spec.ts` | 13/14（失败的 1 格是上述 SQLite 原生模块环境问题，与本缺陷无关） |
| 真实 PostgreSQL：`postgresqlMigration.spec.ts`（含 L563 约束矩阵）/ `postgresqlDataConstraints.spec.ts` / `postgresqlApplicationIdentity.spec.ts` | 10/10、2/2、7/7 绿 |

结论：这些测试都执行了，但都看不到这个缺陷（green，runs but cannot see）。

### 4.2 分类

- interaqt 测试体系：**B1，缺维度。**
- Mesh 台账：**C2，框架缺陷**。在上游修复并且 Mesh 消费发布版本之前保持 open。

### 4.3 证据

1. **手写用例里，「约束变更方向」这个维度只取过一个值。** 所有涉及约束的迁移用例都只在 v2 声明约束：
   `migration.spec.ts` L3363、L3405、L3446、L3483、L3527、L4078，`postgresqlMigration.spec.ts` L563，
   `applicationIdentityMigration.spec.ts` L135、L290、L316。「v1 已经有约束」的情形从未出现，于是删除、同名改定义、
   「约束不变但再做一次 setup 或迁移」三个取值都缺失。D-3 的触发只需要第三个取值。它自 `be0df4c`
   （2026-05-02，引入数据约束）起存在了五个多月：所有 NonNull 用例要么是首次安装，要么是新增它的那次迁移，要么是
   SQLite fail-fast 对照，没有一个在 PostgreSQL 系库上重入 `setup(false)` 或连续迁移两次。
2. **生成域里没有约束。** `tests/storage/helpers/fuzzSchema.ts` 不生成约束；`migrationGenerativeFuzz` 的变异菜单是
   5 种加法变异，都不涉及约束和 identity；`migrationDestructiveFuzz` 只做计算与数据的破坏性变异。
3. **没有物理 schema 预言机。** 迁移套件的预言机都是逻辑数据预言机（通过 storage API 读取快照），对不改变逻辑数据
   的物理对象结构性失明；没有「迁移后的物理 schema 与全新安装等价」这类预言机。manifest 与声明一致，只是同一实现
   两次输出之间的相对对账（r35 规则 a）：两者都由新声明生成，必然一致，而数据库与它们都不一致。
4. **新库路径掩蔽。** `setup(true)` 在每个测试里重建数据库，新库里不存在旧对象。下游（Mesh）的测试也只用新库。

## 五、escaped-defect 卡片

```
## Escaped defect
- Symptom: 删除或替换 UniqueConstraint 后迁移成功（outcome=migrated），旧唯一索引仍在，写入按旧约束被拒。
- Evidence (log / DB / LRO / UI / request): issue 演练的 pg_indexes（新旧两个 uniq_PublishChannel_* 并存）与写入错误
  `duplicate key value violates unique constraint "uniq_PublishChannel_unique_publish_channel_slug_115cuhq"`；
  本地复现 tests/runtime/migrationConstraintReconciliation.spec.ts（PGLite + PostgreSQL 17.6）。
- Layer: interaqt
- Root cause (mechanism, not the visible failure): 约束 DDL 按目标声明单向投影，不与已安装状态对账：没有删除路径；物理名与
  定义无关且以 IF NOT EXISTS 创建，同名改定义被跳过；NonNull DDL 不幂等；diff 只列 preRecomputeDDL；manifest 由声明生成。
- Nearest existing test(s): migration.spec.ts 约束格；postgresqlMigration.spec.ts L563；applicationIdentityMigration.spec.ts；
  migrationGenerativeFuzz / migrationDestructiveFuzz。
- Escape proof (escape-proof command + result): 上述套件在 11742d4 上全绿（§4.1），runs but cannot see。
- Escape class and subtype: Mesh：C2 framework defect；interaqt：B1 missing dimension。
- Evidence for the class: §4.3。
- Coverage to add (layer, derivation method, target files): runtime 层确定性矩阵（本复现文件）；生成式迁移套件增加约束变异
  与「迁移后物理约束集合 = v2 全新安装的物理约束集合」预言机；维度登记表新增一行（§六）。
- Class census (after fix; A/B): 见下表（全部 covered）。
- Red-first proof (after fix; commands + results): 新矩阵在修复前的 src（origin/main 3bc6d26）上 54/54 个迁移格红（PGLite 20、
  SQLite 14、PostgreSQL 17.6 20），6 个新装对照格绿；迁移 fuzz 默认池 6 个种子中 5 个红（4 个由预言机 5 报出，1 个是
  NonNull 的 already exists），唯一的绿种子 3 是「新增约束」，修复前本来就正确。修复后全部绿（§八）。
- Affected CUJ (id or 无); SLI captured it?: 无（issue 声明不涉及 CUJ）。
- Framework fix (interaqt / Axii / axle only): package interaqt；repro 与回归见上；upstream PR 见 §八；consumed version：待发布。
- Record (after fix): 本文件。
```

类别普查（框架拥有的约束类物理对象 × 变更方向）：

修复前的普查（框架拥有的约束类物理对象 × 变更方向）：

| 对象 | 新增 | 不变（再次 setup / 无关迁移） | 删除 | 同名改定义 |
|---|---|---|---|---|
| UniqueConstraint 唯一索引 | covered（migration.spec L3363 / L3405 / L3483；PG L563） | 幂等，无显式用例 | 缺陷 D-1（C1、C2） | 缺陷 D-2（C3、C4） |
| NonNullConstraint CHECK | covered（L3446 / L4078；PG L563） | 缺陷 D-3（C6、C7） | 缺陷 D-4（C5） | 缺陷 D-3（C9） |
| Entity.identity 唯一索引 | covered（applicationIdentityMigration L135 / L290 / L316） | 幂等 | 缺陷 D-5（C8） | 缺陷 D-5（C10，新名并存） |
| 逻辑 id 唯一索引 | 随记录 | 幂等 | 随表删除或被阻断 | 物理路径变更被阻断 |
| Transform 唯一索引 | covered | 幂等 | 代码阅读：残留；只要 bound state 列为 NULL 就不影响写入；未复现，记为 debt | 代码阅读：名字由字段派生，新旧并存；记为 debt |
| 内部 kv 约束（`_System_` / `_Dictionary_`） | 固定声明 | 幂等 | 只有框架版本变更会触发；潜在 | 同左 |

修复后的覆盖（迁移格均为 PGLite / SQLite / PostgreSQL；SQLite 不支持 NonNullConstraint）：

| 对象 | 新增 | 不变 | 删除 | 同名改定义 |
|---|---|---|---|---|
| UniqueConstraint 唯一索引 | C2、C12 | C19（只改 violationCode）、所有 setup(false) 格 | C1、C11、C15 | C3、C4、C16、C18（无法读回的谓词） |
| NonNullConstraint CHECK | 既有用例 | C6、C7 | C5 | C9 |
| Entity.identity 唯一索引 | 既有用例 | C17 | C8 | C10 |
| 逻辑 id 唯一索引 | 每个 `setup(true)` 的安装不变量 | 每个 `setup(false)` 的只读检查 | 不可单独发生（随表） | 不可单独发生（物理路径被阻断） |
| Transform 唯一索引 | 既有用例（migration.spec L612） | r26 L-6（旧弱哈希名残留不阻止启动） | C20、r26 L-6 | 名字由字段派生：表现为「删除旧名 + 新增新名」 |
| 内部 kv 约束 | 每个 `setup(true)` 的安装不变量 | 每个 `setup(false)` 的只读检查 | 随框架版本变更，走同一对账 | 同左 |

## 六、修复建议（已按本节实施，差异见 §八）

1. **收敛点。** 用一个函数计算期望约束对象集合，用一个函数读取已安装约束对象集合，规划只有一处对账。
   `setup(true)`、`setup(false)`、`migrate`、`createMigrationBaseline` 全部经由这三者，取代目前 setup 与迁移两套
   各自发 DDL 的实现。
2. **已安装集合与已安装定义都以数据库目录为准。** manifest 不能作为已安装状态的依据：被 v4.11.2 及更早版本迁移过的库，
   manifest 要么已经没有旧约束（D-1、D-5），要么记录的是新定义、而同名索引仍是旧定义（D-2）；`createMigrationBaseline`
   接入的库没有可信的 manifest；绕过框架的手工改动 manifest 也不知道。定义比较按目录结构进行（见下文决策 3）。框架对象的
   归属：`uniq_<记录名>_<约束名>_<stableHash(记录名:约束名)>` 的哈希可从名字本身复算；超长截断、无法复算的名字列为需审阅项。
3. **对账结果分四类。** 缺失：创建，保留现有的先验证后创建；多余：删除；同名但定义不同：先验证新定义，再删旧建新，
   放在同一事务内（PostgreSQL 的 DDL 是事务性的）；一致：不发 DDL，这同时消除 D-3。
4. **diff 增加约束变更条目**（added / removed / changed，带前后定义）。
5. **把规则升格为检查不变量。** 迁移在写 manifest 之前重新读取目录，断言已安装集合等于期望集合。`setup(false)` 也做同样的
   断言，不一致时 fail-fast 并指向迁移。已经发散的库 modelHash 是一致的，不会触发迁移，`setup(false)` 的断言是它们唯一的
   检测入口。
6. **错误映射。** 不变量成立后不会再有孤立对象。在此之前，冲突发生在框架拥有但未声明的对象上时，应给出明确错误，
   而不是无名的 `ConstraintViolationError`。
7. **测试体系。**
   - `tests/runtime/WritingComputationTests.md` 新增一行：「迁移 × 约束变更方向 {新增 / 不变 / 删除 / 同名改定义（属性、
     where、目标属性）/ 改名替换} × 对象种类 {UniqueConstraint / 带 where 的 UniqueConstraint / NonNullConstraint /
     Entity.identity / Transform 唯一索引} × 入口 {setup(false) / 无关迁移 / 改约束的迁移} × 驱动 {PGLite / PostgreSQL /
     SQLite}」。
   - 迁移生成式套件增加约束变异，并加入安装等价预言机：迁移后框架拥有的索引与约束集合（名字和定义）等于对 v2
     全新执行 `setup(true)` 得到的集合。这是由独立推导得到的绝对预言机。新变异要追加在变异菜单末尾，或使用独立的 rng
     子流，以免改变既有 rng 决策流；改动后重新验证基础种子池 1–499。

需要验收人决定的契约问题（本节的建议在初稿之后修订过，见决策 3）：

1. **删除和改定义：建议设为必须审批的决策。** 新增约束只列为 diff 条目，由现有的先验证后创建把关（收紧等同于新增）。
   删除约束，以及同名改定义中「去掉旧定义」的部分，生成 required decision，内容固定被删除的对象（记录名、约束名、物理名、
   旧定义），审批过期即拒绝。理由：`empty-fact-record-removal` 在不删除任何数据（`expectedCount: 0`）时也要求显式决策，
   移除承载保证的物理对象需要固定内容的审批，与之一致；约束可能因重构或合并冲突被意外删掉，「代码里删了就是有意的」不成立；
   v4.11.2 及更早版本留下的孤立对象经同一决策清理，生产上没有静默的 DROP。不区分放宽与收紧：带 `where` 时这在一般情况下
   无法判定，统一规则更简单。代价：diff 文件格式新增一种决策，审批工具需要适配（测试助手 `approveGeneratedMigrationDiff`
   对未知类型回落为 destructive-scope，必须改）。
2. **`setup(false)`：建议只读校验，不一致即 fail-fast，并且不再执行任何 DDL。** 声明变化已经被 modelHash 校验拦在
   `setup(false)` 之外，所以启动时的 DDL 只会在数据库偏离 manifest 时真正起作用，而这正是应该暴露而不是悄悄补上的情况；
   D-3 就是启动重复执行安装 DDL 的产物。启动时执行 DDL 还绕过了审阅、验证顺序和迁移锁：缺失的唯一索引在启动时以非并发
   方式重建，构建期间阻塞写入；多副本同时启动时还会被多个进程并发执行。依赖启动建索引的只有 `createMigrationBaseline`
   之后的旧库，baseline 应像核对列一样核对约束（符合其文档「current definitions exactly match the existing schema」）。
   现有测试不受影响（缺表用例本来就期望失败，脏数据用例被 modelHash 校验拦截）。升级影响：已经发散的库升级后无法启动，这是
   预期结果，错误信息需要列出每个不一致并指向 `generateMigrationDiff` / `migrate`；建议 Mesh 在升级前对每个环境先生成 diff
   找出这些库。不建议提供关闭开关（显式控制，最小 API 面）。
3. **物理名：建议不改名；已安装定义按目录结构比较，并在目录里记录定义指纹。**（本条修订过两次：初稿建议「不改名，用
   manifest 比较定义」，不成立，因为 D-2 受害库的 manifest 记录的是新定义；第二稿建议「物理名加入定义指纹」，从通用框架的
   角度代价过高。）
   - 必须具备的能力是核对已安装定义，而不是改名。D-2 受害库可能存在于任何 v4.11.2 及更早版本的用户那里（给已有约束加
     `where` 是收窄唯一范围最自然的写法），收紧的情形下数据里可能已有违反声明的重复行；baseline 与手工改动同样需要按目录核对。
   - 目录结构可以精确判定绝大部分情形，不需要解析文本（2026-10-13 在 PostgreSQL 17.6、PGLite、SQLite 上实测）：存在性、
     唯一性、字段列表及顺序（`pg_index.indkey` → 列名；SQLite `pragma_index_info`）、谓词有无、NonNull 的列
     （`pg_constraint.conkey`）。identity 与 Transform 索引的名字本来就由字段派生。
   - 唯一需要比较文本的是两边都带 `where` 的情形：PostgreSQL 会改写谓词（`'active'` → `'active'::text`，`IN` →
     `= ANY (ARRAY[...])`，`!=` → `<>`）。解决办法：框架每次创建或重建约束对象时，把定义指纹记在目录里——PostgreSQL /
     PGLite 用 `COMMENT ON INDEX`（两者实测支持），SQLite 的 `sqlite_master.sql` 本来就保存建索引语句原文（去掉了
     `IF NOT EXISTS`）；MySQL 不支持用户 UniqueConstraint，不涉及。注释不进 modelHash，不强制任何用户迁移。没有注释的旧
     索引，对 interaqt 自己生成的封闭谓词集合（6 种运算符、AND 组合）解析 PostgreSQL 的反解析文本后比较；解析失败按不可判定
     处理：不阻止启动，在下一次迁移中列为「重建以确认定义」的审阅项（先验证再重建，结果安全），重建后带上注释。注释丢失
     （例如 `pg_restore --no-comments`）回到同一路径。
   - 改名的代价对通用框架过高：物理名参与 modelHash，所有用户的所有库升级后都必须迁移一次，所有唯一索引改名，用户日志、
     监控和手工脚本里引用的物理名全部变化；而它要解决的不可判定情形只有「两边都带谓词」这一窄类。
   - `setup(false)` 的只读检查（决策 2）据此对可判定的不一致 fail-fast：缺失、多余、字段列表不同、谓词有无不同、谓词内容
     （有注释或解析成功时）不同。这样 C3、C4 形态的存量受害库在升级后第一次启动即被发现。

三项在同一个版本里发布：决策 2 的启动检查依赖决策 3 的目录比较；已发散的库在升级后的第一次启动被发现，经一次迁移（含决策 1
的审批）修复。没有发散的库升级后不需要任何迁移。

## 七、对 Mesh 的影响与处置

- 在 Mesh main 上做 GitHub 代码搜索：34 个非文档、非测试源文件声明了 `UniqueConstraint`，没有 `NonNullConstraint`
  （GitHub 代码搜索的结果可能不完整）。D-1、D-2、D-6 适用；只有改动 `Entity.identity` 声明时才涉及 D-5；D-3、D-4 目前不适用。
- 不应在 Mesh 侧用手工 `DROP INDEX` 迁移脚本绕过（这是 escaped-defect 协议禁止的绕过形态）。issue 保持 open，直到上游
  发布修复版本并被 Mesh 消费。
- 已经执行过此类迁移的环境存在孤立索引，至少包括 issue 中的临时演练库。修复版本必须能从数据库目录发现并清理它们
  （§六第 2、5 条）。
- 修复发布之前，尤其要避免同名 UniqueConstraint 改定义（D-2）：放宽不会生效；收紧也不会生效，而且不报错。

## 八、修复

### 8.1 机制

- **唯一实现。** `src/storage/erstorage/ManagedConstraints.ts` 定义框架拥有的约束对象：期望集合
  （`buildDesiredManagedConstraints`，Transform 唯一索引由系统层通过回调提供）、目录读取（`readInstalledManagedConstraints`，
  PostgreSQL/PGLite 读 `pg_index` / `pg_constraint`，SQLite 读 `sqlite_master` 与 `pragma_index_*`，MySQL 读
  `information_schema.statistics`）、比较（`reconcileManagedConstraints`：equal / missing / extra / different / undecidable）。
  install、attach、迁移规划和写 manifest 前的不变量全部经由它；`MonoStorage.createConstraints`、
  `setupFrameworkLogicalIdUniqueIndexes`、`setupFrameworkApplicationIdentityIndexes`、`MonoSystem.setupTransformUniqueIndexes`
  与 `createTransformUniqueIndexOperations` 已删除。
- **迁移。** missing → 验证后创建；extra → 删除；different / undecidable → 先删后建。删除（`constraintCleanupDDL`）在迁移重算事务
  开始时、重算之前执行；创建与指纹注释在验证之后；写 manifest 之前重读目录，要求每个对象都是 equal，否则整个事务回滚。
- **审阅面。** diff 新增 `kind: "constraint"` 变更（带安装定义与声明定义）。删除或改定义 UniqueConstraint / NonNullConstraint /
  Entity.identity 需要 `constraint-removal` 决策，决策固定表名、物理名与目录给出的定义文本；Transform 与逻辑 id 索引的残留只列为变更。
- **attach。** `setup(false)` 不执行任何约束 DDL；对 missing、different 和非 Transform 的 extra 抛 `ConstraintSetupError`
  （`mismatches` 列出每个对象），残留 Transform 索引与 undecidable 不阻止启动。
- **install。** `setup(true)` 建完后执行同一检查（要求全部 equal）。这让全套测试的每一次安装都成为「期望集合与目录读取一致」的检查。
- **定义指纹。** PostgreSQL/PGLite 上创建对象时写 `COMMENT ON INDEX|CONSTRAINT ... IS 'interaqt-constraint:v1:<sha1>'`；
  没有注释的存量对象按结构比较，带谓词时解析服务器反解析的谓词（6 种运算符、AND 组合、类型转换、`= ANY` / `<> ALL` 改写），
  解析失败按 undecidable 处理。下一次迁移为 equal 但缺指纹的对象补写注释。modelHash 与 manifest 生成器版本都没有改变，
  没有发散的库升级后不需要迁移。

### 8.2 与 §六 建议的差异

- `createMigrationBaseline()` 没有加约束检查。原因：没有 manifest 的旧库可能缺少框架后来才引入的索引（例如逻辑 id 索引），
  baseline 若对约束 fail-fast，这类库就没有任何接入路径。baseline 之后 `setup(false)` 的只读检查会报告差异，
  modelHash 不变的对账迁移负责修复。迁移指南已写明这一点。
- 发现约束对象不一致时 `setup(false)` 一律 fail-fast（决策 2），但残留的 Transform 索引例外：它们覆盖的 bound state 列
  不再被写入（NULL 不冲突），或是与当前索引同定义的 r26 之前的弱哈希旧名。下一次迁移把它们作为列出的变更删除。
  这改变了 r26 L-6 用例的契约（旧名索引不再由 `setup(false)` 删除），用例已按新契约改写。

### 8.3 验证

- 全量 `npx vitest run`（Node 22，rebase 到 origin/main `3bc6d26` 之后）：240 个文件、2905 个用例通过（80 个依赖环境变量的跳过）。
- `npm run test:postgres`（本机 PostgreSQL 17.6，含新增的两个文件）：除下文的间歇失败并发用例外全部通过。
- MySQL 8（本机 docker）上 CI 的 MySQL 子集（`mysqlOpenIdempotency`、`driverCloseIdempotency`、r26 leftovers、
  `mysqlMigrationOperationKey`）与 `entityIdentity` 的 MySQL attach 格：通过。
- `migrationGenerativeFuzz` 按 nightly 配置（种子 1–60、`FUZZ_MIG_OPS=14`）全部通过；`migrationDestructiveFuzz` 种子 1–151：
  150 个通过，种子 116 失败于同一个 `Migration is already running`（与下一条同族；PR #56 当时失败的种子 150 现在通过）。
- `postgresqlConcurrency.spec.ts` 的 `keeps transform mapped records aligned during concurrent source updates` 在本机
  PostgreSQL 17.6 上间歇失败（SERIALIZABLE 重试 5 次耗尽）。在修复前的 src（origin/main `3bc6d26` 与 v4.11.2 `11742d4`）上
  重复运行同样 3 次中失败 2 次，与本修复无关。
- `migrationGenerativeFuzz` 种子 1–200：199 个通过；种子 178 失败于 `Migration is already running`。故障注入落在
  `beginMigration` 取得迁移锁之后、写 migration log 之前（`MonoSystem.ts` `beginMigration` 的 INSERT），`Controller.migrate`
  因 `migrationRun` 尚未赋值而不释放锁。这是 PR #56 记录的同一已有缺陷（当时的种子 148 / 150），与约束无关；
  新增的目录读取改变了调用计数，使种子 178 落到该窗口。nightly 池是 1–60，不含该种子。

### 8.4 未处理的相邻项

- 迁移锁在 `beginMigration` 部分失败时泄漏（见 8.3），需要单独修复。
- 约束对象的归属按名字前缀判定（`uniq_` / `interaqt_id_` / `interaqt_ident_` / `idx_transform_`）。用户在模型表上手工创建同前缀的
  对象会被识别为框架对象：`setup(false)` 报告它，迁移在审批后删除它。迁移指南已声明这些前缀为保留前缀。
