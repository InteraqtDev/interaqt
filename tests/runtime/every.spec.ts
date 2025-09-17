import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Property, Entity, Every, Dictionary, BoolExp, Relation, MatchExp, DICTIONARY_RECORD, KlassByName,  } from 'interaqt';
import { PGLiteDB } from '@dbclients';
// 创建简单测试环境，直接测试 EveryHandle 的具体方法
describe('Every computed handle', () => {
  
  test('should be true when match count equals total count', async () => {
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [requestEntity]
    const dictionary = [
        Dictionary.create({
            name: 'everyRequestHandled',
            type: 'boolean',
            collection: false,
            computation: Every.create({
                record: requestEntity,
                attributeQuery: ['handled'],
                callback: (request:any) => {
                    return request.handled
                },
                notEmpty: true
            }),
        })
    ]
    const system = new MonoSystem(new PGLiteDB())
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: dictionary
    })
    await controller.setup(true)


    // 获取 dictionary 的值
    const everyRequestHandled0 = await system.storage.dict.get('everyRequestHandled')
    expect(everyRequestHandled0).toBeFalsy()
    // 创建两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled = await system.storage.dict.get('everyRequestHandled')
    expect(everyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    const idMatch1 = BoolExp.atom({
        key: 'id',
        value: ['=', request1.id]
    })
    const idMatch2 = BoolExp.atom({
        key: 'id',
        value: ['=', request2.id]
    })
    await system.storage.update('Request', idMatch1, {handled: true})
    await system.storage.update('Request', idMatch2, {handled: true})

    // 获取 dictionary 的值
    const everyRequestHandled2 = await system.storage.dict.get('everyRequestHandled')
    expect(everyRequestHandled2).toBeTruthy()

    // 再次更新 request 的 handled 属性
    await system.storage.update('Request', idMatch1, {handled: false})

    // 获取 dictionary 的值
    const everyRequestHandled3 = await system.storage.dict.get('everyRequestHandled')
    expect(everyRequestHandled3).toBeFalsy()
  });

  test('should be true when every request of a user is handled', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({
                name:'name',
                type:'string',
                defaultValue: () => 'user1'
            })
        ]
    })
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [userEntity, requestEntity]
    // 创建一个 user 和 request 的关系
    const requestRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'requests',
        target: requestEntity,
        targetProperty: 'owner',
        name: 'requests',
        type: 'n:n'
    })
    const relations = [requestRelation]

    userEntity.properties.push(Property.create({
        name: 'everyRequestHandled',
        type: 'boolean',
        computation: Every.create({
            property: 'requests',
            attributeQuery: ['handled'],
            notEmpty: true,
            callback: (request:any) => {
                return !!request.handled
            },
        })
    }))

    const system = new MonoSystem(new PGLiteDB()) 
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    })
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {everyRequestHandled: false})
    const request1 = await system.storage.create('Request', {handled: false, owner: user})
    const request2 = await system.storage.create('Request', {handled: false, owner: user})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user2 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.everyRequestHandled).toBeFalsy()       

    // 更新 request 的 handled 属性
    await system.storage.update('Request', MatchExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user3 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user3.everyRequestHandled).toBeFalsy()       

    // 更新 request2 的 handled 属性
    await system.storage.update('Request', MatchExp.atom({key: 'id', value: ['=', request2.id]}), {handled: true})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user4 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.everyRequestHandled).toBeTruthy()   

    // 更新 request2 的 handled 属性为 false
    await system.storage.update('Request', MatchExp.atom({key: 'id', value: ['=', request2.id]}), {handled: false})

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user5 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.everyRequestHandled).toBeFalsy()

    // 删除 request2
    await system.storage.delete('Request', MatchExp.atom({key: 'id', value: ['=', request2.id]}))

    // 重新获取用户数据，查看 everyRequestHandled 的值
    const user6 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user6.everyRequestHandled).toBeTruthy()
    
  });

  test('should recompute when relation properties change', async () => {
    // Simple test to verify Every computation recomputes when relation properties change
    
    // Define entities
    const schoolEntity = Entity.create({
      name: 'School',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const studentEntity = Entity.create({
      name: 'Student',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    // Create relation with a property
    const enrollmentRelation = Relation.create({
      source: schoolEntity,
      sourceProperty: 'students',
      target: studentEntity,
      targetProperty: 'school',
      name: 'Enrollment',
      type: '1:n',
      properties: [
        Property.create({name: 'passed', type: 'boolean', defaultValue: () => false}),
        Property.create({name: 'grade', type: 'number', defaultValue: () => 0})
      ]
    });
    
    // Add Every computation that checks if all students passed
    schoolEntity.properties.push(
      Property.create({
        name: 'allStudentsPassed',
        type: 'boolean',
        computation: Every.create({
          property: 'students',
          attributeQuery: [['&', {attributeQuery: ['passed']}]],
          callback: (student: any) => {
            return student['&'].passed === true;
          },
          notEmpty: true
        })
      })
    );
    
    const entities = [schoolEntity, studentEntity];
    const relations = [enrollmentRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: relations,
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const school = await system.storage.create('School', { name: 'Test School' });
    
    const student1 = await system.storage.create('Student', { name: 'Alice' });
    const student2 = await system.storage.create('Student', { name: 'Bob' });
    
    // Create enrollments with initial values
    const enrollment1 = await system.storage.create('Enrollment', {
      source: { id: school.id },
      target: { id: student1.id },
      passed: false,
      grade: 70
    });
    
    const enrollment2 = await system.storage.create('Enrollment', {
      source: { id: school.id },
      target: { id: student2.id },
      passed: false,
      grade: 60
    });
    
    // Check initial state
    let schoolData = await system.storage.findOne('School',
      MatchExp.atom({key: 'id', value: ['=', school.id]}),
      undefined,
      ['id', 'name', 'allStudentsPassed']
    );
    
    expect(schoolData.allStudentsPassed).toBe(false); // No students passed (returns 0 when false)
    
    // Update first enrollment - student passed
    await system.storage.update('Enrollment',
      MatchExp.atom({key: 'id', value: ['=', enrollment1.id]}),
      { passed: true, grade: 85 }
    );
    
    // Check after first update
    schoolData = await system.storage.findOne('School',
      MatchExp.atom({key: 'id', value: ['=', school.id]}),
      undefined,
      ['id', 'name', 'allStudentsPassed']
    );
    
    expect(schoolData.allStudentsPassed).toBe(false); // Still not all passed (returns 0 when false)
    
    // Update second enrollment - student passed
    await system.storage.update('Enrollment',
      MatchExp.atom({key: 'id', value: ['=', enrollment2.id]}),
      { passed: true, grade: 80 }
    );
    
    // Check after second update
    schoolData = await system.storage.findOne('School',
      MatchExp.atom({key: 'id', value: ['=', school.id]}),
      undefined,
      ['id', 'name', 'allStudentsPassed']
    );
    
    expect(schoolData.allStudentsPassed).toBe(true); // All students have now passed (returns 1 when true)
    
    // Update one enrollment back to failed
    await system.storage.update('Enrollment',
      MatchExp.atom({key: 'id', value: ['=', enrollment1.id]}),
      { passed: false, grade: 50 }
    );
    
    // Check after third update
    schoolData = await system.storage.findOne('School',
      MatchExp.atom({key: 'id', value: ['=', school.id]}),
      undefined,
      ['id', 'name', 'allStudentsPassed']
    );
    
    expect(schoolData.allStudentsPassed).toBe(false); // Not all passed anymore (returns 0 when false)
  });

  test('should recompute when relation properties change - complex scenario', async () => {
    // This test verifies that Every computation correctly recomputes when 
    // properties on the relation itself (not the target entity) change
    
    // Define entities
    const companyEntity = Entity.create({
      name: 'Company',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const employeeEntity = Entity.create({
      name: 'Employee',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'department', type: 'string'})
      ]
    });
    
    // Create relation with properties for assessment tracking
    const companyEmployeeRelation = Relation.create({
      source: companyEntity,
      sourceProperty: 'employees',
      target: employeeEntity,
      targetProperty: 'company',
      name: 'CompanyEmployee',
      type: '1:n',
      properties: [
        Property.create({name: 'passedAssessment', type: 'boolean', defaultValue: () => false}),
        Property.create({name: 'assessmentScore', type: 'number', defaultValue: () => 0}),
        Property.create({name: 'assessmentDate', type: 'string'})
      ]
    });
    
    // Add Every computation that depends on relation property
    companyEntity.properties.push(
      Property.create({
        name: 'allEmployeesPassed',
        type: 'boolean',
        computation: Every.create({
          property: 'employees',
          // Include the relation property in attributeQuery
          attributeQuery: [['&', {attributeQuery: ['passedAssessment']}]],
          callback: (employee: any) => {
            // Check the relation's own property, not the target entity's property
            return employee['&'].passedAssessment === true;
          },
          notEmpty: true
        })
      }),
      Property.create({
        name: 'allEmployeesHighScore',
        type: 'boolean',
        computation: Every.create({
          property: 'employees',
          attributeQuery: [['&', {attributeQuery: ['assessmentScore']}]],
          callback: (employee: any) => {
            // Check if assessment score is above 80
            return employee['&'].assessmentScore >= 80;
          },
          notEmpty: true
        })
      }),
      Property.create({
        name: 'allEngineersPassedWithHighScore',
        type: 'boolean',
        computation: Every.create({
          property: 'employees',
          attributeQuery: ['department',['&', {attributeQuery: ['passedAssessment', 'assessmentScore']}]],
          callback: (employee: any) => {
            // Only check engineers, and they must pass with score >= 85
            if (employee.department !== 'Engineering') {
              return true; // Non-engineers are ignored
            }
            return employee['&'].passedAssessment === true && employee['&'].assessmentScore >= 85;
          },
          notEmpty: false
        })
      })
    );
    
    const entities = [companyEntity, employeeEntity];
    const relations = [companyEmployeeRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: relations,
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const company = await system.storage.create('Company', { name: 'TechCorp' });
    
    const employee1 = await system.storage.create('Employee', { 
      name: 'Alice',
      department: 'Engineering'
    });
    
    const employee2 = await system.storage.create('Employee', { 
      name: 'Bob',
      department: 'Sales'
    });
    
    const employee3 = await system.storage.create('Employee', { 
      name: 'Charlie',
      department: 'Marketing'
    });
    
    // Create relations with initial assessment status
    const relation1 = await system.storage.create('CompanyEmployee', {
      source: { id: company.id },
      target: { id: employee1.id },
      passedAssessment: false,
      assessmentScore: 75,
      assessmentDate: '2024-01-15'
    });
    
    const relation2 = await system.storage.create('CompanyEmployee', {
      source: { id: company.id },
      target: { id: employee2.id },
      passedAssessment: false,
      assessmentScore: 60,
      assessmentDate: '2024-01-16'
    });
    
    const relation3 = await system.storage.create('CompanyEmployee', {
      source: { id: company.id },
      target: { id: employee3.id },
      passedAssessment: true,
      assessmentScore: 85,
      assessmentDate: '2024-01-17'
    });
    
    // Check initial state
    let companyData = await system.storage.findOne('Company',
      MatchExp.atom({key: 'id', value: ['=', company.id]}),
      undefined,
      ['id', 'name', 'allEmployeesPassed', 'allEmployeesHighScore']
    );
    
    expect(companyData.allEmployeesPassed).toBe(false); // Only Charlie passed (returns 0 when false)
    expect(companyData.allEmployeesHighScore).toBe(false); // Only Charlie has score >= 80 (returns 0 when false)
    
    // Update Alice's assessment - she passed
    await system.storage.update('CompanyEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation1.id]}),
      { passedAssessment: true, assessmentScore: 90 }
    );
    
    // Check after first update
    companyData = await system.storage.findOne('Company',
      MatchExp.atom({key: 'id', value: ['=', company.id]}),
      undefined,
      ['id', 'name', 'allEmployeesPassed', 'allEmployeesHighScore']
    );
    
    expect(companyData.allEmployeesPassed).toBe(false); // Bob still hasn't passed (returns 0 when false)
    expect(companyData.allEmployeesHighScore).toBe(false); // Bob's score is still 60 (returns 0 when false)
    
    // Update Bob's assessment - he passed with high score
    await system.storage.update('CompanyEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation2.id]}),
      { passedAssessment: true, assessmentScore: 88 }
    );
    
    // Check after second update
    companyData = await system.storage.findOne('Company',
      MatchExp.atom({key: 'id', value: ['=', company.id]}),
      undefined,
      ['id', 'name', 'allEmployeesPassed', 'allEmployeesHighScore']
    );
    
    expect(companyData.allEmployeesPassed).toBe(true); // All employees have now passed (returns 1 when true)
    expect(companyData.allEmployeesHighScore).toBe(true); // All have score >= 80 (returns 1 when true)
    
    // Update Charlie's score to fail the high score requirement
    await system.storage.update('CompanyEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation3.id]}),
      { assessmentScore: 70 }
    );
    
    // Check after third update
    companyData = await system.storage.findOne('Company',
      MatchExp.atom({key: 'id', value: ['=', company.id]}),
      undefined,
      ['id', 'name', 'allEmployeesPassed', 'allEmployeesHighScore']
    );
    
    expect(companyData.allEmployeesPassed).toBe(true); // Still all passed (returns 1 when true)
    expect(companyData.allEmployeesHighScore).toBe(false); // Charlie's score dropped below 80 (returns 0 when false)
    
    // Check the combined condition (allEngineersPassedWithHighScore)
    companyData = await system.storage.findOne('Company',
      MatchExp.atom({key: 'id', value: ['=', company.id]}),
      undefined,
      ['id', 'name', 'allEngineersPassedWithHighScore']
    );
    
    expect(companyData.allEngineersPassedWithHighScore).toBe(true); // Alice (engineer) passed with score 90 (returns 1 when true)
    
    // Lower Alice's score
    await system.storage.update('CompanyEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation1.id]}),
      { assessmentScore: 82 }
    );
    
    // Check after lowering engineer's score
    companyData = await system.storage.findOne('Company',
      MatchExp.atom({key: 'id', value: ['=', company.id]}),
      undefined,
      ['id', 'name', 'allEngineersPassedWithHighScore']
    );
    
    expect(companyData.allEngineersPassedWithHighScore).toBe(false); // Alice's score is now below 85 (returns 0 when false)
  });

  test('should be true when every request with n:n items of a user is handled', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({
                name:'name',
                type:'string',
            })
        ]
    })
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const itemsEntity = Entity.create({
        name: 'Items',
        properties: [
            Property.create({name: 'name', type: 'string'})
        ]
    })


    const entities = [userEntity, requestEntity, itemsEntity]
    // 创建一个 user 和 request 的关系
    const requestRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'requests',
        target: requestEntity,
        targetProperty: 'owner',
        name: 'requests',
        type: 'n:n'
    })
    const itemsRelation = Relation.create({
        source: requestEntity,
        sourceProperty: 'items',
        target: itemsEntity,
        targetProperty: 'request',
        name: 'requestItems',
        type: 'n:n'
    })  
    const relations = [requestRelation, itemsRelation]

    userEntity.properties.push(Property.create({
        name: 'everyRequestHasTwoItems',
        type: 'boolean',
        computation: Every.create({
            property: 'requests',
            attributeQuery: [['items', {attributeQuery: ['name']}]],
            notEmpty: true,
            callback: (request:any) => {
                return request.items?.length === 2
            },
        })
    }))

    const system = new MonoSystem(new PGLiteDB()) 
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    })
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {everyRequestHandled: false})  
    const request1 = await system.storage.create('Request', {handled: false, owner: user})      

    const user2 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.everyRequestHasTwoItems).toBeFalsy()

    const item1 = await system.storage.create('Items', {name: 'item1', request: request1})

    const item2 = await system.storage.create('Items', {name: 'item2', request: request1})

    const user3 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*', ['requests', {attributeQuery: [['items', {attributeQuery: ['name']}]]}]])
    expect(user3.everyRequestHasTwoItems).toBeTruthy()

    const item3 = await system.storage.create('Items', {name: 'item3', request: request1})
    const user4 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.everyRequestHasTwoItems).toBeFalsy()

    await system.storage.delete('Items', MatchExp.atom({key: 'id', value: ['=', item1.id]}))
    const user5 = await system.storage.findOne('User', MatchExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.everyRequestHasTwoItems).toBeTruthy()

    
  });

  test('check entities should work with extra data deps', async () => {
    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({name: 'name', type: 'string'}),
            Property.create({name: 'age', type: 'number'})
        ]
    })

    const ageLimit = Dictionary.create({
        name: 'ageLimit',
        type: 'number',
        collection: false,
    })

    const ageLimitComputed = Dictionary.create({
        name: 'isEveryUserAgeGreaterThanAgeLimit',
        type: 'boolean',
        collection: false,
        computation: Every.create({
            record: userEntity,
            attributeQuery: ['age'],
            dataDeps: {
                ageLimit: {
                    type: 'global',
                    source: ageLimit,
                }
            },
            callback: (user:any, dataDeps:any) => {
                return user.age > dataDeps.ageLimit
            },
        })
    })


    const entities = [userEntity]
    const system = new MonoSystem(new PGLiteDB())
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: [],
        activities: [],
        interactions: [],
        dict: [ageLimit, ageLimitComputed]
    })
    await controller.setup(true)

    // set ageLimit to 19
    await system.storage.dict.set('ageLimit', 19)

    const user1 = await system.storage.create('User', {name: 'user1', age: 18})
    const user2 = await system.storage.create('User', {name: 'user2', age: 20})

    const isEveryUserAgeGreaterThanAgeLimit = await system.storage.dict.get('isEveryUserAgeGreaterThanAgeLimit')
    expect(isEveryUserAgeGreaterThanAgeLimit).toBeFalsy()

    // 把 user1 的 age 改为 20
    await system.storage.update('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), {age: 20})

    const isEveryUserAgeGreaterThanAgeLimit2 = await system.storage.dict.get('isEveryUserAgeGreaterThanAgeLimit')
    expect(isEveryUserAgeGreaterThanAgeLimit2).toBeTruthy()

    // 把 ageLimit 改为 21
    await system.storage.dict.set('ageLimit', 21)

    const isEveryUserAgeGreaterThanAgeLimit3 = await system.storage.dict.get('isEveryUserAgeGreaterThanAgeLimit')
    expect(isEveryUserAgeGreaterThanAgeLimit3).toBeFalsy()
  })

  test('should handle property level Every with filtered relations', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const teamEntity = Entity.create({
      name: 'Team',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const playerEntity = Entity.create({
      name: 'Player',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'isEligible', type: 'boolean'}),
        Property.create({name: 'age', type: 'number'})
      ]
    });
    
    // Create base relation with player role property
    const teamPlayerRelation = Relation.create({
      source: teamEntity,
      sourceProperty: 'players',
      target: playerEntity,
      targetProperty: 'team',
      name: 'TeamPlayer',
      type: '1:n',
      properties: [
        Property.create({name: 'role', type: 'string'}), // starter, substitute, reserve
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => true}),
        Property.create({name: 'jerseyNumber', type: 'number'})
      ]
    });
    
    // Create filtered relation for active starters only
    const activeStarterRelation = Relation.create({
      name: 'ActiveStarterRelation',
      baseRelation: teamPlayerRelation,
      sourceProperty: 'activeStarters',
      targetProperty: 'activeStarterTeams',
      matchExpression: MatchExp.atom({
        key: 'role',
        value: ['=', 'starter']
      }).and({
        key: 'isActive',
        value: ['=', true]
      })
    });
    
    // Add computed properties to team entity
    teamEntity.properties.push(
      Property.create({
        name: 'allPlayersEligible',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'players',
          attributeQuery: ['isEligible'],
          callback: function(player: any) {
            return player.isEligible;
          },
          notEmpty: true
        })
      }),
      Property.create({
        name: 'allStartersEligible',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'activeStarters',
          attributeQuery: ['isEligible'],
          callback: function(player: any) {
            return player.isEligible;
          },
          notEmpty: true
        })
      })
    );
    
    const entities = [teamEntity, playerEntity];
    const relations = [teamPlayerRelation, activeStarterRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const team1 = await system.storage.create('Team', { name: 'Team Alpha' });
    
    const player1 = await system.storage.create('Player', { 
      name: 'John',
      isEligible: true,
      age: 25
    });
    const player2 = await system.storage.create('Player', { 
      name: 'Mike',
      isEligible: true,
      age: 23
    });
    const player3 = await system.storage.create('Player', { 
      name: 'Tom',
      isEligible: false,
      age: 22
    });
    
    // Create relations
    await system.storage.create('TeamPlayer', {
      source: team1,
      target: player1,
      role: 'starter',
      isActive: true,
      jerseyNumber: 10
    });
    
    const mikeRelation = await system.storage.create('TeamPlayer', {
      source: team1,
      target: player2,
      role: 'starter',
      isActive: true,
      jerseyNumber: 7
    });
    
    await system.storage.create('TeamPlayer', {
      source: team1,
      target: player3,
      role: 'substitute',
      isActive: true,
      jerseyNumber: 15
    });
    
    // Check initial state
    const team1Data = await system.storage.findOne('Team', 
      MatchExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 0 when false, 1 when true
    expect(team1Data.allPlayersEligible).toBe(false); // Tom is not eligible
    // Active starters: John and Mike, both eligible
    expect(team1Data.allStartersEligible).toBe(true); // All active starters are eligible
    
    // Make Tom a starter
    const tomRelation = await system.storage.findOne('TeamPlayer',
      MatchExp.atom({key: 'source.id', value: ['=', team1.id]}).and({key: 'target.id', value: ['=', player3.id]}),
      undefined,
      ['id']
    );
    
    await system.storage.update('TeamPlayer',
      MatchExp.atom({key: 'id', value: ['=', tomRelation.id]}),
      { role: 'starter' }
    );
    
    // Check after role change
    const team1Data2 = await system.storage.findOne('Team', 
      MatchExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 0 when false
    expect(team1Data2.allPlayersEligible).toBe(false); // Tom is still not eligible
    // Active starters now: John, Mike, and Tom - but Tom is not eligible
    expect(team1Data2.allStartersEligible).toBe(false); // Not all active starters are eligible
    
    // Make Tom eligible
    await system.storage.update('Player',
      MatchExp.atom({key: 'id', value: ['=', player3.id]}),
      { isEligible: true }
    );
    
    // Check after eligibility change
    const team1Data3 = await system.storage.findOne('Team', 
      MatchExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 1 when true
    expect(team1Data3.allPlayersEligible).toBe(true); // All players are now eligible
    // All active starters (John, Mike, Tom) are now eligible
    expect(team1Data3.allStartersEligible).toBe(true); // All active starters are eligible
    
    // Deactivate Mike
    await system.storage.update('TeamPlayer',
      MatchExp.atom({key: 'id', value: ['=', mikeRelation.id]}),
      { isActive: false }
    );
    
    // Check after deactivation
    const team1Data4 = await system.storage.findOne('Team', 
      MatchExp.atom({key: 'id', value: ['=', team1.id]}), 
      undefined, 
      ['id', 'name', 'allPlayersEligible', 'allStartersEligible']
    );
    
    // Every returns 1 when true
    expect(team1Data4.allPlayersEligible).toBe(true); // Still all players eligible
    // Active starters are now John and Tom (Mike is inactive), both eligible
    expect(team1Data4.allStartersEligible).toBe(true); // All remaining active starters are eligible
  });

  test('should handle property level every with filtered relations - Quality Control Example', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const factoryEntity = Entity.create({
      name: 'Factory',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'location', type: 'string'})
      ]
    });
    
    const productBatchEntity = Entity.create({
      name: 'ProductBatch',
      properties: [
        Property.create({name: 'batchNumber', type: 'string'}),
        Property.create({name: 'productType', type: 'string'}),
        Property.create({name: 'manufactureDate', type: 'string'})
      ]
    });
    
    // Create base relation with quality check properties
    const factoryBatchRelation = Relation.create({
      source: factoryEntity,
      sourceProperty: 'batches',
      target: productBatchEntity,
      targetProperty: 'factory',
      name: 'FactoryBatch',
      type: '1:n',
      properties: [
        Property.create({name: 'qualityScore', type: 'number'}), // 0-100
        Property.create({name: 'passedQC', type: 'boolean'}),
        Property.create({name: 'inspectionLevel', type: 'string'}), // basic, standard, comprehensive
        Property.create({name: 'shift', type: 'string'}), // morning, afternoon, night
        Property.create({name: 'inspector', type: 'string'})
      ]
    });
    
    // Create filtered relations for different shifts and inspection levels
    const morningShiftRelation = Relation.create({
      name: 'MorningShiftRelation',
      baseRelation: factoryBatchRelation,
      sourceProperty: 'morningShiftBatches',
      targetProperty: 'morningShiftFactories',
      matchExpression: MatchExp.atom({
        key: 'shift',
        value: ['=', 'morning']
      })
    });
    
    const comprehensiveInspectionRelation = Relation.create({
      name: 'ComprehensiveInspectionRelation',
      baseRelation: factoryBatchRelation,
      sourceProperty: 'comprehensiveInspectionBatches',
      targetProperty: 'comprehensiveInspectionFactories',
      matchExpression: MatchExp.atom({
        key: 'inspectionLevel',
        value: ['=', 'comprehensive']
      })
    });
    
    const highScoreRelation = Relation.create({
      name: 'HighScoreRelation',
      baseRelation: factoryBatchRelation,
      sourceProperty: 'highScoreBatches',
      targetProperty: 'highScoreFactories',
      matchExpression: MatchExp.atom({
        key: 'qualityScore',
        value: ['>=', 90]
      })
    });
    
    const morningComprehensiveRelation = Relation.create({
      name: 'MorningComprehensiveRelation',
      baseRelation: factoryBatchRelation,
      sourceProperty: 'morningComprehensiveBatches',
      targetProperty: 'morningComprehensiveFactories',
      matchExpression: MatchExp.atom({
        key: 'shift',
        value: ['=', 'morning']
      }).and({
        key: 'inspectionLevel',
        value: ['=', 'comprehensive']
      })
    });
    
    // Add computed properties to factory entity
    factoryEntity.properties.push(
      Property.create({
        name: 'allBatchesPassedQC',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'batches',
          attributeQuery: [['&', {attributeQuery: ['passedQC']}]],
          callback: (batch: any) => batch['&'].passedQC === true
        })
      }),
      Property.create({
        name: 'allMorningShiftPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'morningShiftBatches',
          attributeQuery: [['&', {attributeQuery: ['passedQC']}]],
          callback: (batch: any) => batch['&'].passedQC === true
        })
      }),
      Property.create({
        name: 'allComprehensiveInspectionsPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'comprehensiveInspectionBatches',
          attributeQuery: [['&', {attributeQuery: ['passedQC']}]],
          callback: (batch: any) => batch['&'].passedQC === true
        })
      }),
      Property.create({
        name: 'allHighScoreBatchesPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'highScoreBatches',
          attributeQuery: [['&', {attributeQuery: ['passedQC']}]],
          callback: (batch: any) => batch['&'].passedQC === true
        })
      }),
      Property.create({
        name: 'morningComprehensiveAllPassed',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          property: 'morningComprehensiveBatches',
          attributeQuery: [['&', {attributeQuery: ['passedQC']}]],
          callback: (batch: any) => batch['&'].passedQC === true
        })
      })
    );
    
    const entities = [factoryEntity, productBatchEntity];
    const relations = [factoryBatchRelation, morningShiftRelation, comprehensiveInspectionRelation, 
                      highScoreRelation, morningComprehensiveRelation];
    
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
    
    // Create test data
    const factory1 = await system.storage.create('Factory', { 
      name: 'Plant A',
      location: 'Chicago'
    });
    
    const batch1 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B001',
      productType: 'Widget',
      manufactureDate: '2024-01-15'
    });
    
    const batch2 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B002',
      productType: 'Gadget',
      manufactureDate: '2024-01-15'
    });
    
    const batch3 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B003',
      productType: 'Widget',
      manufactureDate: '2024-01-16'
    });
    
    const batch4 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B004',
      productType: 'Gadget',
      manufactureDate: '2024-01-16'
    });
    
    // Create quality checks with different combinations
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch1,
      qualityScore: 95,
      passedQC: true,
      inspectionLevel: 'comprehensive',
      shift: 'morning',
      inspector: 'John'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch2,
      qualityScore: 88,
      passedQC: true,
      inspectionLevel: 'standard',
      shift: 'morning',
      inspector: 'Jane'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch3,
      qualityScore: 92,
      passedQC: true,
      inspectionLevel: 'comprehensive',
      shift: 'afternoon',
      inspector: 'Bob'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch4,
      qualityScore: 75,
      passedQC: false,
      inspectionLevel: 'basic',
      shift: 'night',
      inspector: 'Alice'
    });
    
    // Check computed every results
    const factoryData = await system.storage.findOne('Factory', 
      BoolExp.atom({key: 'id', value: ['=', factory1.id]}), 
      undefined, 
      ['id', 'name', 'allBatchesPassedQC', 'allMorningShiftPassed', 
       'allComprehensiveInspectionsPassed', 'allHighScoreBatchesPassed', 'morningComprehensiveAllPassed']
    );
    
    // Every returns 0 when false, 1 when true
    expect(factoryData.allBatchesPassedQC).toBe(false); // batch4 failed
    // Now filtered relations work correctly
    expect(factoryData.allMorningShiftPassed).toBe(true); // batch1 and batch2 both passed
    expect(factoryData.allComprehensiveInspectionsPassed).toBe(true); // batch1 and batch3 both passed
    expect(factoryData.allHighScoreBatchesPassed).toBe(true); // batch1(95) and batch3(92) both passed
    expect(factoryData.morningComprehensiveAllPassed).toBe(true); // only batch1, and it passed
    
    // Test dynamic updates: Fix the failed batch
    await system.storage.update('FactoryBatch',
      MatchExp.atom({key: 'source.id', value: ['=', factory1.id]})
        .and({key: 'target.id', value: ['=', batch4.id]}),
      { passedQC: true, qualityScore: 85 }
    );
    
    // Check updated results
    const factoryDataUpdated = await system.storage.findOne('Factory', 
      BoolExp.atom({key: 'id', value: ['=', factory1.id]}), 
      undefined, 
      ['id', 'allBatchesPassedQC']
    );
    
    // Every returns 1 when true due to computation implementation
    expect(factoryDataUpdated.allBatchesPassedQC).toBe(true); // Now all pass
    
    // Add a new failing morning shift batch
    const batch5 = await system.storage.create('ProductBatch', { 
      batchNumber: 'B005',
      productType: 'Widget',
      manufactureDate: '2024-01-17'
    });
    
    await system.storage.create('FactoryBatch', {
      source: factory1,
      target: batch5,
      qualityScore: 60,
      passedQC: false,
      inspectionLevel: 'standard',
      shift: 'morning',
      inspector: 'John'
    });
    
    // Check that morning shift no longer all pass
    const factoryDataFinal = await system.storage.findOne('Factory', 
      BoolExp.atom({key: 'id', value: ['=', factory1.id]}), 
      undefined, 
      ['id', 'allBatchesPassedQC', 'allMorningShiftPassed']
    );
    
    // Every returns 0 when false
    expect(factoryDataFinal.allBatchesPassedQC).toBe(false); // batch5 failed
    // Morning shift now includes batch5 which failed
    expect(factoryDataFinal.allMorningShiftPassed).toBe(false); // batch5 failed
  });

  test('should calculate every for merged entity correctly - conditions on merged entities not supported', async () => {
    // Create input entities for merged entity
    const onlineOrderEntity = Entity.create({
      name: 'OnlineOrder',
      properties: [
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'isDelivered', type: 'boolean', defaultValue: () => false}),
        Property.create({name: 'isPaid', type: 'boolean', defaultValue: () => false}),
        Property.create({name: 'orderType', type: 'string', defaultValue: () => 'online'})
      ]
    });

    const storeOrderEntity = Entity.create({
      name: 'StoreOrder',
      properties: [
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'isDelivered', type: 'boolean', defaultValue: () => true}),
        Property.create({name: 'isPaid', type: 'boolean', defaultValue: () => true}),
        Property.create({name: 'orderType', type: 'string', defaultValue: () => 'store'})
      ]
    });

    const phoneOrderEntity = Entity.create({
      name: 'PhoneOrder',
      properties: [
        Property.create({name: 'orderNumber', type: 'string'}),
        Property.create({name: 'isDelivered', type: 'boolean', defaultValue: () => false}),
        Property.create({name: 'isPaid', type: 'boolean', defaultValue: () => false}),
        Property.create({name: 'orderType', type: 'string', defaultValue: () => 'phone'})
      ]
    });

    // Create merged entity: AllOrder (combining all order types) - avoid SQL reserved word
    const orderEntity = Entity.create({
      name: 'AllOrder',
      inputEntities: [onlineOrderEntity, storeOrderEntity, phoneOrderEntity]
    });

    const entities = [onlineOrderEntity, storeOrderEntity, phoneOrderEntity, orderEntity];

    // Create dictionary items to check conditions
    const dictionary = [
      Dictionary.create({
        name: 'allOrdersDelivered',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: orderEntity,
          attributeQuery: ['isDelivered'],
          callback: (order: any) => order.isDelivered === true,
          notEmpty: false
        })
      }),
      Dictionary.create({
        name: 'allOrdersPaid',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: orderEntity,
          attributeQuery: ['isPaid'],
          callback: (order: any) => {
            return order.isPaid === true
          },
          notEmpty: false
        })
      }),
      Dictionary.create({
        name: 'allOnlineOrdersDelivered',
        type: 'boolean',
        collection: false,
        computation: Every.create({
          record: orderEntity,
          attributeQuery: ['isDelivered', 'orderType'],
          callback: (order: any) => {
            // 是 online 才判断 isDelivered，phone 和 store 要忽略 isDelivered
            if (order.orderType === 'online') {
              return order.isDelivered === true
            }
            return true
          },
          notEmpty: false
        })
      })
    ];

    // Setup system and controller
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

    // Initially with no orders, every should return true (vacuous truth)
    let allDelivered = await system.storage.dict.get('allOrdersDelivered');
    let allPaid = await system.storage.dict.get('allOrdersPaid');
    let allOnlineDelivered = await system.storage.dict.get('allOnlineOrdersDelivered');
    
    expect(allDelivered).toBe(true);
    expect(allPaid).toBe(true);
    expect(allOnlineDelivered).toBe(true);

    // Create online orders
    await system.storage.create('OnlineOrder', {
      orderNumber: 'ON001',
      isDelivered: true,
      isPaid: true
    });

    await system.storage.create('OnlineOrder', {
      orderNumber: 'ON002',
      isDelivered: false,
      isPaid: true
    });

    // Create store orders (delivered and paid by default)
    await system.storage.create('StoreOrder', {
      orderNumber: 'ST001'
    });

    await system.storage.create('StoreOrder', {
      orderNumber: 'ST002'
    });

    // Create phone orders
    await system.storage.create('PhoneOrder', {
      orderNumber: 'PH001',
      isDelivered: true,
      isPaid: true
    });

    // Check the conditions
    allDelivered = await system.storage.dict.get('allOrdersDelivered');
    allPaid = await system.storage.dict.get('allOrdersPaid');
    allOnlineDelivered = await system.storage.dict.get('allOnlineOrdersDelivered');
    
    expect(allDelivered).toBe(false); // ON002 is not delivered
    expect(allPaid).toBe(true); // All orders are paid
    expect(allOnlineDelivered).toBe(false); // ON002 is not delivered

    // Update the undelivered online order
    const undeliveredOrders = await system.storage.find('OnlineOrder',
      BoolExp.atom({key: 'orderNumber', value: ['=', 'ON002']}),
      undefined,
      ['id']
    );
    
    await system.storage.update('OnlineOrder',
      MatchExp.atom({key: 'id', value: ['=', undeliveredOrders[0].id]}),
      { isDelivered: true }
    );

    // Now all should be delivered
    allDelivered = await system.storage.dict.get('allOrdersDelivered');
    allOnlineDelivered = await system.storage.dict.get('allOnlineOrdersDelivered');
    
    expect(allDelivered).toBe(true);
    expect(allOnlineDelivered).toBe(true);

    // Add an unpaid phone order
    await system.storage.create('PhoneOrder', {
      orderNumber: 'PH002',
      isDelivered: true,
      isPaid: false
    });

    // Check that not all orders are paid now
    allPaid = await system.storage.dict.get('allOrdersPaid');
    expect(allPaid).toBe(false);
    
    // Test that the online-only check still works
    allOnlineDelivered = await system.storage.dict.get('allOnlineOrdersDelivered');
    expect(allOnlineDelivered).toBe(true); // All online orders are still delivered
  });

  test('should work with merged relation in property level computation', async () => {
    // Define entities
    const projectEntity = Entity.create({
      name: 'Project',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'status', type: 'string'})
      ]
    });

    const milestoneEntity = Entity.create({
      name: 'Milestone',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'completed', type: 'boolean'}),
        Property.create({name: 'importance', type: 'string'})
      ]
    });

    // Create input relations
    const projectPrimaryMilestoneRelation = Relation.create({
      name: 'ProjectPrimaryMilestone',
      source: projectEntity,
      sourceProperty: 'primaryMilestones',
      target: milestoneEntity,
      targetProperty: 'primaryProject',
      type: '1:n',
      properties: [
        Property.create({ name: 'milestoneType', type: 'string', defaultValue: () => 'primary' }),
        Property.create({ name: 'addedAt', type: 'string', defaultValue: () => '2024-01-01' })
      ]
    });

    const projectSecondaryMilestoneRelation = Relation.create({
      name: 'ProjectSecondaryMilestone',
      source: projectEntity,
      sourceProperty: 'secondaryMilestones',
      target: milestoneEntity,
      targetProperty: 'secondaryProject',
      type: '1:n',
      properties: [
        Property.create({ name: 'milestoneType', type: 'string', defaultValue: () => 'secondary' }),
        Property.create({ name: 'addedAt', type: 'string', defaultValue: () => '2024-01-01' })
      ]
    });

    // Create merged relation
    const projectAllMilestonesRelation = Relation.create({
      name: 'ProjectAllMilestones',
      sourceProperty: 'allMilestones',
      targetProperty: 'anyProject',
      inputRelations: [projectPrimaryMilestoneRelation, projectSecondaryMilestoneRelation]
    });

    // Add every computation to project entity
    projectEntity.properties.push(
      Property.create({
        name: 'allMilestonesCompleted',
        type: 'boolean',
        computation: Every.create({
          property: 'allMilestones',
          attributeQuery: ['completed'],
          callback: (milestone: any) => {
            return milestone.completed === true;
          }
        })
      }),
      Property.create({
        name: 'allCriticalMilestonesCompleted',
        type: 'boolean',
        computation: Every.create({
          property: 'allMilestones',
          attributeQuery: ['completed', 'importance'],
          callback: (milestone: any) => {
            // Only check critical milestones
            return milestone.importance !== 'critical' || milestone.completed === true;
          }
        })
      })
    );

    const entities = [projectEntity, milestoneEntity];
    const relations = [projectPrimaryMilestoneRelation, projectSecondaryMilestoneRelation, projectAllMilestonesRelation];

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
    const project1 = await system.storage.create('Project', {
      name: 'Website Redesign',
      status: 'active'
    });

    const milestone1 = await system.storage.create('Milestone', {
      title: 'Design Complete',
      completed: true,
      importance: 'critical'
    });

    const milestone2 = await system.storage.create('Milestone', {
      title: 'Backend API',
      completed: true,
      importance: 'critical'
    });

    const milestone3 = await system.storage.create('Milestone', {
      title: 'Testing',
      completed: false,
      importance: 'normal'
    });

    // Create relations through input relations
    await system.storage.create('ProjectPrimaryMilestone', {
      source: { id: project1.id },
      target: { id: milestone1.id }
    });

    await system.storage.create('ProjectPrimaryMilestone', {
      source: { id: project1.id },
      target: { id: milestone2.id }
    });

    await system.storage.create('ProjectSecondaryMilestone', {
      source: { id: project1.id },
      target: { id: milestone3.id }
    });

    // Check computations
    let projectData = await system.storage.findOne('Project',
      MatchExp.atom({ key: 'id', value: ['=', project1.id] }),
      undefined,
      ['id', 'name', 'allMilestonesCompleted', 'allCriticalMilestonesCompleted']
    );

    expect(projectData.allMilestonesCompleted).toBe(false); // milestone3 is not completed (returns 0)
    expect(projectData.allCriticalMilestonesCompleted).toBe(true); // all critical ones are completed (returns 1)

    // Complete the remaining milestone
    await system.storage.update('Milestone',
      MatchExp.atom({ key: 'id', value: ['=', milestone3.id] }),
      { completed: true }
    );

    // Check updated computations
    projectData = await system.storage.findOne('Project',
      MatchExp.atom({ key: 'id', value: ['=', project1.id] }),
      undefined,
      ['id', 'name', 'allMilestonesCompleted', 'allCriticalMilestonesCompleted']
    );

    expect(projectData.allMilestonesCompleted).toBe(true); // now all are completed (returns 1)
    expect(projectData.allCriticalMilestonesCompleted).toBe(true); // still true (returns 1)

    // Add a new critical milestone that's not completed
    const milestone4 = await system.storage.create('Milestone', {
      title: 'Deployment',
      completed: false,
      importance: 'critical'
    });

    await system.storage.create('ProjectPrimaryMilestone', {
      source: { id: project1.id },
      target: { id: milestone4.id }
    });

    // Check updated computations
    projectData = await system.storage.findOne('Project',
      MatchExp.atom({ key: 'id', value: ['=', project1.id] }),
      undefined,
      ['id', 'name', 'allMilestonesCompleted', 'allCriticalMilestonesCompleted']
    );

    expect(projectData.allMilestonesCompleted).toBe(false); // new incomplete milestone (returns 0)
    expect(projectData.allCriticalMilestonesCompleted).toBe(false); // new critical milestone not completed (returns 0)
  });
}); 