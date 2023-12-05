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
        sourceAttribute: 'owner',
        target: userEntity,
        targetAttribute: 'file',
        relType: 'n:1',
        properties: [
            Property.create({ name: 'viewed', type: PropertyTypes.Number })
        ]
    })

    Relation.create({
        source: profileEntity,
        sourceAttribute: 'owner',
        target: userEntity,
        targetAttribute: 'profile',
        relType: '1:1',
        properties: [
            Property.create({ name: 'viewed', type: PropertyTypes.Number })
        ]
    })


    Relation.create({
        source: userEntity,
        sourceAttribute: 'leader',
        target: userEntity,
        targetAttribute: 'member',
        relType: 'n:1'
    })




    const friendRelation = Relation.create({
        source: userEntity,
        sourceAttribute: 'friends',
        target: userEntity,
        targetAttribute: 'friends',
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
        sourceAttribute: 'item',
        target: itemEntity,
        targetAttribute: 'owner',
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
        sourceAttribute: 'teams',
        target: teamEntity,
        targetAttribute: 'members',
        relType: 'n:n',
        properties: [
            Property.create({ name: 'role', type: PropertyTypes.String}),
        ]
    })

    Relation.create({
        source: teamRelation,
        sourceAttribute: 'base',
        target: locEntity,
        targetAttribute: 'belong',
        relType: '1:1',
    })

    Relation.create({
        source: teamRelation,
        sourceAttribute: 'matches',
        target: matchEntity,
        targetAttribute: 'host',
        relType: '1:n',
    })

    Relation.create({
        source: teamRelation,
        sourceAttribute: 'participates',
        target: matchEntity,
        targetAttribute: 'participants',
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
        sourceAttribute: 'powers',
        target: powerEntity,
        targetAttribute: 'owner',
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
        sourceAttribute: 'parent',
        target: departmentEntity,
        targetAttribute: 'children',
        relType: 'n:1',
    })

    // // group and user relation
    // Relation.create({
    //     source: groupEntity,
    //     sourceAttribute: 'members',
    //     target: userEntity,
    //     targetAttribute: 'groups',
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