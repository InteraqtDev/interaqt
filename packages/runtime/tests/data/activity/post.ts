import {
    Action,
    Controller,
    Entity,
    Interaction,
    MapInteraction,
    MapInteractionItem,
    MapRecordMutation,
    Payload,
    PayloadItem,
    Property,
    PropertyTypes,
    RecordMutationEvent,
    Relation
} from '@';

export const postEntity = Entity.create({ name: 'Post' })

const createPostInteraction = Interaction.create({
    name: 'createPost',
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
        computedData: MapInteraction.create({
            items: [
                MapInteractionItem.create({
                    interaction: updatePostInteraction,
                    map: (event) => { return event.payload.post.content },
                    computeTarget: async function (this: Controller, event) {
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
    computedData: MapRecordMutation.create({
      map: async function (this: Controller, event:RecordMutationEvent, events: RecordMutationEvent[]) {
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
    sourceProperty: 'revisions',
    target: postRevisionEntity,
    targetProperty: 'current',
    type: '1:n',
})