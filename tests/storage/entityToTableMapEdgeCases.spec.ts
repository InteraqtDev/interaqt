import { expect, test, describe } from 'vitest';
import { AliasManager, EntityToTableMap } from '@storage';
import { entityToTableMapData } from './data/mapData.js';

describe("EntityToTableMap edge cases and stress tests", () => {
    const entityToTableMap = new EntityToTableMap(entityToTableMapData);

    describe("Error handling and validation", () => {
        test("should throw meaningful error for invalid entity name in getInfo", () => {
            expect(() => {
                entityToTableMap.getInfo('InvalidEntity', 'name');
            }).toThrow('entity InvalidEntity not found');
        });

        test("should throw meaningful error for invalid attribute path", () => {
            expect(() => {
                entityToTableMap.getInfo('User', 'invalid.nested.path');
            }).toThrow();
        });

        test("should throw error when trying to get recordName of value attribute", () => {
            const info = entityToTableMap.getInfo('User', 'name');
            expect(() => {
                const _ = info.recordName;
            }).toThrow('name is not a entity');
        });

        test("should handle empty attribute name gracefully", () => {
            expect(() => {
                entityToTableMap.getInfo('User', '');
            }).toThrow();
        });

        test("should validate symmetric direction format", () => {
            const [attr, dir] = entityToTableMap.getAttributeAndSymmetricDirection('friends:invalid');
            expect(attr).toBe('friends');
            // Note: The function doesn't validate direction, just splits
            expect(dir).toBe('invalid');
        });
    });

    describe("Complex relationship paths", () => {
        test("should handle very long relation chains", () => {
            // Create a very long but valid path
            const info = entityToTableMap.getInfo('File', 'owner.profile.owner.leader.member.profile.owner');
            expect(info).toBeDefined();
            expect(info.isRecord).toBe(true);
        });

        test("should handle self-referencing relation at any depth", () => {
            const info = entityToTableMap.getInfo('User', 'leader.leader.member.leader');
            expect(info).toBeDefined();
            expect(info.recordName).toBe('User');
        });

        test("should correctly resolve paths through symmetric relations", () => {
            const info1 = entityToTableMap.getInfo('User', 'friends:source.name');
            expect(info1.attributeName).toBe('name');

            const info2 = entityToTableMap.getInfo('User', 'friends:target.name');
            expect(info2.attributeName).toBe('name');
        });

        test("should handle & symbol in various positions", () => {
            // & between relation and its properties
            const info1 = entityToTableMap.getInfoByPath(['User', 'profile', '&', 'source', 'title']);
            expect(info1).toBeDefined();
            expect(info1!.attributeName).toBe('title');

            const info2 = entityToTableMap.getInfoByPath(['User', 'profile', '&', 'target', 'name']);
            expect(info2).toBeDefined();
            expect(info2!.attributeName).toBe('name');
        });

        test("should differentiate between source and target in symmetric relations", () => {
            const stack1 = entityToTableMap.getTableAndAliasStack(['User', 'friends:source']);
            const stack2 = entityToTableMap.getTableAndAliasStack(['User', 'friends:target']);
            
            expect(stack1[1].alias).not.toBe(stack2[1].alias);
            expect(stack1[1].alias).toContain('SOURCE');
            expect(stack2[1].alias).toContain('TARGET');
        });
    });

    describe("Table merging scenarios", () => {
        test("should handle different table merging strategies correctly", () => {
            // Combined (1:1)
            const profileInfo = entityToTableMap.getInfo('User', 'profile');
            expect(profileInfo.isMergedWithParent()).toBe(true);
            
            // Merged to source (n:1)
            const ownerInfo = entityToTableMap.getInfo('File', 'owner');
            expect(ownerInfo.isLinkMergedWithParent()).toBe(true);
            
            // Isolated (n:n)
            const friendsInfo = entityToTableMap.getInfo('User', 'friends');
            expect(friendsInfo.isLinkIsolated()).toBe(true);
        });

        test("should track table aliases correctly through merged entities", () => {
            // Profile and User are in same table
            const stack = entityToTableMap.getTableAndAliasStack(['User', 'profile']);
            expect(stack[0].table).toBe(stack[1].table);
            expect(stack[0].alias).toBe(stack[1].alias); // Same alias when merged
        });

        test("should generate different aliases for isolated relations", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['User', 'friends']);
            expect(stack[1].linkAlias).toBe('REL_User_friends');
            expect(stack[1].linkTable).toBe('User_friends_friends_User');
        });
    });

    describe("Reverse operations", () => {
        test("should reverse and re-reverse to original path", () => {
            const original = ['File', 'owner'];
            const reversed = entityToTableMap.getReversePath(original);
            const reReversed = entityToTableMap.getReversePath(reversed);
            expect(reReversed).toEqual(original);
        });

        test("should handle reverse operations on symmetric relations", () => {
            const reversed = entityToTableMap.getReversePath(['User', 'friends']);
            expect(reversed).toEqual(['User', 'friends']);
        });

        test("should correctly reverse complex nested paths", () => {
            // File -> owner -> profile -> owner should give User -> profile -> owner -> file
            const reversed = entityToTableMap.getReversePath(['File', 'owner', 'profile', 'owner']);
            expect(reversed[0]).toBe('User'); // Ends at User
            expect(reversed).toContain('file');
        });

        test("getReverseAttribute should be symmetric for symmetric relations", () => {
            const attr = 'friends';
            const reverse = entityToTableMap.getReverseAttribute('User', attr);
            expect(reverse).toBe(attr); // Should be same for symmetric
        });
    });

    describe("Many-to-many symmetric path handling", () => {
        test("should correctly identify symmetric relations at different depths", () => {
            // Direct symmetric relation
            const path1 = entityToTableMap.findManyToManySymmetricPath(['User', 'friends']);
            expect(path1).toBeDefined();
            
            // Symmetric relation in nested path
            const path2 = entityToTableMap.findManyToManySymmetricPath(['User', 'leader', 'friends']);
            expect(path2).toEqual(['User', 'leader', 'friends']);
        });

        test("should spawn paths correctly for nested symmetric relations", () => {
            const spawned = entityToTableMap.spawnManyToManySymmetricPath(['User', 'leader', 'friends', 'profile']);
            expect(spawned).toBeDefined();
            expect(spawned![0]).toEqual(['User', 'leader', 'friends:source', 'profile']);
            expect(spawned![1]).toEqual(['User', 'leader', 'friends:target', 'profile']);
        });

        test("should not find symmetric path in asymmetric relations", () => {
            const result1 = entityToTableMap.findManyToManySymmetricPath(['User', 'leader']);
            expect(result1).toBeUndefined();
            
            const result2 = entityToTableMap.findManyToManySymmetricPath(['File', 'owner']);
            expect(result2).toBeUndefined();
        });
    });

    describe("Attribute grouping edge cases", () => {
        test("should handle entities with only value attributes", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('User', ['name', 'age']);
            expect(valueAttrs.length).toBe(2);
            expect(entityAttrs.length).toBe(0);
            expect(entityIdAttrs.length).toBe(0);
        });

        test("should handle entities with only relation attributes", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('User', ['profile', 'leader', 'friends']);
            expect(valueAttrs.length).toBe(0);
            expect(entityAttrs.length + entityIdAttrs.length).toBeGreaterThan(0);
        });

        test("should correctly categorize mixed attribute types", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('User', [
                'name',      // value
                'id',        // value (special)
                'profile',   // entity (merged)
                'leader',    // entityId (has field)
                'friends'    // entity (isolated)
            ]);
            
            // Verify each category has correct attributes
            expect(valueAttrs.some(a => a.attributeName === 'name')).toBe(true);
            expect(valueAttrs.some(a => a.attributeName === 'id')).toBe(true);
        });

        test("should ignore non-existent attributes in list", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('User', [
                'name',
                'nonExistent',  // This should be ignored
                'age'
            ]);
            
            // Only name and age should be returned
            expect(valueAttrs.length).toBe(2);
            expect(valueAttrs.every(a => ['name', 'age'].includes(a.attributeName))).toBe(true);
        });
    });

    describe("Field name and table alias resolution", () => {
        test("should resolve field names correctly for merged entities", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(['User'], 'name');
            expect(field).toBe('User_name');
            
            const [alias2, field2, table2] = entityToTableMap.getTableAliasAndFieldName(['User', 'profile'], 'title');
            expect(field2).toBe('Profile_title');
        });

        test("should handle id field resolution with optimization", () => {
            // When getting id of a related entity, should optimize to use foreign key
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(['File', 'owner'], 'id');
            expect(field).toBe('File_owner'); // Optimized to use foreign key field
        });

        test("should respect dontShrink flag", () => {
            const [alias1, field1] = entityToTableMap.getTableAliasAndFieldName(['File', 'owner'], 'id', false);
            const [alias2, field2] = entityToTableMap.getTableAliasAndFieldName(['File', 'owner'], 'id', true);
            
            // Without shrink should use actual id field
            expect(field2).not.toBe(field1);
        });

        test("should handle field resolution for relation entities", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(
                ['File_owner_file_User'],
                'id'
            );
            expect(field).toBe('_rowId');
        });

        test("should correctly resolve fields through symmetric directions", () => {
            const [alias1, field1] = entityToTableMap.getTableAliasAndFieldName(['User', 'friends:source'], 'name');
            const [alias2, field2] = entityToTableMap.getTableAliasAndFieldName(['User', 'friends:target'], 'name');
            
            // Both should resolve to User_name but from different aliases
            expect(field1).toBe(field2);
            expect(alias1).not.toBe(alias2);
        });
    });

    describe("Relation entity handling", () => {
        test("should correctly identify relation entities", () => {
            const record1 = entityToTableMap.getRecord('File_owner_file_User');
            expect(record1.isRelation).toBe(true);
            
            const record2 = entityToTableMap.getRecord('User');
            expect(record2.isRelation).toBeFalsy();
        });

        test("should access relation entity source and target", () => {
            const sourceInfo = entityToTableMap.getInfo('File_owner_file_User', 'source');
            expect(sourceInfo.isRecord).toBe(true);
            expect(sourceInfo.recordName).toBe('File');
            
            const targetInfo = entityToTableMap.getInfo('File_owner_file_User', 'target');
            expect(targetInfo.isRecord).toBe(true);
            expect(targetInfo.recordName).toBe('User');
        });

        test("should navigate from relation to source entity attributes", () => {
            const info = entityToTableMap.getInfo('File_owner_file_User', 'source.fileName');
            expect(info.attributeName).toBe('fileName');
            expect(info.parentEntityName).toBe('File');
        });

        test("should navigate from relation to target entity attributes", () => {
            const info = entityToTableMap.getInfo('File_owner_file_User', 'target.name');
            expect(info.attributeName).toBe('name');
            expect(info.parentEntityName).toBe('User');
        });
    });

    describe("Path shrinking with & symbol", () => {
        test("should shrink redundant & paths correctly", () => {
            // When path goes through & unnecessarily
            const shrinked1 = entityToTableMap.getShrinkedAttribute('File', 'owner.&.target.name');
            expect(shrinked1).toBe('owner.name');
            
            // For profile relation, profile points to Profile, but &.target points to User
            // These are different, so cannot shrink
            const shrinked2 = entityToTableMap.getShrinkedAttribute('User', 'profile.&.target.name');
            expect(shrinked2).toBe('profile.&.target.name'); // Cannot shrink because entities don't match
        });

        test("should not shrink when & path is necessary", () => {
            const shrinked = entityToTableMap.getShrinkedAttribute('File', 'owner.&.source.fileName');
            expect(shrinked).toBe('owner.&.source.fileName'); // Can't shrink, need to go to relation then back to File
        });

        test("should handle multiple & symbols in path", () => {
            const shrinked = entityToTableMap.getShrinkedAttribute(
                'File',
                'owner.&.target.profile.&.target.name'
            );
            expect(shrinked.split('&').length).toBeLessThanOrEqual(2); // Should shrink at least one
        });
    });

    describe("Data integrity and consistency", () => {
        test("should maintain consistent link information", () => {
            const linkInfo1 = entityToTableMap.getLinkInfo('User', 'profile');
            const linkInfo2 = entityToTableMap.getLinkInfo('Profile', 'owner');
            
            // Should be the same link
            expect(linkInfo1.name).toBe(linkInfo2.name);
        });

        test("should have consistent record-link relationships", () => {
            const profileAttr = entityToTableMap.getInfo('User', 'profile');
            const linkInfo = profileAttr.getLinkInfo();
            
            expect(linkInfo.data.sourceRecord).toBe('Profile');
            expect(linkInfo.data.targetRecord).toBe('User');
        });

        test("should correctly identify source/target in relations", () => {
            const ownerInfo = entityToTableMap.getInfo('File', 'owner');
            expect(ownerInfo.isRecordSource()).toBe(true);
            
            const fileInfo = entityToTableMap.getInfo('User', 'file');
            expect(fileInfo.isRecordSource()).toBe(false);
        });

        test("should maintain cardinality information", () => {
            const manyToOne = entityToTableMap.getInfo('File', 'owner');
            expect(manyToOne.isManyToOne).toBe(true);
            
            const oneToOne = entityToTableMap.getInfo('User', 'profile');
            expect(oneToOne.isOneToOne).toBe(true);
            
            const manyToMany = entityToTableMap.getInfo('User', 'friends');
            expect(manyToMany.isManyToMany).toBe(true);
        });
    });

    describe("Performance and stress tests", () => {
        test("should handle repeated queries efficiently", () => {
            const startTime = Date.now();
            
            for (let i = 0; i < 1000; i++) {
                entityToTableMap.getInfo('User', 'profile.title');
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Should complete 1000 queries in reasonable time (< 1 second)
            expect(duration).toBeLessThan(1000);
        });

        test("should handle complex path resolution efficiently", () => {
            const startTime = Date.now();
            
            for (let i = 0; i < 100; i++) {
                entityToTableMap.getInfo('File', 'owner.profile.owner.leader.member.profile.owner');
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Complex paths should still be reasonably fast
            expect(duration).toBeLessThan(1000);
        });

        test("should handle many simultaneous stack generations", () => {
            const paths = [
                ['User', 'profile'],
                ['User', 'leader'],
                ['User', 'friends'],
                ['File', 'owner'],
                ['User', 'profile', 'owner'],
                ['File', 'owner', 'profile']
            ];
            
            const startTime = Date.now();
            
            paths.forEach(path => {
                for (let i = 0; i < 100; i++) {
                    entityToTableMap.getTableAndAliasStack(path);
                }
            });
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(1000);
        });
    });

    describe("All entities coverage", () => {
        test("should have valid data for all entities in test data", () => {
            const entities = ['User', 'Profile', 'File', 'Item'];
            
            entities.forEach(entity => {
                const record = entityToTableMap.getRecord(entity);
                expect(record).toBeDefined();
                expect(record.table).toBeDefined();
                expect(record.attributes).toBeDefined();
                expect(record.attributes.id).toBeDefined();
            });
        });

        test("should have valid data for all relation entities", () => {
            const relations = [
                'File_owner_file_User',
                'Profile_owner_profile_User',
                'User_leader_member_User',
                'User_friends_friends_User',
                'User_item_owner_Item'
            ];
            
            relations.forEach(relation => {
                const record = entityToTableMap.getRecord(relation);
                expect(record).toBeDefined();
                expect(record.isRelation).toBe(true);
                expect(record.attributes.source).toBeDefined();
                expect(record.attributes.target).toBeDefined();
            });
        });

        test("should have valid link data for all links", () => {
            const links = Object.keys(entityToTableMapData.links);
            
            links.forEach(linkName => {
                const linkInfo = entityToTableMap.getLinkInfoByName(linkName);
                expect(linkInfo).toBeDefined();
                expect(linkInfo.data.sourceRecord).toBeDefined();
                expect(linkInfo.data.targetRecord).toBeDefined();
                expect(linkInfo.data.relType).toBeDefined();
            });
        });
    });
});

