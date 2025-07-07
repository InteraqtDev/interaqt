# Error Documentation - Round 3

## 开始第3轮迭代修复

### 目标
修复computations导入冲突，使所有业务逻辑正常工作，让全部测试用例通过。

### 当前问题分析
1. computations.ts与entities.ts中的inline computation冲突
2. 其他交互缺乏业务逻辑实现
3. 9个测试用例因为数据创建失败而无法通过

### 修复策略
采用inline computation方法，直接在需要的entities和relations中定义Transform，避免post-definition modification。