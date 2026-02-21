# Dispatch 调用链路分析

## 结论

确认存在新旧两个调用链路共存的情况。**Activity 相关的交互调用完全绕过了 `Controller.dispatch()`**，仍然使用旧的 `InteractionCall.call()` 直接执行。

---

## 两条调用链路对比

### 新链路：Controller.dispatch()

普通 Interaction（非 Activity）走的路径：

```
外部调用 controller.dispatch(interaction, args)
  → Controller.dispatch()                     [src/runtime/Controller.ts:264]
    → beginTransaction
    → eventSource.guard.call(this, args)       [条件/用户/payload 校验]
    → eventSource.mapEventData(args)           [构造事件数据]
    → storage.create(eventSource.entity.name!) [写入事件记录]
    → eventSource.resolve.call(this, args)     [GetAction 数据查询]
    → eventSource.afterDispatch(...)           [后处理]
    → commitTransaction
    → runRecordChangeSideEffects               [执行副作用]
```

统一的事务管理、统一的事件记录写入、统一的副作用执行。

### 旧链路：ActivityManager → InteractionCall.call()

Activity 交互走的路径：

```
外部调用 activityManager.callActivityInteraction(activityName, interactionName, activityId, args)
  → ActivityManager.callActivityInteraction()  [src/builtins/interaction/activity/ActivityManager.ts:154]
    → beginTransaction                         [ActivityManager 自己管理事务]
    → ActivityCall.callInteraction()           [src/builtins/interaction/activity/ActivityCall.ts:325]
      → InteractionCall.check()                [src/builtins/interaction/activity/InteractionCall.ts:375]
        → checkCondition()                     [独立实现的条件校验]
        → checkUser()                          [独立实现的用户校验，支持 ref]
        → checkPayload()                       [独立实现的 payload 校验]
      → InteractionCall.call()                 [src/builtins/interaction/activity/InteractionCall.ts:389]
        → saveEvent()                          [直接 storage.create('_Interaction_', event)]
        → retrieveData()                       [独立实现的数据查询]
    → commitTransaction / rollbackTransaction
```

完全绕过了 `Controller.dispatch()`。

---

## 具体问题点

### 1. InteractionCall.call() — 旧执行核心 (InteractionCall.ts:389-417)

这是旧链路的核心执行方法。它独立完成了 guard → 事件保存 → 数据查询 的全流程：

```typescript
async call(interactionEventArgs, activityId?, checkUserRef?, context?) {
    response.error = await this.check(...)     // 旧的校验逻辑
    await this.saveEvent(event)                // 直接写 storage
    response.data = await this.retrieveData()  // 独立查询
    return response
}
```

与 `Controller.dispatch()` 的关键差异：
- **不经过** `eventSource.guard` / `mapEventData` / `resolve`
- **不触发** `afterDispatch`
- **不使用** `asyncEffectsContext` — 导致不会收集 `RecordMutationEvent`
- **不执行** `runRecordChangeSideEffects` — 副作用不会被触发

### 2. InteractionCall.check() — 重复的校验逻辑 (InteractionCall.ts:375-387)

`InteractionCall.check()` 内部调用了 `checkCondition()`, `checkUser()`, `checkPayload()`，这些方法与 `Interaction.ts` 中的 `buildInteractionGuard()` 生成的 guard 函数逻辑**功能重复但实现不同**：

| 功能 | 新链路 (Interaction.ts) | 旧链路 (InteractionCall.ts) |
|------|------------------------|--------------------------|
| 条件校验 | `checkCondition()` (L256) 抛 `InteractionGuardError` | `checkCondition()` (L307) 抛 `ConditionError` |
| 用户校验 | `checkUser()` (L303) 不支持 ref | `checkUser()` (L123) 支持 `checkUserRef` 回调 |
| Payload校验 | `checkPayload()` (L324) 抛 `InteractionGuardError` | `checkPayload()` (L241) 抛 `ConditionError` |
| Concept校验 | 简化版 `checkConcept()` (L396) | 完整版 `checkConcept()` (L149) 含 stack trace |

注意：**旧链路的 `checkUser` 支持 Activity 的 `userRef` 机制**（通过 `checkUserRef` 回调在 Activity 上下文中校验用户引用），新链路的 `buildInteractionGuard()` 中并不支持这个功能。

### 3. InteractionCall.saveEvent() — 直接写存储 (InteractionCall.ts:350-352)

```typescript
async saveEvent(interactionEvent: InteractionEvent) {
    return await this.system.storage.create(InteractionCall.INTERACTION_RECORD, interactionEvent)
}
```

直接调用 `storage.create`，绕过了 `Controller.dispatch()` 中的 `asyncEffectsContext`，因此这些写入**不会被收集到 effects 中**，也**不会触发 RecordMutationSideEffect**。

### 4. ActivityManager.callInteraction() — 独立事务管理 (ActivityManager.ts:118-152)

```typescript
async callInteraction(interactionName, interactionEventArgs) {
    await this.controller.system.storage.beginTransaction(...)
    result = await interactionCall.call(interactionEventArgs)  // 旧链路
    // 自己管理 commit/rollback
}
```

事务管理由 ActivityManager 自行处理，与 `Controller.dispatch()` 中的事务管理独立存在。

### 5. ActivityCall.callInteraction() — Activity 状态管理 + 旧执行 (ActivityCall.ts:325-364)

```typescript
async callInteraction(inputActivityId, uuid, interactionEventArgs) {
    // Activity 状态检查
    const result = await interactionCall.call(...)  // 直接调用旧链路
    // Activity 状态转移
}
```

这个方法混合了 Activity 状态管理和 Interaction 执行，所有交互执行都走旧的 `interactionCall.call()`。

### 6. ActivityManager 构造时的"假"EventSource 包装 (ActivityManager.ts:91-107)

```typescript
const wrappedEventSource: EventSourceInstance<InteractionEventArgs> = {
    uuid: `${activity.uuid}_${interaction.uuid}`,
    _type: 'EventSource',
    name: scopedName,
    entity: interaction.entity,
    guard: interaction.guard,
    mapEventData: interaction.mapEventData,
    resolve: interaction.resolve,
    afterDispatch: interaction.afterDispatch,
}
this.activityEventSources.push(wrappedEventSource)
```

虽然为 Activity 中的 Interaction 创建了 EventSource 包装，也注册到了 Controller 的 `eventSources` 中，但**实际的 Activity 交互调用并不走这些 EventSource**。这些包装目前的作用仅仅是让 Controller 能发现这些事件源（例如用于 `findEventSourceByName`），但调用时仍然走 `callActivityInteraction` 旧链路。

---

## 影响范围

### 当前测试使用情况

| 测试文件 | 使用链路 |
|---------|---------|
| `tests/runtime/activity.spec.ts` | **旧链路** — 通过 `activityManager.callActivityInteraction()` |
| 其他所有 `tests/runtime/*.spec.ts` | **新链路** — 通过 `controller.dispatch()` |

### 旧链路中独立存在的代码

以下文件中的代码是旧链路独有的，如果完全迁移到 dispatch，需要考虑如何处理：

1. **`InteractionCall.ts`** — 整个类（419行）是旧链路的执行核心
2. **`ActivityManager.callInteraction()`** — 直接调用 InteractionCall
3. **`ActivityManager.callActivityInteraction()`** — 直接调用 ActivityCall  
4. **`ActivityCall.callInteraction()`** — 直接调用 InteractionCall + Activity 状态管理

### Activity 特有逻辑（迁移时需要保留）

Activity 的 `callInteraction` 中有一些新链路（dispatch）中没有的逻辑：
1. **`checkUserRef`** — Activity 上下文中的用户引用校验
2. **Activity 状态机管理** — `isInteractionAvailable`, `completeInteraction`, `setState`
3. **`saveUserRefs`** — 保存 Activity 中的用户引用关系
4. **`create()`** — Activity 头部交互时自动创建 Activity 实例

这些逻辑如果要迁移到 dispatch 链路，可以通过 Interaction 的 `guard`（含 Activity 状态检查）和 `afterDispatch`（含 Activity 状态转移）来实现。

---

## 总结

| 方面 | 新链路 (dispatch) | 旧链路 (InteractionCall) |
|------|-------------------|------------------------|
| 事务管理 | Controller 统一管理 | ActivityManager 自行管理 |
| Guard 校验 | eventSource.guard | InteractionCall.check() |
| 事件写入 | storage.create via dispatch | InteractionCall.saveEvent() |
| Effects 收集 | asyncEffectsContext | 无 |
| 副作用执行 | runRecordChangeSideEffects | 无 |
| afterDispatch | 支持 | 不支持 |
| Activity 状态 | 不支持 | ActivityCall 管理 |
| UserRef | 不支持 | checkUserRef 回调 |

两条链路在校验逻辑、错误类型、事务管理、副作用处理上都存在差异，确认是新旧共存状态。
