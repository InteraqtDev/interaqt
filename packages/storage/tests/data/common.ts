import { Entity, Property, Relation, RelationType } from "../../types";

// @ts-ignore
export function createCommonData(): { entities: Entity[], relations: Relation[] } {

    const userEntity: Entity = {
        name: 'User',
        properties: [
            { name: 'name', type: 'String' },
            { name: 'age', type: 'Number' }
        ]
    };

    const profileEntity: Entity = {
        name: 'Profile',
        properties: [{ name: 'title', type: 'String' }]
    };

    const fileEntity: Entity = {
        name: 'File',
        properties: [{ name: 'fileName', type: 'String' }]
    };

    const fileOwnerRelation: Relation = {
        source: fileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'file',
        type: RelationType.ManyToOne,
        properties: [
            { name: 'viewed', type: 'Number' }
        ]
    };

    const profileOwnerRelation: Relation = {
        source: profileEntity,
        sourceProperty: 'owner',
        target: userEntity,
        targetProperty: 'profile',
        type: RelationType.OneToOne,
        properties: [
            { name: 'viewed', type: 'Number' }
        ]
    };

    const leaderMemberRelation: Relation = {
        source: userEntity,
        sourceProperty: 'leader',
        target: userEntity,
        targetProperty: 'member',
        type: RelationType.ManyToOne,
        properties: []
    };

    const friendRelation: Relation = {
        source: userEntity,
        sourceProperty: 'friends',
        target: userEntity,
        targetProperty: 'friends',
        type: RelationType.ManyToMany,
        properties: [
            { name: 'level', type: 'Number' }
        ]
    };

    const itemEntity: Entity = {
        name: 'Item',
        properties: [{ name: 'itemName', type: 'String' }]
    };

    const itemOwnerRelation: Relation = {
        source: userEntity,
        sourceProperty: 'item',
        target: itemEntity,
        targetProperty: 'owner',
        type: RelationType.OneToOne,
        isTargetReliance: true,
        properties: []
    };

    const teamEntity: Entity = {
        name: 'Team',
        properties: [{ name: 'teamName', type: 'String' }]
    };

    const locEntity: Entity = {
        name: 'Location',
        properties: [
            { name: 'name', type: 'String' }
        ]
    };

    const matchEntity: Entity = {
        name: 'Match',
        properties: [
            { name: 'name', type: 'String' }
        ]
    };

    const teamRelation: Relation = {
        source: userEntity,
        sourceProperty: 'teams',
        target: teamEntity,
        targetProperty: 'members',
        type: RelationType.ManyToMany,
        properties: [
            { name: 'role', type: 'String' }
        ]
    };

    const teamBaseRelation: Relation = {
        source: teamRelation,
        sourceProperty: 'base',
        target: locEntity,
        targetProperty: 'belong',
        type: RelationType.OneToOne,
        properties: []
    };

    const teamMatchHostRelation: Relation = {
        source: teamRelation,
        sourceProperty: 'matches',
        target: matchEntity,
        targetProperty: 'host',
        type: RelationType.OneToMany,
        properties: []
    };

    const teamMatchParticipantRelation: Relation = {
        source: teamRelation,
        sourceProperty: 'participates',
        target: matchEntity,
        targetProperty: 'participants',
        type: RelationType.ManyToMany,
        properties: []
    };

    const powerEntity: Entity = {
        name: 'Power',
        properties: [
            { name: 'powerName', type: 'String' }
        ]
    };

    const powerOwnerRelation: Relation = {
        source: userEntity,
        sourceProperty: 'powers',
        target: powerEntity,
        targetProperty: 'owner',
        type: RelationType.OneToMany,
        isTargetReliance: true,
        properties: []
    };

    const departmentEntity: Entity = {
        name: 'Department',
        properties: [
            { name: 'name', type: 'String' }
        ]
    };

    const departmentHierarchyRelation: Relation = {
        source: departmentEntity,
        sourceProperty: 'parent',
        target: departmentEntity,
        targetProperty: 'children',
        type: RelationType.ManyToOne,
        properties: []
    };

    const entities: Entity[] = [
        userEntity,
        profileEntity,
        fileEntity,
        itemEntity,
        teamEntity,
        locEntity,
        matchEntity,
        powerEntity,
        departmentEntity
    ];
    
    const relations: Relation[] = [
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
        departmentHierarchyRelation
    ];

    return {
        entities,
        relations
    };
}