# Data Migration 方案深度 Review

> Review 对象:`src/runtime/migration.ts`(约 3200 行)、`src/runtime/Controller.ts` 中 `setup/migrate/generateMigrationDiff/createMigrationBaseline`、`src/runtime/MonoSystem.ts` 中 schema 计划与迁移簿记,以及 `agent/skill/interaqt-migration.md` 描述的 Phase 1.5 两步审阅工作流。
>
> Review 方法:静态通读全部迁移代码 + 针对每个疑点编写可运行的 probe 测试在 PGLite 上实证(probe 均已复现后删除,复现代码内嵌在本文档中)。作为对照基线,官方 `tests/runtime/migration.spec.ts` 76 个用例全部通过。

## 结论摘要

方案整体架构(manifest 快照 → 结构化 diff → 人工决策 → 带安全门禁的 compute 路线重算 → 分阶段可恢复执行)是健全的,安全门禁和测试覆盖也相当认真。但存在 **2 个已实证的致命正确性错误**(会静默产生永久性脏数据)、**1 个 MySQL 下的数据损坏/注入隐患**,以及若干显著值得改进的设计点。

| 编号 | 级别 | 问题 | 实证 |
|---|---|---|---|
| F1 | 致命 | 重算依赖图节点命名不一致:relation 输出和 filtered entity 的下游计算被漏算,迁移后静默产生**永久性**脏数据 | ✅ 复现 |
| F2 | 致命 | `StateNode.computeValue` / `StateTransfer.computeTarget` 变更完全不可见,连 `modelHash` 都不变,`setup(false)` 直接放行 | ✅ 复现 |
| F3 | 致命(仅 MySQL) | 迁移簿记 SQL 全部字符串拼接,MySQL 反斜杠转义语义下 manifest JSON 会被损坏,且存在注入面 | 静态分析 |
| I1 | 显著 | 每次迁移都强制为**所有**(哪怕完全未变的)StateMachine/async 计算提供 handler 决策和运行时 handler,诱导用户写危险的敷衍 handler | ✅ 复现 |
| I2 | 显著 | 新增普通属性的 `defaultValue` 不回填存量行;叠加 NonNullConstraint 时迁移无路可走 | ✅ 复现 |
| I3 | 显著 | 重算/审阅路径全表载入内存、diff 中罗列全量 id,规模化不可行 | 静态分析 |
| I4 | 显著 | 迁移锁无租约,进程崩溃后永久卡死,无官方解锁途径 | 静态分析 |
| I5-I8 | 一般 | 若干代码坏味道与小缺口 | 静态分析 |

---

## 致命错误

### F1. 重算依赖图节点命名不一致 → 下游计算漏算,静默产生永久脏数据

这是本次 review 发现的最严重问题,直接违背方案的核心承诺("只重算新增和变更的,同时保证下游联动正确")。

`buildAffectedRebuildPlan` 用字符串节点构建依赖图。计算的**输出节点**用 `dataContextPath` 命名:

```593:598:src/runtime/migration.ts
export function dataContextPath(dataContext: DataContext): string {
    if (dataContext.type === "property") {
        return `property:${dataContext.host.name}.${dataContext.id.name}`;
    }
    return `${dataContext.type}:${dataContext.id.name}`;
}
```

即 relation 输出节点是 `relation:X`。但**依赖节点**对 `records` 类型的 dataDep 一律标成 `entity:` 前缀,且不解析 filtered entity 到 base:

```2079:2095:src/runtime/migration.ts
function depNodes(dep: { type: string; source?: string; attributeQuery?: unknown }, computation: ComputationManifest, manifest: MigrationManifest) {
    if (dep.type === "global" && dep.source) return [`global:${dep.source}`];
    if (dep.type === "records" && dep.source) return [`entity:${dep.source}`];
    ...
```

由此产生(至少)两类断链,均已实证:

**变体 A:聚合 Transform 派生的 relation。** Relation 由 Transform 计算得出,一个全局 `Summation({ record: 该relation })` 依赖它。修改 Transform 回调后走完整审批迁移:relation 的 weight 行被正确重算为 `[20, 40]`,但 rebuildPlan 只含 `["relation:ProbeRelOwn"]`,Summation 没有进入 affected 集合——因为它注册在 `entity:ProbeRelOwn` 节点下,而 Transform 的输出事件挂在 `relation:ProbeRelOwn`。迁移后字典值仍是旧值 `30`(应为 `60`)。

**变体 B:聚合已存在的 filtered entity。** `Probe7BigDiscount` 是 Transform 输出实体 `Probe7Discount` 的 filtered entity,`Summation({ record: Probe7BigDiscount })` 依赖它。修改 Transform 后迁移:Discount 行正确重算为 `[20, 40]`,但 Summation 注册在 `entity:Probe7BigDiscount` 下,与输出节点 `entity:Probe7Discount` 不匹配,迁移后字典值仍是 `20`(应为 `60`)。`getNewFilteredDataContexts` 只处理**新增**的 filtered entity,已存在的 filtered entity 完全没有解析到 base 的逻辑。

**为什么是"永久性"脏数据:** 这些下游计算都是增量计算(`incrementalCompute` 在旧值基础上加减)。迁移把它们的输入数据改了却没重算它们,之后每一次正常业务事件都在错误基数上做增量——错误不会自愈,只会一直延续。而且全过程没有任何报错、没有任何 review item,用户完全无感。

值得注意的是,`MigrationScheduler.queueEvents` 在执行期其实用的是运行时真正的 `ComputationSourceMapManager`(它对 relation/filtered entity 的事件路由是正确的),但它把不在 `affectedIds`(即由错误的字符串图算出的集合)里的目标直接丢弃:

```3040:3051:src/runtime/migration.ts
    private queueEvents(events: RecordMutationEvent[], sourceComputationId: string) {
        for (const event of events) {
            const sourceMaps = this.sourceMapManager.findSourceMapsForMutation(event);
            for (const source of sourceMaps) {
                const targetId = computationManifestId(source.computation);
                if (targetId === sourceComputationId || !this.affectedIds.has(targetId)) continue;
```

**修复方向:** 不要在 migration.ts 里维护一套平行的字符串依赖图。affected 集合应当复用运行时的 `ComputationSourceMapManager`/Scheduler 依赖解析(同一事实只有一个来源),或者至少:
1. `depNodes` 按 manifest 判断 `records` dep 的 source 是 entity 还是 relation,输出正确前缀;
2. 对 filtered entity/relation 解析 `resolvedBaseRecordName` 链,把 filtered 名注册为 base 输出节点的别名;
3. `eventDepNodes` 同样处理(它也硬编码 `entity:` 前缀)。

复现代码(变体 A 核心部分):

```typescript
const rel = Relation.create({
  source: User, sourceProperty: 'items', target: Item, targetProperty: 'owner',
  name: 'ProbeRelOwn', type: 'n:n',
  properties: [Property.create({ name: 'weight', type: 'number' })],
  computation: Transform.create({
    record: Item, attributeQuery: ['id', 'price', ['creator', { attributeQuery: ['id'] }]],
    callback: (item) => item.creator ? { source: item.creator, target: item, weight: item.price * factor } : null,
  }),
})
const weightSum = Dictionary.create({
  name: 'probeRelWeightSum', type: 'number',
  computation: Summation.create({ record: rel, attributeQuery: ['weight'] }),
})
// v1: factor=1, 数据 price 10/20 → sum 30
// v2: factor=2, 完整审批后 migrate()
// 实测: relation weight 行 = [20, 40](正确),sum 仍为 30(错误,应为 60),且无任何报错
```

### F2. `StateNode.computeValue` / `StateTransfer.computeTarget` 变更完全不可见

`collectFunctionText` 和 `hasFunctionDeep` 为了避免遍历模型图,把 `StateNode`、`StateTransfer` 与 `Entity/Relation/Property/Dictionary` 一起整体排除:

```750:752:src/runtime/migration.ts
    if (typeof record._type === "string" && ["Entity", "Relation", "Property", "Dictionary", "StateNode", "StateTransfer"].includes(record._type)) {
        return [];
    }
```

排除 Entity/Relation/Property 是合理的(它们的结构在 manifest 其他部分被捕获,其上的 computation 是独立条目)。但 `StateNode.computeValue` 和 `StateTransfer.computeTarget` 是**当前这个 StateMachine 计算自身的语义函数**,除此之外没有任何地方捕获它们。

实证:构造两个仅 `computeValue` 返回值不同的 StateMachine 模型,生成 manifest 对比——`functionSignature` 均为 `undefined`,计算 `signature` 相同,连 **`modelHash` 都完全相同**。这意味着:

- `setup(false)` 的 manifest 校验直接放行,用户改了状态机语义,框架层面零提示;
- 即使走 `generateMigrationDiff`,diff 也报告"无变化",两步审阅机制对 interaqt 中最常用的属性更新手段(文档明确说 StateMachine 是属性更新的 canonical 方式)完全失明。

这与迁移指南中"Function text/hash is review evidence"的承诺直接矛盾。StateMachine 是事件驱动、本就不能重算,历史值不变或许可以接受,但**检测不到、不进入 review** 是另一回事——审阅工作流的价值就在于让人看到变化。

**修复方向:** 对 `StateNode`/`StateTransfer` 不要整体排除,而是只遍历其自有的函数字段(`computeValue`、`computeTarget`),跳过 `trigger` 等可能引回模型图的引用字段。

### F3. 迁移簿记 SQL 字符串拼接:MySQL 下 manifest 损坏 + 注入面

`MonoSystem` 中所有迁移簿记写入(`writeMigrationManifest`、`beginMigration`、`updateMigrationPhase`、`finishMigration`、`markMigrationOperationComplete`)都用字符串插值 + 仅把 `'` 替换为 `''`:

```1322:1332:src/runtime/MonoSystem.ts
        if (dialect === 'mysql') {
            await this.db.scheme(
                `INSERT INTO "__interaqt_migration_manifest" ("key", "value") VALUES ('current', '${value.replace(/'/g, "''")}') ON DUPLICATE KEY UPDATE "value" = VALUES("value")`,
                'write migration manifest'
            )
            return
        }
```

MySQL 驱动只设置了 `SET sql_mode='ANSI_QUOTES'`(`src/drivers/Mysql.ts:73`),**没有** `NO_BACKSLASH_ESCAPES`,因此反斜杠在 MySQL 字符串字面量中仍是转义字符:

- manifest 是 `JSON.stringify` 的产物,任何字符串值里含 `"` 或 `\` 都会产生 `\"` / `\\` 序列(例如 filtered entity 的 `resolvedMatchExpression` 里带引号的匹配值)。MySQL 会把 `\\` 折半、把 `\"` 解释成 `"`,**存进去的 manifest 和写入的不一致**——轻则 `modelHash` 永远对不上导致所有后续迁移被误判 stale,重则 `JSON.parse` 失败。
- `finishMigration` 把任意 error message 拼进 SQL,消息中 `\'` 组合(如 Windows 路径结尾)会破坏字面量边界,构成注入面。虽然内容通常来自框架自身,但迁移是框架最高权限的操作路径,这里必须是防御性的。

PGLite/PostgreSQL(`standard_conforming_strings=on`)与 SQLite 不受影响,所以现有测试(全部基于 PGLite)覆盖不到。

**修复方向:** 簿记 DML 改用参数化 `db.query`(表已存在,不需要走 `scheme`);确实要拼接时使用各方言正确的转义器。或者在 MySQL 驱动追加 `NO_BACKSLASH_ESCAPES`(但这是全局行为变化,需评估对业务数据路径的影响)。

---

## 显著值得改进的地方

### I1. 无条件强制 event-rebuild / async-completion handler,把审阅机制变成危险的仪式

`buildMigrationDiff` 对 nextManifest 中**每一个**带 `eventDeps` 或 `asyncReturn` 的计算无条件生成 handler 决策要求,与该计算是否变化、是否会进入 rebuild plan 无关:

```1691:1704:src/runtime/migration.ts
        if (detected.needsEventRebuildHandler) {
            requiredDecisions.push({
                kind: "event-rebuild-handler",
                dataContext: computation.dataContext,
                reason: "event-based computation needs an external migration rebuild handler",
            });
        }
        if (detected.needsAsyncCompletionHandler) {
            requiredDecisions.push({
                kind: "async-completion-handler",
                ...
```

而 `validateApprovedDiff` 要求每个 required decision 都有对应决策、且 `handlers.eventRebuild[handlerRef]` 必须是真实存在的运行时函数。

实证:模型含一个 StateMachine 属性,新版本只增加一个毫不相干的普通字符串属性。`generateMigrationDiff` 仍然要求为未变的 StateMachine 提供 `event-rebuild-handler` 决策;不提供运行时 handler 时 `migrate()` 直接失败:`Missing migration event rebuild handler 'property:ProbeSmTicket.status'`。

问题不只是繁琐(interaqt 的文档把 StateMachine 定为属性更新的标准手段,真实应用里几十个 StateMachine 意味着每次加个字段都要写几十个 handler 决策 + 几十个运行时函数),更在于**它主动诱导危险行为**:用户会为了过校验写敷衍的 handler(`async () => 'draft'` 之类)。这些 handler 平时不会被调用,可一旦哪次迁移中该计算因上游变化真的进入 rebuild plan,敷衍 handler 就会静默地把全表数据覆盖成错误值。强制的仪式感反而削弱了真正需要审阅时的注意力。

**修复方向:** 生成 diff 时已经有 `provisionalRebuildPlan`(`Controller.buildCurrentMigrationDiff` 里就算了),handler 要求应当只对**确实会 rebuild** 的计算发出——`addMissingRebuildHandlerRequirements` 已经在做基于 rebuild plan 的补充,把 `buildMigrationDiff` 里这两处无条件 push 删掉即可与之收敛。`getRecomputeBlockingChanges` 在执行期本来就会兜底拦截缺 handler 的 rebuild 项。

### I2. 新增普通属性的 `defaultValue` 不回填,叠加非空约束时无路可走

实证:v1 建表并写入一行数据;v2 给实体新增 `Property.create({ name: 'status', defaultValue: () => 'draft' })`,完整审批迁移后,存量行的 `status` 是 `NULL`(读出来 `undefined`),新插入的行才有 `'draft'`。

`createAdditiveSchemaPlan` 生成的 DDL 是裸的 `ADD COLUMN`,没有 DEFAULT 子句,也没有任何回填步骤(migration.ts 中只有 computation 输出会被重算,fact 属性无人处理)。后果:

1. 业务代码读到存量行时拿到 `null`,与"该属性有默认值"的声明语义直接冲突,极易造成线上 NPE 类故障;
2. 如果新属性同时声明了 `NonNullConstraint`,迁移会在 `verifyMigrationSchema` 的非空校验中失败——而框架不提供任何受支持的回填手段,用户只能绕过框架手写 SQL,这违背了方案自身"一切变更走受控迁移"的立意。

**修复方向:** 把"新增带默认值的 fact 属性"识别为一类 review item(如 `backfill-default`),批准后在 recompute 阶段(约束校验前)对存量行执行一次受控回填;或至少对声明了 `defaultValue` 的新列生成 `ADD COLUMN ... DEFAULT` + 一次性 `UPDATE ... WHERE ... IS NULL`。这是"手写转受控"之外最常见的真实迁移场景,目前是空白。

### I3. 全表载入内存 + diff 中罗列全量 id,规模化不可行

计算路线的多个环节把整张表读进内存:

- `MigrationScheduler.runFullRecompute`:`storage.find(hostName, undefined, undefined, ["*"])` 后逐行 JS 计算(migration.ts:3089);
- `getDestructiveDeletionScope` / `recomputeTransformOutput`:同样全表 `["*"]` 载入并在内存里做 diff(migration.ts:2632、2957);
- `readTakeoverScope`:为了得到 count 把全表行读回来数非空(migration.ts:1330-1347);
- entity/relation takeover 与 destructive-scope 的审阅产物要求 diff 文件中**逐条列出所有 id** 并在执行期精确比对——十万行的表意味着十万个 id 写进 JSON 审阅文件,人也不可能真的"审阅"它们。

原始需求文档(`agentspace/prompt/data-migration.md`)明确说"js 的计算速度显著慢于 sql 直接执行"并为此预留了 phase 2 加速口子,但当前实现连**流式/分批**都没有,内存占用与单事务时长都随表大小线性增长(整个 recompute 还包在一个 SERIALIZABLE 事务里)。

**修复方向:** 逐行计算改为分批游标(batch find + keyset 分页);takeover/destructive scope 的"精确 id 集合"在超过阈值时降级为 `count + checksum`(如 id 集合的有序 hash),审阅语义不变而产物体积可控;长事务问题可结合已有的 phase/operation-log 恢复机制做分段提交的显式设计。

### I4. 迁移锁无租约,进程崩溃后永久卡死

`beginMigration` 插入 `__interaqt_migration_lock` 行,只有 `finishMigration` 会删除它。进程若在迁移中途被 kill(OOM、部署平台强杀——这在迁移这种长任务里恰恰最常见),锁行永远留在库里,之后所有 `beginMigration` 都抛 `Migration is already running: <id>`。框架没有提供任何解锁 API,文档也没有给出手工恢复指引;讽刺的是,精心设计的 resume 机制(按 `modelHash + approvedDiffHash` 找可续跑的 failed run)反而因为锁没释放而永远走不到。

**修复方向:** 锁行加 `acquiredAt`/heartbeat 并支持超时抢占;或至少提供 `controller.forceReleaseMigrationLock()` 之类的显式 API,并把恢复步骤写进 `agent/skill/interaqt-migration.md` 的故障章节。

### I5. record 级 physical-path-move 检查里的 `_` 前缀条件是个坏味道

```2230:2238:src/runtime/migration.ts
        if (oldRecord.tableName !== newRecord.tableName && !newRecord.attributes.some(attr => attr.startsWith("_"))) {
            blocking.push({
                kind: "physical-path-move",
                ...
```

只要记录有任何 `_` 开头的属性,record 级表移动检查就被整体跳过。而 `_` 开头属性极其常见——所有 record-bound 计算状态(`Scheduler.getBoundStateName` 生成 `_..._bound_...`)、`_isDeleted_` 都会注入宿主实体。实证:篡改 manifest 中带 Count 状态的 User 的 `tableName` 后 dry-run,`blockingChanges` 为空;同样操作在无状态属性的实体上则正确报 `physical-path-move`。

进一步实证真实合表场景(relation `n:1 → 1:1` 触发表合并)时,**attribute 级**检查(2261-2282 行,比较每个属性的 `tableName/fieldName`)仍会拦住,所以这不是当前可直接触发数据丢失的洞。但它使 record 级检查在绝大多数真实实体上形同虚设,防御纵深只剩 attribute 级一层;一旦遇到 `attributeDetails` 缺失的 manifest(旧版本产物或人工编辑),这层唯一防线就没了。这个条件没有注释说明意图,极可能是为了绕过某个内部记录场景而加的宽泛补丁。

**修复方向:** 把豁免条件收窄到真正的意图(例如仅框架内部记录 `_ASYNC_TASK__*`,或仅当移动可被证明由纯内部属性引起),并补注释与测试。

### I6. `hasExistingData` 的忽略清单漏了 `__interaqt_migration_operation_log`

```1338:1338:src/runtime/MonoSystem.ts
        const ignored = new Set(['_IDS_', '__interaqt_migration_manifest', '__interaqt_migration_log', '__interaqt_migration_lock'])
```

四张簿记表漏了第四张。极端场景(operation log 有行、manifest 行缺失)下,一个实际上只有迁移簿记的库会被判为"有业务数据",错误地要求 baseline。顺手补上即可。

### I7. 死代码与语义噪音

- `prepareMigrationAdditive` 中的空 `if (this.db.setupInternalComputationState) { /* 注释 */ }` 块(MonoSystem.ts:325-328),条件毫无作用,应改为纯注释;
- `Controller.retrieveLastValue` 属性分支用真值判断 `if (record![name])` 决定是否回查(Controller.ts:488),`0/false/""` 会多一次无谓 findOne,虽无碍正确性,但作为框架代码应当用 `!== undefined`;
- `serializeState` 的 `defaultSignature: stableStringify(defaultValue)` 在 defaultValue 是函数或含函数对象时退化为 `"[Function]"` 常量(migration.ts:723),状态默认值的函数变更不会体现在 `stateSignature` 中——与 F2 同根,可一并解决。

### I8. 硬删除属性重算的事件语义值得审计(未实证,标记为疑点)

`writeComputationResult` → `applyResult` 对 `_isDeleted_` 为 true 的宿主执行物理删除(Controller.ts:523-525),但 `createMutationEventForOutput` 为它合成的是 `type: "update"` 事件而非 `delete` 事件(migration.ts:2887-2895)。若有下游计算依赖该宿主实体的存在性(如对宿主的 Count),迁移期间收到的是"更新"而非"删除",增量语义可能不减。此点未做实证,建议补一个"迁移中硬删除 + 下游 Count"的用例确认。

---

## 值得肯定的设计

为公允起见,以下机制经查证是扎实的:

- **两步审阅的防篡改闭环**:`migrate()` 执行期重建 expected diff,不信任用户编辑过的 `requiredDecisions`;`fromModelHash/toModelHash` 双向钉住;takeover/destructive scope 在审阅、dry-run、执行三个时点重复核对 count 和精确 id,库在审阅后被改动会明确失败。
- **可恢复执行**:phase 顺序推进 + operation log 让 DDL/校验/manifest 写入幂等可续跑,resume 按 `modelHash + approvedDiffHash` 双键匹配,避免复用错误决策的失败 run(有专门测试)。
- **安全门禁的默认立场正确**:fact 数据物理移动、破坏性 schema 变更、非 Transform 的 entity/relation 输出、无所有权证明的输出替换,默认全部 block,宁可拒绝也不猜测——符合"explicit control"原则。
- **legacy 计算 id 归一化**(`normalizePreviousComputationManifest`)对压缩产物导致的类型名漂移做了语义匹配,考虑周到。
- 官方测试 76 个用例覆盖了大量边界(约束回填校验、断点续跑、takeover 各形态、scoped sequence 种子),本次发现的问题恰好都落在测试没有覆盖的组合上(relation 输出的下游、既有 filtered entity 的下游、MySQL 方言、defaultValue 回填)。

## 建议的修复优先级

1. **F1**(下游漏算):影响正确性且静默,建议立即修。根治方案是让 affected 集合复用运行时 `ComputationSourceMapManager` 的依赖解析;短期止血是修 `depNodes`/`eventDepNodes` 的前缀与 filtered 解析,并为"relation 输出下游"“既有 filtered entity 下游"补测试。
2. **F2**(StateMachine 语义变更不可见):修改 `collectFunctionText`/`hasFunctionDeep` 对 StateNode/StateTransfer 的处理,只收集其函数字段。注意这会改变存量库的 `modelHash` 计算,需要在 `normalizePreviousComputationManifest` 里做一次兼容归一。
3. **F3 + I4**(MySQL 簿记与锁):参数化 SQL;锁加租约或解锁 API。
4. **I1**(handler 仪式化):把 handler 要求收敛到 rebuild plan 内,这是把审阅机制从"负担"变回"防线"的关键一步。
5. **I2**(default 回填):补上这个最常见的真实场景。
6. 其余按 I3、I5-I8 顺序。
