import { describe, expect, test } from "vitest";
import {
  BoolExp,
  Controller,
  Dictionary,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
  WeightedSummation,
  DICTIONARY_RECORD
} from '@';

// 创建简单测试环境，直接测试 WeightedSummationHandle 的具体方法
describe('WeightedSummation computed handle', () => {
  
  test('should calculate global weighted summation correctly', async () => {
    // 创建实体
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'quantity', type: 'number'})
      ]
    });
    
    const entities = [productEntity];
    
    // 创建字典项，用于存储全局加权求和结果
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
    
    // 设置系统和控制器
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // 初始值应为 0
    const initialTotalValue = await system.storage.get(DICTIONARY_RECORD, 'totalValue');
    expect(initialTotalValue).toBe(0);
    
    // 创建几个产品
    const product1 = await system.storage.create('Product', {price: 10, quantity: 2});
    const product2 = await system.storage.create('Product', {price: 20, quantity: 3});
    
    // 检查总值应为 (10*2) + (20*3) = 20 + 60 = 80
    const totalValue1 = await system.storage.get(DICTIONARY_RECORD, 'totalValue');
    expect(totalValue1).toBe(80);
    
    // 更新产品数量
    const idMatch1 = BoolExp.atom({
      key: 'id',
      value: ['=', product1.id]
    });
    await system.storage.update('Product', idMatch1, {quantity: 5});
    
    // 检查更新后的总值应为 (10*5) + (20*3) = 50 + 60 = 110
    const totalValue2 = await system.storage.get(DICTIONARY_RECORD, 'totalValue');
    expect(totalValue2).toBe(110);
    
    // 删除一个产品
    const idMatch2 = BoolExp.atom({
      key: 'id',
      value: ['=', product2.id]
    });
    await system.storage.delete('Product', idMatch2);
    
    // 检查删除后的总值应为 10*5 = 50
    const totalValue3 = await system.storage.get(DICTIONARY_RECORD, 'totalValue');
    expect(totalValue3).toBe(50);
  });
  
  test('should calculate property weighted summation correctly', async () => {
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
    
    const entities = [userEntity, productEntity];
    
    // 创建用户和产品之间的关系
    const purchaseRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'purchases',
      target: productEntity,
      targetProperty: 'buyer',
      name: 'purchases',
      type: 'n:n'
    });
    
    const relations = [purchaseRelation];
    
    // 添加用户属性，计算用户购买的所有产品的总价值
    userEntity.properties.push(
      Property.create({
        name: 'totalPurchaseValue',
        type: 'number',
        computedData: WeightedSummation.create({
          record: purchaseRelation,
          attributeQuery: [['target', {attributeQuery: ['quantity', 'price']}]],
          callback: (relation: any) => {
            return {
              weight: relation.target.quantity || 0,
              value: relation.target.price || 0
            };
          }
        })
      })
    );
    
    // 设置系统和控制器
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // 创建用户和产品
    const user = await system.storage.create('User', {totalPurchaseValue: 0});
    const product1 = await system.storage.create('Product', {price: 10, quantity: 2, buyer: user});
    const product2 = await system.storage.create('Product', {price: 20, quantity: 3, buyer: user});
    
    // 检查用户的总购买价值
    const user1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    // 预期为 (10*2) + (20*3) = 20 + 60 = 80
    expect(user1.totalPurchaseValue).toBe(80);
    
    // 更新产品数量
    await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product1.id]}), {quantity: 5});
    
    // 重新获取用户数据，检查更新后的总购买价值
    const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    // 预期为 (10*5) + (20*3) = 50 + 60 = 110
    expect(user2.totalPurchaseValue).toBe(110);
    
    // 删除一个产品与用户的关联
    // 模拟删除关系，通过将buyer设为null
    await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product2.id]}), {buyer: null});
    
    // 重新获取用户数据，检查更新后的总购买价值
    const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    // 预期为 10*5 = 50
    expect(user3.totalPurchaseValue).toBe(50);
  });
  
  test('should handle zero values correctly', async () => {
    // 创建实体
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'quantity', type: 'number'})
      ]
    });
    
    const entities = [productEntity];
    
    // 创建字典项，用于存储全局加权求和结果
    const dictionary = [
      Dictionary.create({
        name: 'totalValue',
        type: 'number',
        collection: false,
        computedData: WeightedSummation.create({
          record: productEntity,
          callback: (product: any) => {
            return {
              weight: product.quantity || 0,
              value: product.price || 0
            };
          }
        })
      })
    ];
    
    // 设置系统和控制器
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // 创建价格为0的产品
    await system.storage.create('Product', {price: 0, quantity: 5});
    
    // 总值应为 0*5 = 0
    const totalValue1 = await system.storage.get(DICTIONARY_RECORD, 'totalValue');
    expect(totalValue1).toBe(0);
    
    // 创建数量为0的产品
    await system.storage.create('Product', {price: 20, quantity: 0});
    
    // 总值仍为 0*5 + 20*0 = 0
    const totalValue2 = await system.storage.get(DICTIONARY_RECORD, 'totalValue');
    expect(totalValue2).toBe(0);
  });
  
  test('should handle negative values correctly', async () => {
    // 创建实体
    const accountEntity = Entity.create({
      name: 'Account',
      properties: [
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'factor', type: 'number'})
      ]
    });
    
    const entities = [accountEntity];
    
    // 创建字典项，用于存储全局加权求和结果，允许负数
    const dictionary = [
      Dictionary.create({
        name: 'netBalance',
        type: 'number',
        collection: false,
        computedData: WeightedSummation.create({
          record: accountEntity,
          callback: (account: any) => {
            return {
              weight: account.factor || 0,
              value: account.amount || 0
            };
          }
        })
      })
    ];
    
    // 设置系统和控制器
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // 创建账户
    await system.storage.create('Account', {amount: 100, factor: 1});  // 正资产
    await system.storage.create('Account', {amount: 50, factor: -1});  // 负债务
    
    // 净余额应为 (100*1) + (50*-1) = 100 - 50 = 50
    const netBalance = await system.storage.get(DICTIONARY_RECORD, 'netBalance');
    expect(netBalance).toBe(50);
  });
}); 