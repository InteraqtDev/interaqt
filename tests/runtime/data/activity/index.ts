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
    Action, Activity, Interaction, Payload, PayloadItem, USER_ENTITY, ActivityGroup,
    HardDeletionProperty, DELETED_STATE, NON_DELETED_STATE
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

    // friend 关系使用 Transform 创建，HardDeletionProperty 删除
     const friendRelation = Relation.create({
        source: UserEntity,
        sourceProperty: 'friends',
        target: UserEntity,
        targetProperty: 'friends',
        type: 'n:n',
        properties: [
            HardDeletionProperty.create()
        ],
        // 使用 Transform 从 approve 交互创建关系
        computation: Transform.create({
            record: InteractionEventEntity,
            attributeQuery: ['*', ['activity', {attributeQuery:['id']}]],
            callback: async function (this: Controller, eventArgs: any) {
                if (eventArgs.interactionName === approveInteraction.name) {
                    // 检查 activity 是否存在
                    if (!eventArgs.activity?.id) {
                        return null
                    }
                    const match = MatchExp.atom({
                        key: 'interactionName',
                        value: ['=', sendInteraction.name]
                    }).and({
                        key: 'activity.id',
                        value: ['=', eventArgs.activity.id]
                    })
                    const sendEvent = await this.system.storage.findOne(InteractionEventEntity.name, match, undefined, ['*'])
                    if (sendEvent && sendEvent.user && sendEvent.payload?.to) {
                        return {
                            source: sendEvent.user,
                            target: sendEvent.payload.to
                        }
                    }
                }
                return null
            }
        })
    })

    // 为 HardDeletionProperty 创建删除状态机
    const deletionProperty = friendRelation.properties!.find(p => p.name === '_isDeleted_')!
    deletionProperty.computation = StateMachine.create({
        states: [NON_DELETED_STATE, DELETED_STATE],
        transfers: [
            StateTransfer.create({
                trigger: deleteInteraction,
                current: NON_DELETED_STATE,
                next: DELETED_STATE,
                computeTarget: async function (this: Controller, eventArgs: any) {
                    // 查找要删除的关系
                    if (!eventArgs.user?.id || !eventArgs.payload?.target?.id) {
                        return undefined
                    }
                    const match = MatchExp.atom({
                        key: 'source.id',
                        value: ['=', eventArgs.user.id]
                    }).and({
                        key: 'target.id',
                        value: ['=', eventArgs.payload.target.id]
                    })
                    const existingRelation = await this.system.storage.findOneRelationByName(
                        friendRelation.name!,
                        match,
                        undefined,
                        ['id']
                    )
                    return existingRelation ? { id: existingRelation.id } : undefined
                }
            })
        ],
        defaultState: NON_DELETED_STATE
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
        computeTarget: async function (this: Controller, eventArgs: any) {
            const request= await this.system.storage.findOne('Request', MatchExp.atom({
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
        computeTarget: async function (this: Controller, eventArgs: any) {
            return this.system.storage.findOne('Request', MatchExp.atom({
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
                        message: interactionEvent.payload.message,
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
        property: 'request',
        attributeQuery: ['result'],
        callback: (request: any) => {
            return {
                weight: 1,
                value: request.result === 'pending' ? 0 : 1,
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
            property: 'request',
            attributeQuery: ['result'],  
            callback: (request: any) => request.result !== 'pending'
        })
    }))
    
    UserEntity.properties.push(Property.create({
        name: 'anySendRequestHandled',
        type: 'boolean',
        collection: false,
        computation: Any.create({
            property: 'request',
            attributeQuery: ['result'],
            callback: (request: any) => request.result !== 'pending'
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
