# 深度反思：为什么已有的测试系统没有检测出 r26 的这些问题

- 日期：2026-07-13
- 关联：`deep-review-2026-07-13-r26.md`
- 性质：测试与修复体系的结构性复盘。覆盖本轮全部五个问题（F-1 / I-1 / I-2 / I-3 / I-4）。

---

## 〇、先给结论：五个问题、三类结构性失明

| 类 | 结构性失明 | 本轮案例 |
|----|-----------|---------|
| A | **同函数内兄弟分支漏网**：正确实现就在旁边，审查/修复只覆盖了「当前注视的」分支 | F-1（flashOut create-steal delete） |
| B | **断言存在性而非形状**：绿灯证明「有事件」，不证明「事件说了什么」 | F-1（combinedRecordEvents / 拓扑矩阵 / 预言机） |
| C | **声明的约束未被执行** / **对称面未扫**：static.public 与 open 幂等的对偶面 | I-2、I-3、I-4；I-1 是产品决策拖延 |

F-1 与 r25 F-1 几乎同构——都是「契约的第二消费方」——但这次第二消费方不是另一条轨（base vs 视图），而是**同一函数内另一条 if 分支**。

---

## 一、逐案显微镜

### 1.1 F-1：正确代码在同一函数 30 行外

| 同函数内路径 | 端点？ | 何时修的 |
|-------------|--------|---------|
| flashOut **create** 事件 | ✓ | r17（注释明确写了契约） |
| flashOut **merged-replace delete** | ✓ | 更早 |
| DeletionExecutor 规范形 | ✓ | 基线 |
| oneToOne update-steal delete 测试 | ✓ | 覆盖了 update 路径 |
| **flashOut create-steal delete** | ✗ | **本轮** |

四道防线：

1. **事件完备性预言机**检查「有没有 delete」，不检查端点键是否存在——与 r25 F-1「不检查 create payload 字段」同一缺口维度（payload 内容完备性）。r25 为 create 加了第 5 条规则，**delete 端点完备性仍不在规则内**。
2. **`combinedRecordEvents.spec.ts`** 断言 `linkDeletes.length === 1`，不看 `record.source`。
3. **`oneToOne.spec.ts`「delete event should have both source and target」**测的是 `DeletionExecutor` / update 路径，**不是 create-steal**——夹具偏置到了「正确的兄弟路径」。
4. **登记册「视图 × 写形态」**详细枚举了抢夺入口与 create payload 双轨，但 delete 端点契约从未被写成多产生点声明面——create 契约的升格（r25）没有触发「delete 是否同构」的交叉扫描。

### 1.2 I-1：产品决策拖延变成「已记录 = 已处理」

r25 明确把 Activity 状态泄漏记为「建议下轮决策」。本轮直接做了最小正确修复（guard 先于 state）。教训：权限面项不宜多轮空转——要么修，要么明确「by design 接受泄漏」并从清单移除。

### 1.3 I-2 / I-3：createClass 债的按轮产出

与 r25 I-4（merged 守卫未接线）同族。`static.public.constraints` / `options` 继续充当虚假置信度来源：测试可以绿着测谓词函数，机器却从未执行。本轮继续手写接线——**统一 createClass 校验每拖一轮就多两处手写守卫**。

### 1.4 I-4：open 幂等的对称面漏扫

r22–r25 把 open/openForSchemaRead 扫了三轮，**从未把 close 写进同一张矩阵**。r25 复盘规则 #5「修 API 的一侧时把另一侧写进同一张矩阵」说的就是这件事——本轮是该规则的又一次实例化。

---

## 二、公共形状：为什么「第二消费方」在同函数内仍漏

r25 的机制回应（汇合点 / 预言机 / 带运行时证据的 sweep）对**跨文件、跨轨**的分叉有效；对**同函数内 if 分支**，汇合点更难自然出现——每条分支手写 push，正确模式靠复制粘贴传播。

有效防御：

1. **把契约写成「所有产生点」清单**（登记册升格：delete 端点 = 多产生点声明面）；
2. **预言机查形状**（建议下轮：delete 事件若 `recordName` 是 relation，必须有 `source.id` 与 `target.id`）；
3. **修复时刻强制 diff 同函数兄弟**：改/审一条 push 时，grep 同文件所有 `type: 'delete'`。

---

## 三、本轮已落地的机制改造

1. flashOut create-steal delete 与视图 settle **共用完整端点快照**（同函数内不再分叉）。
2. 登记册：「视图 × 写形态」行补 delete 端点多产生点契约；「驱动差异轴」补 close 幂等。
3. 回归同时覆盖 storage 形状 + runtime 事件轨消费（防止「只测存在」回归）。

---

## 四、仍然开放的结构性缺口

1. **事件完备性预言机缺少 delete 端点规则**（与 r25 create payload 规则对称）。
2. **createClass 统一校验**（十一轮）。
3. **迁移 operationKey 去 index**。
4. **「同函数兄弟分支」尚未成为强制清单项**——本复盘提出，待流程化。

---

## 五、给后续轮次的操作性规则（增补）

1. **修/审任何手工 `events.push` 时，枚举同文件全部同 type 的 push 并逐一对照契约**（F-1 教训）。
2. **create 契约升格后，强制问 delete/update 是否同构**（对称面扫描）。
3. **权限面「记录待决策」项不得超过一轮空转**——下轮必须二选一：修或标 by-design 关闭（I-1 教训）。
