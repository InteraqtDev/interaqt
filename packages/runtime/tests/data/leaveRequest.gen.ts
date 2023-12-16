import {
    Action,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    boolExpToDataAttributives,
    Controller,
    DataAttributive,
    Entity,
    GetAction,
    Interaction,
    InteractionEventArgs,
    MapInteraction,
    MapInteractionItem,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount
} from "@interaqt/runtime";



// 1. 定义 Property/Entity/Relation/State
const userNameProp =  Property.create({name: 'name', type: PropertyTypes.String})

const userPendingRequestCountProp = Property.create({
    name: 'pendingRequestCount',
    type: 'number',
    collection: false,

})

// 我有多少未处理的二级 request
const userPendingSubRequestCountProp = Property.create({
    name: 'pendingSubRequestCount',
    type: 'number',
    collection: false,
})


const UserEntity = Entity.create({
    name: 'User',
    properties: [
        userNameProp,
        userPendingRequestCountProp,
        userPendingSubRequestCountProp
    ],
})

const supervisorRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'supervisor',
    target: UserEntity,
    targetProperty: 'subordinate',
    relType: 'n:1',
})

const requestReasonProp = Property.create({
    name: 'reason',
    type: 'string',
    collection: false,
})


const requestApprovedProp = Property.create({
    name: 'approved',
    type: 'boolean',
    collection: false,
})

const requestRejectedProp = Property.create({
    name: 'rejected',
    type: 'boolean',
    collection: false,
})

const requestResultProp = Property.create({
    name: 'result',
    type: 'string',
    collection: false,

})

const RequestEntity = Entity.create({
    name: 'Request',
    properties: [
        requestReasonProp,
        requestApprovedProp,
        requestRejectedProp,
        requestResultProp

    ]
})


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1',
})



const isSecondProp =  Property.create({
    name: 'isSecond',
    type: 'boolean',
    collection: false,
})

const reviewerResultProp = Property.create({
    name: 'result',
    type: 'string',
    collection: false,

})

// 主管和 request 的 relation
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'reviewer',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:n',

    properties: [
        isSecondProp,
        reviewerResultProp
    ]
})


// 2. 开始定义 interaction
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
                    content: async function (this: Controller, request, {user}) {
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
                    content: async function (this: Controller, request, {user}) {
                        return request.result === 'pending'
                    }
                })))
            })
        ]
    })
})


const MineDataAttr = DataAttributive.create({
    name: 'MyData',
    content: (event: InteractionEventArgs) => {
        return {
            key: 'reviewer.id',
            value: ['=', event.user.id]
        }
    }
})

const PendingDataAttr = DataAttributive.create({
    name: 'PendingData',
    content: (event: InteractionEventArgs) => {
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
    dataAttributives: boolExpToDataAttributives(BoolExp.atom(MineDataAttr).and(PendingDataAttr)),
    data: RequestEntity,
})


// 3. 开始使用 Computed Data Type 定义所有数据的 computedData
sendRequestRelation.computedData = MapInteraction.create({
    items: [
        MapInteractionItem.create({
            interaction: createInteraction,
            map: function map(event: any) {
                return {
                    source: event.payload.request,
                    target: event.user,
                }
            }
        }),
    ]
})


reviewerRelation.computedData =  MapInteraction.create({
    items: [
        MapInteractionItem.create({
            interaction: createInteraction,
            map: async function map(this: Controller, event: any) {
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
    ],
})

reviewerResultProp.computedData= MapInteraction.create({
    items: [
        MapInteractionItem.create({
            interaction: approveInteraction,
            map: () => 'approved',
            computeTarget: async function (this: Controller, event) {

                return {
                    "source.id": event.payload.request.id,
                    "target.id": event.user.id
                }
            }
        }),
    ],
})

requestApprovedProp.computedData = RelationBasedEvery.create({
    relation: reviewerRelation,
    relationDirection: 'source',
    notEmpty: true,
    match:
        (_, relation) => {
            return relation.result === 'approved'
        }
})

requestRejectedProp.computedData= RelationBasedAny.create({
    relation: reviewerRelation,
    relationDirection: 'source',
    match:
        (_, relation) => {
            return relation.result === 'rejected'
        }
})

reviewerResultProp.computed =  (request: any) => {
    return request.approved ? 'approved' : (request.rejected ? 'rejected' : 'pending')
}


userPendingRequestCountProp.computedData = RelationCount.create({
    relation: reviewerRelation,
    relationDirection: 'target',
    match: function (request, relation) {
        return request.result === 'pending'
    }
})

userPendingSubRequestCountProp.computedData= RelationCount.create({
    relation: reviewerRelation,
    relationDirection: 'target',
    match: function (request, relation) {
        return relation.isSecond && request.result === 'pending'
    }
})

export const entities = [UserEntity, RequestEntity]
export const relations = [supervisorRelation, sendRequestRelation, reviewerRelation]
export const interactions = [createInteraction, approveInteraction, getMyPendingRequests]
export const states = []
export const activities = []

