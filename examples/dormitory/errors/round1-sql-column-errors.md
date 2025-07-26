# Round 1: SQL Column Duplication Errors

## 问题描述
测试运行时出现以下错误：
```
column "User_dormitory_users_Dormitory__User_dormitory_users_Dormitory_" specified more than once
```

## 问题分析
这个错误表明在SQL表创建时，某些列名重复了。从错误信息看，问题出现在：
- `User_dormitory_users_Dormitory__User_dormitory_users_Dormitory_`

这可能是由于关系定义中的属性名或计算引用有问题导致的。

## 可能原因
1. **关系属性名冲突**: UserDormitoryRelation的sourceProperty和targetProperty可能与其他定义冲突
2. **计算引用错误**: 在定义User.score的Summation计算时，可能使用了错误的关系引用
3. **重复的关系定义**: 可能存在重复定义的关系
4. **框架内部名称生成冲突**: 框架可能在生成内部列名时产生冲突

## 修复方法
1. 检查并修复关系定义中的属性命名
2. 修复计算中的关系引用
3. 确保所有关系名称和属性名称唯一
4. 检查是否有重复的entity或relation定义

## 修复尝试1: 关系名称简化
- 将UserDormitoryRelation的sourceProperty从'dormitory'改为'assignedDormitory'
- 将DormitoryDormHeadRelation的sourceProperty从'dormHead'改为'headUser'
- **结果**: 仍然出现列名重复错误，但现在是`User_assignedDormitory_assignedUsers_Dormitory__User_assignedDo`

## 分析
列名似乎因为长度限制被截断，导致重复。这表明问题可能在于：
1. 框架生成列名的逻辑有问题
2. 关系过于复杂，包含太多嵌套计算
3. 需要更大幅度的简化

## 修复尝试2: 最简化版本测试
创建了一个最简化的backend (minimal.ts) 和测试:
- 只包含User和Dormitory实体
- 只有一个简单的UserDormitoryRelation关系
- 只有CreateDormitory交互
- **结果**: 测试通过！框架工作正常

## 结论
框架本身没问题，问题出在复杂的后端代码上。可能的问题包括：
1. 太多复杂的StateMachine计算
2. 关系中的properties过于复杂
3. 嵌套的计算依赖
4. 某些特定的属性名组合导致框架内部列名生成问题

## 下一步计划
逐步向最简版本添加功能，找出具体导致问题的代码部分。