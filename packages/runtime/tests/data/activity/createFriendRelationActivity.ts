import {Controller} from "@interaqt/runtime";
import {globalUserRole, OtherAttr} from "./roles.js";
import {UserEntity} from "./user.js";
import {
    Action,
    Activity,
    ActivityGroup,
    BoolAtomData,
    createUserRoleAttributive,
    Entity,
    Interaction,
    MapActivityToRecord,
    Payload,
    PayloadItem,
    Relation,
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer,
    Transfer,
    UserAttributives,
    UserAttributive
} from "@interaqt/shared";
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
                attributives: UserAttributives.create({
                    content: BoolAtomData.create({data: OtherAttr})
                }),
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

export const MyFriend = UserAttributive.create({
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
                attributives: UserAttributives.create({
                    content: BoolAtomData.create({data: MyFriend})
                }),
                base: UserEntity,
                isRef: true,
            }),
        ]
    })
})
// friend 关系的状态机描述
const notFriendState = RelationStateNode.create({
    hasRelation: false
})
const isFriendState = RelationStateNode.create({
    hasRelation: true
})
const addFriendTransfer = RelationStateTransfer.create({
    sourceActivity: createFriendRelationActivity,
    triggerInteraction: approveInteraction,
    fromState: notFriendState,
    toState: isFriendState,
    handleType: 'computeSource',
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
const deleteFriendTransfer = RelationStateTransfer.create({
    // sourceActivity: activity,
    triggerInteraction: deleteInteraction,
    fromState: isFriendState,
    toState: notFriendState,
    handleType: 'computeSource',
    handle: async function (eventArgs, activityId) {
        return {
            source: eventArgs.user,
            target: eventArgs.payload.target
        }
    }

})
const friendRelationSM = RelationStateMachine.create({
    states: [notFriendState, isFriendState],
    transfers: [addFriendTransfer, deleteFriendTransfer],
    defaultState: notFriendState
})
export const friendRelation = Relation.create({
    source: UserEntity,
    sourceAttribute: 'friends',
    target: UserEntity,
    targetAttribute: 'friends',
    relType: 'n:n',
    computedData: friendRelationSM
})
export const mapFriendActivityToRequest = MapActivityToRecord.create({
    sourceActivity: createFriendRelationActivity,
    triggerInteraction: [sendInteraction, approveInteraction, rejectInteraction],
    handle: function map(stack) {
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