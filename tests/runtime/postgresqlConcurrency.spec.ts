import { describe, expect, test } from 'vitest';
import { Entity, Property, Dictionary, Summation, Controller, MonoSystem, MatchExp, KlassByName } from 'interaqt';
import { PostgreSQLDB } from '@drivers';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;

describeIfPostgres('PostgreSQL computation concurrency', () => {
  test('keeps global summation consistent across worker processes', async () => {
    const database = process.env.INTERAQT_POSTGRES_DATABASE!;
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

    await controller.setup(true);

    const counters: Array<{ id: string }> = [];
    for (let index = 0; index < 8; index++) {
      counters.push(await system.storage.create('PgAtomicCounter', { value: 0 }));
    }
    await system.destroy();

    const workerPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'helpers/postgresConcurrencyWorker.ts'
    );
    const workerCount = 4;
    const iterations = 20;

    await Promise.all(
      Array.from({ length: workerCount }, (_, workerIndex) =>
        execFileAsync(
          process.execPath,
          ['--import', 'tsx', workerPath],
          {
            env: {
              ...process.env,
              INTERAQT_POSTGRES_DATABASE: database,
              INTERAQT_POSTGRES_COUNTER_IDS: JSON.stringify(counters.map(counter => counter.id)),
              INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
              INTERAQT_POSTGRES_ITERATIONS: String(iterations),
            },
            maxBuffer: 1024 * 1024,
          }
        )
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: [counterEntity],
      relations: [],
      dict: [totalDictionary],
    });
    await verifyController.setup(false);

    const records = await verifySystem.storage.find('PgAtomicCounter', undefined, undefined, ['value']);
    const scannedTotal = records.reduce((sum, record) => sum + record.value, 0);
    const computedTotal = await verifySystem.storage.dict.get('pgAtomicTotal');

    expect(computedTotal).toBe(scannedTotal);
    await verifySystem.destroy();
  }, 120000);
});
