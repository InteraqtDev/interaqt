import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Property, Entity, Dictionary, BoolExp, Any, Relation, MatchExp, DICTIONARY_RECORD, PGLiteDB } from 'interaqt';

describe('Any computed handle', () => {
  test('should be true when any request is handled', async () => {
    const requestEntity = Entity.create({
        name: 'Request',
        properties: [
            Property.create({name: 'handled', type: 'boolean'})
        ]
    })
    const entities = [requestEntity]
    const dictionary = [
        Dictionary.create({
            name: 'anyRequestHandled',
            type: 'boolean',
            collection: false,
            computation: Any.create({
                record: requestEntity,
                attributeQuery: ['handled'],
                callback: (request:any) => {
                    return request.handled
                },
            }),
        })
    ]
    const system = new MonoSystem()
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
    const anyRequestHandled0 = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled0).toBeFalsy()
    
    // 创建两个 request
    const request1 = await system.storage.create('Request', {handled: false})
    const request2 = await system.storage.create('Request', {handled: false})

    // 获取 dictionary 的值
    const anyRequestHandled = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    const idMatch1 = BoolExp.atom({
        key: 'id',
        value: ['=', request1.id]
    })  
    await system.storage.update('Request', idMatch1, {handled: true})

    // 获取 dictionary 的值
    const anyRequestHandled2 = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled2).toBeTruthy()   

    // 更新 request 的 handled 属性
    await system.storage.update('Request', idMatch1, {handled: false})

    // 获取 dictionary 的值
    const anyRequestHandled3 = await system.storage.get(DICTIONARY_RECORD,'anyRequestHandled')
    expect(anyRequestHandled3).toBeFalsy()
  });


  test('should be true when any request of a user is handled', async () => {
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
        name: 'anyRequestHandled', 
        type: 'boolean',
        computation: Any.create({
            property: 'requests',
            attributeQuery: ['handled'],
            callback: (request:any) => {
                return request.handled
            },
        })
    }))

    const system = new MonoSystem()
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    })
    await controller.setup(true)

    // 创建 1 个 user 和 2 个 request
    const user = await system.storage.create('User', {anyRequestHandled: false})
    const request1 = await system.storage.create('Request', {handled: false, owner: user})
    const request2 = await system.storage.create('Request', {handled: false, owner: user})

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user2.anyRequestHandled).toBeFalsy()

    // 更新 request 的 handled 属性
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user3.anyRequestHandled).toBeTruthy()

    // 更新 request 的 handled 属性
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: false})

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user4 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user4.anyRequestHandled).toBeFalsy()


    // 更新 request 为 true
    await system.storage.update('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}), {handled: true})
    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user5 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user5.anyRequestHandled).toBeTruthy()

    // 删除 request
    await system.storage.delete('Request', BoolExp.atom({key: 'id', value: ['=', request1.id]}))

    // 重新获取用户数据，查看 anyRequestHandled 的值
    const user6 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*'])
    expect(user6.anyRequestHandled).toBeFalsy()

    
  });

  test('should recompute when relation properties change', async () => {
    // This test verifies that Any computation correctly recomputes when 
    // properties on the relation itself (not the target entity) change
    
    // Define entities
    const departmentEntity = Entity.create({
      name: 'Department',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const employeeEntity = Entity.create({
      name: 'Employee',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'role', type: 'string'})
      ]
    });
    
    // Create relation with properties for performance tracking
    const departmentEmployeeRelation = Relation.create({
      source: departmentEntity,
      sourceProperty: 'employees',
      target: employeeEntity,
      targetProperty: 'department',
      name: 'DepartmentEmployee',
      type: '1:n',
      properties: [
        Property.create({name: 'performanceRating', type: 'number', defaultValue: () => 0}),
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => true}),
        Property.create({name: 'joinDate', type: 'string', defaultValue: () => '2024-01-01'})
      ]
    });
    
    // Add Any computations that depend on relation properties
    departmentEntity.properties.push(
      Property.create({
        name: 'hasHighPerformer',
        type: 'boolean',
        computation: Any.create({
          property: 'employees',
          // Include the relation property in attributeQuery
          attributeQuery: [['&', {attributeQuery: ['performanceRating']}]],
          callback: (employee: any) => {
            // Check the relation's own property
            return employee['&'].performanceRating >= 8;
          }
        })
      }),
      Property.create({
        name: 'hasInactiveEmployee',
        type: 'boolean',
        computation: Any.create({
          property: 'employees',
          attributeQuery: [['&', {attributeQuery: ['isActive']}]],
          callback: (employee: any) => {
            return employee['&'].isActive === false;
          }
        })
      }),
      Property.create({
        name: 'hasHighPerformingManager',
        type: 'boolean',
        computation: Any.create({
          property: 'employees',
          // Access both relation property and target entity property
          attributeQuery: ['role', ['&', {attributeQuery: ['performanceRating', 'isActive']}]],
          callback: (employee: any) => {
            // Check managers with high performance who are active
            return employee.role === 'manager' && 
                   employee['&'].performanceRating >= 9 && 
                   employee['&'].isActive === true;
          }
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system: system,
      entities: [departmentEntity, employeeEntity],
      relations: [departmentEmployeeRelation],
      activities: [],
      interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const dept = await system.storage.create('Department', { name: 'Engineering' });
    
    const employee1 = await system.storage.create('Employee', { 
      name: 'Alice',
      role: 'developer'
    });
    const employee2 = await system.storage.create('Employee', { 
      name: 'Bob',
      role: 'manager'
    });
    const employee3 = await system.storage.create('Employee', { 
      name: 'Charlie',
      role: 'developer'
    });
    
    // Create relations with initial performance ratings
    const relation1 = await system.storage.create('DepartmentEmployee', {
      source: { id: dept.id },
      target: { id: employee1.id },
      performanceRating: 7,
      isActive: true,
      joinDate: '2024-01-15'
    });
    
    const relation2 = await system.storage.create('DepartmentEmployee', {
      source: { id: dept.id },
      target: { id: employee2.id },
      performanceRating: 6,
      isActive: true,
      joinDate: '2024-01-16'
    });
    
    const relation3 = await system.storage.create('DepartmentEmployee', {
      source: { id: dept.id },
      target: { id: employee3.id },
      performanceRating: 8,
      isActive: true,
      joinDate: '2024-01-17'
    });
    
    // Check initial state
    let deptData = await system.storage.findOne('Department',
      MatchExp.atom({key: 'id', value: ['=', dept.id]}),
      undefined,
      ['id', 'name', 'hasHighPerformer', 'hasInactiveEmployee', 'hasHighPerformingManager']
    );
    
    expect(deptData.hasHighPerformer).toBeTruthy(); // Charlie has rating 8
    expect(deptData.hasInactiveEmployee).toBeFalsy(); // All employees are active
    expect(deptData.hasHighPerformingManager).toBeFalsy(); // Bob (manager) has rating 6, needs 9
    
    // Update Bob's performance rating to high
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation2.id]}),
      { performanceRating: 9 }
    );
    
    // Check after performance update
    deptData = await system.storage.findOne('Department',
      MatchExp.atom({key: 'id', value: ['=', dept.id]}),
      undefined,
      ['id', 'name', 'hasHighPerformer', 'hasInactiveEmployee', 'hasHighPerformingManager']
    );
    
    expect(deptData.hasHighPerformer).toBeTruthy(); // Charlie still has rating 8, Bob now has 9
    expect(deptData.hasInactiveEmployee).toBeFalsy(); // Still all active
    expect(deptData.hasHighPerformingManager).toBeTruthy(); // Bob now meets criteria (manager with rating 9)
    
    // Deactivate Alice
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation1.id]}),
      { isActive: false }
    );
    
    // Check after deactivation
    deptData = await system.storage.findOne('Department',
      MatchExp.atom({key: 'id', value: ['=', dept.id]}),
      undefined,
      ['id', 'name', 'hasHighPerformer', 'hasInactiveEmployee', 'hasHighPerformingManager']
    );
    
    expect(deptData.hasHighPerformer).toBeTruthy(); // Charlie and Bob still have high ratings
    expect(deptData.hasInactiveEmployee).toBeTruthy(); // Alice is now inactive
    expect(deptData.hasHighPerformingManager).toBeTruthy(); // Bob still meets criteria
    
    // Lower all performance ratings below 8
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation2.id]}),
      { performanceRating: 5 }
    );
    
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation3.id]}),
      { performanceRating: 6 }
    );
    
    // Check after lowering all ratings
    deptData = await system.storage.findOne('Department',
      MatchExp.atom({key: 'id', value: ['=', dept.id]}),
      undefined,
      ['id', 'name', 'hasHighPerformer', 'hasInactiveEmployee', 'hasHighPerformingManager']
    );
    
    expect(deptData.hasHighPerformer).toBeFalsy(); // No one has rating >= 8 now
    expect(deptData.hasInactiveEmployee).toBeTruthy(); // Alice is still inactive
    expect(deptData.hasHighPerformingManager).toBeFalsy(); // Bob no longer has high rating
    
    // Reactivate Alice and give her high rating
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', relation1.id]}),
      { isActive: true, performanceRating: 9 }
    );
    
    // Check final state
    deptData = await system.storage.findOne('Department',
      MatchExp.atom({key: 'id', value: ['=', dept.id]}),
      undefined,
      ['id', 'name', 'hasHighPerformer', 'hasInactiveEmployee', 'hasHighPerformingManager']
    );
    
    expect(deptData.hasHighPerformer).toBeTruthy(); // Alice now has rating 9
    expect(deptData.hasInactiveEmployee).toBeFalsy(); // All employees are active again
    expect(deptData.hasHighPerformingManager).toBeFalsy(); // Alice is developer, not manager
  });

  test('check entities should work with extra data deps for Any', async () => {
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
        name: 'isAnyUserAgeGreaterThanAgeLimit',
        type: 'boolean',
        collection: false,
        computation: Any.create({
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
    const system = new MonoSystem()
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
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 19)

    const user1 = await system.storage.create('User', {name: 'user1', age: 18})
    const user2 = await system.storage.create('User', {name: 'user2', age: 20})

    const isAnyUserAgeGreaterThanAgeLimit = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit).toBeTruthy()

    // set ageLimit to 21
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 21)

    const isAnyUserAgeGreaterThanAgeLimit2 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit2).toBeFalsy()

    // set ageLimit to 19
    await system.storage.set(DICTIONARY_RECORD, 'ageLimit', 19)

    const isAnyUserAgeGreaterThanAgeLimit3 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit3).toBeTruthy()

    // delete user1 
    await system.storage.delete('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}))

    const isAnyUserAgeGreaterThanAgeLimit4 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit4).toBeTruthy()
    
    // delete user2
    await system.storage.delete('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}))

    const isAnyUserAgeGreaterThanAgeLimit5 = await system.storage.get(DICTIONARY_RECORD, 'isAnyUserAgeGreaterThanAgeLimit')
    expect(isAnyUserAgeGreaterThanAgeLimit5).toBeFalsy()

  })

  test('should handle property level Any with filtered relations', async () => {
    // Define entities
    const projectEntity = Entity.create({
      name: 'Project',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const taskEntity = Entity.create({
      name: 'Task',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'status', type: 'string'}), // pending, in-progress, completed, blocked
        Property.create({name: 'isOverdue', type: 'boolean'})
      ]
    });
    
    // Create base relation with task priority
    const projectTaskRelation = Relation.create({
      source: projectEntity,
      sourceProperty: 'tasks',
      target: taskEntity,
      targetProperty: 'project',
      name: 'ProjectTask',
      type: '1:n',
      properties: [
        Property.create({name: 'priority', type: 'string'}), // high, medium, low
        Property.create({name: 'assignedDate', type: 'string'}),
        Property.create({name: 'isArchived', type: 'boolean', defaultValue: () => false})
      ]
    });
    
    // Create filtered relation for active high-priority tasks
    const activeHighPriorityRelation = Relation.create({
      name: 'ActiveHighPriorityRelation',
      baseRelation: projectTaskRelation,
      sourceProperty: 'activeHighPriorityTasks',
      targetProperty: 'activeHighPriorityProjects',
      matchExpression: MatchExp.atom({
        key: 'priority',
        value: ['=', 'high']
      }).and({
        key: 'isArchived',
        value: ['=', false]
      })
    });
    
    // Add computed properties to project entity
    projectEntity.properties.push(
      Property.create({
        name: 'hasAnyBlockedTask',
        type: 'boolean',
        collection: false,
        computation: Any.create({
          property: 'tasks',
          attributeQuery: ['status'],
          callback: function(task: any) {
            return task.status === 'blocked';
          }
        })
      }),
      Property.create({
        name: 'hasHighPriorityOverdue',
        type: 'boolean',
        collection: false,
        computation: Any.create({
          property: 'activeHighPriorityTasks',
          attributeQuery: ['isOverdue'],
          callback: function(task: any) {
            return task.isOverdue;
          }
        })
      })
    );
    
    const entities = [projectEntity, taskEntity];
    const relations = [projectTaskRelation, activeHighPriorityRelation];
    
    // Setup system and controller
    const system = new MonoSystem();
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const project1 = await system.storage.create('Project', { name: 'Project X' });
    
    const task1 = await system.storage.create('Task', { 
      title: 'Critical Task',
      status: 'in-progress',
      isOverdue: false
    });
    const task2 = await system.storage.create('Task', { 
      title: 'Important Task',
      status: 'pending',
      isOverdue: true
    });
    const task3 = await system.storage.create('Task', { 
      title: 'Regular Task',
      status: 'blocked',
      isOverdue: false
    });
    
    // Create relations
    await system.storage.create('ProjectTask', {
      source: project1,
      target: task1,
      priority: 'high',
      assignedDate: '2024-01-01',
      isArchived: false
    });
    
    const task2Relation = await system.storage.create('ProjectTask', {
      source: project1,
      target: task2,
      priority: 'high',
      assignedDate: '2024-01-02',
      isArchived: false
    });
    
    await system.storage.create('ProjectTask', {
      source: project1,
      target: task3,
      priority: 'medium',
      assignedDate: '2024-01-03',
      isArchived: false
    });
    
    // Check initial state
    const project1Data = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 1 when there's a match, 0 when no match
    expect(project1Data.hasAnyBlockedTask).toBe(1); // task3 is blocked
    // task2 is high priority, active (not archived), and overdue
    expect(project1Data.hasHighPriorityOverdue).toBe(1); // task2 matches
    
    // Archive the overdue high-priority task
    await system.storage.update('ProjectTask',
      BoolExp.atom({key: 'id', value: ['=', task2Relation.id]}),
      { isArchived: true }
    );
    
    // Check after archiving
    const project1Data2 = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 1 when there's a match
    expect(project1Data2.hasAnyBlockedTask).toBe(1); // task3 is still blocked
    // task2 is now archived, no active high priority overdue tasks
    expect(project1Data2.hasHighPriorityOverdue).toBe(0); // No matches after archiving
    
    // Unblock task3
    await system.storage.update('Task',
      BoolExp.atom({key: 'id', value: ['=', task3.id]}),
      { status: 'completed' }
    );
    
    // Check after unblocking
    const project1Data3 = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 0 when there's no match
    expect(project1Data3.hasAnyBlockedTask).toBe(0); // No blocked tasks
    // Still no active high priority overdue tasks
    expect(project1Data3.hasHighPriorityOverdue).toBe(0); // No matches
    
    // Make task1 overdue
    await system.storage.update('Task',
      BoolExp.atom({key: 'id', value: ['=', task1.id]}),
      { isOverdue: true }
    );
    
    // Check after making task1 overdue
    const project1Data4 = await system.storage.findOne('Project', 
      BoolExp.atom({key: 'id', value: ['=', project1.id]}), 
      undefined, 
      ['id', 'name', 'hasAnyBlockedTask', 'hasHighPriorityOverdue']
    );
    
    // Any returns 0 when there's no match, 1 when there's a match
    expect(project1Data4.hasAnyBlockedTask).toBe(0); // Still no blocked tasks
    // task1 is now overdue, high priority, and active
    expect(project1Data4.hasHighPriorityOverdue).toBe(1); // task1 now matches
  });

  test('should calculate any for merged entity correctly', async () => {
    // Create input entities for merged entity
    const onlineTicketEntity = Entity.create({
      name: 'OnlineTicket',
      properties: [
        Property.create({name: 'ticketNumber', type: 'string'}),
        Property.create({name: 'description', type: 'string'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'open'}),
        Property.create({name: 'priority', type: 'string', defaultValue: () => 'normal'}),
        Property.create({name: 'channel', type: 'string', defaultValue: () => 'online'})
      ]
    });

    const phoneTicketEntity = Entity.create({
      name: 'PhoneTicket',
      properties: [
        Property.create({name: 'ticketNumber', type: 'string'}),
        Property.create({name: 'description', type: 'string'}),
        Property.create({name: 'callDuration', type: 'number'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'open'}),
        Property.create({name: 'priority', type: 'string', defaultValue: () => 'high'}),
        Property.create({name: 'channel', type: 'string', defaultValue: () => 'phone'})
      ]
    });

    const emailTicketEntity = Entity.create({
      name: 'EmailTicket',
      properties: [
        Property.create({name: 'ticketNumber', type: 'string'}),
        Property.create({name: 'description', type: 'string'}),
        Property.create({name: 'emailSubject', type: 'string'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'open'}),
        Property.create({name: 'priority', type: 'string', defaultValue: () => 'normal'}),
        Property.create({name: 'channel', type: 'string', defaultValue: () => 'email'})
      ]
    });

    // Create merged entity: Ticket (combining all ticket types)
    const ticketEntity = Entity.create({
      name: 'Ticket',
      inputEntities: [onlineTicketEntity, phoneTicketEntity, emailTicketEntity]
    });

    const entities = [onlineTicketEntity, phoneTicketEntity, emailTicketEntity, ticketEntity];

    // Create dictionary items to check if any ticket is urgent
    const dictionary = [
      Dictionary.create({
        name: 'hasUrgentTicket',
        type: 'boolean',
        collection: false,
        computation: Any.create({
          record: ticketEntity,
          attributeQuery: ['status', 'priority'],
          callback: (ticket: any) => {
            return ticket.status === 'open' && ticket.priority === 'critical';
          }
        })
      }),

      Dictionary.create({
        name: 'hasPhoneTicket',
        type: 'boolean',
        collection: false,
        computation: Any.create({
          record: ticketEntity,
          attributeQuery: ['channel'],
          callback: (ticket: any) => {
            return ticket.channel === 'phone';
          }
        })
      })
    ];

    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system: system,
      entities: entities,
      dict: dictionary,
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Initial checks - should be false as no tickets exist
    const initialHasUrgent = await system.storage.get(DICTIONARY_RECORD, 'hasUrgentTicket');
    expect(initialHasUrgent).toBeFalsy();

    const initialHasPhone = await system.storage.get(DICTIONARY_RECORD, 'hasPhoneTicket');
    expect(initialHasPhone).toBeFalsy();

    // Create non-urgent tickets
    const onlineTicket1 = await system.storage.create('OnlineTicket', {
      ticketNumber: 'ON-001',
      description: 'Login issue'
    });

    const emailTicket1 = await system.storage.create('EmailTicket', {
      ticketNumber: 'EM-001',
      description: 'Account query',
      emailSubject: 'Account access'
    });

    // Should still be false - no urgent tickets
    const hasUrgent1 = await system.storage.get(DICTIONARY_RECORD, 'hasUrgentTicket');
    expect(hasUrgent1).toBeFalsy();

    // Create a phone ticket (default priority is 'high', not 'critical')
    const phoneTicket1 = await system.storage.create('PhoneTicket', {
      ticketNumber: 'PH-001',
      description: 'Urgent support needed',
      callDuration: 15
    });

    // Should now have phone ticket
    const hasPhone1 = await system.storage.get(DICTIONARY_RECORD, 'hasPhoneTicket');
    expect(hasPhone1).toBeTruthy();

    // Still no critical tickets
    const hasUrgent2 = await system.storage.get(DICTIONARY_RECORD, 'hasUrgentTicket');
    expect(hasUrgent2).toBeFalsy();

    // Update phone ticket to critical priority
    await system.storage.update('PhoneTicket',
      MatchExp.atom({key: 'id', value: ['=', phoneTicket1.id]}),
      {priority: 'critical'}
    );

    // Should now have urgent ticket (open && critical)
    const hasUrgent3 = await system.storage.get(DICTIONARY_RECORD, 'hasUrgentTicket');
    expect(hasUrgent3).toBeTruthy();

    // Close the critical ticket
    await system.storage.update('PhoneTicket',
      MatchExp.atom({key: 'id', value: ['=', phoneTicket1.id]}),
      {status: 'closed'}
    );

    // Should no longer have urgent ticket (closed tickets are not urgent)
    const hasUrgent4 = await system.storage.get(DICTIONARY_RECORD, 'hasUrgentTicket');
    expect(hasUrgent4).toBeFalsy();

    // Create a critical online ticket
    await system.storage.create('OnlineTicket', {
      ticketNumber: 'ON-002',
      description: 'System down',
      priority: 'critical',
      status: 'open'
    });

    // Should now have urgent ticket again
    const hasUrgent5 = await system.storage.get(DICTIONARY_RECORD, 'hasUrgentTicket');
    expect(hasUrgent5).toBeTruthy();
  });

  test('should work with merged relation in property level computation', async () => {
    // Define entities
    const teamEntity = Entity.create({
      name: 'Team',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'department', type: 'string'})
      ]
    });

    const taskEntity = Entity.create({
      name: 'Task',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'status', type: 'string'}),
        Property.create({name: 'priority', type: 'string'})
      ]
    });

    // Create input relations
    const teamAssignedTaskRelation = Relation.create({
      name: 'TeamAssignedTask',
      source: teamEntity,
      sourceProperty: 'assignedTasks',
      target: taskEntity,
      targetProperty: 'assignedTeam',
      type: 'n:n',
      properties: [
        Property.create({ name: 'assignmentType', type: 'string', defaultValue: () => 'assigned' }),
        Property.create({ name: 'assignedAt', type: 'string', defaultValue: () => '2024-01-01' })
      ]
    });

    const teamReviewingTaskRelation = Relation.create({
      name: 'TeamReviewingTask',
      source: teamEntity,
      sourceProperty: 'reviewingTasks',
      target: taskEntity,
      targetProperty: 'reviewingTeam',
      type: 'n:n',
      properties: [
        Property.create({ name: 'assignmentType', type: 'string', defaultValue: () => 'reviewing' }),
        Property.create({ name: 'reviewStarted', type: 'string', defaultValue: () => '2024-01-01' })
      ]
    });

    // Create merged relation
    const teamAllTasksRelation = Relation.create({
      name: 'TeamAllTasks',
      sourceProperty: 'allTasks',
      targetProperty: 'anyTeam',
      inputRelations: [teamAssignedTaskRelation, teamReviewingTaskRelation]
    });

    // Add any computation to team entity
    teamEntity.properties.push(
      Property.create({
        name: 'hasUrgentTask',
        type: 'boolean',
        computation: Any.create({
          property: 'allTasks',
          attributeQuery: ['priority', 'status'],
          callback: (task: any) => {
            return task.priority === 'high' && task.status !== 'completed';
          }
        })
      })
    );

    const entities = [teamEntity, taskEntity];
    const relations = [teamAssignedTaskRelation, teamReviewingTaskRelation, teamAllTasksRelation];

    // Setup system
    const system = new MonoSystem();
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: relations,
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Create test data
    const team1 = await system.storage.create('Team', {
      name: 'Development Team',
      department: 'Engineering'
    });

    const task1 = await system.storage.create('Task', {
      title: 'Fix Critical Bug',
      status: 'in_progress',
      priority: 'high'
    });

    const task2 = await system.storage.create('Task', {
      title: 'Code Review',
      status: 'pending',
      priority: 'medium'
    });

    const task3 = await system.storage.create('Task', {
      title: 'Documentation',
      status: 'pending',
      priority: 'low'
    });

    // Initially no tasks assigned, should be false (0)
    let teamData = await system.storage.findOne('Team',
      MatchExp.atom({ key: 'id', value: ['=', team1.id] }),
      undefined,
      ['id', 'name', 'hasUrgentTask']
    );
    expect(teamData.hasUrgentTask).toBe(0);

    // Assign a high priority task through assigned relation
    await system.storage.create('TeamAssignedTask', {
      source: { id: team1.id },
      target: { id: task1.id }
    });

    // Should now be true (1) (has high priority, non-completed task)
    teamData = await system.storage.findOne('Team',
      MatchExp.atom({ key: 'id', value: ['=', team1.id] }),
      undefined,
      ['id', 'name', 'hasUrgentTask']
    );
    expect(teamData.hasUrgentTask).toBe(1);

    // Add more tasks through reviewing relation
    await system.storage.create('TeamReviewingTask', {
      source: { id: team1.id },
      target: { id: task2.id }
    });

    await system.storage.create('TeamReviewingTask', {
      source: { id: team1.id },
      target: { id: task3.id }
    });

    // Should still be true (1)
    teamData = await system.storage.findOne('Team',
      MatchExp.atom({ key: 'id', value: ['=', team1.id] }),
      undefined,
      ['id', 'name', 'hasUrgentTask']
    );
    expect(teamData.hasUrgentTask).toBe(1);

    // Complete the high priority task
    await system.storage.update('Task',
      MatchExp.atom({ key: 'id', value: ['=', task1.id] }),
      { status: 'completed' }
    );

    // Should now be false (0) (no more high priority non-completed tasks)
    teamData = await system.storage.findOne('Team',
      MatchExp.atom({ key: 'id', value: ['=', team1.id] }),
      undefined,
      ['id', 'name', 'hasUrgentTask']
    );
    expect(teamData.hasUrgentTask).toBe(0);
  });
}); 