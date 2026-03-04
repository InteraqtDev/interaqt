import { describe, test, expect } from 'vitest';
import { LinkInfo } from '../../src/storage/erstorage/LinkInfo.js';
import { EntityToTableMap } from '../../src/storage/erstorage/EntityToTableMap.js';
import type { MapData, LinkMapItem } from '../../src/storage/erstorage/EntityToTableMap.js';

function createMapData(links: Record<string, LinkMapItem>, records: MapData['records'] = {}): MapData {
    return { records, links };
}

function createLinkInfo(linkName: string, linkData: Partial<LinkMapItem>, mapOverrides: Partial<MapData> = {}): LinkInfo {
    const defaultLink: LinkMapItem = {
        relType: ['1', '1'],
        sourceRecord: 'User',
        sourceProperty: 'profile',
        targetRecord: 'Profile',
        targetProperty: 'owner',
        ...linkData,
    };
    const mapData = createMapData(
        { [linkName]: defaultLink, ...mapOverrides.links },
        mapOverrides.records || {}
    );
    const map = new EntityToTableMap(mapData);
    return new LinkInfo(linkName, defaultLink, map);
}

describe('LinkInfo cardinality getters', () => {
    test('isOneToOne', () => {
        const link = createLinkInfo('rel1', { relType: ['1', '1'] });
        expect(link.isOneToOne).toBe(true);
        expect(link.isOneToMany).toBe(false);
        expect(link.isManyToOne).toBe(false);
        expect(link.isManyToMany).toBe(false);
    });

    test('isOneToMany', () => {
        const link = createLinkInfo('rel2', { relType: ['1', 'n'] });
        expect(link.isOneToMany).toBe(true);
        expect(link.isOneToOne).toBe(false);
        expect(link.isManyToOne).toBe(false);
        expect(link.isManyToMany).toBe(false);
    });

    test('isManyToOne', () => {
        const link = createLinkInfo('rel3', { relType: ['n', '1'] });
        expect(link.isManyToOne).toBe(true);
        expect(link.isOneToOne).toBe(false);
        expect(link.isOneToMany).toBe(false);
        expect(link.isManyToMany).toBe(false);
    });

    test('isManyToMany', () => {
        const link = createLinkInfo('rel4', { relType: ['n', 'n'] });
        expect(link.isManyToMany).toBe(true);
        expect(link.isOneToOne).toBe(false);
        expect(link.isOneToMany).toBe(false);
        expect(link.isManyToOne).toBe(false);
    });
});

describe('LinkInfo derived cardinality getters', () => {
    test('isXToOne for OneToOne', () => {
        const link = createLinkInfo('rel', { relType: ['1', '1'] });
        expect(link.isXToOne).toBe(true);
        expect(link.isOneToX).toBe(true);
        expect(link.isXToMany).toBe(false);
    });

    test('isXToOne for ManyToOne', () => {
        const link = createLinkInfo('rel', { relType: ['n', '1'] });
        expect(link.isXToOne).toBe(true);
        expect(link.isOneToX).toBe(false);
        expect(link.isXToMany).toBe(false);
    });

    test('isXToMany for OneToMany', () => {
        const link = createLinkInfo('rel', { relType: ['1', 'n'] });
        expect(link.isXToMany).toBe(true);
        expect(link.isXToOne).toBe(false);
        expect(link.isOneToX).toBe(true);
    });

    test('isXToMany for ManyToMany', () => {
        const link = createLinkInfo('rel', { relType: ['n', 'n'] });
        expect(link.isXToMany).toBe(true);
        expect(link.isXToOne).toBe(false);
        expect(link.isOneToX).toBe(false);
    });
});

describe('LinkInfo record properties', () => {
    test('sourceRecord and targetRecord', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'Author',
            targetRecord: 'Book',
        });
        expect(link.sourceRecord).toBe('Author');
        expect(link.targetRecord).toBe('Book');
    });

    test('sourceProperty and targetProperty', () => {
        const link = createLinkInfo('rel', {
            sourceProperty: 'books',
            targetProperty: 'author',
        });
        expect(link.sourceProperty).toBe('books');
        expect(link.targetProperty).toBe('author');
    });

    test('isTargetReliance', () => {
        const link = createLinkInfo('rel', { isTargetReliance: true });
        expect(link.isTargetReliance).toBe(true);

        const link2 = createLinkInfo('rel2', { isTargetReliance: false });
        expect(link2.isTargetReliance).toBe(false);
    });
});

describe('LinkInfo sourceRecordInfo and targetRecordInfo', () => {
    test('returns RecordInfo instances', () => {
        const mapData: MapData = {
            records: {
                User: {
                    table: 'user_table',
                    attributes: {
                        id: { name: 'id', type: 'string', field: 'id' },
                    },
                },
                Profile: {
                    table: 'profile_table',
                    attributes: {
                        id: { name: 'id', type: 'string', field: 'id' },
                    },
                },
            },
            links: {
                rel: {
                    relType: ['1', '1'] as ['1', '1'],
                    sourceRecord: 'User',
                    sourceProperty: 'profile',
                    targetRecord: 'Profile',
                    targetProperty: 'owner',
                },
            },
        };
        const map = new EntityToTableMap(mapData);
        const link = new LinkInfo('rel', mapData.links.rel, map);

        const sourceInfo = link.sourceRecordInfo;
        expect(sourceInfo.name).toBe('User');
        expect(sourceInfo.table).toBe('user_table');

        const targetInfo = link.targetRecordInfo;
        expect(targetInfo.name).toBe('Profile');
        expect(targetInfo.table).toBe('profile_table');
    });
});

describe('LinkInfo merge state', () => {
    test('isMerged when mergedTo is set', () => {
        const link = createLinkInfo('rel', { mergedTo: 'source' });
        expect(link.isMerged()).toBe(true);
    });

    test('isIsolated when mergedTo is not set', () => {
        const link = createLinkInfo('rel', {});
        expect(link.isIsolated()).toBe(true);
        expect(link.isMerged()).toBe(false);
    });

    test('isMergedToSource', () => {
        const link = createLinkInfo('rel', { mergedTo: 'source' });
        expect(link.isMergedToSource()).toBe(true);
        expect(link.isMergedToTarget()).toBe(false);
        expect(link.isCombined()).toBe(false);
    });

    test('isMergedToTarget', () => {
        const link = createLinkInfo('rel', { mergedTo: 'target' });
        expect(link.isMergedToTarget()).toBe(true);
        expect(link.isMergedToSource()).toBe(false);
        expect(link.isCombined()).toBe(false);
    });

    test('isCombined', () => {
        const link = createLinkInfo('rel', { mergedTo: 'combined' });
        expect(link.isCombined()).toBe(true);
        expect(link.isMergedToSource()).toBe(false);
        expect(link.isMergedToTarget()).toBe(false);
    });
});

describe('LinkInfo isSymmetric', () => {
    test('symmetric when source and target are same record and property', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'User',
            sourceProperty: 'friends',
            targetRecord: 'User',
            targetProperty: 'friends',
        });
        expect(link.isSymmetric()).toBe(true);
    });

    test('not symmetric when different records', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'User',
            sourceProperty: 'friends',
            targetRecord: 'Profile',
            targetProperty: 'friends',
        });
        expect(link.isSymmetric()).toBe(false);
    });

    test('not symmetric when different properties', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'User',
            sourceProperty: 'following',
            targetRecord: 'User',
            targetProperty: 'followers',
        });
        expect(link.isSymmetric()).toBe(false);
    });
});

describe('LinkInfo isRelationSource and getAttributeName', () => {
    test('isRelationSource matches source record and attribute', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'User',
            sourceProperty: 'posts',
            targetRecord: 'Post',
            targetProperty: 'author',
        });
        expect(link.isRelationSource('User', 'posts')).toBe(true);
        expect(link.isRelationSource('Post', 'author')).toBe(false);
    });

    test('getAttributeName returns source/target for source', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'User',
            sourceProperty: 'posts',
            targetRecord: 'Post',
            targetProperty: 'author',
        });
        expect(link.getAttributeName('User', 'posts')).toEqual(['source', 'target']);
    });

    test('getAttributeName returns target/source for target', () => {
        const link = createLinkInfo('rel', {
            sourceRecord: 'User',
            sourceProperty: 'posts',
            targetRecord: 'Post',
            targetProperty: 'author',
        });
        expect(link.getAttributeName('Post', 'author')).toEqual(['target', 'source']);
    });

    test('getAttributeName throws on empty recordName or attribute', () => {
        const link = createLinkInfo('rel', {});
        expect(() => link.getAttributeName('', 'attr')).toThrow('cannot be empty');
        expect(() => link.getAttributeName('Record', '')).toThrow('cannot be empty');
    });
});

describe('LinkInfo isSourceRelation', () => {
    test('returns true when isSourceRelation is set', () => {
        const link = createLinkInfo('rel', { isSourceRelation: true });
        expect(link.isSourceRelation()).toBe(true);
    });

    test('returns false when isSourceRelation is not set', () => {
        const link = createLinkInfo('rel', {});
        expect(link.isSourceRelation()).toBe(false);
    });
});

describe('LinkInfo filtered relation methods', () => {
    test('isFilteredRelation', () => {
        const link = createLinkInfo('rel', { isFilteredRelation: true });
        expect(link.isFilteredRelation()).toBe(true);
    });

    test('isFilteredRelation returns false when not filtered', () => {
        const link = createLinkInfo('rel', {});
        expect(link.isFilteredRelation()).toBeFalsy();
    });

    test('getMatchExpression returns match expression for filtered relation', () => {
        const matchExp = { key: 'status', value: ['=', 'active'] };
        const link = createLinkInfo('rel', {
            isFilteredRelation: true,
            matchExpression: matchExp,
        });
        expect(link.getMatchExpression()).toEqual(matchExp);
    });

    test('getMatchExpression throws for non-filtered relation', () => {
        const link = createLinkInfo('rel', {});
        expect(() => link.getMatchExpression()).toThrow('is not a filtered relation');
    });

    test('getBaseLinkInfo returns base link for filtered relation', () => {
        const baseLink: LinkMapItem = {
            relType: ['1', 'n'],
            sourceRecord: 'User',
            sourceProperty: 'posts',
            targetRecord: 'Post',
            targetProperty: 'author',
        };
        const filteredLink: LinkMapItem = {
            relType: ['1', 'n'],
            sourceRecord: 'User',
            sourceProperty: 'activePosts',
            targetRecord: 'Post',
            targetProperty: 'activeAuthor',
            isFilteredRelation: true,
            baseLinkName: 'baseRel',
        };
        const mapData: MapData = {
            records: {},
            links: { baseRel: baseLink, filteredRel: filteredLink },
        };
        const map = new EntityToTableMap(mapData);
        const link = new LinkInfo('filteredRel', filteredLink, map);

        const baseLinkInfo = link.getBaseLinkInfo();
        expect(baseLinkInfo.name).toBe('baseRel');
        expect(baseLinkInfo.sourceRecord).toBe('User');
    });

    test('getBaseLinkInfo throws for non-filtered relation', () => {
        const link = createLinkInfo('rel', {});
        expect(() => link.getBaseLinkInfo()).toThrow('only filtered relation');
    });

    test('getResolvedMatchExpression for filtered relation', () => {
        const resolved = { key: 'resolved', value: ['=', true] };
        const link = createLinkInfo('rel', {
            isFilteredRelation: true,
            resolvedMatchExpression: resolved,
        });
        expect(link.getResolvedMatchExpression()).toEqual(resolved);
    });

    test('getResolvedMatchExpression throws for non-filtered relation', () => {
        const link = createLinkInfo('rel', {});
        expect(() => link.getResolvedMatchExpression()).toThrow('only filtered relation');
    });

    test('getResolvedBaseRecordName for filtered relation', () => {
        const link = createLinkInfo('rel', {
            isFilteredRelation: true,
            resolvedBaseRecordName: 'BaseRecord',
        });
        expect(link.getResolvedBaseRecordName()).toBe('BaseRecord');
    });

    test('getResolvedBaseRecordName throws for non-filtered relation', () => {
        const link = createLinkInfo('rel', {});
        expect(() => link.getResolvedBaseRecordName()).toThrow('only filtered relation');
    });
});
