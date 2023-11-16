import {createUserRoleAttributive, UserAttributive, UserAttributives} from "@shared/user/User";
import {
    Action,
    Activity,
    ActivityGroup,
    Interaction,
    Payload,
    PayloadItem,
    Transfer
} from "@shared/activity/Activity";
import {OtherAttr} from "./roles";
import {Entity, Property, PropertyTypes, Relation} from "@shared/entity/Entity";
import {State} from "@shared/state/State";

import {
    RelationStateMachine,
    RelationStateNode,
    RelationStateTransfer,
    MapActivityToEntity,
    RelationCount,
    Count,
    RelationBasedEvery, RelationBasedAny, Every, Any, MapInteractionToRecord
} from "@shared/IncrementalComputation";
import {removeAllInstance, stringifyAllInstances} from "@shared/createClass";
import {activity} from "./activity";

const UserEntity = Entity.createReactive({ name: 'User' })
const nameProperty = Property.createReactive({ name: 'name', type: PropertyTypes.String })
UserEntity.properties.push(nameProperty)

export const globalUserRole = createUserRoleAttributive({name: 'user'}, {isReactive: true})
const userRefA = createUserRoleAttributive({name: 'A', isRef: true}, {isReactive: true})
export const userRefB = createUserRoleAttributive({name: 'B', isRef: true}, {isReactive: true})

const RequestEntity= Entity.createReactive({
    name: 'Request',
    properties: [Property.createReactive({
        name: 'approved',
        type:'boolean',
        collection: false,
    }), Property.createReactive({
        name: 'rejected',
        type:'boolean',
        collection: false,
    }), Property.createReactive({
        name: 'reason',
        type:'string',
        collection: false,
    })]
})


export const sendInteraction = Interaction.createReactive({
    name: 'sendRequest',
    userAttributives: UserAttributives.createReactive({}),
    userRoleAttributive: globalUserRole,
    userRef: userRefA,
    action: Action.createReactive({name: 'sendRequest'}),
    payload: Payload.createReactive({
        items: [
            PayloadItem.createReactive({
                name: 'to',
                attributives: UserAttributives.createReactive({
                    content: {
                        type:'atom',
                        data: {
                            key: OtherAttr.name
                        }
                    }
                }),
                base: globalUserRole,
                itemRef: userRefB
            }),
            PayloadItem.createReactive({
                name: 'request',
                base: RequestEntity,
                itemRef: Entity.createReactive({name: '', isRef: true}),
            })
        ]
    })
})


const sendRequestRelation = Relation.createReactive({
    entity1: RequestEntity,
    targetName1: 'from',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1',
    computedData:  MapInteractionToRecord.createReactive({
        sourceInteraction: sendInteraction,
        handle:`function map(event){
return {
    target: event.user,
    source: event.payload.request,
}
}`
    }),
})

const receivedRequestRelation = Relation.createReactive({
    entity1: RequestEntity,
    targetName1: 'to',
    entity2: UserEntity,
    targetName2: 'request',
    relType: 'n:1',
    computedData:  MapInteractionToRecord.createReactive({
        sourceInteraction: sendInteraction,
        handle:`function map(event){
return {
    target: event.payload.to,
    source: event.payload.request,
}
}`
    }),
})


//
//
// export const approveInteraction = Interaction.createReactive({
//     name: 'approve',
//     userAttributives: UserAttributives.createReactive({}),
//     userRoleAttributive: userRefB,
//     userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
//     action: Action.createReactive({name: 'approve'}),
//     payload: Payload.createReactive({})
// })
//
// export const Message = Entity.createReactive({
//     name: 'Message',
//     properties: [Property.create({
//         name: 'content',
//         type: 'string',
//         collection: false,
//     })]
// })
//
// const rejectInteraction = Interaction.createReactive({
//     name: 'reject',
//     userAttributives: UserAttributives.createReactive({}),
//     userRoleAttributive: userRefB,
//     userRef: createUserRoleAttributive({name: '', isRef: true}, {isReactive: true}),
//     action: Action.createReactive({name: 'reject'}),
//     payload: Payload.createReactive({
//         items: [
//             PayloadItem.createReactive({
//                 name: 'reason',
//                 base: Message,
//                 itemRef: Entity.createReactive({name: '', isRef: true}),
//             })
//         ]
//     })
// })



export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()
