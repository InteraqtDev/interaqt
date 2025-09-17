import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { Entity, Property } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@dbclients';
import {
  Controller,
  MonoSystem, Count,
  Average,
  Summation,
  Every,
  Any,
  WeightedSummation,
  Dictionary, MatchExp
} from 'interaqt';

describe('Cascade Filtered Entity Computations', () => {
  let system: MonoSystem;
  let controller: Controller;
  let db: SQLiteDB;

  // Entity definitions
  let userEntity: any;
  let activeUsersEntity: any;
  let techActiveUsersEntity: any;
  let seniorTechActiveUsersEntity: any;
  let youngActiveUsersEntity: any;

  beforeEach(async () => {
    // 创建基础实体
    userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'age', type: 'number' }),
        Property.create({ name: 'salary', type: 'number' }),
        Property.create({ name: 'isActive', type: 'boolean' }),
        Property.create({ name: 'department', type: 'string' }),
        Property.create({ name: 'role', type: 'string' }),
        Property.create({ name: 'score', type: 'number' }),
        Property.create({ name: 'weight', type: 'number' })
      ]
    });

    // 第一层 filtered entity - ActiveUsers
    activeUsersEntity = Entity.create({
      name: 'ActiveUsers',
      baseEntity: userEntity,
      matchExpression: MatchExp.atom({
        key: 'isActive',
        value: ['=', true]
      })
    });

    // 第二层 filtered entity - 基于 ActiveUsers 的 TechActiveUsers
    techActiveUsersEntity = Entity.create({
      name: 'TechActiveUsers',
      baseEntity: activeUsersEntity,
      matchExpression: MatchExp.atom({
        key: 'department',
        value: ['=', 'Tech']
      })
    });

    // 第三层 filtered entity - 基于 TechActiveUsers 的 SeniorTechActiveUsers
    seniorTechActiveUsersEntity = Entity.create({
      name: 'SeniorTechActiveUsers',
      baseEntity: techActiveUsersEntity,
      matchExpression: MatchExp.atom({
        key: 'role',
        value: ['=', 'Senior']
      })
    });

    // 另一个分支：基于 ActiveUsers 的 YoungActiveUsers
    youngActiveUsersEntity = Entity.create({
      name: 'YoungActiveUsers',
      baseEntity: activeUsersEntity,
      matchExpression: MatchExp.atom({
        key: 'age',
        value: ['<', 30]
      })
    });

    // Setup system
    system = new MonoSystem(new SQLiteDB());
  });

  afterEach(async () => {
    // Controller will handle db cleanup
  });

  describe('Count computation on cascade filtered entities', () => {
    test('should count entities at each filter level correctly', async () => {
      const entities = [
        userEntity,
        activeUsersEntity,
        techActiveUsersEntity,
        seniorTechActiveUsersEntity,
        youngActiveUsersEntity
      ];

      const dictionary = [
        // Count all users
        Dictionary.create({
          name: 'totalUserCount',
          type: 'number',
          collection: false,
          computation: Count.create({
            record: userEntity,
            callback: () => true
          })
        }),
        // Count active users
        Dictionary.create({
          name: 'activeUserCount',
          type: 'number',
          collection: false,
          computation: Count.create({
            record: activeUsersEntity,
            callback: () => true
          })
        }),
        // Count tech active users
        Dictionary.create({
          name: 'techActiveUserCount',
          type: 'number',
          collection: false,
          computation: Count.create({
            record: techActiveUsersEntity,
            callback: () => true
          })
        }),
        // Count senior tech active users
        Dictionary.create({
          name: 'seniorTechActiveUserCount',
          type: 'number',
          collection: false,
          computation: Count.create({
            record: seniorTechActiveUsersEntity,
            callback: () => true
          })
        }),
        // Count young active users
        Dictionary.create({
          name: 'youngActiveUserCount',
          type: 'number',
          collection: false,
          computation: Count.create({
            record: youngActiveUsersEntity,
            callback: () => true
          })
        })
      ];

      controller = new Controller({
        system,
        entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
      });
      await controller.setup(true);

      // Initially all counts should be 0
      expect(await system.storage.dict.get('totalUserCount')).toBe(0);
      expect(await system.storage.dict.get('activeUserCount')).toBe(0);
      expect(await system.storage.dict.get('techActiveUserCount')).toBe(0);
      expect(await system.storage.dict.get('seniorTechActiveUserCount')).toBe(0);
      expect(await system.storage.dict.get('youngActiveUserCount')).toBe(0);

      // Create test users
      await system.storage.create('User', {
        name: 'Alice',
        age: 25,
        salary: 50000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 85,
        weight: 0.8
      });

      await system.storage.create('User', {
        name: 'Bob',
        age: 35,
        salary: 80000,
        isActive: true,
        department: 'Tech',
        role: 'Senior',
        score: 95,
        weight: 1.0
      });

      await system.storage.create('User', {
        name: 'Charlie',
        age: 28,
        salary: 60000,
        isActive: true,
        department: 'Sales',
        role: 'Senior',
        score: 90,
        weight: 0.9
      });

      await system.storage.create('User', {
        name: 'David',
        age: 40,
        salary: 90000,
        isActive: false,
        department: 'Tech',
        role: 'Senior',
        score: 88,
        weight: 0.95
      });

      await system.storage.create('User', {
        name: 'Eve',
        age: 22,
        salary: 45000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 80,
        weight: 0.7
      });

      // Verify counts
      expect(await system.storage.dict.get('totalUserCount')).toBe(5);
      expect(await system.storage.dict.get('activeUserCount')).toBe(4); // Exclude David
      expect(await system.storage.dict.get('techActiveUserCount')).toBe(3); // Alice, Bob, Eve
      expect(await system.storage.dict.get('seniorTechActiveUserCount')).toBe(1); // Only Bob
      expect(await system.storage.dict.get('youngActiveUserCount')).toBe(3); // Alice, Charlie, Eve
    });
  });

  describe('Average computation on cascade filtered entities', () => {
    test('should calculate average values at each filter level correctly', async () => {
      const entities = [
        userEntity,
        activeUsersEntity,
        techActiveUsersEntity,
        seniorTechActiveUsersEntity,
        youngActiveUsersEntity
      ];

      const dictionary = [
        // Average salary of all users
        Dictionary.create({
          name: 'avgUserSalary',
          type: 'number',
          collection: false,
          computation: Average.create({
            record: userEntity,
            attributeQuery: ['salary']
          })
        }),
        // Average salary of active users
        Dictionary.create({
          name: 'avgActiveUserSalary',
          type: 'number',
          collection: false,
          computation: Average.create({
            record: activeUsersEntity,
            attributeQuery: ['salary']
          })
        }),
        // Average salary of tech active users
        Dictionary.create({
          name: 'avgTechActiveUserSalary',
          type: 'number',
          collection: false,
          computation: Average.create({
            record: techActiveUsersEntity,
            attributeQuery: ['salary']
          })
        }),
        // Average age of young active users
        Dictionary.create({
          name: 'avgYoungActiveUserAge',
          type: 'number',
          collection: false,
          computation: Average.create({
            record: youngActiveUsersEntity,
            attributeQuery: ['age']
          })
        }),
        // Average score of senior tech active users
        Dictionary.create({
          name: 'avgSeniorTechActiveUserScore',
          type: 'number',
          collection: false,
          computation: Average.create({
            record: seniorTechActiveUsersEntity,
            attributeQuery: ['score']
          })
        })
      ];

      controller = new Controller({
        system,
        entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
      });
      await controller.setup(true);

      // Initially all averages should be 0
      expect(await system.storage.dict.get('avgUserSalary')).toBe(0);
      expect(await system.storage.dict.get('avgActiveUserSalary')).toBe(0);
      expect(await system.storage.dict.get('avgTechActiveUserSalary')).toBe(0);
      expect(await system.storage.dict.get('avgYoungActiveUserAge')).toBe(0);
      expect(await system.storage.dict.get('avgSeniorTechActiveUserScore')).toBe(0);

      // Create test users
      await system.storage.create('User', {
        name: 'Alice',
        age: 25,
        salary: 50000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 85,
        weight: 0.8
      });

      await system.storage.create('User', {
        name: 'Bob',
        age: 35,
        salary: 80000,
        isActive: true,
        department: 'Tech',
        role: 'Senior',
        score: 95,
        weight: 1.0
      });

      await system.storage.create('User', {
        name: 'Charlie',
        age: 28,
        salary: 60000,
        isActive: true,
        department: 'Sales',
        role: 'Senior',
        score: 90,
        weight: 0.9
      });

      await system.storage.create('User', {
        name: 'David',
        age: 40,
        salary: 90000,
        isActive: false,
        department: 'Tech',
        role: 'Senior',
        score: 88,
        weight: 0.95
      });

      await system.storage.create('User', {
        name: 'Eve',
        age: 22,
        salary: 45000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 80,
        weight: 0.7
      });

      // Verify averages
      expect(await system.storage.dict.get('avgUserSalary')).toBe(65000); // (50000+80000+60000+90000+45000)/5
      expect(await system.storage.dict.get('avgActiveUserSalary')).toBe(58750); // (50000+80000+60000+45000)/4
      expect(await system.storage.dict.get('avgTechActiveUserSalary')).toBe(58333.333333333336); // (50000+80000+45000)/3
      expect(await system.storage.dict.get('avgYoungActiveUserAge')).toBe(25); // (25+28+22)/3
      expect(await system.storage.dict.get('avgSeniorTechActiveUserScore')).toBe(95); // Only Bob
    });
  });

  describe('Summation computation on cascade filtered entities', () => {
    test('should calculate sum values at each filter level correctly', async () => {
      const entities = [
        userEntity,
        activeUsersEntity,
        techActiveUsersEntity,
        seniorTechActiveUsersEntity,
        youngActiveUsersEntity
      ];

      const dictionary = [
        // Sum of all user salaries
        Dictionary.create({
          name: 'totalUserSalary',
          type: 'number',
          collection: false,
          computation: Summation.create({
            record: userEntity,
            attributeQuery: ['salary']
          })
        }),
        // Sum of active user salaries
        Dictionary.create({
          name: 'totalActiveUserSalary',
          type: 'number',
          collection: false,
          computation: Summation.create({
            record: activeUsersEntity,
            attributeQuery: ['salary']
          })
        }),
        // Sum of tech active user salaries
        Dictionary.create({
          name: 'totalTechActiveUserSalary',
          type: 'number',
          collection: false,
          computation: Summation.create({
            record: techActiveUsersEntity,
            attributeQuery: ['salary']
          })
        }),
        // Sum of senior tech active user scores
        Dictionary.create({
          name: 'totalSeniorTechActiveUserScore',
          type: 'number',
          collection: false,
          computation: Summation.create({
            record: seniorTechActiveUsersEntity,
            attributeQuery: ['score']
          })
        }),
        // Sum of young active user ages
        Dictionary.create({
          name: 'totalYoungActiveUserAge',
          type: 'number',
          collection: false,
          computation: Summation.create({
            record: youngActiveUsersEntity,
            attributeQuery: ['age']
          })
        })
      ];

      controller = new Controller({
        system,
        entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
      });
      await controller.setup(true);

      // Initially all sums should be 0
      expect(await system.storage.dict.get('totalUserSalary')).toBe(0);
      expect(await system.storage.dict.get('totalActiveUserSalary')).toBe(0);
      expect(await system.storage.dict.get('totalTechActiveUserSalary')).toBe(0);
      expect(await system.storage.dict.get('totalSeniorTechActiveUserScore')).toBe(0);
      expect(await system.storage.dict.get('totalYoungActiveUserAge')).toBe(0);

      // Create test users
      await system.storage.create('User', {
        name: 'Alice',
        age: 25,
        salary: 50000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 85,
        weight: 0.8
      });

      await system.storage.create('User', {
        name: 'Bob',
        age: 35,
        salary: 80000,
        isActive: true,
        department: 'Tech',
        role: 'Senior',
        score: 95,
        weight: 1.0
      });

      await system.storage.create('User', {
        name: 'Charlie',
        age: 28,
        salary: 60000,
        isActive: true,
        department: 'Sales',
        role: 'Senior',
        score: 90,
        weight: 0.9
      });

      await system.storage.create('User', {
        name: 'David',
        age: 40,
        salary: 90000,
        isActive: false,
        department: 'Tech',
        role: 'Senior',
        score: 88,
        weight: 0.95
      });

      await system.storage.create('User', {
        name: 'Eve',
        age: 22,
        salary: 45000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 80,
        weight: 0.7
      });

      // Verify sums
      expect(await system.storage.dict.get('totalUserSalary')).toBe(325000); // 50000+80000+60000+90000+45000
      expect(await system.storage.dict.get('totalActiveUserSalary')).toBe(235000); // 50000+80000+60000+45000
      expect(await system.storage.dict.get('totalTechActiveUserSalary')).toBe(175000); // 50000+80000+45000
      expect(await system.storage.dict.get('totalSeniorTechActiveUserScore')).toBe(95); // Only Bob's score
      expect(await system.storage.dict.get('totalYoungActiveUserAge')).toBe(75); // 25+28+22
    });
  });

  describe('Every computation on cascade filtered entities', () => {
    test('should check if all entities match condition at each filter level', async () => {
      const entities = [
        userEntity,
        activeUsersEntity,
        techActiveUsersEntity,
        seniorTechActiveUsersEntity,
        youngActiveUsersEntity
      ];

      const dictionary = [
        // Check if all users have salary > 40000
        Dictionary.create({
          name: 'allUsersHighSalary',
          type: 'boolean',
          collection: false,
          computation: Every.create({
            record: userEntity,
            attributeQuery: ['salary'],
            callback: (user: any) => user.salary > 40000,
            notEmpty: true
          })
        }),
        // Check if all active users are in Tech department
        Dictionary.create({
          name: 'allActiveUsersInTech',
          type: 'boolean',
          collection: false,
          computation: Every.create({
            record: activeUsersEntity,
            attributeQuery: ['department'],
            callback: (user: any) => user.department === 'Tech',
            notEmpty: true
          })
        }),
        // Check if all tech active users have score > 75
        Dictionary.create({
          name: 'allTechActiveUsersHighScore',
          type: 'boolean',
          collection: false,
          computation: Every.create({
            record: techActiveUsersEntity,
            attributeQuery: ['score'],
            callback: (user: any) => user.score > 75,
            notEmpty: true
          })
        }),
        // Check if all senior tech active users have salary > 70000
        Dictionary.create({
          name: 'allSeniorTechActiveUsersHighSalary',
          type: 'boolean',
          collection: false,
          computation: Every.create({
            record: seniorTechActiveUsersEntity,
            attributeQuery: ['salary'],
            callback: (user: any) => user.salary > 70000,
            notEmpty: true
          })
        }),
        // Check if all young active users are under 30
        Dictionary.create({
          name: 'allYoungActiveUsersUnder30',
          type: 'boolean',
          collection: false,
          computation: Every.create({
            record: youngActiveUsersEntity,
            attributeQuery: ['age'],
            callback: (user: any) => user.age < 30,
            notEmpty: true
          })
        })
      ];

      controller = new Controller({
        system,
        entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
      });
      await controller.setup(true);

      // Initially all should be false (notEmpty: true means false when empty)
      expect(await system.storage.dict.get('allUsersHighSalary')).toBe(false);
      expect(await system.storage.dict.get('allActiveUsersInTech')).toBe(false);
      expect(await system.storage.dict.get('allTechActiveUsersHighScore')).toBe(false);
      expect(await system.storage.dict.get('allSeniorTechActiveUsersHighSalary')).toBe(false);
      expect(await system.storage.dict.get('allYoungActiveUsersUnder30')).toBe(false);

      // Create test users
      await system.storage.create('User', {
        name: 'Alice',
        age: 25,
        salary: 50000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 85,
        weight: 0.8
      });

      await system.storage.create('User', {
        name: 'Bob',
        age: 35,
        salary: 80000,
        isActive: true,
        department: 'Tech',
        role: 'Senior',
        score: 95,
        weight: 1.0
      });

      await system.storage.create('User', {
        name: 'Charlie',
        age: 28,
        salary: 60000,
        isActive: true,
        department: 'Sales',
        role: 'Senior',
        score: 90,
        weight: 0.9
      });

      await system.storage.create('User', {
        name: 'David',
        age: 40,
        salary: 90000,
        isActive: false,
        department: 'Tech',
        role: 'Senior',
        score: 88,
        weight: 0.95
      });

      await system.storage.create('User', {
        name: 'Eve',
        age: 22,
        salary: 45000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 80,
        weight: 0.7
      });

      // Verify every results
      expect(await system.storage.dict.get('allUsersHighSalary')).toBe(true); // All users have salary > 40000
      expect(await system.storage.dict.get('allActiveUsersInTech')).toBe(false); // Charlie is in Sales
      expect(await system.storage.dict.get('allTechActiveUsersHighScore')).toBe(true); // Alice: 85, Bob: 95, Eve: 80, all > 75
      expect(await system.storage.dict.get('allSeniorTechActiveUsersHighSalary')).toBe(true); // Only Bob with 80000 > 70000
      expect(await system.storage.dict.get('allYoungActiveUsersUnder30')).toBe(true); // Alice: 25, Charlie: 28, Eve: 22, all < 30
    });
  });

  describe('Any computation on cascade filtered entities', () => {
    test('should check if any entities match condition at each filter level', async () => {
      const entities = [
        userEntity,
        activeUsersEntity,
        techActiveUsersEntity,
        seniorTechActiveUsersEntity,
        youngActiveUsersEntity
      ];

      const dictionary = [
        // Check if any user has salary > 85000
        Dictionary.create({
          name: 'anyUserHighSalary',
          type: 'boolean',
          collection: false,
          computation: Any.create({
            record: userEntity,
            attributeQuery: ['salary'],
            callback: (user: any) => user.salary > 85000
          })
        }),
        // Check if any active user is in HR department
        Dictionary.create({
          name: 'anyActiveUserInHR',
          type: 'boolean',
          collection: false,
          computation: Any.create({
            record: activeUsersEntity,
            attributeQuery: ['department'],
            callback: (user: any) => user.department === 'HR'
          })
        }),
        // Check if any tech active user has score < 85
        Dictionary.create({
          name: 'anyTechActiveUserLowScore',
          type: 'boolean',
          collection: false,
          computation: Any.create({
            record: techActiveUsersEntity,
            attributeQuery: ['score'],
            callback: (user: any) => user.score < 85
          })
        }),
        // Check if any senior tech active user has salary < 100000
        Dictionary.create({
          name: 'anySeniorTechActiveUserLowSalary',
          type: 'boolean',
          collection: false,
          computation: Any.create({
            record: seniorTechActiveUsersEntity,
            attributeQuery: ['salary'],
            callback: (user: any) => user.salary < 100000
          })
        }),
        // Check if any young active user is exactly 25
        Dictionary.create({
          name: 'anyYoungActiveUserAge25',
          type: 'boolean',
          collection: false,
          computation: Any.create({
            record: youngActiveUsersEntity,
            attributeQuery: ['age'],
            callback: (user: any) => user.age === 25
          })
        })
      ];

      controller = new Controller({
        system,
        entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
      });
      await controller.setup(true);

      // Initially all should be false (empty entities)
      expect(await system.storage.dict.get('anyUserHighSalary')).toBe(false);
      expect(await system.storage.dict.get('anyActiveUserInHR')).toBe(false);
      expect(await system.storage.dict.get('anyTechActiveUserLowScore')).toBe(false);
      expect(await system.storage.dict.get('anySeniorTechActiveUserLowSalary')).toBe(false);
      expect(await system.storage.dict.get('anyYoungActiveUserAge25')).toBe(false);

      // Create test users
      await system.storage.create('User', {
        name: 'Alice',
        age: 25,
        salary: 50000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 85,
        weight: 0.8
      });

      await system.storage.create('User', {
        name: 'Bob',
        age: 35,
        salary: 80000,
        isActive: true,
        department: 'Tech',
        role: 'Senior',
        score: 95,
        weight: 1.0
      });

      await system.storage.create('User', {
        name: 'Charlie',
        age: 28,
        salary: 60000,
        isActive: true,
        department: 'Sales',
        role: 'Senior',
        score: 90,
        weight: 0.9
      });

      await system.storage.create('User', {
        name: 'David',
        age: 40,
        salary: 90000,
        isActive: false,
        department: 'Tech',
        role: 'Senior',
        score: 88,
        weight: 0.95
      });

      await system.storage.create('User', {
        name: 'Eve',
        age: 22,
        salary: 45000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 80,
        weight: 0.7
      });

      // Verify any results
      expect(await system.storage.dict.get('anyUserHighSalary')).toBe(true); // David has 90000 > 85000
      expect(await system.storage.dict.get('anyActiveUserInHR')).toBe(false); // No active users in HR
      expect(await system.storage.dict.get('anyTechActiveUserLowScore')).toBe(true); // Eve has score 80 < 85
      expect(await system.storage.dict.get('anySeniorTechActiveUserLowSalary')).toBe(true); // Bob has 80000 < 100000
      expect(await system.storage.dict.get('anyYoungActiveUserAge25')).toBe(true); // Alice is exactly 25
    });
  });

  describe('WeightedSummation computation on cascade filtered entities', () => {
    test('should calculate weighted sum values at each filter level correctly', async () => {
      const entities = [
        userEntity,
        activeUsersEntity,
        techActiveUsersEntity,
        seniorTechActiveUsersEntity,
        youngActiveUsersEntity
      ];

      const dictionary = [
        // Weighted sum of all users (score * weight)
        Dictionary.create({
          name: 'totalUserWeightedScore',
          type: 'number',
          collection: false,
          computation: WeightedSummation.create({
            record: userEntity,
            attributeQuery: ['score', 'weight'],
            callback: (user: any) => ({
              weight: user.weight || 0,
              value: user.score || 0
            })
          })
        }),
        // Weighted sum of active users (score * weight)
        Dictionary.create({
          name: 'totalActiveUserWeightedScore',
          type: 'number',
          collection: false,
          computation: WeightedSummation.create({
            record: activeUsersEntity,
            attributeQuery: ['score', 'weight'],
            callback: (user: any) => ({
              weight: user.weight || 0,
              value: user.score || 0
            })
          })
        }),
        // Weighted sum of tech active users (salary * weight)
        Dictionary.create({
          name: 'totalTechActiveUserWeightedSalary',
          type: 'number',
          collection: false,
          computation: WeightedSummation.create({
            record: techActiveUsersEntity,
            attributeQuery: ['salary', 'weight'],
            callback: (user: any) => ({
              weight: user.weight || 0,
              value: user.salary || 0
            })
          })
        }),
        // Weighted sum of senior tech active users (score * weight)
        Dictionary.create({
          name: 'totalSeniorTechActiveUserWeightedScore',
          type: 'number',
          collection: false,
          computation: WeightedSummation.create({
            record: seniorTechActiveUsersEntity,
            attributeQuery: ['score', 'weight'],
            callback: (user: any) => ({
              weight: user.weight || 0,
              value: user.score || 0
            })
          })
        }),
        // Weighted sum of young active users (age * weight)
        Dictionary.create({
          name: 'totalYoungActiveUserWeightedAge',
          type: 'number',
          collection: false,
          computation: WeightedSummation.create({
            record: youngActiveUsersEntity,
            attributeQuery: ['age', 'weight'],
            callback: (user: any) => ({
              weight: user.weight || 0,
              value: user.age || 0
            })
          })
        })
      ];

      controller = new Controller({
        system,
        entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
      });
      await controller.setup(true);

      // Initially all weighted sums should be 0
      expect(await system.storage.dict.get('totalUserWeightedScore')).toBe(0);
      expect(await system.storage.dict.get('totalActiveUserWeightedScore')).toBe(0);
      expect(await system.storage.dict.get('totalTechActiveUserWeightedSalary')).toBe(0);
      expect(await system.storage.dict.get('totalSeniorTechActiveUserWeightedScore')).toBe(0);
      expect(await system.storage.dict.get('totalYoungActiveUserWeightedAge')).toBe(0);

      // Create test users
      await system.storage.create('User', {
        name: 'Alice',
        age: 25,
        salary: 50000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 85,
        weight: 0.8
      });

      await system.storage.create('User', {
        name: 'Bob',
        age: 35,
        salary: 80000,
        isActive: true,
        department: 'Tech',
        role: 'Senior',
        score: 95,
        weight: 1.0
      });

      await system.storage.create('User', {
        name: 'Charlie',
        age: 28,
        salary: 60000,
        isActive: true,
        department: 'Sales',
        role: 'Senior',
        score: 90,
        weight: 0.9
      });

      await system.storage.create('User', {
        name: 'David',
        age: 40,
        salary: 90000,
        isActive: false,
        department: 'Tech',
        role: 'Senior',
        score: 88,
        weight: 0.95
      });

      await system.storage.create('User', {
        name: 'Eve',
        age: 22,
        salary: 45000,
        isActive: true,
        department: 'Tech',
        role: 'Junior',
        score: 80,
        weight: 0.7
      });

      // Verify weighted sums
      // WeightedSummation computes sum(value * weight), not (score * weight)
      // Total user weighted score: 85*0.8 + 95*1.0 + 90*0.9 + 88*0.95 + 80*0.7 = 68 + 95 + 81 + 83.6 + 56 = 383.6
      expect(await system.storage.dict.get('totalUserWeightedScore')).toBeCloseTo(383.6, 5);
      
      // Active user weighted score: 85*0.8 + 95*1.0 + 90*0.9 + 80*0.7 = 68 + 95 + 81 + 56 = 300
      expect(await system.storage.dict.get('totalActiveUserWeightedScore')).toBe(300);
      
      // Tech active user weighted salary: 50000*0.8 + 80000*1.0 + 45000*0.7 = 40000 + 80000 + 31500 = 151500
      expect(await system.storage.dict.get('totalTechActiveUserWeightedSalary')).toBe(151500);
      
      // Senior tech active user weighted score: 95*1.0 = 95
      expect(await system.storage.dict.get('totalSeniorTechActiveUserWeightedScore')).toBe(95);
      
      // Young active user weighted age: 25*0.8 + 28*0.9 + 22*0.7 = 20 + 25.2 + 15.4 = 60.6
      expect(await system.storage.dict.get('totalYoungActiveUserWeightedAge')).toBeCloseTo(60.6, 5);
    });
  });
}); 