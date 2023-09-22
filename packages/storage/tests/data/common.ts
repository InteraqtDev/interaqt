import {Entity, Property, PropertyTypes, Relation} from "../../../shared/entity/Entity";
import { removeAllInstance } from "../../../shared/createClass";

export const createCommonData = () => {

    const userEntity = Entity.create({ name: 'User' })
    const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
    const ageProperty = Property.create({ name: 'age', type: PropertyTypes.Number })
    userEntity.properties.push(nameProperty)
    userEntity.properties.push(ageProperty)


    const profileEntity = Entity.create({ name: 'Profile'})
    const profileNameProperty = Property.create({ name: 'title', type: PropertyTypes.String })
    profileEntity.properties.push(profileNameProperty)

    const fileEntity = Entity.create({ name: 'File'})
    const filenameProperty = Property.create({ name: 'fileName', type: PropertyTypes.String })
    fileEntity.properties.push(filenameProperty)


    Relation.create({
        entity1: fileEntity,
        targetName1: 'owner',
        entity2: userEntity,
        targetName2: 'file',
        relType: 'n:1'
    })

    Relation.create({
        entity1: profileEntity,
        targetName1: 'owner',
        entity2: userEntity,
        targetName2: 'profile',
        relType: '1:1'
    })


    Relation.create({
        entity1: userEntity,
        targetName1: 'leader',
        entity2: userEntity,
        targetName2: 'member',
        relType: 'n:1'
    })

    Relation.create({
        entity1: userEntity,
        targetName1: 'friends',
        entity2: userEntity,
        targetName2: 'friends',
        relType: 'n:n'
    })


    const itemEntity = Entity.create({ name: 'Item'})
    const itemProperty = Property.create({ name: 'itemName', type: PropertyTypes.String })
    itemEntity.properties.push(itemProperty)

    Relation.create({
        entity1: userEntity,
        targetName1: 'item',
        entity2: itemEntity,
        targetName2: 'owner',
        relType: '1:1'
    })

    const entities = [...Entity.instances]
    const relations = [...Relation.instances]

    removeAllInstance()

    return {
        entities,
        relations
    }

}