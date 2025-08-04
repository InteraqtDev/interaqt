import { 
    Entity, 
    Property, 
    Relation, 
    Interaction, 
    Action, 
    Payload, 
    PayloadItem,
    Count,
    Summation,
    StateMachine,
    StateNode,
    StateTransfer,
    Transform,
    Condition,
    Conditions,
    BoolExp,
    MatchExp,
    Controller,
    Dictionary,
    InteractionEventEntity
} from 'interaqt';

// ==================== State Nodes ====================
// User role states
const studentRoleState = StateNode.create({ name: 'student' });
const dormHeadRoleState = StateNode.create({ name: 'dormHead' });
const adminRoleState = StateNode.create({ name: 'admin' });

// Dormitory status states
const activeDormState = StateNode.create({ name: 'active' });
const inactiveDormState = StateNode.create({ name: 'inactive' });

// Bed occupancy states
const availableBedState = StateNode.create({ name: 'available' });
const occupiedBedState = StateNode.create({ name: 'occupied' });

// Eviction request status states
const pendingEvictionState = StateNode.create({ name: 'pending' });
const approvedEvictionState = StateNode.create({ name: 'approved' });
const rejectedEvictionState = StateNode.create({ name: 'rejected' });

// User-Dormitory relation states
const userDormActiveState = StateNode.create({ name: 'active' });
const userDormInactiveState = StateNode.create({ name: 'inactive' });

// Dormitory Head relation states
const dormHeadExistsState = StateNode.create({ 
    name: 'exists',
    computeValue: () => ({ assignedAt: Date.now() })
});
const dormHeadDeletedState = StateNode.create({ 
    name: 'deleted',
    computeValue: () => null
});

// ==================== Interactions (must be declared before use in computations) ====================
export const CreateUserInteraction = Interaction.create({
    name: 'CreateUser',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userData',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

export const CreateDormitoryInteraction = Interaction.create({
    name: 'CreateDormitory',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryData',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        }).and(BoolExp.atom({
            key: 'payload.dormitoryData.capacity',
            value: ['>=', 4]
        })).and(BoolExp.atom({
            key: 'payload.dormitoryData.capacity',
            value: ['<=', 6]
        }))
    })
});

export const AssignDormHeadInteraction = Interaction.create({
    name: 'AssignDormHead',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryId',
                required: true
            }),
            PayloadItem.create({
                name: 'headId',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

export const AssignUserToDormitoryInteraction = Interaction.create({
    name: 'AssignUserToDormitory',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'dormitoryId',
                required: true
            }),
            PayloadItem.create({
                name: 'bedNumber',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

export const RemoveUserFromDormitoryInteraction = Interaction.create({
    name: 'RemoveUserFromDormitory',
    action: Action.create({ name: 'delete' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

export const CreateBehaviorRecordInteraction = Interaction.create({
    name: 'CreateBehaviorRecord',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'points',
                required: true
            }),
            PayloadItem.create({
                name: 'reason',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            })
        ])
    })
});

export const RequestEvictionInteraction = Interaction.create({
    name: 'RequestEviction',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'reason',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            })
        ])
    })
});

export const ApproveEvictionInteraction = Interaction.create({
    name: 'ApproveEviction',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'requestId',
                required: true
            }),
            PayloadItem.create({
                name: 'approved',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

export const UpdateUserInteraction = Interaction.create({
    name: 'UpdateUser',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'updates',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

export const UpdateDormitoryInteraction = Interaction.create({
    name: 'UpdateDormitory',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'id',
                required: true
            }),
            PayloadItem.create({
                name: 'updates',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.atom({
            key: 'user.role',
            value: ['=', 'admin']
        })
    })
});

// ==================== Query Interactions ====================
export const GetDormitoryInteraction = Interaction.create({
    name: 'GetDormitory',
    action: Action.create({ name: 'get' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'id',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

export const ListDormitoriesInteraction = Interaction.create({
    name: 'ListDormitories',
    action: Action.create({ name: 'list' }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

export const GetUserInteraction = Interaction.create({
    name: 'GetUser',
    action: Action.create({ name: 'get' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'id',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

export const ListUsersInteraction = Interaction.create({
    name: 'ListUsers',
    action: Action.create({ name: 'list' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'filters',
                required: false
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

export const GetBehaviorRecordsInteraction = Interaction.create({
    name: 'GetBehaviorRecords',
    action: Action.create({ name: 'get' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'filters',
                required: false
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

export const GetEvictionRequestsInteraction = Interaction.create({
    name: 'GetEvictionRequests',
    action: Action.create({ name: 'get' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'filters',
                required: false
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            })
        ])
    })
});

export const GetUserPointsInteraction = Interaction.create({
    name: 'GetUserPoints',
    action: Action.create({ name: 'get' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

export const GetDormitoryOccupancyInteraction = Interaction.create({
    name: 'GetDormitoryOccupancy',
    action: Action.create({ name: 'get' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryId',
                required: true
            })
        ]
    }),
    conditions: Conditions.create({
        content: BoolExp.or([
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'admin']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'dormHead']
            }),
            BoolExp.atom({
                key: 'user.role',
                value: ['=', 'student']
            })
        ])
    })
});

// ==================== All Interactions ====================
export const interactions = [
    CreateUserInteraction,
    CreateDormitoryInteraction,
    AssignDormHeadInteraction,
    AssignUserToDormitoryInteraction,
    RemoveUserFromDormitoryInteraction,
    CreateBehaviorRecordInteraction,
    RequestEvictionInteraction,
    ApproveEvictionInteraction,
    UpdateUserInteraction,
    UpdateDormitoryInteraction,
    GetDormitoryInteraction,
    ListDormitoriesInteraction,
    GetUserInteraction,
    ListUsersInteraction,
    GetBehaviorRecordsInteraction,
    GetEvictionRequestsInteraction,
    GetUserPointsInteraction,
    GetDormitoryOccupancyInteraction
];

// ==================== Entities ====================
export const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({
            name: 'role',
            type: 'string',
            computation: StateMachine.create({
                states: [studentRoleState, dormHeadRoleState, adminRoleState],
                defaultState: studentRoleState,
                transfers: [
                    StateTransfer.create({
                        trigger: AssignDormHeadInteraction,
                        current: studentRoleState,
                        next: dormHeadRoleState,
                        computeTarget: (event) => ({ id: event.payload.headId })
                    }),
                    StateTransfer.create({
                        trigger: UpdateUserInteraction,
                        current: studentRoleState,
                        next: adminRoleState,
                        computeTarget: (event) => ({ id: event.payload.userId })
                    }),
                    StateTransfer.create({
                        trigger: UpdateUserInteraction,
                        current: dormHeadRoleState,
                        next: studentRoleState,
                        computeTarget: (event) => ({ id: event.payload.userId })
                    }),
                    StateTransfer.create({
                        trigger: UpdateUserInteraction,
                        current: adminRoleState,
                        next: studentRoleState,
                        computeTarget: (event) => ({ id: event.payload.userId })
                    })
                ]
            })
        }),
        Property.create({
            name: 'points',
            type: 'number',
            defaultValue: () => 100,
            // TODO: Fix Summation computation - framework API issue
            // computation: Summation.create({
            //     record: 'BehaviorRecordUserRelation',
            //     attributeQuery: [['target', { attributeQuery: ['points'] }]]
            // })
        }),
        Property.create({
            name: 'createdAt',
            type: 'number',
            defaultValue: () => Date.now()
        }),
        Property.create({
            name: 'updatedAt',
            type: 'number',
            computation: StateMachine.create({
                states: [
                    StateNode.create({ 
                        name: 'initial',
                        computeValue: () => Date.now()
                    }),
                    StateNode.create({ 
                        name: 'updated',
                        computeValue: () => Date.now()
                    })
                ],
                defaultState: StateNode.create({ 
                    name: 'initial',
                    computeValue: () => Date.now()
                }),
                transfers: [
                    StateTransfer.create({
                        trigger: UpdateUserInteraction,
                        current: StateNode.create({ name: 'initial' }),
                        next: StateNode.create({ name: 'updated' })
                    }),
                    StateTransfer.create({
                        trigger: UpdateUserInteraction,
                        current: StateNode.create({ name: 'updated' }),
                        next: StateNode.create({ name: 'updated' })
                    })
                ]
            })
        })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: (event) => {
            if (event.interactionName === 'CreateUser') {
                return {
                    name: event.payload.userData.name,
                    email: event.payload.userData.email,
                    role: 'student',
                    points: 100
                };
            }
            return null;
        }
    })
});

export const Dormitory = Entity.create({
    name: 'Dormitory',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'capacity', type: 'number' }),
        Property.create({
            name: 'status',
            type: 'string',
            computation: StateMachine.create({
                states: [activeDormState, inactiveDormState],
                defaultState: activeDormState,
                transfers: [
                    StateTransfer.create({
                        trigger: UpdateDormitoryInteraction,
                        current: activeDormState,
                        next: inactiveDormState,
                        computeTarget: (event) => ({ id: event.payload.id })
                    }),
                    StateTransfer.create({
                        trigger: UpdateDormitoryInteraction,
                        current: inactiveDormState,
                        next: activeDormState,
                        computeTarget: (event) => ({ id: event.payload.id })
                    })
                ]
            })
        }),
        Property.create({
            name: 'createdAt',
            type: 'number',
            defaultValue: () => Date.now()
        }),
        Property.create({
            name: 'updatedAt',
            type: 'number',
            computation: StateMachine.create({
                states: [
                    StateNode.create({ 
                        name: 'initial',
                        computeValue: () => Date.now()
                    }),
                    StateNode.create({ 
                        name: 'updated',
                        computeValue: () => Date.now()
                    })
                ],
                defaultState: StateNode.create({ 
                    name: 'initial',
                    computeValue: () => Date.now()
                }),
                transfers: [
                    StateTransfer.create({
                        trigger: UpdateDormitoryInteraction,
                        current: StateNode.create({ name: 'initial' }),
                        next: StateNode.create({ name: 'updated' })
                    }),
                    StateTransfer.create({
                        trigger: UpdateDormitoryInteraction,
                        current: StateNode.create({ name: 'updated' }),
                        next: StateNode.create({ name: 'updated' })
                    })
                ]
            })
        })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: (event) => {
            if (event.interactionName === 'CreateDormitory') {
                return {
                    name: event.payload.dormitoryData.name,
                    capacity: event.payload.dormitoryData.capacity,
                    status: 'active'
                };
            }
            return null;
        }
    })
});

export const Bed = Entity.create({
    name: 'Bed',
    properties: [
        Property.create({ name: 'bedNumber', type: 'number' }),
        Property.create({
            name: 'isOccupied',
            type: 'boolean',
            computation: StateMachine.create({
                states: [availableBedState, occupiedBedState],
                defaultState: availableBedState,
                transfers: [
                    StateTransfer.create({
                        trigger: AssignUserToDormitoryInteraction,
                        current: availableBedState,
                        next: occupiedBedState,
                        computeTarget: async function(this: Controller, event) {
                            // Find the bed with the specified bed number in the dormitory
                            const beds = await this.system.storage.find('Bed',
                                MatchExp.atom({
                                    key: 'dormitory.id',
                                    value: ['=', event.payload.dormitoryId]
                                }).and(MatchExp.atom({
                                    key: 'bedNumber',
                                    value: ['=', event.payload.bedNumber]
                                })),
                                undefined,
                                ['id']
                            );
                            return beds[0];
                        }
                    }),
                    StateTransfer.create({
                        trigger: RemoveUserFromDormitoryInteraction,
                        current: occupiedBedState,
                        next: availableBedState,
                        computeTarget: async function(this: Controller, event) {
                            // Find the bed occupied by the user
                            const relations = await this.system.storage.findRelationByName('UserDormitoryRelation',
                                MatchExp.atom({
                                    key: 'source.id',
                                    value: ['=', event.payload.userId]
                                }),
                                undefined,
                                ['id', 'bedNumber', ['target', { attributeQuery: ['id'] }]]
                            );
                            
                            if (relations.length > 0) {
                                const dormId = relations[0].target.id;
                                const bedNumber = relations[0].bedNumber;
                                
                                const beds = await this.system.storage.find('Bed',
                                    MatchExp.atom({
                                        key: 'dormitory.id',
                                        value: ['=', dormId]
                                    }).and(MatchExp.atom({
                                        key: 'bedNumber',
                                        value: ['=', bedNumber]
                                    })),
                                    undefined,
                                    ['id']
                                );
                                return beds[0];
                            }
                            return null;
                        }
                    })
                ]
            })
        }),
        Property.create({
            name: 'createdAt',
            type: 'number',
            defaultValue: () => Date.now()
        }),
        Property.create({
            name: 'updatedAt',
            type: 'number',
            computation: StateMachine.create({
                states: [
                    StateNode.create({ 
                        name: 'initial',
                        computeValue: () => Date.now()
                    }),
                    StateNode.create({ 
                        name: 'updated',
                        computeValue: () => Date.now()
                    })
                ],
                defaultState: StateNode.create({ 
                    name: 'initial',
                    computeValue: () => Date.now()
                }),
                transfers: [
                    StateTransfer.create({
                        trigger: AssignUserToDormitoryInteraction,
                        current: StateNode.create({ name: 'initial' }),
                        next: StateNode.create({ name: 'updated' })
                    }),
                    StateTransfer.create({
                        trigger: RemoveUserFromDormitoryInteraction,
                        current: StateNode.create({ name: 'updated' }),
                        next: StateNode.create({ name: 'updated' })
                    })
                ]
            })
        })
    ],
    computation: Transform.create({
        record: Dormitory,
        callback: (dormitory) => {
            // Create beds when dormitory is created
            const beds = [];
            for (let i = 1; i <= dormitory.capacity; i++) {
                beds.push({
                    bedNumber: i,
                    isOccupied: false
                });
            }
            return beds;
        }
    })
});

export const BehaviorRecord = Entity.create({
    name: 'BehaviorRecord',
    properties: [
        Property.create({ name: 'points', type: 'number' }),
        Property.create({ name: 'reason', type: 'string' }),
        Property.create({
            name: 'createdAt',
            type: 'number',
            defaultValue: () => Date.now()
        })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: (event) => {
            if (event.interactionName === 'CreateBehaviorRecord') {
                return {
                    points: event.payload.points,
                    reason: event.payload.reason
                };
            }
            return null;
        }
    })
});

export const EvictionRequest = Entity.create({
    name: 'EvictionRequest',
    properties: [
        Property.create({ name: 'reason', type: 'string' }),
        Property.create({
            name: 'status',
            type: 'string',
            computation: StateMachine.create({
                states: [pendingEvictionState, approvedEvictionState, rejectedEvictionState],
                defaultState: pendingEvictionState,
                transfers: [
                    StateTransfer.create({
                        trigger: ApproveEvictionInteraction,
                        current: pendingEvictionState,
                        next: approvedEvictionState,
                        computeTarget: (event) => ({ id: event.payload.requestId })
                    }),
                    StateTransfer.create({
                        trigger: ApproveEvictionInteraction,
                        current: pendingEvictionState,
                        next: rejectedEvictionState,
                        computeTarget: (event) => ({ id: event.payload.requestId })
                    })
                ]
            })
        }),
        Property.create({
            name: 'createdAt',
            type: 'number',
            defaultValue: () => Date.now()
        }),
        Property.create({
            name: 'approvedAt',
            type: 'number',
            computation: StateMachine.create({
                states: [
                    StateNode.create({ name: 'pending' }),
                    StateNode.create({ 
                        name: 'approved',
                        computeValue: () => Date.now()
                    }),
                    StateNode.create({ 
                        name: 'rejected',
                        computeValue: () => Date.now()
                    })
                ],
                defaultState: StateNode.create({ name: 'pending' }),
                transfers: [
                    StateTransfer.create({
                        trigger: ApproveEvictionInteraction,
                        current: StateNode.create({ name: 'pending' }),
                        next: StateNode.create({ name: 'approved' }),
                        computeTarget: (event) => ({ id: event.payload.requestId })
                    }),
                    StateTransfer.create({
                        trigger: ApproveEvictionInteraction,
                        current: StateNode.create({ name: 'pending' }),
                        next: StateNode.create({ name: 'rejected' }),
                        computeTarget: (event) => ({ id: event.payload.requestId })
                    })
                ]
            })
        }),
        Property.create({
            name: 'approvedBy',
            type: 'string',
            computation: StateMachine.create({
                states: [
                    StateNode.create({ name: 'pending' }),
                    StateNode.create({ 
                        name: 'approved',
                        computeValue: (lastValue, event) => event?.user?.id || null
                    }),
                    StateNode.create({ 
                        name: 'rejected',
                        computeValue: (lastValue, event) => event?.user?.id || null
                    })
                ],
                defaultState: StateNode.create({ name: 'pending' }),
                transfers: [
                    StateTransfer.create({
                        trigger: ApproveEvictionInteraction,
                        current: StateNode.create({ name: 'pending' }),
                        next: StateNode.create({ name: 'approved' }),
                        computeTarget: (event) => ({ id: event.payload.requestId })
                    }),
                    StateTransfer.create({
                        trigger: ApproveEvictionInteraction,
                        current: StateNode.create({ name: 'pending' }),
                        next: StateNode.create({ name: 'rejected' }),
                        computeTarget: (event) => ({ id: event.payload.requestId })
                    })
                ]
            })
        })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: (event) => {
            if (event.interactionName === 'RequestEviction') {
                return {
                    reason: event.payload.reason,
                    status: 'pending'
                };
            }
            return null;
        }
    })
});

// ==================== Relations ====================
export const UserDormitoryRelation = Relation.create({
    source: User,
    sourceProperty: 'dormitory',
    target: Dormitory,
    targetProperty: 'users',
    type: 'n:1',
    properties: [
        Property.create({ name: 'bedNumber', type: 'number' }),
        Property.create({ name: 'assignedAt', type: 'number' }),
        Property.create({
            name: 'status',
            type: 'string',
            computation: StateMachine.create({
                states: [userDormActiveState, userDormInactiveState],
                defaultState: userDormActiveState,
                transfers: [
                    StateTransfer.create({
                        trigger: RemoveUserFromDormitoryInteraction,
                        current: userDormActiveState,
                        next: userDormInactiveState,
                        computeTarget: async function(this: Controller, event) {
                            const relation = await this.system.storage.findOneRelationByName('UserDormitoryRelation',
                                MatchExp.atom({
                                    key: 'source.id',
                                    value: ['=', event.payload.userId]
                                }),
                                undefined,
                                ['id']
                            );
                            return relation;
                        }
                    })
                ]
            })
        })
    ],
    computation: StateMachine.create({
        states: [
            StateNode.create({ 
                name: 'notExists',
                computeValue: () => null
            }),
            StateNode.create({ 
                name: 'exists',
                computeValue: () => ({ assignedAt: Date.now() })
            })
        ],
        defaultState: StateNode.create({ 
            name: 'notExists',
            computeValue: () => null
        }),
        transfers: [
            StateTransfer.create({
                trigger: AssignUserToDormitoryInteraction,
                current: StateNode.create({ name: 'notExists' }),
                next: StateNode.create({ name: 'exists' }),
                computeTarget: (event) => ({
                    source: { id: event.payload.userId },
                    target: { id: event.payload.dormitoryId },
                    bedNumber: event.payload.bedNumber,
                    assignedAt: Date.now(),
                    status: 'active'
                })
            }),
            StateTransfer.create({
                trigger: RemoveUserFromDormitoryInteraction,
                current: StateNode.create({ name: 'exists' }),
                next: StateNode.create({ name: 'notExists' }),
                computeTarget: async function(this: Controller, event) {
                    const relation = await this.system.storage.findOneRelationByName('UserDormitoryRelation',
                        MatchExp.atom({
                            key: 'source.id',
                            value: ['=', event.payload.userId]
                        }),
                        undefined,
                        ['id']
                    );
                    return relation;
                }
            })
        ]
    })
});

export const DormitoryHeadRelation = Relation.create({
    source: Dormitory,
    sourceProperty: 'head',
    target: User,
    targetProperty: 'managedDormitory',
    type: '1:1',
    properties: [
        Property.create({ name: 'assignedAt', type: 'number' })
    ],
    computation: StateMachine.create({
        states: [dormHeadExistsState, dormHeadDeletedState],
        defaultState: dormHeadDeletedState,
        transfers: [
            StateTransfer.create({
                trigger: AssignDormHeadInteraction,
                current: dormHeadDeletedState,
                next: dormHeadExistsState,
                computeTarget: (event) => ({
                    source: { id: event.payload.dormitoryId },
                    target: { id: event.payload.headId },
                    assignedAt: Date.now()
                })
            }),
            StateTransfer.create({
                trigger: AssignDormHeadInteraction,
                current: dormHeadExistsState,
                next: dormHeadExistsState,
                computeTarget: (event) => ({
                    source: { id: event.payload.dormitoryId },
                    target: { id: event.payload.headId },
                    assignedAt: Date.now()
                })
            })
        ]
    })
});

export const BedDormitoryRelation = Relation.create({
    source: Bed,
    sourceProperty: 'dormitory',
    target: Dormitory,
    targetProperty: 'beds',
    type: 'n:1'
});

export const BehaviorRecordUserRelation = Relation.create({
    source: BehaviorRecord,
    sourceProperty: 'user',
    target: User,
    targetProperty: 'behaviorRecords',
    type: 'n:1'
});

export const BehaviorRecordRecorderRelation = Relation.create({
    source: BehaviorRecord,
    sourceProperty: 'recordedBy',
    target: User,
    targetProperty: 'recordedBehaviors',
    type: 'n:1'
});

export const EvictionRequestUserRelation = Relation.create({
    source: EvictionRequest,
    sourceProperty: 'user',
    target: User,
    targetProperty: 'evictionRequests',
    type: 'n:1'
});

export const EvictionRequestRequesterRelation = Relation.create({
    source: EvictionRequest,
    sourceProperty: 'requestedBy',
    target: User,
    targetProperty: 'requestedEvictions',
    type: 'n:1'
});

export const EvictionRequestApproverRelation = Relation.create({
    source: EvictionRequest,
    sourceProperty: 'approvedBy',
    target: User,
    targetProperty: 'approvedEvictions',
    type: 'n:1'
});

// ==================== All Entities and Relations ====================
export const entities = [
    User,
    Dormitory,
    Bed,
    BehaviorRecord,
    EvictionRequest
];

export const relations = [
    UserDormitoryRelation,
    DormitoryHeadRelation,
    BedDormitoryRelation,
    BehaviorRecordUserRelation,
    BehaviorRecordRecorderRelation,
    EvictionRequestUserRelation,
    EvictionRequestRequesterRelation,
    EvictionRequestApproverRelation
];

// ==================== Dictionary Definitions ====================
export const dicts = [
    // No global dictionaries needed for this system
];

// ==================== Controller Creation ====================
export function createController(system: any) {
    return new Controller({
        system,
        entities,
        relations,
        activities: [],
        interactions,
        dict: dicts,
        recordMutationSideEffects: []
    });
}