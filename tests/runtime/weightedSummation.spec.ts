import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@dbclients';
import {
  BoolExp,
  Controller,
  Dictionary, KlassByName,
  MatchExp,
  MonoSystem, WeightedSummation
} from 'interaqt';

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
        computation: WeightedSummation.create({
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
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // 初始值应为 0
    const initialTotalValue = await system.storage.dict.get('totalValue');
    expect(initialTotalValue).toBe(0);
    
    // 创建几个产品
    const product1 = await system.storage.create('Product', {price: 10, quantity: 2});
    const product2 = await system.storage.create('Product', {price: 20, quantity: 3});
    
    // 检查总值应为 (10*2) + (20*3) = 20 + 60 = 80
    const totalValue1 = await system.storage.dict.get('totalValue');
    expect(totalValue1).toBe(80);
    
    // 更新产品数量
    const idMatch1 = BoolExp.atom({
      key: 'id',
      value: ['=', product1.id]
    });
    await system.storage.update('Product', idMatch1, {quantity: 5});
    
    // 检查更新后的总值应为 (10*5) + (20*3) = 50 + 60 = 110
    const totalValue2 = await system.storage.dict.get('totalValue');
    expect(totalValue2).toBe(110);
    
    // 删除一个产品
    const idMatch2 = BoolExp.atom({
      key: 'id',
      value: ['=', product2.id]
    });
    await system.storage.delete('Product', idMatch2);
    
    // 检查删除后的总值应为 10*5 = 50
    const totalValue3 = await system.storage.dict.get('totalValue');
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
        computation: WeightedSummation.create({
          property: 'purchases',
          attributeQuery: ['quantity', 'price'],
          callback: (item: any) => {
            return {
              weight: item.quantity || 0,
              value: item.price || 0
            };
          }
        })
      })
    );
    
    // 设置系统和控制器
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
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
        computation: WeightedSummation.create({
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
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // 创建价格为0的产品
    await system.storage.create('Product', {price: 0, quantity: 5});
    
    // 总值应为 0*5 = 0
    const totalValue1 = await system.storage.dict.get('totalValue');
    expect(totalValue1).toBe(0);
    
    // 创建数量为0的产品
    await system.storage.create('Product', {price: 20, quantity: 0});
    
    // 总值仍为 0*5 + 20*0 = 0
    const totalValue2 = await system.storage.dict.get('totalValue');
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
        computation: WeightedSummation.create({
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
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // 创建账户
    await system.storage.create('Account', {amount: 100, factor: 1});  // 正资产
    await system.storage.create('Account', {amount: 50, factor: -1});  // 负债务
    
    // 净余额应为 (100*1) + (50*-1) = 100 - 50 = 50
    const netBalance = await system.storage.dict.get('netBalance');
    expect(netBalance).toBe(50);
  });

  test('should calculate weighted summation for merged entity correctly', async () => {
    // Create input entities for merged entity
    const domesticSaleEntity = Entity.create({
      name: 'DomesticSale',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'unitPrice', type: 'number'}),
        Property.create({name: 'region', type: 'string', defaultValue: () => 'domestic'}),
        Property.create({name: 'taxRate', type: 'number', defaultValue: () => 0.08})
      ]
    });

    const internationalSaleEntity = Entity.create({
      name: 'InternationalSale',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'unitPrice', type: 'number'}),
        Property.create({name: 'country', type: 'string'}),
        Property.create({name: 'region', type: 'string', defaultValue: () => 'international'}),
        Property.create({name: 'taxRate', type: 'number', defaultValue: () => 0})
      ]
    });

    const onlineSaleEntity = Entity.create({
      name: 'OnlineSale',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'unitPrice', type: 'number'}),
        Property.create({name: 'platformFee', type: 'number'}),
        Property.create({name: 'region', type: 'string', defaultValue: () => 'online'}),
        Property.create({name: 'taxRate', type: 'number', defaultValue: () => 0.05})
      ]
    });

    // Create merged entity: Sale (combining all sale types)
    const saleEntity = Entity.create({
      name: 'Sale',
      inputEntities: [domesticSaleEntity, internationalSaleEntity, onlineSaleEntity]
    });

    const entities = [domesticSaleEntity, internationalSaleEntity, onlineSaleEntity, saleEntity];

    // Create dictionary items with weighted summation computations
    const dictionary = [
      Dictionary.create({
        name: 'totalRevenue',
        type: 'number',
        collection: false,
        computation: WeightedSummation.create({
          record: saleEntity,
          attributeQuery: ['quantity', 'unitPrice'],
          callback: (sale: any) => {
            return {
              weight: sale.quantity,
              value: sale.unitPrice
            };
          }
        })
      }),

      Dictionary.create({
        name: 'totalTaxRevenue',
        type: 'number',
        collection: false,
        computation: WeightedSummation.create({
          record: saleEntity,
          attributeQuery: ['quantity', 'unitPrice', 'taxRate'],
          callback: (sale: any) => {
            const totalPrice = sale.quantity * sale.unitPrice;
            return {
              weight: sale.taxRate,
              value: totalPrice
            };
          }
        })
      })
    ];

    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system: system,
      entities: entities,
      dict: dictionary,
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Initial values should be 0
    const initialRevenue = await system.storage.dict.get('totalRevenue');
    expect(initialRevenue).toBe(0);

    const initialTax = await system.storage.dict.get('totalTaxRevenue');
    expect(initialTax).toBe(0);

    // Create sales through different input entities
    const domesticSale1 = await system.storage.create('DomesticSale', {
      productName: 'Product A',
      quantity: 10,
      unitPrice: 100
    });

    // Revenue: 10 * 100 = 1000
    const revenue1 = await system.storage.dict.get('totalRevenue');
    expect(revenue1).toBe(1000);

    // Tax: 1000 * 0.08 = 80
    const tax1 = await system.storage.dict.get('totalTaxRevenue');
    expect(tax1).toBe(80);

    // Add international sale
    const internationalSale1 = await system.storage.create('InternationalSale', {
      productName: 'Product B',
      quantity: 5,
      unitPrice: 200,
      country: 'Canada'
    });

    // Revenue: 1000 + (5 * 200) = 2000
    const revenue2 = await system.storage.dict.get('totalRevenue');
    expect(revenue2).toBe(2000);

    // Tax: 80 + (1000 * 0) = 80 (international has 0 tax)
    const tax2 = await system.storage.dict.get('totalTaxRevenue');
    expect(tax2).toBe(80);

    // Add online sale
    const onlineSale1 = await system.storage.create('OnlineSale', {
      productName: 'Product C',
      quantity: 20,
      unitPrice: 50,
      platformFee: 15
    });

    // Revenue: 2000 + (20 * 50) = 3000
    const revenue3 = await system.storage.dict.get('totalRevenue');
    expect(revenue3).toBe(3000);

    // Tax: 80 + (1000 * 0.05) = 130
    const tax3 = await system.storage.dict.get('totalTaxRevenue');
    expect(tax3).toBe(130);

    // Update a sale quantity
    await system.storage.update('DomesticSale',
      MatchExp.atom({key: 'id', value: ['=', domesticSale1.id]}),
      {quantity: 15}
    );

    // Revenue: (15 * 100) + (5 * 200) + (20 * 50) = 3500
    const revenue4 = await system.storage.dict.get('totalRevenue');
    expect(revenue4).toBe(3500);

    // Tax: (1500 * 0.08) + (1000 * 0) + (1000 * 0.05) = 120 + 0 + 50 = 170
    const tax4 = await system.storage.dict.get('totalTaxRevenue');
    expect(tax4).toBe(170);

    // Delete an online sale
    await system.storage.delete('OnlineSale',
      MatchExp.atom({key: 'id', value: ['=', onlineSale1.id]})
    );

    // Revenue: (15 * 100) + (5 * 200) = 2500
    const revenue5 = await system.storage.dict.get('totalRevenue');
    expect(revenue5).toBe(2500);

    // Tax: (1500 * 0.08) + (1000 * 0) = 120
    const tax5 = await system.storage.dict.get('totalTaxRevenue');
    expect(tax5).toBe(120);
  });

  test('should work with merged relation in property level computation', async () => {
    // Define entities
    const storeEntity = Entity.create({
      name: 'Store',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'location', type: 'string'})
      ]
    });

    const inventoryItemEntity = Entity.create({
      name: 'InventoryItem',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'unitPrice', type: 'number'}),
        Property.create({name: 'quantity', type: 'number'})
      ]
    });

    // Create input relations
    const storeWarehouseInventoryRelation = Relation.create({
      name: 'StoreWarehouseInventory',
      source: storeEntity,
      sourceProperty: 'warehouseItems',
      target: inventoryItemEntity,
      targetProperty: 'warehouseStore',
      type: '1:n',
      properties: [
        Property.create({ name: 'storageType', type: 'string', defaultValue: () => 'warehouse' }),
        Property.create({ name: 'location', type: 'string', defaultValue: () => 'main_warehouse' })
      ]
    });

    const storeShowroomInventoryRelation = Relation.create({
      name: 'StoreShowroomInventory',
      source: storeEntity,
      sourceProperty: 'showroomItems',
      target: inventoryItemEntity,
      targetProperty: 'showroomStore',
      type: '1:n',
      properties: [
        Property.create({ name: 'storageType', type: 'string', defaultValue: () => 'showroom' }),
        Property.create({ name: 'displayArea', type: 'string', defaultValue: () => 'front' })
      ]
    });

    // Create merged relation
    const storeTotalInventoryRelation = Relation.create({
      name: 'StoreTotalInventory',
      sourceProperty: 'allInventoryItems',
      targetProperty: 'anyStore',
      inputRelations: [storeWarehouseInventoryRelation, storeShowroomInventoryRelation]
    });

    // Add weighted summation computation to store entity
    storeEntity.properties.push(
      Property.create({
        name: 'totalInventoryValue',
        type: 'number',
        computation: WeightedSummation.create({
          property: 'allInventoryItems',
          attributeQuery: ['unitPrice', 'quantity'],
          callback: (item: any) => {
            return {
              weight: item.quantity || 0,
              value: item.unitPrice || 0
            };
          }
        })
      })
    );

    const entities = [storeEntity, inventoryItemEntity];
    const relations = [storeWarehouseInventoryRelation, storeShowroomInventoryRelation, storeTotalInventoryRelation];

    // Setup system
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: relations,
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Create test data
    const store1 = await system.storage.create('Store', {
      name: 'Main Store',
      location: 'Downtown'
    });

    const item1 = await system.storage.create('InventoryItem', {
      productName: 'Laptop',
      unitPrice: 999,
      quantity: 5
    });

    const item2 = await system.storage.create('InventoryItem', {
      productName: 'Mouse',
      unitPrice: 25,
      quantity: 20
    });

    const item3 = await system.storage.create('InventoryItem', {
      productName: 'Keyboard',
      unitPrice: 75,
      quantity: 10
    });

    // Create relations through input relations
    await system.storage.create('StoreWarehouseInventory', {
      source: { id: store1.id },
      target: { id: item1.id }
    });

    await system.storage.create('StoreWarehouseInventory', {
      source: { id: store1.id },
      target: { id: item2.id }
    });

    await system.storage.create('StoreShowroomInventory', {
      source: { id: store1.id },
      target: { id: item3.id }
    });

    // Check total inventory value
    let storeData = await system.storage.findOne('Store',
      MatchExp.atom({ key: 'id', value: ['=', store1.id] }),
      undefined,
      ['id', 'name', 'totalInventoryValue']
    );

    // (999*5) + (25*20) + (75*10) = 4995 + 500 + 750 = 6245
    expect(storeData.totalInventoryValue).toBe(6245);

    // Update quantity of an item
    await system.storage.update('InventoryItem',
      MatchExp.atom({ key: 'id', value: ['=', item1.id] }),
      { quantity: 8 }
    );

    // Check updated value
    storeData = await system.storage.findOne('Store',
      MatchExp.atom({ key: 'id', value: ['=', store1.id] }),
      undefined,
      ['id', 'name', 'totalInventoryValue']
    );

    // (999*8) + (25*20) + (75*10) = 7992 + 500 + 750 = 9242
    expect(storeData.totalInventoryValue).toBe(9242);

    // Add a new item to showroom
    const item4 = await system.storage.create('InventoryItem', {
      productName: 'Monitor',
      unitPrice: 250,
      quantity: 3
    });

    await system.storage.create('StoreShowroomInventory', {
      source: { id: store1.id },
      target: { id: item4.id }
    });

    // Check final value
    storeData = await system.storage.findOne('Store',
      MatchExp.atom({ key: 'id', value: ['=', store1.id] }),
      undefined,
      ['id', 'name', 'totalInventoryValue']
    );

    // 9242 + (250*3) = 9242 + 750 = 9992
    expect(storeData.totalInventoryValue).toBe(9992);
  });
}); 