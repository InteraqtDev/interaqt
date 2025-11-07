import { describe, expect, test} from "vitest";
import { AliasManager, EntityToTableMap, MatchExp} from "@storage";
import {entityToTableMapData} from "./data/mapData";


const entityToTableMap = new EntityToTableMap(entityToTableMapData, new AliasManager())

describe('MatchExp JSON serialization test', () => {
    test("serialize and deserialize simple match expression", () => {
        // Create a simple match expression
        const matchExp = new MatchExp('User', entityToTableMap, MatchExp.atom({
            key: 'name',
            value: ['=', 'John']
        }));

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Verify JSON structure
        expect(json).toHaveProperty('entityName', 'User');
        expect(json).toHaveProperty('data');
        expect(json.data).toHaveProperty('type', 'atom');
        expect(json.data.data).toEqual({
            key: 'name',
            value: ['=', 'John']
        });

        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.entityName).toBe('User');
        expect(restored.data).toBeDefined();
        expect(restored.data!.isAtom()).toBe(true);
        expect(restored.data!.data).toEqual({
            key: 'name',
            value: ['=', 'John']
        });
    });

    test("serialize and deserialize complex match expression with AND", () => {
        // Create a complex match expression
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['=', 'John']
            }).and({
                key: 'age',
                value: ['>', 25]
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Verify JSON structure
        expect(json).toHaveProperty('entityName', 'User');
        expect(json).toHaveProperty('data');
        expect(json.data).toHaveProperty('type', 'expression');
        expect(json.data).toHaveProperty('operator', 'and');
        expect(json.data).toHaveProperty('left');
        expect(json.data).toHaveProperty('right');

        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.entityName).toBe('User');
        expect(restored.data).toBeDefined();
        expect(restored.data!.isExpression()).toBe(true);
        expect(restored.data!.isAnd()).toBe(true);
    });

    test("serialize and deserialize match expression with OR", () => {
        // Create match expression with OR
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['=', 'John']
            }).or({
                key: 'age',
                value: ['>', 30]
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Verify JSON structure
        expect(json.data).toHaveProperty('operator', 'or');

        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.data!.isOr()).toBe(true);
    });

    test("serialize and deserialize match expression with nested conditions", () => {
        // Create nested match expression
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['=', 'John']
            }).and(
                MatchExp.atom({
                    key: 'age',
                    value: ['>', 25]
                }).or({
                    key: 'name',
                    value: ['=', 'Jane']
                })
            )
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the structure is preserved
        expect(restored.data!.isExpression()).toBe(true);
        expect(restored.data!.isAnd()).toBe(true);
        expect(restored.data!.right!.isOr()).toBe(true);
    });

    test("serialize and deserialize match expression with relation paths", () => {
        // Create match expression with relation paths
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'leader.name',
                value: ['=', 'Alice']
            }).and({
                key: 'leader.profile.title',
                value: ['=', 'Manager']
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.data!.left.data).toEqual({
            key: 'leader.name',
            value: ['=', 'Alice']
        });
        expect(restored.data!.right!.data).toEqual({
            key: 'leader.profile.title',
            value: ['=', 'Manager']
        });
    });

    test("serialize and deserialize match expression with reference value", () => {
        // Create match expression with reference value
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['=', 'leader.name'],
                isReferenceValue: true
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Verify reference value is preserved
        expect(json.data.data.isReferenceValue).toBe(true);

        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.data!.data.isReferenceValue).toBe(true);
        expect(restored.data!.data.value).toEqual(['=', 'leader.name']);
    });

    test("serialize and deserialize match expression with context root entity", () => {
        // Create match expression with context root entity
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['=', 'John']
            }),
            'Organization', // contextRootEntity
            true // fromRelation
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Verify context is preserved
        expect(json.contextRootEntity).toBe('Organization');
        expect(json.fromRelation).toBe(true);

        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.contextRootEntity).toBe('Organization');
        expect(restored.fromRelation).toBe(true);
    });

    test("serialize and deserialize empty match expression", () => {
        // Create empty match expression
        const matchExp = new MatchExp('User', entityToTableMap);

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Verify JSON structure
        expect(json.entityName).toBe('User');
        expect(json.data).toBeUndefined();
        expect(json.contextRootEntity).toBeUndefined();
        expect(json.fromRelation).toBeUndefined();

        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.entityName).toBe('User');
        expect(restored.data).toBeUndefined();
        expect(restored.contextRootEntity).toBeUndefined();
        expect(restored.fromRelation).toBeUndefined();
    });

    test("serialize and deserialize match expression with IN operator", () => {
        // Create match expression with IN operator
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['in', ['John', 'Jane', 'Bob']]
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.data!.data.value).toEqual(['in', ['John', 'Jane', 'Bob']]);
    });

    test("serialize and deserialize match expression with BETWEEN operator", () => {
        // Create match expression with BETWEEN operator
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'age',
                value: ['between', [18, 65]]
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.data!.data.value).toEqual(['between', [18, 65]]);
    });

    test("serialize and deserialize match expression with NOT NULL", () => {
        // Create match expression with NOT NULL
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['not', null]
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        
        // Deserialize from JSON
        const restored = MatchExp.fromJSON(json, entityToTableMap);
        
        // Verify the restored object
        expect(restored.data!.data.value).toEqual(['not', null]);
    });

    test("JSON.stringify and JSON.parse round trip", () => {
        // Create a complex match expression
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['like', '%John%']
            }).and({
                key: 'age',
                value: ['>=', 18]
            }).and({
                key: 'age',
                value: ['<=', 65]
            })
        );

        // Full JSON round trip
        const jsonString = JSON.stringify(matchExp.toJSON());
        const parsed = JSON.parse(jsonString);
        const restored = MatchExp.fromJSON(parsed, entityToTableMap);
        
        // Verify the restored object maintains the same structure
        expect(restored.entityName).toBe(matchExp.entityName);
        expect(restored.contextRootEntity).toBe(matchExp.contextRootEntity);
        expect(restored.fromRelation).toBe(matchExp.fromRelation);
        
        // Verify data structure is preserved
        const originalJson = matchExp.toJSON();
        const restoredJson = restored.toJSON();
        expect(restoredJson).toEqual(originalJson);
    });

    test("handle special characters in values", () => {
        // Create match expression with special characters
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'name',
                value: ['=', 'John "The Boss" O\'Brien']
            }).and({
                key: 'name',
                value: ['like', '%\n\t\r%']
            })
        );

        // Serialize to JSON
        const json = matchExp.toJSON();
        const jsonString = JSON.stringify(json);
        
        // Deserialize from JSON
        const parsed = JSON.parse(jsonString);
        const restored = MatchExp.fromJSON(parsed, entityToTableMap);
        
        // Verify special characters are preserved
        expect(restored.data!.left.data.value[1]).toBe('John "The Boss" O\'Brien');
        expect(restored.data!.right!.data.value[1]).toBe('%\n\t\r%');
    });
});
