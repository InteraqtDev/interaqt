# Interaqt 1.5.6 Migration 阻塞问题记录

## 背景

目标是在 `medeo-lite` 中把部分已有手写写入的业务数据，迁移为 interaqt `interaction + computation` 控制，并验证迁移流程可以完全通过命令在本地和线上执行。

本次验证遵循 `medeo-lite/skill/data-migration.md` 的流程：

```bash
npm run dev:diff:main
npm run dev:approve-diff:main -- migrations/diff/<timestamp>-main.json
npm run dev:migrate:main -- migrations/current-main.json
```

同时按要求尝试升级 `interaqt` 到 `1.5.6`，因为 1.5.6 文档提供了 `computation-takeover`，用于支持已有 fact entity/property 转为 computation 控制。

## 目标迁移内容

目标业务变更是让 `TodoItem` 从直接 `system.storage.create/update` 写入，改为通过 interaqt event source 驱动：

- `TodoItem` entity 由 `WriteTodoItem` 创建。
- `TodoItem.content/status/priority/updatedAt` 由 `StateMachine` computation 更新。
- 已有 `TodoItem` fact 数据需要通过 1.5.6 的 `computation-takeover` 机制完成接管。

本地数据库中，本次 takeover 涉及：

- `entity:TodoItem` existing count: `74`
- `property:TodoItem.content` existing/host count: `74 / 74`
- `property:TodoItem.status` existing/host count: `74 / 74`
- `property:TodoItem.priority` existing/host count: `74 / 74`
- `property:TodoItem.updatedAt` existing/host count: `74 / 74`

## 已验证的 1.5.6 能力

升级到 `interaqt@1.5.6` 后，`generateMigrationDiff()` 确实能生成 `computation-takeover` review items。

示例数据：

```json
{
  "dataContext": "entity:TodoItem",
  "computationId": "computation:entity:TodoItem:ia",
  "targetType": "entity",
  "previousAuthority": "fact",
  "nextAuthority": "computation",
  "oldDataStrategy": "discard-and-rebuild",
  "expectedExistingCount": 74,
  "destructiveScopeRef": "entity:TodoItem:TodoItem"
}
```

这说明 1.5.6 的方向是对的，核心阻塞不是缺少 takeover review item。

## 阻塞点 1：Computation Identity 在 1.5.4 -> 1.5.6 之间不兼容

升级到 `interaqt@1.5.6` 后，即使业务 computation 函数没有变化，大量 computation id 从旧 manifest 中的短类型名变成新类型名：

- `Gr` -> `ia`
- `Cr` -> `Lr`
- `Vr` -> `Jr`
- `Zr` -> `ca`
- `oa` -> `ya`

例子：

```json
{
  "old": "computation:entity:Media:Gr",
  "new": "computation:entity:Media:ia",
  "dataContext": "entity:Media",
  "functionHash": "0017601896dbc3505c41e4c63d1266d7db679296353e24454526d6fc674fb8c6",
  "previousFunctionHash": "0017601896dbc3505c41e4c63d1266d7db679296353e24454526d6fc674fb8c6"
}
```

虽然 function hash 一致，diff 仍把这些 computation 视为 removed + added 或 new computation，导致它们进入 required decision。

影响：与本次 `TodoItem` takeover 无关的大量 computation 被迫进入迁移审批和 rebuild 路径。

## 阻塞点 2：新 computation 被强制要求 `changed`，无法审批为 `unchanged`

在 1.5.6 runtime 中，如果 next manifest 里存在 previous manifest 中没有的 computation id，即使人工 review 后把它审批为 `unchanged`，`migrate()` 仍失败：

```text
New computation requires approved changed decision: computation:entity:Media:ia
```

这说明框架目前把“id 变化”直接等同为“必须 rebuild”，无法表达：

> 这个 computation 只是框架内部 identity/type name 变化，结构和函数 hash 没变，应该作为 unchanged 处理。

临时验证时，如果允许 `unchanged` 的新 id 跳过这个强制检查，migration 可以继续进入下一步。这证明阻塞点在框架 migration decision 解释逻辑，而不是业务定义。

## 阻塞点 3：被迫 rebuild 无关 entity Transform 后触发 ownership proof 阻塞

如果按 1.5.6 当前逻辑，把所有 “new computation” 都审批为 `changed`，dry-run 会尝试 rebuild 大量与 `TodoItem` 无关的 entity/relation output computation。

典型 dry-run blocking changes：

```text
unrebuildable-computation: entity:Media:
entity/relation output migration requires a data-based Transform with sourceRecordId and transformIndex state

destructive-computed-output: entity:Media:
entity/relation output replacement requires exclusive output ownership proof in the previous manifest

destructive-computed-output: entity:Project:
entity/relation output replacement requires exclusive output ownership proof in the previous manifest

destructive-computed-output: entity:VideoDraft:
entity/relation output replacement requires exclusive output ownership proof in the previous manifest
```

实际出现的无关 blocking contexts 包括：

- `entity:Media`
- `entity:UploadSession`
- `entity:Character`
- `entity:Voice`
- `entity:ChatSession`
- `entity:Script`
- `entity:UserModelPreference`
- `entity:RechargeRatePolicyVersion`
- `entity:CreditTopUp`
- `entity:CreditLedgerEntry`
- `entity:BillingRuleVersion`
- `entity:CreditCharge`
- `entity:CreditRechargePackageVersion`
- `entity:McapMonthlyCostLine`
- `entity:MonthlyBill`
- `entity:MonthlyBillFinalization`
- `entity:EmailVerificationCode`
- `entity:Project`
- `entity:VideoDraft`
- `entity:OpRecord`

这些并不是本次迁移目标。它们被卷入迁移，是由 computation identity 变化和 “new computation 必须 changed” 共同导致的。

## 阻塞点 4：旧空 fact table 删除会触发 destructive schema block

验证过程中还发现旧 manifest 中存在一个历史空表：

```text
TodoItemWriteEvent
```

实际查询结果：

```json
[{ "count": 0 }]
```

如果当前模型不再声明该 record，1.5.6 diff 会产生 blocking change：

```text
unsupported-destructive-schema-change:
logicalPath=TodoItemWriteEvent
reason=fact record was removed from the new schema
```

这个问题本身可通过保留历史兼容 entity 避免，但它也说明迁移工具对“空的历史 fact table 删除”目前没有可审批的非手工路径。

## 复现摘要

在 `medeo-lite`：

```bash
npm install interaqt@1.5.6
npm run dev:diff:main
```

观察到 fresh diff 中：

```json
{
  "summary": {
    "changeCount": 189,
    "requiredDecisionCount": 162,
    "blockingChangeCount": 0,
    "computationTakeovers": [
      {
        "dataContext": "entity:TodoItem",
        "computationId": "computation:entity:TodoItem:ia",
        "targetType": "entity",
        "expectedExistingCount": 74
      }
    ]
  }
}
```

required decision 分类：

```json
{
  "computation": 92,
  "event-rebuild-handler": 63,
  "async-completion-handler": 1,
  "computation-takeover": 5,
  "destructive-scope": 1
}
```

如果把无关 computation 审批为 `unchanged`，执行：

```bash
npm run dev:migrate:main -- migrations/current-main.json
```

失败：

```text
New computation requires approved changed decision: computation:entity:Media:ia
```

如果把所有 new computation 审批为 `changed`，dry-run 失败于无关 entity output rebuild 的 ownership proof blocking changes。

## 建议修复方向

优先修框架，不修改业务逻辑来绕过：

1. **稳定 computation migration identity**
   - 1.5.4 -> 1.5.6 不应因为 minified/internal class name 变化导致 `Gr/Cr` 变成 `ia/Lr` 后被视为新 computation。
   - identity 应基于 stable dataContext + computation kind semantic name，而不是打包后的短符号名。

2. **允许人工审批“new id but unchanged semantic computation”**
   - 如果 function hash、structural signature、output signature 等证据显示没有实质变化，且 approved decision 为 `unchanged`，不应强制 `changed`。
   - 这类 computation 不应进入 rebuild plan。

3. **仅让 takeover 相关 computation 进入 rebuild**
   - `computation-takeover` 需要配套的 `computation: changed` decision。
   - 但 unrelated computation 即使出现在 diff 中，也应该可以被 review 后忽略。

4. **空 fact table 删除需要明确策略**
   - 可以继续作为 blocking change。
   - 或支持空表删除的 explicit approval。
   - 但不能要求手工改数据库。

## 当前状态

这次错误迁移尝试已经回滚：

- 迁移产生的 diff/approved/current-main 文件已删除。
- `package.json` / `package-lock.json` 已回到 `interaqt@1.5.4`。
- 本地数据库已通过 `npm run dev:bootstrap:main` 重建回当前代码对应 schema/manifest。

后续应先修复框架迁移逻辑，再重新执行完整命令流程验证。
