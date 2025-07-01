import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt';
import { entities, relations, interactions, activities, dicts } from './backend/index.js';
import * as initialData from './initialData.js';

const system = new MonoSystem(new PGLiteDB('pgdata'));
system.conceptClass = KlassByName;

const controller = new Controller(system, entities, relations, activities, interactions, dicts, []);
await controller.setup(true);


const {entities: initialEntityData, relations: initialRelationData } = initialData;

console.log('Creating initial data...');
for (const [entityName, entityData] of Object.entries(initialEntityData)) {
    console.log(`Creating entity ${entityName}`);
    console.log(entityData);
    await controller.system.storage.create(entityName, entityData);
}
for (const [relationName, relationData] of Object.entries(initialRelationData)) {
    console.log(`Creating relation ${relationName}`);
    console.log(relationData);
    await controller.system.storage.create(relationName, relationData);
}
console.log('Initial data created');