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
    const system = new MonoSystem();
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
    const system = new MonoSystem();
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
    const system = new MonoSystem();
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
    const system = new MonoSystem();
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
  
  
}); 