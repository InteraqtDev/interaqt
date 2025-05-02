import { describe, expect, test } from "vitest";
import {
  BoolExp,
  Controller,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
  Transform
} from '@';

describe('Transform computed handle', () => {
  
  test('should transform entity collection to another entity collection', async () => {
    // Create source entity
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'isAvailable', type: 'boolean', defaultValue: () => true})
      ]
    });
    
    // Create target entity for transformed products
    const discountedProductEntity = Entity.create({
      name: 'DiscountedProduct',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'originalPrice', type: 'number'}),
        Property.create({name: 'discountedPrice', type: 'number'}),
        Property.create({name: 'discount', type: 'string'})
      ],
      computedData: Transform.create({
        record: productEntity,
        attributeQuery: ['name', 'price', 'isAvailable'],
        callback: (product) => {
          return {
            name: product.name,
            originalPrice: product.price,
            discountedPrice: product.price * 0.9, // 10% discount
            discount: '10%'
          };
        }
      })
    });
    
    const entities = [productEntity, discountedProductEntity];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], [], []);
    await controller.setup(true);
    
    // Initial transformation should return empty array
    const initialTransform = await system.storage.find('DiscountedProduct');
    expect(initialTransform).toEqual([]);
    
    // Create products
    const product1 = await system.storage.create('Product', {name: 'Product 1', price: 100, isAvailable: true});
    const product2 = await system.storage.create('Product', {name: 'Product 2', price: 200, isAvailable: true});
    const product3 = await system.storage.create('Product', {name: 'Product 3', price: 0, isAvailable: true});
    
    // Check transformation results
    const transform1 = await system.storage.find('DiscountedProduct', undefined, undefined, ['*']);
    expect(transform1).toHaveLength(3);
    
    // Check specific product transformation
    const transformedProduct1 = transform1.find((p: any) => p.name === 'Product 1');
    expect(transformedProduct1).toBeDefined();
    expect(transformedProduct1.originalPrice).toBe(100);
    expect(transformedProduct1.discountedPrice).toBe(90);
    expect(transformedProduct1.discount).toBe('10%');
    
    
    // Update price of product2
    await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product2.id]}), {price: 150});
    // Check transformation after price update
    const transform3 = await system.storage.find('DiscountedProduct', undefined, undefined, ['*']);
    expect(transform3).toHaveLength(3);
    expect(transform3[1].originalPrice).toBe(150);
    expect(transform3[1].discountedPrice).toBe(135);
    
    // Delete product2
    await system.storage.delete('Product', BoolExp.atom({key: 'id', value: ['=', product2.id]}));
    
    // Check transformation after deletion
    const transform4 = await system.storage.find('DiscountedProduct', undefined, undefined, ['*']);
    expect(transform4).toHaveLength(2);
  });
  
  test('should transform relation collection to another entity collection', async () => {
    // Create entities
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'})
      ]
    });
    
    const orderEntity = Entity.create({
      name: 'Order',
      properties: [
        Property.create({name: 'product', type: 'string'}),
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'status', type: 'string'})
      ]
    });
    
    // Create relationship between user and orders
    const orderRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'orders',
      target: orderEntity,
      targetProperty: 'customer',
      name: 'userOrders',
      type: '1:n'
    });
    
    // Create target entity for order summaries
    const orderSummaryEntity = Entity.create({
      name: 'OrderSummary',
      properties: [
        Property.create({name: 'product', type: 'string'}),
        Property.create({name: 'totalAmount', type: 'number'}),
        Property.create({name: 'orderDate', type: 'string'})
      ],
      computedData: Transform.create({
        record: orderRelation,
        attributeQuery: [['target', {attributeQuery: ['product', 'quantity', 'price', 'status']}]],
        callback: (orderRelation) => {
          return {
            product: orderRelation.target.product,
            totalAmount: orderRelation.target.quantity * orderRelation.target.price,
            orderDate: new Date().toISOString().split('T')[0] // Just for testing
          };
        }
      })
    });
    
    const entities = [userEntity, orderEntity, orderSummaryEntity];
    const relations = [orderRelation];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // Create user
    const user = await system.storage.create('User', {username: 'testuser'});
    
    // Check initial order summaries
    const initialSummaries = await system.storage.find('OrderSummary');
    expect(initialSummaries).toEqual([]);
    
    // Create orders for the user with different statuses
    const order1 = await system.storage.create('Order', {
      product: 'Product A',
      quantity: 2,
      price: 50,
      status: 'pending',
      customer: user
    });
    
    const order2 = await system.storage.create('Order', {
      product: 'Product B',
      quantity: 1,
      price: 100,
      status: 'completed',
      customer: user
    });
    
    // Check order summaries after creation
    const summaries1 = await system.storage.find('OrderSummary', undefined, undefined, ['*']);
    expect(summaries1).toHaveLength(2);
    expect(summaries1[0].product).toBe('Product A');
    expect(summaries1[0].totalAmount).toBe(100);
    
    // Update pending order to completed
    await system.storage.update('Order', BoolExp.atom({key: 'id', value: ['=', order1.id]}), {status: 'completed'});
    
    // Check order summaries after update
    const summaries2 = await system.storage.find('OrderSummary', undefined, undefined, ['*']);
    expect(summaries2).toHaveLength(2);
    
    // Find the Product A order summary
    const productAOrder = summaries2.find((summary: any) => summary.product === 'Product A');
    expect(productAOrder).toBeDefined();
    expect(productAOrder.totalAmount).toBe(100); // 2 * 50
    
    // Update quantity of an order
    await system.storage.update('Order', BoolExp.atom({key: 'id', value: ['=', order2.id]}), {quantity: 3});
    
    // Check order summaries after quantity update
    const summaries3 = await system.storage.find('OrderSummary', undefined, undefined, ['*']);
    const updatedOrder = summaries3.find((summary: any) => summary.product === 'Product B');
    expect(updatedOrder.totalAmount).toBe(300); // 3 * 100
    
    // Delete an order
    await system.storage.delete('Order', BoolExp.atom({key: 'id', value: ['=', order1.id]}));
    
    // Check order summaries after deletion
    const summaries4 = await system.storage.find('OrderSummary', undefined, undefined, ['*']);
    expect(summaries4).toHaveLength(1);
    expect(summaries4[0].product).toBe('Product B');
  });
  
  
}); 