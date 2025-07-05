import {
    Entity, Property,
    Relation, WeightedSummation, Transform,
    InteractionEventEntity,
    StateNode,
    StateTransfer,
    StateMachine,
    Any, Count, Every, Dictionary, 
    Transfer,
    Attributive,
    createUserRoleAttributive,
    boolExpToAttributives,
    BoolExp,
    Controller,
    Action, Activity, Interaction, Payload, PayloadItem, USER_ENTITY,
    PropertyStateMachineHandle, RecordStateMachineHandle, 
    ActivityGroup
} from 'interaqt';
import { MatchExp } from "@storage";


export function createData() {


    const UserEntity = Entity.create({ name: USER_ENTITY })
    const nameProperty = Property.create({ name: 'name', type: 'string' })
    const ageProperty = Property.create({ name: 'age', type: 'number' })
    UserEntity.properties.push(nameProperty, ageProperty)
    
    
    
     const messageEntity = Entity.create({
        name: 'Message',
        properties: [Property.create({
            name: 'content',
            type: 'string',
            collection: false,
        })]
    })
    
    
    
     const OtherAttr = Attributive.create({
        name: 'Other',
        content: function Other(targetUser: any, { user }: { user: any }){ 
            return user.id !== targetUser.id 
        }
    })
    
     const Admin = createUserRoleAttributive( {
        name: 'Admin'
    })
    
     const Anonymous = createUserRoleAttributive( {
        name: 'Anonymous'
    })
    
     const globalUserRole = createUserRoleAttributive({} )
    
    
    const userRefA = createUserRoleAttributive({name: 'A', isRef: true})
     const userRefB = createUserRoleAttributive({name: 'B', isRef: true})
     const sendInteraction = Interaction.create({
        name: 'sendRequest',
        userRef: userRefA,
        action: Action.create({name: 'sendRequest'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'to',
                    attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
                    isRef:true,
                    base: UserEntity,
                    itemRef: userRefB
                }),
                PayloadItem.create({
                    name: 'message',
                    base: messageEntity,
                })
            ]
        })
    })
    
     const MyFriend = Attributive.create({
        name: 'MyFriend',
        content:
            async function MyFriend(this: Controller, target: any, { user }: { user: any }){
                const relationName = this.system.storage.getRelationName('User', 'friends')
                const match = MatchExp.atom({
                    key: 'source.id',
                    value: ['=', user.id]
                }).and({
                    key: 'target.id',
                    value: ['=', target.id]
                })
    
                return !!(await this.system.storage.findOneRelationByName(relationName, match))
            }
    })
     const approveInteraction = Interaction.create({
        name: 'approve',
        userAttributives: userRefB,
        userRef: createUserRoleAttributive({name: '', isRef: true}),
        action: Action.create({name: 'approve'}),
        payload: Payload.create({})
    })
     const rejectInteraction = Interaction.create({
        name: 'reject',
        userAttributives: userRefB,
        userRef: createUserRoleAttributive({name: '', isRef: true}),
        action: Action.create({name: 'reject'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'reason',
                    base: messageEntity,
                })
            ]
        })
    })
     const cancelInteraction = Interaction.create({
        name: 'cancel',
        userAttributives: userRefA,
        userRef: createUserRoleAttributive({name: '', isRef: true}),
        action: Action.create({name: 'cancel'}),
        payload: Payload.create({})
    })
    const responseGroup = ActivityGroup.create({
        type: 'any',
        activities: [
            Activity.create({
                name: "approveFriendRelation",
                interactions: [
                    approveInteraction
                ]
            }),
            Activity.create({
                name: "rejectFriendRelation",
                interactions: [
                    rejectInteraction
                ]
            }),
            Activity.create({
                name: "cancelFriendRelation",
                interactions: [
                    cancelInteraction
                ]
            })
        ],
    })

     const createFriendRelationActivity = Activity.create({
        name: "createFriendRelation",
        interactions: [
            sendInteraction
        ],
        groups: [
            responseGroup
        ],
        transfers: [
            Transfer.create({
                name: 'fromSendToResponse',
                source: sendInteraction,
                target: responseGroup
            })
        ]
    })

     const deleteInteraction = Interaction.create({
        name: 'deleteFriend',
        action: Action.create({name: 'deleteFriend'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'target',
                    // attributives: Attributives.create({
                    //     content: BoolAtomData.create({data: MyFriend})
                    // }),
                    // 支持上面这种形式，也支持单独一个 Attributive 写法
                    attributives: MyFriend,
                    base: UserEntity,
                    isRef: true,
                }),
            ]
        })
    })

    // friend 关系的状态机描述
    const notFriendState = StateNode.create({
        computeValue: () => null,
        name: 'notFriend'
    })
    const isFriendState = StateNode.create({
        computeValue: () => ({}),
        name: 'isFriend'
    })
    const addFriendTransfer = StateTransfer.create({
        trigger: approveInteraction,
        current: notFriendState,
        next: isFriendState,
        computeTarget: async function (this: RecordStateMachineHandle, eventArgs: any) {
            const match = MatchExp.atom({
                key: 'interactionName',
                value: ['=', sendInteraction.name]
            }).and({
                key: 'activity.id',
                value: ['=', eventArgs.activity.id]
            })
            // FIXME 这里是不是应该直接能从 eventArgs 获取？？？
            const sendEvent = await this.controller.system.storage.findOne(InteractionEventEntity.name, match, undefined, ['*'])
            return {
                source: sendEvent.user,
                target: sendEvent.payload!.to
            }
        }
    })
    const deleteFriendTransfer = StateTransfer.create({
        trigger: deleteInteraction,
        current: isFriendState,
        next: notFriendState,
        computeTarget: async function ( eventArgs: any) {
            return {
                source: eventArgs.user,
                target: eventArgs.payload.target
            }
        }
    
    })
    const friendRelationSM = StateMachine.create({
        states: [notFriendState, isFriendState],
        transfers: [addFriendTransfer, deleteFriendTransfer],
        defaultState: notFriendState
    })
    
     const friendRelation = Relation.create({
        source: UserEntity,
        sourceProperty: 'friends',
        target: UserEntity,
        targetProperty: 'friends',
        type: 'n:n',
        computation: friendRelationSM
    })
    
    
    // 计算 total friend count
    // FIXME 死循环了，双向关系
    UserEntity.properties.push(Property.create({
        name: 'totalFriendCount',
        type: 'number',
        collection: false,
        computation: Count.create({
            record: friendRelation,
        })
    }))
    
    
    
    const resultPendingState = StateNode.create({
        name: 'pending',
    })
    const resultApprovedState = StateNode.create({
        name: 'approved',
    })
    const resultRejectedState = StateNode.create({
        name: 'rejected',
    })
    
    const pendingToApprovedTransfer = StateTransfer.create({
        trigger: approveInteraction,
        current: resultPendingState,
        next: resultApprovedState,
        computeTarget: async function (this: PropertyStateMachineHandle, eventArgs: any) {
            const request= await this.controller.system.storage.findOne('Request', MatchExp.atom({
                key: 'activityId',
                value: ['=', eventArgs.activity.id]
            }))
            return request
        }
    })
    const pendingToRejectedTransfer = StateTransfer.create({
        trigger: rejectInteraction,
        current: resultPendingState,
        next: resultRejectedState,
        computeTarget: async function (this: PropertyStateMachineHandle, eventArgs: any) {
            return this.controller.system.storage.findOne('Request', MatchExp.atom({
                key: 'activityId',
                value: ['=', eventArgs.activity.id]
            }))
        }
    })
    
    const resultStateMachine = StateMachine.create({
        defaultState: resultPendingState,
        states: [resultPendingState, resultApprovedState, resultRejectedState],
        transfers: [pendingToApprovedTransfer, pendingToRejectedTransfer]
    })
    
     const requestEntity = Entity.create({
        name: 'Request',
        computation: Transform.create({
            record: InteractionEventEntity,
            attributeQuery: ['*', ['activity', {attributeQuery:['id']}]],
            callback: (interactionEvent: any) => {
                if (interactionEvent.interactionName === sendInteraction.name) {
                    return {
                        from: interactionEvent.user,
                        to: interactionEvent.payload.to,
                        message: interactionEvent.payload.menssage,
                        activityId: interactionEvent.activity.id
                    }
                }
            }
        }),
        properties: [
            Property.create({
                name: 'result',
                type: 'boolean',
                collection: false,
                computation: resultStateMachine
            }),
            Property.create({
                name: 'message',
                type: 'string',
                collection: false,
            }),
            Property.create({
                name: 'activityId',
                type: 'string',
                collection: false,
            })
        ]
    })
    
    
    
    
    
     const sendRequestRelation = Relation.create({
        source: requestEntity,
        sourceProperty: 'from',
        target: UserEntity,
        targetProperty: 'request',
        type: 'n:1'
    })
    
    
     const receivedRequestRelation = Relation.create({
        source: requestEntity,
        sourceProperty: 'to',
        target: UserEntity,
        targetProperty: 'receivedRequest',
        type: 'n:1',
    })
    
    
     const messageToRequestRelation = Relation.create({
        source: requestEntity,
        sourceProperty: 'message',
        target: messageEntity,
        targetProperty: 'request',
        type: '1:1'
    })
    
    // 计算 unhandled request 的总数
     const userTotalUnhandledRequest = WeightedSummation.create({
        record: receivedRequestRelation,
        attributeQuery: [['source', {attributeQuery: ['result']}]],
        callback: (relation: any) => {
            return {
                weight: 1,
                value: relation.source.result === 'pending' ? 0 : 1,
            }
        }
    })
    
    
    
    
    
    
    UserEntity.properties.push(Property.create({
        name: 'totalUnhandledRequest',
        type: 'number',
        collection: false,
        computation: userTotalUnhandledRequest
    }))
    
    UserEntity.properties.push(Property.create({
        name: 'everySendRequestHandled',
        type: 'boolean',
        collection: false,
        computation: Every.create({
            record: sendRequestRelation,
            attributeQuery: [['source', {attributeQuery: ['result']}]],
            callback: (relation: any) => relation.source.result !== 'pending'
        })
    }))
    
    UserEntity.properties.push(Property.create({
        name: 'anySendRequestHandled',
        type: 'boolean',
        collection: false,
        computation: Any.create({
            record: sendRequestRelation,
            attributeQuery: [['source', {attributeQuery: ['result']}]],
            callback: (relation: any) => relation.source.result !== 'pending'
        })
    }))
    
    
    
    
    const totalFriendRelationState = Dictionary.create({
        name: 'totalFriendRelation',
        type: 'number',
        collection: false,
        computation: Count.create({
            record: friendRelation,
        })
    })
    const everyRequestHandledState = Dictionary.create({
        name: 'everyRequestHandled',
        type: 'boolean',
        collection: false,
        computation: Every.create({
            record: requestEntity,
            callback: (request: any) => {
                return request.result !== 'pending'
            },
            attributeQuery: ['result']
        })
    })
    const anyRequestHandledState = Dictionary.create({
        name: 'anyRequestHandled',
        type: 'boolean',
        collection: false,
        computation: Any.create({
            record: requestEntity,
            callback: (request: any) => {
                return request.result !== 'pending'
            },
            attributeQuery: ['result']
        })
    })
     
    
    return {
        entities: [UserEntity, requestEntity, messageEntity],
        interactions: [sendInteraction, approveInteraction, rejectInteraction, deleteInteraction],
        activities: [createFriendRelationActivity],
        relations: [sendRequestRelation, receivedRequestRelation, messageToRequestRelation, friendRelation],
        dicts: [totalFriendRelationState, everyRequestHandledState, anyRequestHandledState]
    }    

}
