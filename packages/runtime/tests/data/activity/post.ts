import {
    Entity,
    Property,
    PropertyTypes,
    RelationBasedEvery,
    RelationBasedAny,
    RelationCount,
    MapInteractionToProperty,
    Interaction,
    Action,
    UserAttributives,
    MapInteractionToPropertyItem,
    Payload,
    PayloadItem,
    BoolAtomData,
    MapInteractionToRecord
} from "@interaqt/shared";
import {globalUserRole, OtherAttr} from "./roles";
import {approveInteraction, userRefB} from "./createFriendRelationActivity";
import {Controller} from "../../../Controller";
import {messageEntity} from "./messageEntity";
import {sendInteraction} from "../leaveRequest";

export const postEntity = Entity.create({ name: 'Post' })

const createPostInteraction = Interaction.create({
    name: 'createPost',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    action: Action.create({name: 'create'})
})


const updatePostInteraction = Interaction.create({
    name: 'updatePost',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    action: Action.create({name: 'update'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: postEntity,
                isRef: true
            }),
        ]
    })
})


postEntity.properties.push(
    Property.create({ name: 'title', type: PropertyTypes.String }),
    Property.create({
        name: 'content',
        type: PropertyTypes.String,
        computedData: MapInteractionToProperty.create({
            items: [
                MapInteractionToPropertyItem.create({
                    interaction: updatePostInteraction,
                    handle: (event) => { return event.payload.post.content },
                    computeSource: async function (this: Controller, event) {
                        return event.payload.post.id
                    }
                }),
            ]
        })
    }),
)


// FIXME revision 的实现