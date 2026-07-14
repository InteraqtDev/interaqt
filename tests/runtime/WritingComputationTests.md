# 编写 Computation 测试用例指南

本文档提供了如何为自定义 Computation（如 WeightedSummation、Every、Any 等）编写有效测试用例的指南和最佳实践。

## 测试结构概述

编写 Computation 的测试通常遵循以下结构：

1. **设置测试环境** - 定义实体、关系和计算属性
2. **初始化系统** - 配置 Controller 和 MonoSystem
3. **创建测试数据** - 添加记录到系统中
4. **触发变更** - 创建、更新或删除记录
5. **验证结果** - 确认计算产生了预期结果

## 详细步骤

### 1. 设置测试环境

首先，需要定义实体、关系和属性。根据测试场景，创建必要的 Entity 和 Relation 对象：

```typescript
// 创建实体
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'name',
      type: 'string',
      defaultValue: () => 'user1'
    })
  ]
});

const productEntity = Entity.create({
  name: 'Product',
  properties: [
    Property.create({name: 'price', type: 'number'}),
    Property.create({name: 'quantity', type: 'number'})
  ]
});
```

### 2. 定义计算逻辑

根据要测试的 Computation 类型，定义相应的计算属性。这可以是全局计算（Dictionary）或实体属性：

```typescript
// 全局计算示例（加权求和）
const dictionary = [
  Dictionary.create({
    name: 'totalValue',
    type: 'number',
    collection: false,
    computation: WeightedSummation.create({
      record: productEntity,
      attributeQuery: ['price', 'quantity'],
      callback: (product: any) => {
        return {
          weight: product.quantity || 0,
          value: product.price || 0
        };
      }
    })
  })
];

// 实体属性计算示例
userEntity.properties.push(
  Property.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    computation: Every.create({
      record: requestRelation,
      attributeQuery: ['handled'],
      notEmpty: true,
      callback: (request: any) => {
        return !!request.handled
      },
    })
  })
);
```

### 3. 初始化系统

创建并配置系统和控制器：

```typescript
const system = new MonoSystem();
system.conceptClass = KlassByName;

// 对于全局计算
const controller = new Controller(system, entities, [], [], [], dictionary, []);

// 对于包含关系的实体属性计算
const controller = new Controller(system, entities, relations, [], [], [], []);

await controller.setup(true);
```

### 4. 添加测试数据

创建需要的记录，建立它们之间的关联：

```typescript
// 创建记录
const user = await system.storage.create('User', {name: 'user1'});
const product = await system.storage.create('Product', {price: 10, quantity: 2, buyer: user});

// 查询记录
const user1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
```

### 5. 测试计算结果

验证初始计算结果是否符合预期：

```typescript
// 验证全局计算结果
const initialTotalValue = await system.storage.get('state', 'totalValue');
expect(initialTotalValue).toBe(0);

// 验证实体属性计算结果
expect(user1.totalPurchaseValue).toBe(20); // 10 * 2
```

### 6. 触发变更并验证增量计算

通过更新、创建或删除数据来触发增量计算，然后验证结果：

```typescript
// 更新数据
await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product.id]}), {quantity: 5});

// 重新获取数据并验证计算结果
const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
expect(user2.totalPurchaseValue).toBe(50); // 10 * 5
```

## 测试场景示例

### 1. 全局加权求和测试

测试场景：
- 创建产品记录并验证总价值
- 更新产品数量并验证总价值更新
- 删除产品并验证总价值减少

```typescript
test('should calculate global weighted summation correctly', async () => {
  // 设置环境...
  
  // 初始值为 0
  const initialValue = await system.storage.get('state', 'totalValue');
  expect(initialValue).toBe(0);
  
  // 创建产品，添加值
  const product1 = await system.storage.create('Product', {price: 10, quantity: 2});
  const product2 = await system.storage.create('Product', {price: 20, quantity: 3});
  
  // 验证计算：(10*2) + (20*3) = 80
  const value1 = await system.storage.get('state', 'totalValue');
  expect(value1).toBe(80);
  
  // 更新产品数量
  await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product1.id]}), {quantity: 5});
  
  // 验证更新后计算：(10*5) + (20*3) = 110
  const value2 = await system.storage.get('state', 'totalValue');
  expect(value2).toBe(110);
});
```

### 2. 实体属性计算测试

测试场景：
- 通过关系连接的记录的属性计算
- 更新关联对象属性，验证计算结果变化
- 删除关联，验证计算结果变化

```typescript
test('should be true when every request of a user is handled', async () => {
  // 设置环境...
  
  // 创建用户和请求
  const user = await system.storage.create('User', {});
  const request1 = await system.storage.create('Request', {handled: false, owner: user});
  const request2 = await system.storage.create('Request', {handled: false, owner: user});
  
  // 验证初始状态（没有全部处理）
  const user1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
  expect(user1.everyRequestHandled).toBeFalsy();
  
  // 处理第一个请求
  await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true});
  
  // 验证中间状态（仍有未处理的请求）
  const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
  expect(user2.everyRequestHandled).toBeFalsy();
  
  // 处理第二个请求
  await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request2.id]}), {handled: true});
  
  // 验证最终状态（所有请求已处理）
  const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
  expect(user3.everyRequestHandled).toBeTruthy();
});
```

### 3. 边界条件测试

测试各种边界条件和特殊情况：

```typescript
test('should handle zero values correctly', async () => {
  // 设置环境...
  
  // 测试零值
  await system.storage.create('Product', {price: 0, quantity: 5});
  const value1 = await system.storage.get('state', 'totalValue');
  expect(value1).toBe(0); // 0*5 = 0
  
  // 测试零系数
  await system.storage.create('Product', {price: 20, quantity: 0});
  const value2 = await system.storage.get('state', 'totalValue');
  expect(value2).toBe(0); // 0*5 + 20*0 = 0
});

test('should handle negative values correctly', async () => {
  // 设置环境...
  
  // 测试正负值
  await system.storage.create('Account', {amount: 100, factor: 1});  // 正资产
  await system.storage.create('Account', {amount: 50, factor: -1});  // 负债务
  
  // 验证计算：(100*1) + (50*-1) = 50
  const netBalance = await system.storage.get('state', 'netBalance');
  expect(netBalance).toBe(50);
});
```

## 最佳实践

1. **测试隔离** - 每个测试用例应当独立，不依赖其他测试的结果

2. **全面覆盖** - 测试各种操作类型（创建、读取、更新、删除）

3. **边界条件** - 包含零值、负值、极端值等边界条件测试

4. **关系测试** - 对于属性计算，确保测试通过关系连接的数据变化

5. **状态验证** - 测试初始状态、中间状态和最终状态

6. **递增复杂度** - 从简单场景开始测试，逐步增加复杂度

7. **清晰的期望值计算** - 在注释中清晰解释计算期望值的逻辑

## 技巧与注意事项

1. 使用 `BoolExp.atom()` 创建查询条件

2. 通过 `system.storage.findOne()` 获取最新记录状态

3. 对于删除关系测试，可以用设置关联为 null 来模拟

4. 确保为复杂计算添加足够的测试用例

5. 使用异步/等待模式正确处理异步操作

6. 调用 `controller.setup(true)` 确保系统正确初始化

7. 如果测试失败，检查计算逻辑、数据更新操作和查询参数

## 维度登记册（r17 复盘引入，新增测试矩阵必须查阅）

历史致命 bug（r5–r17）几乎全部落在「合法声明组合的空白格」上。为任何计算/写路径
新增测试矩阵时，以下维度的**全部取值（含退化点）**必须显式决策——要么覆盖、
要么在测试文件头注明为什么不适用。每轮审查发现的新维度必须回灌本清单。

| 维度 | 取值（粗体为易漏的退化点） | 历史逃逸案例 |
|------|---------------------------|--------------|
| 关系类型 | 1:1 / n:1 / 1:n / n:n / **对称 n:n（source===target 且同名属性）** / **自引用** | r7 对称删除漏侧、r17 F-3 |
| 物理拓扑 | **combined（三表合一）** / **merged（FK 并入端点行，x:1 默认）** / isolated（n:n 默认） | r6-F3、r17 F-1/F-2 |
| 逐项状态 | 聚合**有无 callback**（注意 Summation/Average/Every/Any/WeightedSummation 无论有无 callback 都持有 link 行级状态） | r17 F-3 |
| 载荷形态 | nested 新建 / **ref 引用既有** / ref+`&` / **同 id ref+`&`（原地更新）** / null 清除 / 数组 replace | r5-F-3、r17 F-2 |
| 载荷嵌套深度 × 子记录拓扑（r27 引入） | 深度 1（宿主的直接属性，矩阵既有格）/ **深度 ≥ 2（嵌套子记录自身携带关系/更深嵌套）× 子记录物理拓扑（merged 子记录经 createRecord 递归、全部支持；combined 子记录只有 value 列被递归写入，其余结构无执行者）**。写路径只消费宿主层分类列表——挂在 combined 子记录分类列表上的任何次级结构（isolated/反向合并/merged-FK 关系、嵌套 combined 新建/ref）此前静默丢失或损坏（无 link 行/无 id/无事件/重复逻辑 id），r27 起在 `preprocessSameRowData` 汇合点 fail-fast。**物理拓扑不改变声明面的合法性**：同一逻辑声明在 merged 拓扑合法而在 combined 拓扑静默损坏，就是矩阵盲格 | r27 F-1（六个形态全漏：isolated n:n / 嵌套新建 n:1 / merged-FK ref / 深度2 combined 新建 / 新建子内嵌 combined ref / 原地 ref 内嵌异 id ref） |
| 操作 | create / update-replace / **update 原地（同 id）** / **抢夺（引用已被占用的排他目标）** / delete 实体 / addRelation / removeRelation | r6-F3、r17 F-1 |
| 路径跳数 | 1 跳 / **2 跳（含连续对称段）** / 3 跳 | r17 F-4 |
| 观察面 | 查询面 / **事件面（用 tests/storage/helpers/eventCompleteness.ts 的预言机）** / 计算面（与朴素重算对照） / 不变量面（无悬挂端点、x:1 排他唯一） | r17 F-2 |
| 计算轨道（机制轴） | 数据驱动（dataDeps）/ **事件驱动（StateMachine trigger / Transform eventDeps）** / **migration 签名（第三个读者：同一声明在 manifest 里是否可见）** | r18 F-1、r18 F-2 |
| 监听名形态（机制轴） | 物理 base 名 / **filtered entity/relation 名** / **merged input 视图名** / 嵌套 filtered 链 | r18 F-1、r18 merged-input 亲缘 bug |
| 底层原语正确性（正交轴） | 被复用原语（`BoolExp.evaluate` / match 求值 / 算术求值）的**代数律/真值表**必须独立于"上层怎么用"断言；同一语义有多实现（SQL `NOT` / 内存 not）时须做**一致性对账**；权限面须有**对抗性断言**（构造应拒绝的组合守卫，断言其拒绝——fail-open 是否定形命题，正向用例测不到） | r19 F-1（NOT 不贯穿 AND/OR，且旧测试把 bug 写进断言） |
| 视图 × 写形态（交叉格，r20 引入） | **filtered relation/entity over 行内记录（merged link、combined 记录）× 全部行内写法**：host-create-with-ref / 同 id `&` 原地翻转 / host-update-replace / host 删除 / 抢夺（flashOut）/ removeRelation（relocate）——行内记录的事件是手工 push 的，不经过 createRecord/updateRecord 的记录级钩子，视图事件必须经 FilteredEntityManager 的 post-write 队列 / 删除快照产生。**抢夺有三个入口形态：create-with-ref / update-with-ref / addRelation（正在创建的是 link record，端点是虚拟 link ref）**——每个入口都是独立的格；手工 push 的旧 link delete 必须伴随 `collectLinkMembershipChecks`（两端实体的成员资格快照，与 deleteRecord 契约同构）。**关系端点声明形态是子维度（r22 引入）：端点为 base entity / 端点为 filtered entity**——link 元数据（sourceRecord/targetRecord）保存声明名，任何以端点名查依赖/视图的读者必须经 `FilteredEntityManager.resolveBaseRecordName` 归一化（唯一收口点）。**create 事件 payload 契约（defaults + payload）本身是有两条消费轨的声明面（r25 引入）：base 名事件与 filtered 视图事件**——行内产生点手工拼 payload 时两条轨都要补齐 default-only 字段，统一经 `NewRecordData.completeEventPayloadWithDefaults`（唯一补齐实现；r22 I-4 只修了视图轨，base 轨漏到 r25——下游 records-match 本地求值按「缺席 ⟺ NULL」解读快照、trigger/eventDep 深度匹配直接失明）。**delete/update 事件 payload 契约（source/target 端点）同理是多产生点声明面（r26 引入）**：delete 的产生点 = DeletionExecutor 规范形 / flashOut create-steal / flashOut merged-replace / relocate / **filtered 视图轨（settleDeletionMemberships 的 payload 来源快照 recordsById 必须携带端点）**；update 的产生点 = canonical updateRelationByName（matchedEntity 带 managedRecordAttributes 端点）/ **行内同 id `&` 原地更新（oldRecord 手工拼，端点须显式补）**。create-steal 分支此前只 push 裸 `LINK_SYMBOL`，端点缺失使 `computeTarget(event.record.source.id)` 失明（r26 F-1）；预言机第 6/7 条（delete/update 端点存在 + 与变更前快照值一致）首跑另抓出 `{id:undefined}` 残缺端点与 `!isRelationSource` 端点左右反转两个兄弟缺陷——存在性断言对「有字段但值错」失明，只有值比对能抓 | r20 F-2（七个行内写法格）、r21 F-2（addRelation 抢夺形态漏网——r19 F-3 只修了 create/update 入口）、r22 F-1（filtered 端点 relation 事件整族缺失——r8 只修了查询面）、r22 I-4（default-only 字段三产生点全漏，只修视图轨）、r25 F-1（同一契约的 base 轨在三产生点全漏——依赖该契约的 r21 F-1 本地求值静默少计、StateMachine trigger 永不触发）、r26 F-1（flashOut create-steal delete 缺端点——同函数内 merged-replace/create 与 DeletionExecutor 都做对了） |
| 事件模式匹配语义 | update 事件的 `record` 模式按**合并后的当前状态**（`{...oldRecord, ...record}`）匹配——同一声明面（RecordMutationEventPattern）的全部读者（eventDep 匹配器 / StateMachine TransitionFinder）必须共用 `mergedMutationEventView`；「本次更新触及字段 X」用 `keys` 表达 | r20 F-5（TransitionFinder 按部分 record 匹配，与 eventDep 轨道分裂） |
| 引用形态（isReferenceValue） | value[1] 为**单字符串**（简单操作符）/ **字符串对**（between）——引用路径入 JOIN 树的收集器（`collectAtomReferencePaths`）是唯一登记点，direct match 与 EXIST 载荷两个消费方共用 | r12 F-2、r19 F-2、r20 F-1（同一声明面第三次漏网） |
| 本地谓词求值 × 快照完备性（r21 引入） | 任何**在内存中模拟 SQL 谓词**的判定器（`Scheduler.evaluateRecordsMatch` 的 skip/entered 判定、`scopedSequenceMatch` 的 payload 契约）必须与 MatchExp 编译语义**逐操作符对账**（null 三值逻辑、in/not in 的 r20 拆分语义、like/对象值不可判定），且必须区分「**键缺席**」与「**值为 null**」——事件快照的键集合 ≠ DB 行的列集合。**match key 的字段来源**是必测维度：payload 直接字段 / **computed 列（create 事件不携带）** / **嵌套关联路径（update 前置查询裁剪掉未涉及关系）** / **缺席字段（库里 NULL）**，× 操作符极性（正向 = / 负向 !=、not in / IS NULL）。skip 类优化必须同时测「该 skip 的 skip」与「**不该 skip 的没被 skip**」两个方向，且**操作类型三取值（create/update/delete）都要铺**——每种事件的旧/新态快照字段来源不同（create 无旧态、update 用 oldRecord、**delete 的旧态在 event.record 上**） | r21 F-1（四个形态：computed 列 create 少计、['=',null] 少计、['!=',x] 幻影多计、关联路径 match × 自身字段 update 陈旧）、r22 I-3（delete 用错快照字段——r21 只铺了 create/update） |
| 边界值 null/undefined × 操作符载荷 | 每个接受**值载荷**的操作符对 null/undefined 载荷必须显式决策（IS NULL 翻译 / 编译期拆分 / fail-fast），不允许把 null 直接绑参进 SQL（三值逻辑静默零行）。已决策：=/!=（IS NULL 翻译）、in/not in（r20 拆分）、not（仅 null）、**between（r21 fail-fast）**、其余 simpleOp（fail-fast） | r20 I-1（in/not in）、r21 F-3（between 边界 null 静默零行） |
| 概念的寄生位置（r22 引入） | 一个概念/标识符的**每个寄生位置**都是独立的格：filtered entity 出现在被查询名（r5）/ 被监听名（r18）/ 视图（r16–r21）/ **relation 端点声明（r22）** 四个位置，每个位置 × 每个消费面（查询/事件/迁移签名）独立验证。名字有声明名/物理名二元性时必须有**唯一归一化点**（`FilteredEntityManager.resolveBaseRecordName`），新消费点默认经过它。**filtered relation 的谓词有三个查询消费位置（r25 引入）：attributeQuery 子查询（谓词并进子查询 match）/ 普通路径 match（rebased 谓词与路径原子共享外层 JOIN 别名——"同一条边"由别名合并保证）/ EXIST（独立子查询，谓词必须折叠进内层 match，外层 AND 会对不同的边分别成立）**。**机制的每个消费方同理**：`runWithTransactionRetry` 的消费方（Controller.dispatch / MonoStorage.callWithEvents）各自必须显式回答「哪些状态要 attempt 隔离」——dispatch 用 fresh effectsContext，storage 直调用 fresh attemptEvents | r22 F-1（filtered 端点 relation——查询面 r8 修过，事件面漏）、r22 F-2（重试第二消费方无 attempt 隔离——dispatch 有）、r25 F-2（EXIST 位置漏网——attributeQuery 位置 r8 起就做对了） |
| 声明期校验汇合点（r26 收口） | `static.public` 的 required/options/constraints 由 **`validateCreateArgs`（唯一实现，@core）** 在每个 create() 执行——"声明了约束 ⇒ 约束被执行"成为不变量；新增 Klass 必须接线（r16#4 家族的工厂关停）。**元数据即契约**：required/options 写错（如聚合类 record.required=true 而 property-level 合法）会被接线立即暴露，修元数据而非绕过校验 | r25 I-4（merged 守卫）、r26 I-2/I-3（UniqueConstraint/BoolExpressionData）、r26 L-4（九个计算类 + EventSource/SideEffect/Activity/ActivityGroup 一次接线，两处说谎元数据被暴露） |
| 监听声明面二维不变量（r18 引入，r22 扩展） | 死监听不变量覆盖 (recordName, type) 二维：recordName 必须存在于 storage schema（r18），**type 必须 ∈ {create, update, delete}（r22）**——两根轴都在 `assertListenerReachable` 收口，全部生产者（StateMachine trigger / Transform eventDeps / dataDep 转换 / addSourceMap）自动受保护 | r18 F-1（recordName 死监听）、r22 I-2（type typo 死监听——同一声明面的第二根轴） |
| 单事件 × 多监听扇出（r27 引入，r28 扩展到事件驱动轨与同源 records dep） | 同一计算声明 **N 个 dataDeps/eventDeps ⇒ N 个注册监听**；一次 mutation 命中多个监听时的执行次数必须显式决策：**property dep（自身或同一 targetPath）合并为一次**；**事件驱动计算（Transform eventDeps / StateMachine trigger）按 (computation, event) 合并为一次**（r28：重叠 eventDep 模式让 Transform 对同一事件插入 N 份派生记录——callback 收到完全相同的事件对象、无 dep 身份，用户层不可去重；StateMachine 注册期已按 (recordName,type) 折叠所以天然单跑）；**records dep 按 dep 独立执行**（不同 match 的 membership 判定 entered/left/skip 是各 dep 增量语义的一部分）——但**同一 source 的多个 records/global dep + 默认增量计划**是 N 倍执行的静默损坏形态，r28 起声明期 fail-fast（显式 planIncremental + context.depKey 分流是受支持的多 dep 写法）。live Scheduler（buildComputationMutationListener）与 migration 链式 rebuild（queueEvents 入队去重 + runIncrementalRecompute 重放去重）是同一契约的两个消费方 | r27 F-2（双 property dep 单次 update 增量双跑）；r28（Transform 重叠 eventDeps 双插派生行；Custom 同源双 records dep 增量 ×2） |
| id 的 JS 形态（r27b 引入，fuzzer 首跑抓获） | 记录 id 在写路径的身份判定必须对 JS 类型不敏感（`sameRecordId`，String 归一）：**驱动原生形态**（SQLite/PG/MySQL number、PGLite uuid string）× **公开 API 形态**（签名声明 `string`；HTTP 载荷天然 string）。SQL 面 `1='1'` 判相等而 JS `===` 判不等——行匹配查到行、身份判定说"不是同一个"，flashOut 合并/同 id 原地判定被静默跳过（重复逻辑 id 行、字段丢失）。**公开签名声明的输入域必须进测试的生成域**；事件 payload 的 id 形态与读回侧是否强制同型是记录中的开放契约决策 | r27b F-3（8 处 `===` 判定全漏；r24 F-1 驱动侧分裂的 API 侧兄弟格） |
| 行搬迁的携带深度（r27b 引入，r28 收口 G 家族） | flashOut/relocate 的物理行搬迁子树由 `getAttributeQueryDataForRecord` 的**递归深度**隐式决定：sameTableReliance 递归携带（随行搬运）、**notRelianceCombined 不下钻**。守卫判定必须覆盖**整棵搬运子树**（r28：只查根记录的配对漏掉子树成员的多 owner/同住配对），且 host-attr steal 轨与 link-endpoint claim 轨同构接线（r28：F-5 守卫只接了 link-endpoint 轨）。relocate 的搬迁端点**可翻转**（默认端点带子树外配对时移对端；两端都带则 fail-fast）。**reliance 生命周期契约的语义必须跨物理拓扑等价（r28 拓扑等价矩阵）**：combined 的既定契约（re-parent 合法 / displacement fail-fast / 空闲领养合法 / 幂等快照回写合法）在 merged（自引用 1:1 / 合表降级）与 isolated（1:n reliance）上此前两侧皆漏（re-parent 静默双 link、displacement 静默 FK 覆盖、空闲领养被误拒、update 超集新增被误拒），r28 起 owner 占用查询 + createRecord 入口槽位守卫统一收口 | r27b F-4/F-5；r28 G-1（子树/host-attr 轨漏）、seed 187（端点翻转）、reliance 拓扑等价矩阵（8 轨 × 3 拓扑） |
| 物理搬迁 ≠ 逻辑删除（r28 引入，fuzzer seed 270/424 抓获） | flashOut 抢夺 / relocate 解除的「清旧行」是**纯物理操作**（记录逻辑身份不变、随后整体重插新行），绝不能复用逻辑删除的机制：deleteRecordSameRowData 的级联（sameTableReliance 成员按"死亡"处理 → 其 isolated link 行 / 异表 reliance 被物理删除且零事件）、defaultValue 补齐（查询快照对 NULL 列**省略键**+写路径对缺席键应用默认值 ⇒ 显式 null 被静默改写回默认值）、link id 重新发号（搬迁行上的 merged link 逻辑身份改变且零事件）。r28 落地 `clearRowDataForMigration`（无级联清列）+ NULL 物化 + 携带 link id 保留。**判定快照数据缺席键的语义前先问：这份数据来自哪个查询、该查询是否加载了该键** | r28 seed 270（isolated n:n link 连坐删除）、seed 424/446（null→默认值改写）、seed 114（link id 重发号） |
| 同住 ≠ 配对：combined 读取的真相源（r28 引入） | combined x:1 按「同物理行」编译（无 JOIN 无 ON），**行槽位排他不变量**保证一行每类型至多一个实例，但**配对事实的唯一真相源是 link id 列**：孤儿同住（hub 亡故余留 co-tenant）、多 owner reliance 装配都会造出「同住但未配对」的行——裸同行读取产生幻影关联（嵌套读取返回从未 link 的记录、match 路径误命中、删除按幻影配对级联销毁无辜记录）。消费面全枚举：嵌套读取（synthetic `&` + 结果剪枝）/ match 路径（combined 段 IS NOT NULL 守卫原子，对称变体逐一）/ 删除级联（幻影剪枝 + link id 核验）/ **flashOut 行认领刻意按物理同住寻址（physicalRowMatch/physicalRowRead 显式豁免——被领养的独居记录没有配对）**。Setup 面：同对实体的第二条 combined 放置违反行槽位排他（幻影配对/行碰撞/互 reliance 深查询无终止），显式 mergeLinks fail-fast、reliance 自动合表降级为 merged link | r28 seed 123（互 reliance 栈溢出）、136/156（双 combined 对幻影+槽位碰撞）、369（幻影级联+半清 link）、查询面幻影读取（多 owner reliance 孤儿同住） |
| 驱动差异轴（r24 引入，r25 扩展，r26 补 close） | 「PGLite ≈ PostgreSQL 语义」只在 SQL 方言层成立，**驱动机制层必须逐格验证**：id 分配方式 × 读回类型（r24 F-1）；**方言入口对 fieldType 字符串的识别必须覆盖自家 `mapToDBFieldType` 的全部产出形态（大小写、type:'json' vs object/collection，r25 I-1）**；**连接管理幂等不变量（open/openForSchemaRead/close 任意顺序重入不泄漏/不抛错）四驱动逐一验证（r22 I-5 SQLite open → r25 I-2 MySQL open → r26 I-4 四驱动 close）**；atomic 读/写路径与 find/storage-write 的类型归一化对称（r24 I-1 读 → r25 I-3 写）。**环境可得性本身是轴**：env-gated 套件（postgresql* / mysql*）沉睡面提供的置信度为零（r24 复盘）；**timestamp 读写归一化（r26 收口）：JS 面契约 = epoch 毫秒（写接受 Date|ms|ISO，find/atomic 读恒 number），语义类型（Property.type）而非 DB 列型驱动判定——SQLite 的 timestamp 列 fieldType 是 INT，从列型无法识别** | r24 F-1（PG id 类型分裂存活 22 轮）、r25 I-1（type:'json' 匹配 PG 裸报错——PGLite 掩盖）、r25 I-2（MySQL open 泄漏——r22 只修 SQLite）、r26 I-4（close 幂等是 open 家族的对称面） |

**正交轴说明（r19 复盘引入）**：数据形态轴与机制轴都长在"响应式数据流"上（mutation → 事件 → 计算）。
底层逻辑原语（`BoolExp.evaluate`、match 求值、算术求值）是数据流的**上游依赖**，不产生 mutation、不进事件流、
不注册监听——所有数据流预言机对它失明。它的正确性契约是**数学事实**（真值表 / 代数律），绝不能由"当前实现怎么跑"
定义。r19 F-1 的教训尤其尖锐：`boolexp.spec.ts` 两处旧测试的注释写明了"实现不传播 inverse"，却把这个错误行为
`expect(...).not.toBe(true)` 固化成绿灯——**测试不是漏写，是替 bug 挡住了所有想修它的人**。写原语测试时必须问：
断言的是语义应该是什么，还是实现现在是什么？

**机制轴说明（r18 复盘引入）**：前七根轴描述"声明的数据形状"，后两根描述"同一声明被哪个机制消费"。
同一个声明面（如 trigger/eventDep 的 `recordName + type`）的**每一个读者都是一根轴**——bug 住在读者之间的
差集里，按特性组织的测试与行覆盖率对此都失明。**路由/订阅类修复的强制清单**：修复某一读者的路由缺陷时，
必须枚举同一声明面的全部读者（数据驱动轨、事件驱动轨、migration 签名、`addSourceMap` 等扩展点）并逐一验证；
能在汇合点收口（共用同一条归一化/校验管线）的优先于逐读者修补。setup 期的死监听不变量
（`ComputationSourceMapManager.assertListenerReachable`）是订阅面的结构性守卫——新增事件生产者/消费者时
它会自动拒绝不可达监听，测试矩阵无需为"监听可达性"逐格铺点。

配套设施：
- `tests/storage/helpers/eventCompleteness.ts` — 事件完备性预言机（数据 diff ⟺ 事件流）、
  INV-3 排他侧唯一、正反查询一致性断言；
- `tests/storage/writePathTopologyMatrix.spec.ts` — 拓扑 × 操作矩阵样板；
- `tests/runtime/symmetricAggregationMatrix.spec.ts` — 对称 × 全聚合、朴素重算预言机样板；
- `tests/storage/symmetricPathMatrix.spec.ts` — 跳数 × 端点形态矩阵样板。

### 整并原则（r17 第四轮补充）

矩阵覆盖某格后，同格的点状旧用例应删除以降低重复维护面，判定标准：
1. 旧用例断言集是矩阵断言的**真子集**（同一代码路径、同等或更弱强度）→ 删；
2. 独有断言（独有声明形态 / 事件契约细节 / 独有格）→ 先迁入矩阵，再删；
3. 删除后必须以变异测试复验（回退 src 至该 bug 修复前，确认矩阵仍变红）。
历史 review-fixes 文件中矩阵未覆盖的缺陷回归（守卫链/Activity/migration 等）不属于重复面，保留。
