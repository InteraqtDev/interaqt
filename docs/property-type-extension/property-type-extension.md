status: 已完成
design-round: 2/15
implementation-round: 9/25
current-milestone: M-05
current-milestone-reopens: 0
convergence-mode: normal
next-action: 无

# 可扩展属性类型注册与原生列契约 — 设计

## 1. 背景和现状

### 1.1 任务要回答的张力

应用希望在 **Entity/Relation 的 `Property`** 上声明数据库插件列（典型：PostgreSQL + pgvector 的逻辑名 `vector`），同时框架必须保持：

- 内置语义类型封闭与拼写错误 fail-fast；
- 禁止“任意字符串 `type` 原样进 DDL”的静默旁路；
- 不在 core 内置全部数据库插件；
- 依赖方向 `builtins → runtime → storage → core` 不被扩展机制打穿。

`Dictionary` 与 `Property` 共享逻辑 `type` 白名单字符串空间，但 **物理存储拓扑完全不同**（见 F17）：Dictionary 值落在固定 JSON KV 表，不是按声明生成的原生列。扩展模型的物理能力（DDL / codec / Match）只对 Property 列路径成立；不得把 Dictionary 写成同构插件列面。

r23 起声明期白名单关闭了未知 `type` 的旁路；驱动层 `mapToDBFieldType` 的 `else { return type }` 仍在，但对用户声明已不可达。仓库内没有一等扩展注册表。

### 1.2 源码事实（求证）

| # | 事实 | 证据 |
|---|------|------|
| F1 | 内置逻辑类型封闭在 `ALLOWED_PROPERTY_TYPES` / `PropertyTypes`：`string`、`number`、`boolean`、`timestamp`、`object`、`id`，及别名 `json` | `src/core/RealDictionary.ts` |
| F2 | `Property.create` / `Dictionary.create` 对不在白名单的 `type` 抛 `unsupported type "..."`，错误只列出内置 allowed 列表，**不**提示扩展注册路径。二者共用同一字符串白名单，但后续读者不同（见 F17） | `src/core/Property.ts`、`src/core/RealDictionary.ts`；回归 `tests/runtime/review-fixes-2026-07-12-r23.spec.ts` |
| F3 | r23 I-3 引入该白名单：未知串此前静默落到 `mapToDBFieldType` fallback（原样当 SQL 类型），SQLite 亲和放过、PG/MySQL 在 setup 才炸 | `agentspace/output/deep-review-2026-07-12-r23.md` I-3；`Property.ts` 注释 |
| F4 | 四驱动 `mapToDBFieldType` 对未识别逻辑类型仍 `else { return type }` | `src/drivers/{PostgreSQL,PGLite,SQLite,Mysql}.ts` |
| F5 | `Setup.createRecord` / filtered relation / link 端点等路径用 `database.mapToDBFieldType(prop.type, prop.collection)` 写入 `ValueAttribute.fieldType`，再进 DDL。**仅遍历 Entity/Relation 的 `properties`** | `src/storage/erstorage/Setup.ts` |
| F6 | 写路径值准备：`SQLBuilder.prepareFieldValue` 仅特殊处理 `fieldType===json`（规范序列化）与 `valueType===timestamp`（epoch-ms → 方言绑定） | `src/storage/erstorage/SQLBuilder.ts` |
| F7 | 读路径归一化：`QueryExecutor` 按语义 `type`/`collection` 处理 json / boolean / timestamp；其余原样 | `src/storage/erstorage/QueryExecutor.ts` |
| F8 | Match：`MatchExp.getFinalFieldValue` 对 json 走方言 `parseMatchExpression`；timestamp 用语义 `valueType`；**无**通用扩展算子钩子 | `src/storage/erstorage/MatchExp.ts`；各驱动 `parseMatchExpression` |
| F9 | Migration 声明面签名含 `property.type` / `dictionary.type` / `collection` / `computed`，**不含** `args`；物理面对比 `attr.type` + `attr.fieldType` + `collection`（来自 storage schema）。dictionary 进入逻辑 manifest，**不**产生独立插件 `fieldType` 列 | `src/runtime/migration.ts` `createMigrationManifest`、blocking schema diff |
| F10 | `Property` **没有** `args` 字段；`Dictionary` 有 `args?: object` 但 **Setup / `ValueAttribute` 不读取** Dictionary 声明（Dictionary 根本不进入属性列编译器）。F10 的“不读 args”对 Property 列编译成立；对 Dictionary 是更强事实：无列编译路径 | 探针 E7/E8；`EntityToTableMap.ValueAttribute` 无 args；F17 |
| F11 | `PayloadItem.allowedTypes` 是另一套白名单：`string\|number\|boolean\|object\|Entity\|Relation`，语义是 **payload 运行时校验标签**，从不进入 DDL / `mapToDBFieldType` | `src/builtins/interaction/PayloadItem.ts`；r21 回归拒绝 `json`/`timestamp` |
| F12 | 仓库内 **不存在** `definePropertyType` / `PropertyTypeRegistry` / 公开 column-type 扩展点 | 全库检索为空 |
| F13 | r25：驱动必须识别**自己** `mapToDBFieldType` 产出的 json `fieldType` 形态；fieldType 字符串进入 migration `modelHash`，改内置映射会触发存量 re-baseline | `agentspace/output/deep-review-2026-07-12-r25.md`；`tests/storage/driverDialectConsistency.spec.ts` |
| F14 | 公开包导出：`interaqt` 聚合 core/runtime/storage/builtins；驱动在 `interaqt/drivers` | `src/index.ts`、`package.json` exports |
| F15 | `Database.mapToDBFieldType: (type: string, collection?: boolean) => string`——**无 args 参数**；`pk` 是驱动内部伪类型，不是 Property 白名单成员 | `src/runtime/System.ts` |
| F16 | 方言族：`SchemaDialectName = 'postgres' \| 'sqlite' \| 'mysql'`；PG 与 PGLite 同属 postgres 族 | `src/storage/erstorage/SchemaDialect.ts` |
| F17 | **Dictionary 物理拓扑是固定 JSON KV，不是按 `Dictionary.type` 生成的原生列。** `DictionaryEntity`（`_Dictionary_`）仅两列：`key:string`、`value:json`。`MonoSystem.setDictionaryValue` 一律写入 `{ key, value: { raw: value } }`，读回 `record.value?.raw`。该路径 **不**调用 `mapToDBFieldType(dictionary.type)`，**不**经扩展 `toDB`/`fromDB`/`match`。`dictionary.type` 的读者主要是：create 白名单、migration 逻辑 manifest、计算/调度侧声明元数据——不是 Setup DDL | `src/runtime/System.ts` `DictionaryEntity`；`src/runtime/MonoSystem.ts` `dict.get` / `setDictionaryValue`；`migration.ts` dictionaries 分支 |

### 1.3 `type` / `fieldType` 主要读者表

| 阶段 | 读者 | 读什么 | 文件 |
|------|------|--------|------|
| 声明 | `Property.create` | 逻辑 `type` 白名单（本任务扩展后：内置 ∪ 已注册扩展名） | `Property.ts` |
| 声明 | `Dictionary.create` | 逻辑 `type` 白名单（本任务决策后：**仅内置**，见 §3.6） | `RealDictionary.ts` |
| 声明元数据 | `Property.public.type.options` / Dictionary 同构 | 静态 allowed 数组（与手写守卫同源意图） | 同上 |
| 声明 | `PayloadItem.create` | **独立** payload 校验类型白名单 | `PayloadItem.ts` |
| Setup 编译 | `DBSetup.createRecord` 等 | **仅** Entity/Relation `prop.type` → `fieldType` via `mapToDBFieldType` | `Setup.ts` |
| DDL | `buildTables` / `CREATE TABLE` | `column.fieldType` 字符串拼进 SQL | `Setup.ts` |
| 写（列） | `NewRecordData` → `SQLBuilder.prepareFieldValue` | `fieldType` + 语义 `valueType`（= 逻辑 type） | `NewRecordData.ts`、`SQLBuilder.ts` |
| 读（列） | `QueryExecutor` `resolveValueType` | 逻辑 `type`/`collection` → json/boolean/timestamp 归一 | `QueryExecutor.ts` |
| Match（列） | `MatchExp` + `db.parseMatchExpression` | `fieldType` + 语义 `valueType` | `MatchExp.ts`、drivers |
| Dictionary 读写 | `MonoSystem.dict` / `setDictionaryValue` | 固定 `_Dictionary_.value` JSON（`{ raw }`）；**忽略**声明的扩展 storage | `MonoSystem.ts` |
| Migration 逻辑签名 | `createMigrationManifest` records/dictionaries | property/dictionary 的 `type`、`collection`、`computed`（无 args）；dictionary **无**插件 fieldType | `migration.ts` |
| Migration 物理签名 | `storage` schema / blocking diff | 列属性的 `type`、`fieldType`、`collection`、物理 path | `migration.ts`、`System.StorageSchemaMetadata` |
| 测试纪律 | driver dialect self-consistency | 内置 json 的 map↔parse 闭环 | `driverDialectConsistency.spec.ts` |

### 1.4 最小验证实验（设计轮 + 裁决轮复验，revision `de1dece`）

| 实验 | 结果 | 结论 |
|------|------|------|
| E1 `Property.create({ name:'embedding', type:'vector' })` | 抛 `Property "embedding" has unsupported type "vector". Allowed types: string, number, boolean, timestamp, object, id, json.` | 声明期拒绝；文案无扩展指引 |
| E2 `Dictionary.create({ name:'emb', type:'vector' })` | 同构 Dictionary 错误 | Dictionary 与 Property **声明入口**共用白名单；**不等于**共用物理列路径（F17） |
| E3 `strng` / `String` / `vectr` / `JSON` | 均声明期拒绝 | 拼写与大小写错误 fail-fast 仍有效 |
| E4 全部 `ALLOWED_PROPERTY_TYPES` | 均可 create | 内置面未回归 |
| E5 `PayloadItem.create({ type:'vector' })` | 拒，并列出 payload 专用 allowed 列表 | Payload 白名单独立，错误语义不同 |
| E6 四驱动 `mapToDBFieldType('vector')` | 全部返回字面 `'vector'`；`object`→`JSON`；`json` 在 SQLite→`JSON`，其余驱动→小写 `'json'`（r25 已知分裂形态） | **fallback 代码路径仍在**；用户声明不可达 |
| E7 Property 实例键 | 无 `args` | 维度类契约无处附着 |
| E8 Dictionary `args: { dimensions: 3 }` | 实例保留 args | 声明面有字段、**无列编译器消费**（F17） |
| E9/E10 | PayloadItem vs PropertyTypes 列表如上 | 两套类型宇宙 |
| E11（裁决轮）`DictionaryEntity.properties` | 仅 `key:string`、`value:json` | 固定拓扑，与用户 `Dictionary.type` 无关 |
| E12（裁决轮）基线测试 | `review-fixes-2026-07-12-r23` + `driverDialectConsistency` → **16/16 通过** | 与设计基线一致 |
| E13（通过裁决 d2）基线复验 | 同上两套 → **16/16 通过**（revision `de1dece`） | 评审「通过」后独立复验仍绿 |
| E14（通过裁决 d2）tsx 探针 | `vector`/`strng`/`String`/`JSON` 声明拒绝；全部内置 create 成功；Payload 独立文案；四驱动 `vector` 透传、`json` 现网分裂；Property 无 `args` 键；DictionaryEntity=`key:string,value:json` | 与 §1.2–§1.4 / F17 / 评审探针一致 |

**否决“只把 vector 加进白名单”**：即便 Property create 放行，`mapToDBFieldType('vector')` 仅透传字符串；无 codec、无 args→`vector(n)`、无 Match 算子、无“当前 driver 未装扩展”的绑定闸门；SQLite/MySQL 会生成无意义 DDL 或推迟到原生错误。这不能作为最终方案（要求 2、10）。

**否决“Dictionary 与 Property 同权使用 definePropertyType.storage”**：当前源码不支持“注册 type 即把 Dictionary 变成原生列”；若 create 接受扩展名且文档/里程碑暗示绑定/DDL/往返，即声明形同虚设（R1）。

### 1.5 问题是否成立

**成立。** 分解：

1. **真实产品缺口**：Entity/Relation 插件列无法在保持声明严谨的前提下合法使用。
2. **残留危险旁路**：驱动 fallback 对内部/错误路径仍可能“偶然 DDL”；与 r23 教义不一致，应错误化。
3. **读者面宽（Property 列）**：type 不只 create，还进 Setup/写/读/Match/migration；扩展必须在列路径汇合点接入，不能只改白名单。
4. **args 缺口（Property）**：Property 完全没有 args——插件类型参数（维度等）无一等载体。Dictionary 已有未接线的 `args`，但那是 KV 声明元数据，不是列编译输入。
5. **无半成品扩展注册表** 可“接上即用”。
6. **Dictionary 合同必须与拓扑一致**：不得把 JSON KV 全局值写成插件列扩展面（§3.6）。

---

## 2. 目标与非目标

对应 Task 要求编号。

### 2.1 目标

1. **求证入库**：§1 为权威求证（含 F17 Dictionary 拓扑）；实现不得回退到与 E1–E12 / F1–F17 矛盾的假设。（要求 1）
2. **封闭默认 + 显式扩展**：内置白名单保持封闭；未知名 fail-fast；禁止恢复默认透传；禁止仅 hardcode `vector`；**Property** 扩展仅经显式注册生效。（要求 2、10）
3. **一等扩展模型（Property 列）**：逻辑名与物理 DDL/驱动绑定分离；定义含 name、可选 args 契约、按方言族的 storage（DDL/`toDB`/`fromDB`）、可选 Match 算子；缺 storage 不静默降级；默认 opaque；core 不依赖 drivers；API 可供应用或适配包在启动时注册。（要求 3）
4. **生命周期闸门（Property 列）**：create 校验逻辑名（及 args）；setup/绑定当前 driver 校验 storage 可解析；`mapToDBFieldType`（及后继解析入口）对未解析类型抛错。（要求 4）
5. **读写 / Match / migration 合同**：
   - **Property 列**：codec 往返一致；无 codec 时 opaque 合同明确；Match 仅注册算子；migration 签名含 type、args、解析后 fieldType。
   - **Dictionary**：保持 JSON KV 物理路径；逻辑 `type` **仅内置**；migration 可继续记录 dictionary 逻辑 type（及既有字段）；**不**为 dictionary 解析插件 `fieldType`，**不**对 dictionary 值调用扩展 codec/Match。（要求 5，按真实读者拆分）
6. **规范证明**：**针对 Property 列** 的可运行向量类扩展（测试内 mock/最小实现；可选真实 PG）；支持 driver 往返；不支持 driver 绑定失败；负向合同齐全（含 Dictionary 拒绝扩展名）。（要求 6）
7. **教义收敛**：usage/API/CHANGELOG；删除透传技巧；允许破坏性去掉 fallback；写明 Property 扩展 vs Dictionary KV vs PayloadItem 三套合同。（要求 7）
8. **验证纪律**：分层测试 + 方言匹配探针；汇合点修复；首个里程碑打通 Property 最小闭环。（要求 8）

### 2.2 非目标

- 不在 core 内置全部 DB 插件；不做 ANN 调优产品；不把框架改成通用 DDL 生成器。（要求 9）
- 不为 MySQL 伪造 vector 语义。（要求 9）
- 不恢复静默放行；不以“仅 sqlType 字符串透传”作为最终扩展体系。（要求 9、10）
- 不把裸 column override 当作主模型（本设计 **不提供** 默认可用于打穿类型系统的逃生口）。（要求 9）
- 不改造业务应用；不重做 Condition/BT/身份模型。（要求 9）
- **不把 `PayloadItem.type` 纳入同一存储扩展注册表**（见 §3.7）。（要求中的 PayloadItem 论证项）
- **不把 `Dictionary` 改造成按 key 分列的插件列存储，也不在本任务重做 `_Dictionary_` 拓扑**（见 §3.6 决策 A）。若未来产品需要“全局原生列字典”，须另立任务改变物理模型。（要求 3–5 的真实读者约束）

---

## 3. 方案（唯一）

### 3.1 核心语义

```text
逻辑属性类型名（Property.type）
  = 应用在 Entity/Relation 属性上书写的语义名
  ∈ 内置封闭集 ∪ 已 definePropertyType 注册的扩展名
  ≠ 物理 SQL 类型字符串（除非某扩展的 storage.fieldType 恰好相同）

逻辑字典类型名（Dictionary.type）
  = 全局 KV 值的逻辑标签
  ∈ 内置封闭集 only（本任务）
  ≠ 原生列类型；物理上永远是 _Dictionary_.value JSON

args（Property，可选）
  = 该逻辑类型的类型参数（如 vector 维度）
  参与：Property create 校验、DDL 生成、codec 上下文、migration 逻辑签名（property）

物理 fieldType
  = 绑定当前 Database 方言后，由内置 map 或扩展 storage 解析出的 DDL 片段
  仅用于 Entity/Relation 列；进入 Setup 列定义与 migration 物理签名

扩展默认 opaque（Property 列）
  = 无 toDB/fromDB 时，框架不对值做 JSON/时间戳式变换；绑定值原样交给驱动，读回原样（驱动自身反序列化除外）
```

### 3.2 Property vs Dictionary vs PayloadItem — 合同表（唯一决策面）

| 面 | Property（Entity/Relation 列） | Dictionary（全局 KV） | PayloadItem |
|----|-------------------------------|----------------------|-------------|
| **create 逻辑 type** | 内置 ∪ `definePropertyType` 已注册名 | **仅内置**；扩展名拒绝并说明“扩展类型只用于 Property 列” | 独立 payload 白名单；**不**纳入 `definePropertyType` |
| **args** | 扩展可有；内置禁止；经 `validateArgs` | 保留既有可选 `args` 字段（历史/元数据）；**不**接 storage 的 fieldType/codec；内置类型携带无意义 args 的策略与实现期一致化（默认：内置 + args 拒绝，与 Property 对齐） | 无本任务 args 模型 |
| **setup / DDL** | `resolveFieldType` → 列 `fieldType`；缺 dialect storage 失败 | **不**解析 dictionary.type 为列；`_Dictionary_` 仍 `value:json` | 不进 Setup |
| **write** | 扩展 `toDB` 或 opaque；再进驱动绑定 | `setDictionaryValue` → `{ raw: value }` 写入 JSON 列；**不**调扩展 toDB | 运行时校验，不落库类型系统 |
| **read** | 扩展 `fromDB` 或 opaque | `record.value?.raw`；**不**调扩展 fromDB | n/a |
| **Match** | 仅注册算子；未注册算子编译失败（含 `=`/`in` 也不免费） | **不适用**列 Match 扩展（不是按 dictionary.type 查的列） | n/a |
| **migration** | 逻辑签名：type + args；物理：type + fieldType + collection | 逻辑签名：type（+ 本任务若统一写入的 args 序列化，见 §3.5）；**无**插件 fieldType 物理列变更语义 | n/a |

**决策 A（本设计唯一选择）**：扩展物理模型（storage / DDL / codec / Match）**仅**适用于 Entity/Relation 的 `Property`。`Dictionary.create` **拒绝**扩展逻辑名（仅内置类型）。禁止的模糊态：create 接受 `type:'vector'` 且文档/里程碑暗示 Dictionary 与 Property 相同的绑定/DDL/往返。

**不选 B**：不在本任务改变 `_Dictionary_` 拓扑或按 key 分列。  
**不选 C**：不允许“逻辑扩展名 + 暗示原生列”的空洞声明。

### 3.3 分层与 API

依赖方向保持：`builtins → runtime → storage → core`。

| 模块 | 职责 |
|------|------|
| `src/core/propertyTypes.ts`（新） | 内置类型常量；**逻辑**注册表；`isAllowedPropertyType`；`getPropertyTypeDefinition`；`registerPropertyTypeDefinition`（逻辑名 + `validateArgs`）；供 **Property** create 使用；Dictionary create 只咨询内置集（或 `isBuiltinPropertyType`） |
| `src/storage/propertyTypeStorage.ts`（新） | **物理**注册表：`typeName → { [SchemaDialectName]?: PropertyTypeStorage }`；`resolvePropertyTypeStorage(type, dialect)`；`resolveFieldType({ type, collection, args, database })` 汇合点——**仅**列编译调用 |
| `src/storage/definePropertyType.ts`（新）或同文件导出 | **公开** `definePropertyType(def)`：写入逻辑表 + 可选 storage 表；由 `storage` 与包根导出 |
| drivers | 内置 `mapToDBFieldType` **删除**未知透传；未知内置路径抛错；**不**在驱动内解释扩展名（扩展走 storage 注册表） |
| `Setup` / `SQLBuilder` / `QueryExecutor` / `MatchExp` | 经汇合点消费 **Property 列**扩展，不各自实现白名单副本 |
| `migration` | property 签名含 args + 物理 fieldType；dictionary 逻辑签名可含 args 序列化但不引入插件列 fieldType |
| `MonoSystem.dict` | **不改** JSON KV 拓扑；不接扩展 storage |

公开用法（应用或 `@scope/pgvector-interaqt` 适配包）：

```typescript
import { definePropertyType, Property, Entity } from 'interaqt'

definePropertyType({
  name: 'vector',
  validateArgs(args) {
    const d = (args as { dimensions?: unknown } | undefined)?.dimensions
    if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
      throw new Error(`type "vector" requires args.dimensions as a positive integer`)
    }
  },
  storage: {
    postgres: {
      fieldType: ({ args }) => `vector(${(args as { dimensions: number }).dimensions})`,
      toDB: (value) => value,   // 或适配包转为驱动可绑定形态
      fromDB: (value) => value,
      match: {
        // 可选：'<->': (ctx) => ({ fieldValue, fieldParams })
        // 注意：未列出的算子（含 '='）一律不可用
      },
    },
    // 不注册 sqlite/mysql → 在这些方言上 setup 失败
  },
})

// ✅ 插件列：Property
Property.create({
  name: 'embedding',
  type: 'vector',
  args: { dimensions: 1536 },
})

// ❌ Dictionary 不是插件列
// Dictionary.create({ name: 'embedding', type: 'vector', args: { dimensions: 1536 } })
// → 拒绝：扩展类型仅用于 Property；Dictionary 值存储在 _Dictionary_ JSON KV
```

`definePropertyType` 放在 **storage**（可 import core），经 `src/storage/index.ts` 与 `src/index.ts` 导出，这样适配包只依赖 `interaqt` 主入口即可，无需改框架源码。

### 3.4 注册表契约

```typescript
// 逻辑（core）
type PropertyTypeDefinition = {
  name: string
  /** 若提供：Property create 时在类型名合法后同步调用；抛错即拒绝声明 */
  validateArgs?: (args: unknown) => void
}

// 物理（storage）— 仅 Property 列 resolve 使用
type PropertyTypeStorage = {
  /**
   * DDL / migration 用的物理列类型。
   * 函数形态用于 args 相关类型（vector(n)）。
   * collection:true 时扩展必须显式处理或在 validate/resolve 期拒绝——
   * 不得静默变成 JSON（那是内置 object/collection 的语义，不可冒充）。
   */
  fieldType: string | ((ctx: PropertyTypeResolveContext) => string)
  toDB?: (value: unknown, ctx: PropertyTypeResolveContext) => unknown
  fromDB?: (value: unknown, ctx: PropertyTypeResolveContext) => unknown
  match?: Record<string, PropertyTypeMatchCompiler>
}

type PropertyTypeResolveContext = {
  type: string
  args?: object
  collection?: boolean
  /** 属性定位，用于错误信息 */
  recordName?: string
  propertyName?: string
  dialect: SchemaDialectName
}

// 公开合并
type DefinePropertyTypeInput = PropertyTypeDefinition & {
  storage?: Partial<Record<SchemaDialectName, PropertyTypeStorage>>
}
```

规则：

1. **名称**：非空字符串；不得与内置逻辑名冲突（注册时 fail-fast）。`pk` 保持驱动私有，禁止用户注册/声明为 Property type。
2. **重复注册**：同名第二次 `definePropertyType` **拒绝**（显式控制；测试 `beforeEach` 需 reset 测试钩子，见 §3.10）。
3. **storage 键**：使用 `SchemaDialectName`（`postgres` | `sqlite` | `mysql`）。PostgreSQLDB 与 PGLiteDB 均解析为 `postgres` 族（与 `getSchemaDialect` 一致）。不按类名分裂，避免“同一 SQL 族要注册两次”。
4. **缺省 storage 条目**：允许只注册逻辑名 + 部分方言；在未覆盖方言上 **Property setup 失败**，不得 fallback TEXT/JSON/透传。
5. **opaque**：未提供 `toDB`/`fromDB` 时写读原样传递；文档与测试钉死该合同。提供其一则读写对称使用（仅一侧注册视为定义不完整，**resolve 期拒绝**——避免半接线）。
6. **Dictionary 不读取 storage 表**：即使进程内已 `definePropertyType('vector')`，`Dictionary.create({ type:'vector' })` 仍失败（决策 A）。

### 3.5 生命周期闸门

```text
definePropertyType(name, …)
  → 逻辑表 ± 物理表

Property.create({ type, args? })
  → type ∈ 内置 ∪ 逻辑表？
      否 → 错误：列出内置 + 当前已注册扩展名 + “use definePropertyType”
  → 若扩展定义了 validateArgs → 调用（args 可为 undefined）
  → 内置类型：args 必须 undefined/省略（内置无 args 合同；避免无意义附着）
  → 通过则构造实例（Property 新增 args 字段）

Dictionary.create({ type, args? })
  → type ∈ 内置？
      否 → 错误：列出内置；若 type 是已注册扩展名，额外说明
            “extended property types apply only to Entity/Relation Property columns;
             Dictionary values are stored in the shared JSON table _Dictionary_”
      （未注册名仍按未知类型拒绝，文案可指向内置列表；不要求暗示 definePropertyType 可用于 Dictionary）
  → 不调用扩展 storage；不在 create 期要求/检查 dialect storage
  → 内置 + args：与 Property 对齐拒绝无意义 args（实现期统一）

DBSetup / controller.setup（已有 database）— 仅 Entity/Relation value 属性
  → 对每个 value 属性 resolveFieldType(...)
      内置 → database.mapToDBFieldType(type, collection)（仅内置与 pk）
      扩展 → storage[dialect] 存在？
           否 → 错误：类型名、record.property、dialect/driver 提示、
                 “register storage for this dialect / switch driver / use builtin type”
           是 → 计算 fieldType；写入 ValueAttribute（含 args 副本供后续 codec/match）
  → 建表使用解析后的 fieldType
  → Dictionary 声明不进入本循环

mapToDBFieldType(unknown)
  → 抛错（不再 return type）
  → 内置 + pk 以外一律错误；扩展名不应再进入该函数
    （Setup 对扩展走 resolveFieldType，不调用 mapToDBFieldType）
```

**Property create 不要求 storage 已注册**：声明模块可在适配包 import 与 `new PostgreSQLDB` 之前加载。能力闸门在 **setup/绑定**。

**Property create 要求逻辑名已注册**：否则 `vector` 拼写错误与“忘记 import 适配包”在声明期即可发现。适配包必须在任何 `Property.create({ type: 扩展名 })` 之前执行 `definePropertyType`（文档强调 side-effect import 顺序）。

### 3.6 Dictionary 决策（明确，决策 A）

| | Property type | Dictionary type |
|--|---------------|-----------------|
| 用途 | 持久化 **表列** 的逻辑类型 | 全局 KV 值的逻辑标签 |
| 物理 | 每属性一列；`fieldType` 可扩展 | 固定 `_Dictionary_(key, value json)` |
| 扩展 | `definePropertyType` + per-dialect storage | **不纳入物理扩展**；create **仅内置** |
| 读者 | Setup/DDL/写/读/Match/migration 物理+逻辑 | migration 逻辑 manifest、调度/计算元数据、dict.get/set JSON 路径 |

**理由**：

1. 源码拓扑（F17）下，“Dictionary + storage ⇒ 原生列”不可实现，除非另做 schema 重做（非本任务）。
2. 显式控制：合法声明不得暗示不存在的列/codec/Match 行为。
3. Task 规范证明（往返、绑定失败、Match）全部以 **列路径** 为对象；Dictionary 并列会制造假完成。

应用若需持久化向量：在 Entity 上声明扩展 `Property`。全局配置类数据继续用内置 Dictionary type（常用 `object`/`json`/`string`/`number`/`boolean`）。

### 3.7 PayloadItem 决策（明确排除）

| | Property type | PayloadItem type |
|--|---------------|------------------|
| 用途 | 持久化列的逻辑类型 | Interaction payload 运行时校验标签 |
| 读者 | Setup/DDL/写/读/Match/migration | Guard 原始类型检查 |
| 扩展 | 本任务 `definePropertyType` | **不纳入** |

**理由**：PayloadItem 从不产生列；把 `vector` 放进 PayloadItem 只会制造“已校验”假象（无向量校验实现）。应用应在 payload 用 `object`/`string` 传 embedding，并用 Interaction `conditions` 做领域校验；落库列才使用扩展 Property type。

文档必须写明 Property / Dictionary / PayloadItem 三叉分界，避免名称共用导致误用。

### 3.8 读写、Match、Migration 汇合点（Property 列）

#### 写（`SQLBuilder.prepareFieldValue`）

顺序保持显式、可测：

1. thenable 拒绝（现有）；
2. 若属性为**扩展类型**且有 `toDB` → `toDB(value, ctx)`，结果作为绑定参数（**不再**套用 json/timestamp 内置变换）；
3. 否则现有 json / timestamp 内置分支；
4. 否则原样。

扩展类型即使 `fieldType` 字符串碰巧含 `json` 子串，也不得误入内置 json 分支——判定必须以**逻辑 type 是否扩展**（或显式 value kind）为准，不能只靠 `fieldType.toLowerCase()==='json'`。实现时：扩展路径优先于 fieldType 启发式。

Dictionary 写路径不经过本汇合点的扩展分支。

#### 读（`QueryExecutor`）

在现有 json/boolean/timestamp 之前或之中：若逻辑 type 为扩展且有 `fromDB`，则 `fromDB`；否则 opaque。扩展不自动 JSON.parse。

#### Match（`MatchExp.getFinalFieldValue`）

1. 解析 attribute 的逻辑 type / args / fieldType；
2. 若为扩展且 `match[operator]` 存在 → 调用注册编译器；
3. 若为扩展且算子未注册 → **编译期失败**（明确不支持），不得生成错误 SQL、不得静默当 TEXT 比较；
4. **默认不继承 `=` / `in` 等**：扩展类型未在 `match` 中显式注册的算子一律不可用；教义须写明“有列 ≠ 可 Match”；
5. 内置路径不变（json 方言、timestamp 语义等 r25/r26 纪律保留）。

#### Migration

1. **Property 逻辑签名**：manifest 增加稳定序列化的 `args`（`args` 仅在 `!== undefined` 时写入；变更检测用深度稳定 JSON）。除 `createMigrationManifest` 外，**property changed 比较分支**必须同时看 `type`/`collection`/`computed`/**`args`**（实现清单，约 `migration.ts` 属性比较处），避免 modelHash 已变但 change list 无 property changed。
2. **Dictionary 逻辑签名**：继续 `type`/`collection`/`computed`；若 Dictionary 保留 `args` 字段，可一并纳入逻辑签名以检测声明漂移——**不**表示物理列 fieldType。dictionary changed 比较分支同步（约 1662 行一带）。
3. **物理签名**：继续依赖 storage schema 的列 `type` + `fieldType` + `collection`；仅 Property 列。`args` 变化若导致 `fieldType` 变化（`vector(768)`→`vector(1536)`）由物理 diff 拦阻；若实现错误导致 args 变而 fieldType 字符串不变，逻辑签名仍应报 property changed。
4. `ValueAttribute` 增加可选 `args?: object`，Setup 从 **Property** 写入，供 codec 与 schema metadata 导出。

### 3.9 驱动 fallback 错误化

四驱动 `mapToDBFieldType` 的 `else { return type }` 改为抛错，信息包含：未知类型名、提示仅接受内置逻辑类型与内部 `pk`，扩展类型应经 `definePropertyType` + Setup `resolveFieldType`。

**不提供**默认可关闭的“透传逃生口”。高级用户若需全新物理列，必须走扩展注册（可在 storage.fieldType 返回任意 DDL 片段——这是**显式**注册后的行为，不是未知字符串默认透传）。

内置 `json` 在部分驱动仍走 `else` 产出小写 `json`（F6/r25）：错误化 fallback 前必须把 **`json` 显式并入各驱动 `mapToDBFieldType` 的 if/switch 链**，且 **返回值钉死各驱动现网字符串**（不得借“与 object 同列类型”改写为统一大写 `JSON`）：

| 驱动 | `object` 现网 | `json` 现网（须保持） |
|------|---------------|----------------------|
| SQLite | `JSON` | `JSON` |
| PostgreSQL | `JSON` | `json` |
| PGLite | `JSON` | `json` |
| MySQL | `JSON` | `json` |

这是实现 M-01 的必做项，不是行为变更（避免无意义 re-baseline，并保持 r25 方言自洽纪律）。

### 3.10 Property.args

- `PropertyCreateArgs` / 实例增加可选 `args?: object`。
- `toData`/`fromData`/clone/stringify 贯通。
- 内置类型携带 args → create 拒绝。
- 扩展类型 args 仅经该类型 `validateArgs` 解释；框架不通用 schema 引擎。
- Dictionary 的既有 `args` 不接入列 resolve；见 §3.6。

### 3.11 测试可复位性

逻辑/物理注册表为进程级单例（与 Klass `instances` 类似）。提供 **测试专用** `resetPropertyTypeRegistryForTests()`（或挂在已有 test utils），在相关 suite 的 `beforeEach`/`afterEach` 清空扩展注册，避免用例串扰。生产公开文档不鼓励使用 reset。

### 3.12 规范证明形态

| 证明 | 环境 | 内容 |
|------|------|------|
| P-mock 主证明 | 默认 Vitest（SQLite 或 PGLite） | 注册测试类型 `pte_vector`（避免误导为真实 pgvector）：sqlite storage 用 `TEXT` + toDB/fromDB 把 `number[]` ↔ 规范字符串；**Property** create 声明 + setup + create/find 往返 |
| P-neg-storage | 同上 | 仅注册 postgres storage，在 SQLite 上 setup **含该 Property 的 Entity**，断言错误含类型名、属性定位、dialect、行动建议 |
| P-neg-name / args / match | `tests/core` + `tests/storage` | 未注册名、坏 args、未注册算子（含默认无 `=`） |
| P-neg-dictionary | `tests/core` | 已 `definePropertyType('vector'|…)` 后 `Dictionary.create({ type: 扩展名 })` 仍拒绝；文案区分“未知名”与“扩展名不可用于 Dictionary” |
| P-fallback | 直接调四驱动 `mapToDBFieldType('vector')` | 均抛错 |
| P-pg-optional | `INTERAQT_POSTGRES_DATABASE` + 可选探测 `CREATE EXTENSION vector` | 若扩展可用：真实 `vector(n)` **Property** 往返；不可用则 skip，**不得**标里程碑完成若该里程碑唯一证据依赖真实扩展。主里程碑以 P-mock 为准。真 pgvector 仅在实 PG 证明；**不得用 PGLite 冒充**真实扩展可用 |

命名：规范证明可用 `pte_vector` 或文档示例名 `vector`；真实 pgvector 适配示例可放 tests 或 docs 示例，**不**进 core 必装。

### 3.13 文档与破坏性

- usage / API reference：内置列表、`definePropertyType`、绑定失败、opaque、**Property vs Dictionary vs PayloadItem**、Match 算子非默认、import 顺序。
- CHANGELOG：破坏性——未知 `mapToDBFieldType` 透传删除；曾依赖透传的应用必须改注册。
- 明确禁止“任意 type 字符串当 SQL 类型”技巧。
- 明确禁止把 Dictionary 当作插件列 API。
- 临时用 `object`/`json` 存 embedding 仅可作为迁移期应用策略，不作为插件列终态模型。

### 3.14 关键决策摘要

| 决策 | 选择 | 理由 |
|------|------|------|
| 扩展入口 | 显式 `definePropertyType` | 任务方向；显式控制 |
| 逻辑/物理分离 | core 逻辑表 + storage 物理表 | 遵守分层；create 可无 Database |
| 物理适用范围 | **仅 Property 列** | F17；禁止声明形同虚设 |
| Dictionary | 仅内置 type；JSON KV 不变 | 决策 A；不重做拓扑 |
| storage 键 | `SchemaDialectName` | 与现有 dialect 汇合；PG/PGLite 共享 |
| 缺 storage | Property setup fail-fast | 禁止静默降级 |
| 无 codec | opaque 往返 | 任务默认；合同可测 |
| match 未注册 | 编译失败；含 `=` 不免费 | 禁止错误 SQL；教义清晰 |
| fallback | 删除；`json` 显式映射且保持现网字符串 | 要求 4、10；r25 |
| PayloadItem | 排除 | 不同读者宇宙 |
| 逃生口 | 不提供默认透传 | 避免再打穿 |
| 首证 | mock 扩展 Property + 可选真 PG | CI 稳定；真扩展不阻断主路径 |

---

## 4. 里程碑

设计完成时初始里程碑数 **M = 5**，实现预算 **N = 5 × 5 = 25**（由设计通过裁决轮写入 `implementation-round: 0/25`）。

### M-01 — 注册 → Property 声明 → 绑定 → DDL/失败 最小闭环

- **状态**：已完成
- **reopen-count**：1
- **reopen-domains**：{ registration-atomicity: 1 }
- **前置**：无
- **覆盖要求**：1（求证已在设计）、2、3（API 骨架）、4、6（P-neg-storage / P-fallback / P-neg-dictionary / Property 声明放行）、8（首闭环）、10
- **可观察结果**：
  - `definePropertyType` 导出可用；
  - 注册后 **`Property.create`** 接受该 type + args；未注册仍拒绝且文案含扩展指引；
  - **失败的 `definePropertyType` 不得残留逻辑名或物理条目**（all-or-nothing；半侧 codec / 空 fieldType 等校验失败后可立即用完整定义重试同名）；
  - **`Dictionary.create` 对扩展名拒绝**（仅内置）；错误可区分“扩展类型不可用于 Dictionary”；
  - Setup 对 **Entity/Relation 属性**在有 storage 的方言解析 `fieldType` 并建表；无 storage 失败且错误可行动；
  - 四驱动 `mapToDBFieldType` 对未知类型抛错；内置（含 `json` 显式映射且字符串与现网一致）行为保持；
  - `Property.args` 贯通声明与 `ValueAttribute`；
  - `_Dictionary_` 拓扑与 dict JSON KV 路径不变。
- **验收命令**（实现阶段新增）：
  - `npx vitest run tests/core/propertyTypeExtension.spec.ts tests/storage/propertyTypeExtensionBind.spec.ts`
  - 直接断言驱动 fallback 与 Dictionary 负向合同的用例（可并入上者）
  - 必须含：失败 define（半侧 codec / 空 fieldType）后注册表为空 + 同名完整 define 成功
- **最新证据**（implementation-round 2）：
  - D1 修复：`assertPropertyTypeStorageEntries` 在逻辑/物理 commit 之前完整校验 storage；半侧 codec / 空 fieldType 失败时两表均无残留；同名完整 define 可立即成功。
  - 回归：`tests/storage/propertyTypeExtensionBind.spec.ts`「D1: failed define leaves no logical/physical residue; same name retries」钉死表空 + 重试 + Property.create + SQLite setup。
  - 验收：`npx vitest run tests/core/propertyTypeExtension.spec.ts tests/storage/propertyTypeExtensionBind.spec.ts` → **22/22 passed**。
  - 邻近回归：driverDialectConsistency / r23 / simple-refactored / dbSetup / defaultValue / JSONfield → **45/45 passed**。
  - 交审计关闭 M-01。
  - **审计关闭**（additional task 4，implementation-round 2）：验收 22/22 与邻近 45/45 独立复验通过；D1 原复现不再成立；Relation 属性绑定、Dictionary 拓扑、四驱动 json 钉死与 collection 拒绝等对抗探针通过；无新实现缺陷。M-01 → 已完成。

### M-02 — Property 读写 codec 与 opaque 合同

- **状态**：已完成
- **reopen-count**：1
- **reopen-domains**：{ codec-args-lookup: 1 }
- **前置**：M-01
- **覆盖要求**：5（Property 读写）、6（P-mock 往返）
- **可观察结果**：
  - 有 toDB/fromDB 的扩展 **Property**：create/update/find 往返符合注册定义；
  - 无 codec：opaque 往返钉死；半侧 codec 注册被拒绝；
  - 扩展路径不误触发 json/timestamp 内置变换；
  - Dictionary 读写仍为 JSON KV，不因进程内存在扩展 storage 而改变。
- **验收命令**：
  - `npx vitest run tests/storage/propertyTypeExtensionCodec.spec.ts`（名称可调）
- **最新证据**（implementation-round 4 交审）：
  - **D2 修复（codec-args-lookup）**：`FieldAndValue` 携带 `args`（自 `ValueAttribute` 在 `getSameRowFieldAndValue` 三处 value 出射写入）；`buildInsertSQL` / `buildUpdateSQL` / `UpdateExecutor` 透传；`prepareFieldValue` **优先**行元数据 `args`，map lookup 仅回退。合表关系属性嵌套 create/update 不再依赖父实体 recordName 上的逻辑名 lookup。
  - 验收：`tests/storage/propertyTypeExtensionCodec.spec.ts` → **11/11 passed**（含 D2 create 复现 + 合表 update 补钉）。
  - M-01 与邻近：`propertyTypeExtension` core/bind、r23、driverDialectConsistency、sqlBuilder、JSONfield、simple-refactored → **92/92 passed**。
  - 交审计关闭 M-02。
- **审计（additional task 4，implementation-round 3）**：
  - **D2 / codec-args-lookup**：1:1 合表关系属性嵌套 create 时，`buildInsertSQL(parentEntityName)` + `lookupValueAttribute(parent, 'embedding')` 失败，`toDB` 收到 `args: undefined` 崩溃。独立实体列、独立关系表、n:n 关系属性路径不受伤。
  - 失败复现已写入验收：`merged 1:1 relation property create passes args into toDB` → 红。
  - 修正方向：FieldAndValue（或等价）携带 `args`，`prepareFieldValue` 优先用行元数据，禁止仅依赖 insert recordName 上的 map lookup。
  - M-02 待审→开放；reopen-count=1。
- **审计关闭**（additional task 4，implementation-round 4）：
  - 验收 11/11 与邻近 92/92 独立复验通过；D2 原复现（合表 create/update）转绿。
  - 对抗探针通过：n:1 合表关系属性、1:1 从 target 侧嵌套、n:n 独立关系表、isTargetReliance 1:1、合表邻接实体列、defaultValue、null、opaque、半接线拒绝、Dictionary 共存。
  - 无新实现缺陷。M-02 → 已完成。

### M-03 — Property Match 算子扩展

- **状态**：已完成
- **reopen-count**：2
- **reopen-domains**：{ match-resolveCtx-collection: 1, match-builtin-precheck-bypass: 1 }
- **前置**：M-01
- **覆盖要求**：5（Match）
- **可观察结果**：
  - 注册算子可对 **Property 列**编译并在支持方言执行（mock 即可）；
  - 未注册算子（含默认无 `=`）编译期明确失败；
  - 内置 json/timestamp match 回归不坏（既有 dialect 测试仍绿）；
  - match compiler 的 `resolveCtx` 与 codec 路径对称，含 **`collection`**（及既有 args/record/property/dialect）；
  - **不得被内置算子预检（如 JSON-collection `contains` 门禁）在扩展汇合点之前抢先拒绝**——与 builtin 同名的注册算子仍须到达 `applyExtendedPropertyTypeMatch`。
- **验收命令**：
  - `npx vitest run tests/storage/propertyTypeExtensionMatch.spec.ts tests/storage/driverDialectConsistency.spec.ts`
- **最新证据**（implementation-round 7 + 审计关闭）：
  - **D4 修复成立**：`buildFieldMatchExpression` 对扩展逻辑 type 跳过 builtin JSON-collection `contains` 门禁；注册/未注册均达 `applyExtendedPropertyTypeMatch`。
  - 独立复验验收（钉入 D4b 后）：Match+dialect **18/18 passed**。
  - 邻近 + r7 contains：**81/81**（含 codec/bind/core/sqlBuilder/JSONfield）与 r7 **6/6** 绿。
  - 对抗：unregistered contains 扩展错误文案、collection:true 注册 contains、`CONTAINS` 大小写、fieldType JSON 形扩展 opaque、is null/between 无新 precheck、builtin object 门禁保持——全部通过。
  - 验证缺口加强（不计 reopen）：验收钉 **D4b**（未注册 contains 必须来自扩展路径，不得写 collection gate）。
  - 历史：k5 D3 reopen；k6 修 D3；k6 审计 D4 reopen；k7 修 D4；k7 审计关闭 M-03。

### M-04 — Migration 签名与变更识别

- **状态**：已完成
- **reopen-count**：0
- **reopen-domains**：∅
- **前置**：M-01
- **覆盖要求**：5（migration）
- **可观察结果**：
  - property manifest 逻辑签名含 type + args；
  - property args 或 fieldType 变化被识别为 property/storage 变更（非静默漂移）；
  - dictionary 逻辑 type（及若纳入的 args）变更可识别；**不**要求 dictionary 插件 fieldType；
  - 同名同契约无伪变更。
- **验收命令**：
  - `npx vitest run tests/runtime/propertyTypeExtensionMigration.spec.ts`（或并入既有 migration 套件的专用 describe）
- **最新证据**（implementation-round 8 交审）：
  - `MigrationManifest` property/dictionary 条目增加可选 `args`（仅 `!== undefined` 时写入）；`createMigrationManifest` 经 `migrationDeclarationArgs` 贯通 Entity/Relation 属性与 Dictionary。
  - `buildMigrationDiff` property/dictionary changed 谓词同步比较 `args`（`isEqualValue` / `stableStringify` 深度稳定）；reason 文案含 args。
  - 物理 fieldType 变更继续由既有 storage blocking（`type`/`fieldType`/`collection`）拦截；逻辑 args 变而 fieldType 字符串不变时仍报 property changed（无伪静默）。
  - 验收：`tests/runtime/propertyTypeExtensionMigration.spec.ts` → **6/6 passed**（manifest 含 args、同契约 hash 稳定/无 property-changed、args+fieldType 变更、args-only 变更、dictionary type、dictionary args）。
  - 邻近：extension core/bind/codec/match + dialect + r23 → **65/65**；`tests/runtime/migration.spec.ts` → **90/90**。
  - 交审计关闭 M-04。
- **审计关闭**（additional task 4，implementation-round 8）：
  - 独立复验验收 6/6 与邻近 155/155 通过。
  - 源码合同：Entity/Relation/Dictionary 逻辑 args、changed 双点、`stableStringify` 深度比较、物理 blocking 均成立。
  - 对抗探针 A1–A8 通过（relation、键序、嵌套、type 改名、args 在场/缺席、`{}`、collection）。
  - 验证缺口（不计 reopen）：验收原缺 relation 属性兄弟路径钉；审计永久加入后 **7/7** 绿。
  - 无实现缺陷。M-04 → 已完成。

### M-05 — 公开教义、导出与破坏性说明

- **状态**：已完成
- **reopen-count**：0
- **reopen-domains**：∅
- **前置**：M-01..M-04 行为已稳定（文档可与最后实现轮并行，但验收依赖 API 已定）
- **覆盖要求**：7、8（check/导出）、Dictionary/PayloadItem 文档化
- **可观察结果**：
  - usage/API/CHANGELOG 已更新；透传技巧删除/禁止；
  - Property 扩展 vs Dictionary KV vs PayloadItem 写清；
  - Match 算子非默认继承写清；
  - `npm run check` 通过；公开导出类型完整。
- **验收命令**：
  - `npm run check`
  - `npx vitest run tests/core/propertyTypeExtensionPublicSurface.spec.ts`
- **最新证据**（k9 + 审计 k9）：
  - `npm run check` → exit 0（顺带修复 `propertyTypeExtensionCodec.spec.ts` 中 `db.query` 结果的 TS `unknown` 标注，使 check 绿）。
  - `npx vitest run tests/core/propertyTypeExtensionPublicSurface.spec.ts` → 2/2 通过（公开导出 + 文档合同只读断言）。
  - 文档更新：`02-define-entities-properties.md`（builtin 表 + `definePropertyType` + 三叉合同）、`11-global-dictionaries.md`（Decision A / 无插件列 / 禁 builtin args）、`07-payload-parameters.md`（独立白名单）、`12-data-querying.md`（扩展 Match 非默认）、`14-api-reference.md` + generator `api-reference.md`（Property/Dictionary/`definePropertyType`）、`18-api-exports-reference.md`、`19-common-anti-patterns.md`、`src/storage/USAGE_GUIDE.md`、`CHANGELOG.md` Unreleased（Features + Breaking `mapToDBFieldType` + Docs）。
  - **审计关闭**（additional task 4，implementation-round 9）：独立复验 check + 2/2；邻近 M-01..M-05 / r23 **68/68**；最终核验 M-01..M-05 + r23/migration/simple-refactored **全部绿**。验证缺口：将公开面文档断言从拼接语料改为 per-file 合同钉后 2/2 仍绿。无实现缺陷。M-05 → 已完成；任务 `status: 已完成`。

---

## 5. 风险与验证安排

| 风险 | 阶段 | 缓解 |
|------|------|------|
| 去掉 fallback 时漏掉内置 `json` 显式映射或改写现网字符串导致回归 | 设计已标明；实现 M-01 必测 | 四驱动 map 用例钉死上表字符串 + 既有 r23/r25 测试 |
| fieldType 字符串变更触发全量 migration re-baseline | 实现 | 内置映射保持字符串不变；仅扩展新增路径 |
| create 与 import 顺序导致“已写 Property 才注册” | 文档 + 错误信息强调 | 规范证明按正确顺序；错误指向 definePropertyType |
| Match 扩展与方言 SQL 注入 | 实现 | 注册编译器必须走 placeholder API（与 MatchExp 现有 p() 一致）；评审检查 |
| 注册表进程污染测试 | 实现 | reset 钩子 + suite 隔离 |
| 真实 pgvector 环境不可用 | 设计 | 主证明用 mock；真 PG 可选 skip；不用 PGLite 冒充 |
| `Property.public.options` 静态数组与动态扩展不一致 | 实现 | create 手写守卫为执行面；options 保持 builtins 并注释扩展走 registry |
| 实现者把 Dictionary 误接 storage | 设计合同表 + M-01 负向测试 P-neg-dictionary | 审计对照 §3.2 |
| migration change 谓词漏改 | 实现清单 | manifest 与比较分支同时改 |

设计期必须验证的风险：§1 求证与 E1–E12（已完成）。其余在实现环境验证。

---

## 6. 基线

| 项 | 值 |
|----|-----|
| Git revision | `de1dece`（`chore(release): v4.7.0`） |
| 工作树 | 仅未跟踪 `docs/property-type-extension/`（本任务） |
| 相关已有测试 | `tests/runtime/review-fixes-2026-07-12-r23.spec.ts`：Property/Dictionary 未知 type 拒绝 — **通过**（设计轮、修订裁决、通过裁决 d2 均实测） |
| | `tests/storage/driverDialectConsistency.spec.ts`：8 tests — **通过** |
| 全量 `npm test` | 设计/裁决轮未跑全量（不改生产代码）；实现轮按里程碑跑相关子集，合并前按需扩大 |
| 真实 PostgreSQL | 未作为阻塞；实现可选 P-pg 需 `INTERAQT_POSTGRES_DATABASE` |

---

## 7. 实现指引（非第二方案）

实现轮应优先改动的汇合点清单（修一类）：

1. `RealDictionary.ts` / 新 `propertyTypes.ts` — 内置集 + 逻辑注册；**Property** create 走 `isAllowedPropertyType`（内置∪扩展）；**Dictionary** create 走 **仅内置** + 扩展名专用错误文案  
2. `Property.ts` — args + 守卫改走注册表  
3. `definePropertyType` + `propertyTypeStorage.ts` — 物理注册与 `resolveFieldType`（列专用）  
4. `Setup.ts` — 全部 **属性列** `mapToDBFieldType(prop.type…)` 调用点改为 resolve（含 relation 属性、value attribute 回填）；**不要**为 Dictionary 声明增加列 resolve  
5. 四驱动 `mapToDBFieldType` — 显式 `json`（保持现网字符串）+ 删除 fallback  
6. `SQLBuilder.prepareFieldValue` / `QueryExecutor` / `MatchExp` — Property 扩展分支  
7. `migration.ts` — property（及可选 dictionary）args 进入逻辑签名；**同步** changed 比较谓词  
8. `EntityToTableMap.ValueAttribute` — `args?`  
9. 导出与文档（三叉合同）  
10. **不改** `DictionaryEntity` 拓扑与 `MonoSystem.setDictionaryValue` JSON KV 契约（除非未来另立任务）

`PayloadItem` **不改**白名单集合（除非文档交叉链接）。
