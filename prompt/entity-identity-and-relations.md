# Entity 身份与 Relation：问题与修改方案

> 面向 interaqt 框架本身的设计备忘。描述身份模型上的范式缺口、目标形态，以及可渐进采用的修改方案。不绑定具体业务仓库。

## 1. 背景

interaqt 的响应式 ER 模型约定：

- **创建**：实体由 `Transform`（常见来源是 `InteractionEventEntity`）派生出来。
- **更新**：属性由 `StateMachine` 等推进；`computeTarget` 必须返回框架主键形态 `{ id }`。
- **关联**：跨实体连接应使用 `Relation.create`，在 Transform 返回值里用 `{ id }` 引用已有记录；查询用关系路径 / nested `attributeQuery`。
- **主键**：存储层为每条记录维护 `id`；未提供时由 driver（如 uuidv7）自动分配。框架文档要求：**Transform 回调不要返回顶级 `id`**——派生记录的身份归框架。

同时，真实应用经常需要：

1. **客户端（或跨进程编排方）预生成稳定标识**，用于幂等创建、重试、在落库前写入外部键（对象存储 key、下游任务引用等）。
2. **跨 HTTP / 多进程共享同一逻辑对象身份**，不能等服务端创建回包后再传播。
3. **关系图查询与引用完整性**，希望继续享受 Relation、而不是在业务里手写字符串伪外键与 `findOne` 链。

## 2. 问题本质

上述三条需求与现行教义叠加后，出现结构性张力：

| 需求 | 现行框架姿态 | 冲突点 |
|------|----------------|--------|
| 客户端预生成幂等标识 | Transform 禁止返回顶级 `id`；派生行身份由框架占用 | 应用身份无处安放 |
| 跨进程引用同一对象 | 对外只能传播「已知 id」 | 框架 `id` 在创建前不可知（若禁止客户端指定） |
| 关系图 / Relation 正统 | 引用必须是框架 PK 的 `{ id }`；规则上反对「`xxxId` 外键属性」 | 若应用身份 ≠ `id`，Relation 与公开引用分裂成两套 |

业界常见的是「公开业务身份 + 存储主键」或「客户端可写的单一主键」；**少见的是**：在同一套响应式 ER 里，既规定「禁止外键属性、只用 Relation」，又规定「派生创建不能自带 `id`」，却不提供一等的应用身份通道。

结果是应用层被迫二选一（或更糟：两者扭曲并存）：

- **A. 字符串引用列**：到处 `ownerId` / `parentId` 等，Relation 空转或仅装饰；引用完整性靠 `UniqueConstraint` + `Condition` + 手工查询。
- **B. 强行把客户端 UUID 塞进 `id`**：与「Transform 不返回 `id`」及派生增量身份模型（按 `affectedId` / source 映射更新删除）教义冲突，文档与运行时语义不清。

存储层其实**已经支持**创建时携带外部 `id`（`CreationExecutor`：无 `id` 才 `getAutoId`）。缺口主要在：

- Transform / 文档层的身份语义未区分「创建时可指定」与「更新时不可变」；
- Relation / `computeTarget` 没有围绕「应用身份」的一等 API；
- 缺少清晰的目标教义，导致应用用伪外键绕开框架。

## 3. 目标原则（最终方案）

### 3.1 首选目标形态：单一应用身份 = `id`

**`id` 即应用身份，亦是存储主键。**

- 创建时 **`id` 可选**：调用方预生成则写入；省略则框架生成（推荐与现有 driver 一致，使用 uuidv7/ULID 一类可排序 id）。
- 创建后 **`id` 不可变**。
- 跨实体引用 **只通过 Relation**，形态为 `{ id }`；不鼓励、也不需要平行的「外键字符串属性」作为主连接机制。
- `computeTarget` 直接使用 payload 中的应用 id：`{ id: payload.someId }`（在「payload 携带的就是主键」的前提下）。

**Transform 身份规则（精确化，替换「永远禁止返回 `id`」）：**

1. **insert**：允许返回 `id`；与已有行冲突则走唯一约束失败（幂等策略由应用用同一 `id` 重试或显式 Condition 表达）。
2. **update**：定位只认框架的 `affectedId`；patch data 中的 `id` 必须忽略或剥离，禁止借更新改身份。
3. **delete**：只认 `affectedId`。

这样保留 data-based Transform 的派生集合增量模型，同时让 InteractionEvent → Entity 的工厂型 Transform 能写出客户端已知的稳定主键。

### 3.2 为何不以「双身份」为首选

「内部 surrogate `id` + 独立业务身份列」在需要对外可轮换、多套外部自然键、或强制隐藏存储 PK 时仍然成立，但默认成本更高：两套 id、两套查询、Relation 与公开引用易脱节。

**默认教义应是单身份。** 双身份降为可选扩展（见 §5），而不是主路径。

### 3.3 非目标

- 不把任意字符串 `*Id` 属性自动当成外键。
- 不引入「仅 InteractionEvent Transform 可返回 `id`」的特例双轨主键语义（应统一为 insert 可选 / update 不可变）。
- 不要求所有实体都必须客户端预生成；服务端生成仍是默认。

## 4. 框架修改要点

### 4.1 文档与断言

- 更新 Transform / Entity CRUD 文档：删除「NEVER include `id`」的绝对表述；改为 §3.1 三条规则。
- Runtime / 测试：覆盖「带 `id` 创建」「省略 `id` 自动生成」「update patch 携带 `id` 不改主键」「Relation 用应用 `id` 链接」。

### 4.2 Transform / `applyResultPatch`

- insert：透传 callback 提供的 `id`（已与 `CreationExecutor` 行为对齐，确认整条 computation 路径无二次剥离）。
- update：写入 storage 前剥离 `data.id`，仅用 `affectedId` 匹配。

### 4.3 Relation 与查询

- 保持 `{ id }` 为唯一引用形态（在单身份模型下，此 `id` 即应用身份）。
- 继续禁止用裸外键属性替代 Relation 作为主连接（lint / 文档 / 可选 setup 检查）。

### 4.4 `computeTarget`

- 文档明确：返回值中的 `id` 必须是**目标行主键**（在单身份模型下即应用 id）。
- 若未来支持双身份扩展，再提供「按 identity 属性解析为 `{ id }`」的官方 helper；单身份路径不需要。

## 5. 兼容与渐进采用

框架应做成**超集**，避免升级即逼迫应用大爆炸改写。

| 应用现状 | 升级后 |
|----------|--------|
| Transform 不返回 `id` | 仍然合法；框架自动分配 |
| 已有额外「业务 id」字符串列 | 仍是普通属性；框架不删除、不强制迁移 |
| 已用字符串列做跨表引用 | 行为不变；仅不再是推荐模式 |
| 新代码创建时带 `id` + 只建 Relation | 新能力，立即可用 |

含义：

- **现有代码可零改动跑在新框架上。**
- **新实体 / 新模块按 §3.1 书写。**
- **旧实体若要把「业务 id 列」折叠为真正的 `id`**，属于**应用侧数据迁移**（改写主键与 Relation 两端 id），框架无法对旧行语义自动等价；可按实体分批 cutover。
- 过渡期允许双轨并存；长期应收敛到单身份 + Relation，避免两套教义永久分裂。

### 5.1 可选扩展：声明式 `identity`（过渡桥，非默认）

若应用短期无法迁主键，又希望 Relation 按「现有业务列」解析链接，可增加：

```typescript
Entity.create({
  name: 'Order',
  identity: { property: 'orderId' }, // 唯一、稳定；id 仍为内部 surrogate
  properties: [/* … */],
})
```

- Transform 可返回 `orderId`，不可返回内部 `id`（或返回了也忽略）。
- Relation 嵌套支持 `{ orderId: '…' }`，框架解析为 PK 再建链。
- `computeTarget` 提供按 identity 解析的官方 API。

该扩展服务**存量双身份**的渐进补 Relation；**新项目仍应走 §3.1，不必声明 `identity`。**

## 6. 验收标准（框架层）

1. Transform insert 携带合法唯一 `id` → 行主键即该值；省略 → 自动生成。
2. data-based Transform 对源记录 update/delete 时，仍按派生映射的 `affectedId` 更新/删除；callback 返回的 `id` 不能改写已有行主键。
3. 用预生成 `id` 建立 Relation 后，nested `attributeQuery` / 关系路径查询可用。
4. `StateMachine.computeTarget` 在目标 `id` 等于预生成应用 id 时工作正常。
5. 旧写法（不返回 `id`、无预生成）回归测试全部通过。
6. 文档、recipe、anti-pattern 与运行时行为一致；不再出现「禁止返回 `id`」与「禁止外键属性」夹击且无出路的表述。

## 7. 总结

- **问题**：派生记录身份归框架、Relation 只认框架 `id`、应用又必须预生成跨进程稳定标识——三者未在框架内统一，逼出字符串伪外键或违规塞 `id`。
- **最终方案**：`id` 作为唯一应用身份，创建可选、更新不可变；跨实体只走 Relation；精确化 Transform 的 id 规则。
- **兼容**：超集发布，旧应用可不动；新代码直接按新教义写；旧数据折叠主键由应用分批迁移。可选 `identity` 仅作存量双身份的过渡桥。
