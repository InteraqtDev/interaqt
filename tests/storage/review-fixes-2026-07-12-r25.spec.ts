import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";

// r25 F-1（storage 面）：行内（merged / combined）记录的 base create 事件必须携带
// default-only 字段（create 事件 payload 契约 = defaults + payload，r16 R-1）。
// 三个产生点：preprocessSameRowData 的 combined 记录 / merged link、flashOut 的抢夺新 link。
// r22 I-4 只修了 filtered 视图事件；base 名事件是同一契约的兄弟消费方。
describe("r25 F-1 — in-row base create events carry default-only fields", () => {
  function buildMergedFixture() {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Team = Entity.create({ name: 'Team', properties: [Property.create({ name: 'name', type: 'string' })] });
    // n:1 → link 默认合并进 source（User 行内 FK）
    const userTeam = Relation.create({
      name: 'UserTeam',
      source: User, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1',
      properties: [
        Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => true }),
        Property.create({ name: 'weight', type: 'number', defaultValue: () => 5 }),
      ],
    });
    return { User, Team, userTeam };
  }

  test("merged in-row link create event carries default-only link properties (no '&' given)", async () => {
    const { User, Team, userTeam } = buildMergedFixture();
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Team], [userTeam], db);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

    const team = await handle.create('Team', { name: 'T1' });
    const events: RecordMutationEvent[] = [];
    await handle.create('User', { name: 'u1', team: { id: team.id } }, events);

    // 数据面：defaults 落库
    const link = await handle.findOne('UserTeam', undefined, undefined, ['*']);
    expect(link.isPrimary).toBe(true);
    expect(link.weight).toBe(5);
    // 事件面：base link create 事件与行一致
    const linkCreate = events.find(e => e.recordName === 'UserTeam' && e.type === 'create');
    expect(linkCreate?.record?.isPrimary).toBe(true);
    expect(linkCreate?.record?.weight).toBe(5);
    await db.close();
  });

  test("combined (mergeLinks) nested entity + link create events carry default-only properties", async () => {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Profile = Entity.create({
      name: 'Profile',
      properties: [
        Property.create({ name: 'title', type: 'string' }),
        Property.create({ name: 'score', type: 'number', defaultValue: () => 42 }),
      ],
    });
    const userProfile = Relation.create({
      name: 'UserProfile',
      source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner', type: '1:1',
      properties: [Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })],
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Profile], [userProfile], db, ['User.profile']);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

    const events: RecordMutationEvent[] = [];
    await handle.create('User', { name: 'u1', profile: { title: 'p1' } }, events);

    const profile = await handle.findOne('Profile', undefined, undefined, ['*']);
    expect(profile.score).toBe(42);
    const profileCreate = events.find(e => e.recordName === 'Profile' && e.type === 'create');
    const linkCreate = events.find(e => e.recordName === 'UserProfile' && e.type === 'create');
    expect(profileCreate?.record?.score).toBe(42);
    expect(linkCreate?.record?.isActive).toBe(true);
    // r25 F-1 端点子格（事件完备性预言机升级首跑抓出）：combined 嵌套新建的 id 在
    // preprocess 步骤 1 分配给替换后的容器，link 事件端点此前取的是替换前的原始
    // rawData——端点缺 id，按端点定位的下游（computeTarget 等）拿到 undefined。
    // 本 fixture 中 User 是 relation source，Profile（combined 嵌套新建）在 target 端。
    expect(linkCreate?.record?.target?.id).toBe(profile.id);
    await db.close();
  });

  test("flashOut steal: new link base create event carries default-only link property", async () => {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Profile = Entity.create({ name: 'Profile', properties: [Property.create({ name: 'title', type: 'string' })] });
    const userProfile = Relation.create({
      name: 'UserProfile',
      source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner', type: '1:1',
      properties: [Property.create({ name: 'isPrimary', type: 'boolean', defaultValue: () => true })],
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Profile], [userProfile], db, ['User.profile']);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

    const u1 = await handle.create('User', { name: 'u1', profile: { title: 'p1' } });
    // u2 经 ref 抢夺 u1 的 combined profile → flashOut 产生新 link（不带 '&'，isPrimary 仅有默认值）
    const events: RecordMutationEvent[] = [];
    await handle.create('User', { name: 'u2', profile: { id: u1.profile.id } }, events);

    const linkCreate = events.find(e => e.recordName === 'UserProfile' && e.type === 'create');
    expect(linkCreate).toBeDefined();
    expect(linkCreate?.record?.isPrimary).toBe(true);
    await db.close();
  });

  test("CONTROL: host create and isolated (n:n) link create events keep carrying defaults", async () => {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })] });
    const Tag = Entity.create({ name: 'Tag', properties: [Property.create({ name: 'name', type: 'string' })] });
    const userTag = Relation.create({
      name: 'UserTag',
      source: User, sourceProperty: 'tags', target: Tag, targetProperty: 'users', type: 'n:n',
      properties: [Property.create({ name: 'level', type: 'number', defaultValue: () => 3 })],
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Tag], [userTag], db);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    const tag = await handle.create('Tag', { name: 't1' });
    const events: RecordMutationEvent[] = [];
    await handle.create('User', { name: 'u1', tags: [{ id: tag.id }] }, events);
    expect(events.find(e => e.recordName === 'User' && e.type === 'create')?.record?.status).toBe('active');
    expect(events.find(e => e.recordName === 'UserTag' && e.type === 'create')?.record?.level).toBe(3);
    await db.close();
  });
});

// r25 F-2：filtered relation 属性上的 EXIST 匹配——link 谓词必须折叠进 EXIST 子查询。
// 此前谓词被 AND 在外层，与 EXIST 子查询各自独立成立（对不同的边）→ 幻影多行。
describe("r25 F-2 — EXIST over a filtered relation only considers filtered edges", () => {
  async function setupFixture() {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
    const Post = Entity.create({ name: 'Post', properties: [Property.create({ name: 'title', type: 'string' })] });
    const userPost = Relation.create({
      name: 'UserPost',
      source: User, sourceProperty: 'posts', target: Post, targetProperty: 'authors', type: 'n:n',
      properties: [Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => false })],
    });
    const ActiveUserPost = Relation.create({
      name: 'ActiveUserPost',
      baseRelation: userPost,
      sourceProperty: 'activePosts',
      targetProperty: 'activeAuthors',
      matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Post], [userPost, ActiveUserPost], db);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

    const u1 = await handle.create('User', { name: 'u1' });
    const postA = await handle.create('Post', { title: 'A' });
    const postB = await handle.create('Post', { title: 'B' });
    await handle.addRelationByNameById('UserPost', u1.id, postA.id, { isActive: true });
    await handle.addRelationByNameById('UserPost', u1.id, postB.id, { isActive: false });
    return { db, handle };
  }

  test("inactive edge must not satisfy EXIST via filtered relation (was: phantom row)", async () => {
    const { db, handle } = await setupFixture();
    // B 边只有 inactive：filtered EXIST 不应命中
    const viaFiltered = await handle.find('User', MatchExp.atom({
      key: 'activePosts',
      value: ['exist', { key: 'title', value: ['=', 'B'] }],
    }), undefined, ['name']);
    expect(viaFiltered).toHaveLength(0);

    // 对照 1：active 边照常命中
    const viaFilteredA = await handle.find('User', MatchExp.atom({
      key: 'activePosts',
      value: ['exist', { key: 'title', value: ['=', 'A'] }],
    }), undefined, ['name']);
    expect(viaFilteredA).toHaveLength(1);

    // 对照 2：base 关系上的 EXIST 语义不变（B 边存在）
    const viaBase = await handle.find('User', MatchExp.atom({
      key: 'posts',
      value: ['exist', { key: 'title', value: ['=', 'B'] }],
    }), undefined, ['name']);
    expect(viaBase).toHaveLength(1);
    await db.close();
  });

  test("plain path match over filtered relation keeps working (shared-JOIN semantics control)", async () => {
    const { db, handle } = await setupFixture();
    const pathB = await handle.find('User', MatchExp.atom({ key: 'activePosts.title', value: ['=', 'B'] }), undefined, ['name']);
    expect(pathB).toHaveLength(0);
    const pathA = await handle.find('User', MatchExp.atom({ key: 'activePosts.title', value: ['=', 'A'] }), undefined, ['name']);
    expect(pathA).toHaveLength(1);
    await db.close();
  });

  test("EXIST inner match combines user conditions with the folded predicate (AND semantics; BoolExp inner form)", async () => {
    const { db, handle } = await setupFixture();
    // 内层 BoolExp 形态 + 折叠谓词：title != 'B' 命中 active 的 A 边
    const found = await handle.find('User', MatchExp.atom({
      key: 'activePosts',
      value: ['exist', MatchExp.atom({ key: 'title', value: ['!=', 'B'] })],
    }), undefined, ['name']);
    expect(found).toHaveLength(1);
    // 内层条件与折叠谓词交集为空：title = 'B' 的边只有 inactive → 零行
    const empty = await handle.find('User', MatchExp.atom({
      key: 'activePosts',
      value: ['exist', MatchExp.atom({ key: 'title', value: ['=', 'B'] })],
    }), undefined, ['name']);
    expect(empty).toHaveLength(0);
    await db.close();
  });
});
