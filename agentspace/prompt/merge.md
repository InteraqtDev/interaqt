# Merged Entity

## 任务一

现在你来给我实现由多个 entity 组合成新 entity 概念的功能。新组成的 entity 称为 merged entity。merged entity 也能像 entity 一样支持查询、修改、删除。
在具体实现中，我们将利用已有的 filtered entity 特性来实现。

### 具体步骤
1. 阅读 `src/storage` 下的源码，完全理解 
  1.1. entity 的定义
  1.2. entity 存储时初始化过程
  1.3. entity 中 filtered entity 的使用与实现
2. 阅读 `tests/storage` 下的测试用例源码，理解 entity 的测试用例写法。
3. 阅读 `src/shared` 中 entity 相关的代码，理解 entity 的定义。
4. 在 `src/shared` entity 的定义中，新增 `inputEntities` 选项，允许用户传入多个 entity，表示merged enity 由传入的这些 entity 组成。定义 merged entity 时， merged entity 不能有任何 property。
5. 接下来开始实现 merge entity 的特性。
  5.1. 在 `src/storage` setup 最开始增加一个阶段，来将 merged entity 转化为 filtered entity 的实现，这样就可以完全不用修改后面的代码。注意，理论上所有工作都应该在这个阶段完成，不需要在其他任何增删改查的地方进行实现！进行转化的具体步骤:
    5.1.1. merged entity 新建 `__input_entity` property, string 类型，用来记录当前这条 record 是哪种 input entity。它的 defaultValue 自动返回第二参数（创建时的 entity name）。这样就实现了记录和 input entity 的关联。
    5.1.2. 合并所有 inputEntities 的 properties 组成 merged entity 的 properties。注意，同名的 property 合并成一个，并且新建 defaultValue 属性，通过属性的第二参数（创建时的 entity name）来选择真实调用哪个原始 property 的 defaultValue。
    5.1.3. 将所有 inputEntities 转化为 merged entity 的 filtered entity。如果 input entity 已经是 filtered entity，那么需要将 filtered entity 的 root base entity 转化成 merged entity 的 filtered entity。
6. 在 `tests/storage` 下创建测试用例，测试新增的 merged entity 特性。注意，我们不支持使用 merged entity 的名称进行新增，只支持查询、更新和删除。
7. 使用 `npm run test:stroge` 来运行测试用例，并且确保所有测试用例通过， 才说明没有破坏原有功能。
