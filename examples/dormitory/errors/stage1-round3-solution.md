# Stage 1 测试错误分析 - 第三轮（找到根因）

## 根本原因

通过debug测试，发现了两个关键问题：

1. **第一个问题**：`User.role property shuold not has a defaultValue, because it will be overridden by computation`
   - 当属性有`computation`时，不能同时有`defaultValue`
   - ✅ 已修复：移除了所有有computation的属性的defaultValue

2. **第二个问题**：`error: relation "Dormitory" does not exist`
   - 在setup阶段，Bed.computation的Transform试图访问Dormitory数据
   - Bed的Transform从Dormitory记录创建多个Bed，但在setup时Dormitory表还不存在

## 解决方案

### 问题1已解决
移除了User.role、User.status、Bed.status、EvictionRequest.status的defaultValue

### 问题2的解决
Bed不应该通过Transform从Dormitory自动创建。应该在CreateDormitory交互中显式创建床位。

## 修复方案

修改Bed.computation，不从Dormitory Transform，而是通过InteractionEventEntity在CreateDormitory时创建。

## 验证成功的标志

1. Controller.setup()成功完成
2. 所有Stage 1测试用例通过
