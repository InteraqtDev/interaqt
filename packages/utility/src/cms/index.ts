import {
    InteractionEventArgs,
    Attributives,
    Attributive,
    Entity,
    Property,
    Relation,
    Interaction,
    Action,
    Payload,
    PayloadItem,
    PropertyTypes,
    KlassInstance,
    MapInteraction,
    MapInteractionItem,
    GetAction,
    Controller
} from '@interaqt/runtime'

type ContentProperty = {
    name: string
    type: string
    default?: any
    collection?: boolean

    unique?: boolean
    required?: boolean
    options?: string[]
    validation?: (value: any) => boolean
}

type EntityDefinition = {
    unique?: boolean
    validation?: (value: any) => boolean
}

type ContentResult = {
    contentEntity: KlassInstance<typeof Entity, false>,
    ownerRelation: KlassInstance<typeof Relation, false>,
    interactions: {
        create: KlassInstance<typeof Interaction, false>,
        update: KlassInstance<typeof Interaction, false>,
        delete: KlassInstance<typeof Interaction, false>,
        list: KlassInstance<typeof Interaction, false>,
        readOne: KlassInstance<typeof Interaction, false>
    }
}

// 所有的权限控制都放到外边让用户用 boolExp + condition 去做
export function createContent(name:string, properties: KlassInstance<typeof Property, false>[],  userEntity: KlassInstance<typeof Entity, false>):ContentResult {
    // 1. 创建所有的 property


    //  1.2. 自动加上 createdAt
    const createAtProp = Property.create({
        name: 'createdAt',
        type: PropertyTypes.String
    })

    //  1.3. 自动加上 updatedAt
    const updateAtProp = Property.create({
        name: 'updatedAt',
        type: PropertyTypes.String
    })

    const deletedAtProp = Property.create({
        name: 'deletedAt',
        type: PropertyTypes.String
    })

    //  1.4. 自动加上 deleted
    const isDeletedProp = Property.create({
        name: 'isDeleted',
        type: PropertyTypes.Boolean
    })

    // 2. 创建 entity
    const contentEntity = Entity.create({
        name: name,
        properties: [
            ...properties,
            createAtProp,
            updateAtProp,
            isDeletedProp
        ]
    })

    // 3. 自动加上 owner 关系
    const ownerRelation = Relation.create({
        source: userEntity,
        sourceProperty: name.toLowerCase(),
        // CAUTION 这里不管 definition.unique 是什么都是 1:n，因为我们是软删除。
        relType: '1:n',
        target: contentEntity,
        targetProperty: 'owner'
    })

    // 4. 创建 interaction
    // 4.1. 创建 create
    const createInteraction = Interaction.create({
        name: `create${name}`,
        action: Action.create({ name: 'create'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    base: contentEntity
                })
            ]
        })
    })

    // 4.2.  update
    const updateInteraction = Interaction.create({
        name: `update${name}`,
        action: Action.create({ name: 'update'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    base: contentEntity,
                    isRef: true,
                })
            ]
        })
    })

    // 4.3. delete
    const deleteInteraction = Interaction.create({
        name: `delete${name}`,
        action: Action.create({ name: 'delete'}),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    isRef:true,
                    base: contentEntity
                })
            ]
        })
    })

    // 5. 创建 computedData
    //  5.1. createdAt
    createAtProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: createInteraction,
                map: () => Date.now(),
                computeTarget: (event: InteractionEventArgs) => {
                    return {id: event.payload!.content.id }
                }
            })
        ]
    })
    //  5.1. updateAt
    updateAtProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: updateInteraction,
                map: () => Date.now(),
                computeTarget: (event: InteractionEventArgs) => {
                    return {id: event.payload!.content.id }
                }
            })
        ]
    })
    //  5.1. deletedAt
    deletedAtProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: deleteInteraction,
                map: () => Date.now(),
                computeTarget: (event: InteractionEventArgs) => {
                    return {id: event.payload!.content.id }
                }

            })
        ]
    })
    //  5.1. isDeleted
    isDeletedProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: deleteInteraction,
                map: () => true,
                computeTarget: (event: InteractionEventArgs) => {
                    return {id: event.payload!.content.id }
                }

            })
        ]
    })

    //  5.x 可编辑字段的 computedData
    properties.forEach(property => {
        property.computedData = MapInteraction.create({
            items: [
                MapInteractionItem.create({
                    interaction: updateInteraction,
                    map: (event: InteractionEventArgs) => event.payload!.content[property.name],
                    computeTarget: (event: InteractionEventArgs) => {
                        if (event.payload!.content.hasOwnProperty(property.name)) {
                            return {id: event.payload!.content.id }
                        }
                    }
                })
            ]
        })
    })

    //  5.x owner relation computedData
    ownerRelation.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: createInteraction,
                map: (event: InteractionEventArgs) => {
                    return {
                        source: event.user,
                        target: event.payload!.content
                    }
                },
                computeTarget: (event: InteractionEventArgs) => {
                    return {id: event.payload!.content.id }
                }
            })
        ]
    })

    // 6. 创建 Get Interaction
    const listInteraction = Interaction.create({
        name: `list${name}`,
        // CAUTION 这里没有用 userAttributive 来控制，因为默认所有人都可以执行。我们要控制的是谁能读哪条数据。
        action: GetAction,
        data: contentEntity,
    })

    // 7. read one Get Interaction
    const readOneInteraction = Interaction.create({
        name: `read${name}`,
        // CAUTION 这里没有用 userAttributive 来控制，因为默认所有人都可以执行。我们要控制的是谁能读哪条数据。
        action: GetAction,
        data: contentEntity,
        // TODO modifier 里面加上一个 limit 1
    })

    return {
        contentEntity,
        ownerRelation,
        interactions: {
            create: createInteraction,
            update:updateInteraction,
            delete: deleteInteraction,
            list: listInteraction,
            readOne: readOneInteraction
        }
    }
}

export const createRequiredAttributive = (propName: string) => {
    return Attributive.create({
        name: `${propName}Required`,
        content: function(content: any) {
            return !!content[propName]
        }
    })
}

export const createUniquePropertyAttributive = (entityName:string, propName: string) => {
    return Attributive.create({
        name: `${propName}Unique`,
        content: async function(this: Controller, content: any) {
            const BoolExp = this.globals.BoolExp
            const match = BoolExp.atom({key: propName, value: ['=', content[propName]]})
            const hasOne = await this.system.storage.findOne(entityName, match)
            return !hasOne
        }
    })
}

export const createUniqueContentAttributive = (entityName: string) => {
    return Attributive.create({
        name: `${entityName}Unique`,
        content: async function(content: any) {
            // TODO
        }
    })
}

