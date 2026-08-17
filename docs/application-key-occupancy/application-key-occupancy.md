# 应用键的跨副本原子占有 — 设计文档

```text
status: 已完成
design-round: 2/15
implementation-round: 6/20
current-milestone: M-01
current-milestone-reopens: 2
convergence-mode: normal
next-action: 无
```

本文是 `docs/application-key-occupancy/application-key-occupancy-task.md` Task 1 的设计文档。全部现状判断针对当前 HEAD `c358cf9`（v4.9.0），证据为源码行号、既有测试与设计期最小验证实验（探针 P1–P4、Adj-R1、review-at1，见 §6.3）。d1 修订了 §3.2 编译落点、§3.3 写路径汇合点、§3.6 读者表与 §5 R-2：identity 是记录元数据，不是 UniqueConstraint / NonNullConstraint 的变体。d2 独立核验 additional task 1 的「通过」结论：六类复审条件下未采纳任何需要复审的问题；设计进入实现循环，N = 5 × 4 = 20。

---

## 1. 背景和现状

### 1.1 问题（与 Task 第 1 节一致，此处不复述动机）

应用定义的复合键（如 `ns + token`）需要四种可观察行为：先到者登记、至多一次消费、有界存活、框架可见。权威落在共享持久存储；进程内映射在多副本下不是权威。以下逐项核对当前 HEAD 上每条既有能力覆盖什么、缺什么。

### 1.2 现有能力清单（Task 要求 1 与要求 5 的求证结果）

每行结论均有可复现证据。「探针」指 `agentspace/output/application-key-occupancy-probes/` 下的设计期实验（运行命令见 §6.3）。

| # | 能力 | 覆盖 | 缺口 | 证据 |
|---|------|------|------|------|
| 1 | UniqueConstraint（`src/core/Constraint.ts:35-40`） | 物理 `CREATE UNIQUE INDEX`（`src/storage/erstorage/SchemaDialect.ts:162`，无预检查询）；冲突经唯一汇合点 `MonoSystem.callWithEvents → mapConstraintError`（`src/runtime/MonoSystem.ts:1918-1920`、`:1829-1871`）映射为类型化 `ConstraintViolationError`（含 `violationCode`、`rawCode`，`retryable:false`，`src/runtime/errors/ConstraintErrors.ts:16-41`）；真实 PG 索引竞态路径同样被映射（探针 P3：`rawCode: '23505'` 仍是类型化错误） | 后到者得到的是**故障加整体回滚**：`result.error` 携带错误、`effects` 为空、败者的交互事件与全部同 dispatch 写入一并回滚（`tests/runtime/dataConstraints.spec.ts:154-210`；探针 P1/P3 复证：败者尝试在数据模型中零留痕）。无法留下尝试记录、无法观察既有行、错误不可重试（`src/runtime/transaction.ts:175-190` 不含 23505） | P1、P3；`dataConstraints.spec.ts:66-72`、`:253-256` |
| 2 | 条件更新 / 行锁 | `storage.update(entity, match, data)` 返回受影响记录数组（无匹配→`[]`）；`storage.atomic.lockRecord/lockRows`（`src/runtime/System.ts:135-136`）为已存在行提供 `SELECT ... FOR UPDATE` | `update` 的 match 不是原子条件写：先无锁预选再逐行更新（`src/storage/erstorage/UpdateExecutor.ts:64`），不能当 CAS 用；`lockRecord` 对不存在的行返回 `undefined` 且**不获得任何锁**（`src/runtime/MonoSystem.ts:1696`）——无间隙锁，行不存在时无法按应用键决定先后 | 报告 A/C；代码行号如左 |
| 3 | 全局字典（`src/core/RealDictionary.ts`；`_Dictionary_` 实体 `src/runtime/System.ts:422-443`） | 声明面键空间在声明期固定；`storage.dict.set` 技术上接受任意 key（运行时懒建行） | 动态键不受管理：不进声明、无迁移签名意义、无保留清理；无行级过期、无一次性消费列；并发 find-then-create 冲突被转成 `RetryableWriteConflict` 收敛到 **update 轨**（`src/runtime/MonoSystem.ts:461-471`）——语义是后写者覆盖值，与先到者登记相反 | 报告 B；代码行号如左 |
| 4 | dispatch 幂等账本 `_DispatchIdempotency_` | 引擎内部已实现按 `(namespace, idempotencyKey)` 复合主键的跨副本先写者登记：`FOR UPDATE` load → 裸 INSERT → 唯一冲突映射为类型化 `IdempotencyError`（`src/runtime/MonoSystem.ts:1286-1363`）；回放对调用方是 `outcome:'replayed'` | 键空间绑定 EventSource 请求幂等键（`src/core/EventSource.ts:13-31`），不是应用票据；裸 DDL 内部表（`MonoSystem.ts:618-628`，`logicalPath: 'internal:...'`）：不是 Entity、`storage.find` 不可查（探针 P1 第 2 例：抛错）、不进 modelHash（`src/runtime/migration.ts:1096-1101` 仅含 records/relations/dictionaries/computations/sequences/storage schema）、无任何清理路径（`src/` 无 `DELETE FROM "_DispatchIdempotency_"`） | P1；报告 B |
| 5 | `Entity.retention` / `maintainEntityRetention` | `forever/cap/ttl` 三态（`src/core/Entity.ts:24-43`）；TTL 按应用声明的 `timestampProperty` + `maxAgeMs` 删行；显式维护步、独立事务、发正常 mutation events（`src/runtime/Controller.ts:651-713`；`tests/runtime/entityRetention.spec.ts` 15 例全绿）；retention 进 modelHash（`migration.ts:1026-1031`） | 只作用于 `controller.entities` 中声明了 retention 的实体（`Controller.ts:678-685`）；对内部裸 DDL 表不可见。**结论：只要占有记录是普通实体，回收即免费**——缺口不在保留 | 报告 B；基线套件 |
| 6 | Interaction 准入（`Condition.locks` / `AdmissionSnapshot` / `InteractionGuardError.code`，`src/builtins/interaction/Condition.ts`） | 对**已存在行**的并发 check-then-act：锁行→快照→类型化拒绝，fail-closed | 锁的原语是行锁：键无行时两个并发 dispatch 都锁空、都通过条件，随后由唯一索引仲裁——败者回到第 1 行的故障形态。行不存在时该层结构性无能为力 | 报告 C；`MonoSystem.ts:1696`、`:1735-1782` |
| 7 | mutation events（`DispatchResponse.effects` / `storage.listen`） | 首次应用时 `effects` 携带含 id 的完整事件（探针 P1–P4 均以此断言胜者）；`listen` 在事务内同步回调 | 计算决定不写入（skip）时**无任何事件**（报告 C）；幂等回放时 `effects` 为空。作为通道本身够用，缺的是「有一条会产生稳定结果的写路径」 | P2、P3；报告 C |
| 8 | 属性级 StateMachine（`src/runtime/computations/StateMachine.ts`） | **一次性消费在 HEAD 已可表达**：`computeTarget` 被 await 且以 controller 为 `this`（`:239`），可以异步按应用键查行并以不可变 `expiresAt` 过滤（该查找模式已见于官方文档 `agent/agentspace/knowledge/generator/api-reference.md:1377-1390`）；转移前 `currentState.lock(dirtyRecord)` 行锁（`:265`），败者锁后重读见新状态→静默 skip（`:266-269`）。探针 P2（PGLite 四分支）与 P3.3（真实 PG 双连接，更新事件 A=1/B=0）验证恰好一次 | SM 只有 global/property 两个 handle（`:299`），**不能创建行**（`Controller.ts:1144-1151`、`:1249-1263` 仅按 id 更新宿主行）；`computeTarget` 只接受 `{id}` 形态，属性对象是硬错误（`:117-124`）。消费半边成立的前提是登记半边已把行放进去 | P2、P3.3；报告 D |
| 9 | Transform（`src/runtime/computations/Transform.ts`） | 创建派生记录的既有概念；`record: InteractionEventEntity` 是对 append-only `_Interaction_` 实体的数据轨（每次 dispatch 落一行，`Controller.ts:1674`）；插入经 `applyResultPatch → storage.create`（`Controller.ts:1231-1232`），**无任何冲突处理** | 输出撞唯一键=第 1 行的故障形态。数据轨自动唯一索引 `(sourceRecordId, transformIndex)` 是来源身份不是应用键。注意：任务画像中「Transform 顶层 id 有硬失败守卫 `assertNoIdInTransformedRecord`」已过时——该守卫在 `fcfe2b9` 移除，HEAD 上插入携带顶层 id 合法（`Transform.ts:13-16`） | P1、P3；报告 D |
| 10 | 实体级 Custom + `atomic.lockRows` + 插入 patch（`src/runtime/computations/Custom.ts`） | **最接近的既有形态**。锁查-判空-插入 patch 的 create-if-absent 今天可写出：顺序场景稳定（先到 `success-with-insert`，后到 `success-no-insert`）；真实 PG 双连接竞态 10/10 轮收敛（探针 P4：恰好一行、双方无错误、胜者携带 create 事件） | 见 §1.3——收敛依赖框架不承诺的机制；教义明文将 Custom 定位为最后手段（`generator/computation-implementation.md:616-630`）；每个应用手写编排 | P4；报告 D |

### 1.3 对「已有完整官方路径」候选（第 10 行）的裁定性分析

Custom 惯用法在观察到的拓扑下给出了稳定代数，但它不能被认定为「完整官方路径」，理由全部可核对：

1. **收敛保证不在框架控制之内。**实体级 patch 应用强制 SERIALIZABLE（`src/runtime/Scheduler.ts:1566-1569`），败者依赖两种机制之一收敛：(a) `RequireSerializableRetry` 升级重试的时间差使重试时 `lockRows` 已见到胜者已提交行；(b) PostgreSQL 在 SERIALIZABLE 下对并发重复插入以可重试的 `40001` 而非 `23505` 报告（SSI 对唯一冲突的前置检测，属 PostgreSQL 版本相关实现行为）。框架的重试谓词**不含** `23505`（`src/runtime/transaction.ts:175-190`），一旦某个交错以 `23505` 浮出，败者立即退化为第 1 行的「故障+整体回滚」。框架既没有声明也没有测试这两种机制；把结果代数押在方言实现细节上不可作为官方承诺（AGENTS.md 修 bug 清单第 7 条：方言修复需方言匹配探针——同理，方言依赖的承诺需要框架自己持有该保证）。
2. **不变量落在应用代码里。**`lockRows` 的 match 必须恰好等于唯一键、UniqueConstraint 必须同时声明作后备、并发模式必须保持默认 serializable——三条正确性前提全部由每个应用手工维持，任何一条写错都无声退化（漏 UniqueConstraint 时在低隔离下产生双行）。这正是「同一不变量多执行点」的最坏形态：执行点在框架之外。
3. **教义冲突。**知识库将 Custom 定位为最后手段并给出决策阶梯（创建用 Transform、更新用 StateMachine）；而本场景中 Transform 恰恰是故障形态（P1/P3）。把最后手段扶正为该场景唯一官方路径，等于宣布决策阶梯在「带键创建」上失效。
4. **代价错位。**为一次带键插入把整个 dispatch（含全部无关计算）强制 SERIALIZABLE 并接受整体重试（admit/条件重跑、事件行重建），是把行级问题的成本摊到请求级。

**结论（Task 要求 1 的裁定）：缺口成立。**精确表述：当前 HEAD 上，「按应用键、跨副本、先到者登记」不存在一条由框架承诺结果代数的声明式路径——声明式创建概念（Transform）在键冲突时给出的是不可重试故障加整体回滚（P1/P3），最接近的替代（Custom 惯用法）其收敛性依赖框架未承诺的重试时序与方言行为，且正确性前提散布在应用代码中（P4 + 上文 1–4）。消费、保留、可见性三个半边在 HEAD 上分别已由 StateMachine（P2/P3.3）、`Entity.retention`、普通实体机制覆盖。

### 1.4 历史事实（非方案输入）

- 同 slug 首轮交付（`UniqueConstraint.onConflict: 'keep-existing'` + `DispatchResponse.recordIdentity` + `StateTransfer.expiresAtProperty` + 应用键 computeTarget 形态）已于 2026-08-17 从工作树整体撤销，当前 HEAD 无其任何残留（`src/core/Constraint.ts`、`src/core/StateTransfer.ts` 逐文件核对；`src/core/keepExisting.ts` 不存在）。撤销理由分析见 `agentspace/output/application-key-occupancy-essence-analysis.md`；其中的方向建议按任务要求仅作分析意见，本文 §3 的采纳/搁置均经独立求证。
- 引擎内部已有三个「按键先写者胜」先例，均为内部表机制：幂等账本（裸 INSERT + 类型化冲突映射）、`_ScopedSequence_`（单条 `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` 上锁序列化，真实 PG 双 Controller 200 并发精确 1..200，`tests/runtime/postgresqlScopedSequence.spec.ts:100-117`）、`_ComputationState_` 全局 CAS 的 `INSERT ... ON CONFLICT DO NOTHING` 兜底（`MonoSystem.ts:1584-1594`）。这证明存储层原语成熟，缺的只是把它接到应用可声明的记录上。
- SAVEPOINT 基础设施已存在并被业务事务使用（`src/runtime/System.ts:196-213`、`MonoSystem.ts:233-255`）。
- 框架已有「额外唯一索引、但不走 UniqueConstraint Klass」的先例：逻辑 `id` 唯一索引经 `frameworkLogicalIdUniqueIndexes`（`SchemaDialect.ts:165-215`，注释写明 *outside the user UniqueConstraint → createUniqueConstraintStatement pipeline*）；数据轨 Transform 的 `(sourceRecordId, transformIndex)` 经 `MonoSystem.setupTransformUniqueIndexes`（`MonoSystem.ts:2425-2449`）。Identity 与这两条同族。

## 2. 目标与非目标

### 2.1 目标（对应 Task 编号要求）

| Task 要求 | 本设计的承接 |
|---|---|
| 1 求证 | §1.2/§1.3：缺口成立，证据如上；「已有完整官方路径」被 P4+代码分析否定 |
| 2 官方路径 | §3：`Entity.identity` 声明 + 既有 Transform/StateMachine/retention 组合；声明 + `Controller.dispatch`，无平行写 API |
| 3 验收硬约束 | §4 里程碑 M-02（并发登记双拓扑）、M-03（一次性消费）、M-04（框架可见/保留/TTL 后重登记） |
| 4 非目标 | §2.2 |
| 5 与现有能力关系 | §1.2 清单；§3.6 读者枚举 |
| 6 交付与验证纪律 | §4 各里程碑验收命令；§5 风险安排 |
| 7 范围边界 | 框架能力（core/runtime/storage/文档/测试），不改造任何具体业务 |

### 2.2 非目标（含 Task 第 4 节硬约束的落点）

- 不内置分布式锁、租约、时钟同步；过期语义是「事件/查询发生时对存储数据的比较」，比较用求值进程时钟对存储的 `expiresAt`，与 retention 的时间口径一致并写入文档。
- 不重做 dispatch 幂等、不重做 `Entity.retention` / `maintainEntityRetention`（占有实体直接声明 retention 复用官方维护步）。
- 不新增与 `dispatch` 平行的占有写 API；不提供 `claim/consume` 方法。
- 不引入 `StateTransfer.guard`：消费侧过期过滤用 HEAD 已支持且已见于官方文档的 computeTarget 查找形态（P2/P3.3 验证），不为本任务扩状态机声明面。guard 作为独立一般概念留给后续任务。
- 不引入计算决策可观察性（skip 原因事件）：本任务的结果经 effects+查询约定已可区分（§3.4 真值表）；该方向留作后续独立任务。
- 不做 Relation 的应用身份（本任务实体即够；relation 身份留作显式后续）。
- 不把源图/滞后投影读约定、提交后副作用、标量聚合、复合 interaction、Condition 事务可见性纳入本任务。
- 不在 MySQL 上实现占有写路径。MySQL 驱动 `transactions: false`（`src/drivers/Mysql.ts:102-110`），`Controller.dispatch` 不可用；其 SQL 也不支持 PostgreSQL/SQLite 的 `INSERT ... ON CONFLICT DO NOTHING`。identity 在 MySQL 上 setup 期 fail-fast（§3.2.2）。

## 3. 方案

### 3.1 一句话方案

新增**一个**声明概念：实体的**应用身份**（application identity）——`Entity.identity` 声明某组属性构成该实体的应用级身份键；身份蕴含**全定（NOT NULL）、唯一、不可变**，且创建遵循**集合语义**：在任何**逻辑创建**路径上创建一条身份已存在的记录，都解析为「引用既有行、丢弃本次载荷、不产生 create 事件」，而不是抛错。登记、消费、保留、观察全部落在既有概念上（Transform、StateMachine、retention、effects+查询），不新增结果通道、不新增写 API。

Identity **不是** UniqueConstraint 或 NonNullConstraint 的变体。UniqueConstraint 继续表示「冲突即类型化故障、整次 dispatch 回滚」，所有写入路径一致。二者不共享 Klass、不共享 `entity.constraints`、不共享写路径分支标志。

### 3.2 声明面

```typescript
const unused = StateNode.create({ name: 'unused' })
const used = StateNode.create({ name: 'used' })

const HandshakeToken = Entity.create({
  name: 'HandshakeToken',
  identity: { name: 'byKey', properties: ['ns', 'token'] },   // 新增字段，每实体至多一个
  properties: [
    Property.create({ name: 'ns', type: 'string' }),
    Property.create({ name: 'token', type: 'string' }),
    Property.create({ name: 'payload', type: 'string' }),
    Property.create({ name: 'holder', type: 'string' }),
    Property.create({ name: 'expiresAt', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'number' }),
    Property.create({
      name: 'status',
      type: 'string',
      computation: StateMachine.create({
        states: [unused, used],
        initialState: unused,
        transfers: [
          StateTransfer.create({
            current: unused,
            next: used,
            trigger: {
              recordName: InteractionEventEntity.name,
              type: 'create',
              record: { interactionName: 'Consume' },
            },
            computeTarget: async function (this: Controller, event) {
              const row = await this.system.storage.findOne(
                'HandshakeToken',
                BoolExp.atom({ key: 'ns', value: ['=', event.record.payload.ns] })
                  .and({ key: 'token', value: ['=', event.record.payload.token] }),
                undefined,
                ['id', 'expiresAt'],
              )
              if (!row) return undefined
              if (!(row.expiresAt > Date.now())) return undefined
              return { id: row.id }
            },
          }),
        ],
      }),
    }),
  ],
  retention: { mode: 'ttl', partitionBy: undefined, ttl: { timestampProperty: 'createdAt', maxAgeMs: 86_400_000 } },
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => event.interactionName === 'Register' ? {
      ns: event.payload.ns, token: event.payload.token,
      payload: event.payload.data, holder: event.payload.nonce,
      expiresAt: event.payload.expiresAt, createdAt: Date.now(),
    } : null,
  }),
})
```

`identity` 的归一化与 `normalizeEntityRetention` 同构、同位（`Entity.create` 内唯一检查点）。`identity.name` 遵守 `validNameFormatExp`，是该实体上的局部标签（用于错误信息与文档），**不进入** UniqueConstraint 的全局逻辑名表（`Setup.ts:1494-1505`）。两个实体都可以使用 `name: 'byKey'`。

#### 3.2.1 声明期与 setup 期规则（有限表）

| # | 阶段 | 输入 | 结果 |
|---|------|------|------|
| D1 | `Entity.create` | `properties` 为空、含重复、或引用未声明属性 | 抛错 |
| D2 | `Entity.create` | 身份属性 `type` ∉ `{string, number, boolean}`，或 `collection` / `computed` / 扩展类型 | 抛错 |
| D3 | `Entity.create` | 身份属性声明了 `defaultValue` | 抛错（身份必须由创建方全量给出） |
| D4 | `Entity.create` | filtered（`baseEntity`）或 merged（`inputEntities`）实体声明 identity | 抛错（与 retention / constraints 同族：物理宿主规则，`Entity.ts:161-170`、`Setup.ts:1471-1476`） |
| D5 | `Entity.create` | 每实体超过一个 identity；`identity.name` 不合 `validNameFormatExp` | 抛错 |
| D6 | `Entity.create` | 同一实体上存在 UniqueConstraint，其 `properties` 集合与 `identity.properties` 相等（与顺序无关） | 抛错（同一属性集不能既「冲突即故障」又「集合语义观察」） |
| D7 | `Entity.create` | Relation 声明 identity | 不可表达（identity 只挂在 `EntityCreateArgs`；本任务不做 relation 身份） |
| S1 | `controller.setup` | 身份实体的物理表在 `mergeRecords` 之后与**另一个非 filtered 实体**三表合一（1:1 combined / `isTargetReliance` 自动合表 / 显式 `mergeLinks`） | setup fail-fast。关系记录合并进该实体表（merged link / FK 列）允许；该实体自己的 filtered 视图共享基表允许 |
| S2 | `controller.setup` | 方言为 MySQL | setup fail-fast。原因是写路径的 `INSERT ... ON CONFLICT DO NOTHING` 不是 MySQL SQL，且 MySQL 无 dispatch；**不是**因为 `dialect.constraints.unique === false`（逻辑 `id` 唯一索引已经用 `createUniqueIndexSQL` 绕过该开关） |
| S3 | `controller.setup` | 合法 identity 实体独占物理表（可与自身 merged link 列同表） | 身份列在 `CREATE TABLE` 上发出列级 `NOT NULL`；另建专用唯一索引（§3.2.2） |

D6 不禁止 UniqueConstraint 是身份属性的真子集或超集：那是另一条「冲突即故障」不变量，与身份集合语义可以共存（两个不同物理索引，写路径按 §3.3 合同分别处理）。

#### 3.2.2 编译与物化（专用 DDL，不经 UniqueConstraint / NonNullConstraint）

Identity 编译为记录元数据，**禁止**做下列任何一件事：

- 调用 `UniqueConstraint.create` 或把 identity 推进 `entity.constraints`；
- 调用 `NonNullConstraint.create` 或走 `createNonNullConstraintStatement`（物理形态是 `ALTER TABLE ... ADD CONSTRAINT ... CHECK (field IS NOT NULL)`，`SchemaDialect.ts:241-260`；SQLite `constraints.nonNull: false`，`src/drivers/SQLite.ts:101`；Adj-R1：仅含 NonNullConstraint 的实体在 SQLite 上 `setup(true)` 失败，PGLite 成功）；
- 对同一物理唯一索引按来源切换「抛错 / DO NOTHING」。

物化方式（与逻辑 `id` 唯一索引、Transform 唯一索引同族）：

1. **列级 NOT NULL**：`DBSetup` 在身份列的 `ColumnData.notNull = true`，并且 `createTableSQL` **必须发出** `NOT NULL`。HEAD 上 `createTableSQL`（`Setup.ts:1372-1386`）只拼接列名与 `fieldType`，忽略 `notNull`（Adj-R1：即使把 `notNull` 设为 true，生成 SQL 仍不含 `NOT NULL`）。这是本任务要补的 DDL 出口，只服务 identity 列，不改变 NonNullConstraint 合同。
2. **专用唯一索引**：由 `Entity.identity` 生成 schema item（物理列名、索引名、record 元数据上的 `identity` 标志），调用 `createUniqueIndexSQL`，**不经** `createUniqueConstraintStatement`。物理索引名哈希 `recordName + 身份属性名`（与 `frameworkLogicalIdUniqueIndexName` 同预算），不含用户 `identity.name`，因此两实体同名 `byKey` 不会碰撞。
3. **运行期全定汇合点**：`CreationExecutor` 在逻辑创建时对缺失 / null 身份属性 fail-fast（程序员错误，不是 `ConstraintViolationError`，也不是「已被占用」）。这是全定的真正汇合点；列级 NOT NULL 是存储层的第二道网。
4. **错误映射**：身份唯一索引**不**登记为 `UniqueConstraintSchemaItem`，不进入 `createConstraintSQL`，也不作为 `mapConstraintError` 的用户约束。身份冲突的官方路径是 ON CONFLICT 观察，不是 23505。若 23505 仍从身份索引冒泡，M-01/M-02 必须红（产品 bug），不得把它映射成「已被占用」。
5. **与 Transform 第二索引共存**：官方配方的实体 Transform 仍有 `(sourceRecordId, transformIndex)` 唯一索引。`ON CONFLICT` 的 arbiter **必须是身份物理列**（哈希后的 field 名，例如 P1 日志中的 `p1t_ns_1pgs7eq`），禁止无目标的 `ON CONFLICT DO NOTHING`——无目标形式会吞掉 Transform 索引与逻辑 `id` 索引上的故障。

### 3.3 写路径合同（逻辑创建汇合于 `createRecord`）

HEAD 上创建事件在物理 INSERT **之前**发出：`CreationExecutor.preprocessSameRowData` 在分配 id 后、`insertSameRowData` 执行 INSERT 前就把 host create 推进 `events`（`CreationExecutor.ts:411-444`、`:615-627`）。合表子记录与行内 link 的 create 同样在 preprocess 阶段发出（`:497-581`）。PostgreSQL / SQLite 的 `database.insert` 都在 SQL 后追加 `RETURNING` 并取 `rows[0]`（`PostgreSQL.ts:360-361`；`SQLite.ts:212-213`）。Adj-R1：`INSERT ... ON CONFLICT DO NOTHING` 未插入时 `database.insert` 返回 `undefined`；现有 `Object.assign(result, ...)`（`:627`）在观察路径上会变成 TypeError。只改 INSERT 文本、不改事件时序，官方结果代数（败者无该实体 create 事件）不成立。

行搬迁（flash-out / relocate）走 `insertSameRowData` 而不走 `createRecord`（`CreationExecutor.ts:138-141`；`RecordQueryAgent.ts:682`）。集合语义只加在逻辑创建上。

**可执行合同：**

| 入口 | 身份键在库中不存在 | 身份键在库中已存在 | 其它唯一索引冲突（UniqueConstraint、Transform 源索引、逻辑 id） |
|------|-------------------|-------------------|---------------------------------------------------------------|
| 逻辑创建：`storage.create`、`applyResultPatch` insert、interaction resolve 里的 create、嵌套创建中的 identity 实体、Transform insert patch | INSERT 新行；发出该逻辑记录的 create 事件；返回新行 id | `ON CONFLICT (身份物理列) DO NOTHING`；**不**发出该逻辑记录的 create 事件；**不**执行本次载荷中的嵌套创建；按身份键读回既有行（既有 `id`，弃用本轮新分配的 id）；dispatch 无 error | 仍为 `ConstraintViolationError` + 整次 dispatch 回滚（P1 形态不得退化） |
| 物理行搬迁：`insertSameRowData` 被 flash-out / relocate 调用 | 按现有搬迁语义插入；不加集合语义 ON CONFLICT | 旧位置已清列后插入同一身份，必须成功落行，不是观察路径 | 与今天相同 |
| 无 identity、仅 UniqueConstraint 的实体 | 普通 INSERT | 不适用集合语义 | `ConstraintViolationError` + 回滚 |

补充规则：

1. **事件时序**：该逻辑记录的 create 事件只在 INSERT 确认插入新行之后进入 `events`。不能先 push 再 pop 数组末尾——合表/行内 link 会在 host 事件前后插入其它事件。S1 禁止身份实体三表合一，因此身份宿主创建不会带 combined 子记录；行内 merged link 的预处理事件仍须服从「仅当对应行实际插入才发出」。
2. **空 RETURNING**：未插入时不得 `Object.assign(undefined, ...)`；按身份键在同事务内 SELECT 既有行作为解析结果。
3. **嵌套载荷**：观察路径丢弃本次创建载荷，因此载荷里尚未执行的嵌套新建不得落行。实现上，身份实体的「插入或观察」发生在 `createRecordDependency` 之前：已观察则直接返回既有引用。
4. **同事务两次同键创建**：第二次走观察。PostgreSQL / SQLite 对未提交行的 `ON CONFLICT` 良定义。
5. **真并发**：败者的 `INSERT ... ON CONFLICT DO NOTHING` 在 PostgreSQL 上等待先行事务落定后按不插入返回——不产生 23505、不需要 SERIALIZABLE、不依赖重试，在 READ COMMITTED 即成立。数据轨 Transform 的 insert 补丁**不**强制 SERIALIZABLE（仅 update/delete 补丁与 Custom 实体补丁会 `RequireSerializableRetry`，`Transform.ts:163-164`、`Scheduler.ts:883-887`）。
6. **更新**：身份属性不可变。`UpdateExecutor` 拒绝对身份属性的改写（抛错，程序员错误）。这与逻辑 `id` 的「静默剥掉 payload id」（`CreationExecutor.ts:420-423`）同族但更严：改写应用键必须被看见，不能当无操作吞掉。
7. **删除**：无特殊语义。行删除后键即空出，再次创建成功——这就是 TTL 回收后允许重登记的机制（§3.5）。
8. **全量重建不是「保留原竞态胜者」。**`Controller.applyResult` 对实体计算是先删全部再按 `compute()` 迭代顺序插入（`Controller.ts:1122-1132`）。集合语义下，重建后每个身份键的载荷是**本次重建中先插入者**。官方配方的数据轨 Transform 在 InteractionEvent 的 create 上走增量 insert patch，不走这条全量路径；迁移或回调变更触发的全量重建必须按此文档化。占用实体的 Transform 回调变更应倾向 `unchanged` / 不重建输出（M-04）。
9. **观察路径的返回值是库中既有行。** HEAD 的 `insertSameRowData` 在 INSERT 后执行 `Object.assign(result, getData())`（`CreationExecutor.ts:627`）。观察时若先读回既有行再赋上本次载荷，调用方会拿到胜者 `id` 与败者 `holder`/`payload` 的混合物。合同：返回既有 `id` **以及** 已存储的载荷字段；本次被丢弃的载荷不得出现在返回值里。
10. **观察路径的副作用（有限清单）。** 观察成立时不得执行下列任何一项；成功插入路径仍须执行（对照：首次插入仍创建嵌套行）。
    | 禁止（观察） | HEAD 今日位置 | 成功插入 |
    |-------------|---------------|----------|
    | `createRecordDependency`（嵌套新建） | `CreationExecutor.ts:163` | 照常 |
    | `unlinkOldOwnersOfExclusiveTargets` | `:170` | 照常 |
    | `handleCreationReliance` | `:180` | 照常 |
    | 该逻辑记录的 create 事件 | `preprocessSameRowData` `:436-444`（须改为确认插入之后） | 确认插入后发出 |
    | 行内 combined / merged-link 的预处理 create 事件 | `:516-580` | 仅当对应行实际插入 |
    | `FilteredEntityManager.handleRecordCreation` 及行内 `enqueuePostWriteCreationCheck` | `:195`、`:523-580` | 确认插入后走既有路径 |
11. **身份标志解析到物理基记录。** 过滤名创建已把 `recordName` 解析为 `resolvedBaseRecordName`（`NewRecordData.ts:72-74`）。`SQLBuilder.buildInsertSQL` / `createRecord` 按基记录判断是否附加集合语义，不得只认声明名。
12. **列级 NOT NULL 只服务 identity 列。** `ColumnData.notNull` 在 HEAD 上声明了但无人赋值，`createTableSQL` 也忽略它（`Setup.ts:16-24`、`:1372-1386`）。补 DDL 出口时不得让其它列发出 `NOT NULL`，以免改变 NonNullConstraint 合同。

#### 3.3.1 观察路径的实施合同（d2 写入，不改变上表）

当前 `createRecord` 的顺序是依赖创建 / 排他 unlink → `insertSameRowData`（其 `preprocessSameRowData` 在 INSERT 前 push create 事件）→ `handleCreationReliance` → `FilteredEntityManager.handleRecordCreation`。只改 INSERT 文本、不改这条顺序，集合语义不成立。实施必须同时满足：

| # | 合同 |
|---|------|
| I1 | 观察的返回值是同事务内按身份键 SELECT 的**已存储行**（既有 `id` 与既有载荷字段）。禁止把本次丢弃载荷 `Object.assign` 到胜者 `id` 上；禁止对空 RETURNING 的 `undefined` 做 `Object.assign`。 |
| I2 | 观察决策发生在 `createRecordDependency`、`unlinkOldOwnersOfExclusiveTargets`、`handleCreationReliance`、`FilteredEntityManager.handleRecordCreation` 之前。已观察则：不执行嵌套新建、不解除他人排他关系、不发该逻辑记录的 create 事件、也不发该行的 filtered / merged 视图 create 事件。成功插入路径仍须创建嵌套行（M-01 正对照）。 |
| I3 | `SQLBuilder.buildInsertSQL` 仅在**逻辑创建**且物理基记录（`resolvedBaseRecordName`）具有 identity 时附加 `ON CONFLICT ("物理列", ...) DO NOTHING`。arbiter 是哈希后的身份物理列名（与 P1 日志中 `p1t_ns_1pgs7eq` 同族）；禁止无目标的 `ON CONFLICT DO NOTHING`。过滤名创建已解析到基表（`NewRecordData.ts:72-74`），身份标志必须挂在物理基记录上。 |
| I4 | `ColumnData.notNull` 赋值与 `createTableSQL` 发出 `NOT NULL` 只服务 identity 列，不改变 NonNullConstraint 合同。 |

### 3.4 结果代数（全部落在既有官方通道）

官方配方：登记/消费的调用方在 payload 中携带自己的标识（nonce / requestId），Transform 回调把它写进行（如 `holder`）。**nonce 必须调用方唯一**；两个调用方若使用相同 `holder`，查询侧会把占用误判为成功。成功登记的主信号仍是「本 dispatch 的 `effects` 含该实体 create 事件」。`DispatchResponse.effects` 已按 dispatch 用 `AsyncLocalStorage` 隔离（`Controller.ts:1579-1580`，`src/runtime/asyncEffectsContext.ts`）；同 Controller 连接池并发不会把 effects 串台。

行的关键事实全部**单调**：`holder`、`payload`、`expiresAt`、`createdAt` 写后不变，消费状态只从 unused 走向 used。因此「dispatch 提交后查询该行」给出的答案对任何读者、任何副本、任何时刻稳定。结果判定真值表（官方文档将逐字交付）：

| 结果 | 本次 dispatch 的 `effects` | 提交后按键查询该行 | 说明 |
|------|--------------------------|--------------------|------|
| 成功登记 | 含该实体 `create` 事件（`record.holder === 我的 nonce`） | `holder === 我的 nonce` | 主信号是 effects 中的 create；查询为辅 |
| 已被占用 | 无该实体 `create` 事件，dispatch 无 error | 行存在且 `holder !== 我的 nonce`，载荷/持有者可见 | 尝试事件（`_Interaction_`）已提交留痕（对比 HEAD 现状 P1：整体回滚零留痕） |
| 取出载荷 | 含 `status` 的 `update` 事件 | `status === 'used'`（且若声明了 `consumedBy`：为我的 nonce） | 载荷从行读取，不变量保证读取稳定 |
| 已使用 | 无 `update` 事件，无 error | `status === 'used'` 且非我 | P2/P3.3 已验证该形态 |
| 已过期 | 无 `update` 事件，无 error | 行仍在、`status === 'unused'` 且 `expiresAt <= now` | `now` 为查询方进程时钟，比较对象是存储值 |
| 核销时无行 | 无该实体 `update` 事件，无 error | 按键无行 | 尚未登记，或 retention 已回收；与「已过期」（行仍在）可区分。M-03 的 consume-before-register |

不新增第三条响应通道；不发合成事件（合成 create 事件会污染增量计数等下游计算）。「败者无事件」不作孤立信号使用——官方配方的分支判定是「效果事件 或 查询」，查询侧永远可用且稳定。

**两套时间不得混用。**`expiresAt` 是核销时对仍存在的行做的判断；`Entity.retention` 是物理删除。回收之后按键查询无行，不再能观察「已过期」，此时同键允许再次登记（§3.5）。官方配方写明：retention 窗口不应短于业务过期，但这不是新机制。

消费侧沿用 HEAD 能力：`status` 属性 StateMachine（unused→used），`computeTarget` 异步按身份键查行、以 `expiresAt` 过滤（不可变字段上的无锁读是竞态安全的），转移本体由既有行锁序列化（P3.3）。若应用需要 `consumedBy`，官方配方给出同 trigger 的第二个属性 StateMachine（同一事务内两个转移由同一事件驱动，一致性由事务保证）；这是配方而非新机制。

### 3.5 有界存活与重登记

占有实体直接声明 `retention`（`ttl` 或 `cap`，既有语义不动）；`maintainEntityRetention` 官方维护步回收，删除发正常 delete 事件（`entityRetention.spec.ts:441` 既有保证）。回收走 `storage.delete` → 物理 `DELETE FROM`（`SQLBuilder.ts:695`、`DeletionExecutor.clearOrDeletePhysicalRow`），唯一索引随之空出。**文档化契约：回收即释放**——行删除后同一身份键允许再次登记（集合语义下自然成立），需要「一次性且永不复用」的应用应把 TTL 设为不回收或用 cap 保底并自行留存审计副本。该契约进 M-04 测试。官方配方的占有实体不声明 `_isDeleted_`（`Entity.create` 已禁止 retention 与该属性共存，`Entity.ts:172-174`）。

### 3.6 声明面读者枚举与一致性（AGENTS.md 修 bug 清单第 1、2 条前置执行）

`identity` 的全部读者与各自义务：

| 读者 | 义务 |
|------|------|
| 声明期归一化（`normalizeEntityIdentity`，core） | §3.2.1 D1–D7，唯一检查点；与用户 UniqueConstraint 的同属性集互斥 |
| `Entity.static.public` / `stringifyInstance` | 增加 `identity` 字段，否则 stringify 丢失（`src/core/utils.ts:54-61` 只序列化 `public` 键） |
| `Entity.clone` | 与 `retention` 同位拷贝 identity（`Entity.ts:436-457` 今天只拷贝 retention/constraints） |
| `DBSetup`（storage） | 身份列 `notNull` + `createTableSQL` 发出列级 NOT NULL；专用唯一索引走 `createUniqueIndexSQL`；S1 合表放置守卫；S2 MySQL fail-fast |
| `CreationExecutor.createRecord` | §3.3 / §3.3.1 逻辑创建合同：条件插入、事件只在确认插入后发出、观察时读回既有行并跳过嵌套载荷与视图 create |
| `CreationExecutor.insertSameRowData`（flash-out/relocate） | **不加**集合语义 ON CONFLICT |
| `SQLBuilder.buildInsertSQL` | 仅在逻辑创建且物理基记录具有 identity 时附加 `ON CONFLICT (身份物理列) DO NOTHING`；默认 INSERT 保持原样 |
| `FilteredEntityManager.handleRecordCreation` | 观察路径不发该行的 filtered / merged 视图 create；仅确认插入后走既有成员资格结算 |
| `UpdateExecutor` | 身份属性不可变拒绝 |
| `database.insert` 调用方 | 处理空 RETURNING（`undefined`），禁止对 undefined 做 `Object.assign` |
| 迁移签名（`createMigrationManifest` 的 `records[]`） | Entity.identity 以 `applicationIdentity` 进入实体签名（与 `retention` 同位参与 modelHash）。**不能**占用 `records[].identity`：该键已是 `MigrationIdentity`（`kind`/`namePath`/`uuid`）。k=1 实施时若写成 `identity:` 会覆盖迁移身份，`assertUniqueIdentities` 以 `namePath === undefined` 报歧义。改声明 → modelHash 变化；对既有实体新增 identity 的迁移 = 新增唯一索引的既有 additive DDL + 列 NOT NULL 校验；存量重复键或 NULL 身份列 → 迁移期 fail-fast（blocked shape） |
| 事件管线（runtime） | 观察解析不发 create 事件；胜者事件携带完整行（既有行为） |
| `mapConstraintError` | 不把身份索引当 UniqueConstraint 解释；UniqueConstraint 冲突仍映射为 `ConstraintViolationError` |
| 教义（usage/generator） | 官方配方（§3.4 真值表）、TTL 重登记契约、两套时间口径、nonce 唯一、「应用 `CREATE TABLE` 做占有后端」反模式明文废止 |
| 禁忌 fuzz（tests） | `declarationTabooFuzz` 增加 identity 守卫细胞（D1–D6 各一格 + 合法孪生；S1/S2 为 setup 期细胞） |

### 3.7 方案质量陈述（Task 要求 2 的硬要求）

- **是哪个一般概念的特例**：本方案即一般概念本身——「实体的声明式应用身份（自然键）与带键集合语义」。应用键占有是它的第一个消费场景。
- **占有之外的受益场景**（一般性论证）：(a) 至少一次投递的外部事件/webhook 去重摄入——重试重放在带键集合上天然幂等，今天只能靠唯一约束故障回滚整个 dispatch；(b) 迁移/重放对事件派生集合的重建从「双行或故障」变为「按本次重建顺序的集合插入」（见 §3.3 第 8 条，不是保留历史竞态胜者）；(c) 种子/参照数据的可重入初始化。相邻在途任务 `docs/dual-state-sources/` 的「按身份键合并两套行」同样绕此概念（事实背景，非本设计依据）。
- **新增组合禁例数**：声明期 D1–D6（D4 与 retention/constraints 同族；D6 为与 UniqueConstraint 的互斥）；setup 期 S1（合表）、S2（MySQL）。对比首轮交付的约 30 行两张全体性禁例表。
- **同一不变量的执行点数**：「身份全定」声明期 D1–D3 + 运行期 CreationExecutor + DDL 列 NOT NULL；「至多一行」1 个（专用唯一索引）；「集合语义」1 个（`createRecord`）；「不可变」1 个（UpdateExecutor）。无「有时抛错、有时 DO NOTHING」的跨层重复检查。
- **同一声明是否按写入路径语义分裂**：否。可执行合同：

  | 声明 | 所有写入路径上的语义 |
  |------|---------------------|
  | UniqueConstraint | 永远冲突即 `ConstraintViolationError`，整次 dispatch 回滚 |
  | Entity.identity | 永远集合语义观察（仅逻辑创建）；不经 UniqueConstraint Klass |

- **调用方结果是否落在数据模型**：是——行字段 + 标准 mutation events + 查询约定；零新增响应通道（§3.4）。

### 3.8 被否决的备选（每项一句话理由，证据见 §1）

- 教义化 Custom 惯用法：§1.3 四条。
- 复活 `onConflict: 'keep-existing'`：约束级行为标志按路径分裂语义，撤销理由本轮独立复核成立（§1.4；essence-analysis §3.1-3.4）。
- 把 identity 编译进 UniqueConstraint / NonNullConstraint 管线：同一分裂以「复用既有管线」的形式再现；SQLite 上 NonNullConstraint 使 M-01 在 setup 失败（Adj-R1）。
- 平行写 API（claim/consume）：Task 硬禁；且首轮已裁决拆除。
- 全局字典承载：键空间声明期固定 + 后写者覆盖语义（§1.2 第 3 行）。
- 仅靠 Condition.locks：行不存在时无锁可加（§1.2 第 6 行）。
- `StateTransfer.expiresAtProperty` / guard：消费过滤在 HEAD 已表达（P2），无需为本任务扩状态机面。
- 合表上对身份列使用「NULL 共存的部分唯一索引」同时再加表级 / CHECK NOT NULL：两条件互斥；完成态是 S1 fail-fast，不做合表成功细胞。

### 3.9 实施合同（不改变 §3.1–3.8 方案；M-01 必须可测）

下列条款已经蕴含在 §3.3 / §3.6 中。d2 对照 HEAD 核验后把它们写成可测断言，避免实现把合同削弱成「INSERT 文本改了、结果代数没改」。

1. **观察路径的返回值是库中既有行。** `insertSameRowData` 今日在 INSERT 后 `Object.assign(result, getData())`（`CreationExecutor.ts:627`）。观察时若把本次载荷赋到 SELECT 出的既有 `id` 上，调用方会拿到胜者 `id` 与败者 `holder`/`payload` 的混合物。M-01 必须断言返回的载荷字段属于已存储行。
2. **观察不得执行 `createRecordDependency` / 排他 unlink。** 今日 `createRecord` 在 INSERT 之前就会做这两步（`:163-170`）。观察决策必须发生在它们之前；已观察则直接返回既有引用。成功路径仍须写入 merged FK 与嵌套新建（两阶段 UPDATE 或 SAVEPOINT 均可）。M-01 除「观察不执行嵌套载荷」外，必须有「首次插入仍创建嵌套行」对照。
3. **ON CONFLICT 的 arbiter 是身份物理列名**（哈希后的 field，与 Transform `(sourceRecordId, transformIndex)` 第二索引并存）。无目标的 `ON CONFLICT DO NOTHING` 会吞掉 Transform 源索引与逻辑 `id` 索引上的故障。
4. **列级 NOT NULL 只服务 identity 列。** `ColumnData.notNull` 在 HEAD 上无人赋值，`createTableSQL` 也忽略它（`:1372-1386`）。补 DDL 出口时不得让其它列发出 `NOT NULL`，以免改变 NonNullConstraint 合同。
5. **身份标志挂在物理基记录上。** `NewRecordData` 已把 `recordName` 解析为 `resolvedBaseRecordName`（`NewRecordData.ts:72-74`）。`SQLBuilder.buildInsertSQL` / `createRecord` 按该物理记录判断是否附加集合语义即可；过滤名 `storage.create` 不得单独分裂集合语义。
6. **taboo 合法孪生与 S1。** `constructController` 会纳入 `genSchema` 的环绕实体与关系。身份实体的合法孪生若被环绕 schema 的 1:1 `isTargetReliance` 合表，会在 setup 因 S1 失败，误伤「合法孪生应能 setup」格。细胞构造须隔离该组合。
7. **S2 不依赖真实 MySQL 服务。** 与既有 mysql-like dialect 夹具同构（`tests/runtime/dataConstraints.spec.ts:400-411`、`tests/runtime/entityIdentity.spec.ts:301`）：在 `DBSetup` / setup 期读 `schemaDialect.name === 'mysql'` 即 fail-fast。不要求 `INTERAQT_MYSQL_DATABASE`。

## 4. 里程碑

预算：M = 4，设计完成时 N = 5 × 4 = 20。

### M-01 引擎内核与声明面（最大不确定性优先）

- **状态**：已完成
- **结果**：`Entity.identity` 可声明并经 setup 物化（列级 NOT NULL + 专用唯一索引，不经 UniqueConstraint / NonNullConstraint）；带 identity 实体的逻辑创建在 `storage.create` 直写与 dispatch 计算两条路径上都是集合语义（键存在→解析为既有行、无 create 事件、返回既有 `id` **且载荷属于已存储行**）；身份属性更新被拒绝；§3.2.1 D1–D6 与 S1/S2 各有失败用例与合法孪生；`declarationTabooFuzz` 增加 identity 细胞；`Entity.clone` 保留 identity；§3.9 各条可测。相关记录 1:1 反向 filtered 成员资格在 identity 插入路径上发出 create（id-ref 与 nested 新建）。当身份宿主持有 merged link 同行时，成功插入必须写出完整关系行（FK + link id + `&` 列）：`findRelationByName` 可查、1:1 抢夺只保留一个 owner、filtered relation 视图有 create；观察路径仍不写关系。
- **覆盖 Task 要求**：2（路径成立的内核）、5、6。
- **前置**：无。
- reopen-count: 2；reopen-domains: { filtered-membership-events: 1, identity-merged-link-record: 1 }
- **验收命令**（新增测试，实施期建立）：
  - `npx vitest run tests/runtime/applicationIdentity.spec.ts`（声明守卫 + PGLite/SQLite 集合语义 + 观察返回既有行载荷而非本次丢弃载荷 + 不可变 + 嵌套创建：观察不执行嵌套载荷、首次插入仍创建嵌套行 + 同事务重复键 + 两实体相同 `identity.name` + 合表 fail-fast + S2 mysql-like dialect 夹具 fail-fast；对照：仅 UniqueConstraint 的重复创建仍为 `ConstraintViolationError` 且整次 dispatch 回滚；对照：SQLite 上独立 NonNullConstraint 仍 setup 失败；身份宿主 merged link：`findRelationByName` 有行、1:1 抢夺只留一个 owner、filtered relation 可查）
  - `FUZZ_TABOO_SEEDS=... npx vitest run tests/runtime/declarationTabooFuzz.spec.ts`
  - `FUZZ_SEED_START=100 FUZZ_SEED_COUNT=100 FUZZ_OPS=40 npx vitest run tests/storage/writePathStructuralFuzz.spec.ts`（写路径回归门）
- **最新证据**（k=6 实现；additional task 4 审计关闭，2026-08-17）：第二步补丁按物理列拆分：第一步只写宿主 value 列；第二步写 `insertSameRowData` 会写而第一步未写的同行（merged FK、link id、`&` 列），不再用宿主 `attributes[name].isRecord` 过滤。审计复验 `npx vitest run tests/runtime/applicationIdentity.spec.ts` → **71 passed**（k=6 原 62；本轮加强 n:1 `&`、双 merged link、n:n、嵌套 identity 子记录、1:1 抢夺 delete 事件、过滤名+merged 1:1、SQLite n:1、宿主 create 默认值与关系端点）。`declarationTabooFuzz` 81；writePathStructuralFuzz 108；`postgresqlApplicationIdentity.spec.ts` **7**（真 PG，含 merged-link `&`/steal）；基线 dataConstraints 14 / dispatchIdempotency 13 / entityRetention 15；`npm run check` / `npm run build` 通过。缺陷注入：将第二步过滤器改回宿主 `isRecord` 后 steal / `&` / filtered relation / n:1 `&` / 双 merged link 变红；已完全还原。

### M-02 并发登记验收（真实 PostgreSQL 双拓扑）

- **状态**：已完成
- **结果**：Transform + identity 实体经 `Controller.dispatch` 并发登记：(a) 两条独立连接、两个独立 Controller；(b) 同一 Controller 连接池并发。恰好一行、胜者 effects 含 create 事件且 `holder` 为胜者 nonce、败者 dispatch 无 error 且其交互事件已提交留痕、查询约定判定「已被占用」；对照组（缺陷注入：关闭条件插入，退回裸 INSERT）能被测试判别。
- **覆盖 Task 要求**：3(并发登记)、6。
- **前置**：M-01。
- reopen-count: 0；reopen-domains: {}
- **验收命令**：`INTERAQT_POSTGRES_DATABASE=... npx vitest run tests/runtime/postgresqlApplicationIdentity.spec.ts`
- **最新证据**（k=2 实现；additional task 4 审计关闭，2026-08-17）：
  - 审计复验（加强后）：`INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npx vitest run tests/runtime/postgresqlApplicationIdentity.spec.ts` → **3 passed**（拓扑 a/b 各 10 轮强制重叠 + 裸 INSERT 对照）
  - 无 env 时同文件 **3 skipped**
  - 缺陷注入：去掉 `ON CONFLICT` 后拓扑 a/b 均红（败者 `ConstraintViolationError` `rawCode: '23505'`，`constraintName` 为空）；已完全还原
  - M-01 连带：`applicationIdentity.spec.ts` 49 passed；基线 dataConstraints 14 / dispatchIdempotency 13 / entityRetention 15；`npm run check` 通过
  - 生产写路径本轮未改；集合语义沿用 M-01 的 `createIdentityRecord` / 指定 arbiter `ON CONFLICT`

### M-03 一次性消费与结果代数（官方配方）

- **状态**：已完成
- **结果**：消费经 status StateMachine + computeTarget 身份键查找：真实 PG 双拓扑下恰好一次转移；§3.4 真值表全部可编程区分（成功登记 / 已被占用 / 取出载荷 / 已使用 / 已过期 / 核销时无行）；`consumedBy` 配方可选验证。
- **覆盖 Task 要求**：2（结果区分通道文档化）、3(一次性消费)。
- **前置**：M-02。
- reopen-count: 0；reopen-domains: {}
- **验收命令**：并入 `postgresqlApplicationIdentity.spec.ts` 消费组 + PGLite 功能组（`applicationIdentity.spec.ts`）
- **最新证据**（k=3 实现；additional task 4 审计关闭，2026-08-17）：
  - 审计复验（加强后）：`npx vitest run tests/runtime/applicationIdentity.spec.ts` → **50 passed**（同 nonce 再核销不二次转移；胜者 update 含 `status`/`consumedBy`）
  - `INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt npx vitest run tests/runtime/postgresqlApplicationIdentity.spec.ts` → **6 passed**（顺序代数 + 消费拓扑 a/b 各 10 轮，强制 `lockRecord` 重叠，胜者按已存储 `consumedBy` 归属 effects）
  - 无 env 时同文件 **6 skipped**
  - 基线：`dataConstraints` 14 / `dispatchIdempotency` 13 / `entityRetention` 15 passed；`npm run check` 通过
  - 缺陷注入：将 `lockRecord` 的 `FOR UPDATE` 改为 SQL 注释后拓扑 a/b 均红（败者 `unexpected`，双方都有 update）；已完全还原
  - 生产写路径本轮未改；消费沿用 HEAD 属性 StateMachine（行锁 + computeTarget 身份键查找 + 不可变 `expiresAt` 过滤）接到 identity 实体与 Transform 登记路径

### M-04 框架可见、保留、迁移与教义

- **状态**：已完成
- **结果**：identity 进 modelHash（`records[].applicationIdentity`；改声明→manifest mismatch 测试）；对既有实体新增 identity 的迁移路径（干净数据通过、重复键或 NULL 身份列 fail-fast）；retention.ttl 回收占有行、未声明 retention 的实体不受影响、回收后同键重登记成功（TTL 契约测试）；MySQL fail-fast；usage/generator/CHANGELOG 更新，官方文档不含「应用 CREATE TABLE 占有后端」推荐（负向检查）；文档写明 Transform 全量重建按本次插入顺序集合化、以及 `expiresAt` 与 retention 两套时间；`npm run check`、`npm run build` 通过。
- **覆盖 Task 要求**：3(框架可见/保留/TTL 重登记)、6、7。
- **前置**：M-01（迁移/可见性不依赖 M-02/03 的并发结论，但按编号顺序实施）。
- reopen-count: 0；reopen-domains: {}
- **验收命令**：`npx vitest run tests/runtime/applicationIdentityMigration.spec.ts tests/runtime/entityRetention.spec.ts tests/runtime/migrationGenerativeFuzz.spec.ts`（后者默认池）＋ `npm run check`
- **最新证据**（k=4 实现；additional task 4 审计关闭，2026-08-17）：
  - 审计复验（加强后）：`npx vitest run tests/runtime/applicationIdentityMigration.spec.ts` → **9 passed**（原 8；新增 Transform 占用实体加 identity 不重建；`identity.properties` 改 hash；失败迁移后无 `interaqt_ident_*`；教义钉住两套时间 / 全量重建 / CHANGELOG）
  - `npx vitest run tests/runtime/entityRetention.spec.ts` → **15 passed**
  - `npx vitest run tests/runtime/migrationGenerativeFuzz.spec.ts` → **7 passed**（默认池 seed 1–6 + 确定性回归）
  - 最终核验：`applicationIdentity.spec.ts` 50；`postgresqlApplicationIdentity.spec.ts` 6（真 PG）；`declarationTabooFuzz` 78；writePathStructuralFuzz 108；UniqueConstraint/NonNull 迁移 3；基线 dataConstraints 14 / dispatchIdempotency 13
  - `npm run check`、`npm run build` 通过
  - 缺陷注入：去掉 notNull verification 后 NULL 测试变红（迁移被错误放行）；删「Two clocks」后教义例变红；把未改结构的 Transform 标成 `changed` 后占用实体加 identity 变红；均已完全还原
  - 实施要点：身份唯一/非空校验进入 `verificationDDL`（不经 UniqueConstraint Klass）；`buildMigrationDiff` 将 `applicationIdentity` 变更列为 record changed；usage/generator/CHANGELOG 交付官方配方与 `CREATE TABLE` 反模式

## 5. 风险与验证安排

**设计期已验证**（证据在 §1.2/§6.3）：冲突映射与回滚形态（P1/P3）、SM 消费串行化（P2/P3.3）、Custom 备选的收敛性与其不可承诺性（P4 + 代码分析）、约束/保留/迁移签名面（报告 A–D 交叉核对源码）、NonNullConstraint 不可移植与空 RETURNING（Adj-R1）。

**实现期必须验证**（设计不阻塞，但里程碑验收必须覆盖）：

- R-1 `ON CONFLICT (身份物理列) DO NOTHING` 在三方言（PG/PGLite/SQLite）+ 组合场景（嵌套创建观察、同事务重复、事务内先删后建）的行为一致性——M-01 方言矩阵用例；方言修复必须用匹配方言探针。
- R-2 合表存储：完成态是身份实体参与 1:1 combined 放置时 setup fail-fast（S1），**不是**「NULL 共存作为成功细胞」。M-01 显式失败用例。
- R-3 败者路径的下游计算正确性（无 create 事件 ⇒ 计数/派生不动）——M-02 断言 + 结构 fuzz 回归门。
- R-4 并发验收的判别力：缺陷注入（移除条件插入、退回裸 INSERT）必须使 M-02 变红——M-02 验收内建。
- R-5 迁移 blocked shape（存量重复键或 NULL 身份列）与 kill-resume——M-04 + `migrationGenerativeFuzz` 默认池。
- R-6 真并发窗口的时钟口径文档化（expiresAt 判定用查询方进程时钟；与 retention 物理删除分开）——M-03/M-04 文档验收。
- R-7 Transform 全量重建按本次插入顺序集合化，不保留历史竞态胜者——M-04 文档；占用 Transform 回调变更倾向 `unchanged`。

## 6. 基线

### 6.1 Git 与工作树

- HEAD：`c358cf9`（`docs(changelog): expand v4.9.0 notes and clear Unreleased`，v4.9.0）。
- 工作树：干净，仅未跟踪的任务/提示/分析文档（`docs/application-key-occupancy/`、`docs/dual-state-sources/`、`prompt/application-key-occupancy.md`、`prompt/dual-state-sources.md`、`agentspace/output/application-key-occupancy-essence-analysis.md`）与本轮探针目录。首轮实施撤销已完成，HEAD 无残留。

### 6.2 既有测试基线（2026-08-17 本机实测）

- `npx vitest run tests/runtime/dataConstraints.spec.ts tests/runtime/dispatchIdempotency.spec.ts tests/runtime/entityRetention.spec.ts` → 3 文件 42 用例全绿（14/13/15）。
- `npm run check` → 通过。
- 本机真实 PostgreSQL 17.6 可用（`127.0.0.1:5432`，用户 `interaqt`）；探针以 `INTERAQT_POSTGRES_DATABASE=interaqt_test` 派生独占库 `interaqt_test_akop` / `interaqt_test_akop2` 运行。

### 6.3 设计期探针（可复现命令与结果）

探针位于 `agentspace/output/application-key-occupancy-probes/`（独立 vitest 配置，不进常规套件；实施期由 M-02/M-03 的正式测试取代后可归档删除）。

```bash
# P1/P2（PGLite）
npx vitest run --config agentspace/output/application-key-occupancy-probes/vitest.probes.config.ts \
  agentspace/output/application-key-occupancy-probes/p1-unique-conflict-result.spec.ts \
  agentspace/output/application-key-occupancy-probes/p2-consume-statemachine-head.spec.ts
# P3/P4（真实 PostgreSQL）
INTERAQT_POSTGRES_DATABASE=interaqt_test PGHOST=127.0.0.1 PGUSER=interaqt PGPASSWORD=interaqt \
  npx vitest run --config agentspace/output/application-key-occupancy-probes/vitest.probes.config.ts \
  agentspace/output/application-key-occupancy-probes/p3-postgres-two-connection.spec.ts \
  agentspace/output/application-key-occupancy-probes/p4-custom-create-if-absent.spec.ts
# Adj-R1 / review-at1（裁决与评审对 R-1 / ON CONFLICT 合同的独立复验）
npx vitest run --config agentspace/output/application-key-occupancy-probes/vitest.probes.config.ts \
  agentspace/output/application-key-occupancy-probes/adjudication-r1.spec.ts \
  agentspace/output/application-key-occupancy-probes/review-at1-on-conflict.spec.ts
```

- **P1**（2 例通过，d0 / d1 / d2 均复跑）：撞键 dispatch → `findConstraintViolationError(result.error)` 命中（`context.code='KEY_TAKEN'`）、`effects=[]`、败者交互事件回滚（`_Interaction_` 中该 interaction 仅 1 行）、行保持胜者载荷；`storage.find('_DispatchIdempotency_')` 抛错。
- **P2**（1 例通过）：consume-before-register / 成功消费（update 事件+行 used）/ 二次消费（无事件+行 used）/ 过期（无事件+行 unused 且 expiresAt≤now）四分支全部稳定。
- **P3**（1 例通过，d1 / d2 复跑）：双 Controller 双连接并发同键登记 → 恰好一行、败者 `ConstraintViolationError`（`rawCode:'23505'` 映射后仍类型化）、败者交互事件回滚；同 Controller 连接池并发同形态；双连接并发消费 update 事件 A=1/B=0。
- **P4**（1 例通过，d1 / d2 复跑）：Custom+lockRows 惯用法——顺序两次：`success-with-insert` / `success-no-insert`；双连接竞态 10/10 轮收敛为同一分布，恰好一行、零故障（收敛机制与不可承诺性分析见 §1.3）。
- **Adj-R1**（4 例通过，d1 与 d2 裁决轮均复跑）：SQLite 上仅 `NonNullConstraint` 的 `setup(true)` 失败（`/non-null constraints are not supported by sqlite/i`），PGLite 成功；`createTableSQL` 在 `ColumnData.notNull = true` 时仍不发出 `NOT NULL`；SQLite `INSERT ... ON CONFLICT ("k") DO NOTHING` 经 `database.insert` 在冲突时返回 `undefined`，既有行载荷不变；SQLite 上仅 UniqueConstraint 的重复 `storage.create` 仍抛 `ConstraintViolationError`（控制组）。
- **review-at1**（3 例通过，评审轮新增、d2 独立复跑）：`CREATE UNIQUE INDEX`（非 UniqueConstraint Klass）作 arbiter，另有 `(src, idx)` 第二唯一索引。SQLite / PGLite 顺序冲突空 RETURNING、既有载荷不变；真实 PG 双连接 READ COMMITTED 10/10 轮恰好一行、恰好一次有 RETURNING、零 23505；先插入未提交时对端等待，提交后对端 `insert()` 返回 `undefined`。
