# Quick Start

## @interaqt/runtime 是什么

@interaqt/runtime 是一个全新的应用框架。
为了便于理解，可以简单的当成 Web Framework + ORM/ CMS + BPM Engine 的替代品。



## 为什么创造 @interaqt/runtime

@interaqt/runtime 实现一种更简单，但也更难实现的范式：
```
data = computation(events)
```

使用这种范式，我们始终只描述系统中的数据是什么，而用谢一行操作数据的代码即可实现一个完整的应用。
直观的特点是:
- 几乎做到了将需求建模完成，软件就实现了
- 不存在人工编写的数据变化的代码，因此不存在因人产生的 bug。

更重要的特点，也是我们创造 @interaqt/runtime 的原因：
- 将需求建模后，它的代码，软件架构可以开始实现自动生成，不再依赖于人的经验。
- 需求不变，但架构可以随着数据量、并发数自动变化。

## 快速认识 @interaqt/runtime

### 安装

直接使用 @interaqt/runtime 中的 server。

```typescript
import {MonoSystem,Controller, startServer} from "@interaqt/runtime";

const system = new MonoSystem()
const controller = new Controller(system, entities, relations, activities, interactions, states)

startServer(controller, {
  port: 3000,
  parseUserId: async (headers: IncomingHttpHeaders) => {
      return headers['x-user-id']
    // return (await client.verifyJWTForAPI(headers)).sub
  }
})
```