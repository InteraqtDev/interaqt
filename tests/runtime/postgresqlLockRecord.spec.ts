/**
 * r24 —— atomic.lockRecord 图锁语义（真 PostgreSQL 并发验证）。
 *
 * 此前 lockRecord 只对 root 行 SELECT ... FOR UPDATE，attributeQuery 里经 LEFT JOIN
 * 加载的关联行不加锁：持锁事务内的快照可以被并发写者改写（READ COMMITTED 下重读漂移），
 * Transform update 等消费方基于快照的派生写建立在已失效的关联数据上。
 *
 * 修复：锁 root 后按快照收集全部已加载关联行，逐表 FOR UPDATE 并重读稳定化
 * （与 lockRows 的有界稳定化同构）。本测试用两条真实并发事务验证：
 * 持锁期间并发写关联行必须阻塞，锁内重读快照不漂移。
 */
import { describe, expect, test } from 'vitest';
import { Controller, Entity, KlassByName, MatchExp, MonoSystem, Property, Relation } from 'interaqt';
import { PostgreSQLDB } from '@drivers';

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
// 独占库名：postgres spec 并行执行且 setup(true) 会 DROP DATABASE WITH (FORCE)。
const database = process.env.INTERAQT_POSTGRES_DATABASE ? `${process.env.INTERAQT_POSTGRES_DATABASE}_lockrecord` : '';
const dbOptions = {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
};

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
}

describeIfPostgres('r24 lockRecord graph lock (PostgreSQL)', () => {
    test('concurrent writer to a related row blocks until the locking transaction commits', async () => {
        const User = Entity.create({
            name: 'LockUser',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'total', type: 'number' }),
            ],
        });
        const Profile = Entity.create({
            name: 'LockProfile',
            properties: [Property.create({ name: 'score', type: 'number' })],
        });
        const OwnProfile = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1',
        });

        const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User, Profile], relations: [OwnProfile] });
        try {
            await controller.setup(true);

            const profile = await system.storage.create('LockProfile', { score: 10 });
            const user = await system.storage.create('LockUser', { name: 'u1', total: 0, profile: { id: profile.id } });

            const lockAcquired = deferred();
            const observationDone = deferred();
            let writerSettled = false;
            let scoreInsideTxnAfterWriterAttempt: number | undefined;
            let writerSettledAtObservation: boolean | undefined;

            // 事务 A：lockRecord（含关联 profile）→ 等待并发写者尝试 → 锁内重读 → 提交
            const txnA = system.storage.runInTransaction({ name: 'r24-lock-a' }, async () => {
                const snapshot = await system.storage.atomic.lockRecord('LockUser', user.id,
                    ['id', 'total', ['profile', { attributeQuery: ['id', 'score'] }]]) as
                    { profile?: { id: string, score: number } } | undefined;
                expect(snapshot?.profile?.score).toBe(10);
                lockAcquired.resolve();

                // 给写者时间去尝试写 profile（阻塞或完成）
                await new Promise(r => setTimeout(r, 500));

                const reread = await system.storage.findOne('LockProfile',
                    MatchExp.atom({ key: 'id', value: ['=', profile.id] }), undefined, ['id', 'score']);
                scoreInsideTxnAfterWriterAttempt = reread.score;
                writerSettledAtObservation = writerSettled;
                observationDone.resolve();
                return snapshot;
            });

            // 事务 B：A 拿到锁之后并发写关联行
            const txnB = (async () => {
                await lockAcquired.promise;
                await system.storage.update('LockProfile',
                    MatchExp.atom({ key: 'id', value: ['=', profile.id] }), { score: 99 });
                writerSettled = true;
            })();

            await Promise.all([txnA, txnB]);
            await observationDone.promise;

            // 修复后的契约：A 持锁期间 B 必须阻塞——观察时刻 B 未完成、锁内重读仍是 10。
            // （修复前：B 不阻塞，观察时刻 writerSettled=true 且重读=99——快照静默漂移。）
            expect(writerSettledAtObservation).toBe(false);
            expect(scoreInsideTxnAfterWriterAttempt).toBe(10);

            // A 提交后 B 的写照常生效（锁只延迟、不吞写）。
            const finalScore = await system.storage.findOne('LockProfile',
                MatchExp.atom({ key: 'id', value: ['=', profile.id] }), undefined, ['id', 'score']);
            expect(finalScore.score).toBe(99);
        } finally {
            await system.destroy();
        }
    }, 60000);

    test('root-only writer still blocks (pre-existing root lock semantics intact)', async () => {
        const Item = Entity.create({
            name: 'LockItem',
            properties: [Property.create({ name: 'n', type: 'number' })],
        });
        const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        try {
            await controller.setup(true);
            const item = await system.storage.create('LockItem', { n: 1 });

            const lockAcquired = deferred();
            let writerSettled = false;
            let writerSettledAtObservation: boolean | undefined;

            const txnA = system.storage.runInTransaction({ name: 'r24-lock-root' }, async () => {
                await system.storage.atomic.lockRecord('LockItem', item.id, ['id', 'n']);
                lockAcquired.resolve();
                await new Promise(r => setTimeout(r, 500));
                writerSettledAtObservation = writerSettled;
            });
            const txnB = (async () => {
                await lockAcquired.promise;
                await system.storage.update('LockItem',
                    MatchExp.atom({ key: 'id', value: ['=', item.id] }), { n: 2 });
                writerSettled = true;
            })();
            await Promise.all([txnA, txnB]);
            expect(writerSettledAtObservation).toBe(false);
        } finally {
            await system.destroy();
        }
    }, 60000);
});
