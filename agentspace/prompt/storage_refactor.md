# 任务背景

`src/storage/erstorage` 是一个类似于 orm 的数据框架。它支持一些新颖的特性：
- entity/relation 增删改查操作
- filtered entity/fileterd relation
- merged entity/merged relation
- 关联实体、关联关系、关联关系上的数据的查询，能自动结构化数据。
- 嵌套结构的递归查询
- 每次操作记录所有 entity/relation 级别的事件变化，为外部实现基于 entity/relation 事件的响应式系统提供基础

现在发现这个项目的代码耦合严重，并且有些新的功能已经和之前的设计冲突，需要重构。你来配合我重构

项目目录：
- 源码目录：`src/storage/erstorage`
- 文档目录: `src/storage/erstorage/docs`
- 测试用例目录： `tests/storage`

# 要求
重构过程中的分析、计划文档要简洁，不要包含具体的代码还不相关的项目，只专注于描述当前重构的需求。