# Round 1: TypeScript类型错误修复

## 错误概述

第一轮代码生成后，TypeScript编译发现多个类型错误，主要分为以下几类：

### 1. StateTransfer trigger 类型错误
**错误信息**: `Type 'string' is not assignable to type 'InteractionInstance'`
**原因**: StateTransfer的trigger属性需要传入实际的Interaction实例，而不是字符串
**位置**: 多个StateMachine的StateTransfer定义中

### 2. 计算属性中的record类型错误  
**错误信息**: `Type 'string' is not assignable to type 'RelationInstance | EntityInstance'`
**原因**: Count和Summation的record属性需要传入实际的Relation实例，而不是字符串
**位置**: User和Dormitory实体的计算属性中

### 3. Relation定义缺少必需属性
**错误信息**: Missing properties `sourceProperty` and `targetProperty`
**原因**: Relation.create()需要指定sourceProperty和targetProperty来定义关系在实体上的属性名
**位置**: 所有Relation定义

## 修复策略

### 1. 修复StateTransfer trigger引用
- 将字符串改为实际的Interaction实例引用
- 需要考虑交互定义的顺序，避免循环引用

### 2. 修复计算属性中的record引用
- 将字符串改为实际的Relation实例引用
- 确保在使用前已经定义了相关的Relation

### 3. 添加Relation的sourceProperty和targetProperty
- 为每个Relation添加sourceProperty和targetProperty定义
- 确保属性名称符合业务逻辑

## 实施计划

1. 重新组织代码结构，将交互定义移到实体和关系定义之前
2. 修正所有Relation定义，添加缺失的属性
3. 修正StateTransfer和计算属性中的引用
4. 重新编译测试

这些错误反映了对interaqt框架API的理解不够深入，需要更仔细地阅读API文档并正确使用类型引用。