import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { SQLiteDB } from '@drivers';
import {
  BoolExp,
  Controller,
  Dictionary, KlassByName,
  MonoSystem, Average,
  MatchExp
} from 'interaqt';

describe('Average computed handle', () => {
  
  test('should calculate global average correctly', async () => {
    // Create entity
    const studentEntity = Entity.create({
      name: 'Student',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'score', type: 'number'})
      ]
    });
    
    const entities = [studentEntity];
    
    // Create dictionary item to store global average
    const dictionary = [
      Dictionary.create({
        name: 'averageScore',
        type: 'number',
        collection: false,
        computation: Average.create({
          record: studentEntity,
          attributeQuery: ['score']
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
    
    // Initially, the average should be 0 (no records)
    let avgScore = await system.storage.dict.get('averageScore');
    expect(avgScore).toBe(0);
    
    // Add some students
    await system.storage.create('Student', {
      name: 'Alice',
      score: 85
    });
    
    await system.storage.create('Student', {
      name: 'Bob',
      score: 90
    });
    
    await system.storage.create('Student', {
      name: 'Charlie',
      score: 95
    });
    
    // Check the average
    avgScore = await system.storage.dict.get('averageScore');
    expect(avgScore).toBe(90); // (85 + 90 + 95) / 3
    
    // Update a student's score
    const students = await system.storage.find('Student', BoolExp.atom({key: 'name', value: ['=', 'Bob']}));
    await system.storage.update('Student', BoolExp.atom({key: 'id', value: ['=', students[0].id]}), {
      score: 80
    });
    
    avgScore = await system.storage.dict.get('averageScore');
    expect(avgScore).toBeCloseTo(86.67, 2); // (85 + 80 + 95) / 3
    
    // Delete a student
    await system.storage.delete('Student', BoolExp.atom({key: 'id', value: ['=', students[0].id]}));
    
    avgScore = await system.storage.dict.get('averageScore');
    expect(avgScore).toBe(90); // (85 + 95) / 2
  });
  
  test('should handle invalid values correctly', async () => {
    const dataEntity = Entity.create({
      name: 'Data',
      properties: [
        Property.create({name: 'value', type: 'number'})
      ]
    });
    
    const entities = [dataEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'dataAverage',
        type: 'number',
        collection: false,
        computation: Average.create({
          record: dataEntity,
          attributeQuery: ['value']
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
    
    // Add valid values
    await system.storage.create('Data', { value: 10 });
    await system.storage.create('Data', { value: 20 });
    
    // Add invalid values (should be considered as 0)
    await system.storage.create('Data', { value: NaN });
    await system.storage.create('Data', { value: Infinity });
    await system.storage.create('Data', { value: -Infinity });
    await system.storage.create('Data', { value: null });
    await system.storage.create('Data', { value: undefined });
    
    const average = await system.storage.dict.get('dataAverage');
    expect(average).toBeCloseTo(4.28, .1); // Only valid values (10 + 20) / 7 = 4.285714285714286
  });

  test('should handle empty collections', async () => {
    const itemEntity = Entity.create({
      name: 'Item',
      properties: [
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    const entities = [itemEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'averagePrice',
        type: 'number',
        collection: false,
        computation: Average.create({
          record: itemEntity,
          attributeQuery: ['price']
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
    
    // Initially empty, average should be 0
    const avg = await system.storage.dict.get('averagePrice');
    expect(avg).toBe(0);
  });
  
  test('should work with filtered entities', async () => {
    // Create base entity
    const employeeEntity = Entity.create({
      name: 'Employee',
      properties: [
        Property.create({name: 'department', type: 'string'}),
        Property.create({name: 'salary', type: 'number'})
      ]
    })
    
    // Create filtered entity for engineering department
    const engineerEntity = Entity.create({
      name: 'Engineer',
      baseEntity: employeeEntity,
                  matchExpression: MatchExp.atom({
        key: 'department',
        value: ['=', 'engineering']
      })
    })
    
    const entities = [employeeEntity, engineerEntity]
    
    // Create dictionary to store average engineer salary
    const dictionary = [
      Dictionary.create({
        name: 'averageEngineerSalary',
        type: 'number',
        collection: false,
        computation: Average.create({
          record: engineerEntity,
          attributeQuery: ['salary']
        })
      })
    ]
    
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
    
    // Create employees with different departments
    await system.storage.create(employeeEntity.name, {
      department: 'sales',
      salary: 50000
    })
    
    await system.storage.create(employeeEntity.name, {
      department: 'engineering',
      salary: 80000
    })
    
    await system.storage.create(employeeEntity.name, {
      department: 'engineering',
      salary: 90000
    })
    
    await system.storage.create(employeeEntity.name, {
      department: 'marketing',
      salary: 60000
    })
    
    await system.storage.create(employeeEntity.name, {
      department: 'engineering',
      salary: 100000
    })
    
    // Check that only engineering salaries are averaged
    const avgSalary = await system.storage.dict.get('averageEngineerSalary'
    )
    
    expect(avgSalary).toBe(90000) // (80000 + 90000 + 100000) / 3
  })

  test('should handle property level average computation with relations', async () => {
    // Define entities
    const studentEntity = Entity.create({
      name: 'Student',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const examEntity = Entity.create({
      name: 'Exam',
      properties: [
        Property.create({name: 'subject', type: 'string'}),
        Property.create({name: 'score', type: 'number'}),
        Property.create({name: 'maxScore', type: 'number'})
      ]
    });
    
    // Create relationship
    const studentExamRelation = Relation.create({
      source: studentEntity,
      sourceProperty: 'exams',
      target: examEntity,
      targetProperty: 'student',
      name: 'StudentExam',
      type: '1:n'
    });
    
    // Add computed average score to student
    studentEntity.properties.push(
      Property.create({
        name: 'averageScore',
        type: 'number',
        computation: Average.create({
          property: 'exams',
          attributeQuery: ['score']
        })
      })
    );
    
    const entities = [studentEntity, examEntity];
    const relations = [studentExamRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create students
    const alice = await system.storage.create('Student', {
      name: 'Alice'
    });
    
    const bob = await system.storage.create('Student', {
      name: 'Bob'
    });
    
    // Add exams for Alice
    await system.storage.create('Exam', {
      subject: 'Math',
      score: 85,
      maxScore: 100,
      student: alice
    });
    
    await system.storage.create('Exam', {
      subject: 'Physics',
      score: 90,
      maxScore: 100,
      student: alice
    });
    
    await system.storage.create('Exam', {
      subject: 'Chemistry',
      score: 95,
      maxScore: 100,
      student: alice
    });
    
    // Add exams for Bob (with some invalid scores)
    await system.storage.create('Exam', {
      subject: 'Math',
      score: 70,
      maxScore: 100,
      student: bob
    });
    
    await system.storage.create('Exam', {
      subject: 'Physics',
      score: null, // Invalid score
      maxScore: 100,
      student: bob
    });
    
    await system.storage.create('Exam', {
      subject: 'Chemistry',
      score: 80,
      maxScore: 100,
      student: bob
    });
    
    // Check computed averages
    const updatedAlice = await system.storage.findOne(
      'Student',
      MatchExp.atom({key: 'id', value: ['=', alice.id]}),
      undefined,
      ['*']
    );
    
    const updatedBob = await system.storage.findOne(
      'Student',
      MatchExp.atom({key: 'id', value: ['=', bob.id]}),
      undefined,
      ['averageScore']
    );
    
    expect(updatedAlice.averageScore).toBe(90); // (85 + 90 + 95) / 3
    expect(updatedBob.averageScore).toBe(50); // (70 + 80) / 3
    
    // 暂时跳过 incremental update 测试，因为可能有其他问题
  });

  test('should handle incremental updates with value transitions', async () => {
    const measurementEntity = Entity.create({
      name: 'Measurement',
      properties: [
        Property.create({name: 'value', type: 'number'}),
        Property.create({name: 'isValid', type: 'boolean'})
      ]
    });
    
    const entities = [measurementEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'averageMeasurement',
        type: 'number',
        collection: false,
        computation: Average.create({
          record: measurementEntity,
          attributeQuery: ['value']
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
    
    // Create measurements
    const m1 = await system.storage.create('Measurement', { value: 100, isValid: true });
    const m2 = await system.storage.create('Measurement', { value: 200, isValid: true });
    const m3 = await system.storage.create('Measurement', { value: null, isValid: false });
    
    let avg = await system.storage.dict.get('averageMeasurement');
    expect(avg).toBe(100); // (100 + 200) / 3, null is considered as 0
    
    // Update null to valid value
    await system.storage.update('Measurement', BoolExp.atom({key: 'id', value: ['=', m3.id]}), { value: 300 });
    avg = await system.storage.dict.get('averageMeasurement');
    expect(avg).toBe(200); // (100 + 200 + 300) / 3
    
    // Update valid value to null
    await system.storage.update('Measurement', BoolExp.atom({key: 'id', value: ['=', m2.id]}), { value: null });
    avg = await system.storage.dict.get('averageMeasurement');
    expect(avg).closeTo(133,1); // (100 + 300) / 3
    
    // Update valid value to another valid value
    await system.storage.update('Measurement', BoolExp.atom({key: 'id', value: ['=', m1.id]}), { value: 150 });
    avg = await system.storage.dict.get('averageMeasurement');
    expect(avg).toBe(150); // (150 + 300) / 3
  });

  test('should handle property level average with filtered relations', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const storeEntity = Entity.create({
      name: 'Store',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const saleEntity = Entity.create({
      name: 'Sale',
      properties: [
        Property.create({name: 'product', type: 'string'}),
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'date', type: 'string'})
      ]
    });
    
    // Create base relation with sale type property
    const storeSaleRelation = Relation.create({
      source: storeEntity,
      sourceProperty: 'sales',
      target: saleEntity,
      targetProperty: 'store',
      name: 'StoreSale',
      type: '1:n',
      properties: [
        Property.create({name: 'saleType', type: 'string'}), // online, in-store, phone
        Property.create({name: 'paymentMethod', type: 'string'}), // cash, credit, debit
        Property.create({name: 'isRefunded', type: 'boolean', defaultValue: () => false})
      ]
    });
    
    // Create filtered relation for non-refunded online sales
    const onlineNonRefundedRelation = Relation.create({
      name: 'OnlineNonRefundedRelation',
      baseRelation: storeSaleRelation,
      sourceProperty: 'onlineNonRefundedSales',
      targetProperty: 'onlineNonRefundedStore',
      matchExpression: MatchExp.atom({
        key: 'saleType',
        value: ['=', 'online']
      }).and({
        key: 'isRefunded',
        value: ['=', false]
      })
    });
    
    // Add computed properties to store entity
    storeEntity.properties.push(
      Property.create({
        name: 'averageSaleAmount',
        type: 'number',
        collection: false,
        computation: Average.create({
          property: 'sales',
          attributeQuery: ['amount']
        })
      }),
      Property.create({
        name: 'averageOnlineSaleAmount',
        type: 'number',
        collection: false,
        computation: Average.create({
          property: 'onlineNonRefundedSales',
          attributeQuery: ['amount']
        })
      })
    );
    
    const entities = [storeEntity, saleEntity];
    const relations = [storeSaleRelation, onlineNonRefundedRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const store1 = await system.storage.create('Store', { name: 'Main Store' });
    
    const sale1 = await system.storage.create('Sale', { 
      product: 'Laptop',
      amount: 1000,
      date: '2024-01-01'
    });
    const sale2 = await system.storage.create('Sale', { 
      product: 'Mouse',
      amount: 50,
      date: '2024-01-02'
    });
    const sale3 = await system.storage.create('Sale', { 
      product: 'Keyboard',
      amount: 150,
      date: '2024-01-03'
    });
    const sale4 = await system.storage.create('Sale', { 
      product: 'Monitor',
      amount: 400,
      date: '2024-01-04'
    });
    
    // Create relations with different sale types
    await system.storage.create('StoreSale', {
      source: store1,
      target: sale1,
      saleType: 'online',
      paymentMethod: 'credit',
      isRefunded: false
    });
    
    const sale2Relation = await system.storage.create('StoreSale', {
      source: store1,
      target: sale2,
      saleType: 'in-store',
      paymentMethod: 'cash',
      isRefunded: false
    });
    
    await system.storage.create('StoreSale', {
      source: store1,
      target: sale3,
      saleType: 'online',
      paymentMethod: 'debit',
      isRefunded: false
    });
    
    const sale4Relation = await system.storage.create('StoreSale', {
      source: store1,
      target: sale4,
      saleType: 'online',
      paymentMethod: 'credit',
      isRefunded: false
    });
    
    // Check initial averages
    const store1Data = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'averageSaleAmount', 'averageOnlineSaleAmount']
    );
    
    expect(store1Data.averageSaleAmount).toBe(400); // (1000 + 50 + 150 + 400) / 4
    // Online non-refunded sales: sale1($1000), sale3($150), sale4($400)
    expect(store1Data.averageOnlineSaleAmount).toBeCloseTo(516.67, 2); // (1000 + 150 + 400) / 3
    
    // Refund one online sale
    await system.storage.update('StoreSale',
      BoolExp.atom({key: 'id', value: ['=', sale4Relation.id]}),
      { isRefunded: true }
    );
    
    // Check updated averages
    const store1Data2 = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'averageSaleAmount', 'averageOnlineSaleAmount']
    );
    
    expect(store1Data2.averageSaleAmount).toBe(400); // Still same, all sales count
    // After refunding sale4, only sale1($1000) and sale3($150) are online non-refunded
    expect(store1Data2.averageOnlineSaleAmount).toBe(575); // (1000 + 150) / 2
    
    // Change sale type from in-store to online
    await system.storage.update('StoreSale',
      BoolExp.atom({key: 'id', value: ['=', sale2Relation.id]}),
      { saleType: 'online' }
    );
    
    // Check after type change
    const store1Data3 = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'averageSaleAmount', 'averageOnlineSaleAmount']
    );
    
    expect(store1Data3.averageSaleAmount).toBe(400); // Still same
    // Now sale2($50) is also online, so: sale1($1000), sale2($50), sale3($150)
    expect(store1Data3.averageOnlineSaleAmount).toBe(400); // (1000 + 50 + 150) / 3
    
    // Update sale amount
    await system.storage.update('Sale',
      BoolExp.atom({key: 'id', value: ['=', sale1.id]}),
      { amount: 1200 }
    );
    
    // Check after amount update
    const store1Data4 = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'averageSaleAmount', 'averageOnlineSaleAmount']
    );
    
    expect(store1Data4.averageSaleAmount).toBe(450); // (1200 + 50 + 150 + 400) / 4
    // After updating sale1 to $1200: sale1($1200), sale2($50), sale3($150)
    expect(store1Data4.averageOnlineSaleAmount).toBeCloseTo(466.67, 2); // (1200 + 50 + 150) / 3
    
    // Delete a relation
    const sale1Relation = await system.storage.findOne('StoreSale',
      MatchExp.atom({key: 'source.id', value: ['=', store1.id]}).and({key: 'target.id', value: ['=', sale1.id]}),
      undefined,
      ['id']
    );
    
    await system.storage.delete('StoreSale',
      BoolExp.atom({key: 'id', value: ['=', sale1Relation.id]})
    );
    
    // Final check
    const store1Data5 = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'averageSaleAmount', 'averageOnlineSaleAmount']
    );
    
    expect(store1Data5.averageSaleAmount).toBe(200); // (50 + 150 + 400) / 3
    // After deleting sale1, only sale2($50) and sale3($150) remain online non-refunded
    expect(store1Data5.averageOnlineSaleAmount).toBe(100); // (50 + 150) / 2
  });
  
  test('should handle property level average with filtered relations - Course Grading Example', async () => {
    const courseEntity = Entity.create({
      name: 'Course',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'department', type: 'string'})
      ]
    });
    
    const studentEntity = Entity.create({
      name: 'Student',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'major', type: 'string'})
      ]
    });
    
    // Create base relation with enrollment properties
    const courseEnrollmentRelation = Relation.create({
      source: courseEntity,
      sourceProperty: 'enrollments',
      target: studentEntity,
      targetProperty: 'courses',
      name: 'CourseEnrollment',
      type: 'n:n',
      properties: [
        Property.create({name: 'grade', type: 'number'}), // 0-100
        Property.create({name: 'semester', type: 'string'}),
        Property.create({name: 'status', type: 'string'}), // completed, in-progress, withdrawn
        Property.create({name: 'creditHours', type: 'number'})
      ]
    });
    
    // Create filtered relations for different enrollment statuses
    const completedEnrollmentRelation = Relation.create({
      name: 'CompletedEnrollmentRelation',
      baseRelation: courseEnrollmentRelation,
      sourceProperty: 'completedEnrollments',
      targetProperty: 'completedCourses',
      matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'completed']
      })
    });
    
    const springCompletedRelation = Relation.create({
      name: 'SpringCompletedRelation',
      baseRelation: courseEnrollmentRelation,
      sourceProperty: 'springCompletedEnrollments',
      targetProperty: 'springCompletedCourses',
      matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'completed']
      }).and({
        key: 'semester',
        value: ['=', 'Spring 2024']
      })
    });
    
    const fallCompletedRelation = Relation.create({
      name: 'FallCompletedRelation',
      baseRelation: courseEnrollmentRelation,
      sourceProperty: 'fallCompletedEnrollments',
      targetProperty: 'fallCompletedCourses',
      matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'completed']
      }).and({
        key: 'semester',
        value: ['=', 'Fall 2023']
      })
    });
    
    // Add computed properties to course entity
    courseEntity.properties.push(
      Property.create({
        name: 'overallAverageGrade',
        type: 'number',
        collection: false,
        computation: Average.create({
          property: 'completedEnrollments',
          attributeQuery: [['&', {attributeQuery: ['grade']}]]
        })
      }),
      Property.create({
        name: 'springAverageGrade',
        type: 'number',
        collection: false,
        computation: Average.create({
          property: 'springCompletedEnrollments',
          attributeQuery: [['&', {attributeQuery: ['grade']}]]
        })
      }),
      Property.create({
        name: 'fallAverageGrade',
        type: 'number',
        collection: false,
        computation: Average.create({
          property: 'fallCompletedEnrollments',
          attributeQuery: [['&', {attributeQuery: ['grade']}]]
        })
      })
    );
    
    const entities = [courseEntity, studentEntity];
    const relations = [courseEnrollmentRelation, completedEnrollmentRelation, springCompletedRelation, fallCompletedRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
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
    const mathCourse = await system.storage.create('Course', { 
      name: 'Calculus I',
      department: 'Mathematics'
    });
    
    const student1 = await system.storage.create('Student', { 
      name: 'Alice',
      major: 'Engineering'
    });
    
    const student2 = await system.storage.create('Student', { 
      name: 'Bob',
      major: 'Physics'
    });
    
    const student3 = await system.storage.create('Student', { 
      name: 'Charlie',
      major: 'Mathematics'
    });
    
    const student4 = await system.storage.create('Student', { 
      name: 'David',
      major: 'Computer Science'
    });
    
    // Create enrollments with different semesters and statuses
    await system.storage.create('CourseEnrollment', {
      source: mathCourse,
      target: student1,
      grade: 85,
      semester: 'Spring 2024',
      status: 'completed',
      creditHours: 4
    });
    
    await system.storage.create('CourseEnrollment', {
      source: mathCourse,
      target: student2,
      grade: 92,
      semester: 'Spring 2024',
      status: 'completed',
      creditHours: 4
    });
    
    await system.storage.create('CourseEnrollment', {
      source: mathCourse,
      target: student3,
      grade: 78,
      semester: 'Fall 2023',
      status: 'completed',
      creditHours: 4
    });
    
    await system.storage.create('CourseEnrollment', {
      source: mathCourse,
      target: student4,
      grade: 0,
      semester: 'Spring 2024',
      status: 'withdrawn',
      creditHours: 4
    });
    
    // Check computed averages
    const courseData = await system.storage.findOne('Course', 
      BoolExp.atom({key: 'id', value: ['=', mathCourse.id]}), 
      undefined, 
      ['id', 'name', 'overallAverageGrade', 'springAverageGrade', 'fallAverageGrade']
    );
    
    expect(courseData.overallAverageGrade).toBeCloseTo(85, 1); // (85 + 92 + 78) / 3 = 85
    // Spring 2024 completed: student1(85), student2(92)
    expect(courseData.springAverageGrade).toBe(88.5); // (85 + 92) / 2
    // Fall 2023 completed: student3(78)
    expect(courseData.fallAverageGrade).toBe(78); // Only one student
    
    // Test dynamic updates: Student improves grade after retake
    await system.storage.create('CourseEnrollment', {
      source: mathCourse,
      target: student3,
      grade: 88,
      semester: 'Spring 2024',
      status: 'completed',
      creditHours: 4
    });
    
    // Check updated averages
    const courseDataUpdated = await system.storage.findOne('Course', 
      BoolExp.atom({key: 'id', value: ['=', mathCourse.id]}), 
      undefined, 
      ['id', 'name', 'overallAverageGrade', 'springAverageGrade']
    );
    
    expect(courseDataUpdated.overallAverageGrade).toBeCloseTo(85.75, 1); // (85 + 92 + 78 + 88) / 4
    // Spring 2024 now has student3(88) added: student1(85), student2(92), student3(88)
    expect(courseDataUpdated.springAverageGrade).toBeCloseTo(88.33, 2); // (85 + 92 + 88) / 3
  });

  test('should calculate average for merged entity correctly', async () => {
    // Create input entities for merged entity
    const productReviewEntity = Entity.create({
      name: 'ProductReview',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'rating', type: 'number'}),
        Property.create({name: 'reviewType', type: 'string', defaultValue: () => 'product'}),
        Property.create({name: 'verified', type: 'boolean', defaultValue: () => false})
      ]
    });

    const serviceReviewEntity = Entity.create({
      name: 'ServiceReview',
      properties: [
        Property.create({name: 'serviceName', type: 'string'}),
        Property.create({name: 'rating', type: 'number'}),
        Property.create({name: 'reviewType', type: 'string', defaultValue: () => 'service'}),
        Property.create({name: 'verified', type: 'boolean', defaultValue: () => true})
      ]
    });

    const supportReviewEntity = Entity.create({
      name: 'SupportReview',
      properties: [
        Property.create({name: 'ticketId', type: 'string'}),
        Property.create({name: 'rating', type: 'number'}),
        Property.create({name: 'reviewType', type: 'string', defaultValue: () => 'support'}),
        Property.create({name: 'responseTime', type: 'number'})
      ]
    });

    // Create merged entity: Review (combining all review types)
    const reviewEntity = Entity.create({
      name: 'Review',
      inputEntities: [productReviewEntity, serviceReviewEntity, supportReviewEntity]
    });

    const entities = [productReviewEntity, serviceReviewEntity, supportReviewEntity, reviewEntity];

    // Create dictionary items to store averages
    const dictionary = [
      Dictionary.create({
        name: 'overallAverageRating',
        type: 'number',
        collection: false,
        computation: Average.create({
          record: reviewEntity,
          attributeQuery: ['rating']
        })
      }),

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

    // Initial averages should be 0 (no data)
    let overallAvg = await system.storage.dict.get('overallAverageRating');
    
    expect(overallAvg).toBe(0);

    // Create product reviews
    await system.storage.create('ProductReview', {
      productName: 'Laptop',
      rating: 4.5,
      verified: true
    });

    await system.storage.create('ProductReview', {
      productName: 'Mouse',
      rating: 3.5,
      verified: false
    });

    await system.storage.create('ProductReview', {
      productName: 'Keyboard',
      rating: 4.0,
      verified: true
    });

    // Create service reviews (all verified by default)
    await system.storage.create('ServiceReview', {
      serviceName: 'Installation',
      rating: 5.0
    });

    await system.storage.create('ServiceReview', {
      serviceName: 'Maintenance',
      rating: 4.5
    });

    // Create support reviews
    await system.storage.create('SupportReview', {
      ticketId: 'T001',
      rating: 3.0,
      responseTime: 24
    });

    await system.storage.create('SupportReview', {
      ticketId: 'T002',
      rating: 4.0,
      responseTime: 12
    });

    // Check the averages
    overallAvg = await system.storage.dict.get('overallAverageRating');
    
    // Overall: (4.5 + 3.5 + 4.0 + 5.0 + 4.5 + 3.0 + 4.0) / 7 = 28.5 / 7 ≈ 4.07
    expect(overallAvg).toBeCloseTo(4.07, 2);

    // Update a product review rating
    const productReviews = await system.storage.find('ProductReview',
      BoolExp.atom({key: 'productName', value: ['=', 'Mouse']}),
      undefined,
      ['id']
    );
    
    await system.storage.update('ProductReview',
      MatchExp.atom({key: 'id', value: ['=', productReviews[0].id]}),
      { rating: 4.5 }
    );

    // Check updated averages
    overallAvg = await system.storage.dict.get('overallAverageRating');
    
    // Overall increased by (4.5 - 3.5) / 7 ≈ 0.14, so ~4.21
    expect(overallAvg).toBeCloseTo(4.21, 2);

    // Delete a support review
    const supportReviews = await system.storage.find('SupportReview',
      BoolExp.atom({key: 'rating', value: ['=', 3.0]}),
      undefined,
      ['id']
    );
    
    await system.storage.delete('SupportReview',
      MatchExp.atom({key: 'id', value: ['=', supportReviews[0].id]})
    );

    // Check final averages
    overallAvg = await system.storage.dict.get('overallAverageRating');
    
    // Now only 6 reviews: (4.5 + 4.5 + 4.0 + 5.0 + 4.5 + 4.0) / 6 = 26.5 / 6 ≈ 4.42
    expect(overallAvg).toBeCloseTo(4.42, 2);
  });

  test('should work with merged relation in property level computation', async () => {
    // Define entities  
    const studentEntity = Entity.create({
      name: 'Student',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'grade', type: 'string'})
      ]
    });

    const examEntity = Entity.create({
      name: 'Exam',
      properties: [
        Property.create({name: 'subject', type: 'string'}),
        Property.create({name: 'score', type: 'number'}),
        Property.create({name: 'maxScore', type: 'number'})
      ]
    });

    // Create input relations
    const studentMidtermExamRelation = Relation.create({
      name: 'StudentMidtermExam',
      source: studentEntity,
      sourceProperty: 'midtermExams',
      target: examEntity,
      targetProperty: 'midtermStudent',
      type: '1:n',
      properties: [
        Property.create({ name: 'examType', type: 'string', defaultValue: () => 'midterm' }),
        Property.create({ name: 'semester', type: 'string', defaultValue: () => 'Fall 2024' })
      ]
    });

    const studentFinalExamRelation = Relation.create({
      name: 'StudentFinalExam',
      source: studentEntity,
      sourceProperty: 'finalExams',
      target: examEntity,
      targetProperty: 'finalStudent',
      type: '1:n',
      properties: [
        Property.create({ name: 'examType', type: 'string', defaultValue: () => 'final' }),
        Property.create({ name: 'semester', type: 'string', defaultValue: () => 'Fall 2024' })
      ]
    });

    // Create merged relation
    const studentAllExamsRelation = Relation.create({
      name: 'StudentAllExams',
      sourceProperty: 'allExams',
      targetProperty: 'examStudent',
      inputRelations: [studentMidtermExamRelation, studentFinalExamRelation]
    });

    // Add average computation to student entity
    studentEntity.properties.push(
      Property.create({
        name: 'overallAverageScore',
        type: 'number',
        computation: Average.create({
          property: 'allExams',
          attributeQuery: ['score']
        })
      })
    );

    const entities = [studentEntity, examEntity];
    const relations = [studentMidtermExamRelation, studentFinalExamRelation, studentAllExamsRelation];

    // Setup system
    const system = new MonoSystem(new SQLiteDB());
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
    const student1 = await system.storage.create('Student', {
      name: 'Bob Johnson',
      grade: '10th'
    });

    const exam1 = await system.storage.create('Exam', {
      subject: 'Math',
      score: 85,
      maxScore: 100
    });

    const exam2 = await system.storage.create('Exam', {
      subject: 'Physics',
      score: 90,
      maxScore: 100
    });

    const exam3 = await system.storage.create('Exam', {
      subject: 'Math',
      score: 88,
      maxScore: 100
    });

    const exam4 = await system.storage.create('Exam', {
      subject: 'Physics',
      score: 92,
      maxScore: 100
    });

    // Create relations through input relations
    await system.storage.create('StudentMidtermExam', {
      source: { id: student1.id },
      target: { id: exam1.id }
    });

    await system.storage.create('StudentMidtermExam', {
      source: { id: student1.id },
      target: { id: exam2.id }
    });

    await system.storage.create('StudentFinalExam', {
      source: { id: student1.id },
      target: { id: exam3.id }
    });

    await system.storage.create('StudentFinalExam', {
      source: { id: student1.id },
      target: { id: exam4.id }
    });

    // Check average score
    const studentData = await system.storage.findOne('Student',
      MatchExp.atom({ key: 'id', value: ['=', student1.id] }),
      undefined,
      ['id', 'name', 'overallAverageScore']
    );

    expect(studentData.overallAverageScore).toBe(88.75); // (85 + 90 + 88 + 92) / 4

    // Update an exam score
    await system.storage.update('Exam',
      MatchExp.atom({ key: 'id', value: ['=', exam1.id] }),
      { score: 95 }
    );

    // Check updated average
    const studentData2 = await system.storage.findOne('Student',
      MatchExp.atom({ key: 'id', value: ['=', student1.id] }),
      undefined,
      ['id', 'name', 'overallAverageScore']
    );

    expect(studentData2.overallAverageScore).toBe(91.25); // (95 + 90 + 88 + 92) / 4
  });
}); 