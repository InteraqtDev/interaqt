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


## 任务二

我们已经完全实现了 merged entity 的功能。接下来补充 merged entity 作为 各种 computations 的参数的测试用例，验证 merged entity + computations 能正常运行。

### 具体步骤
1. 阅读 `src/storage` 下所有 merged entity 相关的源码，理解 merged entity 的实现原理。
2. 阅读 `tests/storage` 下 merged entity 相关的测试用例，掌握 merged entity 的用法。
3. 阅读 `src/runtime` 下所有 computaion 的源码，理解各种 computation 的原理。
4. 阅读 `tests/runtime` 下所有 computation 相关的测试用例，掌握 computation 测试用例的写法。
5. 在 `tests/runtime` 下的各种 computation 测试文件中，新增相应的 computation 使用 merged entity 作为参数的例子。并通过 `npm run test:runtime` 运行测试用例，保证测试用例全部通过。如果没有通过，尝试对源码进行修复，直到所有测试用例通过。
6. 使用 `npm test` 验证所有测试用例通过，才说明没有破坏原本功能。

## 任务三
我们已经完全实现了 merged entity 特性。relation 也是一种特殊的 entity，接下里你来基于 merged entity 的实现来实现 merged relation。要求：
1. relation 可以由 inputRelations 指定的多个 relation merge 而成。所有 input relations 都要有相同的 source，相同的 target。
2. merged relation 不能指定 source/target。一定要指定 sourceProperty/targetProperty。
3. merged relation 可以像 relation 一样支持查询、或者为修改删除而作的匹配。不能用于创建。
4. relation 也是一种特殊的 entity，在实现时，应该尽量复用 merged entity 的底层代码。尽量不要新建类。

### 具体步骤
1. 阅读 `src/storage` 下的源码，完全理解 merged entity 的与实现。
2. 阅读 `tests/storage` 下的测试用例源码，理解 merged entity 的用法和测试用例写法。
3. 阅读 `src/shared` 中 merged entity 相关的代码，理解 merged entity 的定义。
4. 开始实现 merged relation 特性。
  4.1. 在 `src/shared` 的 Relation 定义中，增加 `inputRelations` 参数，用于表示从哪些 relation merge 而来。在 Relation 创建时，按照要求对 inputRelations 等参数做必要的检测。
  4.2. 在 `src/storage` 中，修改必要的代码，实现 merged relation 的特新要求。
6. 在 `tests/storage` 下创建测试用例，测试 merged relation 的所有功能以及触发的事件都正确。
7. 使用 `npm run test:storage` 运行测试用例并保证测试用例全部通过，才说明一切正常没有破坏原本的测试用例。


## 任务四

我们已经完全实现了 merged relation 的功能，并且通过测试看到基于 merged relation 的增删改查功能已经全部正确。接下来你来补充 merged relation 作为 各种 computations 的参数的测试用例，验证 merged relation + computations 能正常运行。

### 具体步骤
1. 阅读 `src/storage` 下所有 merged entity 相关的源码，理解 merged relation 的实现原理。
2. 阅读 `tests/storage` 下 merged relation 相关的测试用例，掌握 merged relation 的用法。
3. 阅读 `src/runtime` 下所有 computaion 的源码，理解各种 computation 的原理。理解不同类型 computation 的差别。
4. 阅读 `tests/runtime` 下所有 computation 相关的测试用例。
  4.1. 掌握各种 computation 正确参数，测试用例的写法。当测试用例失败时，要检查 computation 的参数使用是否正确。
  4.2. 掌握如何在 property level computation 中使用 relation 作为参数。
5. 在 `tests/runtime` 下的各种 computation 测试文件中，新增相应的 computation 使用 merged relation 作为参数的例子。
  5.1. 列举有能支持 relation 作为参数的 computation，制定新增 merged relation 作为参数的计划。
  5.2. 查看已有的测试用例并完全掌握新增计划中相关 computation 的参数的正确使用方法。特别是当以 relation 作为参数时的测试用例。注意 relation 作为参数时，如果过有 callback，callback 的参数通常是 relation，而不是 entity。
  5.3. 新增 merged relation 作为参数的测试用例。
6. 通过 `npm run test:runtime` 运行测试用例，保证测试用例全部通过。如果没有通过，尝试对源码进行修复，直到所有测试用例通过。
7. 使用 `npm test` 验证所有测试用例通过，才说明没有破坏原本功能。