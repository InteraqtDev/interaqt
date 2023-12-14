# 创建 Interaction

## 创建 Interaction

Interaction 是用户可以执行的交互动作，近似等于一个 post api。
和其他 Web 框架不同的是，我们不需要声明当 interaction 发生时，应该如何处理数据。
而是在数据定义中反向引用 Interaction，具体见 [Use Computed Data](UseComputedData.md)

一个简单的交友 interaction 如下:

```typescript
const sendInteraction = Interaction.create({
  name: 'sendRequest',
  action: Action.create({name: 'sendRequest'}),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'to',
        base: UserEntity,
        itemRef: userRefB
      })
    ]
  })
})
```

## 使用 Attribute

Attributive 可以限制可以执行当前 Interaction 的用户，也可以用来限制 Payload。

### 创建 Attributive

不要在 Attributive 中使用外部变量，应该保持 Attributive 是个纯函数。不然会在序列化和反序列化时失效。

一个声明 “我的” 的 Attributive 如下：

```typescript
const Mine = Attributive.create({
    name: 'Mine',
    content:  function(this: Controller, request, { user }){
      return request.owner === user.id
    }
})
```

在 Interaqt/runtime 中我们为你内置了一个 `createUserRoleAttributive` 函数帮助你快速创建角色定语：
```typescript
const adminRole = createUserRoleAttributive({name: 'admin'})
```
注意，它假定了你的 User Entity 中含有一个 `string[]` 类型的 `roles` 字段。

### 创建通用的 Attributive

可以在业务上规定一些固定的定语，例如上面例子中 “我的”：它会检查实体上的 owner 字段是不是指向当前 interaction 请求的用户。那么只有有 `owner`
字段，并且确实是 UserEntity 类型，就可以使用这个定语。
当然，如果你不想固定用 `owner` 这个名字，但又想使用通用的定语，我们可以把字段信息和相应的实体细心通过 controller.globals 注入到 attributive 中让它动态判断。

### 使用 BoolExp 来连接 Attributive

当定语限制条件比较复杂时，我们可以通过 `BoolExp` 来连接多个定语建立逻辑组合，然后再通过 `boolExpToAttributives` 转化成定语。

```typescript
const MyPending = boolExpToAttributives(
    BoolExp.atom(Mine).and(
        Attributive.create({
            name: 'Pending',
            content: async function(this: Controller, request, { user }){
             return request.result === 'pending'
            }
        })
    )
)
```

## 创建 GET Interaction 获取数据

当我们要获取数据时，可以通过创建 GET Interaction 来实现。例如，获取我的所有等待中的请求：

```typescript
import {GetAction} from "@interaqt/runtime";

const getMyPendingRequestsInteraction = Interaction.create({
    name: 'getMyPendingRequests',
    action: GetAction,
    dataAttributive: boolExpToAttributives(
        BoolExp.atom(Mine).and(
            Attributive.create({
                name: 'Pending',
                content: async function(this: Controller, request, { user }){
                    return request.result === 'pending'
                }
            })
        )),
    data: RequestEntity,
})
```

注意，它的 action 必须是 import 进来的 GetAction。
它的 data 字段，表示用户获取的数据类型。
它的 dataAttributive，使用来限制用户能获取的数据范围的。

### 获取复杂的数据计算/组合结果
当我们要获取的内容不是一个简单的实体，而是一种计算/组合结果时，我们可以通过定义一个  Computation 来实现：

例如，获取系统中用户平均创建的 Request 数量：

```typescript
const average = Computation.create({
    content: async function() {
        const totalUsers = await this.system.storage.find('User').length
        const totalRequests = await this.system.storage.find('Request').length
        return totalRequests/totalUsers
    }
})

const getMyPendingRequestsInteraction = Interaction.create({
    name: 'getAverage',
    action: GetAction,
    data: averageRequestsCount,
})

```

