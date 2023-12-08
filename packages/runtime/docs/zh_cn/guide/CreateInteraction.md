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

### 创建通用的 Attributive

可以在业务上规定一些规定的定语，例如 “我的”：它会检查实体上的 owner 字段是不是指向当前 interaction 请求的用户。
当然也可以有多个不同名字的字段，建议把字段信息通过 controller.globals 注入到 attributive 中用于判断，不要写死在 Attributive 中。

#### 使用 BoolExp 来连接 Attributive

```typescript
boolExpToAttributives(
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

