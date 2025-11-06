import { expect, test, describe } from 'vitest';
import { EntityToTableMap } from '../../src/storage/erstorage/EntityToTableMap.js';
import { entityToTableMapData } from './data/mapData.js';

describe("EntityToTableMap comprehensive tests", () => {
    const entityToTableMap = new EntityToTableMap(entityToTableMapData);

    describe("Basic getters", () => {
        test("getRecord should return correct record data", () => {
            const userRecord = entityToTableMap.getRecord('User');
            expect(userRecord).toBeDefined();
            expect(userRecord.table).toBe('Profile_User_Item');
            expect(userRecord.attributes).toBeDefined();
            expect(userRecord.attributes.name).toBeDefined();
        });

        test("getRecord should return undefined for non-existent record", () => {
            const nonExistent = entityToTableMap.getRecord('NonExistent');
            expect(nonExistent).toBeUndefined();
        });

        test("getAttributeAndSymmetricDirection should parse symmetric direction", () => {
            const [attr1, dir1] = entityToTableMap.getAttributeAndSymmetricDirection('friends:source');
            expect(attr1).toBe('friends');
            expect(dir1).toBe('source');

            const [attr2, dir2] = entityToTableMap.getAttributeAndSymmetricDirection('friends:target');
            expect(attr2).toBe('friends');
            expect(dir2).toBe('target');
        });

        test("getAttributeAndSymmetricDirection should return undefined direction for normal attributes", () => {
            const [attr, dir] = entityToTableMap.getAttributeAndSymmetricDirection('name');
            expect(attr).toBe('name');
            expect(dir).toBeUndefined();
        });

        test("getAttributeData should return correct attribute data", () => {
            const nameAttr = entityToTableMap.getAttributeData('User', 'name');
            expect(nameAttr).toBeDefined();
            expect(nameAttr.field).toBe('User_name');
            expect(nameAttr.type).toBe('string');
        });

        test("getRecordInfo should return RecordInfo instance", () => {
            const recordInfo = entityToTableMap.getRecordInfo('User');
            expect(recordInfo).toBeDefined();
            expect(recordInfo.name).toBe('User');
            expect(recordInfo.table).toBe('Profile_User_Item');
        });

        test("getLinkInfoByName should return correct link info", () => {
            const linkInfo = entityToTableMap.getLinkInfoByName('File_owner_file_User');
            expect(linkInfo).toBeDefined();
            expect(linkInfo.data.sourceRecord).toBe('File');
            expect(linkInfo.data.targetRecord).toBe('User');
        });

        test("getLinkInfoByName should throw for non-existent link", () => {
            expect(() => {
                entityToTableMap.getLinkInfoByName('NonExistent_Link');
            }).toThrow();
        });

        test("getLinkInfo should return correct link info for entity attribute", () => {
            const linkInfo = entityToTableMap.getLinkInfo('User', 'profile');
            expect(linkInfo).toBeDefined();
            expect(linkInfo.data.sourceRecord).toBe('Profile');
            expect(linkInfo.data.targetRecord).toBe('User');
        });

        test("getLinkInfo should handle symmetric direction", () => {
            const linkInfo = entityToTableMap.getLinkInfo('User', 'friends:source');
            expect(linkInfo).toBeDefined();
        });
    });

    describe("getInfo and getInfoByPath", () => {
        test("getInfo should return AttributeInfo for simple attribute", () => {
            const info = entityToTableMap.getInfo('User', 'name');
            expect(info).toBeDefined();
            expect(info.attributeName).toBe('name');
            expect(info.isValue).toBe(true);
        });

        test("getInfo should return AttributeInfo for relation attribute", () => {
            const info = entityToTableMap.getInfo('User', 'profile');
            expect(info).toBeDefined();
            expect(info.attributeName).toBe('profile');
            expect(info.isRecord).toBe(true);
        });

        test("getInfo should handle nested paths", () => {
            const info = entityToTableMap.getInfo('User', 'profile.title');
            expect(info).toBeDefined();
            expect(info.attributeName).toBe('title');
            expect(info.parentEntityName).toBe('Profile');
            expect(info.isValue).toBe(true);
        });

        test("getInfo should throw for non-existent attribute", () => {
            expect(() => {
                entityToTableMap.getInfo('User', 'nonExistent');
            }).toThrow();
        });

        test("getInfoByPath should work for simple paths", () => {
            const info = entityToTableMap.getInfoByPath(['User', 'name']);
            expect(info).toBeDefined();
            expect(info!.attributeName).toBe('name');
        });

        test("getInfoByPath should work for nested paths", () => {
            const info = entityToTableMap.getInfoByPath(['User', 'profile', 'title']);
            expect(info).toBeDefined();
            expect(info!.attributeName).toBe('title');
            expect(info!.parentEntityName).toBe('Profile');
            expect(info!.isValue).toBe(true);
        });

        test("getInfoByPath should handle relation entity paths with &", () => {
            const info = entityToTableMap.getInfoByPath(['User', 'profile', '&', 'target', 'name']);
            expect(info).toBeDefined();
            expect(info!.attributeName).toBe('name');
        });

        test("getInfoByPath should throw for incomplete paths", () => {
            expect(() => {
                entityToTableMap.getInfoByPath(['User']);
            }).toThrow();
        });
    });

    describe("getReverseAttribute", () => {
        test("should get reverse attribute for regular relation", () => {
            const reverse = entityToTableMap.getReverseAttribute('User', 'profile');
            expect(reverse).toBe('owner');
        });

        test("should get reverse attribute for self-referencing relation", () => {
            const reverse1 = entityToTableMap.getReverseAttribute('User', 'leader');
            expect(reverse1).toBe('member');

            const reverse2 = entityToTableMap.getReverseAttribute('User', 'member');
            expect(reverse2).toBe('leader');
        });

        test("should get reverse attribute for symmetric relation", () => {
            const reverse = entityToTableMap.getReverseAttribute('User', 'friends');
            expect(reverse).toBe('friends');
        });

        test("should get reverse attribute for relation entity source", () => {
            const reverse = entityToTableMap.getReverseAttribute('File_owner_file_User', 'source');
            expect(reverse).toBe('owner.&');
        });

        test("should get reverse attribute for relation entity target", () => {
            const reverse = entityToTableMap.getReverseAttribute('File_owner_file_User', 'target');
            expect(reverse).toBe('file.&');
        });

        test("should throw for non-existent entity", () => {
            expect(() => {
                entityToTableMap.getReverseAttribute('NonExistent', 'attr');
            }).toThrow();
        });

        test("should throw for wrong attribute on relation", () => {
            expect(() => {
                entityToTableMap.getReverseAttribute('File_owner_file_User', 'wrongAttr');
            }).toThrow();
        });
    });

    describe("getReversePath", () => {
        test("should reverse simple two-entity path", () => {
            const reversed = entityToTableMap.getReversePath(['User', 'profile']);
            expect(reversed).toEqual(['Profile', 'owner']);
        });

        test("should reverse three-entity path", () => {
            // User -> profile -> owner means: User has profile (Profile), Profile has owner (User)
            // Reversed: User <- owner <- profile means: User.profile.owner path reversed
            const reversed = entityToTableMap.getReversePath(['User', 'profile', 'owner']);
            expect(reversed).toEqual(['User', 'profile', 'owner']);
        });

        test("should reverse self-referencing path", () => {
            const reversed = entityToTableMap.getReversePath(['User', 'leader']);
            expect(reversed).toEqual(['User', 'member']);
        });

        test("should reverse nested path", () => {
            const reversed = entityToTableMap.getReversePath(['File', 'owner', 'profile']);
            expect(reversed).toEqual(['Profile', 'owner', 'file']);
        });

        test("should throw for path ending with &", () => {
            expect(() => {
                entityToTableMap.getReversePath(['User', 'profile', '&']);
            }).toThrow('last attribute in path is not a record');
        });

        test("should throw for non-record ending path", () => {
            expect(() => {
                entityToTableMap.getReversePath(['User', 'name']);
            }).toThrow();
        });
    });

    describe("findManyToManySymmetricPath and spawnManyToManySymmetricPath", () => {
        test("findManyToManySymmetricPath should find symmetric relation in path", () => {
            const result = entityToTableMap.findManyToManySymmetricPath(['User', 'friends']);
            expect(result).toEqual(['User', 'friends']);
        });

        test("findManyToManySymmetricPath should find symmetric relation in nested path", () => {
            const result = entityToTableMap.findManyToManySymmetricPath(['User', 'friends', 'profile']);
            expect(result).toEqual(['User', 'friends']);
        });

        test("findManyToManySymmetricPath should return undefined for non-symmetric path", () => {
            const result = entityToTableMap.findManyToManySymmetricPath(['User', 'profile']);
            expect(result).toBeUndefined();
        });

        test("findManyToManySymmetricPath should return undefined for value attribute", () => {
            const result = entityToTableMap.findManyToManySymmetricPath(['User', 'name']);
            expect(result).toBeUndefined();
        });

        test("spawnManyToManySymmetricPath should split symmetric path", () => {
            const result = entityToTableMap.spawnManyToManySymmetricPath(['User', 'friends']);
            expect(result).toBeDefined();
            expect(result![0]).toEqual(['User', 'friends:source']);
            expect(result![1]).toEqual(['User', 'friends:target']);
        });

        test("spawnManyToManySymmetricPath should split symmetric path with continuation", () => {
            const result = entityToTableMap.spawnManyToManySymmetricPath(['User', 'friends', 'profile']);
            expect(result).toBeDefined();
            expect(result![0]).toEqual(['User', 'friends:source', 'profile']);
            expect(result![1]).toEqual(['User', 'friends:target', 'profile']);
        });

        test("spawnManyToManySymmetricPath should return undefined for non-symmetric path", () => {
            const result = entityToTableMap.spawnManyToManySymmetricPath(['User', 'profile']);
            expect(result).toBeUndefined();
        });
    });

    describe("groupAttributes", () => {
        test("should group attributes into value, entity, and entityId categories", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('User', [
                'name',
                'age',
                'id',
                'profile',
                'leader'
            ]);

            // id is also a value attribute
            expect(valueAttrs.length).toBe(3); // name, age, id
            expect(valueAttrs.some(a => a.attributeName === 'name')).toBe(true);
            expect(valueAttrs.some(a => a.attributeName === 'age')).toBe(true);
            expect(valueAttrs.some(a => a.attributeName === 'id')).toBe(true);

            expect(entityAttrs.length).toBe(1); // profile (merged, no field on User)
            expect(entityAttrs[0].attributeName).toBe('profile');

            expect(entityIdAttrs.length).toBe(1); // leader (has field)
            expect(entityIdAttrs[0].attributeName).toBe('leader');
        });

        test("should handle File entity with merged relation", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('File', [
                'fileName',
                'id',
                'owner'
            ]);

            expect(valueAttrs.length).toBe(2); // fileName, id
            expect(entityAttrs.length).toBe(0);
            expect(entityIdAttrs.length).toBe(1); // owner
        });

        test("should handle relation entity attributes", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes(
                'File_owner_file_User',
                ['id', 'source', 'target']
            );

            expect(valueAttrs.length).toBe(1); // id is a value attribute
            expect(entityIdAttrs.length).toBe(2); // source, target have fields
        });

        test("should handle empty attribute list", () => {
            const [valueAttrs, entityAttrs, entityIdAttrs] = entityToTableMap.groupAttributes('User', []);
            expect(valueAttrs.length).toBe(0);
            expect(entityAttrs.length).toBe(0);
            expect(entityIdAttrs.length).toBe(0);
        });

        test("should throw for non-existent entity", () => {
            expect(() => {
                entityToTableMap.groupAttributes('NonExistent', ['attr']);
            }).toThrow();
        });
    });

    describe("getTableAndAliasStack", () => {
        test("should return stack with single entity", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['User']);
            expect(stack.length).toBe(1);
            expect(stack[0].table).toBe('Profile_User_Item');
            expect(stack[0].alias).toBe('User');
            expect(stack[0].record).toBeDefined();
            expect(stack[0].isLinkRecord).toBe(false);
        });

        test("should return stack with two entities", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['User', 'profile']);
            expect(stack.length).toBe(2);
            
            expect(stack[0].alias).toBe('User');
            expect(stack[0].table).toBe('Profile_User_Item');
            
            // When merged (1:1 combined), alias stays the same as parent
            expect(stack[1].alias).toBe('User');
            expect(stack[1].table).toBe('Profile_User_Item');
            expect(stack[1].isLinkRecord).toBe(false);
        });

        test("should handle isolated relation table", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['User', 'friends']);
            expect(stack.length).toBe(2);
            
            expect(stack[1].alias).toBe('User_friends');
            expect(stack[1].linkTable).toBe('User_friends_friends_User');
            expect(stack[1].linkAlias).toBe('REL_User_friends');
        });

        test("should handle merged relation", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['File', 'owner']);
            expect(stack.length).toBe(2);
            
            expect(stack[1].alias).toBe('File_owner');
            expect(stack[1].table).toBe('Profile_User_Item');
        });

        test("should handle reading link record with &", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['User', 'profile', '&']);
            expect(stack.length).toBe(2);
            
            expect(stack[1].isLinkRecord).toBe(true);
            expect(stack[1].table).toBe('Profile_User_Item');
        });

        test("should handle symmetric direction in path", () => {
            const stack1 = entityToTableMap.getTableAndAliasStack(['User', 'friends:source']);
            expect(stack1.length).toBe(2);
            expect(stack1[1].alias).toBe('User_friends_SOURCE');

            const stack2 = entityToTableMap.getTableAndAliasStack(['User', 'friends:target']);
            expect(stack2.length).toBe(2);
            expect(stack2[1].alias).toBe('User_friends_TARGET');
        });

        test("should handle nested paths", () => {
            const stack = entityToTableMap.getTableAndAliasStack(['User', 'profile', 'owner']);
            expect(stack.length).toBe(3);
            
            expect(stack[0].alias).toBe('User');
            // profile is merged (1:1 combined), so alias stays 'User'
            expect(stack[1].alias).toBe('User');
            // owner from Profile is also merged, alias stays 'User'
            expect(stack[2].alias).toBe('User');
        });
    });

    describe("getTableAliasAndFieldName", () => {
        test("should get table alias and field for simple attribute", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(['User'], 'name');
            expect(alias).toBe('User');
            expect(field).toBe('User_name');
            expect(table).toBe('Profile_User_Item');
        });

        test("should get table alias and field for nested attribute", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(['User', 'profile'], 'title');
            // When merged, alias stays as parent
            expect(alias).toBe('User');
            expect(field).toBe('Profile_title');
            expect(table).toBe('Profile_User_Item');
        });

        test("should get id from relation table when optimized (merged)", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(['File', 'owner'], 'id');
            // Should shrink and use the relation field
            expect(alias).toBe('File');
            expect(field).toBe('File_owner');
            expect(table).toBe('File');
        });

        test("should get id from isolated relation table", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(['User', 'friends'], 'id');
            // Should use relation table
            expect(alias).toBe('REL_User_friends');
            expect(field).toBeDefined();
            expect(table).toBe('User_friends_friends_User');
        });

        test("should handle dontShrink flag", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(
                ['File', 'owner'],
                'id',
                true  // dontShrink
            );
            expect(alias).toBe('File_owner');
            expect(field).toBe('User_id');
            expect(table).toBe('Profile_User_Item');
        });

        test("should handle symmetric direction", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(
                ['User', 'friends:source'],
                'name'
            );
            expect(alias).toBe('User_friends_SOURCE');
            expect(field).toBe('User_name');
        });

        test("should get field from link record", () => {
            const [alias, field, table] = entityToTableMap.getTableAliasAndFieldName(
                ['User', 'profile', '&'],
                'id'
            );
            expect(field).toBe('_rowId');
            expect(table).toBe('Profile_User_Item');
        });
    });

    describe("Edge cases and error handling", () => {
        test("getInfo should handle very deep nested paths", () => {
            const info = entityToTableMap.getInfo('File', 'owner.profile.owner.leader.name');
            expect(info).toBeDefined();
            expect(info.attributeName).toBe('name');
        });

        test("should handle self-referencing relations correctly", () => {
            const leaderInfo = entityToTableMap.getInfo('User', 'leader');
            expect(leaderInfo.recordName).toBe('User');

            const memberInfo = entityToTableMap.getInfo('User', 'member');
            expect(memberInfo.recordName).toBe('User');

            const leaderReverse = entityToTableMap.getReverseAttribute('User', 'leader');
            expect(leaderReverse).toBe('member');
        });

        test("should handle circular paths without infinite loops", () => {
            // User -> leader -> member -> leader should work
            const info = entityToTableMap.getInfo('User', 'leader.member.leader');
            expect(info).toBeDefined();
            expect(info.recordName).toBe('User');
        });

        test("getReversePath should handle complex nested paths", () => {
            const reversed = entityToTableMap.getReversePath(['File', 'owner', 'profile', 'owner']);
            expect(reversed).toEqual(['User', 'profile', 'owner', 'file']);
        });
    });

    describe("Performance and boundary tests", () => {
        test("should handle multiple calls efficiently", () => {
            // Test that repeated calls work correctly
            for (let i = 0; i < 100; i++) {
                const info = entityToTableMap.getInfo('User', 'profile.title');
                expect(info.attributeName).toBe('title');
            }
        });

        test("should handle all entity types in test data", () => {
            const entities = ['User', 'Profile', 'File', 'Item'];
            entities.forEach(entity => {
                const record = entityToTableMap.getRecord(entity);
                expect(record).toBeDefined();
                expect(record.table).toBeDefined();
            });
        });

        test("should handle all relation entities in test data", () => {
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
            });
        });
    });
});

