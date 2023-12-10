import {
    Action,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    boolExpToDataAttributives,
    createUserRoleAttributive,
    DataAttributive,
    Entity,
    GetAction,
    Interaction,
    MapInteractionToProperty,
    MapInteractionToPropertyItem,
    MapInteractionToRecord,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount
} from "@interaqt/shared";
import {Controller} from "@interaqt/runtime";
import {InteractionEventArgs} from "../../types/interaction";

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
    relType: 'n:1',
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


const sendRequestRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1',
    computedData: MapInteractionToRecord.create({
        sourceInteraction: createInteraction,
        handle: function map(event: any) {
            return {
                source: event.payload.request,
                target: event.user,
            }
        }
    }),
})

// 主管和 request 的 relation
const reviewerRelation = Relation.create({
    source: RequestEntity,
    sourceProperty: 'reviewer',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:n',
    computedData: MapInteractionToRecord.create({
        sourceInteraction: createInteraction,
        handle: async function map(this: Controller, event: any) {
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
            computedData: MapInteractionToProperty.create({
                items: [
                    MapInteractionToPropertyItem.create({
                        interaction: approveInteraction,
                        handle: () => 'approved',
                        computeSource: async function (this: Controller, event) {

                            return {
                                "source.id": event.payload.request.id,
                                "target.id": event.user.id
                            }
                        }
                    }),
                ],
            })
        })
    ]
})


RequestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedEvery.create({
            relation: reviewerRelation,
            relationDirection: 'source',
            notEmpty: true,
            matchExpression:
                (_, relation) => {
                    return relation.result === 'approved'
                }
        })
    }),
    Property.create({
        name: 'rejected',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedAny.create({
            relation: reviewerRelation,
            relationDirection: 'source',
            matchExpression:
                (_, relation) => {
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
UserEntity.properties.push(
    Property.create({
        name: 'pendingRequestCount',
        type: 'number',
        collection: false,
        computedData: RelationCount.create({
            relation: reviewerRelation,
            relationDirection: 'target',
            matchExpression: function (request, relation) {
                return request.result === 'pending'
            }
        })
    })
)

// 我有多少未处理的二级 request
UserEntity.properties.push(
    Property.create({
        name: 'pendingSubRequestCount',
        type: 'number',
        collection: false,
        computedData: RelationCount.create({
            relation: reviewerRelation,
            relationDirection: 'target',
            matchExpression: function (request, relation) {
                return relation.isSecond && request.result === 'pending'
            }
        })
    })
)

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

export const entities = [UserEntity, RequestEntity]
export const relations = [supervisorRelation, sendRequestRelation, reviewerRelation]
export const interactions = [createInteraction, approveInteraction, getMyPendingRequests]

