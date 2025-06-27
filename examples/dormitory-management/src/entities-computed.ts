import {
  Entity,
  Property,
  Relation,
  Count,
  WeightedSummation,
  Any,
  Every,
  StateMachine,
  StateNode,
  StateTransfer,
  InteractionEventArgs,
  Transform
} from '@'
import { User, Dormitory, DormitoryMember, DormitoryApplication, ScoreRecord, KickRequest } from './entities'
import { ApproveKickRequest } from './interactions'
import {
  UserDormitoryMember,
  DormitoryDormitoryMember,
  UserDormitoryApplication,
  DormitoryDormitoryApplication,
  DormitoryMemberScoreRecord,
  UserScoreRecord,
  DormitoryMemberKickRequest,
  UserKickRequest,
  UserProcessedKickRequest,
  UserLeaderApprovedApplication,
  UserAdminApprovedApplication
} from './relations'

// 为 Dormitory 实体添加数据映射 - 响应 CreateDormitory 交互
Dormitory.computedData = Transform.create({
  record: 'Interaction',
  callback: (interaction) => {
    if (interaction.interactionName === 'CreateDormitory') {
      return {
        name: interaction.payload.name,
        building: interaction.payload.building,
        roomNumber: interaction.payload.roomNumber,
        capacity: interaction.payload.capacity,
        description: interaction.payload.description,
        createdAt: new Date().toISOString()
      };
    }
    return null;
  }
});

// 为 User 实体添加响应式计算属性
User.properties.push(
  // 是否是管理员
  Property.create({
    name: 'isAdmin',
    type: 'boolean',
    computed: (user) => user.role === 'admin'
  }),
  
  // 当前是否有活跃的宿舍成员身份
  Property.create({
    name: 'hasActiveDormitory',
    type: 'boolean',
    defaultValue: () => false,
    computedData: Any.create({
      record: UserDormitoryMember,
      attributeQuery: [['source', { attributeQuery: ['status'] }]],
      callback: (relation) => {
        return relation.source.status === 'active';
      }
    })
  }),
  
  // 历史总积分（所有宿舍的积分总和）
  Property.create({
    name: 'totalScore',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: UserDormitoryMember,
      attributeQuery: [['source', { attributeQuery: ['score'] }]],
      callback: (relation) => ({
        weight: 1,
        value: relation.source.score || 0
      })
    })
  }),
  
  // 发起的申请数量
  Property.create({
    name: 'applicationCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserDormitoryApplication
    })
  })
);

// 为 Dormitory 实体添加响应式计算属性
Dormitory.properties.push(
  // 当前入住人数（所有成员数量）
  Property.create({
    name: 'totalMemberCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: DormitoryDormitoryMember
    })
  }),
  
  // 当前活跃成员数量（使用computed属性基于关系数据计算）
  Property.create({
    name: 'currentOccupancy',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: DormitoryDormitoryMember,
      attributeQuery: [['source', { attributeQuery: ['status'] }]],
      callback: (relation) => ({
        weight: relation.source.status === 'active' ? 1 : 0,
        value: 1
      })
    })
  }),
  
  // 是否已满
  Property.create({
    name: 'isFull',
    type: 'boolean',
    computed: (dormitory) => {
      const capacity = dormitory.capacity || 0;
      const currentOccupancy = dormitory.currentOccupancy || 0;
      return currentOccupancy >= capacity;
    }
  }),
  
  // 剩余床位数
  Property.create({
    name: 'availableBeds',
    type: 'number',
    computed: (dormitory) => {
      const capacity = dormitory.capacity || 0;
      const currentOccupancy = dormitory.currentOccupancy || 0;
      return capacity - currentOccupancy;
    }
  }),
  
  // 是否有宿舍长
  Property.create({
    name: 'hasLeader',
    type: 'boolean',
    defaultValue: () => false,
    computedData: Any.create({
      record: DormitoryDormitoryMember,
      attributeQuery: [['source', { attributeQuery: ['role', 'status'] }]],
      callback: (relation) => {
        return relation.source.role === 'leader' && relation.source.status === 'active';
      }
    })
  }),
  
  // 待处理的申请数量
  Property.create({
    name: 'pendingApplicationCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: DormitoryDormitoryApplication,
      attributeQuery: [['source', { attributeQuery: ['status'] }]],
      callback: (relation) => ({
        weight: relation.source.status === 'pending' ? 1 : 0,
        value: 1
      })
    })
  }),
  
  // 宿舍总积分（所有活跃成员积分之和）
  Property.create({
    name: 'totalScore',
    type: 'number',
    defaultValue: () => 0,
    computedData: WeightedSummation.create({
      record: DormitoryDormitoryMember,
      attributeQuery: [['source', { attributeQuery: ['score', 'status'] }]],
      callback: (relation) => ({
        weight: relation.source.status === 'active' ? 1 : 0,
        value: relation.source.score || 0
      })
    })
  }),
  
  // 平均积分
  Property.create({
    name: 'averageScore',
    type: 'number',
    computed: (dormitory) => {
      if (!dormitory.currentOccupancy || dormitory.currentOccupancy === 0) return 0;
      return Math.floor(dormitory.totalScore / dormitory.currentOccupancy);
    }
  }),
  
  // 所有成员都是活跃状态
  Property.create({
    name: 'allMembersActive',
    type: 'boolean',
    defaultValue: () => true,
    computedData: Every.create({
      record: DormitoryDormitoryMember,
      attributeQuery: [['source', { attributeQuery: ['status'] }]],
      callback: (relation) => {
        return relation.source.status === 'active';
      }
    })
  })
);

// 为 DormitoryMember 实体添加响应式计算属性
DormitoryMember.properties.push(
  // 是否是宿舍长
  Property.create({
    name: 'isLeader',
    type: 'boolean',
    computed: (member) => member.role === 'leader'
  }),
  
  // 是否是活跃成员
  Property.create({
    name: 'isActive',
    type: 'boolean',
    computed: (member) => member.status === 'active'
  }),
  
  // 积分记录数量
  Property.create({
    name: 'scoreRecordCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: DormitoryMemberScoreRecord
    })
  }),
  
  // 是否处于被踢出风险（积分低于-50）
  Property.create({
    name: 'atKickRisk',
    type: 'boolean',
    computed: (member) => member.score < -50
  })
);

// 为 DormitoryMember 的 status 属性创建状态机
const activeState = StateNode.create({
  name: 'active'
})

const kickedState = StateNode.create({
  name: 'kicked'
})

// 当管理员批准踢出请求时，成员状态从 active 转为 kicked
const activeToKickedTransfer = StateTransfer.create({
  trigger: ApproveKickRequest,
  current: activeState,
  next: kickedState,
  computeTarget: async function (this: any, eventArgs: InteractionEventArgs) {
    // 从 kickRequest 中获取对应的 member
    const kickRequestId = eventArgs.payload!.kickRequestId.id
    const kickRequest = await this.controller.system.storage.get('KickRequest', kickRequestId)
    if (!kickRequest) return null
    
    // 返回需要更新状态的 DormitoryMember
    return { id: kickRequest.targetMember.id }
  }
})

const memberStatusStateMachine = StateMachine.create({
  states: [activeState, kickedState],
  transfers: [activeToKickedTransfer],
  defaultState: activeState
})

// 将状态机应用到 DormitoryMember 的 status 属性
const memberStatusProperty = DormitoryMember.properties.find((p: any) => p.name === 'status')
if (memberStatusProperty) {
  (memberStatusProperty as any).computedData = memberStatusStateMachine;
  (memberStatusProperty as any).defaultValue = () => 'active' // 直接使用字符串值
} 