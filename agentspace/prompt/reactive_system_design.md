# Reactive System Design

## 1. Prompt
这个项目的响应式具体指的是：用户只要描述系统中数据的定义，数据的具体变化过程是响应式的。
例如：有一个内容系统，其中一个实体概念是帖子，帖子有一个点赞总数。用户将"点赞总数"描述成"用户和帖子间的点赞关系的总和"，框架会根据这个定义自动知道但出现新的点赞关系时，总数应该加一，这是由"总和"这个概念的定义决定的。总和这个数据在数据库中的变化是由框架自动操作完成的。

我们要设计的是：
1. 如何将系统中的 一个字段/一个集合 表达为响应式
2. 表达为响应式时，如何解决常见的"需要查询全部记录"所产生的性能问题

我现在已经找到了用来将字段、集合表达为响应式的方法，就是预置好各种常见的计算定义。如果有特殊的，还可以支持用户自己声明计算依赖、自己写函数做计算。
我也找到了解决"查询全部记录"产生性能问题的解决方法，就是对基于集合的常见运算找到它的增量计算方法，在集合发生增删改时只做增量操作，而不是重新查询全部数据做全量计算。这些增量方法已经预置的基于集合运算中实现了，例如 Count/Every/Any 等等。还有基于状态机的计算，本来就是增量计算，所以不需要特别处理。

系统中有很多的"集合"概念，他们是响应式计算中依赖的来源，也是上面所说需要进行增量处理的部分。例如实体/关系的集合，用户发起的交互事件(Interaction)的集合，计算中数据变化的集合(ERMutationEvents)。其中像实体关系集合是可以增删改的，事件类型的集合是只增不减的。但不管什么集合，应该都可以作为响应计算的依赖来源，可以做增量计算。

我现在要重做这一部分的实现设计，我下面有一些问题，你来回答我。回答的内容，写在每个问题后面"回答"的章节中。

## 2. 问题

### 2.1. 问题 Entity/Relation/Event/Collection/Value 等概念的 梳理

#### 2.1.1. 描述

我系统中有这些概念：
- Entity/Relation 既是提供给用户用来描述业务中的实体关系的，也是真实创建数据库表结构时需要的。
- Event 是系统中真实发生的事件，可以看做是一个只增不减的集合。它也应该像实体一样结构化，并且需要被数据库存起来。
- Collection 是各种针对集合的 computation 需要的概念，有的计算依赖的 Data Source 必须是 Collection，有的必须是 Value。理论上 Entity/Relation/Event 都应该有相应的数据 Collection。
- Value 是非集合类的数据。

这些概念直接应该是个什么关系？应该怎么用类、类型、接口等具体表示？

#### 2.1.2. 回答

- Entity/Relation 都是 Entity. Event 不是.
- 系统会为 Entity 创建 Entity Collection，因此会有 EntityCollectionMutationEvent.
- 所有的 Entity Collection 都可以被监听，并且能有统一的 Computation 表达。

MutationEvents 是一种描述当前系统中的所有实体“变化”的数据。它和其他实体不是同一个维度的事情，不应该因为表现出一样的性质就做同样的抽象。
如果真的有开发者需求，希望能复用 computation 的能力，也应该通过的别的方式来桥接。
如果有来自用户的观测/管理系统的需求，应该基于 Interaction 去构建。虽然会比较难。


## 3. 设计

### 3.1. Entity & Property & Relation

Property<Type>:
- name: string
- type: TypeString<Type>
- collection: boolean
- getInitialValue: () => Type. 可以根据其他初始字段计算初始值
- getValue: () => Type. 基于当前记录其他字段的计算表达，同样会写入数据库。但是是在增删时直接计算。
- computed: Computation. 响应式表达

Entity:
- properties: Property<any>[]

Relation extends Entity:
- source: Enity
- sourceProperty: string
- target: Entity
- targetProperty: string
