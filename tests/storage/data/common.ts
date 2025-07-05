import { Entity, EntityInstance, Property, Relation, RelationInstance } from '@shared';


export function createCommonData(): { entities: EntityInstance[], relations: RelationInstance[] } {

    const userEntity: EntityInstance = Entity.create({
        name: 'User',
        properties: [
            Property.create({ name: 'name', type: 'String' }),
            Property.create({ name: 'age', type: 'Number' }),
            Property.create({name:'gender', type:'string', defaultValue: () => 'male'})
        ]
    })

    const profileEntity: EntityInstance = Entity.create({
        name: 'Profile',
        properties: [Property.create({ name: 'title', type: 'String' })]
    })

    const fileEntity: EntityInstance = Entity.create({
        name: 'File',
        properties: [Property.create({ name: 'fileName', type: 'String' })]
    });

    const fileOwnerRelation: RelationInstance = Relation.create({
        source: fileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'file',
        type: 'n:1',
        properties: [
            Property.create({ name: 'viewed', type: 'Number' })
        ]
    });

    const profileOwnerRelation: RelationInstance = Relation.create({
        source: profileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'profile',
        type: '1:1',
        properties: [
            Property.create({ name: 'viewed', type: 'Number' })
        ]
    });

    const leaderMemberRelation: RelationInstance = Relation.create({
        source: userEntity,
        sourceProperty: 'leader',
        target: userEntity,
        targetProperty: 'member',
        type: 'n:1',
        properties: []
    });

    const friendRelation: RelationInstance = Relation.create({
        source: userEntity,
        sourceProperty: 'friends',
        target: userEntity,
        targetProperty: 'friends',
        type: 'n:n',
        properties: [
            Property.create({ name: 'level', type: 'Number' })
        ]
    });

    const itemEntity: EntityInstance = Entity.create({
        name: 'Item',
        properties: [Property.create({ name: 'itemName', type: 'String' })]
    });

    const itemOwnerRelation: RelationInstance = Relation.create({
        source: userEntity,
        sourceProperty: 'item',
        target: itemEntity,
        targetProperty: 'owner',
        type: '1:1',
        isTargetReliance: true,
        properties: []
    });

    const teamEntity: EntityInstance = Entity.create({
        name: 'Team',
        properties: [Property.create({ name: 'name', type: 'String' })]
    });

    const locEntity: EntityInstance = Entity.create({
        name: 'Location',
        properties: [
            Property.create({ name: 'name', type: 'String' })
        ]
    });

    const matchEntity: EntityInstance = Entity.create({
        name: 'Match',
        properties: [
            Property.create({ name: 'name', type: 'String' })
        ]
    });

    const teamRelation: RelationInstance = Relation.create({
        source: userEntity,
        sourceProperty: 'teams',
        target: teamEntity,
        targetProperty: 'members',
        type: 'n:n',
        properties: [
            Property.create({ name: 'role', type: 'String' })
        ]
    });

    const teamBaseRelation: RelationInstance = Relation.create({
        source: teamRelation,
        sourceProperty: 'base',
        target: locEntity,
        targetProperty: 'belong',
        type: '1:1',
        properties: []
    });

    const teamMatchHostRelation: RelationInstance = Relation.create({
        source: teamEntity,
        sourceProperty: 'matches',
        target: matchEntity,
        targetProperty: 'host',
        type: '1:n',
        properties: []
    });

    const teamMatchParticipantRelation: RelationInstance = Relation.create({
        source: teamEntity ,
        sourceProperty: 'participates',
        target: matchEntity,
        targetProperty: 'participants',
        type: 'n:n',
        properties: []
    });

    const powerEntity: EntityInstance = Entity.create({
        name: 'Power',
        properties: [
            Property.create({ name: 'powerName', type: 'String' })
        ]
    });

    const powerOwnerRelation: RelationInstance = Relation.create({
        source: userEntity,
        sourceProperty: 'powers',
        target: powerEntity,
        targetProperty: 'owner',
        type: '1:n',
        isTargetReliance: true,
        properties: []
    });

    const departmentEntity: EntityInstance = Entity.create({
        name: 'Department',
        properties: [
            Property.create({ name: 'name', type: 'String' })
        ]
    });

    const departmentHierarchyRelation: RelationInstance = Relation.create({
        source: departmentEntity,
        sourceProperty: 'parent',
        target: departmentEntity,
        targetProperty: 'children',
        type: 'n:1',
        properties: []
    });

    const entities: EntityInstance[] = [
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
    
    const relations: RelationInstance[] = [
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