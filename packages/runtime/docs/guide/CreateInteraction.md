# 创建 Interaction

## 创建 Interaction

## 使用 Attribute

### 创建 Attributive

不要在 Attributive 中使用外部变量，应该保持 Attributive 是个纯函数。不然会在序列化和反序列化时失效。

### 创建通用的 Attributive

可以在业务上规定一些规定的定语，例如 “我的”：它会检查实体上的 owner 字段是不是指向当前 interaction 请求的用户。
当然也可以有多个不同名字的字段，建议把字段信息通过 controller.globals 注入到 attributive 中用于判断，不要写死在 Attributive 中。

