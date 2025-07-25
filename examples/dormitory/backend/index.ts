import { 
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  Count,
  Summation,
  MatchExp,
  InteractionEventEntity
} from 'interaqt';

// 前置声明交互，避免循环引用
let ProcessKickoutRequestInteraction: any;
let AssignUserToDormitoryInteraction: any;
let UpdateDormitoryInfoInteraction: any;
let RemoveDormHeadInteraction: any;

// 首先声明所有StateNode
const userActiveState = StateNode.create({ name: 'active' });
const userInactiveState = StateNode.create({ name: 'inactive' });

const dormitoryActiveState = StateNode.create({ name: 'active' });
const dormitoryInactiveState = StateNode.create({ name: 'inactive' });

const bedAvailableState = StateNode.create({ name: 'available' });
const bedOccupiedState = StateNode.create({ name: 'occupied' });
const bedMaintenanceState = StateNode.create({ name: 'maintenance' });

const requestPendingState = StateNode.create({ name: 'pending' });
const requestApprovedState = StateNode.create({ 
  name: 'approved',
  computeValue: () => ({ processedAt: Date.now() })
});
const requestRejectedState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => ({ processedAt: Date.now() })
});

const relationActiveState = StateNode.create({ name: 'active' });
const relationInactiveState = StateNode.create({ name: 'inactive' });

// ================================
// 实体定义
// ================================

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'email', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'role', 
      type: 'string' 
    }), // admin/dormHead/student
    Property.create({ 
      name: 'score', 
      type: 'number', 
      defaultValue: () => 0,
      // 暂时不使用计算属性，等关系定义后再添加
      // computation: Summation.create({
      //   record: UserViolationRecordRelation,
      //   direction: 'source',
      //   attributeQuery: [['target', { attributeQuery: ['scoreDeducted'] }]]
      // })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [userActiveState, userInactiveState],
        defaultState: userActiveState,
        transfers: [
          // 暂时不添加状态转换，等交互定义后再添加
          // StateTransfer.create({
          //   trigger: ProcessKickoutRequestInteraction,
          //   from: userActiveState,
          //   to: userInactiveState,
          //   attributeQuery: [['payload', { attributeQuery: ['decision'] }]],
          //   condition: (event: any) => event.payload.decision === 'approved'
          // })
        ]
      })
    }),
    // 计算属性：是否达到踢出标准
    Property.create({
      name: 'isEligibleForKickout',
      type: 'boolean',
      defaultValue: () => false,
      computed: function(user: any) {
        return (user.score || 0) >= 10;
      }
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateUser') {
        return {
          name: event.payload.name,
          email: event.payload.email,
          role: event.payload.role,
          score: 0,
          createdAt: Date.now(),
          status: 'active'
        };
      }
      return null;
    }
  })
});

export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'capacity', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [dormitoryActiveState, dormitoryInactiveState],
        defaultState: dormitoryActiveState,
        transfers: [
          // 暂时不添加状态转换，等交互定义后再添加
          // StateTransfer.create({
          //   trigger: UpdateDormitoryInfoInteraction,
          //   from: dormitoryActiveState,
          //   to: dormitoryInactiveState,
          //   attributeQuery: [['payload', { attributeQuery: ['status'] }]],
          //   condition: (event: any) => event.payload.status === 'inactive'
          // }),
          // StateTransfer.create({
          //   trigger: UpdateDormitoryInfoInteraction,
          //   from: dormitoryInactiveState,
          //   to: dormitoryActiveState,
          //   attributeQuery: [['payload', { attributeQuery: ['status'] }]],
          //   condition: (event: any) => event.payload.status === 'active'
          // })
        ]
      })
    }),
    // 计算属性：当前入住人数
    Property.create({
      name: 'currentOccupancy',
      type: 'number',
      defaultValue: () => 0,
      // 暂时不使用计算属性，等关系定义后再添加
      // computation: Count.create({
      //   record: UserDormitoryRelation,
      //   direction: 'target',
      //   callback: (relation: any) => relation.status === 'active'
      // })
    }),
    // 计算属性：可用床位数
    Property.create({
      name: 'availableBeds',
      type: 'number',
      defaultValue: () => 0,
      // 暂时不使用计算属性，等关系定义后再添加
      // computation: Count.create({
      //   record: DormitoryBedRelation,
      //   direction: 'source',
      //   callback: (relation: any) => relation.target.status === 'available'
      // })
    }),
    // 计算属性：入住率
    Property.create({
      name: 'occupancyRate',
      type: 'number',
      defaultValue: () => 0,
      computed: function(dormitory: any) {
        if (dormitory.capacity === 0) return 0;
        return (dormitory.currentOccupancy || 0) / dormitory.capacity;
      }
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          createdAt: Date.now(),
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
    Property.create({ 
      name: 'bedNumber', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'available',
      computation: StateMachine.create({
        states: [bedAvailableState, bedOccupiedState, bedMaintenanceState],
        defaultState: bedAvailableState,
        transfers: [
          // 暂时不添加状态转换，等交互定义后再添加
          // StateTransfer.create({
          //   trigger: AssignUserToDormitoryInteraction,
          //   from: bedAvailableState,
          //   to: bedOccupiedState
          // }),
          // StateTransfer.create({
          //   trigger: ProcessKickoutRequestInteraction,
          //   from: bedOccupiedState,
          //   to: bedAvailableState,
          //   attributeQuery: [['payload', { attributeQuery: ['decision'] }]],
          //   condition: (event: any) => event.payload.decision === 'approved'
          // })
        ]
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    }),
    // 计算属性：是否可用
    Property.create({
      name: 'isAvailable',
      type: 'boolean',
      defaultValue: () => true,
      computed: function(bed: any) {
        return bed.status === 'available';
      }
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        const beds = [];
        const capacity = event.payload.capacity;
        for (let i = 1; i <= capacity; i++) {
          beds.push({
            bedNumber: `A${i}`,
            status: 'available',
            createdAt: Date.now()
          });
        }
        return beds;
      }
      return null;
    }
  })
});

export const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ 
      name: 'violationType', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'description', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'scoreDeducted', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'recordedAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordViolation') {
        return {
          violationType: event.payload.violationType,
          description: event.payload.description,
          scoreDeducted: event.payload.scoreDeducted,
          recordedAt: Date.now()
        };
      }
      return null;
    }
  })
});

export const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'pending',
      computation: StateMachine.create({
        states: [requestPendingState, requestApprovedState, requestRejectedState],
        defaultState: requestPendingState,
        transfers: [
          // 暂时不添加状态转换，等交互定义后再添加
          // StateTransfer.create({
          //   trigger: ProcessKickoutRequestInteraction,
          //   from: requestPendingState,
          //   to: requestApprovedState,
          //   attributeQuery: [['payload', { attributeQuery: ['decision'] }]],
          //   condition: (event: any) => event.payload.decision === 'approved'
          // }),
          // StateTransfer.create({
          //   trigger: ProcessKickoutRequestInteraction,
          //   from: requestPendingState,
          //   to: requestRejectedState,
          //   attributeQuery: [['payload', { attributeQuery: ['decision'] }]],
          //   condition: (event: any) => event.payload.decision === 'rejected'
          // })
        ]
      })
    }),
    Property.create({ 
      name: 'requestedAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'decision', 
      type: 'string' 
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateKickoutRequest') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          requestedAt: Date.now()
        };
      }
      return null;
    }
  })
});

// ================================
// 关系定义
// ================================

export const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1',
  sourceProperty: 'dorm',
  targetProperty: 'residents',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: event.payload.user,
          target: event.payload.dormitory
        };
      }
      return null;
    }
  })
});

export const UserBedRelation = Relation.create({
  source: User,
  target: Bed,
  type: '1:1',
  sourceProperty: 'bed',
  targetProperty: 'user',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active'
      // 暂时移除StateMachine以解决列名冲突
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: event.payload.user,
          target: event.payload.bed,
          assignedAt: Date.now(),
          status: 'active'
        };
      }
      return null;
    }
  })
});

export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  target: Bed,
  type: '1:n',
  sourceProperty: 'beds',
  targetProperty: 'dormitory',
  properties: [
    Property.create({ 
      name: 'createdAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        const relations = [];
        const capacity = event.payload.capacity;
        // 这里需要与床位创建逻辑配合，建立宿舍与床位的关系
        // 实际实现时需要获取创建的床位ID
        return null; // 简化处理，实际需要更复杂的逻辑
      }
      return null;
    }
  })
});

export const DormitoryHeadRelation = Relation.create({
  source: Dormitory,
  target: User,
  type: '1:1',
  sourceProperty: 'dormHead',
  targetProperty: 'managedDormitory',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number', 
      defaultValue: () => Date.now() 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [relationActiveState, relationInactiveState],
        defaultState: relationActiveState,
        transfers: [
          // 暂时不添加状态转换，等交互定义后再添加
          // StateTransfer.create({
          //   trigger: RemoveDormHeadInteraction,
          //   from: relationActiveState,
          //   to: relationInactiveState
          // })
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AppointDormHead') {
        return {
          source: event.payload.dormitory,
          target: event.payload.user,
          appointedAt: Date.now(),
          status: 'active'
        };
      }
      return null;
    }
  })
});

export const UserViolationRecordRelation = Relation.create({
  source: User,
  target: ViolationRecord,
  type: '1:n',
  sourceProperty: 'violationRecords',
  targetProperty: 'violator',
  properties: [],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordViolation') {
        return {
          source: event.payload.violator,
          target: { id: 'RECORD_ID' } // 需要获取创建的记录ID
        };
      }
      return null;
    }
  })
});

export const RecorderViolationRecordRelation = Relation.create({
  source: User,
  target: ViolationRecord,
  type: '1:n',
  sourceProperty: 'recordedViolations',
  targetProperty: 'recorder',
  properties: [],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordViolation') {
        return {
          source: event.user,
          target: { id: 'RECORD_ID' } // 需要获取创建的记录ID
        };
      }
      return null;
    }
  })
});

export const RequestorKickoutRequestRelation = Relation.create({
  source: User,
  target: KickoutRequest,
  type: '1:n',
  sourceProperty: 'kickoutRequests',
  targetProperty: 'requestor',
  properties: [],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateKickoutRequest') {
        return {
          source: event.user,
          target: { id: 'REQUEST_ID' } // 需要获取创建的申请ID
        };
      }
      return null;
    }
  })
});

export const TargetUserKickoutRequestRelation = Relation.create({
  source: User,
  target: KickoutRequest,
  type: '1:n',
  sourceProperty: 'kickoutRequestsAgainst',
  targetProperty: 'targetUser',
  properties: [],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateKickoutRequest') {
        return {
          source: event.payload.targetUser,
          target: { id: 'REQUEST_ID' } // 需要获取创建的申请ID
        };
      }
      return null;
    }
  })
});

export const ProcessorKickoutRequestRelation = Relation.create({
  source: User,
  target: KickoutRequest,
  type: '1:n',
  sourceProperty: 'processedKickoutRequests',
  targetProperty: 'processor',
  properties: [],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'ProcessKickoutRequest') {
        return {
          source: event.user,
          target: event.payload.request
        };
      }
      return null;
    }
  })
});

// ================================
// 过滤实体定义
// ================================

export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

export const AvailableBed = Entity.create({
  name: 'AvailableBed',
  sourceEntity: Bed,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'available']
  })
});

export const PendingKickoutRequest = Entity.create({
  name: 'PendingKickoutRequest',
  sourceEntity: KickoutRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});

export const ActiveUserDormitoryRelation = Entity.create({
  name: 'ActiveUserDormitoryRelation',
  sourceEntity: UserDormitoryRelation,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

// ================================
// 交互定义
// ================================

export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'capacity', 
        required: true 
      })
    ]
  })
});

export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'email', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'role', 
        required: true 
      })
    ]
  })
});

export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'bed',
        base: Bed,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const AppointDormHead = Interaction.create({
  name: 'AppointDormHead',
  action: Action.create({ name: 'appointDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const RecordViolation = Interaction.create({
  name: 'RecordViolation',
  action: Action.create({ name: 'recordViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'violator',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'violationType', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'description', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'scoreDeducted', 
        required: true 
      })
    ]
  })
});

export const CreateKickoutRequest = Interaction.create({
  name: 'CreateKickoutRequest',
  action: Action.create({ name: 'createKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUser',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'reason', 
        required: true 
      })
    ]
  })
});

export const ProcessKickoutRequest = Interaction.create({
  name: 'ProcessKickoutRequest',
  action: Action.create({ name: 'processKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'request',
        base: KickoutRequest,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ 
        name: 'decision', 
        required: true 
      })
    ]
  })
});

export const GetDormitoryInfo = Interaction.create({
  name: 'GetDormitoryInfo',
  action: Action.create({ name: 'getDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const GetUserInfo = Interaction.create({
  name: 'GetUserInfo',
  action: Action.create({ name: 'getUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      })
    ]
  })
});

export const GetViolationRecords = Interaction.create({
  name: 'GetViolationRecords',
  action: Action.create({ name: 'getViolationRecords' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true
      }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true
      }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

export const GetKickoutRequests = Interaction.create({
  name: 'GetKickoutRequests',
  action: Action.create({ name: 'getKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true
      }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

export const UpdateDormitoryInfo = Interaction.create({
  name: 'UpdateDormitoryInfo',
  action: Action.create({ name: 'updateDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
});

export const UpdateUserInfo = Interaction.create({
  name: 'UpdateUserInfo',
  action: Action.create({ name: 'updateUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'user',
        base: User,
        isRef: true,
        required: true 
      }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'email' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
});

export const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'removeDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitory',
        base: Dormitory,
        isRef: true,
        required: true 
      })
    ]
  })
});

// ================================
// 导出配置
// ================================

export const entities = [
  User, 
  Dormitory, 
  Bed, 
  ViolationRecord, 
  KickoutRequest,
  ActiveUser,
  AvailableBed,
  PendingKickoutRequest,
  ActiveUserDormitoryRelation
];

export const relations = [
  // 暂时只保留最基本的关系进行测试
  UserDormitoryRelation
];

export const interactions = [
  CreateDormitory,
  CreateUser,
  AssignUserToDormitory,
  AppointDormHead,
  RecordViolation,
  CreateKickoutRequest,
  ProcessKickoutRequest,
  GetDormitoryInfo,
  GetUserInfo,
  GetViolationRecords,
  GetKickoutRequests,
  UpdateDormitoryInfo,
  UpdateUserInfo,
  RemoveDormHead
];

export const activities = [];
export const dicts = [];