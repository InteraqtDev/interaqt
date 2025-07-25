# Generator Guide Task

注意，下面所有描述的文档路径都是相对于当前文档目录(examples/cms)。
特别注意，这个框架的名称是 interaqt，而不是 interAQT

## 背景
interaqt 是一个全新的响应式的后端框架。现在你来帮助我重新整理一份给 大模型 读的文档，目的是让大模型能更准确的生成基于 interaqt 的项目代码。
文档的大题思路如下：
- 有一个 CLAUDE.md 文件，是专门用来描述如何生成基于 interaqt 的整个步骤的，相当于总揽。包含了各种必须达成的 check list 和 关键信息。
- 在当前文件夹的 `./agentspace/knowledge` 下，有一个 `generator` 文件夹，是装门用来放各个细节概念的文档的，当大模型做到某一步骤，CLAUDE.md 会告诉它需要查阅 generator 文件夹中的那些文档。
- 有一个 `COMMOM_ERRORS.md` 专门记录了常见错误和关键信息。

## 你的任务

接下来你来完成下面的任务，做完一个任务就停下来，等待我的确认。

### [x] 任务一: CLAUDE.md 大纲生成
根据我下面规划的内容生成 CLAUDE.md，只生成大纲：
生成基于 interaqt 项目的后端部分需要一下步骤：
- 需求分析和设计测试用例，需要产出各种文档。具体参考之前写的 `./CLAUDE.bak.md` 中需求相关的内容。
- 代码生成，在下面的每一步做完时，都要保证typescript类型校验和新增的测试用例通过。
  - 从用例中数据的角度生成所有用例中需要的实体和实体上的属性、关系和关系上的属性。
  - 从用例中交互动作的角度生成所有的 interaction，一开始只需要最简单的包含 payload 的形式。
  - 基于 interaqt 的响应式知识，用各种 Computation 来描述实体、关系、以及上面的属性。Computation 理论上会把所有实体和 Intraction 或者实体和实体关联起来。一切数据最终源头应该都是来自于 Interaction。
  - 开始创建 interaction 的测试用例代码，保证测试用例通过。
  - 增加 interaction 中的测试用例，保证通过。

### [x] 任务二: 生成 CLAUDE.md 中phase2所需要的文档目录
你根据 CLAUDE.md 中 phase 2 的每一节内容，来在 `./agentspace/knowledge/generator` 下创建每一节内容需要的独立的文档，并将文档路径更新到 phase 2 中的每一个小节开头。


### [] 任务三：根据每一步骤的文档目录完善文档
phase 2 中每个小结需要的文档都已经在 `./agentspace/knowledge/generator` 生成了，现在开始完善每个文档中的内容。要求：
1. 每个小结的文档只需要包含完成当前这个小结必要的信息就够了，防止信息太多反而干扰模型。
2. 小结文档中的具体内容，应该大量从 `./agentspace/knowledge/usage` 中的文档参考。特别是要把 CRITICAL 的信息都移植过来。

### [] 任务四：补充 CRITICALS 和 COMMOM ERRORS 文档