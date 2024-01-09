import { Action, Attributive, Entity, GetAction, Interaction, MapInteraction, MapInteractionItem, Payload, PayloadItem, Property, PropertyTypes, Relation } from '@interaqt/runtime';
// 所有的权限控制都放到外边让用户用 boolExp + condition 去做
export function createContent(name, properties, userEntity) {
    // 1. 创建所有的 property
    //  1.2. 自动加上 createdAt
    const createAtProp = Property.create({
        name: 'createdAt',
        type: PropertyTypes.String
    });
    //  1.3. 自动加上 updatedAt
    const updateAtProp = Property.create({
        name: 'updatedAt',
        type: PropertyTypes.String
    });
    const deletedAtProp = Property.create({
        name: 'deletedAt',
        type: PropertyTypes.String
    });
    //  1.4. 自动加上 deleted
    const isDeletedProp = Property.create({
        name: 'isDeleted',
        type: PropertyTypes.Boolean
    });
    // 2. 创建 entity
    const contentEntity = Entity.create({
        name: name,
        properties: [
            ...properties,
            createAtProp,
            updateAtProp,
            isDeletedProp
        ]
    });
    // 3. 自动加上 owner 关系
    const ownerRelation = Relation.create({
        source: userEntity,
        sourceProperty: name.toLowerCase(),
        // CAUTION 这里不管 definition.unique 是什么都是 1:n，因为我们是软删除。
        relType: '1:n',
        target: contentEntity,
        targetProperty: 'owner'
    });
    // 4. 创建 interaction
    // 4.1. 创建 create
    const createInteraction = Interaction.create({
        name: `create${name}`,
        action: Action.create({ name: 'create' }),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    base: contentEntity
                })
            ]
        })
    });
    // 4.2.  update
    const updateInteraction = Interaction.create({
        name: `update${name}`,
        action: Action.create({ name: 'update' }),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    base: contentEntity,
                    isRef: true,
                })
            ]
        })
    });
    // 4.3. delete
    const deleteInteraction = Interaction.create({
        name: `delete${name}`,
        action: Action.create({ name: 'delete' }),
        payload: Payload.create({
            items: [
                PayloadItem.create({
                    name: 'content',
                    isRef: true,
                    base: contentEntity
                })
            ]
        })
    });
    // 5. 创建 computedData
    //  5.1. createdAt
    createAtProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: createInteraction,
                map: () => Date.now(),
                computeTarget: (event) => {
                    return { id: event.payload.content.id };
                }
            })
        ]
    });
    //  5.1. updateAt
    updateAtProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: updateInteraction,
                map: () => Date.now(),
                computeTarget: (event) => {
                    return { id: event.payload.content.id };
                }
            })
        ]
    });
    //  5.1. deletedAt
    deletedAtProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: deleteInteraction,
                map: () => Date.now(),
                computeTarget: (event) => {
                    return { id: event.payload.content.id };
                }
            })
        ]
    });
    //  5.1. isDeleted
    isDeletedProp.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: deleteInteraction,
                map: () => true,
                computeTarget: (event) => {
                    return { id: event.payload.content.id };
                }
            })
        ]
    });
    //  5.x 可编辑字段的 computedData
    properties.forEach(property => {
        property.computedData = MapInteraction.create({
            items: [
                MapInteractionItem.create({
                    interaction: updateInteraction,
                    map: (event) => event.payload.content[property.name],
                    computeTarget: (event) => {
                        if (event.payload.content.hasOwnProperty(property.name)) {
                            return { id: event.payload.content.id };
                        }
                    }
                })
            ]
        });
    });
    //  5.x owner relation computedData
    ownerRelation.computedData = MapInteraction.create({
        items: [
            MapInteractionItem.create({
                interaction: createInteraction,
                map: (event) => {
                    return {
                        source: event.user,
                        target: event.payload.content
                    };
                },
                computeTarget: (event) => {
                    return { id: event.payload.content.id };
                }
            })
        ]
    });
    // 6. 创建 Get Interaction
    const listInteraction = Interaction.create({
        name: `list${name}`,
        // CAUTION 这里没有用 userAttributive 来控制，因为默认所有人都可以执行。我们要控制的是谁能读哪条数据。
        action: GetAction,
        data: contentEntity,
    });
    // 7. read one Get Interaction
    const readOneInteraction = Interaction.create({
        name: `read${name}`,
        // CAUTION 这里没有用 userAttributive 来控制，因为默认所有人都可以执行。我们要控制的是谁能读哪条数据。
        action: GetAction,
        data: contentEntity,
        // TODO modifier 里面加上一个 limit 1
    });
    return {
        contentEntity,
        ownerRelation,
        interactions: {
            create: createInteraction,
            update: updateInteraction,
            delete: deleteInteraction,
            list: listInteraction,
            readOne: readOneInteraction
        }
    };
}
export const createRequiredAttributive = (propName) => {
    return Attributive.create({
        name: `${propName}Required`,
        content: function (content) {
            return !!content[propName];
        }
    });
};
export const createUniquePropertyAttributive = (entityName, propName) => {
    return Attributive.create({
        name: `${propName}Unique`,
        content: async function (content) {
            const BoolExp = this.globals.BoolExp;
            const match = BoolExp.atom({ key: propName, value: ['=', content[propName]] });
            const hasOne = await this.system.storage.findOne(entityName, match);
            return !hasOne;
        }
    });
};
export const createUniqueContentAttributive = (entityName) => {
    return Attributive.create({
        name: `${entityName}Unique`,
        content: async function (content) {
            // TODO
        }
    });
};
//# sourceMappingURL=index.js.map