import { Entity, Property, Dictionary, Summation, Controller, MonoSystem, MatchExp, KlassByName } from 'interaqt';
import { PostgreSQLDB } from '@drivers';

const database = process.env.INTERAQT_POSTGRES_DATABASE!;
const ids = JSON.parse(process.env.INTERAQT_POSTGRES_COUNTER_IDS || '[]') as string[];
const workerIndex = Number(process.env.INTERAQT_POSTGRES_WORKER_INDEX || 0);
const iterations = Number(process.env.INTERAQT_POSTGRES_ITERATIONS || 10);

const counterEntity = Entity.create({
  name: 'PgAtomicCounter',
  properties: [
    Property.create({ name: 'value', type: 'number' }),
  ],
});

const totalDictionary = Dictionary.create({
  name: 'pgAtomicTotal',
  type: 'number',
  collection: false,
  computation: Summation.create({
    record: counterEntity,
    attributeQuery: ['value'],
  }),
});

const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
system.conceptClass = KlassByName;
const controller = new Controller({
  system,
  entities: [counterEntity],
  relations: [],
  dict: [totalDictionary],
});

await controller.setup(false);

for (let iteration = 1; iteration <= iterations; iteration++) {
  for (const id of ids) {
    await system.storage.update(
      'PgAtomicCounter',
      MatchExp.atom({ key: 'id', value: ['=', id] }),
      { value: workerIndex * 100000 + iteration }
    );
  }
}

await system.destroy();
