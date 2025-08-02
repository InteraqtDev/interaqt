import {describe, expect, test} from "vitest";
import {EntityToTableMap, MatchExp} from "@storage";
import {entityToTableMapData} from "./data/mapData";

const entityToTableMap = new EntityToTableMap(entityToTableMapData);

describe('MatchExp rebase test', () => {
    test("rebase simple path", () => {
        // User 为主视角的条件：profile.id = 1
        const matchExp = new MatchExp('User', entityToTableMap, 
            MatchExp.atom({
                key: 'profile.id',
                value: ['=', 1]
            })
        );

        // 重定向到 profile 为主视角
        const rebasedExp = matchExp.rebase('profile');
        
        // 期望得到：id = 1
        expect(rebasedExp.entityName).toBe('Profile');
        expect(rebasedExp.data?.isAtom()).toBe(true);
        expect(rebasedExp.data?.data).toEqual({
            key: 'id',
            value: ['=', 1]
        });
    });

    test("rebase multiple conditions", () => {
        // User 为主视角的条件：profile.title = 'Manager' AND profile.id = 10
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'profile.title',
                value: ['=', 'Manager']
            }).and({
                key: 'profile.id',
                value: ['=', 10]
            })
        );

        // 重定向到 profile 为主视角
        const rebasedExp = matchExp.rebase('profile');

        // 期望得到：title = 'Manager' AND id = 10
        expect(rebasedExp.entityName).toBe('Profile');
        expect(rebasedExp.data?.isExpression()).toBe(true);
        
        const leftAtom = rebasedExp.data?.left;
        const rightAtom = rebasedExp.data?.right;
        
        expect(leftAtom?.data).toEqual({
            key: 'title',
            value: ['=', 'Manager']
        });
        expect(rightAtom?.data).toEqual({
            key: 'id',
            value: ['=', 10]
        });
    });

    test("rebase with nested path", () => {
        // User 为主视角的条件：profile.owner.name = 'John'
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'profile.owner.name',
                value: ['=', 'John']
            })
        );

        // 重定向到 profile 为主视角
        const rebasedExp = matchExp.rebase('profile');

        // 期望得到：owner.name = 'John'
        expect(rebasedExp.entityName).toBe('Profile');
        expect(rebasedExp.data?.data).toEqual({
            key: 'owner.name',
            value: ['=', 'John']
        });
    });

    test("rebase with mixed conditions", () => {
        // User 为主视角的条件：name = 'Alice' AND profile.title = 'Manager'
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'name',
                value: ['=', 'Alice']
            }).and({
                key: 'profile.title',
                value: ['=', 'Manager']
            })
        );

        // 重定向到 profile 为主视角
        const rebasedExp = matchExp.rebase('profile');

        // 现在期望得到：owner.name = 'Alice' AND title = 'Manager'
        expect(rebasedExp.entityName).toBe('Profile');
        expect(rebasedExp.data?.isExpression()).toBe(true);
        
        const leftAtom = rebasedExp.data?.left;
        const rightAtom = rebasedExp.data?.right;
        
        // 验证转换后的条件（顺序可能不同）
        const atoms = [leftAtom?.data, rightAtom?.data];
        const ownerNameCondition = atoms.find((a: any) => a?.key === 'owner.name');
        const titleCondition = atoms.find((a: any) => a?.key === 'title');
        
        expect(ownerNameCondition).toEqual({
            key: 'owner.name',
            value: ['=', 'Alice']
        });
        expect(titleCondition).toEqual({
            key: 'title',
            value: ['=', 'Manager']
        });
    });

    test("rebase with no matching conditions", () => {
        // User 为主视角的条件：name = 'Alice'（没有 profile 相关条件）
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'name',
                value: ['=', 'Alice']
            })
        );

        // 重定向到 profile 为主视角
        const rebasedExp = matchExp.rebase('profile');

        // 由于没有以 profile 开头的条件，会进行路径增长
        // 期望得到：owner.name = 'Alice'
        expect(rebasedExp.entityName).toBe('Profile');
        expect(rebasedExp.data?.isAtom()).toBe(true);
        expect(rebasedExp.data?.data).toEqual({
            key: 'owner.name',
            value: ['=', 'Alice']
        });
    });

    test("rebase with complex boolean expression", () => {
        // User 为主视角的复杂条件
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'profile.title',
                value: ['=', 'Manager']
            }).and({
                key: 'profile.owner.name',
                value: ['like', '%John%']
            }).or(
                MatchExp.atom({
                    key: 'profile.id',
                    value: ['>', 100]
                })
            )
        );

        // 重定向到 profile 为主视角
        const rebasedExp = matchExp.rebase('profile');

        // 期望得到：(title = 'Manager' AND owner.name like '%John%') OR id > 100
        expect(rebasedExp.entityName).toBe('Profile');
        expect(rebasedExp.data).toBeDefined();
        // 验证结构
        const data = rebasedExp.data!;
        expect(data.isExpression()).toBe(true);
        expect((data.raw as any).operator).toBe('or');
    });

    test("rebase with self-reference", () => {
        // User 为主视角的条件：leader.name = 'Boss'
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'leader.name',
                value: ['=', 'Boss']
            })
        );

        // 重定向到 leader 为主视角（仍然是 User 实体）
        const rebasedExp = matchExp.rebase('leader');

        // 期望得到：name = 'Boss'
        expect(rebasedExp.entityName).toBe('User');
        expect(rebasedExp.data?.data).toEqual({
            key: 'name',
            value: ['=', 'Boss']
        });
    });

    test("rebase should throw error for invalid attribute", () => {
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'name',
                value: ['=', 'Alice']
            })
        );

        // 尝试重定向到不存在的属性
        expect(() => matchExp.rebase('invalidAttribute')).toThrow();
    });

    test("rebase should throw error for non-entity attribute", () => {
        const matchExp = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'name',
                value: ['=', 'Alice']
            })
        );

        // 尝试重定向到非实体属性
        expect(() => matchExp.rebase('name')).toThrow();
    });

    test("rebase with path expansion - simple", () => {
        // Profile 为主视角的条件：id = 1
        const profileMatch = new MatchExp('Profile', entityToTableMap,
            MatchExp.atom({
                key: 'id',
                value: ['=', 1]
            })
        );

        // 重定向到 owner (User) 为主视角
        const userMatch = profileMatch.rebase('owner');

        // 期望得到：profile.id = 1
        expect(userMatch.entityName).toBe('User');
        expect(userMatch.data?.isAtom()).toBe(true);
        expect(userMatch.data?.data).toEqual({
            key: 'profile.id',
            value: ['=', 1]
        });
    });

    test("rebase with path expansion - multiple conditions", () => {
        // Profile 为主视角的条件：title = 'Manager' AND id > 10
        const profileMatch = new MatchExp('Profile', entityToTableMap,
            MatchExp.atom({
                key: 'title',
                value: ['=', 'Manager']
            }).and({
                key: 'id',
                value: ['>', 10]
            })
        );

        // 重定向到 owner (User) 为主视角
        const userMatch = profileMatch.rebase('owner');

        // 期望得到：profile.title = 'Manager' AND profile.id > 10
        expect(userMatch.entityName).toBe('User');
        expect(userMatch.data?.isExpression()).toBe(true);
        
        const leftAtom = userMatch.data?.left;
        const rightAtom = userMatch.data?.right;
        
        expect(leftAtom?.data).toEqual({
            key: 'profile.title',
            value: ['=', 'Manager']
        });
        expect(rightAtom?.data).toEqual({
            key: 'profile.id',
            value: ['>', 10]
        });
    });

    test("rebase with path expansion - complex boolean expression", () => {
        // Profile 为主视角的复杂条件
        const profileMatch = new MatchExp('Profile', entityToTableMap,
            MatchExp.atom({
                key: 'title',
                value: ['=', 'Manager']
            }).or(
                MatchExp.atom({
                    key: 'id',
                    value: ['<', 100]
                })
            )
        );

        // 重定向到 owner (User) 为主视角
        const userMatch = profileMatch.rebase('owner');

        // 期望得到：profile.title = 'Manager' OR profile.id < 100
        expect(userMatch.entityName).toBe('User');
        expect(userMatch.data).toBeDefined();
        const data = userMatch.data!;
        expect(data.isExpression()).toBe(true);
        expect((data.raw as any).operator).toBe('or');
    });

    test("rebase should throw error when no valid relation found", () => {
        const userMatch = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'name',
                value: ['=', 'Alice']
            })
        );

        // 尝试重定向到不存在的关系
        expect(() => userMatch.rebase('nonExistentRelation')).toThrow("attribute nonExistentRelation not found in User");
    });

    test("rebase round trip - path shrink then expand", () => {
        // User 为主视角的条件：profile.title = 'Manager'
        const userMatch = new MatchExp('User', entityToTableMap,
            MatchExp.atom({
                key: 'profile.title',
                value: ['=', 'Manager']
            })
        );

        // 先缩短路径：重定向到 profile 
        const profileMatch = userMatch.rebase('profile');
        
        // 再扩展路径：重定向回 owner (User)
        const userMatchAgain = profileMatch.rebase('owner');

        // 期望回到原始条件：profile.title = 'Manager'
        expect(userMatchAgain.entityName).toBe('User');
        expect(userMatchAgain.data?.isAtom()).toBe(true);
        expect(userMatchAgain.data?.data).toEqual({
            key: 'profile.title',
            value: ['=', 'Manager']
        });
    });

    test("relation based rebase", () => {
        // File_owner_file_User 关系的 target 指向 User
        const relationMatch = new MatchExp('File_owner_file_User', entityToTableMap,
            MatchExp.atom({
                key: 'target.name',
                value: ['=', 'Alice']
            })
        );

        // 重定向到 source (File)
        const fileMatch = relationMatch.rebase('source');

        expect(fileMatch.entityName).toBe('File');
        expect(fileMatch.data?.isAtom()).toBe(true);
        expect(fileMatch.data?.data).toEqual({
            key: 'owner.name',
            value: ['=', 'Alice']
        });
    });
}); 