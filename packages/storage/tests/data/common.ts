import {Entity, Property, PropertyTypes, Relation} from "@interaqt/shared";
import {KlassInstance, removeAllInstance} from "@interaqt/shared";

// @ts-ignore
export function createCommonData(): { entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[] } {

    const userEntity = Entity.create({
        name: 'User',
        properties: [
            Property.create({ name: 'name', type: PropertyTypes.String }),
            Property.create({ name: 'age', type: PropertyTypes.Number })
        ]
    })


    const profileEntity = Entity.create({
        name: 'Profile',
        properties: [Property.create({ name: 'title', type: PropertyTypes.String })]
    })

    const fileEntity = Entity.create({
        name: 'File',
        properties: [Property.create({ name: 'fileName', type: PropertyTypes.String })]
    })


    Relation.create({
        source: fileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'file',
        relType: 'n:1',
        properties: [
            Property.create({ name: 'viewed', type: PropertyTypes.Number })
        ]
    })

    Relation.create({
        source: profileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'profile',
        relType: '1:1',
        properties: [
            Property.create({ name: 'viewed', type: PropertyTypes.Number })
        ]
    })


    Relation.create({
        source: userEntity,
        sourceProperty: 'leader',
        target: userEntity,
        targetProperty: 'member',
        relType: 'n:1'
    })




    const friendRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'friends',
        target: userEntity,
        targetProperty: 'friends',
        relType: 'n:n',
        properties: [
            Property.create({ name: 'level', type: PropertyTypes.Number })
        ]
    })



    const itemEntity = Entity.create({
        name: 'Item',
        properties: [Property.create({ name: 'itemName', type: PropertyTypes.String })]
    })

    Relation.create({
        source: userEntity,
        sourceProperty: 'item',
        target: itemEntity,
        targetProperty: 'owner',
        relType: '1:1',
        isTargetReliance: true
    })

    const teamEntity = Entity.create({
        name: 'Team',
        properties: [Property.create({ name: 'teamName', type: PropertyTypes.String })]
    })


    const locEntity = Entity.create({
        name: 'Location',
        properties: [
            Property.create({ name: 'name', type: PropertyTypes.String })
        ]
    })

    const matchEntity = Entity.create({
        name: 'Match',
        properties: [
            Property.create({ name: 'name', type: PropertyTypes.String })
        ]
    })

    const teamRelation = Relation.create({
        source: userEntity,
        sourceProperty: 'teams',
        target: teamEntity,
        targetProperty: 'members',
        relType: 'n:n',
        properties: [
            Property.create({ name: 'role', type: PropertyTypes.String}),
        ]
    })

    Relation.create({
        source: teamRelation,
        sourceProperty: 'base',
        target: locEntity,
        targetProperty: 'belong',
        relType: '1:1',
    })

    Relation.create({
        source: teamRelation,
        sourceProperty: 'matches',
        target: matchEntity,
        targetProperty: 'host',
        relType: '1:n',
    })

    Relation.create({
        source: teamRelation,
        sourceProperty: 'participates',
        target: matchEntity,
        targetProperty: 'participants',
        relType: 'n:n',
    })


    const powerEntity = Entity.create({
        name: 'Power',
        properties: [
            Property.create({ name: 'powerName', type: PropertyTypes.String })
        ]
    })

    Relation.create({
        source: userEntity,
        sourceProperty: 'powers',
        target: powerEntity,
        targetProperty: 'owner',
        relType: '1:n',
        isTargetReliance: true
    })


    //  FIXME Group 这个名字不行？？？
    // department
    const departmentEntity = Entity.create({
        name: 'Department',
        properties: [
            Property.create({ name: 'name', type: PropertyTypes.String })
        ]
    })

    // group and group relation
    Relation.create({
        source: departmentEntity,
        sourceProperty: 'parent',
        target: departmentEntity,
        targetProperty: 'children',
        relType: 'n:1',
    })

    // // group and user relation
    // Relation.create({
    //     source: groupEntity,
    //     sourceProperty: 'members',
    //     target: userEntity,
    //     targetProperty: 'groups',
    //     relType: 'n:n',
    //     properties: [
    //         Property.create({ name: 'role', type: PropertyTypes.String })
    //     ]
    // })


    const entities = [...Entity.instances] as KlassInstance<typeof Entity, false>[]
    const relations = [...Relation.instances] as KlassInstance<typeof Relation, false>[]

    removeAllInstance()

    return {
        entities,
        relations
    }

}