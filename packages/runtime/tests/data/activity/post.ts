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
    MapInteractionToRecord, MapRecordMutationToRecord, Relation
} from "@interaqt/shared";
import {globalUserRole, OtherAttr} from "./roles";
import {approveInteraction, userRefB} from "./createFriendRelationActivity";
import {Controller} from "../../../Controller";
import {messageEntity} from "./messageEntity";
import {sendInteraction} from "../leaveRequest";
import {RecordMutationEvent} from "../../../System";

export const postEntity = Entity.create({ name: 'Post' })

const createPostInteraction = Interaction.create({
    name: 'createPost',
    userAttributives: UserAttributives.create({}),
    userRoleAttributive: globalUserRole,
    action: Action.create({name: 'create'}),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'post',
                base: postEntity,
            }),
        ]
    })
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


// revision 的实现
export const postRevisionEntity = Entity.create({
    name: 'PostRevision',
    properties: [
        // 这里测试 title 不可更新，所以 revision 里面不记录。
        Property.create({ name: 'content', type: PropertyTypes.String })
    ],
    computedData: MapRecordMutationToRecord.create({
      handle: async function (this: Controller, event:RecordMutationEvent, events: RecordMutationEvent[]) {
          if (event.type === 'update' && event.recordName === 'Post') {
              return {
                  content: event.oldRecord!.content,
                  current: {
                      id: event.oldRecord!.id
                  }
              }
          }
      }
    })
})

export const postRevisionRelation = Relation.create({
    source: postEntity,
    sourceAttribute: 'revisions',
    target: postRevisionEntity,
    targetAttribute: 'current',
    relType: '1:n',
})