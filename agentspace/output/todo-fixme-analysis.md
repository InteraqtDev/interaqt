# TODO/FIXME 深度分析报告

> 扫描范围：`src/` 和 `tests/` 全量 `.ts` 文件  
> 统计日期：2026-03-01

---

## 概要

| 类型 | 数量 |
|------|------|
| FIXME（已知缺陷/需修复） | 18 |
| TODO（待实现/待改进） | 20 |
| **合计** | **38** |

按模块分布：

| 模块 | FIXME | TODO | 合计 |
|------|-------|------|------|
| `src/storage/erstorage/` | 8 | 10 | 18 |
| `src/runtime/` | 4 | 5 | 9 |
| `tests/` | 6 | 4 | 10 |
| `src/builtins/` | 0 | 1 | 1 |

---

## 分类与深度分析

### 一、数据正确性缺陷（FIXME — 高优先级）

这些是已知的功能正确性问题，如果不修复可能导致数据错误或运行时异常。

---

#### 1.1 JSON 返回值序列化歧义
- **文件**: `src/runtime/MonoSystem.ts:55`
- **内容**: `FIXME 现在的数据库json返回值对字符串、数组没有区分。所以只好再包装一层。`
- **分析**: `dict.set()` 将值包装为 `{raw: value}` 来绕过数据库驱动层对 JSON 字段反序列化时字符串和数组无法区分的问题。这是一个临时 workaround，增加了一层不必要的包装。根本原因在于 Database 驱动的 `query()` 返回值对 JSON 类型的处理不统一。
- **影响**: 低——功能正确但增加了复杂度和内存开销。
- **建议**: 在各 Database 驱动 (`PGLiteDB`, `SQLiteDB` 等) 中统一 JSON 字段的反序列化行为，移除 `{raw:}` 包装。

---

#### 1.2 异步事件分发未实现
- **文件**: `src/runtime/MonoSystem.ts:120`
- **内容**: `FIXME 还没有实现异步机制`
- **分析**: `callWithEvents` 方法中被注释掉的 `nextJob(() => { this.dispatch(events) })` 表明原始设计意图是异步分发 mutation event，但目前是同步执行。当 mutation 事件触发大量级联 computation 时，同步调用可能导致调用栈过深或阻塞主流程。
- **影响**: 中——当前同步方式在小规模场景下可用，但在复杂依赖图中可能造成性能问题或 stack overflow。
- **建议**: 实现基于微任务队列的异步事件分发机制，并确保事务一致性。

---

#### 1.3 关系删除逻辑错误（测试已跳过断言）
- **文件**: `tests/runtime/stateMachine.spec.ts:1185, 1201`
- **内容**: `FIXME: 由于系统错误，关系没有被正确删除` / `清空功能可能也有问题`
- **分析**: StateMachine 测试中，关系删除操作没有按预期工作，导致两处断言被注释掉。这说明在 Interaction dispatch 通过 StateMachine 处理关系删除时存在 bug，可能与合表(三表合一)场景下的删除逻辑有关。
- **影响**: 高——已确认的功能 bug，测试被跳过意味着回归风险很高。
- **建议**: 需要深入排查 `DeletionExecutor` 和 `UpdateExecutor` 在合表场景下的关系删除路径，修复后恢复被注释的断言。

---

#### 1.4 双向关系计算死循环
- **文件**: `tests/runtime/data/activity/index.ts:272`
- **内容**: `FIXME 死循环了，双向关系`
- **分析**: 当一个 `Count` computation 监听的是对称关系 (symmetric relation，如 "friend") 时，更新触发重新计算，而重新计算又可能触发新的事件，形成死循环。根本原因是 Scheduler 在处理 symmetric relation 的 mutation event 时，没有对"反方向"做去重。
- **影响**: 高——直接导致运行时挂起/崩溃。
- **建议**: 在 `Scheduler.computeDataBasedDirtyRecordsAndEvents` 中增加对称关系的去重逻辑，防止同一次 mutation 的两个方向反复触发 computation。

---

#### 1.5 合表数据异常合并
- **文件**: `src/storage/erstorage/CreationExecutor.ts:194`
- **内容**: `FIXME 如果不同，才需要 merge。现在不知道为什么 relation 和 source 记录上出现了个 & 关系数据。`
- **分析**: 在三表合一的创建路径中，`merge` 操作无条件执行，即使不需要。`&` 关系数据意外出现在 source record 中，表明数据结构构建阶段有逻辑遗漏。
- **影响**: 中——可能导致创建时产生冗余数据或覆盖正确数据。
- **建议**: 在 merge 前增加 diff 检查，只在确实有新数据时才合并；排查 `&` 关系数据的来源。

---

#### 1.6 Update 查询范围过大
- **文件**: `src/storage/erstorage/UpdateExecutor.ts:48`
- **内容**: `FIXME update 的 attributeQuery 应该按需查询，现在查询的记录太多`
- **分析**: `updateRecord` 方法在查找待更新记录时调用 `AttributeQuery.getAttributeQueryDataForRecord` 并传入 `(true, true, true, true)`，即查询所有关联数据。这在更新单个字段时会产生大量不必要的 JOIN 和数据传输。
- **影响**: 中——性能问题，更新操作比必要的慢很多。
- **建议**: 根据 `newEntityData` 实际涉及的字段，构建最小必要的 `attributeQuery`。

---

#### 1.7 Update 关系写入低效
- **文件**: `src/storage/erstorage/UpdateExecutor.ts:182`
- **内容**: `FIXME 这里没有在更新的时候一次性写入，而是又通过 addLinkFromRecord 建立的关系。需要优化`
- **分析**: 更新关联实体时，先更新实体再单独调用 `addLinkFromRecord` 建立关系，而非在同一次 SQL 操作中完成。这增加了数据库往返次数。
- **影响**: 中——性能问题，N 次更新变成 2N 次数据库操作。
- **建议**: 将关系数据合并到主更新 SQL 中，减少数据库 round-trip。

---

#### 1.8 n:N 关联查询缺少宿主实体引用替换
- **文件**: `src/storage/erstorage/QueryExecutor.ts:306`
- **内容**: `FIXME 对 n:N 关联实体的查询中，也可能会引用主实体的值，例如：age < '$host.age'`
- **分析**: 在 `findXToManyRelatedRecords` 中，matchExpression 中的 `$host.xxx` 形式引用值无法被正确替换为主实体的实际值。这意味着跨实体条件比较在 x:n 查询中不工作。
- **影响**: 中——功能缺失，但当前可能没有场景触发它。
- **建议**: 实现 context 参数传递机制，在查询构建时将 `$host.xxx` 替换为具体值。

---

#### 1.9 AttributeInfo.field 返回不完整
- **文件**: `src/storage/erstorage/AttributeInfo.ts:88`
- **内容**: `FIXME 改好`
- **分析**: `field` getter 只处理了 `isValue` 和 `isManyToOne && isLinkMergedWithParent()` 两种情况。其他情况（如非合表的多对一）返回 `undefined`，可能导致 SQL 构建时字段名为 `undefined`。
- **影响**: 中——特定关系配置下可能生成无效 SQL。
- **建议**: 补全所有关系类型下的 field 返回逻辑，增加 fallback 或 assert。

---

#### 1.10 MatchExp referenceValue 设计缺陷
- **文件**: `src/storage/erstorage/MatchExp.ts:241`
- **内容**: `FIXME 如果外部不知 value 的具体格式，又怎么知道这是一个 referenceValue？这里要重新设计`
- **分析**: `parseMatchAtom` 方法将某些值格式隐式判断为 referenceValue，但外部调用者无法明确表达意图。这导致 value 格式和语义耦合，容易出现误判。
- **影响**: 低——当前通过约定避免了问题，但扩展新操作符时风险增大。
- **建议**: 在 `MatchAtom` 类型中增加显式的 `isReference: boolean` 标志。

---

#### 1.11 EntityToTableMap 路径解析不严谨
- **文件**: `src/storage/erstorage/EntityToTableMap.ts:397`
- **内容**: `FIXME 这里判断非常不严谨。目前只有 & 出现的时候，才会出现 undefined。`
- **分析**: `getPath` 方法中通过 `info === undefined` 来判断是否遇到了 `&`（关系链接符号），这是一种脆弱的判断方式。如果其他情况也返回 undefined，将导致逻辑错误。
- **影响**: 低——当前可用，但维护风险高。
- **建议**: 增加对 `&` 符号的显式检查，替代 `undefined` 隐式判断。

---

#### 1.12 QueryExecutor goto 耦合
- **文件**: `src/storage/erstorage/QueryExecutor.ts:152`
- **内容**: `FIXME 这里的判断逻辑和 goto 耦合太重了？`
- **分析**: 在 x:1 关系递归查询中，通过 `subEntityQuery.goto` 标记来区分是否需要单独查询。这个判断与 goto 机制紧密耦合，不够通用。
- **影响**: 低——可维护性问题。
- **建议**: 提取为独立的查询策略判断，基于关系类型而非 goto 标记。

---

#### 1.13 Scheduler computeOldRecord 可能废弃
- **文件**: `src/runtime/Scheduler.ts:399`
- **内容**: `FIXME 理论上我们现在不需要 computeOldRecord 了。`
- **分析**: 该方法在 targetPath 非空时简单返回 `{...newRecord}`，在为空时返回 `mutationEvent.oldRecord`。注释表明整个方法可能已经不必要。
- **影响**: 低——死代码风险。
- **建议**: 验证所有调用路径后移除或简化。

---

#### 1.14 AttributeQuery 递归查询参数处理
- **文件**: `src/storage/erstorage/AttributeQuery.ts:61`
- **内容**: `FIXME 再想想以下几个参数的递归查询，特别是关系上的数据。`
- **分析**: `getAttributeQueryDataForRecord` 中对 `includeSameTableReliance` 等参数的递归传递逻辑不够明确，在关系数据的递归查询场景下可能返回不完整的结果。
- **影响**: 中——可能导致某些关联数据在递归查询中丢失。
- **建议**: 明确每个参数在递归下沉时的语义，增加单元测试覆盖。

---

#### 1.15 Setup 合表时 reliance 非 1:1 处理
- **文件**: `src/storage/erstorage/Setup.ts:783`
- **内容**: `FIXME 还要加上 reliance 不是 1:1 的？`
- **分析**: 当前合表策略只处理 1:1 的 reliance 关系，x:1 的 reliance 关系没有被合表。如果框架支持 x:1 reliance，这里需要额外处理。
- **影响**: 低——取决于是否有 x:1 reliance 的使用场景。
- **建议**: 确认 reliance 是否仅限 1:1，如果是则加 assert；否则补充处理逻辑。

---

#### 1.16 relatedEntitiesData 权限控制
- **文件**: `src/storage/erstorage/NewRecordData.ts:92`
- **内容**: `FIXME relatedEntitiesData 是不是要限制下，只允许那些自己能管的。`
- **分析**: 创建记录时，关联实体数据没有做"归属"检查。source/target 合并后不归当前 record 管的关联数据也可能被处理。
- **影响**: 低——内部逻辑，不影响外部安全，但可能产生意外副作用。
- **建议**: 增加过滤逻辑，只处理当前 record 有权管理的关联实体。

---

#### 1.17 AttributeQuery x:1 递归过滤
- **文件**: `src/storage/erstorage/AttributeQuery.ts:253`
- **内容**: `FIXME 过滤掉 x:1 中递归地情况。`
- **分析**: `buildXToOneQueryTree` 构建时没有过滤掉递归回自身的 x:1 关系，可能导致无限递归的查询树。
- **影响**: 中——特定数据模型（实体自引用）下可能导致死循环。
- **建议**: 在构建查询树时检查并跳过已访问的实体路径。

---

#### 1.18 transformInteraction 用户属性错误信息
- **文件**: `tests/runtime/transformInteraction.spec.ts:107`
- **内容**: `FIXME 获取 userAttribute error 信息`
- **分析**: 当 Interaction guard 因 userRef attributive 不匹配而拒绝时，错误信息缺乏足够的上下文（具体是哪个 attributive 不满足）。
- **影响**: 低——仅影响错误调试体验。
- **建议**: 在 `InteractionGuardError` 中附加 attributive 匹配失败的详情。

---

### 二、待实现功能（TODO — 中优先级）

这些是设计中已预见但尚未实现的功能点。

---

#### 2.1 RealTime 计算中 `now` 注入机制
- **文件**: `src/runtime/computations/RealTime.ts:41, 105`
- **内容**: `TODO now 是不是应该用 dataDeps 动态注入？这样能手动测试。`
- **分析**: `GlobalRealTimeComputation` 和 `PropertyRealTimeComputation` 都直接使用 `Date.now()`，无法在测试中 mock 时间。如果改用 dataDeps 注入，可以实现确定性测试。
- **影响**: 测试覆盖度受限，无法对时间敏感的 computation 做精确断言。
- **建议**: 增加 `nowProvider` 或通过 dataDeps 注入 `now` 值，默认使用 `Date.now()`。

---

#### 2.2 独立字段处理
- **文件**: `src/storage/erstorage/NewRecordData.ts:76`, `src/storage/erstorage/Setup.ts:823`
- **内容**: `TODO 要把那些独立出去的 field 排除出去` / `TODO 独立字段的处理`
- **分析**: 合表策略中某些字段应被"独立"到单独的列或表，但当前逻辑没有处理这种情况。`NewRecordData` 在遍历 `relatedEntitiesData` 时也没有排除这些独立字段。
- **影响**: 功能不完整，但当前可能没有实际使用独立字段的场景。
- **建议**: 明确"独立字段"的设计规范，实现排除/独立处理逻辑。

---

#### 2.3 Scheduler 合成 listener
- **文件**: `src/runtime/Scheduler.ts:282`
- **内容**: `TODO 未来合成一个 listener`
- **分析**: 当多个 property computation 需要监听同一实体的创建事件时，当前为每个 computation 独立注册一个 listener。合成为一个 listener 可以减少事件分发的开销。
- **影响**: 性能优化方向，当前可用。
- **建议**: 实现 listener 合并机制，按 recordName 分组。

---

#### 2.4 Scheduler 对称关系 targetPath 处理
- **文件**: `src/runtime/Scheduler.ts:374`
- **内容**: `TODO 需要确定一下，是不是没考虑 targetPath 中间 symmetric relation 的情况`
- **分析**: 在计算 dirty records 时，targetPath 中如果包含对称关系的中间节点，路径解析逻辑可能不正确。当前代码对 symmetric relation 做了终端节点的处理，但中间节点是否也需要特殊处理未确认。
- **影响**: 中——在复杂数据依赖路径中可能导致 dirty record 遗漏。
- **建议**: 构造包含中间对称关系节点的测试用例进行验证。

---

#### 2.5 Scheduler 错误处理
- **文件**: `src/runtime/Scheduler.ts:598`
- **内容**: `TODO error 处理`
- **分析**: 当 computation 执行出现非 `ComputationResult` 返回时（else 分支），目前无任何处理。异常被静默忽略。
- **影响**: 中——computation 执行失败时无日志、无告警、无回滚。
- **建议**: 添加错误日志记录、抛出异常或返回错误结果。

---

#### 2.6 Computation 状态按需查询
- **文件**: `src/runtime/computations/Computation.ts:95`
- **内容**: `TODO 如果 record 上不存在就重新查询`
- **分析**: `RecordBoundState.get()` 在 record 中找不到目标 key 时会回退查询数据库。目前代码已经实现了 fallback，但注释表明原作者对此逻辑的完整性有疑虑。
- **影响**: 低——已有 fallback 实现。
- **建议**: 验证 fallback 路径的正确性后删除此 TODO。

---

#### 2.7 ComputationSourceMap `*` 处理
- **文件**: `src/runtime/ComputationSourceMap.ts:355`
- **内容**: `TODO 要读定义`
- **分析**: 当 dataDeps 的 attributeQuery 使用 `'*'`（通配符）时，应展开为实际的属性列表以建立精确的依赖映射。目前 `*` 被直接忽略。
- **影响**: 低——大多数 dataDeps 会显式列出属性。
- **建议**: 实现 `*` 展开逻辑，从 Entity 定义中读取完整属性列表。

---

#### 2.8 性能优化：客户端结构化
- **文件**: `src/storage/erstorage/RecordQueryAgent.ts:62`
- **内容**: `TODO 为了性能，也可以把信息丢到客户端，让客户端去结构化`
- **分析**: 当前查询结果在服务端通过 `structureRawReturns` 转为嵌套对象。如果将扁平结果直接返回客户端并附带结构化元数据，可以减轻服务端负担。
- **影响**: 性能优化方向，架构变更较大。
- **建议**: 作为长期优化项，需评估 API 兼容性影响。

---

#### 2.9 删除优化：事件构建低效
- **文件**: `src/storage/erstorage/DeletionExecutor.ts:266`
- **内容**: `TODO 这里需要更加高效的方法`
- **分析**: 删除关联记录时，通过遍历 events 数组为每个 link 事件补充 source/target 引用。当删除大批量记录时，O(N*M) 的遍历效率较低。
- **影响**: 低——仅在批量删除时影响性能。
- **建议**: 预先构建 `recordsById` 的 Map，改为 O(N) 查找。

---

#### 2.10 创建优化：避免不必要的 flash out
- **文件**: `src/storage/erstorage/CreationExecutor.ts:198`
- **内容**: `TODO create 的情况下，有没可能不需要 flashout 已有的数据`
- **分析**: 在创建记录时，合表数据的处理总是先 flash out 再写入。对于全新记录（无冲突），可以直接在目标行上更新。
- **影响**: 低——性能优化方向。
- **建议**: 增加冲突检测，无冲突时跳过 flash out。

---

#### 2.11 合并冲突记录不完整的关系信息
- **文件**: `src/storage/erstorage/RecordQueryAgent.ts:220`
- **内容**: `TODO 要给出一个明确的虚拟 link record 的差异`
- **分析**: 合并记录时新建的关系（link record）与虚拟 link 的区分不够明确，可能导致事件记录中包含不应有的 link mutation。
- **影响**: 低——影响事件准确性。
- **建议**: 在 link 信息中增加 `isVirtual` 标志。

---

#### 2.12 RecordQueryAgent 无冲突优化
- **文件**: `src/storage/erstorage/RecordQueryAgent.ts:201`
- **内容**: `TODO 如果没有冲突的话，可以不用删除原来的数据`
- **分析**: 合并 combined record 时，即使没有冲突也会先删除再插入。可以改为直接更新。
- **影响**: 低——性能优化。
- **建议**: 增加冲突检测后实现就地更新。

---

#### 2.13 MatchExp 复杂格式支持
- **文件**: `src/storage/erstorage/MatchExp.ts:29`
- **内容**: `TODO 支持更复杂的格式`
- **分析**: `MatchExp.fromObject` 目前只支持简单的 `{ key: value }` 格式，自动转为 `['=', value]`。不支持其他操作符。
- **影响**: 低——影响 API 易用性。
- **建议**: 扩展为支持 `{ key: ['>', value] }` 等格式。

---

#### 2.14 EntityToTableMap 中 relationTable 生成
- **文件**: `src/storage/erstorage/EntityToTableMap.ts:274`
- **内容**: `TODO 找到 relationTable，生成 relationTableName`
- **分析**: 注释说明 relation table 有三种情况（独立/合表/合并），当前代码直接读取 `getLinkInfo()?.table`，但此 TODO 可能暗示需要更完善的 table name 生成逻辑。
- **影响**: 低——当前实现可用。
- **建议**: 确认当前实现是否已覆盖三种情况，如是则删除 TODO。

---

#### 2.15 Every 计算中自定义 dataDeps
- **文件**: `src/runtime/computations/Every.ts:189`
- **内容**: `TODO 如果未来支持用户可以自定义 dataDeps`
- **分析**: 当前 `Every` computation 的 dataDeps 是固定的（关联实体和关系）。如果未来允许用户自定义额外的 dataDeps，增量计算逻辑需要增加"非关联依赖变更"的全量重算分支。
- **影响**: 低——预留设计点，当前无需改动。
- **建议**: 保留 TODO 作为设计参考。

---

#### 2.16 Setup 中 reliance 实体不合并声明
- **文件**: `src/storage/erstorage/Setup.ts:711`
- **内容**: `TODO 可能有 reliance 实体声明自己不合并。`
- **分析**: 当前所有 1:1 reliance 关系都自动三表合一。如果 reliance 实体需要声明自己不参与合并，需要在 Entity 定义中增加选项。
- **影响**: 低——扩展性预留。
- **建议**: 保留 TODO 作为功能扩展点。

---

#### 2.17 QueryExecutor 对称 n:n 关系数据判断
- **文件**: `src/storage/erstorage/QueryExecutor.ts:335`
- **内容**: `TODO 是不是有更优雅的判断？`
- **分析**: 对称 n:n 关系查询结果中，需要从 `source` 或 `target` 两个方向中找到有效的 LINK_SYMBOL。当前用 `?.id` 判断，不够明确。
- **影响**: 低——可读性/可维护性问题。
- **建议**: 提取为专用方法，增加注释说明判断逻辑。

---

#### 2.18 UpdateExecutor value 引用
- **文件**: `src/storage/erstorage/UpdateExecutor.ts:116`
- **内容**: `TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5`
- **分析**: 更新操作中的 value 目前只支持字面量。SQL 层面支持 `SET age = age + 5` 这样的表达式，但框架层面尚未实现。
- **影响**: 功能缺失，需要 `age = age + 5` 语义的场景目前无法实现。
- **建议**: 引入 `Expression` 类型的 value，在 SQL 构建时转换为表达式。

---

### 三、测试数据中的待改进（TODO/FIXME — 低优先级）

这些位于测试夹具中，不影响生产代码。

---

#### 3.1 leaveRequestSimple 测试数据待更新
- **文件**: `tests/runtime/data/leaveRequestSimple.ts:115, 155`
- **内容**: `TODO 改 interaction，没有 mapInteractionItem 了` / `TODO 改 statemachine`
- **分析**: 测试数据使用了已废弃的 `mapInteractionItem` API 和旧式 computed 写法，需要迁移到新的 `Transform` 和 `StateMachine` API。
- **影响**: 低——测试可能已不再运行或不准确。
- **建议**: 重写测试数据以使用当前 API。

---

#### 3.2 leaveRequest PayloadItem 缺少 attributive 定语
- **文件**: `tests/runtime/data/leaveRequest.ts:157, 175, 200, 224`
- **内容**: `FIXME 增加定语：我的、未完成的`
- **分析**: 四处 PayloadItem 定义中缺少 attributive 约束（如"我的请假单"、"未完成的请假单"），导致用户可以操作任意 request，而非仅限于自己的。
- **影响**: 低——仅影响测试数据的完整性，非生产代码。
- **建议**: 为 PayloadItem 增加 `attributives` 定义，限制可操作范围。

---

#### 3.3 dbSetup 测试待完善
- **文件**: `tests/storage/dbSetup.spec.ts:270`
- **内容**: `TODO 查询表结构`
- **分析**: 测试中预留了查询数据库表结构的 TODO，用于验证 `DBSetup.createTables` 的正确性。
- **影响**: 低——测试覆盖度。

---

#### 3.4 关联实体查询测试
- **文件**: `tests/storage/entityQueryHandle.spec.ts:303`
- **内容**: `TODO 更复杂的情况`
- **分析**: 查询测试只覆盖了基础场景，需要增加更复杂的嵌套查询、递归查询等 case。

---

#### 3.5 x:1 关系上的 x:n 关联实体测试
- **文件**: `tests/storage/relationAttributes.spec.ts:127`
- **内容**: `TODO x:1 关系上的 x:n 关联实体`
- **分析**: 尚未测试在 x:1 关系上挂载 x:n 关联实体的场景。

---

#### 3.6 FilteredEntity 级联计算测试
- **文件**: `tests/storage/filteredEntityRelation.spec.ts:66`
- **内容**: `TODO 暂时不支持，后面需要增加级联计算法才能支持。`
- **分析**: Filtered entity 上的某些关系操作需要级联计算支持，当前未实现。

---

#### 3.7 Custom computation 深层集成
- **文件**: `tests/runtime/custom.spec.ts:102`
- **内容**: `TODO: Property-level Custom computation 需要更深入的框架集成`
- **分析**: 列出了 4 个需要进一步实现的方面：创建时自动触发、增量计算调度、State 持久化、复杂 dataDeps 解析。

---

### 四、架构设计待改进（TODO/FIXME — 低优先级）

---

#### 4.1 Database 接口与 Storage 的关系
- **文件**: `src/runtime/System.ts:94`
- **内容**: `FIXME 这里应该继承自 storage？`
- **分析**: `Database` 类型定义在 `System.ts` 中，但其定义的方法与 Storage 层有重叠。是否应通过继承或组合来减少冗余需要设计讨论。
- **建议**: 评估 Database 与 ERStorage 的接口关系，考虑提取公共接口。

---

#### 4.2 SystemEntity 应独立到外部
- **文件**: `src/runtime/System.ts:113`
- **内容**: `FIXME 应该独立到外部`
- **分析**: `SystemEntity` 和 `DictionaryEntity` 的定义放在 `System.ts` 中，应移到 `src/builtins/` 或 `src/core/` 中以保持模块职责单一。
- **建议**: 将系统内建实体迁移至 `src/builtins/system/`。

---

#### 4.3 findRootActivity 未实现
- **文件**: `src/builtins/interaction/Activity.ts:361`
- **内容**: `TODO: Implement this function if needed`
- **分析**: `findRootActivity` 函数目前返回 `null`，是一个占位实现。如果 Activity 嵌套功能需要它，则需要实现遍历逻辑。
- **建议**: 确认是否有使用场景，无则删除。

---

### 五、console.warn 需清理

- **文件**: `src/core/utils.ts:119, 132`
- **内容**: `console.warn('Class ${type} not found in KlassByName')` / `console.warn('createClass is deprecated...')`
- **分析**: 生产代码中的 `console.warn` 应替换为框架日志系统或直接移除。`createClass` 已被标记为 deprecated，应最终移除。
- **建议**: 使用框架的 Logger 替代 `console.warn`；排查 `createClass` 的使用并移除。

---

## 优先级矩阵

| 优先级 | 项目 | 说明 |
|--------|------|------|
| **P0 紧急** | 1.3 关系删除 bug, 1.4 双向关系死循环 | 已确认的功能缺陷，直接影响正确性 |
| **P1 重要** | 1.2 异步事件, 1.5 合并异常, 1.6 Update 查询过大, 1.8 宿主引用, 1.14 递归查询, 1.17 x:1 递归过滤 | 影响功能完整性或有性能隐患 |
| **P2 改进** | 1.1 JSON 序列化, 1.7/1.9/1.10/1.11/1.12/1.13/1.16 各种代码质量, 2.1 RealTime 测试, 2.5 错误处理, 2.18 表达式更新 | 代码质量和可维护性提升 |
| **P3 长期** | 2.2~2.17 其他 TODO, 3.x 测试待完善, 4.x 架构改进 | 功能扩展和优化方向 |

---

## 建议行动计划

1. **立即修复** (P0)：排查并修复关系删除 bug (#1.3)，解决双向关系死循环 (#1.4)，恢复被注释的测试断言。
2. **近期改进** (P1)：实现异步事件分发 (#1.2)，优化 Update 查询范围 (#1.6)，修复 AttributeQuery 递归 (#1.14, #1.17)。
3. **持续优化** (P2)：统一 JSON 序列化 (#1.1)，补充错误处理 (#2.5)，改善代码可读性。
4. **规划路线图** (P3)：将长期 TODO 纳入功能路线图讨论。
