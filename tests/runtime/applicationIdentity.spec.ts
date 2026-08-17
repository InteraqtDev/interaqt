/**
 * M-01 — Entity.identity declaration, dedicated materialization, and
 * set-semantic logical create.
 * M-03 — official occupancy recipe (Transform register + StateMachine consume)
 *         and the §3.4 result algebra on PGLite.
 */
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Action,
  BoolExp,
  Controller,
  Count,
  Dictionary,
  Entity,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MonoSystem,
  NonNullConstraint,
  Payload,
  PayloadItem,
  Property,
  Relation,
  StateMachine,
  StateNode,
  StateTransfer,
  Transform,
  UniqueConstraint,
  clearAllInstances,
  findConstraintViolationError,
} from 'interaqt'
import {
  createFrameworkApplicationIdentityIndexSQL,
  DBSetup,
  getSchemaDialect,
  MatchExp,
} from '@storage'
import { PGLiteDB, SQLiteDB } from '@drivers'

beforeEach(() => {
  clearAllInstances(
    Entity, Property, Relation, UniqueConstraint, NonNullConstraint, Transform,
    Interaction, Action, Payload, PayloadItem, Count, Dictionary,
    StateMachine, StateNode, StateTransfer,
  )
})

function identityToken(name: string, extra?: { payload?: boolean }) {
  return Entity.create({
    name,
    identity: { name: 'byKey', properties: ['ns', 'token'] },
    properties: [
      Property.create({ name: 'ns', type: 'string' }),
      Property.create({ name: 'token', type: 'string' }),
      ...(extra?.payload === false ? [] : [Property.create({ name: 'payload', type: 'string' })]),
      Property.create({ name: 'holder', type: 'string' }),
    ],
  })
}

async function setupWith(
  db: InstanceType<typeof PGLiteDB> | InstanceType<typeof SQLiteDB>,
  entities: ReturnType<typeof Entity.create>[],
  relations: ReturnType<typeof Relation.create>[] = [],
  eventSources: unknown[] = [],
) {
  const system = new MonoSystem(db)
  system.conceptClass = KlassByName
  const controller = new Controller({
    system,
    entities,
    relations,
    eventSources: eventSources as any,
  })
  await controller.setup(true)
  return { system, controller }
}

const mysqlLikeDatabase = {
  schemaDialect: {
    name: 'mysql' as const,
    maxIdentifierLength: 64,
    supportsCreateIndexIfNotExists: false,
    enforceMaxIdentifierLength: true,
    encodeLiteral: (v: unknown) => JSON.stringify(v),
    constraints: { unique: false, filteredUnique: false, nonNull: false },
  },
  mapToDBFieldType: (type: string) => {
    if (type === 'pk') return 'INT AUTO_INCREMENT PRIMARY KEY'
    if (type === 'id') return 'INT'
    if (type === 'string') return 'TEXT'
    if (type === 'number') return 'DECIMAL'
    if (type === 'boolean') return 'BOOLEAN'
    return type
  },
}

describe('application identity — declaration guards (D1–D6)', () => {
  test('D1: empty properties / unknown property / duplicates', () => {
    expect(() => Entity.create({
      name: 'IdD1Empty',
      identity: { name: 'byKey', properties: [] },
      properties: [Property.create({ name: 'ns', type: 'string' })],
    })).toThrow(/identity\.properties must be a non-empty array/)

    expect(() => Entity.create({
      name: 'IdD1Unknown',
      identity: { name: 'byKey', properties: ['missing'] },
      properties: [Property.create({ name: 'ns', type: 'string' })],
    })).toThrow(/unknown property "missing"/)

    expect(() => Entity.create({
      name: 'IdD1Dup',
      identity: { name: 'byKey', properties: ['ns', 'ns'] },
      properties: [Property.create({ name: 'ns', type: 'string' })],
    })).toThrow(/must be unique/)
  })

  test('D2: type / collection / computed rejected', () => {
    expect(() => Entity.create({
      name: 'IdD2Type',
      identity: { name: 'byKey', properties: ['when'] },
      properties: [Property.create({ name: 'when', type: 'timestamp' })],
    })).toThrow(/must have type "string", "number", or "boolean"/)

    expect(() => Entity.create({
      name: 'IdD2Coll',
      identity: { name: 'byKey', properties: ['tags'] },
      properties: [Property.create({ name: 'tags', type: 'string', collection: true })],
    })).toThrow(/cannot be a collection/)

    expect(() => Entity.create({
      name: 'IdD2Comp',
      identity: { name: 'byKey', properties: ['code'] },
      properties: [Property.create({ name: 'code', type: 'string', computed: () => 'x' })],
    })).toThrow(/cannot be computed/)

    const other = Entity.create({
      name: 'IdD2Other',
      properties: [Property.create({ name: 'n', type: 'string' })],
    })
    expect(() => Entity.create({
      name: 'IdD2Computation',
      identity: { name: 'byKey', properties: ['code'] },
      properties: [Property.create({
        name: 'code',
        type: 'string',
        computation: Count.create({ record: other }),
      })],
    })).toThrow(/cannot declare a computation/)
  })

  test('D3: identity property cannot declare defaultValue', () => {
    expect(() => Entity.create({
      name: 'IdD3',
      identity: { name: 'byKey', properties: ['ns'] },
      properties: [Property.create({ name: 'ns', type: 'string', defaultValue: () => 'n' })],
    })).toThrow(/cannot declare defaultValue/)
  })

  test('D4: filtered and merged hosts cannot declare identity', () => {
    const base = Entity.create({
      name: 'IdD4Base',
      properties: [Property.create({ name: 'ns', type: 'string' })],
    })
    expect(() => Entity.create({
      name: 'IdD4Filtered',
      baseEntity: base,
      matchExpression: MatchExp.atom({ key: 'ns', value: ['=', 'a'] }),
      identity: { name: 'byKey', properties: ['ns'] },
      properties: [Property.create({ name: 'ns', type: 'string' })],
    })).toThrow(/Filtered entity .* cannot declare identity/)

    const a = Entity.create({ name: 'IdD4A', properties: [Property.create({ name: 'ns', type: 'string' })] })
    const b = Entity.create({ name: 'IdD4B', properties: [Property.create({ name: 'ns', type: 'string' })] })
    expect(() => Entity.create({
      name: 'IdD4Merged',
      inputEntities: [a, b],
      identity: { name: 'byKey', properties: ['ns'] },
    })).toThrow(/Merged entity .* cannot declare identity/)
  })

  test('D5: identity.name must match the name format', () => {
    expect(() => Entity.create({
      name: 'IdD5',
      identity: { name: 'by-key', properties: ['ns'] },
      properties: [Property.create({ name: 'ns', type: 'string' })],
    })).toThrow(/identity\.name/)
  })

  test('D6: UniqueConstraint on the same property set is rejected; subset is allowed', () => {
    expect(() => Entity.create({
      name: 'IdD6Same',
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
      ],
      constraints: [UniqueConstraint.create({
        name: 'IdD6Same_uniq',
        properties: ['token', 'ns'],
      })],
    })).toThrow(/cannot declare both identity and UniqueConstraint/)

    const subset = Entity.create({
      name: 'IdD6Subset',
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
      ],
      constraints: [UniqueConstraint.create({
        name: 'IdD6Subset_ns',
        properties: ['ns'],
      })],
    })
    expect(subset.identity?.properties).toEqual(['ns', 'token'])
  })
})

describe('application identity — clone, stringify, materialization', () => {
  test('Entity.clone and stringify preserve identity', () => {
    const original = identityToken('IdCloneSrc')
    const cloned = Entity.clone(original, false)
    expect(cloned.identity).toEqual({ name: 'byKey', properties: ['ns', 'token'] })
    expect(cloned.identity).not.toBe(original.identity)

    const json = Entity.stringify(original)
    const data = JSON.parse(json)
    expect(data.public.identity).toEqual({ name: 'byKey', properties: ['ns', 'token'] })
  })

  test('createTableSQL emits NOT NULL only on identity columns; dedicated unique index is not UniqueConstraint', () => {
    const Token = identityToken('IdDdlTok')
    const setup = new DBSetup([Token], [], new SQLiteDB())
    const record = setup.map.records[Token.name]
    expect(record.identity?.properties).toEqual(['ns', 'token'])
    expect(record.identity?.fields.length).toBe(2)
    expect(record.identity?.indexName).toMatch(/^interaqt_ident_/)
    expect(setup.constraintSchemaItems.filter(item => item.recordName === Token.name)).toHaveLength(0)

    const sql = setup.createTableSQL().join('\n')
    for (const field of record.identity!.fields) {
      expect(sql).toMatch(new RegExp(`"${field}" [^\\n,]+ NOT NULL`))
    }
    const payloadField = (record.attributes.payload as { field: string }).field
    expect(sql).not.toMatch(new RegExp(`"${payloadField}" [^\\n,]+ NOT NULL`))

    const dialect = getSchemaDialect(new SQLiteDB())
    const indexes = createFrameworkApplicationIdentityIndexSQL(setup.map, dialect)
    expect(indexes).toHaveLength(1)
    expect(indexes[0].sql).toMatch(/CREATE UNIQUE INDEX/i)
    expect(indexes[0].sql).toContain(record.identity!.fields[0])
    expect(indexes[0].sql).toContain(record.identity!.fields[1])
    expect(indexes[0].sql).not.toMatch(/ON CONFLICT/)
  })
})

describe('application identity — set semantics (PGLite and SQLite)', () => {
  for (const makeDb of [() => new PGLiteDB(), () => new SQLiteDB(':memory:')]) {
    const dialect = makeDb().constructor.name

    test(`${dialect}: first create inserts; second create observes stored row and keeps winner payload`, async () => {
      const db = makeDb()
      const Token = identityToken(`IdSet${dialect}`)
      const { system } = await setupWith(db, [Token])

      const firstEvents: Array<{ type: string, recordName: string, record: { holder?: string, payload?: string } }> = []
      const first = await system.storage.create(Token.name, {
        ns: 'n', token: 't', payload: 'winner', holder: 'h1',
      }, firstEvents as any)
      expect(first.id).toBeDefined()
      expect(first.payload).toBe('winner')
      expect(firstEvents.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(1)

      const secondEvents: Array<{ type: string, recordName: string }> = []
      const second = await system.storage.create(Token.name, {
        ns: 'n', token: 't', payload: 'loser', holder: 'h2',
      }, secondEvents as any)
      expect(second.id).toBe(first.id)
      expect(second.payload).toBe('winner')
      expect(second.holder).toBe('h1')
      expect(secondEvents.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(0)

      const rows = await system.storage.find(Token.name, undefined, undefined, ['id', 'ns', 'token', 'payload', 'holder'])
      expect(rows).toHaveLength(1)
      expect(rows[0].payload).toBe('winner')
      await system.destroy()
    })

    test(`${dialect}: missing identity value is a programmer error`, async () => {
      const db = makeDb()
      const Token = identityToken(`IdMiss${dialect}`)
      const { system } = await setupWith(db, [Token])
      await expect(system.storage.create(Token.name, { ns: 'n', payload: 'x' })).rejects.toThrow(/must be supplied and non-null/)
      await system.destroy()
    })

    test(`${dialect}: identity properties are immutable; other fields still update`, async () => {
      const db = makeDb()
      const Token = identityToken(`IdImm${dialect}`)
      const { system } = await setupWith(db, [Token])
      const row = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'p' })
      await expect(
        system.storage.update(Token.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { ns: 'other' }),
      ).rejects.toThrow(/identity property "ns"/)

      await system.storage.update(Token.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { payload: 'p2' })
      const after = await system.storage.findOne(Token.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), undefined, ['ns', 'token', 'payload'])
      expect(after.ns).toBe('n')
      expect(after.token).toBe('t')
      expect(after.payload).toBe('p2')
      await system.destroy()
    })

    test(`${dialect}: nested create runs on insert and is skipped on observe`, async () => {
      const db = makeDb()
      const Owner = Entity.create({
        name: `IdOwner${dialect}`,
        properties: [Property.create({ name: 'name', type: 'string' })],
      })
      const Token = Entity.create({
        name: `IdNest${dialect}`,
        identity: { name: 'byKey', properties: ['ns', 'token'] },
        properties: [
          Property.create({ name: 'ns', type: 'string' }),
          Property.create({ name: 'token', type: 'string' }),
          Property.create({ name: 'payload', type: 'string' }),
        ],
      })
      const OwnedBy = Relation.create({
        source: Token,
        sourceProperty: 'owner',
        target: Owner,
        targetProperty: 'tokens',
        type: 'n:1',
      })
      const { system } = await setupWith(db, [Owner, Token], [OwnedBy])

      await system.storage.create(Token.name, {
        ns: 'n', token: 't', payload: 'p1', owner: { name: 'alice' },
      })
      const ownersAfterFirst = await system.storage.find(Owner.name, undefined, undefined, ['id', 'name'])
      expect(ownersAfterFirst).toHaveLength(1)
      expect(ownersAfterFirst[0].name).toBe('alice')

      await system.storage.create(Token.name, {
        ns: 'n', token: 't', payload: 'p2', owner: { name: 'bob' },
      })
      const ownersAfterSecond = await system.storage.find(Owner.name, undefined, undefined, ['id', 'name'])
      expect(ownersAfterSecond).toHaveLength(1)
      expect(ownersAfterSecond[0].name).toBe('alice')

      const tokens = await system.storage.find(Token.name, undefined, undefined, ['payload', ['owner', { attributeQuery: ['name'] }]])
      expect(tokens).toHaveLength(1)
      expect(tokens[0].payload).toBe('p1')
      expect(tokens[0].owner.name).toBe('alice')
      await system.destroy()
    })

    test(`${dialect}: same-transaction duplicate key observes the first insert`, async () => {
      const db = makeDb()
      const Token = identityToken(`IdTxn${dialect}`)
      const { system } = await setupWith(db, [Token])
      await system.storage.runInTransaction({ name: 'identity-same-txn' }, async () => {
        const first = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'a' })
        const second = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'b' })
        expect(second.id).toBe(first.id)
        expect(second.payload).toBe('a')
      })
      const rows = await system.storage.find(Token.name, undefined, undefined, ['payload'])
      expect(rows).toHaveLength(1)
      expect(rows[0].payload).toBe('a')
      await system.destroy()
    })

    test(`${dialect}: two entities may share identity.name byKey`, async () => {
      const db = makeDb()
      const A = Entity.create({
        name: `IdTwoA${dialect}`,
        identity: { name: 'byKey', properties: ['k'] },
        properties: [Property.create({ name: 'k', type: 'string' })],
      })
      const B = Entity.create({
        name: `IdTwoB${dialect}`,
        identity: { name: 'byKey', properties: ['k'] },
        properties: [Property.create({ name: 'k', type: 'string' })],
      })
      const { system } = await setupWith(db, [A, B])
      await system.storage.create(A.name, { k: 'same' })
      await system.storage.create(B.name, { k: 'same' })
      expect(await system.storage.find(A.name, undefined, undefined, ['k'])).toHaveLength(1)
      expect(await system.storage.find(B.name, undefined, undefined, ['k'])).toHaveLength(1)
      await system.destroy()
    })

    test(`${dialect}: filtered-name create uses the base identity`, async () => {
      const db = makeDb()
      const Token = identityToken(`IdFiltBase${dialect}`)
      const Active = Entity.create({
        name: `IdFiltView${dialect}`,
        baseEntity: Token,
        matchExpression: MatchExp.atom({ key: 'ns', value: ['=', 'n'] }),
      })
      const { system } = await setupWith(db, [Token, Active])
      const first = await system.storage.create(Active.name, { ns: 'n', token: 't', payload: 'p1' })
      const second = await system.storage.create(Active.name, { ns: 'n', token: 't', payload: 'p2' })
      expect(second.id).toBe(first.id)
      expect(second.payload).toBe('p1')
      expect(await system.storage.find(Token.name, undefined, undefined, ['id'])).toHaveLength(1)
      await system.destroy()
    })
  }
})

describe('application identity — dispatch Transform path and controls', () => {
  test('Transform insert via dispatch is set-semantic; UniqueConstraint control still rolls back', async () => {
    const Token = Entity.create({
      name: 'IdDispTok',
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
        Property.create({ name: 'holder', type: 'string' }),
      ],
      computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['interactionName', 'payload'],
        callback: (event: any) => event.interactionName === 'IdRegister' ? {
          ns: event.payload.ns,
          token: event.payload.token,
          payload: event.payload.data,
          holder: event.payload.nonce,
        } : null,
      }),
    })
    const Register = Interaction.create({
      name: 'IdRegister',
      action: Action.create({ name: 'IdRegister' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'ns', type: 'string' }),
          PayloadItem.create({ name: 'token', type: 'string' }),
          PayloadItem.create({ name: 'data', type: 'string' }),
          PayloadItem.create({ name: 'nonce', type: 'string' }),
        ],
      }),
    })
    const { system, controller } = await setupWith(new PGLiteDB(), [Token], [], [Register])
    const user = { id: 'u1' }
    const first = await controller.dispatch(Register, {
      user,
      payload: { ns: 'n', token: 't', data: 'p1', nonce: 'h1' },
    })
    expect(first.error).toBeUndefined()
    expect(first.effects?.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(1)

    const second = await controller.dispatch(Register, {
      user,
      payload: { ns: 'n', token: 't', data: 'p2', nonce: 'h2' },
    })
    expect(second.error).toBeUndefined()
    expect(second.effects?.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(0)
    const rows = await system.storage.find(Token.name, undefined, undefined, ['payload', 'holder'])
    expect(rows).toHaveLength(1)
    expect(rows[0].payload).toBe('p1')
    expect(rows[0].holder).toBe('h1')
    const interactions = await system.storage.find(InteractionEventEntity.name, MatchExp.atom({
      key: 'interactionName',
      value: ['=', 'IdRegister'],
    }), undefined, ['id'])
    expect(interactions).toHaveLength(2)
    await system.destroy()
  })

  test('UniqueConstraint duplicate create remains ConstraintViolationError and rolls back dispatch', async () => {
    const Source = Entity.create({
      name: 'IdCtrlSource',
      properties: [Property.create({ name: 'key', type: 'string' })],
    })
    const Derived = Entity.create({
      name: 'IdCtrlDerived',
      properties: [Property.create({ name: 'key', type: 'string' })],
      constraints: [UniqueConstraint.create({
        name: 'IdCtrlDerived_key_unique',
        properties: ['key'],
      })],
      computation: Transform.create({
        record: Source,
        attributeQuery: ['key'],
        callback: (source: any) => ({ key: source.key }),
      }),
    })
    const Add = Interaction.create({
      name: 'IdCtrlAdd',
      action: Action.create({ name: 'IdCtrlAdd' }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: 'source', type: 'Entity', base: Source })],
      }),
    })
    Add.resolve = async function (this: Controller, event: any) {
      return this.system.storage.create(Source.name, event.payload.source)
    }
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Source, Derived],
      eventSources: [Add],
      forceThrowDispatchError: true,
    })
    await controller.setup(true)
    await controller.dispatch(Add, { user: { id: 'u1' }, payload: { source: { key: 'dup' } } })
    await expect(controller.dispatch(Add, { user: { id: 'u1' }, payload: { source: { key: 'dup' } } })).rejects.toSatisfy((error: unknown) => {
      return findConstraintViolationError(error)?.constraintName === 'IdCtrlDerived_key_unique'
    })
    expect(await system.storage.find(Source.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(await system.storage.find(Derived.name, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })
})

describe('application identity — S1 / S2 and NonNullConstraint control', () => {
  test('S1: identity entity combined with another entity fails setup', async () => {
    const Token = identityToken('IdS1Tok')
    const Host = Entity.create({
      name: 'IdS1Host',
      properties: [Property.create({ name: 'n', type: 'string' })],
    })
    const Rel = Relation.create({
      source: Host,
      sourceProperty: 'tok',
      target: Token,
      targetProperty: 'host',
      type: '1:1',
      isTargetReliance: true,
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Host, Token], relations: [Rel] })
    await expect(controller.setup(true)).rejects.toThrow(/cannot share a physical table/)
    await system.destroy()
  })

  test('S2: mysql-like dialect fail-fast without a MySQL server', () => {
    expect(() => new DBSetup([identityToken('IdS2Tok')], [], mysqlLikeDatabase as any)).toThrow(/mysql dialect/)
  })

  test('SQLite NonNullConstraint still fails setup (control)', async () => {
    const Note = Entity.create({
      name: 'IdNnSqlite',
      properties: [Property.create({ name: 'k', type: 'string' })],
      constraints: [NonNullConstraint.create({ name: 'IdNnSqlite_k', property: 'k' })],
    })
    const system = new MonoSystem(new SQLiteDB(':memory:'))
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Note] })
    await expect(controller.setup(true)).rejects.toThrow(/non-null constraints are not supported by sqlite/i)
    await system.destroy()
  })
})

describe('application identity — setup fail-fast (S1/S2)', () => {
  test('S2: mysql-like dialect fail-fast without a MySQL server', () => {
    const Token = identityToken('IdS2Tok')
    expect(() => new DBSetup([Token], [], mysqlLikeDatabase as any)).toThrow(/not supported on the mysql dialect/)
  })

  test('S1: identity entity combined with another entity via 1:1 isTargetReliance fail-fast', async () => {
    const Token = identityToken('IdS1Tok')
    const Other = Entity.create({
      name: 'IdS1Other',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdS1Rel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
      isTargetReliance: true,
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Token, Other], relations: [Rel] })
    await expect(controller.setup(true)).rejects.toThrow(/cannot share a physical table/)
    await system.destroy()
  })

  test('two entities may share identity.name byKey without colliding', async () => {
    const A = identityToken('IdByKeyA')
    const B = identityToken('IdByKeyB')
    const { system } = await setupWith(new PGLiteDB(), [A, B])
    const first = await system.storage.create(A.name, { ns: 'n', token: 't', payload: 'a' })
    const second = await system.storage.create(B.name, { ns: 'n', token: 't', payload: 'b' })
    expect(first.payload).toBe('a')
    expect(second.payload).toBe('b')
    const aRows = await system.storage.find(A.name, undefined, undefined, ['*'])
    const bRows = await system.storage.find(B.name, undefined, undefined, ['*'])
    expect(aRows).toHaveLength(1)
    expect(bRows).toHaveLength(1)
    await system.destroy()
  })
})

describe('application identity — set-semantic logical create', () => {
  for (const makeDb of [
    () => new PGLiteDB(),
    () => new SQLiteDB(),
  ]) {
    const dialect = makeDb().constructor.name

    test(`${dialect}: first create inserts; second observes stored payload and emits no create event`, async () => {
      const Token = identityToken(`IdSet${dialect}`)
      const { system } = await setupWith(makeDb(), [Token])
      const events1: any[] = []
      const first = await system.storage.create(Token.name, { ns: 'n', token: 't1', payload: 'winner' }, events1)
      expect(first.payload).toBe('winner')
      expect(events1.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(1)

      const events2: any[] = []
      const second = await system.storage.create(Token.name, { ns: 'n', token: 't1', payload: 'discarded' }, events2)
      expect(second.id).toBe(first.id)
      expect(second.payload).toBe('winner')
      expect(events2.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(0)

      const rows = await system.storage.find(Token.name, undefined, undefined, ['*'])
      expect(rows).toHaveLength(1)
      expect(rows[0].payload).toBe('winner')
      await system.destroy()
    })

    test(`${dialect}: same-transaction second create observes`, async () => {
      const Token = identityToken(`IdTx${dialect}`)
      const { system } = await setupWith(makeDb(), [Token])
      await system.storage.runInTransaction({ name: `id-tx-${dialect}` }, async () => {
        const first = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'one' })
        const second = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'two' })
        expect(second.id).toBe(first.id)
        expect(second.payload).toBe('one')
      })
      const rows = await system.storage.find(Token.name, undefined, undefined, ['*'])
      expect(rows).toHaveLength(1)
      expect(rows[0].payload).toBe('one')
      await system.destroy()
    })

    test(`${dialect}: identity properties are immutable`, async () => {
      const Token = identityToken(`IdImm${dialect}`)
      const { system } = await setupWith(makeDb(), [Token])
      const row = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'p' })
      await expect(
        system.storage.update(Token.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { token: 'other' }),
      ).rejects.toThrow(/identity property "token".*immutable/)
      await system.storage.update(Token.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { payload: 'p2' })
      const after = await system.storage.findOne(Token.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), undefined, ['*'])
      expect(after.payload).toBe('p2')
      expect(after.token).toBe('t')
      await system.destroy()
    })
  }

  test('nested create: first insert still creates nested rows; observe does not', async () => {
    const Token = identityToken('IdNestTok')
    const Note = Entity.create({
      name: 'IdNestNote',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdNestRel',
      source: Token,
      sourceProperty: 'notes',
      target: Note,
      targetProperty: 'token',
      type: '1:n',
    })
    const { system } = await setupWith(new PGLiteDB(), [Token, Note], [Rel])
    await system.storage.create(Token.name, {
      ns: 'n', token: 't', payload: 'first',
      notes: [{ title: 'kept' }],
    })
    const notesAfterFirst = await system.storage.find(Note.name, undefined, undefined, ['*'])
    expect(notesAfterFirst.map((n: any) => n.title)).toEqual(['kept'])

    const observed = await system.storage.create(Token.name, {
      ns: 'n', token: 't', payload: 'discarded',
      notes: [{ title: 'should-not-exist' }],
    })
    expect(observed.payload).toBe('first')
    const notesAfterObserve = await system.storage.find(Note.name, undefined, undefined, ['*'])
    expect(notesAfterObserve.map((n: any) => n.title)).toEqual(['kept'])
    await system.destroy()
  })

  test('filtered-name create uses the base identity (no semantic split)', async () => {
    const Token = identityToken('IdFiltTok')
    const View = Entity.create({
      name: 'IdFiltView',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'ns', value: ['=', 'n'] }),
    })
    const { system } = await setupWith(new PGLiteDB(), [Token, View])
    const first = await system.storage.create(View.name, { ns: 'n', token: 't', payload: 'via-view' })
    const second = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'via-base' })
    expect(second.id).toBe(first.id)
    expect(second.payload).toBe('via-view')
    const rows = await system.storage.find(Token.name, undefined, undefined, ['*'])
    expect(rows).toHaveLength(1)
    await system.destroy()
  })

  test('Transform dispatch path: second register observes, no error, no create event', async () => {
    const Register = Interaction.create({
      name: 'IdRegister',
      action: Action.create({ name: 'idRegister' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'ns', type: 'string', required: true }),
          PayloadItem.create({ name: 'token', type: 'string', required: true }),
          PayloadItem.create({ name: 'data', type: 'string', required: true }),
          PayloadItem.create({ name: 'holder', type: 'string', required: true }),
        ],
      }),
    })
    const Token = Entity.create({
      name: 'IdRegTok',
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
        Property.create({ name: 'holder', type: 'string' }),
      ],
      computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['interactionName', 'payload'],
        callback: (event: any) => event.interactionName === Register.name ? {
          ns: event.payload.ns,
          token: event.payload.token,
          payload: event.payload.data,
          holder: event.payload.holder,
        } : null,
      }),
    })
    const { system, controller } = await setupWith(new PGLiteDB(), [Token], [], [Register])
    const user = { id: 'u1' }
    const first = await controller.dispatch(Register, {
      user,
      payload: { ns: 'n', token: 't', data: 'secret', holder: 'alice' },
    })
    expect(first.error).toBeUndefined()
    expect(first.effects?.some((e: any) => e.recordName === Token.name && e.type === 'create')).toBe(true)

    const second = await controller.dispatch(Register, {
      user,
      payload: { ns: 'n', token: 't', data: 'other', holder: 'bob' },
    })
    expect(second.error).toBeUndefined()
    expect(second.effects?.some((e: any) => e.recordName === Token.name && e.type === 'create')).toBe(false)

    const rows = await system.storage.find(Token.name, undefined, undefined, ['*'])
    expect(rows).toHaveLength(1)
    expect(rows[0].holder).toBe('alice')
    expect(rows[0].payload).toBe('secret')
    const interactions = await system.storage.find(
      InteractionEventEntity.name!,
      MatchExp.atom({ key: 'interactionName', value: ['=', Register.name] }),
      undefined,
      ['id'],
    )
    expect(interactions).toHaveLength(2)
    await system.destroy()
  })
})

describe('application identity — UniqueConstraint and NonNullConstraint controls', () => {
  test('UniqueConstraint duplicate create is still ConstraintViolationError and rolls back', async () => {
    const Charge = Entity.create({
      name: 'IdCtrlCharge',
      properties: [Property.create({ name: 'idempotencyKey', type: 'string' })],
      constraints: [UniqueConstraint.create({
        name: 'IdCtrlCharge_key',
        properties: ['idempotencyKey'],
        violationCode: 'CHARGE_DUPLICATE',
      })],
    })
    const { system } = await setupWith(new PGLiteDB(), [Charge])
    await system.storage.create(Charge.name, { idempotencyKey: 'same' })
    try {
      await system.storage.create(Charge.name, { idempotencyKey: 'same' })
      throw new Error('expected unique violation')
    } catch (error) {
      const violation = findConstraintViolationError(error)
      expect(violation).toBeTruthy()
      expect(violation?.constraintName).toBe('IdCtrlCharge_key')
    }
    const rows = await system.storage.find(Charge.name, undefined, undefined, ['*'])
    expect(rows).toHaveLength(1)
    await system.destroy()
  })

  test('SQLite still rejects standalone NonNullConstraint at setup', async () => {
    const Record = Entity.create({
      name: 'IdCtrlNn',
      properties: [Property.create({ name: 'title', type: 'string' })],
      constraints: [NonNullConstraint.create({ name: 'IdCtrlNn_title', property: 'title' })],
    })
    const system = new MonoSystem(new SQLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [Record], relations: [] })
    await expect(controller.setup(true)).rejects.toThrow(/non-null constraints are not supported by sqlite/i)
    await system.destroy()
  })
})

describe('application identity — contracts that discriminate a wrong write path', () => {
  test('ON CONFLICT arbiter is identity columns: sibling UniqueConstraint still fails', async () => {
    const Token = Entity.create({
      name: 'IdArbUniqTok',
      identity: { name: 'byKey', properties: ['ns', 'token'] },
      properties: [
        Property.create({ name: 'ns', type: 'string' }),
        Property.create({ name: 'token', type: 'string' }),
        Property.create({ name: 'holder', type: 'string' }),
      ],
      constraints: [UniqueConstraint.create({
        name: 'IdArbUniqTok_holder',
        properties: ['holder'],
      })],
    })
    const { system } = await setupWith(new PGLiteDB(), [Token])
    await system.storage.create(Token.name, { ns: 'n', token: 't1', holder: 'same' })
    try {
      await system.storage.create(Token.name, { ns: 'n', token: 't2', holder: 'same' })
      throw new Error('expected unique violation')
    } catch (error) {
      const violation = findConstraintViolationError(error)
      expect(violation, `got ${error instanceof Error ? error.message : String(error)}`).toBeTruthy()
      expect(violation?.constraintName).toBe('IdArbUniqTok_holder')
    }
    expect(await system.storage.find(Token.name, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('ON CONFLICT arbiter is identity columns: duplicate logical id is not observed away', async () => {
    const Token = identityToken('IdArbIdTok')
    const { system } = await setupWith(new PGLiteDB(), [Token])
    const first = await system.storage.create(Token.name, { ns: 'n', token: 't1', payload: 'a' })
    try {
      await system.storage.create(Token.name, { id: first.id, ns: 'n', token: 't2', payload: 'b' })
      throw new Error('expected logical-id unique failure')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toMatch(/observe path/)
      expect(findConstraintViolationError(error) || /unique|duplicate/i.test(message)).toBeTruthy()
    }
    const rows = await system.storage.find(Token.name, undefined, undefined, ['token', 'payload'])
    expect(rows).toHaveLength(1)
    expect(rows[0].token).toBe('t1')
    await system.destroy()
  })

  test('filtered-view Count increments on insert and is unchanged on observe', async () => {
    const Token = identityToken('IdMemTok')
    const Active = Entity.create({
      name: 'IdMemActive',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'ns', value: ['=', 'live'] }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Token, Active],
      dict: [Dictionary.create({
        name: 'idMemCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: Active }),
      })],
    })
    await controller.setup(true)

    const events1: any[] = []
    await system.storage.create(Token.name, { ns: 'live', token: 't1', payload: 'a' }, events1)
    expect(events1.filter(e => e.recordName === Active.name && e.type === 'create')).toHaveLength(1)
    expect(await system.storage.dict.get('idMemCount')).toBe(1)

    const events2: any[] = []
    const observed = await system.storage.create(Token.name, { ns: 'live', token: 't1', payload: 'b' }, events2)
    expect(observed.payload).toBe('a')
    expect(events2.filter(e => e.recordName === Token.name && e.type === 'create')).toHaveLength(0)
    expect(events2.filter(e => e.recordName === Active.name && e.type === 'create')).toHaveLength(0)
    expect(await system.storage.dict.get('idMemCount')).toBe(1)
    await system.destroy()
  })

  test('non-identity defaultValue is stored on first insert', async () => {
    const Token = Entity.create({
      name: 'IdDefTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [
        Property.create({ name: 'k', type: 'string' }),
        Property.create({ name: 'label', type: 'string', defaultValue: () => 'from-default' }),
      ],
    })
    const { system } = await setupWith(new PGLiteDB(), [Token])
    const created = await system.storage.create(Token.name, { k: 'one' })
    expect(created.label).toBe('from-default')
    const stored = await system.storage.findOne(
      Token.name,
      MatchExp.atom({ key: 'id', value: ['=', created.id] }),
      undefined,
      ['k', 'label'],
    )
    expect(stored.label).toBe('from-default')
    await system.destroy()
  })

  test('delete then recreate the same identity key inserts a new row', async () => {
    const Token = identityToken('IdDelTok')
    const { system } = await setupWith(new PGLiteDB(), [Token])
    const first = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'old' })
    await system.storage.delete(Token.name, MatchExp.atom({ key: 'id', value: ['=', first.id] }))
    const second = await system.storage.create(Token.name, { ns: 'n', token: 't', payload: 'new' })
    expect(second.id).not.toBe(first.id)
    expect(second.payload).toBe('new')
    expect(await system.storage.find(Token.name, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('filtered-name observe returns the stored row even when the row is outside the view', async () => {
    const Token = identityToken('IdMissViewTok')
    const Live = Entity.create({
      name: 'IdMissViewLive',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'ns', value: ['=', 'live'] }),
    })
    const { system } = await setupWith(new PGLiteDB(), [Token, Live])
    const first = await system.storage.create(Token.name, { ns: 'parked', token: 't', payload: 'kept' })
    const second = await system.storage.create(Live.name, { ns: 'parked', token: 't', payload: 'discarded' })
    expect(second.id).toBe(first.id)
    expect(second.payload).toBe('kept')
    expect(await system.storage.find(Live.name, undefined, undefined, ['id'])).toHaveLength(0)
    await system.destroy()
  })

  test('n:1 id-ref still links; filtered membership on owner.kind fires after identity insert', async () => {
    const Owner = Entity.create({
      name: 'IdRefOwn',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'kind', type: 'string' }),
      ],
    })
    const Token = Entity.create({
      name: 'IdRefTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      source: Token,
      sourceProperty: 'owner',
      target: Owner,
      targetProperty: 'tokens',
      type: 'n:1',
    })
    const TechToken = Entity.create({
      name: 'IdRefTechTok',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'owner.kind', value: ['=', 'tech'] }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Owner, Token, TechToken],
      relations: [Rel],
      dict: [Dictionary.create({
        name: 'idRefTechCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: TechToken }),
      })],
    })
    await controller.setup(true)
    const owner = await system.storage.create(Owner.name, { name: 'alice', kind: 'tech' })
    const events: any[] = []
    const token = await system.storage.create(Token.name, { k: 'one', owner: { id: owner.id } }, events)
    const stored = await system.storage.findOne(
      Token.name,
      MatchExp.atom({ key: 'id', value: ['=', token.id] }),
      undefined,
      ['k', ['owner', { attributeQuery: ['name'] }]],
    )
    expect(stored.owner.name).toBe('alice')
    expect(events.filter(e => e.recordName === TechToken.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('idRefTechCount')).toBe(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === Rel.name && e.type === 'create').length).toBe(1)

    const observed = await system.storage.create(Token.name, { k: 'one', owner: { id: owner.id } })
    expect(observed.id).toBe(token.id)
    expect(await system.storage.dict.get('idRefTechCount')).toBe(1)
    await system.destroy()
  })

  test('boolean identity observes on SQLite including false', async () => {
    const Flag = Entity.create({
      name: 'IdBoolTok',
      identity: { name: 'byFlag', properties: ['on'] },
      properties: [
        Property.create({ name: 'on', type: 'boolean' }),
        Property.create({ name: 'payload', type: 'string' }),
      ],
    })
    const { system } = await setupWith(new SQLiteDB(':memory:'), [Flag])
    const first = await system.storage.create(Flag.name, { on: false, payload: 'kept' })
    const second = await system.storage.create(Flag.name, { on: false, payload: 'discarded' })
    expect(second.id).toBe(first.id)
    expect(second.payload).toBe('kept')
    const third = await system.storage.create(Flag.name, { on: true, payload: 'other' })
    expect(third.id).not.toBe(first.id)
    expect(await system.storage.find(Flag.name, undefined, undefined, ['id'])).toHaveLength(2)
    await system.destroy()
  })

  test('number identity 0 observes', async () => {
    const Num = Entity.create({
      name: 'IdNumTok',
      identity: { name: 'byN', properties: ['n'] },
      properties: [
        Property.create({ name: 'n', type: 'number' }),
        Property.create({ name: 'payload', type: 'string' }),
      ],
    })
    const { system } = await setupWith(new SQLiteDB(':memory:'), [Num])
    const first = await system.storage.create(Num.name, { n: 0, payload: 'kept' })
    const second = await system.storage.create(Num.name, { n: 0, payload: 'discarded' })
    expect(second.id).toBe(first.id)
    expect(second.payload).toBe('kept')
    await system.destroy()
  })

  test('1:1 without isTargetReliance setups (merged FK, not combined)', async () => {
    const Token = Entity.create({
      name: 'IdS1OkTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Other = Entity.create({
      name: 'IdS1OkOth',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdS1OkRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Token, Other], [Rel])
    await system.storage.create(Token.name, { k: 'one', other: { title: 'x' } })
    expect(await system.storage.find(Token.name, undefined, undefined, ['k'])).toHaveLength(1)
    expect(await system.storage.find(Other.name, undefined, undefined, ['title'])).toHaveLength(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('1:1 peer filtered Count follows identity insert (related-record membership snapshot)', async () => {
    const Other = Entity.create({
      name: 'IdPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdPeerTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdPeerRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'IdBoundPeer',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Other, Token, BoundPeer],
      relations: [Rel],
      dict: [Dictionary.create({
        name: 'idBoundPeerCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: BoundPeer }),
      })],
    })
    await controller.setup(true)
    const peer = await system.storage.create(Other.name, { title: 'p' })
    expect(await system.storage.dict.get('idBoundPeerCount')).toBe(0)
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('idBoundPeerCount')).toBe(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === Rel.name && e.type === 'create').length).toBe(1)

    const observeEvents: any[] = []
    const observed = await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, observeEvents)
    expect(observed.id).toBeDefined()
    expect(observeEvents.filter(e => e.recordName === BoundPeer.name && e.type === 'create')).toHaveLength(0)
    expect(await system.storage.dict.get('idBoundPeerCount')).toBe(1)
    await system.destroy()
  })

  test('1:1 nested create also fires related-record filtered Count', async () => {
    const Other = Entity.create({
      name: 'IdNestPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdNestPeerTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdNestPeerRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'IdNestBoundPeer',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Other, Token, BoundPeer],
      relations: [Rel],
      dict: [Dictionary.create({
        name: 'idNestBoundPeerCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: BoundPeer }),
      })],
    })
    await controller.setup(true)
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { title: 'nested' } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('idNestBoundPeerCount')).toBe(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)

    const observeEvents: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { title: 'discarded' } }, observeEvents)
    expect(observeEvents.filter(e => e.recordName === BoundPeer.name && e.type === 'create')).toHaveLength(0)
    expect(await system.storage.find(Other.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(await system.storage.dict.get('idNestBoundPeerCount')).toBe(1)
    await system.destroy()
  })

  test('1:1 exclusive steal unlinks the previous identity host', async () => {
    const Other = Entity.create({
      name: 'IdStealPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdStealTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdStealRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Other, Token], [Rel])
    const peer = await system.storage.create(Other.name, { title: 'p' })
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } })
    await system.storage.create(Token.name, { k: 'live2', other: { id: peer.id } })
    const tokens = await system.storage.find(Token.name, undefined, undefined, ['k', ['other', { attributeQuery: ['title'] }]])
    expect(tokens.filter((t: any) => t.other?.title === 'p')).toHaveLength(1)
    expect(tokens.filter((t: any) => t.other?.title === 'p')[0].k).toBe('live2')
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('identity 1:1 merged link writes `&` columns even when the name collides with a host value', async () => {
    const Other = Entity.create({
      name: 'IdAmpPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdAmpTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [
        Property.create({ name: 'k', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
      ],
    })
    const Rel = Relation.create({
      name: 'IdAmpRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
      properties: [Property.create({ name: 'payload', type: 'string' })],
    })
    const { system } = await setupWith(new PGLiteDB(), [Other, Token], [Rel])
    const peer = await system.storage.create(Other.name, { title: 'p' })
    await system.storage.create(Token.name, {
      k: 'live',
      payload: 'host-payload',
      other: { id: peer.id, '&': { payload: 'link-payload' } },
    })
    const stored = await system.storage.findOne(
      Token.name,
      MatchExp.atom({ key: 'k', value: ['=', 'live'] }),
      undefined,
      ['payload', ['other', { attributeQuery: ['title', ['&', { attributeQuery: ['payload'] }]] }]],
    )
    expect(stored.payload).toBe('host-payload')
    expect(stored.other['&'].payload).toBe('link-payload')
    const links = await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id', 'payload'])
    expect(links).toHaveLength(1)
    expect(links[0].payload).toBe('link-payload')

    await system.storage.create(Token.name, {
      k: 'live',
      payload: 'discarded-host',
      other: { id: peer.id, '&': { payload: 'discarded-link' } },
    })
    const afterObserve = await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id', 'payload'])
    expect(afterObserve).toHaveLength(1)
    expect(afterObserve[0].payload).toBe('link-payload')
    const hostAfterObserve = await system.storage.findOne(
      Token.name,
      MatchExp.atom({ key: 'k', value: ['=', 'live'] }),
      undefined,
      ['payload'],
    )
    expect(hostAfterObserve.payload).toBe('host-payload')
    await system.destroy()
  })

  test('filtered relation over identity 1:1 merged link is queryable and counted', async () => {
    const Other = Entity.create({
      name: 'IdFrPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdFrTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdFrRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const LiveRel = Relation.create({
      name: 'IdFrLiveRel',
      baseRelation: Rel,
      sourceProperty: 'liveOther',
      targetProperty: 'liveToken',
      matchExpression: MatchExp.atom({ key: 'source.k', value: ['=', 'live'] }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Other, Token],
      relations: [Rel, LiveRel],
      dict: [Dictionary.create({
        name: 'idFrCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: LiveRel }),
      })],
    })
    await controller.setup(true)
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    expect(await system.storage.findRelationByName(LiveRel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === LiveRel.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('idFrCount')).toBe(1)
    await system.destroy()
  })

  test('SQLite: 1:1 peer filtered Count and relation row on identity insert', async () => {
    const Other = Entity.create({
      name: 'IdSqlPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdSqlTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdSqlRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'IdSqlBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const system = new MonoSystem(new SQLiteDB(':memory:'))
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Other, Token, BoundPeer],
      relations: [Rel],
      dict: [Dictionary.create({
        name: 'idSqlBoundCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: BoundPeer }),
      })],
    })
    await controller.setup(true)
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('idSqlBoundCount')).toBe(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('identity as 1:1 TARGET still writes a relation row', async () => {
    const Other = Entity.create({
      name: 'IdTgtPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdTgtTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdTgtRel',
      source: Other,
      sourceProperty: 'token',
      target: Token,
      targetProperty: 'other',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'IdTgtBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
      system,
      entities: [Other, Token, BoundPeer],
      relations: [Rel],
      dict: [Dictionary.create({
        name: 'idTgtBoundCount',
        type: 'number',
        collection: false,
        computation: Count.create({ record: BoundPeer }),
      })],
    })
    await controller.setup(true)
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create').length).toBeGreaterThanOrEqual(1)
    expect(await system.storage.dict.get('idTgtBoundCount')).toBe(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('predicate miss does not emit related-record filtered create', async () => {
    const Other = Entity.create({
      name: 'IdMissPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdMissTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdMissRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const BoundPeer = Entity.create({
      name: 'IdMissBound',
      baseEntity: Other,
      matchExpression: MatchExp.atom({ key: 'token.k', value: ['=', 'live'] }),
    })
    const { system } = await setupWith(new PGLiteDB(), [Other, Token, BoundPeer], [Rel])
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'parked', other: { id: peer.id } }, events)
    expect(await system.storage.find(BoundPeer.name, undefined, undefined, ['id'])).toHaveLength(0)
    expect(events.filter(e => e.recordName === BoundPeer.name && e.type === 'create')).toHaveLength(0)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('filtered-name update still rejects identity property rewrite', async () => {
    const Token = identityToken('IdViewTok')
    const Live = Entity.create({
      name: 'IdViewLive',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'ns', value: ['=', 'live'] }),
    })
    const { system } = await setupWith(new PGLiteDB(), [Token, Live])
    const row = await system.storage.create(Token.name, { ns: 'live', token: 't', payload: 'a' })
    await expect(
      system.storage.update(Live.name, MatchExp.atom({ key: 'id', value: ['=', row.id] }), { token: 'other' }),
    ).rejects.toThrow(/identity property "token"/)
    await system.destroy()
  })

  test('n:1 `&` payload lands on the relation row; observe does not rewrite it', async () => {
    const Owner = Entity.create({
      name: 'IdN1AmpOwner',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdN1AmpTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdN1AmpRel',
      source: Token,
      sourceProperty: 'owner',
      target: Owner,
      targetProperty: 'tokens',
      type: 'n:1',
      properties: [Property.create({ name: 'note', type: 'string' })],
    })
    const { system } = await setupWith(new PGLiteDB(), [Owner, Token], [Rel])
    const owner = await system.storage.create(Owner.name, { name: 'alice' })
    await system.storage.create(Token.name, {
      k: 'one',
      owner: { id: owner.id, '&': { note: 'kept-note' } },
    })
    const links = await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id', 'note'])
    expect(links).toHaveLength(1)
    expect(links[0].note).toBe('kept-note')

    await system.storage.create(Token.name, {
      k: 'one',
      owner: { id: owner.id, '&': { note: 'discarded' } },
    })
    const after = await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id', 'note'])
    expect(after).toHaveLength(1)
    expect(after[0].note).toBe('kept-note')
    await system.destroy()
  })

  test('two n:1 identity hosts sharing one owner produce two relation rows', async () => {
    const Owner = Entity.create({
      name: 'IdShareOwner',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdShareTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdShareRel',
      source: Token,
      sourceProperty: 'owner',
      target: Owner,
      targetProperty: 'tokens',
      type: 'n:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Owner, Token], [Rel])
    const owner = await system.storage.create(Owner.name, { name: 'alice' })
    await system.storage.create(Token.name, { k: 'a', owner: { id: owner.id } })
    await system.storage.create(Token.name, { k: 'b', owner: { id: owner.id } })
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(2)
    await system.destroy()
  })

  test('identity host with two merged links writes both relation rows', async () => {
    const Owner = Entity.create({
      name: 'IdTwoOwner',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Other = Entity.create({
      name: 'IdTwoOther',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdTwoTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const OwnerRel = Relation.create({
      name: 'IdTwoOwnerRel',
      source: Token,
      sourceProperty: 'owner',
      target: Owner,
      targetProperty: 'tokens',
      type: 'n:1',
    })
    const OtherRel = Relation.create({
      name: 'IdTwoOtherRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Owner, Other, Token], [OwnerRel, OtherRel])
    const owner = await system.storage.create(Owner.name, { name: 'alice' })
    const other = await system.storage.create(Other.name, { title: 'p' })
    await system.storage.create(Token.name, { k: 'live', owner: { id: owner.id }, other: { id: other.id } })
    expect(await system.storage.findRelationByName(OwnerRel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    expect(await system.storage.findRelationByName(OtherRel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('n:n isolated link on an identity host is queryable', async () => {
    const Peer = Entity.create({
      name: 'IdNnPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdNnTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdNnRel',
      source: Token,
      sourceProperty: 'peers',
      target: Peer,
      targetProperty: 'tokens',
      type: 'n:n',
    })
    const { system } = await setupWith(new PGLiteDB(), [Peer, Token], [Rel])
    const peer = await system.storage.create(Peer.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', peers: [{ id: peer.id }] }, events)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    expect(events.filter(e => e.recordName === Rel.name && e.type === 'create')).toHaveLength(1)
    await system.destroy()
  })

  test('nested create of an identity child observes on the child key', async () => {
    const Parent = Entity.create({
      name: 'IdChildParent',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdChildTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [
        Property.create({ name: 'k', type: 'string' }),
        Property.create({ name: 'payload', type: 'string' }),
      ],
    })
    const Rel = Relation.create({
      name: 'IdChildRel',
      source: Parent,
      sourceProperty: 'token',
      target: Token,
      targetProperty: 'parent',
      type: 'n:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Parent, Token], [Rel])
    const first = await system.storage.create(Parent.name, {
      title: 'p1',
      token: { k: 'shared', payload: 'kept' },
    })
    const second = await system.storage.create(Parent.name, {
      title: 'p2',
      token: { k: 'shared', payload: 'discarded' },
    })
    expect(second.token.id).toBe(first.token.id)
    const tokens = await system.storage.find(Token.name, undefined, undefined, ['k', 'payload'])
    expect(tokens).toHaveLength(1)
    expect(tokens[0].payload).toBe('kept')
    expect(await system.storage.find(Parent.name, undefined, undefined, ['id'])).toHaveLength(2)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(2)
    await system.destroy()
  })

  test('1:1 steal emits a link delete for the previous owner and leaves one relation row', async () => {
    const Other = Entity.create({
      name: 'IdStealEvtPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdStealEvtTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdStealEvtRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Other, Token], [Rel])
    const peer = await system.storage.create(Other.name, { title: 'p' })
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } })
    const stealEvents: any[] = []
    await system.storage.create(Token.name, { k: 'live2', other: { id: peer.id } }, stealEvents)
    expect(stealEvents.filter(e => e.recordName === Rel.name && e.type === 'delete')).toHaveLength(1)
    expect(stealEvents.filter(e => e.recordName === Rel.name && e.type === 'create')).toHaveLength(1)
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('filtered-name create with a merged 1:1 still writes the relation row', async () => {
    const Other = Entity.create({
      name: 'IdFiltRelPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdFiltRelTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Live = Entity.create({
      name: 'IdFiltRelLive',
      baseEntity: Token,
      matchExpression: MatchExp.atom({ key: 'k', value: ['=', 'live'] }),
    })
    const Rel = Relation.create({
      name: 'IdFiltRelRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Other, Token, Live], [Rel])
    const peer = await system.storage.create(Other.name, { title: 'p' })
    await system.storage.create(Live.name, { k: 'live', other: { id: peer.id } })
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    const observed = await system.storage.create(Live.name, { k: 'live', other: { id: peer.id } })
    expect(observed.k).toBe('live')
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('SQLite: n:1 identity insert writes a relation row', async () => {
    const Owner = Entity.create({
      name: 'IdSqlN1Owner',
      properties: [Property.create({ name: 'name', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdSqlN1Tok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [Property.create({ name: 'k', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdSqlN1Rel',
      source: Token,
      sourceProperty: 'owner',
      target: Owner,
      targetProperty: 'tokens',
      type: 'n:1',
    })
    const { system } = await setupWith(new SQLiteDB(':memory:'), [Owner, Token], [Rel])
    const owner = await system.storage.create(Owner.name, { name: 'alice' })
    await system.storage.create(Token.name, { k: 'one', owner: { id: owner.id } })
    expect(await system.storage.findRelationByName(Rel.name!, undefined, undefined, ['id'])).toHaveLength(1)
    await system.destroy()
  })

  test('identity host create event includes defaults; relation create carries endpoints', async () => {
    const Other = Entity.create({
      name: 'IdEvtPeer',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Token = Entity.create({
      name: 'IdEvtTok',
      identity: { name: 'byKey', properties: ['k'] },
      properties: [
        Property.create({ name: 'k', type: 'string' }),
        Property.create({ name: 'label', type: 'string', defaultValue: () => 'from-default' }),
      ],
    })
    const Rel = Relation.create({
      name: 'IdEvtRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    const { system } = await setupWith(new PGLiteDB(), [Other, Token], [Rel])
    const peer = await system.storage.create(Other.name, { title: 'p' })
    const events: any[] = []
    await system.storage.create(Token.name, { k: 'live', other: { id: peer.id } }, events)
    const hostCreate = events.filter(e => e.recordName === Token.name && e.type === 'create')
    expect(hostCreate).toHaveLength(1)
    expect(hostCreate[0].record.k).toBe('live')
    expect(hostCreate[0].record.label).toBe('from-default')
    expect(hostCreate[0].record.id).toBeDefined()
    const relCreate = events.filter(e => e.recordName === Rel.name && e.type === 'create')
    expect(relCreate).toHaveLength(1)
    expect(relCreate[0].record.source?.id).toBe(hostCreate[0].record.id)
    expect(relCreate[0].record.target?.id).toBe(peer.id)
    await system.destroy()
  })

  test('S1: explicit mergeLinks that co-locate identity with another entity fail-fast', () => {
    const Token = identityToken('IdS1MergeTok')
    const Other = Entity.create({
      name: 'IdS1MergeOther',
      properties: [Property.create({ name: 'title', type: 'string' })],
    })
    const Rel = Relation.create({
      name: 'IdS1MergeRel',
      source: Token,
      sourceProperty: 'other',
      target: Other,
      targetProperty: 'token',
      type: '1:1',
    })
    expect(() => new DBSetup(
      [Token, Other],
      [Rel],
      new SQLiteDB(),
      [`${Token.name}.other`],
    )).toThrow(/cannot share a physical table/)
  })
})

/**
 * Official occupancy recipe (design §3.1 / §3.4): Entity.identity + Transform
 * register + status/consumedBy StateMachines. Callers distinguish results with
 * this dispatch's effects plus a post-commit query — no typed occupancy error
 * channel, no parallel write API.
 */
function createOccupancyRecipe(prefix: string) {
  const tokenName = `${prefix}Tok`
  const registerName = `${prefix}Register`
  const consumeName = `${prefix}Consume`

  const Register = Interaction.create({
    name: registerName,
    action: Action.create({ name: `${prefix}register` }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'ns', type: 'string' }),
        PayloadItem.create({ name: 'token', type: 'string' }),
        PayloadItem.create({ name: 'data', type: 'string' }),
        PayloadItem.create({ name: 'nonce', type: 'string' }),
        PayloadItem.create({ name: 'expiresAt', type: 'number' }),
      ],
    }),
  })
  const Consume = Interaction.create({
    name: consumeName,
    action: Action.create({ name: `${prefix}consume` }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'ns', type: 'string' }),
        PayloadItem.create({ name: 'token', type: 'string' }),
        PayloadItem.create({ name: 'nonce', type: 'string' }),
      ],
    }),
  })

  async function locateLiveRow(this: Controller, event: any) {
    const row = await this.system.storage.findOne(
      tokenName,
      BoolExp.atom({ key: 'ns', value: ['=', event.record.payload.ns] })
        .and({ key: 'token', value: ['=', event.record.payload.token] }),
      undefined,
      ['id', 'expiresAt'],
    )
    if (!row) return undefined
    if (!(row.expiresAt > Date.now())) return undefined
    return { id: row.id }
  }

  const unused = StateNode.create({ name: 'unused' })
  const used = StateNode.create({ name: 'used' })
  const vacant = StateNode.create({ name: 'vacant', computeValue: () => null })
  const claimed = StateNode.create({
    name: 'claimed',
    computeValue: (_last: unknown, event: any) => event.record.payload.nonce,
  })

  const Token = Entity.create({
    name: tokenName,
    identity: { name: 'byKey', properties: ['ns', 'token'] },
    properties: [
      Property.create({ name: 'ns', type: 'string' }),
      Property.create({ name: 'token', type: 'string' }),
      Property.create({ name: 'payload', type: 'string' }),
      Property.create({ name: 'holder', type: 'string' }),
      Property.create({ name: 'expiresAt', type: 'number' }),
      Property.create({
        name: 'status',
        type: 'string',
        computation: StateMachine.create({
          states: [unused, used],
          initialState: unused,
          transfers: [
            StateTransfer.create({
              current: unused,
              next: used,
              trigger: {
                recordName: InteractionEventEntity.name,
                type: 'create',
                record: { interactionName: consumeName },
              },
              computeTarget: locateLiveRow,
            }),
          ],
        }),
      }),
      Property.create({
        name: 'consumedBy',
        type: 'string',
        computation: StateMachine.create({
          states: [vacant, claimed],
          initialState: vacant,
          transfers: [
            StateTransfer.create({
              current: vacant,
              next: claimed,
              trigger: {
                recordName: InteractionEventEntity.name,
                type: 'create',
                record: { interactionName: consumeName },
              },
              computeTarget: locateLiveRow,
            }),
          ],
        }),
      }),
    ],
    computation: Transform.create({
      record: InteractionEventEntity,
      attributeQuery: ['interactionName', 'payload'],
      callback: (event: any) => event.interactionName === registerName ? {
        ns: event.payload.ns,
        token: event.payload.token,
        payload: event.payload.data,
        holder: event.payload.nonce,
        expiresAt: event.payload.expiresAt,
      } : null,
    }),
  })

  return { Token, Register, Consume }
}

function entityCreates(effects: any[] | undefined, recordName: string) {
  return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'create')
}

function entityUpdates(effects: any[] | undefined, recordName: string) {
  return (effects ?? []).filter(e => e.recordName === recordName && e.type === 'update')
}

type RegisterOutcome = 'registered' | 'occupied' | 'error' | 'unexpected'
type ConsumeOutcome = 'consumed' | 'already-used' | 'expired' | 'absent' | 'error' | 'unexpected'

function classifyRegister(args: {
  error?: unknown
  effects?: any[]
  row: any | undefined
  recordName: string
  myNonce: string
}): RegisterOutcome {
  if (args.error) return 'error'
  const created = entityCreates(args.effects, args.recordName)
  if (created.length === 1 && args.row?.holder === args.myNonce) return 'registered'
  if (created.length === 0 && args.row && args.row.holder !== args.myNonce) return 'occupied'
  return 'unexpected'
}

function classifyConsume(args: {
  error?: unknown
  effects?: any[]
  row: any | undefined
  recordName: string
  myNonce: string
  now: number
}): ConsumeOutcome {
  if (args.error) return 'error'
  const updates = entityUpdates(args.effects, args.recordName)
  if (updates.length > 0 && args.row?.status === 'used' && args.row?.consumedBy === args.myNonce) {
    return 'consumed'
  }
  if (updates.length === 0 && args.row?.status === 'used' && args.row?.consumedBy !== args.myNonce) {
    return 'already-used'
  }
  if (
    updates.length === 0
    && args.row?.status === 'unused'
    && args.row.expiresAt <= args.now
  ) {
    return 'expired'
  }
  if (updates.length === 0 && !args.row) return 'absent'
  return 'unexpected'
}

async function findToken(
  storage: InstanceType<typeof MonoSystem>['storage'],
  recordName: string,
  ns: string,
  token: string,
) {
  return storage.findOne(
    recordName,
    MatchExp.atom({ key: 'ns', value: ['=', ns] }).and({ key: 'token', value: ['=', token] }),
    undefined,
    ['*'],
  )
}

describe('application identity — official occupancy recipe (M-03)', () => {
  test('§3.4 algebra is programmable: register/occupied/consumed/already-used/expired/absent', async () => {
    const { Token, Register, Consume } = createOccupancyRecipe('IdOcc')
    const { system, controller } = await setupWith(new PGLiteDB(), [Token], [], [Register, Consume])
    const ns = 'camp'

    const absent = await controller.dispatch(Consume, {
      user: { id: 'c0' },
      payload: { ns, token: 'T-none', nonce: 'c0' },
    })
    expect(classifyConsume({
      error: absent.error,
      effects: absent.effects,
      row: await findToken(system.storage, Token.name, ns, 'T-none'),
      recordName: Token.name,
      myNonce: 'c0',
      now: Date.now(),
    })).toBe('absent')

    const live = { ns, token: 'T-live', data: 'secret-live', nonce: 'alice', expiresAt: Date.now() + 3_600_000 }
    const firstReg = await controller.dispatch(Register, { user: { id: 'r1' }, payload: live })
    const liveRow = await findToken(system.storage, Token.name, ns, 'T-live')
    expect(classifyRegister({
      error: firstReg.error,
      effects: firstReg.effects,
      row: liveRow,
      recordName: Token.name,
      myNonce: 'alice',
    })).toBe('registered')
    expect(liveRow.status).toBe('unused')
    expect(liveRow.consumedBy == null).toBe(true)

    const secondReg = await controller.dispatch(Register, {
      user: { id: 'r2' },
      payload: { ...live, data: 'secret-other', nonce: 'bob' },
    })
    const occupiedRow = await findToken(system.storage, Token.name, ns, 'T-live')
    expect(classifyRegister({
      error: secondReg.error,
      effects: secondReg.effects,
      row: occupiedRow,
      recordName: Token.name,
      myNonce: 'bob',
    })).toBe('occupied')
    expect(occupiedRow.payload).toBe('secret-live')
    expect(occupiedRow.holder).toBe('alice')

    const consume1 = await controller.dispatch(Consume, {
      user: { id: 'c1' },
      payload: { ns, token: 'T-live', nonce: 'carol' },
    })
    const consumedRow = await findToken(system.storage, Token.name, ns, 'T-live')
    expect(classifyConsume({
      error: consume1.error,
      effects: consume1.effects,
      row: consumedRow,
      recordName: Token.name,
      myNonce: 'carol',
      now: Date.now(),
    })).toBe('consumed')
    expect(consumedRow.payload).toBe('secret-live')
    expect(consumedRow.status).toBe('used')
    expect(consumedRow.consumedBy).toBe('carol')
    const consumedUpdates = entityUpdates(consume1.effects, Token.name)
    expect(consumedUpdates.some((event: any) => event.keys?.includes('status') && event.record?.status === 'used')).toBe(true)
    expect(consumedUpdates.some((event: any) => event.keys?.includes('consumedBy') && event.record?.consumedBy === 'carol')).toBe(true)

    const consumeAgain = await controller.dispatch(Consume, {
      user: { id: 'c1b' },
      payload: { ns, token: 'T-live', nonce: 'carol' },
    })
    const againRow = await findToken(system.storage, Token.name, ns, 'T-live')
    expect(consumeAgain.error).toBeUndefined()
    expect(entityUpdates(consumeAgain.effects, Token.name)).toHaveLength(0)
    expect(againRow.status).toBe('used')
    expect(againRow.consumedBy).toBe('carol')

    const consume2 = await controller.dispatch(Consume, {
      user: { id: 'c2' },
      payload: { ns, token: 'T-live', nonce: 'dave' },
    })
    const usedRow = await findToken(system.storage, Token.name, ns, 'T-live')
    expect(classifyConsume({
      error: consume2.error,
      effects: consume2.effects,
      row: usedRow,
      recordName: Token.name,
      myNonce: 'dave',
      now: Date.now(),
    })).toBe('already-used')
    expect(usedRow.consumedBy).toBe('carol')
    expect(entityUpdates(consume2.effects, Token.name)).toHaveLength(0)

    await controller.dispatch(Register, {
      user: { id: 'r3' },
      payload: {
        ns, token: 'T-old', data: 'secret-old', nonce: 'erin', expiresAt: Date.now() - 1000,
      },
    })
    const consumeExpired = await controller.dispatch(Consume, {
      user: { id: 'c3' },
      payload: { ns, token: 'T-old', nonce: 'frank' },
    })
    const expiredRow = await findToken(system.storage, Token.name, ns, 'T-old')
    expect(classifyConsume({
      error: consumeExpired.error,
      effects: consumeExpired.effects,
      row: expiredRow,
      recordName: Token.name,
      myNonce: 'frank',
      now: Date.now(),
    })).toBe('expired')
    expect(expiredRow.status).toBe('unused')
    expect(expiredRow.consumedBy == null).toBe(true)
    expect(expiredRow.payload).toBe('secret-old')

    await system.destroy()
  })
})

