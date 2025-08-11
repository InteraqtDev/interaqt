/**
 * 宿舍管理系统后端实现
 * 
 * 本文件采用单文件方式实现所有后端逻辑，避免循环依赖问题
 * 实施策略：Stage 1 - 核心业务逻辑（无权限和业务规则验证）
 */

import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Controller,
  Count,
  Summation,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  InteractionEventEntity,
  MatchExp
} from 'interaqt'

// ==========================================
// 1. StateNode 声明（必须在使用前声明）
// ==========================================

// User状态节点
const userStudentState = StateNode.create({ name: 'student' })
const userDormHeadState = StateNode.create({ 
  name: 'dormHead',
  computeValue: () => 'dormHead'
})

const userActiveState = StateNode.create({ name: 'active' })
const userEvictedState = StateNode.create({ 
  name: 'evicted',
  computeValue: () => 'evicted'
})

// Bed状态节点
const bedAvailableState = StateNode.create({ name: 'available' })
const bedOccupiedState = StateNode.create({ 
  name: 'occupied',
  computeValue: () => 'occupied'
})

// EvictionRequest状态节点
const evictionPendingState = StateNode.create({ name: 'pending' })
const evictionApprovedState = StateNode.create({ 
  name: 'approved',
  computeValue: () => 'approved'
})
const evictionRejectedState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => 'rejected'
})

// Relation状态节点（用于可删除的关系）
const relationNotExistsState = StateNode.create({ 
  name: 'notExists',
  computeValue: () => null  // 返回null表示删除关系
})

const relationExistsState = StateNode.create({ 
  name: 'exists',
  computeValue: () => ({})  // 关系存在
})

// ==========================================
// 2. 交互定义（需要先定义，供后续引用）
// ==========================================

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
})

export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      })
    ]
  })
})

export const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assignDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      })
    ]
  })
})

export const RecordViolation = Interaction.create({
  name: 'RecordViolation',
  action: Action.create({ name: 'recordViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'reason', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'score', 
        required: true 
      })
    ]
  })
})

export const RequestEviction = Interaction.create({
  name: 'RequestEviction',
  action: Action.create({ name: 'requestEviction' }),
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
  })
})

export const ApproveEviction = Interaction.create({
  name: 'ApproveEviction',
  action: Action.create({ name: 'approveEviction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'requestId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'comment', 
        required: false 
      })
    ]
  })
})

export const RejectEviction = Interaction.create({
  name: 'RejectEviction',
  action: Action.create({ name: 'rejectEviction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'requestId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'comment', 
        required: false 
      })
    ]
  })
})

// ==========================================
// 3. 实体定义
// ==========================================

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
      type: 'string',
      // defaultValue移除，因为有computation
      computation: StateMachine.create({
        states: [userStudentState, userDormHeadState],
        defaultState: userStudentState,
        transfers: [
          StateTransfer.create({
            trigger: AssignDormHead,
            current: userStudentState,
            next: userDormHeadState,
            computeTarget: (event) => ({ id: event.payload.userId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      // defaultValue移除，因为有computation
      computation: StateMachine.create({
        states: [userActiveState, userEvictedState],
        defaultState: userActiveState,
        transfers: [
          // StateTransfer将在后面配置，避免setup问题
        ]
      })
    }),
    Property.create({ 
      name: 'violationScore', 
      type: 'number',
      defaultValue: () => 0
      // computation将在关系定义后添加
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    // 计算属性
    Property.create({ 
      name: 'violationCount', 
      type: 'number',
      defaultValue: () => 0
      // computation将在关系定义后添加
    }),
    Property.create({ 
      name: 'canBeEvicted', 
      type: 'boolean',
      defaultValue: () => false
      // computed: function() { return this.violationScore >= 30 }
    }),
    Property.create({ 
      name: 'isAssigned', 
      type: 'boolean',
      defaultValue: () => false
      // computed: function() { return !!this.dormitory }
    })
  ]
})

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
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    // 计算属性
    Property.create({ 
      name: 'occupiedBeds', 
      type: 'number',
      defaultValue: () => 0
      // computation将在关系定义后添加
    }),
    Property.create({ 
      name: 'availableBeds', 
      type: 'number',
      defaultValue: () => 0
      // computed: function() { return this.capacity - this.occupiedBeds }
    }),
    Property.create({ 
      name: 'occupancyRate', 
      type: 'number',
      defaultValue: () => 0
      // computed: function() { return (this.occupiedBeds / this.capacity) * 100 }
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          status: 'active'
        }
      }
      return null
    }
  })
})

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'number', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      // defaultValue移除，因为有computation
      computation: StateMachine.create({
        states: [bedAvailableState, bedOccupiedState],
        defaultState: bedAvailableState,
        transfers: [
          // StateTransfer将在后阶段配置
        ]
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
  // Bed不再通过Transform从Dormitory创建，改为在CreateDormitory中处理
})

export const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'score', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordViolation') {
        return {
          reason: event.payload.reason,
          score: event.payload.score,
          user: { id: event.payload.userId },
          recordedBy: event.user
        }
      }
      return null
    }
  })
})

export const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      // defaultValue移除，因为有computation
      computation: StateMachine.create({
        states: [evictionPendingState, evictionApprovedState, evictionRejectedState],
        defaultState: evictionPendingState,
        transfers: [
          StateTransfer.create({
            trigger: ApproveEviction,
            current: evictionPendingState,
            next: evictionApprovedState,
            computeTarget: (event) => ({ id: event.payload.requestId })
          }),
          StateTransfer.create({
            trigger: RejectEviction,
            current: evictionPendingState,
            next: evictionRejectedState,
            computeTarget: (event) => ({ id: event.payload.requestId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'adminComment', 
      type: 'string',
      defaultValue: () => ''
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RequestEviction') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          targetUser: { id: event.payload.userId },
          requestedBy: event.user
        }
      }
      return null
    }
  })
})

// ==========================================
// 4. 关系定义
// ==========================================

export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'assignedBy', 
      type: 'string',
      defaultValue: () => ''
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          assignedAt: Math.floor(Date.now()/1000),
          assignedBy: event.user.id
        }
      }
      return null
    }
  })
})

export const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ]
  // Stage 1先不实现自动分配床位，在测试中手动创建关系
})

export const DormitoryBedsRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
})

export const DormitoryDormHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: { id: event.payload.dormitoryId },
          target: { id: event.payload.userId },
          appointedAt: Math.floor(Date.now()/1000)
        }
      }
      return null
    }
  })
})

export const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violations',
  target: ViolationRecord,
  targetProperty: 'user',
  type: '1:n'
})

export const ViolationRecorderRelation = Relation.create({
  source: ViolationRecord,
  sourceProperty: 'recordedBy',
  target: User,
  targetProperty: 'recordedViolations',
  type: 'n:1'
})

export const EvictionRequestUserRelation = Relation.create({
  source: EvictionRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'evictionRequests',
  type: 'n:1'
})

export const EvictionRequestDormHeadRelation = Relation.create({
  source: EvictionRequest,
  sourceProperty: 'requestedBy',
  target: User,
  targetProperty: 'submittedEvictions',
  type: 'n:1'
})

export const EvictionRequestAdminRelation = Relation.create({
  source: EvictionRequest,
  sourceProperty: 'processedBy',
  target: User,
  targetProperty: 'processedEvictions',
  type: 'n:1',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'ApproveEviction' || event.interactionName === 'RejectEviction') {
        return {
          source: { id: event.payload.requestId },
          target: event.user
        }
      }
      return null
    }
  })
})

// ==========================================
// 5. 配置计算属性（关系定义后）
// ==========================================

// Stage 1暂时注释掉复杂计算，先让基础功能工作
// TODO: Stage 2时恢复这些计算

// // 为User.violationScore添加计算
// const violationScoreProperty = User.properties.find(p => p.name === 'violationScore')
// if (violationScoreProperty) {
//   violationScoreProperty.computation = Summation.create({
//     record: UserViolationRelation,
//     direction: 'source',
//     attributeQuery: [['target', { attributeQuery: ['score'] }]]
//   })
// }

// // 为User.violationCount添加计算
// const violationCountProperty = User.properties.find(p => p.name === 'violationCount')
// if (violationCountProperty) {
//   violationCountProperty.computation = Count.create({
//     record: UserViolationRelation,
//     direction: 'source'
//   })
// }

// // 为Dormitory.occupiedBeds添加计算
// const occupiedBedsProperty = Dormitory.properties.find(p => p.name === 'occupiedBeds')
// if (occupiedBedsProperty) {
//   occupiedBedsProperty.computation = Count.create({
//     record: DormitoryBedsRelation,
//     direction: 'source',
//     callback: (bed) => bed.status === 'occupied'
//   })
// }

// ==========================================
// 6. 导出配置
// ==========================================

export const entities = [
  User,
  Dormitory,
  Bed,
  ViolationRecord,
  EvictionRequest
]
export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedsRelation,
  DormitoryDormHeadRelation,
  UserViolationRelation,
  ViolationRecorderRelation,
  EvictionRequestUserRelation,
  EvictionRequestDormHeadRelation,
  EvictionRequestAdminRelation
]
export const interactions = [
  CreateDormitory,
  AssignUserToDormitory,
  AssignDormHead,
  RecordViolation,
  RequestEviction,
  ApproveEviction,
  RejectEviction
]
export const computations = []