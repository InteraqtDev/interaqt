import { Entity, KlassInstance, Property, Relation } from '@interaqt/shared';
// @ts-ignore
export function createCommonData(): { entities: Entity[], relations: Relation[] } {

    const userEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'User',
        properties: [
            Property.create({ name: 'name', type: 'String' }),
            Property.create({ name: 'age', type: 'Number' }),
            Property.create({name:'gender', type:'string', defaultValue: () => 'male'})
        ]
    })

    const profileEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Profile',
        properties: [Property.create({ name: 'title', type: 'String' })]
    })

    const fileEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'File',
        properties: [Property.create({ name: 'fileName', type: 'String' })]
    });

    const fileOwnerRelation: KlassInstance<typeof Relation> = Relation.create({
        source: fileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'file',
        type: 'n:1',
        properties: [
            Property.create({ name: 'viewed', type: 'Number' })
        ]
    });

    const profileOwnerRelation: KlassInstance<typeof Relation> = Relation.create({
        source: profileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'profile',
        type: '1:1',
        properties: [
            Property.create({ name: 'viewed', type: 'Number' })
        ]
    });

    const leaderMemberRelation: KlassInstance<typeof Relation> = Relation.create({
        source: userEntity,
        sourceProperty: 'leader',
        target: userEntity,
        targetProperty: 'member',
        type: 'n:1',
        properties: []
    });

    const friendRelation: KlassInstance<typeof Relation> = Relation.create({
        source: userEntity,
        sourceProperty: 'friends',
        target: userEntity,
        targetProperty: 'friends',
        type: 'n:n',
        properties: [
            Property.create({ name: 'level', type: 'Number' })
        ]
    });

    const itemEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Item',
        properties: [Property.create({ name: 'itemName', type: 'String' })]
    });

    const itemOwnerRelation: KlassInstance<typeof Relation> = Relation.create({
        source: userEntity,
        sourceProperty: 'item',
        target: itemEntity,
        targetProperty: 'owner',
        type: '1:1',
        isTargetReliance: true,
        properties: []
    });

    const teamEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Team',
        properties: [Property.create({ name: 'teamName', type: 'String' })]
    });

    const locEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Location',
        properties: [
            Property.create({ name: 'name', type: 'String' })
        ]
    });

    const matchEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Match',
        properties: [
            Property.create({ name: 'name', type: 'String' })
        ]
    });

    const teamRelation: KlassInstance<typeof Relation> = Relation.create({
        source: userEntity,
        sourceProperty: 'teams',
        target: teamEntity,
        targetProperty: 'members',
        type: 'n:n',
        properties: [
            Property.create({ name: 'role', type: 'String' })
        ]
    });

    const teamBaseRelation: KlassInstance<typeof Relation> = Relation.create({
        source: teamRelation,
        sourceProperty: 'base',
        target: locEntity,
        targetProperty: 'belong',
        type: '1:1',
        properties: []
    });

    const teamMatchHostRelation: KlassInstance<typeof Relation> = Relation.create({
        source: teamRelation,
        sourceProperty: 'matches',
        target: matchEntity,
        targetProperty: 'host',
        type: '1:n',
        properties: []
    });

    const teamMatchParticipantRelation: KlassInstance<typeof Relation> = Relation.create({
        source: teamRelation,
        sourceProperty: 'participates',
        target: matchEntity,
        targetProperty: 'participants',
        type: 'n:n',
        properties: []
    });

    const powerEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Power',
        properties: [
            Property.create({ name: 'powerName', type: 'String' })
        ]
    });

    const powerOwnerRelation: KlassInstance<typeof Relation> = Relation.create({
        source: userEntity,
        sourceProperty: 'powers',
        target: powerEntity,
        targetProperty: 'owner',
        type: '1:n',
        isTargetReliance: true,
        properties: []
    });

    const departmentEntity: KlassInstance<typeof Entity> = Entity.create({
        name: 'Department',
        properties: [
            Property.create({ name: 'name', type: 'String' })
        ]
    });

    const departmentHierarchyRelation: KlassInstance<typeof Relation> = Relation.create({
        source: departmentEntity,
        sourceProperty: 'parent',
        target: departmentEntity,
        targetProperty: 'children',
        type: 'n:1',
        properties: []
    });

    const entities: KlassInstance<typeof Entity>[] = [
        userEntity,
        profileEntity,
        fileEntity,
        itemEntity,
        teamEntity,
        locEntity,
        matchEntity,
        powerEntity,
        departmentEntity,
    ];
    
    const relations: KlassInstance<typeof Relation>[] = [
        fileOwnerRelation,
        profileOwnerRelation,
        leaderMemberRelation,
        friendRelation,
        itemOwnerRelation,
        teamRelation,
        teamBaseRelation,
        teamMatchHostRelation,
        teamMatchParticipantRelation,
        powerOwnerRelation,
        departmentHierarchyRelation,
    ];

    return {
        entities,
        relations
    };
}