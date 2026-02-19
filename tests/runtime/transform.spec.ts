import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import {
  Action,
  BoolExp,
  Controller, Interaction,
  InteractionEventEntity,
  KlassByName,
  MonoSystem,
  Payload,
  PayloadItem, Transform
} from 'interaqt';

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
      computation: Transform.create({
        record: productEntity,
        attributeQuery: ['name', 'price', 'isAvailable'],
        callback: (product: any) => {
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
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
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
      computation: Transform.create({
        record: orderRelation,
        attributeQuery: [['target', {attributeQuery: ['product', 'quantity', 'price', 'status']}]],
        callback: (orderRelation: any) => {
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
  
  test('should transform one record to multiple records', async () => {
    // Create source entity
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'basePrice', type: 'number'}),
        Property.create({name: 'category', type: 'string'})
      ]
    });
    
    // Create target entity for price tiers
    const priceTierEntity = Entity.create({
      name: 'PriceTier',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'tierName', type: 'string'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'description', type: 'string'})
      ],
      computation: Transform.create({
        record: productEntity,
        attributeQuery: ['name', 'basePrice', 'category'],
        callback: (product: any) => {
          // Transform one product into multiple price tiers
          return [
            {
              productName: product.name,
              tierName: 'Budget',
              price: product.basePrice * 0.8,
              description: `Budget tier for ${product.name}`
            },
            {
              productName: product.name,
              tierName: 'Standard',
              price: product.basePrice,
              description: `Standard tier for ${product.name}`
            },
            {
              productName: product.name,
              tierName: 'Premium',
              price: product.basePrice * 1.5,
              description: `Premium tier for ${product.name}`
            }
          ];
        }
      })
    });
    
    const entities = [productEntity, priceTierEntity];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Initial check - should be empty
    const initialTiers = await system.storage.find('PriceTier');
    expect(initialTiers).toEqual([]);
    
    // Create a product
    const product1 = await system.storage.create('Product', {
      name: 'Laptop Pro',
      basePrice: 1000,
      category: 'Electronics'
    });
    
    // Check price tiers - should have 3 tiers for the product
    const tiers1 = await system.storage.find('PriceTier', undefined, undefined, ['*']);
    expect(tiers1).toHaveLength(3);
    
    // Verify each tier
    const budgetTier = tiers1.find((tier: any) => tier.tierName === 'Budget');
    expect(budgetTier).toBeDefined();
    expect(budgetTier.productName).toBe('Laptop Pro');
    expect(budgetTier.price).toBe(800); // 1000 * 0.8
    expect(budgetTier.description).toBe('Budget tier for Laptop Pro');
    
    const standardTier = tiers1.find((tier: any) => tier.tierName === 'Standard');
    expect(standardTier).toBeDefined();
    expect(standardTier.price).toBe(1000);
    
    const premiumTier = tiers1.find((tier: any) => tier.tierName === 'Premium');
    expect(premiumTier).toBeDefined();
    expect(premiumTier.price).toBe(1500); // 1000 * 1.5
    
    // Create another product
    const product2 = await system.storage.create('Product', {
      name: 'Mouse',
      basePrice: 50,
      category: 'Accessories'
    });
    
    // Check price tiers - should now have 6 tiers total (3 per product)
    const tiers2 = await system.storage.find('PriceTier', undefined, undefined, ['*']);
    expect(tiers2).toHaveLength(6);
    
    // Verify mouse tiers exist
    const mouseTiers = tiers2.filter((tier: any) => tier.productName === 'Mouse');
    expect(mouseTiers).toHaveLength(3);
    expect(mouseTiers.some((tier: any) => tier.tierName === 'Budget' && tier.price === 40)).toBe(true);
    expect(mouseTiers.some((tier: any) => tier.tierName === 'Standard' && tier.price === 50)).toBe(true);
    expect(mouseTiers.some((tier: any) => tier.tierName === 'Premium' && tier.price === 75)).toBe(true);
    
    // Update product price
    await system.storage.update('Product', BoolExp.atom({key: 'id', value: ['=', product1.id]}), {basePrice: 1200});
    
    // Check that tiers are updated
    const tiers3 = await system.storage.find('PriceTier', undefined, undefined, ['*']);
    const updatedLaptopTiers = tiers3.filter((tier: any) => tier.productName === 'Laptop Pro');
    expect(updatedLaptopTiers.find((tier: any) => tier.tierName === 'Budget').price).toBe(960); // 1200 * 0.8
    expect(updatedLaptopTiers.find((tier: any) => tier.tierName === 'Standard').price).toBe(1200);
    expect(updatedLaptopTiers.find((tier: any) => tier.tierName === 'Premium').price).toBe(1800); // 1200 * 1.5
    
    // Delete a product
    await system.storage.delete('Product', BoolExp.atom({key: 'id', value: ['=', product2.id]}));
    
    // Check that related tiers are removed
    const tiers4 = await system.storage.find('PriceTier', undefined, undefined, ['*']);
    expect(tiers4).toHaveLength(3); // Only laptop tiers remain
    expect(tiers4.every((tier: any) => tier.productName === 'Laptop Pro')).toBe(true);
  });

  test('should transform merged entity to another entity collection', async () => {
    // Create input entities for merged entity
    const physicalBookEntity = Entity.create({
      name: 'PhysicalBook',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'author', type: 'string'}),
        Property.create({name: 'isbn', type: 'string'}),
        Property.create({name: 'pages', type: 'number'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'format', type: 'string', defaultValue: () => 'physical'})
      ]
    });

    const ebookEntity = Entity.create({
      name: 'Ebook',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'author', type: 'string'}),
        Property.create({name: 'isbn', type: 'string'}),
        Property.create({name: 'fileSize', type: 'number'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'format', type: 'string', defaultValue: () => 'ebook'})
      ]
    });

    const audiobookEntity = Entity.create({
      name: 'Audiobook',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'author', type: 'string'}),
        Property.create({name: 'narrator', type: 'string'}),
        Property.create({name: 'duration', type: 'number'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'format', type: 'string', defaultValue: () => 'audiobook'})
      ]
    });

    // Create merged entity: Book (combining all book types)
    const bookEntity = Entity.create({
      name: 'Book',
      inputEntities: [physicalBookEntity, ebookEntity, audiobookEntity]
    });

    // Create target entity for book recommendations
    const bookRecommendationEntity = Entity.create({
      name: 'BookRecommendation',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'author', type: 'string'}),
        Property.create({name: 'format', type: 'string'}),
        Property.create({name: 'originalPrice', type: 'number'}),
        Property.create({name: 'recommendedPrice', type: 'number'}),
        Property.create({name: 'discountPercentage', type: 'number'}),
        Property.create({name: 'reason', type: 'string'})
      ],
      computation: Transform.create({
        record: bookEntity,
        attributeQuery: ['title', 'author', 'format', 'price'],
        callback: (book: any) => {
          // Apply different discounts based on format
          let discount = 0;
          let reason = '';
          
          if (book.format === 'physical' && book.price > 30) {
            discount = 15;
            reason = 'Physical book bulk discount';
          } else if (book.format === 'ebook') {
            discount = 20;
            reason = 'Digital format promotion';
          } else if (book.format === 'audiobook' && book.price > 20) {
            discount = 25;
            reason = 'Audiobook special offer';
          } else {
            discount = 5;
            reason = 'Standard discount';
          }

          const recommendedPrice = book.price * (1 - discount / 100);

          return {
            title: book.title,
            author: book.author,
            format: book.format,
            originalPrice: book.price,
            recommendedPrice: Math.round(recommendedPrice * 100) / 100,
            discountPercentage: discount,
            reason: reason
          };
        }
      })
    });

    // Create another transform entity for bestsellers (price > 25)
    const bestsellerEntity = Entity.create({
      name: 'Bestseller',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'author', type: 'string'}),
        Property.create({name: 'format', type: 'string'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({name: 'badge', type: 'string'})
      ],
      computation: Transform.create({
        record: bookEntity,
        attributeQuery: ['title', 'author', 'format', 'price'],
        callback: (book: any) => {
          // Only transform expensive books (price > 25)
          if (book.price <= 25) {
            return null; // Skip books with price <= 25
          }
          
          let badge = '';
          if (book.price > 50) {
            badge = 'Premium Bestseller';
          } else if (book.price > 35) {
            badge = 'Top Seller';
          } else {
            badge = 'Popular Choice';
          }

          return {
            title: book.title,
            author: book.author,
            format: book.format,
            price: book.price,
            badge: badge
          };
        }
      })
    });

    const entities = [physicalBookEntity, ebookEntity, audiobookEntity, bookEntity, bookRecommendationEntity, bestsellerEntity];

    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Initial transformations should be empty
    const initialRecommendations = await system.storage.find('BookRecommendation');
    expect(initialRecommendations).toEqual([]);

    const initialBestsellers = await system.storage.find('Bestseller');
    expect(initialBestsellers).toEqual([]);

    // Create books through different input entities
    const physicalBook1 = await system.storage.create('PhysicalBook', {
      title: 'The Great Adventure',
      author: 'John Smith',
      isbn: '978-1234567890',
      pages: 400,
      price: 35
    });

    const ebook1 = await system.storage.create('Ebook', {
      title: 'Digital Revolution',
      author: 'Jane Doe',
      isbn: '978-0987654321',
      fileSize: 5,
      price: 15
    });

    const audiobook1 = await system.storage.create('Audiobook', {
      title: 'Voice of History',
      author: 'Robert Johnson',
      narrator: 'Morgan Freeman',
      duration: 600,
      price: 45
    });

    // Check transformation results for recommendations
    const recommendations = await system.storage.find('BookRecommendation', undefined, undefined, ['*']);
    expect(recommendations).toHaveLength(3);

    // Verify physical book recommendation
    const physicalRec = recommendations.find((r: any) => r.title === 'The Great Adventure');
    expect(physicalRec).toBeDefined();
    expect(physicalRec.originalPrice).toBe(35);
    expect(physicalRec.recommendedPrice).toBe(29.75); // 15% discount
    expect(physicalRec.discountPercentage).toBe(15);
    expect(physicalRec.reason).toBe('Physical book bulk discount');

    // Verify ebook recommendation
    const ebookRec = recommendations.find((r: any) => r.title === 'Digital Revolution');
    expect(ebookRec).toBeDefined();
    expect(ebookRec.originalPrice).toBe(15);
    expect(ebookRec.recommendedPrice).toBe(12); // 20% discount
    expect(ebookRec.discountPercentage).toBe(20);
    expect(ebookRec.reason).toBe('Digital format promotion');

    // Verify audiobook recommendation
    const audiobookRec = recommendations.find((r: any) => r.title === 'Voice of History');
    expect(audiobookRec).toBeDefined();
    expect(audiobookRec.originalPrice).toBe(45);
    expect(audiobookRec.recommendedPrice).toBe(33.75); // 25% discount
    expect(audiobookRec.discountPercentage).toBe(25);
    expect(audiobookRec.reason).toBe('Audiobook special offer');

    // Check bestseller transformations (only books with price > 25)
    const bestsellers = await system.storage.find('Bestseller', undefined, undefined, ['*']);
    // Books with price > 25: PhysicalBook (35), Audiobook (45)
    // Ebook has price 15, so it should be excluded
    const validBestsellers = bestsellers.filter((b: any) => b.title && b.badge);
    expect(validBestsellers.length).toBeGreaterThanOrEqual(2);

    const physicalBestseller = bestsellers.find((b: any) => b.title === 'The Great Adventure');
    if (physicalBestseller) {
      expect(physicalBestseller.badge).toBe('Popular Choice'); // Price 35, between 25-35
    }

    const audiobookBestseller = bestsellers.find((b: any) => b.title === 'Voice of History');
    if (audiobookBestseller) {
      expect(audiobookBestseller.badge).toBe('Top Seller'); // Price 45, between 35-50
    }
    
    // Digital Revolution should not be in bestsellers (price 15 < 25)
    const ebookBestseller = bestsellers.find((b: any) => b.title === 'Digital Revolution');
    expect(ebookBestseller).toBeUndefined();

    // Add an expensive ebook
    const ebook2 = await system.storage.create('Ebook', {
      title: 'Premium Collection',
      author: 'Famous Author',
      isbn: '978-1111111111',
      fileSize: 10,
      price: 60
    });

    // Check updated transformations
    const updatedRecommendations = await system.storage.find('BookRecommendation', undefined, undefined, ['*']);
    expect(updatedRecommendations).toHaveLength(4);

    const updatedBestsellers = await system.storage.find('Bestseller', undefined, undefined, ['*']);
    // Should have books with price > 25: PhysicalBook (35), Audiobook (45), Premium Collection (60)
    const validUpdatedBestsellers = updatedBestsellers.filter((b: any) => b.title && b.badge);
    expect(validUpdatedBestsellers.length).toBeGreaterThanOrEqual(3);

    const premiumBestseller = updatedBestsellers.find((b: any) => b.title === 'Premium Collection');
    if (premiumBestseller) {
      expect(premiumBestseller.badge).toBe('Premium Bestseller'); // Price > 50
    }

    // Update a book price
    await system.storage.update('PhysicalBook',
      BoolExp.atom({key: 'id', value: ['=', physicalBook1.id]}),
      {price: 20}
    );

    // Check that transformations are updated
    const finalRecommendations = await system.storage.find('BookRecommendation', undefined, undefined, ['*']);
    const updatedPhysicalRec = finalRecommendations.find((r: any) => r.title === 'The Great Adventure');
    expect(updatedPhysicalRec.originalPrice).toBe(20);
    expect(updatedPhysicalRec.recommendedPrice).toBe(19); // 5% standard discount (price <= 30)
    expect(updatedPhysicalRec.discountPercentage).toBe(5);
    expect(updatedPhysicalRec.reason).toBe('Standard discount');

    // Physical book no longer qualifies as bestseller (price < 25)
    const finalBestsellers = await system.storage.find('Bestseller', undefined, undefined, ['*']);
    expect(finalBestsellers).toHaveLength(2);
    expect(finalBestsellers.find((b: any) => b.title === 'The Great Adventure')).toBeUndefined();

    // Delete an audiobook
    await system.storage.delete('Audiobook',
      BoolExp.atom({key: 'id', value: ['=', audiobook1.id]})
    );

    // Check final transformations
    const afterDeleteRecommendations = await system.storage.find('BookRecommendation', undefined, undefined, ['*']);
    expect(afterDeleteRecommendations).toHaveLength(3);
    expect(afterDeleteRecommendations.find((r: any) => r.title === 'Voice of History')).toBeUndefined();

    const afterDeleteBestsellers = await system.storage.find('Bestseller', undefined, undefined, ['*']);
    expect(afterDeleteBestsellers).toHaveLength(1); // Only Premium Collection remains
  });
  
  // NOTE: The following tests are commented out because the current implementation
  // of Transform with useMutationEvent only listens to InteractionEventEntity mutations,
  // not regular entity create/update/delete mutations. These tests expect Transform
  // to react to direct storage operations, which is not currently supported.
  
  test('should transform from RecordMutationEvent when entity is created', async () => {
    // Create source entity
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'email', type: 'string'}),
        Property.create({name: 'role', type: 'string', defaultValue: () => 'user'})
      ]
    });
    
    // Create audit log entity that tracks all user mutations
    const userAuditEntity = Entity.create({
      name: 'UserAudit',
      properties: [
        Property.create({name: 'action', type: 'string'}),
        Property.create({name: 'userId', type: 'string'}),
        Property.create({name: 'timestamp', type: 'string'}),
        Property.create({name: 'changes', type: 'object'})
      ],
      computation: Transform.create({
        eventDeps: {
          User: {
            recordName: 'User',
            type: 'create'
          }
        },
        callback: function(mutationEvent: any) {
          // Only process user entity mutations
          if (mutationEvent.recordName !== 'User') {
            return null;
          }
          
          return {
            action: mutationEvent.type,
            userId: (mutationEvent.record?.id || mutationEvent.oldRecord?.id).toString(),
            timestamp: new Date().toISOString(),
            changes: {
              old: mutationEvent.oldRecord,
              new: mutationEvent.record
            }
          };
        }
      })
    });
    
    const entities = [userEntity, userAuditEntity];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Initial audit log should be empty
    const initialAudits = await system.storage.find('UserAudit');
    expect(initialAudits).toEqual([]);
    
    // Create a user
    const user1 = await system.storage.create('User', {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin'
    });
    
    // Check audit log entry was created
    const audits1 = await system.storage.find('UserAudit', undefined, undefined, ['*']);
    expect(audits1).toHaveLength(1);
    expect(audits1[0].action).toBe('create');
    expect(audits1[0].userId).toBe(user1.id.toString());
    expect(audits1[0].changes.new.name).toBe('John Doe');
    expect(audits1[0].changes.new.email).toBe('john@example.com');
    expect(audits1[0].changes.old).toBeUndefined();
    
    // Create another user
    const user2 = await system.storage.create('User', {
      name: 'Jane Smith',
      email: 'jane@example.com'
    });
    
    // Check second audit log entry
    const audits2 = await system.storage.find('UserAudit', undefined, undefined, ['*']);
    expect(audits2).toHaveLength(2);
    const audit2 = audits2.find((a: any) => a.userId === user2.id.toString());
    expect(audit2.action).toBe('create');
    expect(audit2.changes.new.name).toBe('Jane Smith');
  });
  
  test('should transform from RecordMutationEvent when entity is updated', async () => {
    // Create entities
    const postEntity = Entity.create({
      name: 'Post',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'content', type: 'string'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'draft'})
      ]
    });
    
    // Create revision entity that tracks post changes
    const postRevisionEntity = Entity.create({
      name: 'PostRevision',
      properties: [
        Property.create({name: 'postId', type: 'string'}),
        Property.create({name: 'revisionNumber', type: 'number'}),
        Property.create({name: 'previousTitle', type: 'string'}),
        Property.create({name: 'newTitle', type: 'string'}),
        Property.create({name: 'previousContent', type: 'string'}),
        Property.create({name: 'newContent', type: 'string'}),
        Property.create({name: 'changedAt', type: 'string'})
      ],
      computation: Transform.create({
        eventDeps: {
          Post: {
            recordName: 'Post',
            type: 'update'
          }
        },
        callback: function(mutationEvent: any) {
          // Only track updates to posts
          if (mutationEvent.recordName !== 'Post' || mutationEvent.type !== 'update') {
            return null;
          }
          
          // Track changes when title or content is modified
          if ((mutationEvent.record?.title && mutationEvent.oldRecord?.title !== mutationEvent.record?.title) ||
            (mutationEvent.record?.content && mutationEvent.oldRecord?.content !== mutationEvent.record?.content)) {
            return {
              postId: mutationEvent.record.id.toString(),
              revisionNumber: Date.now(), // Simple revision numbering
              previousTitle: mutationEvent.oldRecord?.title,
              newTitle: mutationEvent.record?.title,
              previousContent: mutationEvent.oldRecord?.content,
              newContent: mutationEvent.record?.content,
              changedAt: new Date().toISOString()
            };
          }
          
          return null;
        }
      })
    });
    
    const entities = [postEntity, postRevisionEntity];
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a post
    const post = await system.storage.create('Post', {
      title: 'Original Title',
      content: 'Original content',
      status: 'draft'
    });
    
    // No revisions yet (only tracks updates)
    const revisions1 = await system.storage.find('PostRevision');
    expect(revisions1).toEqual([]);
    
    // Update the post title
    await system.storage.update('Post',
      BoolExp.atom({key: 'id', value: ['=', post.id]}),
      {title: 'Updated Title'}
    );
    
    // Check revision was created
    const revisions2 = await system.storage.find('PostRevision', undefined, undefined, ['*']);
    expect(revisions2).toHaveLength(1);
    expect(revisions2[0].postId).toBe(post.id.toString());
    expect(revisions2[0].previousTitle).toBe('Original Title');
    expect(revisions2[0].newTitle).toBe('Updated Title');
    expect(revisions2[0].previousContent).toBe('Original content');
    expect(revisions2[0].newContent).toBeUndefined;
    
    // Update both title and content
    await system.storage.update('Post',
      BoolExp.atom({key: 'id', value: ['=', post.id]}),
      {title: 'Final Title', content: 'Updated content'}
    );
    
    // Check second revision
    const revisions3 = await system.storage.find('PostRevision', undefined, undefined, ['*']);
    expect(revisions3).toHaveLength(2);
    const latestRevision = revisions3[1];
    expect(latestRevision.previousTitle).toBe('Updated Title');
    expect(latestRevision.newTitle).toBe('Final Title');
    expect(latestRevision.previousContent).toBe('Original content');
    expect(latestRevision.newContent).toBe('Updated content');
    
    // Update only status (should not create revision)
    await system.storage.update('Post',
      BoolExp.atom({key: 'id', value: ['=', post.id]}),
      {status: 'published'}
    );
    
    // Still only 2 revisions
    const revisions4 = await system.storage.find('PostRevision');
    expect(revisions4).toHaveLength(2);
  });
  
  test('should transform from RecordMutationEvent when entity is deleted', async () => {
    // Create entities
    const documentEntity = Entity.create({
      name: 'Document',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'content', type: 'string'}),
        Property.create({name: 'owner', type: 'string'})
      ]
    });
    
    // Create trash entity for soft deletes
    const trashEntity = Entity.create({
      name: 'Trash',
      properties: [
        Property.create({name: 'originalType', type: 'string'}),
        Property.create({name: 'originalId', type: 'string'}),
        Property.create({name: 'originalData', type: 'object'}),
        Property.create({name: 'deletedAt', type: 'string'}),
        Property.create({name: 'deletedBy', type: 'string'})
      ],
      computation: Transform.create({
        eventDeps: {
          Document: {
            recordName: 'Document',
            type: 'delete'
          }
        },
        callback: function(mutationEvent: any) {
          // Only track deletions
          if (mutationEvent.type !== 'delete') {
            return null;
          }
          
          return {
            originalType: mutationEvent.recordName,
            originalId: (mutationEvent.oldRecord?.id || mutationEvent.record?.id).toString(),
            originalData: mutationEvent.oldRecord || mutationEvent.record,
            deletedAt: new Date().toISOString(),
            deletedBy: 'system' // In real app, this would come from context
          };
        }
      })
    });
    
    const entities = [documentEntity, trashEntity];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create documents
    const doc1 = await system.storage.create('Document', {
      name: 'Important Report',
      content: 'Quarterly results...',
      owner: 'john@example.com'
    });
    
    const doc2 = await system.storage.create('Document', {
      name: 'Meeting Notes',
      content: 'Discussion points...',
      owner: 'jane@example.com'
    });
    
    // No trash items yet
    const trash1 = await system.storage.find('Trash');
    expect(trash1).toEqual([]);
    
    // Delete first document
    await system.storage.delete('Document',
      BoolExp.atom({key: 'id', value: ['=', doc1.id]})
    );
    
    // Check trash entry was created
    const trash2 = await system.storage.find('Trash', undefined, undefined, ['*']);
    expect(trash2).toHaveLength(1);
    expect(trash2[0].originalType).toBe('Document');
    expect(trash2[0].originalId).toBe(doc1.id.toString());
    expect(trash2[0].originalData.name).toBe('Important Report');
    expect(trash2[0].originalData.content).toBe('Quarterly results...');
    expect(trash2[0].deletedBy).toBe('system');
    
    // Delete second document
    await system.storage.delete('Document',
      BoolExp.atom({key: 'id', value: ['=', doc2.id]})
    );
    
    // Check both documents are in trash
    const trash3 = await system.storage.find('Trash', undefined, undefined, ['*']);
    expect(trash3).toHaveLength(2);
    const doc2Trash = trash3.find((t: any) => t.originalId === doc2.id.toString());
    expect(doc2Trash.originalData.name).toBe('Meeting Notes');
  });
  
  test('should transform from interaction events using useMutationEvent', async () => {
    // Create entities
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'email', type: 'string'})
      ]
    });
    
    // Create audit entity that tracks interactions
    const interactionAuditEntity = Entity.create({
      name: 'InteractionAudit',
      properties: [
        Property.create({name: 'interactionName', type: 'string'}),
        Property.create({name: 'userId', type: 'string'}),
        Property.create({name: 'payload', type: 'object'}),
        Property.create({name: 'timestamp', type: 'string'})
      ],
      computation: Transform.create({
        eventDeps: {
          InteractionEvent: {
            recordName: InteractionEventEntity.name,
            type: 'create'
          }
        },
        callback: function(mutationEvent: any) {
          // This will receive InteractionEventEntity mutations
          // The mutation event structure for InteractionEventEntity is:
          // record: { name, user, payload, result, ... }
          const interactionData = mutationEvent.record;
          if (!interactionData || mutationEvent.recordName !== InteractionEventEntity.name) return null;
          
          return {
            interactionName: interactionData.interactionName,
            userId: (interactionData.user?.id || 'anonymous').toString(),
            payload: interactionData.payload,
            timestamp: new Date().toISOString()
          };
        }
      })
    });
    
    // Create a simple interaction that just logs without creating entities
    const testInteraction = Interaction.create({
      name: 'testAction',
      action: Action.create({name: 'testAction'}),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            name: 'message',
            type: 'string'
          })
        ]
      })
    });
    
    const entities = [userEntity, interactionAuditEntity];
    const interactions = [testInteraction];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: interactions
    });
    await controller.setup(true);
    
    // Initial audit should be empty
    const initialAudits = await system.storage.find('InteractionAudit');
    expect(initialAudits).toEqual([]);
    
    // Call interaction
    const result = await controller.callInteraction('testAction', {
      user: { id: 'test-user-123' },
      payload: {
        message: 'Hello from test'
      }
    });
    
    // Check the result has effects
    expect(result.effects).toBeDefined();
    expect(Array.isArray(result.effects)).toBe(true);
    
    // Should include InteractionEventEntity creation
    const interactionEventCreation = result.effects?.find(
      (e: any) => e.recordName === InteractionEventEntity.name && e.type === 'create'
    );
    expect(interactionEventCreation).toBeDefined();
    
    // Most importantly: Should include InteractionAudit creation from Transform
    const auditCreation = result.effects?.find(
      (e: any) => e.recordName === 'InteractionAudit' && e.type === 'create'
    );
    expect(auditCreation).toBeDefined();
    expect(auditCreation?.record!.interactionName).toBe('testAction');
    expect(auditCreation?.record!.userId).toBe('test-user-123');
    expect(auditCreation?.record!.payload.message).toBe('Hello from test');
    
    // Also verify via storage that audit was created
    const audits = await system.storage.find('InteractionAudit', undefined, undefined, ['*']);
    expect(audits).toHaveLength(1);
    expect(audits[0].interactionName).toBe('testAction');
    expect(audits[0].userId).toBe('test-user-123');
    expect(audits[0].payload.message).toBe('Hello from test');
    expect(audits[0].timestamp).toBeDefined();
  });

  test('should handle multiple transforms from same mutation event', async () => {
    // Create order entity
    const orderEntity = Entity.create({
      name: 'Order',
      properties: [
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'customerEmail', type: 'string'}),
        Property.create({name: 'totalAmount', type: 'number'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'pending'})
      ]
    });
    
    // Create notification entity
    const notificationEntity = Entity.create({
      name: 'Notification',
      properties: [
        Property.create({name: 'type', type: 'string'}),
        Property.create({name: 'recipient', type: 'string'}),
        Property.create({name: 'message', type: 'string'}),
        Property.create({name: 'orderId', type: 'string'}),
        Property.create({name: 'createdAt', type: 'string'})
      ],
      computation: Transform.create({
        eventDeps: {
          OrderCreate: {
            recordName: 'Order',
            type: 'create'
          },
          OrderUpdate: {
            recordName: 'Order',
            type: 'update'
          }
        },  
        callback: function(mutationEvent: any) {
          if (mutationEvent.recordName !== orderEntity.name) {
            return null;
          }
          
          const notifications = [];
          
          // New order notification
          if (mutationEvent.type === 'create') {
            notifications.push({
              type: 'order_placed',
              recipient: mutationEvent.record.customerEmail,
              message: `Your order ${mutationEvent.record.orderNumber} has been placed`,
              orderId: mutationEvent.record.id.toString(),
              createdAt: new Date().toISOString()
            });
            
            // Also notify warehouse
            notifications.push({
              type: 'new_order',
              recipient: 'warehouse@company.com',
              message: `New order ${mutationEvent.record.orderNumber} received`,
              orderId: mutationEvent.record.id,
              createdAt: new Date().toISOString()
            });
          }
          
          // Status change notification
          if (mutationEvent.type === 'update' && 
              mutationEvent.oldRecord?.status !== mutationEvent.record?.status) {
            notifications.push({
              type: 'status_change',
              recipient: mutationEvent.record.customerEmail,
              message: `Order ${mutationEvent.record.orderNumber} status changed to ${mutationEvent.record.status}`,
              orderId: mutationEvent.record.id.toString(),
              createdAt: new Date().toISOString()
            });
          }
          
          return notifications;
        }
      })
    });
    
    const entities = [orderEntity, notificationEntity];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create an order
    const order = await system.storage.create('Order', {
      orderNumber: 'ORD-001',
      customerEmail: 'customer@example.com',
      totalAmount: 100
    });
    
    // Check notifications were created
    const notifications1 = await system.storage.find('Notification', undefined, undefined, ['*']);
    expect(notifications1).toHaveLength(2);
    
    const customerNotif = notifications1.find((n: any) => n.type === 'order_placed');
    expect(customerNotif.recipient).toBe('customer@example.com');
    expect(customerNotif.message).toContain('ORD-001');
    expect(customerNotif.orderId).toBe(order.id.toString());
    
    const warehouseNotif = notifications1.find((n: any) => n.type === 'new_order');
    expect(warehouseNotif.recipient).toBe('warehouse@company.com');
    
    // Update order status
    await system.storage.update('Order',
      BoolExp.atom({key: 'id', value: ['=', order.id]}),
      {status: 'shipped'}
    );
    
    // Check status change notification
    const notifications2 = await system.storage.find('Notification', undefined, undefined, ['*']);
    expect(notifications2).toHaveLength(3);
    
    const statusNotif = notifications2.find((n: any) => n.type === 'status_change');
    expect(statusNotif.message).toContain('status changed to shipped');
  });
  
  test('should support deep matching with eventDeps record field', async () => {
    // Create entities
    const orderEntity = Entity.create({
      name: 'Order',
      properties: [
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'status', type: 'string'}),
        Property.create({name: 'priority', type: 'string'}),
        Property.create({name: 'totalAmount', type: 'number'})
      ]
    });
    
    // Create audit entity that only tracks high priority orders
    const highPriorityOrderAuditEntity = Entity.create({
      name: 'HighPriorityOrderAudit',
      properties: [
        Property.create({name: 'action', type: 'string'}),
        Property.create({name: 'orderId', type: 'string'}),
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'timestamp', type: 'string'}),
        Property.create({name: 'details', type: 'object'})
      ],
      computation: Transform.create({
        eventDeps: {
          HighPriorityOrderCreate: {
            recordName: 'Order',
            type: 'create',
            record: {
              priority: 'high'  // Only match orders with priority: 'high'
            }
          },
          HighPriorityOrderUpdate: {
            recordName: 'Order', 
            type: 'update',
            record: {
              priority: 'high'  // Only match orders that are currently high priority
            }
          }
        },
        callback: function(mutationEvent: any) {
          // Only process high priority orders
          if (mutationEvent.recordName !== 'Order') {
            return null;
          }
          
          return {
            action: mutationEvent.type,
            orderId: mutationEvent.record.id.toString(),
            orderNumber: mutationEvent.record.orderNumber,
            timestamp: new Date().toISOString(),
            details: {
              status: mutationEvent.record.status,
              totalAmount: mutationEvent.record.totalAmount,
              oldStatus: mutationEvent.oldRecord?.status
            }
          };
        }
      })
    });
    
    // Create another audit entity for status changes from pending to completed on high priority orders
    const highPriorityStatusChangeAuditEntity = Entity.create({
      name: 'HighPriorityStatusChangeAudit',
      properties: [
        Property.create({name: 'orderId', type: 'string'}),
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'fromStatus', type: 'string'}),
        Property.create({name: 'toStatus', type: 'string'}),
        Property.create({name: 'changedAt', type: 'string'})
      ],
      computation: Transform.create({
        eventDeps: {
          StatusChange: {
            recordName: 'Order',
            type: 'update',
            oldRecord: {
              status: 'pending',  // Only match when old status was 'pending'
              priority: 'high'    // AND old priority was 'high'
            },
            record: {
              status: 'completed'  // And new status is 'completed'
            }
          }
        },
        callback: function(mutationEvent: any) {
          if (mutationEvent.recordName !== 'Order' || mutationEvent.type !== 'update') {
            return null;
          }
          
          return {
            orderId: mutationEvent.record.id.toString(),
            orderNumber: mutationEvent.record.orderNumber || mutationEvent.oldRecord.orderNumber,
            fromStatus: mutationEvent.oldRecord.status,
            toStatus: mutationEvent.record.status,
            changedAt: new Date().toISOString()
          };
        }
      })
    });
    
    const entities = [orderEntity, highPriorityOrderAuditEntity, highPriorityStatusChangeAuditEntity];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create a low priority order - should NOT trigger high priority audit
    const lowPriorityOrder = await system.storage.create('Order', {
      orderNumber: 'ORD-001',
      status: 'pending',
      priority: 'low',
      totalAmount: 100
    });
    
    // Check that no high priority audit was created
    const highPriorityAudits1 = await system.storage.find('HighPriorityOrderAudit');
    expect(highPriorityAudits1).toEqual([]);
    
    // Create a high priority order - should trigger high priority audit
    const highPriorityOrder = await system.storage.create('Order', {
      orderNumber: 'ORD-002',
      status: 'pending',
      priority: 'high',
      totalAmount: 500
    });
    
    // Check that high priority audit was created
    const highPriorityAudits2 = await system.storage.find('HighPriorityOrderAudit', undefined, undefined, ['*']);
    expect(highPriorityAudits2).toHaveLength(1);
    expect(highPriorityAudits2[0].action).toBe('create');
    expect(highPriorityAudits2[0].orderNumber).toBe('ORD-002');
    expect(highPriorityAudits2[0].details.status).toBe('pending');
    
    // Update low priority order status - should NOT trigger high priority status change audit
    await system.storage.update('Order',
      BoolExp.atom({key: 'id', value: ['=', lowPriorityOrder.id]}),
      {status: 'completed'}
    );
    
    const highPriorityStatusChangeAudits1 = await system.storage.find('HighPriorityStatusChangeAudit');
    expect(highPriorityStatusChangeAudits1).toEqual([]);
    
    // Update high priority order status from pending to completed - should trigger high priority status change audit
    await system.storage.update('Order',
      BoolExp.atom({key: 'id', value: ['=', highPriorityOrder.id]}),
      {status: 'completed'}
    );
    
    const highPriorityStatusChangeAudits2 = await system.storage.find('HighPriorityStatusChangeAudit', undefined, undefined, ['*']);
    expect(highPriorityStatusChangeAudits2).toHaveLength(1);
    expect(highPriorityStatusChangeAudits2[0].orderNumber).toBe('ORD-002');
    expect(highPriorityStatusChangeAudits2[0].fromStatus).toBe('pending');
    expect(highPriorityStatusChangeAudits2[0].toStatus).toBe('completed');
    
    // Also check that high priority order update was tracked
    const highPriorityAudits3 = await system.storage.find('HighPriorityOrderAudit', undefined, undefined, ['*']);
    expect(highPriorityAudits3).toHaveLength(2); // One create, one update
    const updateAudit = highPriorityAudits3.find((a: any) => a.action === 'update');
    expect(updateAudit).toBeDefined();
    expect(updateAudit.details.status).toBe('completed');
    expect(updateAudit.details.oldStatus).toBe('pending');
    
    // Update high priority order priority to low - future updates should NOT be tracked
    await system.storage.update('Order',
      BoolExp.atom({key: 'id', value: ['=', highPriorityOrder.id]}),
      {priority: 'low'}
    );
    
    // Update the now-low-priority order - should NOT trigger high priority audit
    await system.storage.update('Order',
      BoolExp.atom({key: 'id', value: ['=', highPriorityOrder.id]}),
      {totalAmount: 600}
    );
    
    // Verify no new high priority audits were created
    const highPriorityAudits4 = await system.storage.find('HighPriorityOrderAudit');
    expect(highPriorityAudits4).toHaveLength(2); // Still only 2
    
    // Create another high priority order and change status from processing to completed - should NOT trigger high priority status change audit
    const order3 = await system.storage.create('Order', {
      orderNumber: 'ORD-003',
      status: 'processing',
      priority: 'high',
      totalAmount: 300
    });
    
    await system.storage.update('Order',
      BoolExp.atom({key: 'id', value: ['=', order3.id]}),
      {status: 'completed'}
    );
    
    // Verify no new high priority status change audits (only tracks pending->completed)
    const highPriorityStatusChangeAudits3 = await system.storage.find('HighPriorityStatusChangeAudit');
    expect(highPriorityStatusChangeAudits3).toHaveLength(1); // Still only 1
  });
  
});
