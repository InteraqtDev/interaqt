import {
    Action,
    Activity,
    ActivityGroup,
    Attributive,
    BoolExp,
    boolExpToAttributives,
    Controller,
    createUserRoleAttributive,
    Interaction,
    MapActivity,
    MapActivityItem,
    Payload,
    PayloadItem,
    Relation,
    StateMachine,
    StateNode,
    StateTransfer,
    Transfer
} from "@interaqt/runtime";
import {OtherAttr} from "./roles.js";
import {UserEntity} from "./user.js";
import {messageEntity} from "./messageEntity.js";

const userRefA = createUserRoleAttributive({name: 'A', isRef: true})
export const userRefB = createUserRoleAttributive({name: 'B', isRef: true})
export const sendInteraction = Interaction.create({
    name: 'sendRequest',
    userRef: userRefA,
    action: Action.create({name: 'sendRequest'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'to',
                attributives: boolExpToAttributives(BoolExp.atom(OtherAttr)),
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

export const MyFriend = Attributive.create({
    name: 'MyFriend',
    content:
        async function MyFriend(this: Controller, target, { user }){
            const relationName = this.system.storage.getRelationName('User', 'friends')
            const {BoolExp} = this.globals
            const match = BoolExp.atom({
                key: 'source.id',
                value: ['=', user.id]
            }).and({
                key: 'target.id',
                value: ['=', target.id]
            })

            return !!(await this.system.storage.findOneRelationByName(relationName, match))
        }
})
export const approveInteraction = Interaction.create({
    name: 'approve',
    userAttributives: userRefB,
    userRef: createUserRoleAttributive({name: '', isRef: true}),
    action: Action.create({name: 'approve'}),
    payload: Payload.create({})
})
export const rejectInteraction = Interaction.create({
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
export const cancelInteraction = Interaction.create({
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
export const createFriendRelationActivity = Activity.create({
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
export const deleteInteraction = Interaction.create({
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
    value: null
})
const isFriendState = StateNode.create({
    value: {}
})
const addFriendTransfer = StateTransfer.create({
    triggerInteraction: approveInteraction,
    fromState: notFriendState,
    toState: isFriendState,
    handleType: 'computeTarget',
    handle: async function (this: Controller, eventArgs, activityId) {
        const {BoolExp} = this.globals
        const match = BoolExp.atom({
            key: 'interactionName',
            value: ['=', 'sendRequest']
        }).and({
            key: 'activityId',
            value: ['=', activityId]
        })

        const sendEvent = (await this.system.getEvent(match))[0]
        return {
            source: sendEvent.args.user,
            target: eventArgs.user
        }
    }

})
const deleteFriendTransfer = StateTransfer.create({
    // sourceActivity: activity,
    triggerInteraction: deleteInteraction,
    fromState: isFriendState,
    toState: notFriendState,
    handleType: 'computeTarget',
    handle: async function (eventArgs, activityId) {
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
export const friendRelation = Relation.create({
    source: UserEntity,
    sourceProperty: 'friends',
    target: UserEntity,
    targetProperty: 'friends',
    relType: 'n:n',
    computedData: friendRelationSM
})


export const mapFriendActivityToRequest = MapActivity.create({
    items: [
        MapActivityItem.create({
            activity: createFriendRelationActivity,
            triggerInteractions: [sendInteraction, approveInteraction, rejectInteraction],
            map: function (stack) {
                const sendRequestEvent = stack.find((i: any) => i.interaction.name === 'sendRequest')

                if (!sendRequestEvent) {
                    return undefined
                }

                const handled = !!stack.find((i: any) => i.interaction.name === 'approve' || i.interaction.name === 'reject')

                return {
                    from: sendRequestEvent.data.user,
                    to: sendRequestEvent.data.payload.to,
                    message: sendRequestEvent.data.payload.message,
                    handled,
                }
            }
        })
    ],

})