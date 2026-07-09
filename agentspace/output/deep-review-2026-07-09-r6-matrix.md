# 组合空间矩阵化探索报告（2026-07-09 第六轮）

- 日期：2026-07-09
- 基线：`cursor/deep-code-review-r5-06e2`（r5 报告之后，代码与 `main` @ `1f848596` 一致）
- 方法：**不变式预言机（oracle）驱动的组合矩阵**——不再逐例人工写期望值，而是用两条自校验不变式让每个格子的断言零成本：
  1. **增量一致性**：任何变更之后，增量维护的聚合值 == 从 storage 查询全量重算的值（JS ground truth）；
  2. **create/update 对偶性**：通过 update 到达的状态 == 直接 create 声明出的同一状态。
- 载体：`tests/runtime/aggregationConsistencyMatrix.spec.ts`（已提交为常驻回归设施，见「机制」一节）
- 一次运行覆盖：**7 种数据源形态 × 7 种聚合 × 15 种变更操作 + 3 种关系类型 × 4 种载荷形态 × create/update 两路** ≈ 700+ 个断言点

---

## 一、回答「能否一次性找到所有类似问题」

**对「聚合增量一致性」和「create/update 对偶性」这两族问题：能，本轮已做到全矩阵覆盖**。一次运行给出完整的破损清单（35 个破损格子 / 144 次不一致事件），其中包含 **3 个 r5 没有发现的新致命缺陷**。

但要明确边界：矩阵方法只对「**有自校验预言机的问题族**」有效。五轮 review 的致命 bug 分四类，本轮矩阵覆盖了前两类：

| 问题族 | 预言机 | 本轮状态 |
|--------|--------|---------|
| 聚合增量一致性 | 增量值 == 全量重算 | ✅ 全矩阵覆盖 |
| 写路径语义对偶 | update 终态 == create 终态 | ✅ 全矩阵覆盖（n:n / 1:1 / 1:n × 4 种载荷形态） |
| 「声明被接受但无实现」（dataPolicy.attributeQuery、getValue、死类型） | 无通用预言机，需逐 API 对账 | ❌ 需要静态手段（Klass 未知参数 fail-fast + public 字段消费审计） |
| 流程型（Activity 图形态、序列化 round-trip、打包、迁移） | 各自需要专用 harness | ❌ 各需独立矩阵（round-trip 等价性是现成预言机，可仿此模式扩展） |

---

## 二、矩阵结果全景

运行输出：35 个破损格子 / 144 次不一致事件（完整输出见测试运行日志）。按根因聚类为 **4 个缺陷家族**，其中 2 个是 r5 已知问题的完整边界测绘，**3 个是新发现**（家族 3、4 内的三种崩溃）。

### 家族 1：filtered 源上的聚合对成员字段更新失明（r5 F-1 的完整测绘，25 个格子）

r5 只复现了 global Summation / Count+callback 两个点。矩阵证明**整个家族全灭**：

| 源形态 \ 聚合 | countCb | sum | avg | weighted | every | any |
|---|---|---|---|---|---|---|
| filtered entity（普通谓词） | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| filtered entity（computed 谓词） | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 嵌套 filtered（filtered 上再 filtered） | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| filtered relation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| property 宿主 × filtered relation × 链接字段 | — | ❌（`prop/sumLinkF`） | — | — | — | — |

- 对照组全部健康：非 filtered 的 entity/relation 源 × 全部 7 种聚合、纯 membership 驱动的 `count`（无字段读取）、property 宿主 × 非 filtered relation（含链接字段与 target 字段）。
- 失明的精确形态：只有「成员**留在集合内**的字段更新」丢失；create/enter/exit/delete/级联删除全部正确（membership 事件驱动）。`every`/`any` 需要纯字段更新翻转结果才能暴露（矩阵的 s14/s15 步骤专门构造了这个形态）。
- 根因（r5 已定位）：`ComputationSourceMap.ts` L322–331 把 update 监听注册在 filtered 视图名上，而 storage 的 update 事件用 base 名。**一处修复应清空全部 25 个格子**，矩阵将直接验证这一点。

### 家族 2：update 丢弃 `&` 关系属性（r5 F-3 的完整测绘 + 波及 1:n）

| 格子 | 现象 |
|------|------|
| `parity/n:n/ref+&` | create 得 `role:'lead'`，update 得 `role:null` |
| `parity/n:n/nested+&` | 同上 |
| `parity/1:n/nested+&` | create 得 `note:'n2'`，update 得 `note:null` |

根因同 r5 F-3（`UpdateExecutor.handleUpdateReliance` L219 不传 linkRecordData）。

### 家族 3（**新发现**）：1:1 关系的 `&` 载荷在 create/update 双路**全部崩溃**

```
storage.create('User', { profile: { id: p.id, '&': { since: '2020' } } })
→ TypeError: Converting circular structure to JSON
   at CreationExecutor.preprocessSameRowData (CreationExecutor.ts:255)
```

- 位置：`CreationExecutor.ts` L232–236 构造 link 事件记录时把宿主与关联记录互相引用（`linkRecord.source`/`linkRecord.target` 与 `&` 数据形成环），L255 的**日志字符串模板**对含环数据 `JSON.stringify` 直接抛 TypeError。
- 影响：1:1 + `&` 关系属性（如 `profile` 关系上的 `since`）在 **create 和 update 两路都不可用**——比家族 2 更严重（不是丢数据而是硬崩），且崩溃点是日志插值，错误信息与用户写法完全无关。nested / ref 两种形态同崩。现有 `relationAttributes.spec.ts` 只测了 n:n 和 1:n（从 target 侧），1:1 + `&` 零覆盖。
- 复现格子：`parity/1:1/ref+&/{create,update}`、`parity/1:1/nested+&/{create,update}`（4 个）。

### 家族 4（**新发现**）：1:n 关系从 source 侧（拥有多端的一侧）的两种崩溃

**4a. `ref+&` 形态 create 崩溃：**

```
storage.create('User', { orders: [{ id: o.id, '&': { note: 'n' } }] })
→ Error: entity undefined not found
   at EntityToTableMap.groupAttributes (EntityToTableMap.ts:433)
   at CreationExecutor.handleCreationReliance (CreationExecutor.ts:315)
```

对照：同一关系 `nested+&`（新建记录 + `&`）create 正常、`ref` 无 `&` 正常——只有「引用已有记录 + `&`」这一组合崩，说明 `handleCreationReliance` L315 构造 link 的 NewRecordData 时 recordName 传了 undefined。

**4b. update 抢夺已链接目标时崩溃（与 `&` 无关）：**

```
// order 已链接到 owner，把它 update 到另一个 user：
storage.update('User', matchU2, { orders: [{ id: takenOrder.id }] })
→ error: column "v7o_buy_…" specified more than once
```

隔离实验：链接**未被占用**的目标 → 正常；**幂等重连**（目标已链接到自己）→ 正常；**抢夺**（目标已链接到别人）→ SQL 列重复崩溃。1:n 的「转移所有权」是完全常规的业务操作（订单转移、任务改派），目前不可用。复现格子：`parity/1:n/ref/update`、`parity/1:n/ref+&/update`。

---

## 三、本轮矩阵确认健康的区域（对照组价值）

| 区域 | 结论 |
|------|------|
| 非 filtered 源 × 全部 7 种聚合 × 全部 15 种变更（含同时改字段+退出、级联删除端点、边界值 0/负数） | 全部一致 ✅ |
| filtered 源的 membership 驱动路径（create 命中/不命中、enter、exit、delete、级联） | 全部一致 ✅（r3/r4 修复扎实） |
| property 宿主 × 非 filtered relation（count / sum 链接字段 / sum target 字段 / every / any，含 target 实体字段更新触发） | 全部一致 ✅ |
| 纯 membership Count over filtered（无字段读取） | 全部一致 ✅（解释了为何既有矩阵测试没发现家族 1） |
| n:n / 1:n 的 `ref`、`nested+&` create 路；1:1 的无 `&` 全路径；relation 记录直接 update `&` 字段 | 对偶性成立 ✅ |

---

## 四、机制沉淀：矩阵作为常驻回归设施

`tests/runtime/aggregationConsistencyMatrix.spec.ts` 已提交，设计为**自带缺陷清单的守护测试**：

- 最后一个用例把「实际破损格子集合」与 `KNOWN_BROKEN_CELLS`（35 项，每项对应本报告的一个已确认缺陷）做**双向 diff**：
  - 出现**新格子** → 回归，测试失败并点名；
  - 已知格子**消失** → 说明修复生效，测试失败并提示从清单移除——修复被永久锁定。
- 这样矩阵在 CI 中保持绿色，同时把「已知债务」显式化为代码内清单，修复进度可直接度量（清单长度单调递减）。

### 扩展路线（按预言机可得性排序）

1. **序列化 round-trip 矩阵**：`parse(stringify(x)) ≍ x` 是现成预言机，可对全部 Klass × 嵌套形态程序化生成（r4 F-2 一族的根治性覆盖）。
2. **StateMachine 触发矩阵**：trigger 形态（recordName × type × keys × record pattern）× 宿主（global/property/relation）——预言机是「事件序列重放后的期望终态」，半自动。
3. **「声明即实现」静态审计**：Klass 工厂拒绝未知 create 参数 + 对每个 `static public` 字段做消费点 grep 审计——这覆盖矩阵方法够不到的第三类问题族。

---

## 五、缺陷清单增量（相对 r5）

| 编号 | 级别 | 内容 | 状态 |
|------|------|------|------|
| r6-F1 | 致命（已复现） | 1:1 + `&` 载荷 create/update 双路崩溃（日志插值 `JSON.stringify` 环引用） | **新增** |
| r6-F2 | 致命（已复现） | 1:n source 侧 `ref+&` create 崩溃（`entity undefined not found`） | **新增** |
| r6-F3 | 致命（已复现） | 1:n update 抢夺已链接目标崩溃（SQL 列重复） | **新增** |
| r5-F1 完整边界 | 致命 | filtered 聚合失明：25 个格子的完整测绘（r5 只复现 2 个点） | 边界扩大 |
| r5-F3 完整边界 | 致命 | `&` 丢失波及 1:n nested 形态 | 边界扩大 |

修复优先级建议：r5 F-1（一处修复清 25 格）> r6-F1/F2（`&` 在 1:1/1:n 的崩溃，与 r5 F-3 同属「link 数据管线」应一并修）> r6-F3（1:n 所有权转移）。全部修复后 `KNOWN_BROKEN_CELLS` 应归零。
