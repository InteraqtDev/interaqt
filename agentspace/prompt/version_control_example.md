现在你来基于当前框架实现带版本控制的实体的例子。
步骤：
1. 完整阅读 `agent/agentspace/knowledge/generator/api-reference.md` ，理解当前这个框架。
2. 阅读 `agent/agentspace/knowledge/generator/computation-implementation.md`，理解如何使用 computation 来达成业务逻辑。
3. 完整阅读 `tests/runtime/stateMachine.spec.ts`，掌握测试用例的写法。
3. 完整阅读 `tests/runtime/transform.spec.ts`，掌握 Transform 的写法。
4. 按照下面需求，在 `tests/runtime` 下新建 `versionControlExample.spec.ts` ，编写一个满足下面需求的测试用例。并最终使用 `npm run test:runtime` 保证测试用例通过。

## 需求
有一个 Style 实体用来管理风格。字段需求：
- content 字段用来描述风格。
- status 字段用来控制状态，有 draft/published/offline

Style 可以正常创建新的记录。
当用户执行 publish 某一个 Style interaction 时，publish 的 style 状态变为 published，并且所有 style 合在一起生成一个版本。
用户执行 rollback 时，整个 Style 集合回到指定版本所在的状态。

## 实现提示

使用版本指针+filtered entity 来实现。
- 全局 Dict 存着一个名为 currentVersionInfo 的 json 字段，标记当前版本，如果是应为 rollback 创建出来的新版本，那么还要记录 rollback 指向的 version。
  - currentVersionInfo 的 computation 应该使用 statemachine，当 publish/rollback interaction 发生来记录。
- 实现一个 VersionedStyle entity，来记录所有版本的 style 记录。
  - VersionedStyle entity computation 使用 Transform，使用 eventDeps 既监听创建 style 的 InteractionEventEntity 变化事件，支持一个一个创建属于当前版本的 style。也监听 currentVersionInfo 的更新。
  - 不管是 rollback 还是 publish，都是将已有的数据复制出来，作为新数据插入，并接受之后新的编辑。这样之前的记录，就相当于变成了历史版本记录。
  - currentVerionInfo 更新时，如果是 rollback 引起的（currentVersionInfo 有 rollback 指定的 version），那么新建的应该按照 rollback 指定的 version 复制出全部数据，变成新的。
  - 如果不是 rollback 引起，那么就复制当前的所有记录变成新版本的记录。
- 还应该设计一个 isDeleted 字段，当是 rollback 时，所有当前版本的记录应该标记为 true。
- 没有真实的 Style 实体，用户需要自己转化成对 VersionedStyle 的查询。
