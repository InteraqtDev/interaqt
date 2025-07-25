import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, InteractionEventEntity
} from 'interaqt';

// ================================
// 最简化的实体定义
// ================================

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }),
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateUser') {
        return {
          name: event.payload.name,
          email: event.payload.email,
          role: event.payload.role
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
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity
        };
      }
      return null;
    }
  })
});

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'bedNumber', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'available' }),
    Property.create({ name: 'dormitoryId', type: 'string' }) // 简单的宿舍ID引用
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        const beds = [];
        const capacity = event.payload.capacity;
        // 需要获取创建的宿舍ID，这里暂时使用占位符
        const dormitoryId = 'PLACEHOLDER_DORMITORY_ID';
        for (let i = 1; i <= capacity; i++) {
          beds.push({
            bedNumber: `A${i}`,
            status: 'available',
            dormitoryId: dormitoryId // 这里需要实际的宿舍ID
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
    Property.create({ name: 'violationType', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'scoreDeducted', type: 'number' }),
    Property.create({ name: 'recordedAt', type: 'number', defaultValue: () => Math.floor(Date.now() / 1000) }),
    Property.create({ name: 'violatorId', type: 'string' }) // Store user ID directly
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordViolation') {
        return {
          violationType: event.payload.violationType,
          description: event.payload.description,
          scoreDeducted: event.payload.scoreDeducted,
          recordedAt: Math.floor(Date.now() / 1000), // Use seconds instead of milliseconds
          violatorId: event.payload.violator.id
        };
      }
      return null;
    }
  })
});

export const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'pending' }),
    Property.create({ name: 'requestedAt', type: 'number', defaultValue: () => Math.floor(Date.now() / 1000) }),
    Property.create({ name: 'processedAt', type: 'number' }),
    Property.create({ name: 'decision', type: 'string' }),
    Property.create({ name: 'targetUserId', type: 'string' }), // Store target user ID directly
    Property.create({ name: 'requestorId', type: 'string' }), // Store requestor user ID directly
    Property.create({ name: 'processorId', type: 'string' }) // Store processor user ID directly
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateKickoutRequest') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          requestedAt: Math.floor(Date.now() / 1000),
          targetUserId: event.payload.targetUser.id,
          requestorId: event.user ? event.user.id : null
        };
      }
      return null;
    }
  })
});

// ================================
// 最简化的关系定义
// ================================

export const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1',
  sourceProperty: 'dorm',
  targetProperty: 'users',
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

// 暂时移除DormitoryBedRelation以避免数据库列名冲突
// 改为在Bed实体中添加dormitoryId属性来建立简单关系

export const UserBedRelation = Relation.create({
  source: User,
  target: Bed,
  type: '1:1',
  sourceProperty: 'bed',
  targetProperty: 'user',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: event.payload.user,
          target: event.payload.bed
        };
      }
      return null;
    }
  })
});


// ================================
// 交互定义
// ================================

export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'role', required: true })
    ]
  })
});

export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
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


// ================================
// 导出配置
// ================================

export const entities = [User, Dormitory, Bed, ViolationRecord, KickoutRequest];
export const relations = [UserDormitoryRelation, UserBedRelation];
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

export const interactions = [CreateUser, CreateDormitory, AssignUserToDormitory, RecordViolation, CreateKickoutRequest, AppointDormHead, ProcessKickoutRequest];
export const activities = [];
export const dicts = [];