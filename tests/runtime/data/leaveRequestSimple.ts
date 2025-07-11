import {
    Action,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    createUserRoleAttributive,
    DataAttributive,
    Entity,
    GetAction,
    Interaction,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    Any,
    Every,
    WeightedSummation,
    Transform,
    Controller, 
    InteractionEventArgs, 
    InteractionEventEntity,
    Count
} from 'interaqt';

export const globalUserRole = createUserRoleAttributive({})


const UserEntity = Entity.create({
    name: 'User',
    properties: [
        Property.create({name: 'name', type: PropertyTypes.String})
    ],
})

const supervisorRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'supervisor',
    target: UserEntity,
    targetProperty: 'subordinate',
    type: 'n:1',
})


const RequestEntity = Entity.create({
    name: 'Request',
    properties: [Property.create({
        name: 'reason',
        type: 'string',
        collection: false,
    })]
})


export const createInteraction = Interaction.create({
    name: 'createRequest',
    action: Action.create({name: 'createRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                base: RequestEntity,
            })
        ]
    })
})


// 同意
export const approveInteraction = Interaction.create({
    name: 'approve',
    action: Action.create({name: 'approve'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'request',
                base: RequestEntity,
                isRef: true,
                attributives: boolExpToAttributives(BoolExp.atom(Attributive.create({
                    name: 'Mine',
                    content: async function (this: Controller, request: any, {user}: {user: any}) {
                        const relationName = this.system.storage.getRelationName('User', 'request')
                        const {BoolExp} = this.globals
                        const match = BoolExp.atom({
                            key: 'source.id',
                            value: ['=', request.id]
                        }).and({
                            key: 'target.id',
                            value: ['=', user.id]
                        })
                        const relation = await this.system.storage.findOneRelationByName(relationName, match)
                        // CAUTION 不能 return undefined，会被忽略
                        return !!relation
                    }
                })).and(Attributive.create({
                    name: 'Pending',
                    content: async function (this: Controller, request: any, {user}: {user: any}) {
                        return request.result === 'pending'
                    }
                })))
            })
        ]
    })
})


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:1',
    computation: Transform.create({
        record: InteractionEventEntity,
        callback: function map(event: any) {
            if (event.interactionName === createInteraction.name) {
                return {
                    source: event.payload.request,
                    target: event.user,
                }
            }
            return null
        }
    }),
})


// 主管和 request 的 relation
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'reviewer',
    target: UserEntity,
    targetProperty: 'request',
    type: 'n:n',
    // TODO 改 interaction，没有 mapInteractionItem 了
    computation: Transform.create({
        record: createInteraction,
        callback: async function map(this: Controller, event: any) {
            const {BoolExp} = this.globals

            const match = BoolExp.atom({
                key: 'id',
                value: ['=', event.user.id]
            })

            const {supervisor} = await this.system.storage.findOne(
                'User',
                match,
                undefined,
                [
                    ['supervisor', {attributeQuery: [['supervisor', {attributeQuery: ['*']}]]}],
                ]
            )

            return [{
                source: event.payload.request,
                target: supervisor,
            }, {
                source: event.payload.request,
                isSecond: true,
                target: supervisor.supervisor,
            }]
        }
    }),
    properties: [
        Property.create({
            name: 'isSecond',
            type: 'boolean',
            collection: false,
        }),
        Property.create({
            name: 'result',
            type: 'string',
            collection: false,
            // TODO 改 statemachine
            computed: async function (this: Controller, relation: any) {
                // 简化的逻辑，应该根据实际的审批逻辑来
                return 'pending'
            }
        })
    ]
})


RequestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computation: Every.create({
            record: reviewerRelation,
            notEmpty: true,
            callback:(relation: any) => {
                return relation.result === 'approved'
            }
        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computation: Any.create({
            record: reviewerRelation,
            callback: (relation: any) => {
                return relation.result === 'rejected'
            }
        })
    }),
    Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computed: (request: any) => {
            return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
        }
    }),
)

// 我有多少未处理的
// debugger
const pendingRequestCount = WeightedSummation.create({
    record: reviewerRelation,
    callback: function (relation: any) {
        return {
            weight: 1,
            value: relation.result === 'pending' ? 0 : 1
        }
    }
})
UserEntity.properties.push(
    Property.create({
        name: 'pendingRequestCount',
        type: 'number',
        collection: false,
        computation: pendingRequestCount
    })
)

// 我有多少未处理的二级 request
UserEntity.properties.push(
    Property.create({
        name: 'pendingSubRequestCount',
        type: 'number',
        collection: false,
        computation: Count.create({
            record: reviewerRelation,
            direction: 'target',
            callback: function (request: any, relation: any) {
                return relation.isSecond && request.result === 'pending'
            }
        })
    })
)

const MineDataAttr = DataAttributive.create({
    name: 'MyData',
    content: (event: any) => {
        return {
            key: 'reviewer.id',
            value: ['=', event.user.id]
        }
    }
})

const PendingDataAttr = DataAttributive.create({
    name: 'PendingData',
    content: (event: any) => {
        return {
            key: 'result',
            value: ['=', 'pending']
        }
    }
})

// 查看 我的、未处理的 request
const getMyPendingRequests = Interaction.create({
    name: 'getMyPendingRequests',
    action: GetAction,
    dataAttributives: boolExpToAttributives(BoolExp.atom(MineDataAttr).and(PendingDataAttr)),
    data: RequestEntity,
})

export const entities = [UserEntity, RequestEntity]
export const relations = [supervisorRelation, sendRequestRelation, reviewerRelation]
export const interactions = [createInteraction, approveInteraction, getMyPendingRequests]

