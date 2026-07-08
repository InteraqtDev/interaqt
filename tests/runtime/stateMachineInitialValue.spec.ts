import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Entity, Property, StateMachine, StateNode, StateTransfer, Count, Dictionary, MatchExp } from 'interaqt';
import { PGLiteDB } from '@drivers';

// Regression tests for the two pre-existing StateMachine runtime bugs recorded in
// agentspace/output/statemachine-runtime-pre-existing-bugs.md:
//   Bug 1: a property StateMachine transfer without computeTarget crashed at runtime
//          (undefined.call) on the first matching trigger instead of failing fast at setup.
//   Bug 2: the initial-value backfill on record creation emitted a business `update` event,
//          so StateMachines triggered by the host record's own update transitioned
//          at creation time, before the user ever updated the record.

describe('StateMachine property computation', () => {
    test('transfer without computeTarget fails fast at Controller construction', async () => {
        const open = StateNode.create({ name: "open" });
        const closed = StateNode.create({ name: "closed" });
        const lifecycle = StateMachine.create({
            states: [open, closed],
            transfers: [StateTransfer.create({
                trigger: { recordName: "SMNoTargetTicket", type: "update" },
                current: open,
                next: closed,
                // no computeTarget
            })],
            initialState: open,
        });
        const Ticket = Entity.create({
            name: "SMNoTargetTicket",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string", computation: lifecycle }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        expect(() => new Controller({
            system,
            entities: [Ticket],
            relations: [],
            eventSources: [],
        })).toThrowError(/SMNoTargetTicket\.status.*must define computeTarget/s);
        await system.destroy();
    });

    test('initial-value backfill does not trigger transfers listening to the host record update', async () => {
        const open = StateNode.create({ name: "open" });
        const closed = StateNode.create({ name: "closed" });
        const lifecycle = StateMachine.create({
            states: [open, closed],
            transfers: [StateTransfer.create({
                trigger: { recordName: "SMSelfUpdateTicket", type: "update" },
                current: open,
                next: closed,
                computeTarget: (event: { record: { id: string } }) => ({ id: event.record.id }),
            })],
            initialState: open,
        });
        const Ticket = Entity.create({
            name: "SMSelfUpdateTicket",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "status", type: "string", computation: lifecycle }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system,
            entities: [Ticket],
            relations: [],
            eventSources: [],
        });
        await controller.setup(true);

        const created = await system.storage.create("SMSelfUpdateTicket", { title: "t" });
        const afterCreate = await system.storage.findOne(
            "SMSelfUpdateTicket",
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            ['*']
        );
        // the user never updated the record: it must stay in the initial state
        expect(afterCreate.status).toBe('open');

        // a real business update still transitions
        await system.storage.update(
            "SMSelfUpdateTicket",
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            { title: "t2" }
        );
        const afterUpdate = await system.storage.findOne(
            "SMSelfUpdateTicket",
            MatchExp.atom({ key: 'id', value: ['=', created.id] }),
            undefined,
            ['*']
        );
        expect(afterUpdate.status).toBe('closed');
        await system.destroy();
    });

    test('create mutation event carries the computed initial value for downstream computations', async () => {
        // Before the fix, the create event's record did not include the StateMachine initial
        // value (it arrived via a separate update event processed out of order), which made
        // event-record-based incremental computations (e.g. global Count with callback)
        // miscount records at creation time.
        const active = StateNode.create({ name: "active" });
        const inactive = StateNode.create({ name: "inactive" });
        const lifecycle = StateMachine.create({
            states: [active, inactive],
            transfers: [StateTransfer.create({
                trigger: { recordName: "SMCountItem", type: "update" },
                current: active,
                next: inactive,
                computeTarget: (event: { record: { id: string } }) => ({ id: event.record.id }),
            })],
            initialState: active,
        });
        const Item = Entity.create({
            name: "SMCountItem",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "archived", type: "boolean" }),
                Property.create({ name: "status", type: "string", computation: lifecycle }),
            ],
        });
        const activeCount = Dictionary.create({
            name: 'smActiveItemCount',
            type: 'number',
            computation: Count.create({
                record: Item,
                attributeQuery: ['id', 'status'],
                callback: (item: { status?: string }) => item.status === 'active'
            })
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system,
            entities: [Item],
            relations: [],
            eventSources: [],
            dict: [activeCount],
        });
        await controller.setup(true);

        await system.storage.create("SMCountItem", { title: "a" });
        expect(await system.storage.dict.get('smActiveItemCount')).toBe(1);

        await system.storage.create("SMCountItem", { title: "b" });
        expect(await system.storage.dict.get('smActiveItemCount')).toBe(2);
        await system.destroy();
    });

    test('filtered-entity membership derived from the initial value is still maintained and dispatched', async () => {
        // The internal write path must keep ERStorage semantics: membership flags of filtered
        // entities that depend on the computed-default property are maintained, and the derived
        // membership create events still reach computations.
        const active = StateNode.create({ name: "active" });
        const inactive = StateNode.create({ name: "inactive" });
        const lifecycle = StateMachine.create({
            states: [active, inactive],
            transfers: [StateTransfer.create({
                trigger: { recordName: "SMFilteredItem", type: "update" },
                current: active,
                next: inactive,
                computeTarget: (event: { record: { id: string } }) => ({ id: event.record.id }),
            })],
            initialState: active,
        });
        const Item = Entity.create({
            name: "SMFilteredItem",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "archived", type: "boolean" }),
                Property.create({ name: "status", type: "string", computation: lifecycle }),
            ],
        });
        const ActiveItem = Entity.create({
            name: "SMFilteredActiveItem",
            baseEntity: Item,
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
        });
        const activeCount = Dictionary.create({
            name: 'smFilteredActiveCount',
            type: 'number',
            computation: Count.create({ record: ActiveItem })
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system,
            entities: [Item, ActiveItem],
            relations: [],
            eventSources: [],
            dict: [activeCount],
        });
        await controller.setup(true);

        const created = await system.storage.create("SMFilteredItem", { title: "a" });
        const activeItems = await system.storage.find("SMFilteredActiveItem", undefined, undefined, ['*']);
        expect(activeItems.map(item => item.id)).toEqual([created.id]);
        expect(await system.storage.dict.get('smFilteredActiveCount')).toBe(1);
        await system.destroy();
    });
});
