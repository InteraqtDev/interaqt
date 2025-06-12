# 编写 Computation 测试用例指南

本文档提供了如何为自定义 Computation（如 WeightedSummation、Every、Any 等）编写有效测试用例的指南和最佳实践。

## 测试结构概述

编写 Computation 的测试通常遵循以下结构：

1. **设置测试环境** - 定义实体、关系和计算属性
2. **初始化系统** - 配置 Controller 和 MonoSystem
3. **创建测试数据** - 添加记录到系统中
4. **触发变更** - 创建、更新或删除记录
5. **验证结果** - 确认计算产生了预期结果

## 详细步骤

### 1. 设置测试环境

首先，需要定义实体、关系和属性。根据测试场景，创建必要的 Entity 和 Relation 对象：

```typescript
// 创建实体
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'name',
      type: 'string',
      defaultValue: () => 'user1'
    })
  ]
});

const productEntity = Entity.create({
  name: 'Product',
  properties: [
    Property.create({name: 'price', type: 'number'}),
    Property.create({name: 'quantity', type: 'number'})
  ]
});
```

### 2. 定义计算逻辑

根据要测试的 Computation 类型，定义相应的计算属性。这可以是全局计算（Dictionary）或实体属性：

```typescript
// 全局计算示例（加权求和）
const dictionary = [
  Dictionary.create({
    name: 'totalValue',
    type: 'number',
    collection: false,
    computedData: WeightedSummation.create({
      record: productEntity,
      attributeQuery: ['price', 'quantity'],
      callback: (product: any) => {
        return {
          weight: product.quantity || 0,
          value: product.price || 0
        };
      }
    })
  })
];

// 实体属性计算示例
userEntity.properties.push(
  Property.create({
    name: 'everyRequestHandled',
    type: 'boolean',
    computedData: Every.create({
      record: requestRelation,
      attributeQuery: ['handled'],
      notEmpty: true,
      callback: (request: any) => {
        return !!request.handled
      },
    })
  })
);
```

### 3. 初始化系统

创建并配置系统和控制器：

```typescript
const system = new MonoSystem();
system.conceptClass = KlassByName;

// 对于全局计算
const controller = new Controller(system, entities, [], [], [], dictionary, []);

// 对于包含关系的实体属性计算
const controller = new Controller(system, entities, relations, [], [], [], []);

await controller.setup(true);
```

### 4. 添加测试数据

创建需要的记录，建立它们之间的关联：

```typescript
// 创建记录
const user = await system.storage.create('User', {name: 'user1'});
const product = await system.storage.create('Product', {price: 10, quantity: 2, buyer: user});

// 查询记录
const user1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
```

### 5. 测试计算结果

验证初始计算结果是否符合预期：

```typescript
// 验证全局计算结果
const initialTotalValue = await system.storage.get('state', 'totalValue');
expect(initialTotalValue).toBe(0);

// 验证实体属性计算结果
expect(user1.totalPurchaseValue).toBe(20); // 10 * 2
```

### 6. 触发变更并验证增量计算

通过更新、创建或删除数据来触发增量计算，然后验证结果：

```typescript
// 更新数据
await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product.id]}), {quantity: 5});

// 重新获取数据并验证计算结果
const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
expect(user2.totalPurchaseValue).toBe(50); // 10 * 5
```

## 测试场景示例

### 1. 全局加权求和测试

测试场景：
- 创建产品记录并验证总价值
- 更新产品数量并验证总价值更新
- 删除产品并验证总价值减少

```typescript
test('should calculate global weighted summation correctly', async () => {
  // 设置环境...
  
  // 初始值为 0
  const initialValue = await system.storage.get('state', 'totalValue');
  expect(initialValue).toBe(0);
  
  // 创建产品，添加值
  const product1 = await system.storage.create('Product', {price: 10, quantity: 2});
  const product2 = await system.storage.create('Product', {price: 20, quantity: 3});
  
  // 验证计算：(10*2) + (20*3) = 80
  const value1 = await system.storage.get('state', 'totalValue');
  expect(value1).toBe(80);
  
  // 更新产品数量
  await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product1.id]}), {quantity: 5});
  
  // 验证更新后计算：(10*5) + (20*3) = 110
  const value2 = await system.storage.get('state', 'totalValue');
  expect(value2).toBe(110);
});
```

### 2. 实体属性计算测试

测试场景：
- 通过关系连接的记录的属性计算
- 更新关联对象属性，验证计算结果变化
- 删除关联，验证计算结果变化

```typescript
test('should be true when every request of a user is handled', async () => {
  // 设置环境...
  
  // 创建用户和请求
  const user = await system.storage.create('User', {});
  const request1 = await system.storage.create('Request', {handled: false, owner: user});
  const request2 = await system.storage.create('Request', {handled: false, owner: user});
  
  // 验证初始状态（没有全部处理）
  const user1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
  expect(user1.everyRequestHandled).toBeFalsy();
  
  // 处理第一个请求
  await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true});
  
  // 验证中间状态（仍有未处理的请求）
  const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
  expect(user2.everyRequestHandled).toBeFalsy();
  
  // 处理第二个请求
  await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request2.id]}), {handled: true});
  
  // 验证最终状态（所有请求已处理）
  const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
  expect(user3.everyRequestHandled).toBeTruthy();
});
```

### 3. 边界条件测试

测试各种边界条件和特殊情况：

```typescript
test('should handle zero values correctly', async () => {
  // 设置环境...
  
  // 测试零值
  await system.storage.create('Product', {price: 0, quantity: 5});
  const value1 = await system.storage.get('state', 'totalValue');
  expect(value1).toBe(0); // 0*5 = 0
  
  // 测试零系数
  await system.storage.create('Product', {price: 20, quantity: 0});
  const value2 = await system.storage.get('state', 'totalValue');
  expect(value2).toBe(0); // 0*5 + 20*0 = 0
});

test('should handle negative values correctly', async () => {
  // 设置环境...
  
  // 测试正负值
  await system.storage.create('Account', {amount: 100, factor: 1});  // 正资产
  await system.storage.create('Account', {amount: 50, factor: -1});  // 负债务
  
  // 验证计算：(100*1) + (50*-1) = 50
  const netBalance = await system.storage.get('state', 'netBalance');
  expect(netBalance).toBe(50);
});
```

## 最佳实践

1. **测试隔离** - 每个测试用例应当独立，不依赖其他测试的结果

2. **全面覆盖** - 测试各种操作类型（创建、读取、更新、删除）

3. **边界条件** - 包含零值、负值、极端值等边界条件测试

4. **关系测试** - 对于属性计算，确保测试通过关系连接的数据变化

5. **状态验证** - 测试初始状态、中间状态和最终状态

6. **递增复杂度** - 从简单场景开始测试，逐步增加复杂度

7. **清晰的期望值计算** - 在注释中清晰解释计算期望值的逻辑

## 技巧与注意事项

1. 使用 `BoolExp.atom()` 创建查询条件

2. 通过 `system.storage.findOne()` 获取最新记录状态

3. 对于删除关系测试，可以用设置关联为 null 来模拟

4. 确保为复杂计算添加足够的测试用例

5. 使用异步/等待模式正确处理异步操作

6. 调用 `controller.setup(true)` 确保系统正确初始化

7. 如果测试失败，检查计算逻辑、数据更新操作和查询参数
