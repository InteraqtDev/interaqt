/**
 * Independent audit probes for application-key-occupancy k=5.
 * Sibling cells of D-1 (related-record filtered membership on identity insert).
 * Not part of the regular suite.
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Controller,
  Count,
  Dictionary,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
  clearAllInstances,
} from 'interaqt'
import { MatchExp } from '@storage'
import { PGLiteDB, SQLiteDB } from '@drivers'

beforeEach(() => {
  clearAllInstances(Entity, Property, Relation, Count, Dictionary)
})

async function setup(entities: any[], relations: any[], dict: any[] = [], db: InstanceType<typeof PGLiteDB> | InstanceType<typeof SQLiteDB> = new PGLiteDB()) {
  const system = new MonoSystem(db)
  system.conceptClass = KlassByName
  const controller = new Controller({ system, entities, relations, dict })
  await controller.setup(true)
  return { system, controller }
}

describe('audit k=5 membership siblings', () => {
  test('SQLite: 1:1 peer filtered Count on identity id-ref', async () => {
    const Other = Entity.create({
      name: 'AkSibPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'AkSibTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'AkSibRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'AkSibBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const { system } = await setup(
      [Other, Token, BoundPeer],
      [Rel],
      [Dictionary.create({ name: 'akSibCount', type: 'number', collection: false, computation: Count.create({ record: BoundPeer }) })],
      new SQLiteDB(':memory:'),
    )
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('akSibCount')).toBe(1)
    await system.destroy()
  })

  test('identity as 1:1 TARGET still fires source-side filtered Count', async () => {
    const Other = Entity.create({
      name: 'AkTgtPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'AkTgtTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'AkTgtRel',
      source: Other,
      sourceProperty: 'token',
      target: Token,
      targetProperty: 'other',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'AkTgtBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const { system } = await setup(
      [Other, Token, BoundPeer],
      [Rel],
      [Dictionary.create({ name: 'akTgtCount', type: 'number', collection: false, computation: Count.create({ record: BoundPeer }) })],
    )
    const peer = await system.storage.create(Other.name, { title: 'p' })
    expect(await system.storage.dict.get('akTgtCount')).toBe(0)
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('akTgtCount')).toBe(1)
    await system.destroy()
  })

  test('predicate miss: identity 1:1 insert does not emit BoundPeer create', async () => {
    const Other = Entity.create({
      name: 'AkMissPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'AkMissTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'AkMissRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'AkMissBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const { system } = await setup(
      [Other, Token, BoundPeer],
      [Rel],
      [Dictionary.create({ name: 'akMissCount', type: 'number', collection: false, computation: Count.create({ record: BoundPeer }) })],
    )
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'parked', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(0)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create')).toHaveLength(0)
    expect(await system.storage.dict.get('akMissCount')).toBe(0)
    await system.destroy()
  })

  test('debug: identity n:1 also materializes a queryable link record', async () => {
    const Owner = Entity.create({
      name: 'AkN1Own',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'AkN1Tok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'AkN1Rel',
      source: Token,
      sourceProperty: 'owner',
      target: Owner,
      targetProperty: 'tokens',
      type: 'n:1',
    })
    const { system } = await setup([Owner, Token], [Rel])
    const owner = await system.storage.create(Owner.name, { name: 'alice' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'one', owner: { id: owner.id } }, events)
    const links = await system.storage.findRelationByName(Rel.name, undefined, undefined, ['id'])
    const stored = await system.storage.findOne(
      Token.name,
      MatchExp.atom({ key: 'id', value: ['=', (await system.storage.find(Token.name, undefined, undefined, ['id']))[0].id] }),
      undefined,
      ['k', ['owner', { attributeQuery: ['name'] }]],
    )
    await system.destroy()
    expect({
      ownerName: stored.owner.name,
      links: links.length,
      relCreates: events.filter(e => e.recordName === Rel.name && e.type === 'create').length,
    }).toEqual({ ownerName: 'alice', links: 1, relCreates: 1 })
  })

  test('debug: identity 1:1 materializes a queryable link record (control: non-identity)', async () => {
    async function run(withIdentity: boolean) {
      const Other = Entity.create({
        name: withIdentity ? 'AkDbgIPeer' : 'AkDbgNPeer',
        properties: [Property.create({ name: 'title', type: 'string' })],
      })
      const Token = Entity.create({
        name: withIdentity ? 'AkDbgITok' : 'AkDbgNTok',
        ...(withIdentity ? { identity: { name: 'byKey', properties: ['k'] } } : {}),
        properties: [Property.create({ name: 'k', type: 'string' })],
      })
      const Rel = Relation.create({
        name: withIdentity ? 'AkDbgIRel' : 'AkDbgNRel',
        source: Token,
        sourceProperty: 'other',
        target: Other,
        targetProperty: 'token',
        type: '1:1',
      })
      const { system } = await setup([Other, Token], [Rel])
      const peer = await system.storage.create(Other.name, { title: 'p' })
      await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } })
      const tokens = await system.storage.find(Token.name, undefined, undefined, ['id', 'k', ['other', { attributeQuery: ['id', 'title'] }]])
      const links = await system.storage.findRelationByName(Rel.name, undefined, undefined, ['id', ['source', { attributeQuery: ['id', 'k'] }], ['target', { attributeQuery: ['id'] }]])
      const reverse = await system.storage.find(Other.name, undefined, undefined, ['id', ['token', { attributeQuery: ['id', 'k'] }]])
      await system.destroy()
      return { withIdentity, tokens, links, reverse }
    }
    const identity = await run(true)
    const control = await run(false)
    expect({
      identityLinks: identity.links.length,
      controlLinks: control.links.length,
      identityTokenOther: identity.tokens.map((t: any) => t.other?.title),
      controlTokenOther: control.tokens.map((t: any) => t.other?.title),
      identityReverseToken: identity.reverse.map((o: any) => o.token?.k),
      controlReverseToken: control.reverse.map((o: any) => o.token?.k),
    }).toEqual({
      identityLinks: 1,
      controlLinks: 1,
      identityTokenOther: ['p'],
      controlTokenOther: ['p'],
      identityReverseToken: ['live'],
      controlReverseToken: ['live'],
    })
  })

  test('exclusive steal: BoundPeer Count stays 1 (unlink delete + new create)', async () => {
    const Other = Entity.create({
      name: 'AkStealPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'AkStealTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'AkStealRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'AkStealBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const { system } = await setup(
      [Other, Token, BoundPeer],
      [Rel],
      [Dictionary.create({ name: 'akStealCount', type: 'number', collection: false, computation: Count.create({ record: BoundPeer }) })],
    )
    const peer = await system.storage.create(Other.name, { title: 'p' })
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } })
    expect(await system.storage.dict.get('akStealCount')).toBe(1)

    const stealEvents: any[] = []
    await system.storage.create(Token.name, { k: 'live2', other: { id: peer.id } }, stealEvents)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(await system.storage.dict.get('akStealCount')).toBe(1)
    const tokens = await system.storage.find(Token.name, undefined, undefined, ['k', ['other', { attributeQuery: ['title'] }]])
    const withPeer = tokens.filter((t: any) => t.other?.title === 'p')
    expect(withPeer).toHaveLength(1)
    expect(withPeer[0].k).toBe('live2')
    const boundDeletes = stealEvents.filter(e => e.recordName === BoundPeer.name && e.type === 'delete')
    const boundCreates = stealEvents.filter(e => e.recordName === BoundPeer.name && e.type === 'create')
    // Steal from live→live: Other leaves then re-enters, or stays a member. Count must stay 1.
    expect(boundCreates.length - boundDeletes.length).toBe(0)
    await system.destroy()
  })

  test('filtered relation over 1:1 merged link fires on identity insert', async () => {
    const Other = Entity.create({
      name: 'AkFrPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'AkFrTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'AkFrRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const LiveRel = Relation.create({
      name: 'AkFrLiveRel',
      baseRelation: Rel,
      sourceProperty: 'liveOther',
      targetProperty: 'liveToken',
      matchExpression: MatchExp.atom({ key: 'source.k', value: ['=', 'live'] }),
    })
    const { system } = await setup(
      [Other, Token],
      [Rel, LiveRel],
      [Dictionary.create({ name: 'akFrCount', type: 'number', collection: false, computation: Count.create({ record: LiveRel }) })],
    )
    const peer = await system.storage.create(Other.name, { title: 'p' })
    expect(await system.storage.dict.get('akFrCount')).toBe(0)
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.findRelationByName(LiveRel.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === LiveRel.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('akFrCount')).toBe(1)
    await system.destroy()
  })

  test('filtered-name update still rejects identity property rewrite', async () => {
    const Token = Entity.create({
      name: 'AkViewTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [
        Property.create({ name: 'k', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
      ],
    })
    const Live = Entity.create({
      name: 'AkViewLive',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'k', value: ['=', 'live'] }),
    })
    const { system } = await setup([Token, Live], [])
    const row = await system.storage.create(Token.name, { k: 'live', payload: 'a' })
    await expect(
      system.storage.update(Live.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { k: 'other' }),
    ).rejects.toThrow(/identity property "k"/)
    await system.destroy()
  })
})
