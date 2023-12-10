import {UserEntity} from "./user.js";
import {approveInteraction, mapFriendActivityToRequest, rejectInteraction} from "./createFriendRelationActivity.js";
import {Controller} from "@interaqt/runtime";
import {
    Entity,
    MapInteractionToProperty,
    MapInteractionToPropertyItem,
    Property,
    Relation,
    RelationBasedAny,
    RelationBasedEvery,
    RelationCount
} from "@interaqt/shared";
import {messageEntity} from "./messageEntity.js";

export const requestEntity = Entity.create({
    name: 'Request',
    computedData: mapFriendActivityToRequest,
    properties: [Property.create({
        name: 'handled',
        type: 'boolean',
        collection: false,
    })]
})
export const sendRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'from',
    target: UserEntity,
    targetProperty: 'request',
    relType: 'n:1'
})
export const receivedRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'to',
    target: UserEntity,
    targetProperty: 'receivedRequest',
    relType: 'n:1',
    properties: [Property.create({
        name: 'result',
        type: 'string',
        collection: false,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: approveInteraction,
                    handle: () => 'approved',
                    computeSource: async function (this: Controller, event, activityId) {
                        const {BoolExp} = this.globals
                        const match = BoolExp.atom({
                            key: 'activity.id',
                            value: ['=', activityId]
                        })

                        const request = await this.system.storage.findOne('Request', match)
                        return {
                            "source.id": request.id,
                            "target.id": event.user.id
                        }
                    }
                }),
                MapInteractionToPropertyItem.create({
                    interaction: rejectInteraction,
                    handle: () => 'rejected',
                    computeSource: async function (this: Controller, event, activityId) {
                        const {BoolExp} = this.globals
                        const match = BoolExp.atom({
                            key: 'activity.id',
                            value: ['=', activityId]
                        })

                        const request = await this.system.storage.findOne('Request', match)

                        return {
                            "source.id": request.id,
                            "target.id": event.user.id
                        }
                    }
                })
            ],
        })
    })]
})
export const messageToRequestRelation = Relation.create({
    source: requestEntity,
    sourceProperty: 'message',
    target: messageEntity,
    targetProperty: 'request',
    relType: '1:1'
})
// 计算 unhandled request 的总数
export const userTotalUnhandledRequest = RelationCount.create({
    relation: receivedRequestRelation,
    relationDirection: 'target',
    matchExpression:
        (request) => {
            return !request.handled
        }
    ,
})


requestEntity.properties.push(
    Property.create({
        name: 'approved',
        type: 'boolean',
        collection: false,
        computedData: RelationBasedEvery.create({
            relation: receivedRequestRelation,
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
            relation: receivedRequestRelation,
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