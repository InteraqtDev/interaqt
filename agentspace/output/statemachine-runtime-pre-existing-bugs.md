# StateMachine 运行时旧 Bug 记录(main 上已存在,与 migration 修复无关)

> **状态:已修复**(分支 `cursor/fix-statemachine-runtime-bugs-664d`)。两个 bug 均先在干净 main 上真实复现后修复:
> - Bug 1 采用修复方向 1(explicit control):`PropertyStateMachineHandle` 构造时校验每个 transfer 必须提供 `computeTarget`,缺失时在 Controller 构建阶段抛出带宿主实体、属性、transfer 状态与 trigger 定位的错误。
> - Bug 2 采用修复方向 1(internal 写路径):新增 `storage.updateInternal`(对应 `dict.setInternal` 的记录级写路径),初始值回写不再派发宿主记录自身的 update 事件,也不进入 effects;派生事件(filtered entity 成员资格)仍正常派发;回写结果(含重算的 computed 属性)并入 create 事件的 record,下游计算把初始值当作创建语义的一部分消费。
> - 回归测试见 `tests/runtime/stateMachineInitialValue.spec.ts`。

> 发现背景:在为 data-migration 修复(PR #15)编写"defaultValue 回填不得触发 StateMachine 转移"的安全测试时撞见。两个问题都已在**干净的 main worktree** 上复现确认,与迁移分支的任何改动无关,不在该 PR 范围内修复。建议各开一个独立 issue。

## Bug 1:属性 StateMachine 的 transfer 缺少 `computeTarget` 时,trigger 一触发即崩溃

### 现象

对宿主记录执行任何匹配 trigger 的变更(如 `storage.create` 后的 update、或直接 update),抛出:

```
ComputationError: Failed to compute dirty records and events.
Caused by: Cannot read properties of undefined (reading 'call')
```

### 根因

`PropertyStateMachineHandle.computeDirtyRecords` 对匹配到的每个 transfer 无条件调用 `computeTarget`,用的是非空断言:

```112:114:src/runtime/computations/StateMachine.ts
        const allRecords = (await Promise.all(transfers.map(transfer => {
            return transfer.computeTarget!.call(this.controller, mutationEvent)
        }))).flat().filter(Boolean)
```

而 `StateTransfer.computeTarget` 在类型上是可选的(`computeTarget?: Function`),核心层也不做任何校验。用户完全可以合法地声明一个不带 `computeTarget` 的 transfer(例如 trigger 就落在宿主记录自身、目标记录显然就是事件里的记录),结果是 setup 一切正常、运行期第一次触发就崩。

### 复现(main,PGLite)

```typescript
const open = StateNode.create({ name: "open" });
const closed = StateNode.create({ name: "closed" });
const lifecycle = StateMachine.create({
    states: [open, closed],
    transfers: [StateTransfer.create({
        trigger: { recordName: "DbgTicket", type: "update" },
        current: open,
        next: closed,
        // 没有 computeTarget
    })],
    initialState: open,
});
const Ticket = Entity.create({
    name: "DbgTicket",
    properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({ name: "status", type: "string", computation: lifecycle }),
    ],
});
// setup(true) 正常;下面这行崩溃(见 Bug 2:create 本身就会触发 update 事件)
await system.storage.create("DbgTicket", { title: "t" });
```

### 修复方向

二选一,倾向前者(explicit control):
1. **setup 期校验 fail-fast**:属性 StateMachine 的每个 transfer 必须提供 `computeTarget`,缺失时在 `Controller`/`Scheduler` 构建阶段抛出带 dataContext 定位的错误,而不是运行期 `undefined.call`;
2. 或者给出默认语义:当 `trigger.recordName` 等于宿主记录名时,默认 target 为事件自身的 record(`(event) => ({ id: event.record.id })`),其余情况仍强制要求显式 `computeTarget`。方案 2 引入隐式行为,与项目的 explicit control 原则冲突,不推荐。

## Bug 2:update-trigger 指向宿主自身的 StateMachine,在记录**创建时**就会转移一次

### 现象

上例中给 transfer 补上 `computeTarget` 后,`storage.create("DbgTicket", { title: "t" })` 得到的记录 `status` 直接是 `"closed"`——`open → closed` 的转移在创建瞬间就发生了,用户从未 update 过这条记录。

### 根因

创建记录时,Scheduler 的属性初始值监听器通过 `applyResult` 写入 StateMachine 的初始值:

```325:334:src/runtime/Scheduler.ts
                    this.controller.system.storage.listen(async (mutationEvents) => {
                        for(let mutationEvent of mutationEvents){
                            if (mutationEvent.type === 'create' && mutationEvent.recordName === propertyDataContext.host.name) {
                                const defaultValue = await computation.getInitialValue?.(mutationEvent.record)
                                if (defaultValue !== undefined) {
                                    await this.controller.applyResult(propertyDataContext, defaultValue, mutationEvent.record)
                                }
                            }
                        }
                    })
```

这个 `applyResult` → `storage.update` 本身会发出一个该记录的 **update 事件**,再次进入 dispatch,被同一个 StateMachine 的 `trigger: { recordName: 宿主, type: 'update' }` 匹配中,于是初始值写入被当成了一次业务更新,状态机立即转移。

### 影响

任何"监听自身记录 update"的属性 StateMachine(例如"记录被编辑过就从 draft 变 dirty"这类常见建模)都无法正确表达:初始值写入就把它踢出初始状态。迁移场景不受影响(迁移事务内监听器未注册,PR #15 中有测试固定该行为)。

### 修复方向

初始值写入不应产生可被计算消费的业务 update 事件。可选:
1. 初始值写入走 internal 写路径(类似 `RecordBoundState.setInternal`,不进 dispatch);
2. 或者在合成 update 事件时给初始值写入打标(如 `isInitial`),StateMachine 的 `computeDirtyRecords`/TransitionFinder 跳过带标事件。方案 1 更干净:初始值是计算语义的一部分,不是用户变更。

## 与 PR #15 的关系

- PR #15 的测试 `defaultValue backfill does not trigger StateMachine transitions on the same record` 在编写过程中暴露了这两个问题;该测试最终断言"迁移前后 status 不变",不依赖也不掩盖这两个 bug。
- 两个 bug 在 main(commit `d6d101e`)干净 worktree 上均复现,证明与迁移分支改动无关。
