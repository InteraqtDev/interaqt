# Data and Line

## Prompt
现在你来处理图中的真实的数据和连线。具体任务：
1. 该图需要渲染的数据是本项目所实现的 Entity/Relation 数据，你可以在 examples/social-content-network 中找到例子。
2. 你通过配置当前前端目录下的 vite alias，可以直接获取到 examples/social-content-network/src 下的数据。
3. 真实的 Entity/Relation 是一个图，你需要以 User 为根节点来变成我们现在展示用的树，具体规则是以 "User" 为根节点，所有和 User 相关的 Relation 中对应的 Entity 作为一下一层子节点，以此类推。直到排列完所有 Entity。构建树形数据。注意要检测环，不要形成死循环。
4. Entity 组件中，头部显示 Entity 名字，下面依次显示所有 Property。将跟当前 Entity 相关的 Relation 中的 property 显示到 Entity 自身的 property 最后。下一层的展示的 Entity 顺序，就是当前 Relation property 排列的顺序。
5. Relation 中指定的两个 property 要绘制连线，具体规则是：
  5.1. 从上一层的 property 最右边绘制折线到下一层的关联 Property 的最左边。
  5.2. 如果发现了低层 property 有relation 关联到高层。那么从底层 property 的最右边，绘制"支线"到高层property 的最左边。
  5.3. 你可以通过 RxDOMRect 获得 property 的 rect 信息，里面就有位置。你应该在 graph 渲染完之后再绘制线，这样才能得到正确的 rect 位置信息。线使用 svg 来绘制，它应该在 Graph 组件内，层级被 Entity 组件低，这样才能显示在 Entity 的下面。


